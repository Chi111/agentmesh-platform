import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AgentFeedback, AgentMetricEvent, Deliverable, Dispute, EcosystemProposal, GovernancePowerSnapshot, MissionEvidenceSnapshot, RewardActivity, RewardClaim, RewardEpoch, YdStakingPosition } from './contracts';
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

function ipfsDeliverable(
  id: string,
  versionNo: number,
  rootCid: string,
  supersedesDeliverableId: string | null,
  supersedesRootCid: string | null,
): Deliverable {
  const manifest = {
    schema: 'agentmesh.deliverable-manifest.v1' as const,
    missionId: 'TASK-2026-0809', stageId: null, attemptNo: null, agentId: 'analyst', logicalName: `Review package v${versionNo}`,
    versionNo, supersedesRootCid, acceptanceCriteriaSha256: `sha256:${'a'.repeat(64)}`,
    createdAt: `2026-08-27T12:0${versionNo}:00.000Z`, generator: 'test/1',
    files: [{ path: 'report.json', sha256: `sha256:${'b'.repeat(64)}`, mimeType: 'application/json', byteSize: 42 }],
  };
  return {
    id, missionId: manifest.missionId, stageId: null, attemptNo: null, agentId: 'analyst', name: manifest.logicalName,
    uri: `ipfs://${rootCid}`, contentHash: `sha256:${String(versionNo).repeat(64)}`,
    mimeType: 'application/vnd.agentmesh.manifest+json', status: 'submitted', createdAt: manifest.createdAt,
    ipfsEvidence: {
      provider: 'pinme_ipfs', rootCid, manifestPath: '/manifest.json', manifestSha256: `sha256:${String(versionNo).repeat(64)}`,
      manifest, fileCount: 1, totalBytes: 42, visibility: 'public', versionNo, supersedesDeliverableId,
      scopeKey: 'mission:final', verificationStatus: 'declared', lastVerifiedAt: null, lastVerificationError: null,
    },
  };
}

describe('D1PlatformStore concurrency invariants', () => {
  let database: SqliteD1;
  let store: D1PlatformStore;

  beforeEach(() => {
    database = migratedDatabase();
    store = new D1PlatformStore(database);
  });

  it('replays pricing migrations without losing a newer price version', () => {
    database.db.prepare("UPDATE agents SET price_usdc = 0 WHERE id = 'visionboard'").run();
    const migration = readFileSync(join(import.meta.dirname, '../../db/034_versioned_pricing_quotes.sql'), 'utf8');
    const officialSeed = readFileSync(join(import.meta.dirname, '../../db/011_official_test_agents.sql'), 'utf8');

    expect(() => database.db.exec(migration)).not.toThrow();
    expect(() => database.db.exec(migration)).not.toThrow();
    expect(database.db.prepare("SELECT price_usdc FROM agents WHERE id = 'visionboard'").get()).toEqual({ price_usdc: 0.01 });
    expect(database.db.prepare("SELECT version, price_usdc FROM agent_price_versions WHERE agent_id = 'visionboard'").all()).toEqual([
      { version: 1, price_usdc: 0.01 },
    ]);

    database.db.exec(`
      UPDATE agents SET price_usdc = 99 WHERE id = 'official-evidence-scout';
      INSERT INTO agent_price_versions (id, agent_id, version, price_usdc, created_by, created_at)
      VALUES ('AGPRICE-official-evidence-scout-v2-test', 'official-evidence-scout', 2, 99, 'agentmesh-official', '2026-09-04T01:00:00.000Z');
    `);
    database.db.exec(officialSeed);
    database.db.exec(migration);
    expect(database.db.prepare("SELECT price_usdc FROM agents WHERE id = 'official-evidence-scout'").get()).toEqual({ price_usdc: 99 });
    expect(database.db.prepare("SELECT MAX(version) AS version FROM agent_price_versions WHERE agent_id = 'official-evidence-scout'").get()).toEqual({ version: 2 });
  });

  it('updates an Agent base price and its audit version atomically', async () => {
    const updated = await store.updateAgentPrice(
      'visionboard',
      'demo-developer',
      95,
      '2026-09-04T01:00:00.000Z',
      'demo-developer',
    );

    expect(updated).toMatchObject({ id: 'visionboard', price: 95, priceVersion: 2 });
    expect(database.db.prepare(`
      SELECT version, price_usdc, created_by FROM agent_price_versions
      WHERE agent_id = 'visionboard' ORDER BY version
    `).all()).toEqual([
      { version: 2, price_usdc: 95, created_by: 'demo-developer' },
    ]);
    expect(await store.updateAgentPrice('visionboard', 'demo-developer', 95, '2026-09-04T01:01:00.000Z')).toMatchObject({ priceVersion: 2 });
    expect(await store.updateAgentPrice('visionboard', 'demo-requester', 100, '2026-09-04T01:02:00.000Z')).toBeNull();
  });

  it('derives bounded load multipliers from active assignments', async () => {
    const loads = await store.getAgentLoadMultipliers(['visionboard', 'motioncraft', 'analyst']);

    expect(loads.get('visionboard')).toBe(1);
    expect(loads.get('motioncraft')).toBe(1);
    expect(loads.get('analyst')).toBe(0.9);
  });

  it('synchronizes only the authoritative external wallet for a Privy identity', async () => {
    const subject = 'did:privy:web2-wallet-sync';
    const previouslyAcceptedEmbeddedWallet = '0x7300000000000000000000000000000000008f2c';
    const created = await store.ensureIdentityProfile({
      provider: 'privy',
      subject,
      email: 'wallet-sync@example.com',
      displayName: 'Wallet Sync',
      walletAddress: previouslyAcceptedEmbeddedWallet,
      walletAddressAuthoritative: true,
    });
    expect(created.walletAddress).toBe(previouslyAcceptedEmbeddedWallet);

    const web2Only = await store.ensureIdentityProfile({
      provider: 'privy',
      subject,
      email: 'wallet-sync@example.com',
      displayName: 'Wallet Sync',
      walletAddressAuthoritative: true,
    });
    expect(web2Only.walletAddress).toBeUndefined();
    expect(database.db.prepare(`
      SELECT wallet_address FROM auth_identities WHERE provider = 'privy' AND subject = ?
    `).get(subject)).toEqual({ wallet_address: null });

    const independentlyAssignedWallet = '0x7400000000000000000000000000000000008f2c';
    database.db.prepare('UPDATE profiles SET wallet_address = ? WHERE id = ?')
      .run(independentlyAssignedWallet, web2Only.id);
    const preserved = await store.ensureIdentityProfile({
      provider: 'privy',
      subject,
      email: 'wallet-sync@example.com',
      displayName: 'Wallet Sync',
      walletAddressAuthoritative: true,
    });
    expect(preserved.walletAddress).toBe(independentlyAssignedWallet);
  });

  it('replays the visual DAG migration without changing a locked edge-less workflow', () => {
    const migration = readFileSync(join(import.meta.dirname, '../../db/016_visual_workflow_dag.sql'), 'utf8');

    expect(() => database.db.exec(migration)).not.toThrow();
    expect(database.db.prepare(`
      SELECT COUNT(*) AS count FROM workflow_edges WHERE mission_id = 'TASK-2026-0815'
    `).get()).toEqual({ count: 0 });

    database.db.prepare(`UPDATE escrows SET status = 'pending' WHERE mission_id = 'TASK-2026-0815'`).run();
    expect(() => database.db.exec(migration)).not.toThrow();
    expect(database.db.prepare(`
      SELECT COUNT(*) AS count FROM workflow_edges WHERE mission_id = 'TASK-2026-0815'
    `).get()).toEqual({ count: 1 });
  });

  it('persists only encrypted user PinMe credential envelopes', async () => {
    const credential = {
      userId: 'demo-requester',
      addressHint: '0x12345…cdef',
      ciphertext: 'encrypted-payload',
      iv: 'random-iv',
      updatedAt: '2026-08-29T00:00:00.000Z',
    };
    expect(await store.getUserPinmeCredential(credential.userId)).toBeNull();
    expect(await store.saveUserPinmeCredential(credential)).toEqual(credential);
    expect(await store.getUserPinmeCredential(credential.userId)).toEqual(credential);
    expect(await store.deleteUserPinmeCredential(credential.userId)).toBe(true);
    expect(await store.getUserPinmeCredential(credential.userId)).toBeNull();
  });

  it('persists an append-only CID version chain, acceptance snapshot and public Agent portfolio', async () => {
    const firstCid = 'bafybeie5nqv6kd3qnfjuprw2scvucpip5xwh3yluiopmqcktiamcu54bdm';
    const secondCid = 'bafybeie5nqv6kd3qnfjuprw2scvucpip3oc6zvqrgcxlqdze6dt4bdhmsy';
    const thirdCid = 'bafybeie5nqv6kd3qnfjuprw2scvucpip3oc6zvqrgcxlqdze6dt4bdhmsa';
    const first = ipfsDeliverable('DEL-IPFS-1', 1, firstCid, null, null);
    const second = ipfsDeliverable('DEL-IPFS-2', 2, secondCid, first.id, firstCid);
    const third = ipfsDeliverable('DEL-IPFS-3', 3, thirdCid, second.id, secondCid);
    await store.addDeliverable(first);
    await store.addDeliverable(second);
    await store.addDeliverable(third);
    await expect(store.addDeliverable(ipfsDeliverable('DEL-IPFS-CONFLICT', 2, secondCid, first.id, firstCid)))
      .rejects.toThrow('IPFS_VERSION_CONFLICT');
    expect((await store.listDeliverables(first.missionId)).filter((item) => item.ipfsEvidence).map((item) => item.ipfsEvidence?.versionNo)).toEqual([1, 2, 3]);

    const snapshot: MissionEvidenceSnapshot = {
      missionId: first.missionId,
      deliverables: [first, second, third].map((item) => ({
        deliverableId: item.id, stageId: null, attemptNo: null, agentId: item.agentId, name: item.name,
        rootCid: item.ipfsEvidence!.rootCid, manifestSha256: item.ipfsEvidence!.manifestSha256,
        versionNo: item.ipfsEvidence!.versionNo, verificationStatus: item.ipfsEvidence!.verificationStatus,
        createdAt: item.createdAt,
      })),
      acceptanceCriteriaSha256: `sha256:${'a'.repeat(64)}`, workflowVersion: 1, schedulerRevision: 0,
      eventWatermark: null, frozenBy: 'demo-requester', frozenAt: '2026-08-27T12:03:00.000Z',
    };
    expect((await store.acceptMission(first.missionId, 'demo-requester', null, snapshot))?.applied).toBe(true);
    expect(await store.getAcceptanceEvidenceSnapshot(first.missionId)).toEqual(snapshot);
    expect((await store.listAgentCidPortfolio('analyst')).map((item) => item.rootCid)).toEqual([thirdCid, secondCid, firstCid]);
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
    const official = agents.filter((agent) => agent.ownerId === 'agentmesh-admin');

    expect(official.map((agent) => agent.id).sort()).toEqual([
      'official-delivery-writer',
      'official-evidence-scout',
      'official-strategy-analyst',
    ]);
    expect(official.every((agent) => agent.official && agent.status === 'active')).toBe(true);
    expect(official.every((agent) => agent.endpoint.startsWith('agentmesh://builtin/'))).toBe(true);
    expect(official.every((agent) => agent.wallet === '0x73325bd3e93d9a12e5d2d5219424daf0e55f856d')).toBe(true);
  });

  it('assigns official Agent Web2 ownership and CREDIT rewards to the verified administrator email profile', async () => {
    database.db.exec(`
      INSERT INTO wallet_transactions
        (id, settlement_key, user_id, transaction_type, amount, token, mission_id, created_at)
      VALUES
        ('official-payout-before-admin', 'official-payout-before-admin', 'agentmesh-official',
         'agent_payout', 12.5, 'CREDIT', 'TASK-2026-0809', '2026-08-29T00:00:00.000Z');

      INSERT INTO reward_activities
        (id, source_key, user_id, mission_id, dispute_id, role, formula_version, asset,
         settled_amount, quality_bps, penalty_bps, score_micros, eligible, detail_json, occurred_at, created_at)
      VALUES
        ('official-reward-before-admin', 'official-reward-before-admin', 'agentmesh-official',
         'TASK-2026-0809', NULL, 'agent_owner', 'agentmesh-yd-v1', 'CREDIT',
         12.5, 10000, 0, 1000000, 1, '{}', '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z');

      UPDATE profiles
      SET display_name = 'Platform Administrator'
      WHERE id = 'agentmesh-admin';
    `);

    const official = (await store.listAgents()).filter((agent) => agent.official);
    expect(official).toHaveLength(3);
    expect(official.every((agent) => (
      agent.ownerId === 'agentmesh-admin'
      && agent.wallet === '0x73325bd3e93d9a12e5d2d5219424daf0e55f856d'
      && agent.author === 'Platform Administrator'
    ))).toBe(true);
    expect(database.db.prepare('SELECT balance FROM wallet_balances WHERE user_id = ?').get('agentmesh-official')).toEqual({ balance: 0 });
    expect(database.db.prepare('SELECT balance FROM wallet_balances WHERE user_id = ?').get('agentmesh-admin')).toEqual({ balance: 12.5 });
    expect(database.db.prepare('SELECT user_id FROM wallet_transactions WHERE id = ?').get('official-payout-before-admin')).toEqual({ user_id: 'agentmesh-admin' });
    expect(database.db.prepare('SELECT user_id FROM reward_activities WHERE id = ?').get('official-reward-before-admin')).toEqual({ user_id: 'agentmesh-admin' });
    expect(database.db.prepare('SELECT email, role, wallet_address FROM profiles WHERE id = ?').get('agentmesh-admin')).toEqual({
      email: 'chi435900020@gmail.com',
      role: 'admin',
      wallet_address: null,
    });

    const linked = await store.ensureIdentityProfile({
      provider: 'privy',
      subject: 'did:privy:google-admin',
      email: 'CHI435900020@GMAIL.COM',
      displayName: 'Google Administrator',
      walletAddressAuthoritative: true,
    });
    expect(linked.id).toBe('agentmesh-admin');
    expect(linked.role).toBe('admin');
    expect(linked.walletAddress).toBeUndefined();

    const migration = readFileSync(join(import.meta.dirname, '../../db/033_bootstrap_admin_web2_profile.sql'), 'utf8');
    expect(() => database.db.exec(migration)).not.toThrow();
    expect(() => database.db.exec(migration)).not.toThrow();
    expect(database.db.prepare('SELECT balance FROM wallet_balances WHERE user_id = ?').get('agentmesh-admin')).toEqual({ balance: 12.5 });
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

  it('keeps one fresh outbox run ID and rotates it after expiry or completion', async () => {
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

    const [refreshed] = await store.enqueueDispatches('TASK-D1-OUTBOX', ['stage-d1-outbox'], '2026-08-22T02:00:01.000Z');
    expect(refreshed.runId).not.toBe(first.runId);
    expect(refreshed.expiresAt).toBe('2026-08-22T04:00:01.000Z');
    expect(refreshed.attempts).toBe(0);

    expect(await store.claimDispatch(refreshed.id, '2026-08-22T02:00:01.000Z')).toBe(true);
    await store.completeDispatch(refreshed.id, 'done', '2026-08-22T02:01:00.000Z');
    const [rerun] = await store.enqueueDispatches('TASK-D1-OUTBOX', ['stage-d1-outbox'], '2026-08-22T02:02:00.000Z');
    expect(rerun.runId).not.toBe(refreshed.runId);
    expect(rerun.expiresAt).not.toBe(refreshed.expiresAt);
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
    expect((await store.getStageOffer(offer.id))?.quote).toMatchObject({
      amount: 100,
      formulaVersion: 'legacy.stage-budget',
    });
    expect((await store.getEscrow('TASK-OFFER-GATE'))?.amount).toBe(100);

    const staleConcurrentOffer = { ...offer, id: 'OFFER-D1-GATE-STALE-CONCURRENT' };
    expect(await store.confirmWorkflow('TASK-OFFER-GATE', [stage], ['visionboard'], [staleConcurrentOffer])).toBeNull();
    expect((await store.listStageOffers('TASK-OFFER-GATE')).map((item) => item.id)).toEqual([offer.id]);

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
    expect(database.db.prepare(`
      SELECT id, status, amount FROM stage_offer_quote_history WHERE id = ?
    `).get(offer.id)).toEqual({ id: offer.id, status: 'declined', amount: 100 });
    expect(JSON.parse(String(database.db.prepare(`
      SELECT snapshot_json FROM stage_offer_quote_history WHERE id = ?
    `).get(offer.id)?.snapshot_json))).toMatchObject({ amount: 100, formulaVersion: 'legacy.stage-budget' });
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

  it('serializes workflow saves and invitation confirmation on one workflow revision', async () => {
    database.db.exec(`
      INSERT INTO missions
        (id, requester_id, title, description, category, budget_usdc, deadline, status, progress, current_stage, team_json)
      VALUES
        ('TASK-CONFIRM-WINS', 'demo-requester', 'Confirm wins', 'Confirm wins revision race.', '图像生成', 100, '2026-09-01', 'matching', 0, 'Draft', '[]'),
        ('TASK-SAVE-WINS', 'demo-requester', 'Save wins', 'Save wins revision race.', '图像生成', 100, '2026-09-01', 'matching', 0, 'Draft', '[]');
      INSERT INTO workflow_stages
        (id, mission_id, position, name, purpose, category, budget_usdc, status, agent_id)
      VALUES
        ('stage-confirm-wins', 'TASK-CONFIRM-WINS', 1, 'Confirm stage', 'Verify confirm CAS', '图像生成', 100, 'queued', 'visionboard'),
        ('stage-save-wins', 'TASK-SAVE-WINS', 1, 'Save stage', 'Verify save CAS', '图像生成', 100, 'queued', 'visionboard');
      INSERT INTO escrows (id, mission_id, amount, token, network, payment_method, status)
      VALUES
        ('ESC-CONFIRM-WINS', 'TASK-CONFIRM-WINS', 100, 'CREDIT', 'agentmesh', 'web2_balance', 'pending'),
        ('ESC-SAVE-WINS', 'TASK-SAVE-WINS', 100, 'CREDIT', 'agentmesh', 'web2_balance', 'pending');
    `);
    const [confirmStage] = await store.listStages('TASK-CONFIRM-WINS');
    const [saveStage] = await store.listStages('TASK-SAVE-WINS');
    const offerFor = (missionId: string, stageId: string) => ({
      id: `OFFER-${missionId}`, missionId, stageId, agentId: 'visionboard', status: 'pending' as const,
      expiresAt: '2026-09-04T02:00:00.000Z', respondedAt: null,
      createdAt: '2026-09-04T01:00:00.000Z', updatedAt: '2026-09-04T01:00:00.000Z',
    });

    await expect(store.confirmWorkflow(
      'TASK-CONFIRM-WINS', [confirmStage], ['visionboard'], [offerFor('TASK-CONFIRM-WINS', confirmStage.id)], 1,
    )).resolves.toMatchObject({ workflowVersion: 2 });
    await expect(store.saveWorkflowDraft(
      'TASK-CONFIRM-WINS', [confirmStage], [], { x: 0, y: 0, zoom: 1 }, 1,
    )).resolves.toMatchObject({ state: 'version_conflict' });
    expect(await store.listStageOffers('TASK-CONFIRM-WINS')).toHaveLength(1);

    await expect(store.saveWorkflowDraft(
      'TASK-SAVE-WINS', [saveStage], [], { x: 0, y: 0, zoom: 1 }, 1,
    )).resolves.toMatchObject({ state: 'saved', mission: { workflowVersion: 2 } });
    await expect(store.confirmWorkflow(
      'TASK-SAVE-WINS', [saveStage], ['visionboard'], [offerFor('TASK-SAVE-WINS', saveStage.id)], 1,
    )).resolves.toBeNull();
    expect(await store.listStageOffers('TASK-SAVE-WINS')).toEqual([]);
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
    expect(database.db.prepare('SELECT COUNT(*) AS count, attempt_no FROM deliverables WHERE id = ?').get('DEL-D1-ATOMIC'))
      .toEqual({ count: 1, attempt_no: 1 });
    expect(database.db.prepare('SELECT status FROM workflow_dispatch_outbox WHERE id = ?').get('OUTBOX-D1-ATOMIC')).toEqual({ status: 'done' });
    expect(database.db.prepare('SELECT success_rate FROM agents WHERE id = ?').get(update.agentId)).toEqual({ success_rate: 83.3 });
    expect(database.db.prepare('SELECT processing_token, applied_at FROM agent_callback_events WHERE run_id = ? AND callback_id = ?').get(runId, callbackId)).toEqual(expect.objectContaining({ applied_at: update.now }));
  });

  it('uses the pause row as the outbox claim gate and records resume checkpoints', async () => {
    const now = '2026-08-18T13:00:00.000Z';
    database.db.prepare(`
      INSERT INTO workflow_dispatch_outbox
        (id, mission_id, stage_id, run_id, expires_at, status, attempts, next_attempt_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
    `).run('OUTBOX-PAUSE-GATE', 'TASK-2026-0815', 'stage-visual', 'run-pause-gate', '2026-08-19T00:00:00.000Z', now, now, now);

    const paused = await store.pauseMission('TASK-2026-0815', 'demo-requester', 'requester', '核对原始素材后再恢复。', now);
    expect(paused).toMatchObject({ state: 'applied', mission: { status: 'paused', pauseMode: 'requester' } });
    if (paused.state !== 'applied') throw new Error('pause should apply');
    expect(await store.listPendingDispatches(10, now)).toEqual([]);
    expect(await store.claimDispatch('OUTBOX-PAUSE-GATE', now)).toBe(false);
    expect(await store.transitionStage('TASK-2026-0815', 'stage-motion', 'queued', 'running')).toBeNull();

    const emergency = await store.pauseMission(
      'TASK-2026-0815', 'demo-arbitrator', 'emergency', '平台风险要求升级为紧急暂停。', '2026-08-18T13:02:00.000Z',
    );
    expect(emergency).toMatchObject({
      state: 'applied', mission: { status: 'paused', pauseMode: 'emergency', pauseReason: '平台风险要求升级为紧急暂停。' },
      schedulerRevision: 2,
    });
    expect((await store.resumeMission(
      'TASK-2026-0815', 'demo-requester', 'requester', paused.schedulerRevision, '2026-08-18T13:03:00.000Z',
    )).state).toBe('invalid');
    if (emergency.state !== 'applied') throw new Error('emergency escalation should apply');

    const resumed = await store.resumeMission(
      'TASK-2026-0815', 'demo-arbitrator', 'emergency', emergency.schedulerRevision, '2026-08-18T13:05:00.000Z',
    );
    expect(resumed).toMatchObject({ state: 'applied', mission: { status: 'running' } });
    expect(await store.listPendingDispatches(10, '2026-08-18T13:05:00.000Z')).toContainEqual(expect.objectContaining({ id: 'OUTBOX-PAUSE-GATE', runId: 'run-pause-gate' }));
    expect(await store.transitionStage('TASK-2026-0815', 'stage-motion', 'queued', 'running')).toMatchObject({ status: 'running' });
    expect(await store.transitionStage('TASK-2026-0815', 'stage-motion', 'queued', 'running')).toBeNull();
    expect((await store.listWorkflowCheckpoints('TASK-2026-0815')).map((item) => item.kind)).toEqual(['resume', 'pause', 'pause']);
  });

  it('does not let a stale resume clear a newer pause with the same mode', async () => {
    const firstPause = await store.pauseMission(
      'TASK-2026-0815', 'demo-requester', 'requester', '第一次暂停。', '2026-08-18T13:10:00.000Z',
    );
    expect(firstPause.state).toBe('applied');
    if (firstPause.state !== 'applied') throw new Error('first pause should apply');

    expect((await store.resumeMission(
      'TASK-2026-0815', 'demo-requester', 'requester', firstPause.schedulerRevision, '2026-08-18T13:11:00.000Z',
    )).state).toBe('applied');
    const secondPause = await store.pauseMission(
      'TASK-2026-0815', 'demo-requester', 'requester', '新的风险要求再次暂停。', '2026-08-18T13:12:00.000Z',
    );
    expect(secondPause).toMatchObject({ state: 'applied', mission: { status: 'paused', pauseReason: '新的风险要求再次暂停。' } });

    const staleResume = await store.resumeMission(
      'TASK-2026-0815', 'demo-requester', 'requester', firstPause.schedulerRevision, '2026-08-18T13:13:00.000Z',
    );
    expect(staleResume.state).toBe('invalid');
    expect(await store.getMission('TASK-2026-0815')).toMatchObject({
      status: 'paused', pauseReason: '新的风险要求再次暂停。',
    });
  });

  it('rejects a late callback after a versioned stage attempt replaces its run', async () => {
    const runId = 'run-stale-attempt';
    const expiresAt = '2026-08-19T00:00:00.000Z';
    await store.createAgentDispatch({ runId, missionId: 'TASK-2026-0815', stageId: 'stage-visual', agentId: 'visionboard', expiresAt });
    database.db.prepare(`
      INSERT INTO workflow_dispatch_outbox
        (id, mission_id, stage_id, run_id, expires_at, status, attempts, next_attempt_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'processing', 1, ?, ?, ?)
    `).run(
      'OUTBOX-D1-STALE', 'TASK-2026-0815', 'stage-visual', runId, expiresAt,
      '2026-08-18T13:59:00.000Z', '2026-08-18T13:59:00.000Z', '2026-08-18T13:59:00.000Z',
    );
    await store.updateStage('TASK-2026-0815', 'stage-visual', 'failed', { summary: '旧 attempt 失败' });
    const paused = await store.pauseMission(
      'TASK-2026-0815', 'demo-requester', 'requester', '创建安全返工版本。', '2026-08-18T14:00:00.000Z',
    );
    expect(paused.state).toBe('applied');
    const changed = await store.applyMissionChangeRequest({
      id: 'CHANGE-D1-STALE', missionId: 'TASK-2026-0815', targetStageIds: ['stage-visual'], resetStageIds: ['stage-visual'],
      reason: '重新生成视觉产物。', acceptanceCriteria: '新产物必须通过独立核验。',
      requestedBy: 'demo-requester', createdAt: '2026-08-18T14:01:00.000Z',
    });
    expect(changed).toMatchObject({ state: 'applied', changeRequest: { version: 1 } });
    expect(changed.state === 'applied' && changed.changeRequest.priorStageState[0]).toMatchObject({
      input: expect.any(Object), output: { summary: '旧 attempt 失败' },
    });
    expect((await store.listStages('TASK-2026-0815')).find((stage) => stage.id === 'stage-visual')).toMatchObject({
      attemptNo: 2,
      status: 'queued',
      input: { rework: { changeRequestId: 'CHANGE-D1-STALE', reason: '重新生成视觉产物。', isTarget: true } },
    });
    expect(database.db.prepare('SELECT status FROM workflow_dispatch_outbox WHERE id = ?').get('OUTBOX-D1-STALE')).toEqual({ status: 'done' });

    expect((await store.resumeMission(
      'TASK-2026-0815', 'demo-requester', 'requester',
      changed.state === 'applied' ? changed.schedulerRevision : -1, '2026-08-18T14:01:30.000Z',
    )).state).toBe('applied');
    await store.enqueueDispatches('TASK-2026-0815', ['stage-visual'], '2026-08-18T14:01:31.000Z');
    expect(database.db.prepare('SELECT status, run_id FROM workflow_dispatch_outbox WHERE id = ?').get('OUTBOX-D1-STALE')).toEqual({
      status: 'pending', run_id: expect.not.stringMatching(/^run-stale-attempt$/),
    });

    const late = await store.applyAgentCallback({
      runId, callbackId: 'late-old-attempt', missionId: 'TASK-2026-0815', stageId: 'stage-visual', agentId: 'visionboard',
      expiresAt, now: '2026-08-18T14:02:00.000Z', status: 'done', output: { summary: '不应覆盖新版本' },
      currentStage: '旧版回调', event: {
        id: 'EVT-LATE-OLD-ATTEMPT', missionId: 'TASK-2026-0815', stageId: 'stage-visual', type: 'stage.done',
        message: '旧 run 迟到', actorType: 'agent', actorId: 'visionboard', payload: {}, createdAt: '2026-08-18T14:02:00.000Z',
      },
    });
    expect(late.state).toBe('invalid');
    expect((await store.listStages('TASK-2026-0815')).find((stage) => stage.id === 'stage-visual')).toMatchObject({ attemptNo: 2, status: 'queued', output: null });
  });

  it('atomically recovers an expired current run for exactly one fresh dispatch', async () => {
    const runId = 'run-expired-current-attempt';
    const expiresAt = '2026-08-18T13:00:00.000Z';
    await store.createAgentDispatch({ runId, missionId: 'TASK-2026-0815', stageId: 'stage-visual', agentId: 'visionboard', expiresAt });
    database.db.prepare(`
      INSERT INTO workflow_dispatch_outbox
        (id, mission_id, stage_id, run_id, expires_at, status, attempts, next_attempt_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'done', 1, ?, ?, ?)
    `).run(
      'OUTBOX-D1-EXPIRED-CURRENT', 'TASK-2026-0815', 'stage-visual', runId, expiresAt,
      expiresAt, '2026-08-18T12:00:00.000Z', expiresAt,
    );
    const recoveredAt = '2026-08-18T14:00:00.000Z';

    expect(await store.recoverExpiredStageDispatches('TASK-2026-0815', recoveredAt)).toEqual(['stage-visual']);
    expect(await store.recoverExpiredStageDispatches('TASK-2026-0815', recoveredAt)).toEqual([]);
    expect((await store.listStages('TASK-2026-0815')).find((stage) => stage.id === 'stage-visual')).toMatchObject({
      status: 'queued', progress: 0, output: null, attemptNo: 1,
    });
    expect(database.db.prepare(`
      SELECT status, run_id, started_at, completed_at FROM workflow_stage_attempts
      WHERE mission_id = ? AND stage_id = ? AND is_current = 1
    `).get('TASK-2026-0815', 'stage-visual')).toEqual({ status: 'queued', run_id: null, started_at: null, completed_at: null });
    expect(database.db.prepare('SELECT completed_at FROM agent_dispatches WHERE run_id = ?').get(runId)).toEqual({ completed_at: recoveredAt });

    const [fresh] = await store.enqueueDispatches('TASK-2026-0815', ['stage-visual'], recoveredAt);
    expect(fresh).toMatchObject({ status: 'pending', expiresAt: '2026-08-18T16:00:00.000Z' });
    expect(fresh.runId).not.toBe(runId);
    const [duplicate] = await store.enqueueDispatches('TASK-2026-0815', ['stage-visual'], '2026-08-18T14:00:01.000Z');
    expect(duplicate.runId).toBe(fresh.runId);
  });

  it('returns the current attempt metadata after progress and terminal stage updates', async () => {
    await store.updateStage('TASK-2026-0815', 'stage-visual', 'failed', { summary: 'Attempt one failed' });
    const paused = await store.pauseMission(
      'TASK-2026-0815', 'demo-requester', 'requester', 'Prepare a second attempt.', '2026-08-18T14:03:00.000Z',
    );
    expect(paused.state).toBe('applied');
    const changed = await store.applyMissionChangeRequest({
      id: 'CHANGE-D1-RETURN-ATTEMPT', missionId: 'TASK-2026-0815', targetStageIds: ['stage-visual'],
      resetStageIds: ['stage-visual'], reason: 'Retry with current attempt metadata.',
      acceptanceCriteria: 'Return attempt two from every Store mutation.', requestedBy: 'demo-requester',
      createdAt: '2026-08-18T14:03:01.000Z',
    });
    expect(changed.state).toBe('applied');
    if (changed.state !== 'applied') throw new Error('change request should apply');
    expect((await store.resumeMission(
      'TASK-2026-0815', 'demo-requester', 'requester', changed.schedulerRevision, '2026-08-18T14:03:02.000Z',
    )).state).toBe('applied');
    expect(await store.claimStageForDispatch('TASK-2026-0815', 'stage-visual')).toMatchObject({ attemptNo: 2, status: 'running' });

    expect(await store.setStageProgress('TASK-2026-0815', 'stage-visual', 45)).toMatchObject({
      attemptNo: 2, status: 'running', progress: 45,
      input: { rework: { changeRequestId: 'CHANGE-D1-RETURN-ATTEMPT', isTarget: true } },
    });
    expect(await store.transitionRunningStage('TASK-2026-0815', 'stage-visual', 'failed', { summary: 'Attempt two failed' })).toMatchObject({
      attemptNo: 2, status: 'failed', output: { summary: 'Attempt two failed' },
    });
  });

  it('persists one transition checkpoint per edge and current source attempt', async () => {
    database.db.prepare("UPDATE escrows SET status = 'pending' WHERE mission_id = ?").run('TASK-2026-0815');
    database.db.prepare(`
      INSERT INTO workflow_edges (id, mission_id, source_stage_id, target_stage_id, created_at)
      VALUES ('EDGE-D1-TRANSITION', 'TASK-2026-0815', 'stage-visual', 'stage-motion', '2026-08-18T14:04:00.000Z')
    `).run();
    database.db.prepare(`
      INSERT INTO workflow_edge_rules (edge_id, mission_id, condition_json, mappings_json, created_at, updated_at)
      VALUES ('EDGE-D1-TRANSITION', 'TASK-2026-0815', NULL, ?, '2026-08-18T14:04:00.000Z', '2026-08-18T14:04:00.000Z')
    `).run(JSON.stringify([{ from: '/evidence/hash', to: '/request/hash', required: true }]));
    database.db.prepare("UPDATE escrows SET status = 'held' WHERE mission_id = ?").run('TASK-2026-0815');
    await store.updateStage('TASK-2026-0815', 'stage-visual', 'done', { summary: 'Source complete', evidence: { hash: 'abc' } });
    const edge = (await store.listEdges('TASK-2026-0815')).find((candidate) => candidate.sourceStageId === 'stage-visual');
    expect(edge).toBeDefined();
    const checkpoint = {
      id: 'TRANSITION-D1-1', missionId: 'TASK-2026-0815', edgeId: edge!.id,
      sourceStageId: 'stage-visual', targetStageId: 'stage-motion', sourceAttemptNo: 1,
      workflowVersion: 1, matched: true, mappedInput: { request: { hash: 'abc' } },
      missingRequired: [], errorCode: null, createdAt: '2026-08-18T14:05:00.000Z',
    };

    expect(await store.claimStageForDispatch('TASK-2026-0815', 'stage-motion')).toBeNull();
    expect(await store.recordWorkflowTransition(checkpoint)).toMatchObject({ applied: true, checkpoint });
    expect(await store.claimStageForDispatch('TASK-2026-0815', 'stage-motion')).toMatchObject({ status: 'running' });
    expect(await store.recordWorkflowTransition({ ...checkpoint, id: 'TRANSITION-D1-REPLAY' })).toMatchObject({
      applied: false, checkpoint: { id: checkpoint.id, mappedInput: checkpoint.mappedInput },
    });
    expect(await store.listWorkflowTransitions('TASK-2026-0815')).toEqual([checkpoint]);
    expect(await store.listCurrentWorkflowTransitions('TASK-2026-0815')).toEqual([checkpoint]);
    await expect(store.recordWorkflowTransition({ ...checkpoint, id: 'TRANSITION-D1-STALE', sourceAttemptNo: 2 }))
      .rejects.toThrow('WORKFLOW_TRANSITION_CONFLICT');

    database.db.prepare('UPDATE workflow_stage_attempts SET is_current = 0 WHERE stage_id = ?').run('stage-visual');
    database.db.prepare(`
      INSERT INTO workflow_stage_attempts
        (id, mission_id, stage_id, attempt_no, status, input_json, output_json, is_current, created_at, updated_at)
      SELECT 'ATTEMPT-D1-TRANSITION-2', mission_id, id, 2, status, input_json, output_json, 1,
        '2026-08-18T14:06:00.000Z', '2026-08-18T14:06:00.000Z'
      FROM workflow_stages WHERE id = 'stage-visual'
    `).run();
    expect(await store.recordWorkflowTransition({ ...checkpoint, id: 'TRANSITION-D1-LATE-REPLAY' })).toMatchObject({
      applied: false, checkpoint: { id: checkpoint.id },
    });
    expect(await store.listCurrentWorkflowTransitions('TASK-2026-0815')).toEqual([]);
    expect(await store.listWorkflowTransitions('TASK-2026-0815')).toEqual([checkpoint]);
    await expect(store.addDeliverable({
      id: 'DEL-D1-STALE-ATTEMPT', missionId: 'TASK-2026-0815', stageId: 'stage-visual', attemptNo: 1,
      agentId: 'visionboard', name: 'Stale attempt artifact', uri: 'ipfs://bafystalestageartifact',
      contentHash: `sha256:${'d'.repeat(64)}`, mimeType: 'application/json', status: 'submitted',
      createdAt: '2026-08-18T14:06:01.000Z',
    })).rejects.toThrow('STALE_STAGE_ATTEMPT');
    expect(await store.addDeliverable({
      id: 'DEL-D1-CURRENT-ATTEMPT', missionId: 'TASK-2026-0815', stageId: 'stage-visual', attemptNo: 2,
      agentId: 'visionboard', name: 'Current attempt artifact', uri: 'ipfs://bafycurrentstageartifact',
      contentHash: `sha256:${'e'.repeat(64)}`, mimeType: 'application/json', status: 'submitted',
      createdAt: '2026-08-18T14:06:02.000Z',
    })).toMatchObject({ attemptNo: 2 });
  });

  it('stores owner-private immutable workflow template versions', async () => {
    const sourceNodes = (await store.listStages('TASK-2026-0815')).map((stage, index) => ({
      ...stage,
      id: `NODE-${index + 1}`,
      missionId: 'TEMPLATE-D1-1',
      position: index + 1,
      status: 'queued' as const,
      agentId: null,
      output: null,
    }));
    const sourceEdges = [{
      id: 'EDGE-1', missionId: 'TEMPLATE-D1-1',
      sourceStageId: sourceNodes[0].id, targetStageId: sourceNodes[1].id,
      mappings: [{ from: '/summary', to: '/research/summary', required: true }],
      createdAt: '2026-08-18T14:06:00.000Z',
    }];
    const input = {
      id: 'TEMPLATE-D1-1', ownerId: 'demo-requester', name: 'D1 research flow', description: 'Versioned D1 fixture',
      nodes: sourceNodes, edges: sourceEdges, entryIds: [sourceNodes[0].id], exitIds: [sourceNodes[1].id],
      contentHash: `sha256:${'a'.repeat(64)}`, createdAt: '2026-08-18T14:06:00.000Z',
    };

    expect(await store.saveWorkflowTemplateVersion(input)).toMatchObject({
      state: 'saved', detail: { template: { id: input.id, currentVersion: 1 }, version: { version: 1 } },
    });
    expect(await store.saveWorkflowTemplateVersion({ ...input, createdAt: '2026-08-18T14:06:30.000Z' })).toMatchObject({
      state: 'unchanged', detail: { version: { version: 1 } },
    });
    expect(await store.saveWorkflowTemplateVersion({
      ...input,
      description: 'Metadata-only second revision',
      createdAt: '2026-08-18T14:06:45.000Z',
    })).toMatchObject({
      state: 'saved', detail: { template: { currentVersion: 2 }, version: { version: 2, contentHash: input.contentHash } },
    });
    expect(await store.saveWorkflowTemplateVersion({
      ...input,
      description: 'Third immutable revision',
      contentHash: `sha256:${'b'.repeat(64)}`,
      createdAt: '2026-08-18T14:07:00.000Z',
    })).toMatchObject({
      state: 'saved', detail: { template: { currentVersion: 3 }, version: { version: 3 } },
    });
    expect(await store.saveWorkflowTemplateVersion({
      ...input,
      description: 'Historical content promoted again',
      createdAt: '2026-08-18T14:07:30.000Z',
    })).toMatchObject({
      state: 'saved', detail: { template: { currentVersion: 4 }, version: { version: 4, contentHash: input.contentHash } },
    });
    expect(await store.getWorkflowTemplate('demo-requester', input.id, 1)).toMatchObject({
      template: { currentVersion: 4 }, version: { version: 1, contentHash: input.contentHash },
    });
    expect(await store.getWorkflowTemplate('demo-requester', input.id)).toMatchObject({
      template: { description: 'Historical content promoted again' }, version: { version: 4 },
    });
    expect(await store.getWorkflowTemplate('demo-developer', input.id)).toBeNull();
    expect(await store.listWorkflowTemplates('demo-requester')).toHaveLength(1);
  });

  it('keeps review-state dirty checkpoints recoverable', async () => {
    database.db.prepare(`
      INSERT INTO mission_runtime_controls
        (mission_id, scheduler_revision, scheduler_state, updated_at)
      VALUES (?, 7, 'dirty', '2026-08-18T14:08:00.000Z')
    `).run('TASK-2026-0809');

    expect(await store.listDirtyMissionControls()).toContainEqual({
      missionId: 'TASK-2026-0809', schedulerRevision: 7,
    });
  });

  it('atomically replaces only an expected running approval Gate during versioned rework', async () => {
    database.db.prepare("UPDATE escrows SET status = 'pending' WHERE mission_id = ?").run('TASK-2026-0815');
    database.db.prepare(`
      INSERT INTO workflow_stages
        (id, mission_id, position, node_type, name, purpose, category, budget_usdc, status, agent_id, input_json)
      VALUES (?, ?, 3, 'approval', 'Review gate', 'Approve current evidence', '人工审批', 0, 'running', NULL, '{}')
    `).run('stage-review-gate', 'TASK-2026-0815');
    database.db.prepare("UPDATE escrows SET status = 'held' WHERE mission_id = ?").run('TASK-2026-0815');
    await store.updateStage('TASK-2026-0815', 'stage-motion', 'done', { summary: '需要 Gate 返工的上游输出' });
    expect((await store.pauseMission(
      'TASK-2026-0815', 'demo-requester', 'requester', '原子创建 Gate 返工版本。', '2026-08-18T14:10:00.000Z',
    )).state).toBe('applied');

    const unsafeTaskException = await store.applyMissionChangeRequest({
      id: 'CHANGE-D1-UNSAFE-TASK', missionId: 'TASK-2026-0815', targetStageIds: ['stage-motion'],
      resetStageIds: ['stage-motion', 'stage-visual'], expectedRunningStageIds: ['stage-visual'],
      reason: '不应替换在途任务。', acceptanceCriteria: '在途任务必须保持当前 attempt。',
      requestedBy: 'demo-requester', createdAt: '2026-08-18T14:10:30.000Z',
    });
    expect(unsafeTaskException.state).toBe('invalid');
    expect((await store.listStages('TASK-2026-0815')).find((stage) => stage.id === 'stage-visual')).toMatchObject({
      nodeType: 'task', status: 'running', attemptNo: 1,
    });

    const changed = await store.applyMissionChangeRequest({
      id: 'CHANGE-D1-GATE', missionId: 'TASK-2026-0815', targetStageIds: ['stage-motion'],
      resetStageIds: ['stage-motion', 'stage-review-gate'], expectedRunningStageIds: ['stage-review-gate'],
      reason: 'Gate 驳回后重跑上游与审批阶段。', acceptanceCriteria: '新版输出需要重新通过审批。',
      requestedBy: 'demo-requester', createdAt: '2026-08-18T14:11:00.000Z',
    });

    expect(changed).toMatchObject({ state: 'applied', changeRequest: { version: 1 } });
    expect(await store.listStages('TASK-2026-0815')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'stage-motion', status: 'queued', attemptNo: 2,
        input: expect.objectContaining({ rework: expect.objectContaining({ isTarget: true, acceptanceCriteria: '新版输出需要重新通过审批。' }) }),
      }),
      expect.objectContaining({
        id: 'stage-review-gate', nodeType: 'approval', status: 'queued', attemptNo: 2,
        input: expect.objectContaining({ rework: expect.objectContaining({ isTarget: false, targetStageIds: ['stage-motion'] }) }),
      }),
    ]));
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

  it('replays the mission runtime migration without duplicating controls or attempts', () => {
    database.db.prepare(`
      INSERT INTO agent_dispatches (run_id, mission_id, stage_id, agent_id, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'run-active-during-migration', 'TASK-2026-0815', 'stage-visual', 'visionboard',
      '2026-08-19T00:00:00.000Z', '2026-08-18T12:00:00.000Z',
    );
    const migration = readFileSync(join(import.meta.dirname, '../../db/021_mission_runtime_control.sql'), 'utf8');
    database.db.exec(migration);
    database.db.exec(migration);
    expect(database.db.prepare('SELECT COUNT(*) AS count FROM mission_runtime_controls WHERE mission_id = ?').get('TASK-2026-0815')).toEqual({ count: 1 });
    expect(database.db.prepare('SELECT COUNT(*) AS count FROM workflow_stage_attempts WHERE stage_id = ? AND is_current = 1').get('stage-visual')).toEqual({ count: 1 });
    expect(database.db.prepare('SELECT run_id FROM workflow_stage_attempts WHERE stage_id = ? AND is_current = 1').get('stage-visual')).toEqual({
      run_id: 'run-active-during-migration',
    });
  });

  it('replays manual Trial overrides without replacing a newer Agent state', () => {
    database.db.exec(`
      INSERT INTO agents
        (id, owner_id, name, category, summary, endpoint_url, price_usdc, wallet_address, status, author_name, updated_at)
      VALUES
        ('mastra-workflow-bridge', 'demo-developer', 'Mastra Workflow Bridge', '软件开发', 'Manual Trial fixture',
         'https://agents.test.invalid/mastra', 1, '0x2200000000000000000000000000000000009b11', 'active', 'Test Developer', '2026-08-28 00:00:00'),
        ('deepseek-chill-coding-agent', 'demo-developer', 'DeepSeek Chill Coding Agent', '软件开发', 'Manual Trial fixture',
         'https://agents.test.invalid/deepseek', 10, '0x2200000000000000000000000000000000009b12', 'active', 'Test Developer', '2026-08-28 00:00:00');

      INSERT INTO agent_versions
        (id, agent_id, version, endpoint_url, auth_type, created_at)
      SELECT 'AGVER-' || id || '-v1-0-0', id, 'v1.0.0', endpoint_url, 'none', '2026-08-28 00:00:00'
      FROM agents WHERE id IN ('mastra-workflow-bridge', 'deepseek-chill-coding-agent');

      INSERT INTO agent_stats (agent_id, marketplace_status, payout_valid, eligibility_reasons_json, updated_at)
      SELECT id, 'registered', 1, '["正式 Trial 尚未通过","Endpoint 最近 24 小时无健康记录"]', '2026-08-28 00:00:00'
      FROM agents WHERE id IN ('mastra-workflow-bridge', 'deepseek-chill-coding-agent');
    `);
    const migration = readFileSync(join(import.meta.dirname, '../../db/027_manual_trial_overrides.sql'), 'utf8');
    database.db.exec(migration);
    database.db.exec(migration);

    for (const agentId of ['mastra-workflow-bridge', 'deepseek-chill-coding-agent']) {
      expect(database.db.prepare('SELECT trust_score, status FROM agents WHERE id = ?').get(agentId)).toEqual({ trust_score: 7.5, status: 'active' });
      expect(database.db.prepare('SELECT COUNT(*) AS count FROM agent_trials WHERE agent_id = ?').get(agentId)).toEqual({ count: 1 });
      expect(database.db.prepare("SELECT COUNT(*) AS count FROM agent_metric_events WHERE agent_id = ? AND event_type = 'trial_passed'").get(agentId)).toEqual({ count: 1 });
      expect(database.db.prepare('SELECT trial_passed, endpoint_healthy, last_trial_at FROM agent_stats WHERE agent_id = ?').get(agentId)).toEqual({
        trial_passed: 1, endpoint_healthy: 0, last_trial_at: '2026-08-29 04:34:00',
      });
    }

    database.db.prepare("UPDATE agent_stats SET marketplace_status = 'suspended' WHERE agent_id = ?").run('mastra-workflow-bridge');
    const healthMigration = readFileSync(join(import.meta.dirname, '../../db/028_restore_launch_agent_health.sql'), 'utf8');
    database.db.exec(healthMigration);
    database.db.exec(healthMigration);
    for (const agentId of ['mastra-workflow-bridge', 'deepseek-chill-coding-agent']) {
      expect(database.db.prepare('SELECT COUNT(*) AS count FROM agent_health_checks WHERE agent_id = ?').get(agentId)).toEqual({ count: 1 });
      expect(database.db.prepare("SELECT COUNT(*) AS count FROM agent_metric_events WHERE agent_id = ? AND event_type = 'endpoint_healthy'").get(agentId)).toEqual({ count: 1 });
      expect(database.db.prepare('SELECT endpoint_healthy, last_health_check_at FROM agent_stats WHERE agent_id = ?').get(agentId)).toEqual({
        endpoint_healthy: 1, last_health_check_at: '2026-08-29 04:38:24',
      });
    }
    expect(database.db.prepare('SELECT marketplace_status FROM agent_stats WHERE agent_id = ?').get('mastra-workflow-bridge')).toEqual({ marketplace_status: 'degraded' });
    expect(database.db.prepare("SELECT COUNT(*) AS count FROM agent_metric_events WHERE agent_id = ? AND event_type = 'admin_adjustment'").get('mastra-workflow-bridge')).toEqual({ count: 1 });

    database.db.prepare("UPDATE agents SET trust_score = 9, status = 'paused', updated_at = '2026-08-30 00:00:00' WHERE id = ?").run('mastra-workflow-bridge');
    database.db.prepare("UPDATE agent_stats SET marketplace_status = 'listed', last_trial_at = '2026-08-30 00:00:00', last_health_check_at = '2026-08-30 00:00:00', updated_at = '2026-08-30 00:00:00' WHERE agent_id = ?").run('mastra-workflow-bridge');
    database.db.exec(migration);
    database.db.exec(healthMigration);
    expect(database.db.prepare('SELECT trust_score, status FROM agents WHERE id = ?').get('mastra-workflow-bridge')).toEqual({ trust_score: 9, status: 'paused' });
    expect(database.db.prepare('SELECT last_trial_at FROM agent_stats WHERE agent_id = ?').get('mastra-workflow-bridge')).toEqual({ last_trial_at: '2026-08-30 00:00:00' });
    expect(database.db.prepare('SELECT marketplace_status, last_health_check_at FROM agent_stats WHERE agent_id = ?').get('mastra-workflow-bridge')).toEqual({
      marketplace_status: 'listed', last_health_check_at: '2026-08-30 00:00:00',
    });
  });

  it('replays advanced workflow metadata while preserving immutable rows', () => {
    const migration = readFileSync(join(import.meta.dirname, '../../db/022_advanced_workflow.sql'), 'utf8');
    database.db.exec(migration);
    database.db.exec(migration);
    expect(database.db.prepare(`
      SELECT COUNT(*) AS count FROM workflow_edge_rules WHERE mission_id = ?
    `).get('TASK-2026-0815')).toEqual(database.db.prepare(`
      SELECT COUNT(*) AS count FROM workflow_edges WHERE mission_id = ?
    `).get('TASK-2026-0815'));
    database.db.prepare(`
      INSERT INTO workflow_templates (id, owner_id, name, description, current_version, created_at, updated_at)
      VALUES ('TEMPLATE-IMMUTABLE', 'demo-requester', 'Immutable fixture', '', 1, ?, ?)
    `).run('2026-08-18T14:03:00.000Z', '2026-08-18T14:03:00.000Z');
    database.db.prepare(`
      INSERT INTO workflow_template_versions
        (template_id, version, nodes_json, edges_json, entry_ids_json, exit_ids_json, content_hash, created_at)
      VALUES ('TEMPLATE-IMMUTABLE', 1, '[]', '[]', '[]', '[]', ?, ?)
    `).run(`sha256:${'f'.repeat(64)}`, '2026-08-18T14:03:00.000Z');
    expect(() => database.db.prepare(`
      UPDATE workflow_template_versions SET content_hash = ? WHERE template_id = ?
    `).run(`sha256:${'e'.repeat(64)}`, 'TEMPLATE-IMMUTABLE')).toThrow('WORKFLOW_TEMPLATE_VERSION_IMMUTABLE');
  });

  it('replays the deliverable-attempt migration without losing attempt identity', () => {
    database.db.prepare(`
      UPDATE workflow_stage_attempts SET is_current = 0, updated_at = ?
      WHERE mission_id = ? AND stage_id = ? AND is_current = 1
    `).run('2026-08-18T13:00:00.000Z', 'TASK-2026-0815', 'stage-visual');
    database.db.prepare(`
      INSERT INTO workflow_stage_attempts
        (id, mission_id, stage_id, attempt_no, status, input_json, output_json, is_current, created_at, updated_at)
      VALUES (?, ?, ?, 2, 'done', '{}', '{}', 1, ?, ?)
    `).run(
      'ATTEMPT-replay-2', 'TASK-2026-0815', 'stage-visual',
      '2026-08-18T13:00:00.000Z', '2026-08-18T13:00:00.000Z',
    );
    database.db.prepare(`
      INSERT INTO deliverables
        (id, mission_id, stage_id, attempt_no, agent_id, name, uri, content_hash, mime_type, status, created_at)
      VALUES (?, ?, ?, 2, ?, ?, ?, ?, ?, 'submitted', ?)
    `).run(
      'DELIVERABLE-attempt-2', 'TASK-2026-0815', 'stage-visual', 'visionboard', 'Attempt two result',
      'https://example.test/attempt-2.json', `sha256:${'2'.repeat(64)}`, 'application/json', '2026-08-18T14:00:00.000Z',
    );
    database.db.prepare(`
      INSERT INTO deliverables
        (id, mission_id, stage_id, attempt_no, agent_id, name, uri, content_hash, mime_type, status, created_at)
      VALUES (?, ?, NULL, NULL, NULL, ?, ?, ?, ?, 'submitted', ?)
    `).run(
      'DELIVERABLE-mission-level', 'TASK-2026-0815', 'Mission result',
      'https://example.test/mission.json', `sha256:${'3'.repeat(64)}`, 'application/json', '2026-08-18T14:01:00.000Z',
    );

    const migration = readFileSync(join(import.meta.dirname, '../../db/023_deliverable_attempts.sql'), 'utf8');
    database.db.exec(migration);
    database.db.exec(migration);

    expect(database.db.prepare('SELECT attempt_no FROM deliverables WHERE id = ?').get('DELIVERABLE-attempt-2')).toEqual({ attempt_no: 2 });
    expect(database.db.prepare('SELECT attempt_no FROM deliverables WHERE id = ?').get('DELIVERABLE-mission-level')).toEqual({ attempt_no: null });
    expect(database.db.prepare('SELECT COUNT(*) AS count FROM deliverables').get()).toEqual({ count: 2 });
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

    expect((await store.queueDisputeExecution(
      dispute.id, 'demo-arbitrator', '2026-08-18T00:05:00.000Z', false,
    )).state).toBe('not_ready');
    expect((await store.queueDisputeExecution(
      dispute.id, 'demo-arbitrator', '2026-08-22T00:05:00.000Z', false,
    )).state).toBe('queued');

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

  it('persists immutable Power rounds and one expanded-council appeal', async () => {
    const migration = readFileSync(join(import.meta.dirname, '../../db/024_power_arbitration_appeals.sql'), 'utf8');
    database.db.exec(migration);
    database.db.exec(migration);
    database.db.exec(`
      UPDATE arbitration_members SET power = 2 WHERE user_id = 'demo-arbitrator';
      UPDATE arbitration_members SET power = 5 WHERE user_id = 'demo-arbitrator-2';
      INSERT INTO profiles (id, email, display_name, role)
      VALUES ('demo-arbitrator-3', 'arbitrator-3@test.invalid', 'Test Arbitrator Three', 'requester');
    `);
    const dispute: Dispute = {
      id: 'DSP-D1-POWER-APPEAL', missionId: 'TASK-2026-0815', openedBy: 'demo-requester',
      reason: '验证 Power 提案、冻结快照、扩大委员上诉和最终执行队列。', evidence: [], status: 'open',
      resolution: null, freezeTxHash: null, resolutionTxHash: null,
      createdAt: '2026-08-18T01:00:00.000Z', resolvedAt: null,
    };
    await store.createDispute(dispute);
    await store.startDisputeReview(dispute.id, 'demo-arbitrator', '2026-08-18T01:00:00.000Z', 'power');
    const initial = await store.getDisputeGovernance(dispute.id, 'demo-arbitrator-2', '2026-08-18T01:00:01.000Z');
    expect(initial?.proposal).toMatchObject({ round: 0, weightVersion: 'member_power.v1', eligibleWeight: 7, quorumRequired: 5 });
    expect(initial?.electorate.find((member) => member.userId === 'demo-arbitrator-2')).toMatchObject({ powerSnapshot: 5, voteWeight: 5 });
    const firstVote = await store.castDisputeVote(
      dispute.id, 'demo-arbitrator-2', 'support_refund', '高 Power 委员依据冻结证据支持退款。', '2026-08-18T01:01:00.000Z',
    );
    expect(firstVote.state).toBe('applied');
    if (firstVote.state === 'applied') expect(firstVote.governance.proposal?.status).toBe('succeeded');

    await store.setArbitrationMember('demo-arbitrator-2', true, 'demo-arbitrator', '2026-08-18T01:02:00.000Z', 9);
    await store.setArbitrationMember('demo-arbitrator-3', true, 'demo-arbitrator', '2026-08-18T01:02:00.000Z', 3);
    const appeal = await store.createDisputeAppeal(
      dispute.id, 'demo-requester', '首轮证据解释存在重大分歧，请扩大委员会重新审查任务交付。', '2026-08-18T01:03:00.000Z',
    );
    expect(appeal.state).toBe('created');
    if (appeal.state !== 'created') return;
    expect(appeal.governance.rounds).toHaveLength(2);
    expect(appeal.governance.rounds[0].electorate.find((member) => member.userId === 'demo-arbitrator-2')).toMatchObject({ voteWeight: 5 });
    expect(appeal.governance.electorate.find((member) => member.userId === 'demo-arbitrator-2')).toMatchObject({ voteWeight: 9 });
    expect(appeal.governance.electorate.find((member) => member.userId === 'demo-arbitrator-3')).toMatchObject({ voteWeight: 3 });
    expect((await store.createDisputeAppeal(
      dispute.id, 'demo-requester', '第二次上诉必须被唯一轮次约束拒绝且不得覆盖历史。', '2026-08-18T01:04:00.000Z',
    )).state).toBe('already_appealed');
    expect((await store.queueDisputeExecution(
      dispute.id, 'demo-arbitrator', '2026-08-18T01:04:00.000Z', false,
    )).state).toBe('not_ready');

    const appealVote = await store.castDisputeVote(
      dispute.id, 'demo-arbitrator-2', 'oppose_refund', '扩大委员会复核后反对退款并恢复任务。', '2026-08-18T01:05:00.000Z',
    );
    expect(appealVote.state).toBe('applied');
    if (appealVote.state === 'applied') expect(appealVote.governance.proposal).toMatchObject({ round: 1, status: 'defeated' });
    expect((await store.queueDisputeExecution(
      dispute.id, 'demo-arbitrator', '2026-08-18T01:06:00.000Z', false,
    )).state).toBe('queued');
    expect(database.db.prepare(`
      SELECT action_type, status FROM governance_execution_queue WHERE source_id = ?
    `).get(dispute.id)).toEqual({ action_type: 'reject_dispute', status: 'queued' });
  });

  it('allows non-directional appeals and makes appeal creation exclusive with execution queueing', async () => {
    database.db.exec(`
      INSERT INTO profiles (id, email, display_name, role)
      VALUES ('demo-arbitrator-3', 'arbitrator-3@test.invalid', 'Test Arbitrator Three', 'requester');
    `);
    const nonDirectional: Dispute = {
      id: 'DSP-D1-NON-DIRECTIONAL', missionId: 'TASK-2026-0815', openedBy: 'demo-requester',
      reason: '验证首轮没有方向性结果时仍可在期限内创建唯一上诉。', evidence: [], status: 'open',
      resolution: null, freezeTxHash: null, resolutionTxHash: null,
      createdAt: '2026-08-18T02:00:00.000Z', resolvedAt: null,
    };
    await store.createDispute(nonDirectional);
    await store.startDisputeReview(nonDirectional.id, 'demo-arbitrator', '2026-08-18T02:00:00.000Z');
    const quorumFailure = await store.finalizeDisputeProposal(
      nonDirectional.id, 'demo-arbitrator', '2026-08-22T02:00:00.000Z',
    );
    expect(quorumFailure.state).toBe('finalized');
    if (quorumFailure.state === 'finalized') expect(quorumFailure.governance.proposal).toMatchObject({ status: 'quorum_failed', outcome: null });
    await store.setArbitrationMember(
      'demo-arbitrator-3', true, 'demo-arbitrator', '2026-08-22T02:01:00.000Z', 1,
    );
    expect((await store.getDisputeGovernance(
      nonDirectional.id, 'demo-requester', '2026-08-23T02:00:00.000Z',
    ))?.appeal.canAppeal).toBe(true);
    expect((await store.createDisputeAppeal(
      nonDirectional.id,
      'demo-requester',
      '首轮未达到法定票权，请求扩大无利益冲突委员会完成复核。',
      '2026-08-23T02:00:00.000Z',
    )).state).toBe('created');

    database.db.exec(`
      INSERT INTO missions
        (id, requester_id, title, description, category, budget_usdc, deadline, status, progress, current_stage, team_json)
      VALUES
        ('TASK-2026-QUEUED-RACE', 'demo-requester', 'Queued race mission', 'Exercises appeal and queue mutual exclusion.',
         '视频生产', 80, '2026-09-01', 'running', 50, 'Reviewing delivery', '["visionboard"]');
      INSERT INTO workflow_stages
        (id, mission_id, position, name, purpose, category, budget_usdc, status, agent_id, output_json)
      VALUES
        ('stage-queued-race', 'TASK-2026-QUEUED-RACE', 1, 'Queued race stage', 'Verify governance ordering',
         '图像生成', 80, 'done', 'visionboard', '{"verified":true}');
      INSERT INTO escrows (id, mission_id, amount, token, network, payment_method, status)
      VALUES ('ESC-QUEUED-RACE', 'TASK-2026-QUEUED-RACE', 80, 'CREDIT', 'agentmesh', 'web2_balance', 'held');
    `);
    const queuedRace: Dispute = {
      ...nonDirectional,
      id: 'DSP-D1-QUEUED-RACE',
      missionId: 'TASK-2026-QUEUED-RACE',
      reason: '验证已经入队的首轮结果与较早时间戳上诉请求严格互斥。',
      createdAt: '2026-08-18T03:00:00.000Z',
    };
    await store.createDispute(queuedRace);
    await store.startDisputeReview(queuedRace.id, 'demo-arbitrator', '2026-08-18T03:00:00.000Z');
    await store.castDisputeVote(
      queuedRace.id, 'demo-arbitrator', 'support_refund', '第一名委员依据冻结证据支持退款。', '2026-08-18T03:01:00.000Z',
    );
    await store.castDisputeVote(
      queuedRace.id, 'demo-arbitrator-2', 'support_refund', '第二名委员复核后支持退款形成多数。', '2026-08-18T03:02:00.000Z',
    );
    expect((await store.queueDisputeExecution(
      queuedRace.id, 'demo-arbitrator', '2026-08-22T03:02:00.000Z', false,
    )).state).toBe('queued');
    expect((await store.getDisputeGovernance(
      queuedRace.id, 'demo-requester', '2026-08-19T03:02:00.000Z',
    ))?.appeal.canAppeal).toBe(false);
    expect((await store.createDisputeAppeal(
      queuedRace.id,
      'demo-requester',
      '该请求携带窗口内时间，但首轮执行已经先行入队，不能再创建上诉。',
      '2026-08-19T03:02:00.000Z',
    )).state).toBe('execution_queued');
  });

  it('persists private async export progress, retries, ownership and retention without ledger content in audit', async () => {
    const migration = readFileSync(join(import.meta.dirname, '../../db/025_async_export_jobs.sql'), 'utf8');
    database.db.exec(migration);
    database.db.exec(migration);
    database.db.exec(`
      WITH RECURSIVE sequence(value) AS (
        SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < 5001
      )
      INSERT INTO ledger_entries
        (id, settlement_key, mission_id, agent_id, entry_type, amount, token, status, created_at)
      SELECT 'large-d1-' || value, 'large-d1-key-' || value, 'TASK-2026-0815', 'visionboard',
        'agent_payout', value, 'mUSDC', 'settled', '2026-08-18T04:00:00.000Z'
      FROM sequence;
    `);

    expect(await store.requestDeveloperLedgerExport(
      'demo-developer', 'sETH', '2026-08-18T04:01:00.000Z',
    )).toEqual({ mode: 'direct', rowCount: 0 });
    const created = await store.requestDeveloperLedgerExport(
      'demo-developer', 'mUSDC', '2026-08-18T04:01:00.000Z',
    );
    expect(created).toMatchObject({ mode: 'async', job: { status: 'queued', totalRows: 5_001, attempt: 1 } });
    if (created.mode !== 'async') return;
    const exportId = created.job.id;
    const duplicate = await store.requestDeveloperLedgerExport(
      'demo-developer', 'mUSDC', '2026-08-18T04:02:00.000Z',
    );
    expect(duplicate.mode === 'async' ? duplicate.job.id : null).toBe(exportId);
    expect(await store.getDeveloperLedgerExport('demo-requester', exportId, '2026-08-18T04:02:00.000Z')).toBeNull();

    const claim = await store.claimDeveloperLedgerExport('d1-export-worker-1', '2026-08-18T04:03:00.000Z');
    expect(claim).toMatchObject({ ownerId: 'demo-developer', job: { id: exportId, status: 'processing' } });
    expect(await store.claimDeveloperLedgerExport('d1-export-worker-2', '2026-08-18T04:03:01.000Z')).toBeNull();
    expect(await store.updateDeveloperLedgerExportProgress(
      exportId, 'd1-export-worker-1', 1, 2_500, '2026-08-18T04:04:00.000Z',
    )).toMatchObject({ processedRows: 2_500, progress: 49 });
    expect(await store.failDeveloperLedgerExport(
      exportId, 'd1-export-worker-1', 1, 'STORAGE_ERROR', 'Private export storage failed', '2026-08-18T04:05:00.000Z',
    )).toMatchObject({ status: 'failed', errorCode: 'STORAGE_ERROR' });
    expect(await store.retryDeveloperLedgerExport(
      'demo-developer', exportId, '2026-08-18T04:06:00.000Z',
    )).toMatchObject({ state: 'applied', job: { status: 'queued', attempt: 2, processedRows: 0 } });
    await store.claimDeveloperLedgerExport('d1-export-worker-2', '2026-08-18T04:07:00.000Z');
    const completed = await store.completeDeveloperLedgerExport({
      id: exportId, workerId: 'd1-export-worker-2', attempt: 2, objectKey: `private/exports/${exportId}/ledger.csv`,
      sha256: 'b'.repeat(64), rowCount: 5_001, byteSize: 234_567, completedAt: '2026-08-18T04:08:00.000Z',
    });
    expect(completed).toMatchObject({ status: 'completed', progress: 100, artifact: { rowCount: 5_001, byteSize: 234_567 } });
    expect(completed).not.toHaveProperty('artifact.objectKey');
    expect(await store.getDeveloperLedgerExportArtifact(
      'demo-developer', exportId, '2026-08-18T04:09:00.000Z',
    )).toMatchObject({ objectKey: `private/exports/${exportId}/ledger.csv` });
    expect(await store.getDeveloperLedgerExportArtifact(
      'demo-requester', exportId, '2026-08-18T04:09:00.000Z',
    )).toBeNull();

    expect(await store.getDeveloperLedgerExport(
      'demo-developer', exportId, '2026-08-19T04:08:01.000Z',
    )).toMatchObject({ status: 'expired', artifact: null, expiresAt: '2026-08-19T04:08:00.000Z' });
    expect(await store.getDeveloperLedgerExportArtifact(
      'demo-developer', exportId, '2026-08-19T04:08:01.000Z',
    )).toBeNull();
    const unsafeAudit = database.db.prepare(`
      SELECT COUNT(*) AS count FROM export_job_events
      WHERE detail_json LIKE '%large-d1-%' OR detail_json LIKE '%Private row%'
    `).get();
    expect(unsafeAudit).toEqual({ count: 0 });

    const replacement = await store.requestDeveloperLedgerExport(
      'demo-developer', 'mUSDC', '2026-08-19T04:09:00.000Z',
    );
    expect(replacement.mode).toBe('async');
    if (replacement.mode === 'async') {
      const replacementId = replacement.job.id;
      const originalExpiry = replacement.job.expiresAt;
      expect(await store.claimDeveloperLedgerExport(
        'd1-reused-worker', '2026-08-19T04:10:00.000Z',
      )).toMatchObject({ job: { id: replacementId, attempt: 1 } });
      expect(await store.updateDeveloperLedgerExportProgress(
        replacementId, 'd1-reused-worker', 1, 100, '2026-08-19T04:15:00.000Z',
      )).toBeNull();
      expect(await store.claimDeveloperLedgerExport(
        'd1-reused-worker', '2026-08-19T04:15:01.000Z',
      )).toMatchObject({ job: { id: replacementId, attempt: 2 } });
      expect(await store.updateDeveloperLedgerExportProgress(
        replacementId, 'd1-reused-worker', 1, 100, '2026-08-19T04:15:02.000Z',
      )).toBeNull();
      expect(await store.completeDeveloperLedgerExport({
        id: replacementId, workerId: 'd1-reused-worker', attempt: 1,
        objectKey: `private/exports/${replacementId}/stale.csv`, sha256: 'c'.repeat(64),
        rowCount: 5_001, byteSize: 10_000, completedAt: '2026-08-19T04:15:02.000Z',
      })).toBeNull();
      expect(await store.failDeveloperLedgerExport(
        replacementId, 'd1-reused-worker', 1, 'STORAGE_ERROR', 'Private export storage failed', '2026-08-19T04:15:02.000Z',
      )).toBeNull();
      expect(await store.updateDeveloperLedgerExportProgress(
        replacementId, 'd1-reused-worker', 2, 250, '2026-08-19T04:15:02.000Z',
      )).toMatchObject({ processedRows: 250, attempt: 2 });
      expect(await store.failDeveloperLedgerExport(
        replacementId, 'd1-reused-worker', 2, 'STORAGE_ERROR', 'Private export storage failed', '2026-08-19T04:16:00.000Z',
      )).toMatchObject({ status: 'failed', attempt: 2 });

      const sibling = await store.requestDeveloperLedgerExport(
        'demo-developer', 'mUSDC', '2026-08-19T04:17:00.000Z',
      );
      expect(sibling.mode).toBe('async');
      if (sibling.mode === 'async') {
        expect((await store.retryDeveloperLedgerExport(
          'demo-developer', replacementId, '2026-08-19T04:17:01.000Z',
        )).state).toBe('invalid_state');
        expect(await store.cancelDeveloperLedgerExport(
          'demo-developer', sibling.job.id, '2026-08-19T04:17:02.000Z',
        )).toMatchObject({ state: 'applied', job: { status: 'cancelled' } });
      }

      expect(await store.retryDeveloperLedgerExport(
        'demo-developer', replacementId, '2026-08-25T04:00:00.000Z',
      )).toMatchObject({ state: 'applied', job: { status: 'queued', attempt: 3, expiresAt: originalExpiry } });
      expect(await store.claimDeveloperLedgerExport(
        'd1-expiry-worker', '2026-08-25T04:01:00.000Z',
      )).toMatchObject({ job: { id: replacementId, attempt: 3 } });
      database.db.prepare('UPDATE export_jobs SET lease_expires_at = ? WHERE id = ?')
        .run('2026-08-27T04:00:00.000Z', replacementId);
      expect(await store.completeDeveloperLedgerExport({
        id: replacementId, workerId: 'd1-expiry-worker', attempt: 3,
        objectKey: `private/exports/${replacementId}/late.csv`, sha256: 'd'.repeat(64),
        rowCount: 5_001, byteSize: 10_000, completedAt: '2026-08-26T04:09:01.000Z',
      })).toBeNull();
      expect(await store.getDeveloperLedgerExport(
        'demo-developer', replacementId, '2026-08-26T04:09:01.000Z',
      )).toMatchObject({ status: 'expired', artifact: null });
    }
  });
});
