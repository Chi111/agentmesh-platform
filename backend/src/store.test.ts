import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AgentFeedback, AgentMetricEvent, Dispute, EcosystemProposal, GovernancePowerSnapshot, RewardActivity, RewardClaim, RewardEpoch, YdStakingPosition } from './contracts';
import { D1PlatformStore, type D1Database, type D1Statement } from './store';

class SqliteStatement implements D1Statement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly query: string,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1Statement {
    return new SqliteStatement(this.db, this.query, values);
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.query).all(...this.values) as T[] };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (this.db.prepare(this.query).get(...this.values) as T | undefined) ?? null;
  }

  async run(): Promise<{ meta: { changes: number } }> {
    const result = this.db.prepare(this.query).run(...this.values);
    return { meta: { changes: Number(result.changes) } };
  }
}

class SqliteD1 implements D1Database {
  constructor(readonly db: DatabaseSync) {}

  prepare(query: string): D1Statement {
    return new SqliteStatement(this.db, query);
  }

  async batch(statements: D1Statement[]): Promise<Array<{ meta?: { changes?: number } }>> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const results: Array<{ meta?: { changes?: number } }> = [];
      for (const statement of statements) results.push(await statement.run());
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

function migratedDatabase(): SqliteD1 {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const migrationsDirectory = join(import.meta.dirname, '../../db');
  for (const filename of readdirSync(migrationsDirectory).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()) {
    db.exec(readFileSync(join(migrationsDirectory, filename), 'utf8'));
  }
  db.exec(`
    INSERT INTO profiles (id, email, display_name, role) VALUES
      ('demo-requester', 'requester@test.invalid', 'Test Requester', 'requester'),
      ('demo-developer', 'developer@test.invalid', 'Test Developer', 'developer'),
      ('demo-arbitrator', 'arbitrator@test.invalid', 'Test Arbitrator', 'requester'),
      ('demo-arbitrator-2', 'arbitrator-2@test.invalid', 'Test Arbitrator Two', 'requester');

    INSERT INTO arbitration_members (user_id, status, power, appointed_by, appointed_at, updated_at)
    VALUES
      ('demo-arbitrator', 'active', 1, 'demo-arbitrator', '2026-08-18T00:00:00.000Z', '2026-08-18T00:00:00.000Z'),
      ('demo-arbitrator-2', 'active', 1, 'demo-arbitrator', '2026-08-18T00:00:00.000Z', '2026-08-18T00:00:00.000Z');

    INSERT INTO agents
      (id, owner_id, name, category, summary, endpoint_url, price_usdc, wallet_address, status, author_name)
    VALUES
      ('visionboard', 'demo-developer', 'Visual Test Agent', '图像生成', 'D1 store test fixture', 'https://agents.test.invalid/visual', 80, '0x2200000000000000000000000000000000009a11', 'active', 'Test Developer'),
      ('motioncraft', 'demo-developer', 'Motion Test Agent', '视频生成', 'D1 store test fixture', 'https://agents.test.invalid/motion', 120, '0x2200000000000000000000000000000000009a12', 'active', 'Test Developer'),
      ('analyst', 'demo-developer', 'Analysis Test Agent', '商业分析', 'D1 store test fixture', 'https://agents.test.invalid/analysis', 350, '0x2200000000000000000000000000000000009a13', 'active', 'Test Developer');

    INSERT INTO missions
      (id, requester_id, title, description, category, budget_usdc, deadline, status, progress, current_stage, team_json)
    VALUES
      ('TASK-2026-0815', 'demo-requester', 'Running store test mission', 'Exercises callback and dispute concurrency.', '视频生产', 200, '2026-09-01', 'running', 50, 'Visual stage running', '["visionboard","motioncraft"]'),
      ('TASK-2026-0809', 'demo-requester', 'Review store test mission', 'Exercises one-time acceptance settlement.', '商业分析', 350, '2026-09-01', 'review', 100, 'Ready for acceptance', '["analyst"]');

    INSERT INTO workflow_stages
      (id, mission_id, position, name, purpose, category, budget_usdc, status, agent_id, output_json)
    VALUES
      ('stage-visual', 'TASK-2026-0815', 1, 'Visual stage', 'Generate visual output', '图像生成', 80, 'running', 'visionboard', NULL),
      ('stage-motion', 'TASK-2026-0815', 2, 'Motion stage', 'Generate motion output', '视频生成', 120, 'queued', 'motioncraft', NULL),
      ('stage-analysis', 'TASK-2026-0809', 1, 'Analysis stage', 'Generate final analysis', '商业分析', 350, 'done', 'analyst', '{"verified":true}');

    INSERT INTO escrows (id, mission_id, amount, token, network, payment_method, status) VALUES
      ('ESC-TEST-RUNNING', 'TASK-2026-0815', 200, 'CREDIT', 'agentmesh', 'web2_balance', 'held'),
      ('ESC-TEST-REVIEW', 'TASK-2026-0809', 350, 'CREDIT', 'agentmesh', 'web2_balance', 'held');

    INSERT INTO wallet_balances (user_id, balance) VALUES ('demo-requester', 1000);
  `);
  return new SqliteD1(db);
}

describe('D1PlatformStore concurrency invariants', () => {
  let database: SqliteD1;
  let store: D1PlatformStore;

  beforeEach(() => {
    database = migratedDatabase();
    store = new D1PlatformStore(database);
  });

  it('persists isolated YD reward, claim, staking and Power-governance ledgers atomically', async () => {
    const wallet = '0x7100000000000000000000000000000000008f2c';
    database.db.prepare('UPDATE profiles SET wallet_address = ? WHERE id = ?').run(wallet, 'demo-requester');
    const epoch: RewardEpoch = {
      id: 'YDEPOCH-D1-1', epochNumber: 1, status: 'draft',
      startsAt: '2026-08-01T00:00:00.000Z', endsAt: '2026-08-15T00:00:00.000Z', claimEndsAt: '2026-09-01T00:00:00.000Z',
      totalRewardUnits: '100000000000000000000', accountScoreCap: 2_000_000_000, formulaVersion: 'agentmesh-yd-v1',
      rules: { settlementRequired: true }, chainId: 11155111,
      distributorAddress: '0x1000000000000000000000000000000000000002',
      merkleRoot: null, manifestHash: null, publishTxHash: null, computedAt: null, publishedAt: null,
      createdBy: 'demo-arbitrator', createdAt: '2026-08-16T00:00:00.000Z', updatedAt: '2026-08-16T00:00:00.000Z',
    };
    await store.createRewardEpoch(epoch);
    const activity: RewardActivity = {
      id: 'YDACTIVITY-D1-1', sourceKey: 'settlement:TASK-2026-0809:requester', userId: 'demo-requester',
      missionId: 'TASK-2026-0809', disputeId: null, role: 'requester', asset: 'CREDIT', settledAmount: 350,
      formulaVersion: 'agentmesh-yd-v1',
      qualityBps: 10_000, penaltyBps: 0, scoreMicros: 4_677_071, eligible: true,
      detail: { accepted: true }, occurredAt: '2026-08-10T00:00:00.000Z', createdAt: '2026-08-10T00:00:00.000Z',
    };
    expect(await store.recordRewardActivity(activity)).toBe(true);
    expect(await store.recordRewardActivity(activity)).toBe(false);

    const computed = await store.computeRewardEpoch(epoch.id, '2026-08-16T00:01:00.000Z', 'demo-arbitrator');
    expect(computed.state).toBe('computed');
    if (computed.state !== 'computed') throw new Error('expected computed epoch');
    expect(computed.allocations).toHaveLength(1);
    expect(computed.allocations[0].amountUnits).toBe(epoch.totalRewardUnits);
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM yd_admin_actions WHERE action = 'reward_epoch_computed'").get()).toEqual({ count: 1 });

    const publishTx = `0x${'a'.repeat(64)}`;
    expect((await store.markRewardEpochPublished(epoch.id, publishTx, '2026-08-16T00:02:00.000Z', 'demo-arbitrator'))?.status).toBe('published');
    const claim: RewardClaim = {
      id: 'YDCLAIM-D1-1', epochId: epoch.id, userId: 'demo-requester', walletAddress: wallet,
      amountUnits: epoch.totalRewardUnits, txHash: `0x${'b'.repeat(64)}`, blockNumber: '100', logIndex: 1,
      claimedAt: '2026-08-16T00:03:00.000Z',
    };
    expect((await store.recordRewardClaim(claim))?.applied).toBe(true);
    expect((await store.recordRewardClaim({ ...claim, id: 'YDCLAIM-D1-REPLAY' }))?.applied).toBe(false);
    expect((await store.listRewardAllocations(epoch.id))[0].status).toBe('claimed');
    expect((await store.markRewardEpochExpired(epoch.id, `0x${'d'.repeat(64)}`, '2026-09-02T00:00:00.000Z', 'demo-arbitrator'))?.status).toBe('expired');
    expect((await store.listRewardAllocations(epoch.id))[0].status).toBe('claimed');

    const position: YdStakingPosition = {
      userId: 'demo-requester', walletAddress: wallet, amountUnits: '10000000000000000000',
      unlockTime: '2027-02-12T00:00:00.000Z', durationSeconds: 15_552_000, reputationBps: 10_000,
      rawPower: '3162277660', delegatedTo: wallet, votingPower: '3162277660', verified: true,
      lastTxHash: `0x${'c'.repeat(64)}`, lastBlockNumber: '110', lastLogIndex: 2, updatedAt: '2026-08-16T00:04:00.000Z',
    };
    expect((await store.syncYdStakingPosition(position)).amountUnits).toBe(position.amountUnits);
    const stale = await store.syncYdStakingPosition({ ...position, amountUnits: '1', lastBlockNumber: '109', updatedAt: '2026-08-16T00:05:00.000Z' });
    expect(stale.amountUnits).toBe(position.amountUnits);

    const proposal: EcosystemProposal = {
      id: 'YDGOV-D1-1', proposalNumber: 1, proposerId: 'demo-arbitrator', proposalType: 'development',
      title: 'Improve contribution verification', description: 'Fund public contribution verification tooling without changing escrow.',
      payload: {}, status: 'active', snapshotBlock: '100', startsAt: '2026-08-16T00:00:00.000Z', endsAt: '2026-08-17T00:00:00.000Z',
      quorumBps: 2_000, approvalBps: 5_001, eligiblePower: '100', forPower: '0', againstPower: '0', abstainPower: '0',
      finalizedAt: null, finalizedBy: null, createdAt: '2026-08-16T00:00:00.000Z',
    };
    const snapshot: GovernancePowerSnapshot = {
      proposalId: proposal.id, userId: 'demo-requester', walletAddress: wallet, power: '100', delegateSources: [], createdAt: proposal.createdAt,
    };
    await store.createEcosystemProposal(proposal, [snapshot]);
    expect((await store.castEcosystemVote(proposal.id, 'demo-requester', 'for', 'Public verification improves ecosystem accountability.', '2026-08-16T01:00:00.000Z')).state).toBe('applied');
    expect((await store.castEcosystemVote(proposal.id, 'demo-requester', 'against', 'Duplicate vote must fail.', '2026-08-16T01:01:00.000Z')).state).toBe('already_voted');
    const finalized = await store.finalizeEcosystemProposal(proposal.id, 'demo-arbitrator', '2026-08-16T01:02:00.000Z');
    expect(finalized.state).toBe('finalized');
    expect(finalized.governance.proposal.status).toBe('succeeded');
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM yd_admin_actions WHERE action LIKE 'governance_%'").get()).toEqual({ count: 2 });

    expect(database.db.prepare('SELECT status FROM escrows WHERE mission_id = ?').get('TASK-2026-0809')).toEqual({ status: 'held' });
  });

  it('seeds the runnable official Agent market after removing historical demo data', async () => {
    const agents = await store.listAgents();
    const official = agents.filter((agent) => agent.ownerId === 'agentmesh-official');

    expect(official.map((agent) => agent.id).sort()).toEqual([
      'official-delivery-writer',
      'official-evidence-scout',
      'official-strategy-analyst',
    ]);
    expect(official.every((agent) => agent.official && agent.status === 'active')).toBe(true);
    expect(official.every((agent) => agent.endpoint.startsWith('agentmesh://builtin/'))).toBe(true);
  });

  it('keeps Agent quality events idempotent, deterministically recomputable and feedback versioned', async () => {
    const occurredAt = '2026-08-23T00:00:00.000Z';
    const metric = (id: string, type: AgentMetricEvent['type'], value: number): AgentMetricEvent => ({
      id, idempotencyKey: id, agentId: 'visionboard', type, value, weight: 1, severity: 'info',
      sourceType: 'trial', sourceId: id, detail: {}, occurredAt, createdAt: occurredAt,
    });
    expect((await store.recordAgentMetricEvent(metric('quality-trial', 'trial_passed', 96), occurredAt)).applied).toBe(true);
    expect((await store.recordAgentMetricEvent(metric('quality-trial', 'trial_passed', 96), occurredAt)).applied).toBe(false);
    await store.recordAgentMetricEvent(metric('quality-health', 'endpoint_healthy', 98), occurredAt);
    database.db.prepare('UPDATE agent_stats SET reputation = 0, endpoint_healthy = 0 WHERE agent_id = ?').run('visionboard');
    const repaired = await store.recordAgentMetricEvent(metric('quality-health', 'endpoint_healthy', 98), occurredAt);
    expect(repaired).toMatchObject({ applied: false, stats: { marketplaceStatus: 'listed', endpointHealthy: true } });
    const stats = await store.recomputeAgentQuality('visionboard', occurredAt);
    expect(stats).toMatchObject({ marketplaceStatus: 'listed', trialPassed: true, endpointHealthy: true, confidence: 'low' });
    expect(await store.listAgentMetricEvents('visionboard')).toHaveLength(2);
    expect(await store.listAgentReputationSnapshots('visionboard')).toMatchObject([{ eventCount: 2, reputation: stats?.reputation }]);

    const feedback: AgentFeedback = {
      id: 'FEEDBACK-D1-V1', agentId: 'analyst', missionId: 'TASK-2026-0809', stageId: 'stage-analysis', requesterId: 'demo-requester',
      version: 1, deliveryQuality: 5, requirementsFit: 4, communication: 5, onTime: true, reuse: true,
      comment: '交付结构清晰，并且所有结论都能回溯到任务证据。', effective: true, createdAt: '2026-08-23T01:00:00.000Z',
    };
    expect((await store.saveAgentFeedback(feedback, feedback.createdAt)).feedback.version).toBe(1);
    const updated = await store.saveAgentFeedback({ ...feedback, id: 'FEEDBACK-D1-V2', deliveryQuality: 4, createdAt: '2026-08-23T02:00:00.000Z' }, '2026-08-23T02:00:00.000Z');
    expect(updated.feedback.version).toBe(2);
    expect(await store.listAgentFeedback('analyst')).toMatchObject([{ id: 'FEEDBACK-D1-V2', effective: true }]);
    expect(database.db.prepare('SELECT COUNT(*) AS count FROM agent_feedback WHERE agent_id = ?').get('analyst')).toEqual({ count: 2 });
    expect(database.db.prepare('SELECT COUNT(*) AS count FROM agent_feedback WHERE agent_id = ? AND effective = 1').get('analyst')).toEqual({ count: 1 });
    expect(database.db.prepare('SELECT weight FROM agent_metric_events WHERE idempotency_key = ?').get('feedback:FEEDBACK-D1-V2')).toEqual({ weight: 1 });

    database.db.exec(`
      INSERT INTO missions
        (id, requester_id, title, description, category, budget_usdc, deadline, status, progress, current_stage, team_json)
      VALUES
        ('TASK-D1-FEEDBACK-2', 'demo-requester', 'Second feedback mission', 'Verifies repeated requester feedback weighting.', '商业分析', 120, '2026-09-02', 'completed', 100, 'Completed', '["analyst"]');
      INSERT INTO workflow_stages
        (id, mission_id, position, name, purpose, category, budget_usdc, status, agent_id, output_json)
      VALUES
        ('stage-feedback-2', 'TASK-D1-FEEDBACK-2', 1, 'Second analysis', 'Generate another analysis.', '商业分析', 120, 'done', 'analyst', '{"verified":true}');
    `);
    const repeated = await store.saveAgentFeedback({
      ...feedback,
      id: 'FEEDBACK-D1-REPEATED',
      missionId: 'TASK-D1-FEEDBACK-2',
      stageId: 'stage-feedback-2',
      createdAt: '2026-08-23T03:00:00.000Z',
    }, '2026-08-23T03:00:00.000Z');
    expect(repeated.feedback.version).toBe(1);
    expect(database.db.prepare('SELECT weight FROM agent_metric_events WHERE idempotency_key = ?').get('feedback:FEEDBACK-D1-REPEATED')).toEqual({ weight: 0.7071 });
  });

  it('persists a DAG draft with optimistic locking and enforces graph locks after funding', async () => {
    database.db.exec(`
      INSERT INTO missions
        (id, requester_id, title, description, category, budget_usdc, deadline, status, progress, current_stage, team_json)
      VALUES
        ('TASK-D1-DAG', 'demo-requester', 'D1 DAG mission', 'Exercises graph persistence and locking.', '软件开发', 200, '2026-09-01', 'matching', 0, 'Draft', '[]');
      INSERT INTO workflow_stages
        (id, mission_id, position, name, purpose, category, budget_usdc, status, agent_id, input_json)
      VALUES
        ('stage-dag-a', 'TASK-D1-DAG', 1, 'Architecture', 'Analyze the implementation boundary.', '软件开发', 80, 'queued', 'visionboard', '{"executionMode":"analyze"}'),
        ('stage-dag-b', 'TASK-D1-DAG', 2, 'Implementation', 'Implement and verify the change.', '软件开发', 120, 'queued', 'motioncraft', '{"executionMode":"implement"}');
      INSERT INTO escrows (id, mission_id, amount, token, network, payment_method, status)
      VALUES ('ESC-D1-DAG', 'TASK-D1-DAG', 200, 'CREDIT', 'agentmesh', 'web2_balance', 'pending');
    `);
    const mission = (await store.getMission('TASK-D1-DAG'))!;
    const stages = (await store.listStages(mission.id)).map((stage, index) => ({
      ...stage,
      positionX: 80 + index * 360,
      positionY: 120,
    }));
    const edges = [{
      id: 'EDGE-D1-DAG-A-B',
      missionId: mission.id,
      sourceStageId: stages[0].id,
      targetStageId: stages[1].id,
      createdAt: '2026-08-22T00:00:00.000Z',
    }];

    const saved = await store.saveWorkflowDraft(mission.id, stages, edges, { x: 12, y: 24, zoom: 0.8 }, mission.workflowVersion);
    expect(saved.state).toBe('saved');
    expect((await store.getMission(mission.id))?.workflowVersion).toBe(2);
    expect(await store.listEdges(mission.id)).toEqual(edges);

    const stale = await store.saveWorkflowDraft(mission.id, stages, [], { x: 0, y: 0, zoom: 1 }, mission.workflowVersion);
    expect(stale.state).toBe('version_conflict');
    expect(await store.listEdges(mission.id)).toEqual(edges);

    database.db.prepare("UPDATE escrows SET status = 'held' WHERE mission_id = ?").run(mission.id);
    expect(() => database.db.prepare('UPDATE workflow_stages SET budget_usdc = 100 WHERE id = ?').run(stages[0].id)).toThrow('WORKFLOW_LOCKED');
    expect(() => database.db.prepare(`
      INSERT INTO workflow_edges (id, mission_id, source_stage_id, target_stage_id, created_at)
      VALUES ('EDGE-D1-LOCKED', 'TASK-D1-DAG', 'stage-dag-b', 'stage-dag-a', datetime('now'))
    `).run()).toThrow('WORKFLOW_LOCKED');
  });

  it('keeps one outbox run ID during recovery and rotates it only for an explicit rerun', async () => {
    database.db.exec(`
      INSERT INTO missions
        (id, requester_id, title, description, category, budget_usdc, deadline, status, progress, current_stage, team_json)
      VALUES
        ('TASK-D1-OUTBOX', 'demo-requester', 'D1 outbox mission', 'Exercises durable DAG dispatch identity.', '软件开发', 100, '2026-09-01', 'running', 1, 'Ready', '["visionboard"]');
      INSERT INTO workflow_stages
        (id, mission_id, position, name, purpose, category, budget_usdc, status, agent_id, input_json)
      VALUES
        ('stage-d1-outbox', 'TASK-D1-OUTBOX', 1, 'Dispatch task', 'Dispatch exactly once per run.', '软件开发', 100, 'queued', 'visionboard', '{"executionMode":"implement"}');
      INSERT INTO escrows (id, mission_id, amount, token, network, payment_method, status)
      VALUES ('ESC-D1-OUTBOX', 'TASK-D1-OUTBOX', 100, 'CREDIT', 'agentmesh', 'web2_balance', 'held');
    `);
    const startedAt = '2026-08-22T00:00:00.000Z';
    const [first] = await store.enqueueDispatches('TASK-D1-OUTBOX', ['stage-d1-outbox'], startedAt);
    const [duplicate] = await store.enqueueDispatches('TASK-D1-OUTBOX', ['stage-d1-outbox'], '2026-08-22T00:00:30.000Z');
    expect(duplicate.runId).toBe(first.runId);
    expect(duplicate.expiresAt).toBe(first.expiresAt);

    expect(await store.claimDispatch(first.id, '2026-08-22T00:00:30.000Z')).toBe(true);
    await store.completeDispatch(first.id, 'done', '2026-08-22T00:01:00.000Z');
    const [rerun] = await store.enqueueDispatches('TASK-D1-OUTBOX', ['stage-d1-outbox'], '2026-08-22T00:02:00.000Z');
    expect(rerun.runId).not.toBe(first.runId);
    expect(rerun.expiresAt).not.toBe(first.expiresAt);
  });

  it('binds an idempotency key to the request hash', async () => {
    expect((await store.claimIdempotent('demo-requester', 'd1-idempotency', 'POST', '/api/missions', 'hash-a')).state).toBe('acquired');
    expect((await store.claimIdempotent('demo-requester', 'd1-idempotency', 'POST', '/api/missions', 'hash-a')).state).toBe('pending');
    expect((await store.claimIdempotent('demo-requester', 'd1-idempotency', 'POST', '/api/missions', 'hash-b')).state).toBe('conflict');
  });

  it('holds Web2 funds only after the persisted stage offer is accepted', async () => {
    database.db.exec(`
      INSERT INTO missions
        (id, requester_id, title, description, category, budget_usdc, deadline, status, progress, current_stage, team_json)
      VALUES
        ('TASK-OFFER-GATE', 'demo-requester', 'Offer gate mission', 'Verifies the D1 funding gate.', '图像生成', 100, '2026-09-01', 'matching', 0, 'Waiting for offers', '["visionboard"]');
      INSERT INTO workflow_stages
        (id, mission_id, position, name, purpose, category, budget_usdc, status, agent_id)
      VALUES
        ('stage-offer-gate', 'TASK-OFFER-GATE', 1, 'Offer stage', 'Verify acceptance', '图像生成', 100, 'queued', 'visionboard');
      INSERT INTO escrows (id, mission_id, amount, token, network, payment_method, status)
      VALUES ('ESC-OFFER-GATE', 'TASK-OFFER-GATE', 100, 'CREDIT', 'agentmesh', 'web2_balance', 'pending');
    `);
    const [stage] = await store.listStages('TASK-OFFER-GATE');
    const offer = {
      id: 'OFFER-D1-GATE', missionId: 'TASK-OFFER-GATE', stageId: stage.id, agentId: 'visionboard', status: 'pending' as const,
      expiresAt: '2026-08-18T00:30:00.000Z', respondedAt: null, createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z',
    };
    await store.confirmWorkflow('TASK-OFFER-GATE', [stage], ['visionboard'], [offer]);

    const blocked = await store.startMission('TASK-OFFER-GATE', 'demo-requester', null, null, '2026-08-18T00:01:00.000Z');
    expect(blocked?.applied).toBe(false);
    expect((await store.getWalletAccount('demo-requester')).balance).toBe(1_000);
    await store.respondStageOffer(offer.id, 'demo-developer', 'declined', '2026-08-18T00:02:00.000Z');
    database.db.prepare(`
      INSERT INTO execution_events (id, mission_id, stage_id, event_type, message, actor_type, payload_json, created_at)
      VALUES ('EVT-OFFER-DECLINED', 'TASK-OFFER-GATE', 'stage-offer-gate', 'offer.declined', 'Offer declined', 'developer', '{}', '2026-08-18T00:02:00.000Z')
    `).run();
    const reissuedOffer = { ...offer, id: 'OFFER-D1-GATE-REISSUED', status: 'pending' as const, respondedAt: null };
    await expect(store.confirmWorkflow('TASK-OFFER-GATE', [stage], ['visionboard'], [reissuedOffer])).resolves.toBeTruthy();
    expect((await store.listStageOffers('TASK-OFFER-GATE', '2026-08-18T00:03:00.000Z')).map((item) => item.id)).toEqual([reissuedOffer.id]);
    expect(database.db.prepare('SELECT stage_id FROM execution_events WHERE id = ?').get('EVT-OFFER-DECLINED')).toEqual({ stage_id: stage.id });
    await store.respondStageOffer(reissuedOffer.id, 'demo-developer', 'accepted', '2026-08-18T00:05:00.000Z');
    expect((await store.getStageOffer(reissuedOffer.id, '2026-08-18T01:00:00.000Z'))?.status).toBe('accepted');
    expect((await store.getMission('TASK-OFFER-GATE'))?.currentStage).toBe('Agent 已全部接单，等待托管支付');
    const started = await store.startMission('TASK-OFFER-GATE', 'demo-requester', null, null, '2026-08-18T01:00:00.000Z');

    expect(started?.applied).toBe(true);
    expect(started?.mission.status).toBe('running');
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE mission_id = ? AND transaction_type = 'mission_hold'").get('TASK-OFFER-GATE')).toEqual({ count: 1 });
    expect((await store.getWalletAccount('demo-requester')).balance).toBe(900);
  });

  it('applies acceptance side effects only on the first state transition', async () => {
    const first = await store.acceptMission('TASK-2026-0809', 'demo-requester', null);
    const second = await store.acceptMission('TASK-2026-0809', 'demo-requester', null);

    expect(first?.applied).toBe(true);
    expect(first?.mission.status).toBe('completed');
    expect(second?.applied).toBe(false);
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM execution_events WHERE mission_id = ? AND event_type = 'mission.accepted'").get('TASK-2026-0809')).toEqual({ count: 1 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE mission_id = ? AND transaction_type = 'agent_payout'").get('TASK-2026-0809')).toEqual({ count: 1 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM reward_activities WHERE mission_id = ? AND role = 'requester'").get('TASK-2026-0809')).toEqual({ count: 1 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM reward_activities WHERE mission_id = ? AND role = 'agent_owner'").get('TASK-2026-0809')).toEqual({ count: 1 });
    expect((await store.getWalletAccount('demo-developer')).balance).toBe(348.6);
    await expect(store.createDispute({
      id: 'DSP-AFTER-RELEASE', missionId: 'TASK-2026-0809', openedBy: 'demo-requester',
      reason: '托管已经释放后不能再插入一条无法冻结资金的争议案件。', evidence: [], status: 'open', resolution: null,
      freezeTxHash: null, resolutionTxHash: null, createdAt: '2026-08-18T00:00:00.000Z', resolvedAt: null,
    })).rejects.toThrow('ESCROW_NOT_HELD');
  });

  it('applies callback claim, stage, event and dispatch terminal state atomically', async () => {
    const runId = 'run-d1-atomic-callback';
    const callbackId = 'callback-d1-atomic';
    const expiresAt = '2026-08-19T00:00:00.000Z';
    const updateNow = '2026-08-18T12:00:00.000Z';
    await store.createAgentDispatch({
      runId,
      missionId: 'TASK-2026-0815',
      stageId: 'stage-visual',
      agentId: 'visionboard',
      expiresAt,
    });
    database.db.prepare(`
      INSERT INTO workflow_dispatch_outbox
        (id, mission_id, stage_id, run_id, expires_at, status, attempts, next_attempt_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'processing', 1, ?, ?, ?)
    `).run('OUTBOX-D1-ATOMIC', 'TASK-2026-0815', 'stage-visual', runId, expiresAt, updateNow, updateNow, updateNow);
    const update = {
      runId,
      callbackId,
      missionId: 'TASK-2026-0815',
      stageId: 'stage-visual',
      agentId: 'visionboard',
      expiresAt,
      now: updateNow,
      status: 'done' as const,
      output: { contentHash: 'sha256:d1-atomic-callback' },
      artifacts: [{
        id: 'DEL-D1-ATOMIC', missionId: 'TASK-2026-0815', stageId: 'stage-visual', agentId: 'visionboard',
        name: 'Atomic callback artifact', uri: 'ipfs://bafyd1atomicartifact',
        contentHash: `sha256:${'a'.repeat(64)}`, mimeType: 'application/json', status: 'submitted' as const,
        createdAt: updateNow,
      }],
      progress: 80,
      currentStage: '视觉设定与分镜 已完成',
      event: {
        id: 'EVT-D1-ATOMIC-CALLBACK',
        missionId: 'TASK-2026-0815',
        stageId: 'stage-visual',
        type: 'stage.done',
        message: 'D1 原子回调完成',
        actorType: 'agent' as const,
        actorId: 'visionboard',
        payload: {},
        createdAt: '2026-08-18T12:00:00.000Z',
      },
    };

    const first = await store.applyAgentCallback(update);
    const duplicate = await store.applyAgentCallback(update);

    expect(first.state).toBe('applied');
    expect(duplicate.state).toBe('duplicate');
    expect((await store.listStages(update.missionId)).find((stage) => stage.id === update.stageId)?.status).toBe('done');
    expect(database.db.prepare('SELECT COUNT(*) AS count FROM execution_events WHERE id = ?').get(update.event.id)).toEqual({ count: 1 });
    expect(database.db.prepare('SELECT COUNT(*) AS count FROM agent_performance_events WHERE stage_id = ?').get(update.stageId)).toEqual({ count: 1 });
    expect(database.db.prepare('SELECT COUNT(*) AS count FROM deliverables WHERE id = ?').get('DEL-D1-ATOMIC')).toEqual({ count: 1 });
    expect(database.db.prepare('SELECT status FROM workflow_dispatch_outbox WHERE id = ?').get('OUTBOX-D1-ATOMIC')).toEqual({ status: 'done' });
    expect(database.db.prepare('SELECT success_rate FROM agents WHERE id = ?').get(update.agentId)).toEqual({ success_rate: 83.3 });
    expect(database.db.prepare('SELECT processing_token, applied_at FROM agent_callback_events WHERE run_id = ? AND callback_id = ?').get(runId, callbackId)).toEqual(expect.objectContaining({ applied_at: update.now }));
  });

  it('atomically reclaims a failed stage for dispatch', async () => {
    const failed = await store.transitionRunningStage('TASK-2026-0815', 'stage-visual', 'failed', {
      error: 'Bearer token required',
      retryable: true,
    });
    expect(failed?.status).toBe('failed');

    const reclaimed = await store.claimStageForDispatch('TASK-2026-0815', 'stage-visual');
    const duplicate = await store.claimStageForDispatch('TASK-2026-0815', 'stage-visual');

    expect(reclaimed?.status).toBe('running');
    expect(duplicate).toBeNull();
  });

  it('reconciles a legacy running mission when every stage has signed output', async () => {
    database.db.exec(`
      INSERT INTO missions
        (id, requester_id, title, description, category, budget_usdc, deadline, status, progress, current_stage, team_json)
      VALUES
        ('TASK-2026-F3BF6E', 'demo-requester', 'Legacy signed mission', 'Reconciles one affected production mission.', '商业分析', 80, '2026-09-01', 'running', 100, 'Legacy running state', '["analyst"]');
      INSERT INTO workflow_stages
        (id, mission_id, position, name, purpose, category, budget_usdc, status, agent_id, output_json)
      VALUES
        ('stage-legacy-signed', 'TASK-2026-F3BF6E', 1, 'Signed stage', 'Verify output', '商业分析', 80, 'done', 'analyst', '{"verified":true}');
      INSERT INTO escrows (id, mission_id, amount, token, network, payment_method, status)
      VALUES ('ESC-LEGACY-SIGNED', 'TASK-2026-F3BF6E', 80, 'CREDIT', 'agentmesh', 'web2_balance', 'held');
    `);
    const migration = readFileSync(join(import.meta.dirname, '../../db/013_reconcile_signed_output_reviews.sql'), 'utf8');
    database.db.exec(migration);
    database.db.exec(migration);

    expect(await store.getMission('TASK-2026-F3BF6E')).toMatchObject({
      status: 'review',
      progress: 100,
      currentStage: 'Agent 已全部完成，等待任务方验收',
    });
  });

  it('reopens the affected review mission without releasing escrow when its engineering artifact is missing', async () => {
    database.db.exec(`
      INSERT INTO missions
        (id, requester_id, title, description, category, budget_usdc, deadline, status, progress, current_stage, team_json, review_due_at)
      VALUES
        ('TASK-2026-795E53', 'demo-requester', 'Missing artifact mission', 'Preserves text evidence while revoking false delivery.', '软件开发', 100, '2026-09-01', 'review', 100, '等待验收', '["visionboard","motioncraft"]', '2026-08-30T00:00:00.000Z');
      INSERT INTO workflow_stages
        (id, mission_id, position, name, purpose, category, budget_usdc, status, agent_id, input_json, output_json)
      VALUES
        ('stage-artifact-analysis', 'TASK-2026-795E53', 1, 'Analysis', 'Analyze', '软件开发', 20, 'done', 'visionboard', '{"dependsOn":[]}', '{"result":{"summary":"analysis","verified":true}}'),
        ('stage-artifact-implement', 'TASK-2026-795E53', 2, 'Implementation', 'Implement', '软件开发', 35, 'done', 'motioncraft', '{"dependsOn":[1]}', '{"result":{"summary":"claimed implementation","deliverable":"fake archive"}}'),
        ('stage-artifact-review', 'TASK-2026-795E53', 3, 'Review', 'Review', '软件开发', 45, 'done', 'visionboard', '{"dependsOn":[2]}', '{"result":{"summary":"cannot package","deliverable":"missing artifacts"}}');
      INSERT INTO workflow_edges (id, mission_id, source_stage_id, target_stage_id, created_at) VALUES
        ('edge-artifact-a-i', 'TASK-2026-795E53', 'stage-artifact-analysis', 'stage-artifact-implement', datetime('now')),
        ('edge-artifact-i-r', 'TASK-2026-795E53', 'stage-artifact-implement', 'stage-artifact-review', datetime('now'));
      INSERT INTO escrows (id, mission_id, amount, token, network, payment_method, status)
      VALUES ('ESC-MISSING-ARTIFACT', 'TASK-2026-795E53', 100, 'CREDIT', 'agentmesh', 'web2_balance', 'pending');
      UPDATE escrows SET status = 'frozen' WHERE mission_id = 'TASK-2026-795E53';
      INSERT INTO workflow_dispatch_outbox
        (id, mission_id, stage_id, run_id, expires_at, status, attempts, next_attempt_at, created_at, updated_at)
      VALUES
        ('OUTBOX-MISSING-ARTIFACT', 'TASK-2026-795E53', 'stage-artifact-implement', 'run-missing-artifact', '2026-09-01T00:00:00.000Z', 'processing', 1, datetime('now'), datetime('now'), datetime('now'));
    `);
    const migration = readFileSync(join(import.meta.dirname, '../../db/017_reopen_missing_engineering_artifact.sql'), 'utf8');
    database.db.exec(migration);
    database.db.exec(migration);

    expect(await store.getMission('TASK-2026-795E53')).toMatchObject({
      status: 'running',
      progress: 20,
      reviewDueAt: null,
    });
    expect((await store.getEscrow('TASK-2026-795E53'))?.status).toBe('frozen');
    expect((await store.listStages('TASK-2026-795E53')).map((stage) => stage.status)).toEqual(['done', 'failed', 'failed']);
    expect((await store.listStages('TASK-2026-795E53'))[1].output).toMatchObject({
      invalidated: true,
      result: { deliverable: 'fake archive' },
    });
    expect(database.db.prepare('SELECT status FROM workflow_dispatch_outbox WHERE id = ?').get('OUTBOX-MISSING-ARTIFACT')).toEqual({ status: 'done' });
    expect(database.db.prepare('SELECT COUNT(*) AS count FROM execution_events WHERE id = ?').get('EVT-REOPEN-MISSING-ENGINEERING-ARTIFACT')).toEqual({ count: 1 });
  });

  it('enforces one active dispute and applies only the first ruling', async () => {
    const dispute: Dispute = {
      id: 'DSP-D1-CONCURRENCY',
      missionId: 'TASK-2026-0815',
      openedBy: 'demo-requester',
      reason: '需要验证 D1 在并发边界下只能保留一个活跃争议案件。',
      evidence: [],
      status: 'open',
      resolution: null,
      freezeTxHash: null,
      resolutionTxHash: null,
      createdAt: '2026-08-18T00:00:00.000Z',
      resolvedAt: null,
    };
    await store.createAgentDispatch({
      runId: 'run-frozen-callback', missionId: dispute.missionId, stageId: 'stage-visual', agentId: 'visionboard', expiresAt: '2026-08-19T00:00:00.000Z',
    });
    await store.createDispute(dispute);
    expect(await store.transitionRunningStage(dispute.missionId, 'stage-visual', 'done', { late: true })).toBeNull();
    expect(await store.claimStageForDispatch(dispute.missionId, 'stage-motion')).toBeNull();
    expect((await store.applyAgentCallback({
      runId: 'run-frozen-callback', callbackId: 'callback-after-freeze', missionId: dispute.missionId,
      stageId: 'stage-visual', agentId: 'visionboard', expiresAt: '2026-08-19T00:00:00.000Z', now: '2026-08-18T12:00:00.000Z',
      status: 'done', progress: 90, currentStage: '不应写入',
      event: {
        id: 'EVT-AFTER-FREEZE', missionId: dispute.missionId, stageId: 'stage-visual', type: 'stage.done', message: '不应写入',
        actorType: 'agent', actorId: 'visionboard', payload: {}, createdAt: '2026-08-18T12:00:00.000Z',
      },
    })).state).toBe('invalid');
    expect(database.db.prepare('SELECT COUNT(*) AS count FROM execution_events WHERE id = ?').get('EVT-AFTER-FREEZE')).toEqual({ count: 0 });
    await expect(store.createDispute({ ...dispute, id: 'DSP-D1-DUPLICATE' })).rejects.toThrow('ACTIVE_DISPUTE_EXISTS');
    await store.setArbitrationMember('demo-requester', true, 'demo-arbitrator', '2026-08-18T00:00:00.000Z');
    await store.setArbitrationMember('demo-developer', true, 'demo-arbitrator', '2026-08-18T00:00:00.000Z');
    await store.startDisputeReview(dispute.id, 'demo-requester', '2026-08-18T00:00:00.000Z');
    const governance = await store.getDisputeGovernance(dispute.id, 'demo-arbitrator', '2026-08-18T00:00:30.000Z');
    expect(governance?.electorate.map((item) => item.userId)).toEqual(['demo-arbitrator', 'demo-arbitrator-2']);
    const firstVote = await store.castDisputeVote(
      dispute.id,
      'demo-arbitrator',
      'support_refund',
      '依据冻结状态与执行证据，支持争议方退款并终止任务。',
      '2026-08-18T00:01:00.000Z',
    );
    expect(firstVote.state).toBe('applied');
    if (firstVote.state === 'applied') expect(firstVote.governance.proposal?.status).toBe('active');
    expect((await store.castDisputeVote(
      dispute.id,
      'demo-arbitrator',
      'support_refund',
      '重复投票不应改变已记录的第一张选票。',
      '2026-08-18T00:01:30.000Z',
    )).state).toBe('already_voted');
    await store.setArbitrationMember('demo-arbitrator-2', false, 'demo-arbitrator', '2026-08-18T00:02:00.000Z');
    const snapshotUser = (await store.getProfile('demo-arbitrator-2'))!;
    expect((await store.listDisputes(snapshotUser)).map((item) => item.id)).toContain(dispute.id);
    const finalVote = await store.castDisputeVote(
      dispute.id,
      'demo-arbitrator-2',
      'support_refund',
      '成员停用不应追溯改变已经冻结的提案投票快照。',
      '2026-08-18T00:03:00.000Z',
    );
    expect(finalVote.state).toBe('applied');
    if (finalVote.state === 'applied') expect(finalVote.governance.proposal?.status).toBe('succeeded');
    const finalizedReplay = await store.finalizeDisputeProposal(dispute.id, 'demo-arbitrator', '2026-08-18T00:04:00.000Z');
    expect(finalizedReplay.state).toBe('finalized');
    database.db.prepare("UPDATE missions SET status = 'review' WHERE id = ?").run(dispute.missionId);
    expect((await store.acceptMission(dispute.missionId, 'demo-requester', null))?.applied).toBe(false);
    expect((await store.getEscrow(dispute.missionId))?.status).toBe('frozen');

    const first = await store.resolveDispute(dispute.id, '首次裁决生效，后续请求不能覆盖结果或重复退款。', 'resolved', 'demo-requester', null);
    const second = await store.resolveDispute(dispute.id, '迟到裁决不得生效，也不得改变首次退款结果。', 'rejected', 'demo-requester', null);

    expect(first?.applied).toBe(true);
    expect(first?.dispute.status).toBe('resolved');
    expect(second?.applied).toBe(false);
    expect(second?.dispute.status).toBe('resolved');
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE mission_id = ? AND transaction_type = 'refund'").get(dispute.missionId)).toEqual({ count: 1 });
    expect((await store.getWalletAccount('demo-requester')).balance).toBe(1_200);
    expect(database.db.prepare('SELECT COUNT(*) AS count FROM dispute_actions WHERE dispute_id = ?').get(dispute.id)).toEqual({ count: 2 });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM reward_activities WHERE dispute_id = ? AND role = 'arbitrator'").get(dispute.id)).toEqual({ count: 2 });
  });
});
