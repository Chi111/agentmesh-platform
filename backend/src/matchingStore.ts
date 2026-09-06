import type { D1Database } from './store';
import type { CapabilityEvidence, CapacityLease, ExecutionProfile, MatchingData, MatchingOutcome, MatchPlan } from '../../shared/matching';

export interface MatchingStore {
  load(): Promise<MatchingData>;
  saveProfile(profile: ExecutionProfile): Promise<void>;
  saveEvidence(evidence: CapabilityEvidence): Promise<void>;
  saveOutcome(outcome: MatchingOutcome): Promise<void>;
  savePlan(plan: MatchPlan): Promise<void>;
  getPlan(id: string): Promise<MatchPlan | null>;
  acquire(lease: CapacityLease): Promise<boolean>;
  contact(runId:string,claimToken:string,now:string):Promise<boolean>;
  finish(runId: string, status: 'released' | 'quarantined', claimToken?:string): Promise<void>;
}
const clone = <T>(value: T): T => structuredClone(value);
export class MemoryMatchingStore implements MatchingStore {
  readonly profiles = new Map<string, ExecutionProfile>();
  readonly evidence = new Map<string, CapabilityEvidence>();
  readonly outcomes = new Map<string, MatchingOutcome>();
  readonly plans = new Map<string, MatchPlan>();
  readonly leases = new Map<string, CapacityLease>();
  constructor(private readonly canAcquire: (lease: CapacityLease) => boolean = () => true, private readonly commitments:()=>NonNullable<MatchingData['commitments']> = ()=>[], private readonly owner:(id:string)=>string = ()=>'' ) {}
  async load(): Promise<MatchingData> { return clone({ profiles: [...this.profiles.values()], evidence: [...this.evidence.values()], outcomes: [...this.outcomes.values()], leases: [...this.leases.values()], commitments:this.commitments() }); }
  async saveProfile(value: ExecutionProfile) { if ([...this.leases.values()].some((row)=>row.status!=='released' && (row.agentId===value.agentId || row.pool===`${this.owner(value.agentId)}:${value.pool}` || row.pool===`${this.owner(value.agentId)}:${this.profiles.get(value.agentId)?.pool}`))) throw new Error('CAPACITY_IN_USE'); this.profiles.set(value.agentId, clone({ ...value, revision: (this.profiles.get(value.agentId)?.revision ?? 0) + 1 })); }
  async saveEvidence(value: CapabilityEvidence) { this.evidence.set(value.id, clone(value)); }
  async saveOutcome(value: MatchingOutcome) { this.outcomes.set(value.id, clone(value)); }
  async savePlan(value: MatchPlan) { this.plans.set(value.id, clone(value)); }
  async getPlan(id: string) { return clone(this.plans.get(id) ?? null); }
  async acquire(lease: CapacityLease) {
    if (!this.canAcquire(lease)) return false;
    for(const [id,row] of this.leases) if(row.status==='active' && !row.contactedAt && Date.parse(row.expiresAt)<=Date.parse(lease.createdAt) && Date.parse(row.createdAt)<=Date.parse(lease.createdAt)-300000) this.leases.set(id,{...row,status:'released'});
    const previous=this.leases.get(lease.runId);
    if(previous) {
      if(previous.status==='active' && !previous.contactedAt && Date.parse(previous.createdAt)<=Date.parse(lease.createdAt)-300000) { this.leases.set(lease.runId,clone(lease)); return true; }
      return false;
    }
    const p = this.profiles.get(lease.agentId);
    const active = [...this.leases.values()].filter((row) => row.status !== 'released');
    const ownerPrefix = lease.pool.slice(0, lease.pool.lastIndexOf(':') + 1);
    const shared = [...this.profiles.values()].filter((row) => `${ownerPrefix}${row.pool}` === lease.pool && this.owner(row.agentId)===this.owner(lease.agentId));
    const poolLimit = Math.min(p?.poolConcurrency ?? 1, ...shared.map((row) => row.poolConcurrency));
    if (this.leases.has(lease.runId) || active.some((row) => row.stageId === lease.stageId)
      || active.filter((row) => row.agentId === lease.agentId).length >= (p?.maxConcurrency ?? 1)
      || active.filter((row) => row.pool === lease.pool).length >= poolLimit) return false;
    this.leases.set(lease.runId, clone(lease)); return true;
  }
  async contact(runId:string,claimToken:string,now:string) { const lease=this.leases.get(runId); if(!lease||lease.status!=='active'||lease.claimToken!==claimToken||lease.contactedAt||!this.canAcquire(lease)||Date.parse(lease.expiresAt)<=Date.parse(now)) return false; this.leases.set(runId,{...lease,contactedAt:now}); return true; }
  async finish(runId: string, status: 'released' | 'quarantined', claimToken?:string) {
    const lease = this.leases.get(runId);
    if (lease && lease.status !== 'released' && (!claimToken || lease.claimToken===claimToken)) this.leases.set(runId, { ...lease, status });
  }
}

const LEASE_RUNNABLE = `EXISTS (
  SELECT 1 FROM workflow_stages s JOIN missions m ON m.id=s.mission_id JOIN escrows e ON e.mission_id=m.id JOIN agents a ON a.id=s.agent_id
  WHERE s.id=agent_capacity_leases.stage_id AND m.id=agent_capacity_leases.mission_id AND a.id=agent_capacity_leases.agent_id
    AND a.version=agent_capacity_leases.agent_version AND a.status='active' AND s.status IN ('queued','running','failed')
    AND m.status='running' AND m.cancelled_at IS NULL AND e.status='held'
) AND NOT EXISTS (SELECT 1 FROM mission_runtime_controls c WHERE c.mission_id=agent_capacity_leases.mission_id AND c.paused_at IS NOT NULL)`;

export class D1MatchingStore implements MatchingStore {
  constructor(private readonly db: D1Database) {}
  async load(): Promise<MatchingData> {
    const [profiles, evidence, outcomes, leases, commitments] = await Promise.all([
      this.db.prepare('SELECT data_json, revision FROM agent_execution_profiles').all<{ data_json: string; revision: number }>(),
      this.db.prepare('SELECT data_json FROM matching_capability_evidence ORDER BY id').all<{ data_json: string }>(),
      this.db.prepare('SELECT data_json FROM matching_outcomes ORDER BY id').all<{ data_json: string }>(),
      this.db.prepare('SELECT * FROM agent_capacity_leases ORDER BY run_id').all<Record<string, string>>(),
      this.db.prepare(`SELECT s.mission_id,s.id stage_id,s.agent_id FROM workflow_stages s JOIN stage_offers o ON o.stage_id=s.id AND o.agent_id=s.agent_id
        JOIN missions m ON m.id=s.mission_id WHERE o.status='accepted' AND s.status IN ('queued','running') AND m.status IN ('matching','running')`).all<Record<string,string>>(),
    ]);
    return {
      commitments:commitments.results.map((row)=>({missionId:row.mission_id,stageId:row.stage_id,agentId:row.agent_id})),
      profiles: profiles.results.map((row) => ({ ...JSON.parse(row.data_json), revision: row.revision })),
      evidence: evidence.results.map((row) => JSON.parse(row.data_json)), outcomes: outcomes.results.map((row) => JSON.parse(row.data_json)),
      leases: leases.results.map((row) => ({ runId: row.run_id, missionId: row.mission_id, stageId: row.stage_id, agentId: row.agent_id,
        agentVersion: row.agent_version, pool: row.pool, claimToken:row.claim_token, contactedAt:row.contacted_at, completedAt:row.completed_at, status: row.status as CapacityLease['status'], createdAt: row.created_at, expiresAt: row.expires_at })),
    };
  }
  async saveProfile(p: ExecutionProfile) {
    await this.db.prepare(`INSERT INTO agent_execution_profiles (agent_id,agent_version,revision,pool,max_concurrency,pool_concurrency,data_json)
      VALUES (?,?,1,?,?,?,?) ON CONFLICT(agent_id) DO UPDATE SET agent_version=excluded.agent_version, revision=revision+1,
      pool=excluded.pool,max_concurrency=excluded.max_concurrency,pool_concurrency=excluded.pool_concurrency,data_json=excluded.data_json`)
      .bind(p.agentId,p.agentVersion,p.pool,p.maxConcurrency,p.poolConcurrency,JSON.stringify(p)).run();
  }
  async saveEvidence(e: CapabilityEvidence) {
    await this.db.prepare('INSERT INTO matching_capability_evidence (id,agent_id,source_id,data_json) VALUES (?,?,?,?)').bind(e.id,e.agentId,e.sourceId,JSON.stringify(e)).run();
  }
  async saveOutcome(o: MatchingOutcome) {
    await this.db.prepare('INSERT INTO matching_outcomes (id,agent_id,data_json) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json').bind(o.id,o.agentId,JSON.stringify(o)).run();
  }
  async savePlan(p: MatchPlan) {
    await this.db.prepare('INSERT INTO matching_plans (id,mission_id,created_at,data_json) VALUES (?,?,?,?)').bind(p.id,p.missionId,p.createdAt,JSON.stringify(p)).run();
  }
  async getPlan(id: string): Promise<MatchPlan | null> {
    const row = await this.db.prepare('SELECT data_json FROM matching_plans WHERE id=?').bind(id).first<{ data_json: string }>();
    return row ? JSON.parse(row.data_json) : null;
  }
  async acquire(l: CapacityLease): Promise<boolean> {
    const insert = this.db.prepare(`INSERT OR IGNORE INTO agent_capacity_leases
      (run_id,mission_id,stage_id,agent_id,agent_version,pool,status,created_at,expires_at,claim_token)
      SELECT ?,?,?,a.id,a.version,a.owner_id||':'||COALESCE(p.pool,a.id),'active',?,?,?
      FROM agents a LEFT JOIN agent_execution_profiles p ON p.agent_id=a.id AND p.agent_version=a.version
      WHERE a.id=? AND a.status='active'
        AND EXISTS (SELECT 1 FROM workflow_stages s JOIN missions m ON m.id=s.mission_id JOIN escrows e ON e.mission_id=m.id
          WHERE s.id=? AND m.id=? AND s.agent_id=a.id AND s.status IN ('queued','running','failed')
          AND m.status='running' AND m.cancelled_at IS NULL AND e.status='held')
        AND NOT EXISTS (SELECT 1 FROM mission_runtime_controls c WHERE c.mission_id=? AND c.paused_at IS NOT NULL)
        AND (SELECT COUNT(*) FROM agent_capacity_leases l WHERE l.agent_id=a.id AND l.status<>'released') < COALESCE(p.max_concurrency,1)
        AND (SELECT COUNT(*) FROM agent_capacity_leases l WHERE l.pool=a.owner_id||':'||COALESCE(p.pool,a.id) AND l.status<>'released')
          < COALESCE((SELECT MIN(p2.pool_concurrency) FROM agent_execution_profiles p2 JOIN agents a2 ON a2.id=p2.agent_id
            WHERE a2.owner_id=a.owner_id AND p2.pool=COALESCE(p.pool,a.id) AND p2.agent_version=a2.version),1)
      `).bind(l.runId,l.missionId,l.stageId,l.createdAt,l.expiresAt,l.claimToken??'',l.agentId,l.stageId,l.missionId,l.missionId);
    const results=await this.db.batch([this.db.prepare("UPDATE agent_capacity_leases SET status='released' WHERE status='active' AND contacted_at IS NULL AND julianday(expires_at)<=julianday(?) AND julianday(created_at)<=julianday(?)-5.0/1440").bind(l.createdAt,l.createdAt),insert,this.db.prepare(`UPDATE agent_capacity_leases SET claim_token=?,created_at=? WHERE run_id=? AND status='active' AND contacted_at IS NULL AND julianday(created_at)<=julianday(?)-5.0/1440 AND agent_id=? AND stage_id=? AND mission_id=? AND ${LEASE_RUNNABLE}`).bind(l.claimToken??'',l.createdAt,l.runId,l.createdAt,l.agentId,l.stageId,l.missionId)]);
    return results.slice(1).some((row)=>Number(row.meta?.changes??0)>0);
  }
  async contact(runId:string,claimToken:string,now:string) { const result=await this.db.prepare(`UPDATE agent_capacity_leases SET contacted_at=? WHERE run_id=? AND claim_token=? AND status='active' AND contacted_at IS NULL AND julianday(expires_at)>julianday(?) AND ${LEASE_RUNNABLE}`).bind(now,runId,claimToken,now).run(); return result.meta.changes>0; }
  async finish(runId: string, status: 'released' | 'quarantined', claimToken?:string) {
    await this.db.prepare("UPDATE agent_capacity_leases SET status=? WHERE run_id=? AND status<>'released' AND (? IS NULL OR claim_token=?)").bind(status,runId,claimToken??null,claimToken??null).run();
  }
}
