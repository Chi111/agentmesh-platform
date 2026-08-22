import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Dispute } from './contracts';
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
      ('demo-developer', 'developer@test.invalid', 'Test Developer', 'developer');

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
    await store.createAgentDispatch({
      runId,
      missionId: 'TASK-2026-0815',
      stageId: 'stage-visual',
      agentId: 'visionboard',
      expiresAt,
    });
    const update = {
      runId,
      callbackId,
      missionId: 'TASK-2026-0815',
      stageId: 'stage-visual',
      agentId: 'visionboard',
      expiresAt,
      now: '2026-08-18T12:00:00.000Z',
      status: 'done' as const,
      output: { contentHash: 'sha256:d1-atomic-callback' },
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
    await store.startDisputeReview(dispute.id, 'demo-requester');
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
  });
});
