import { beforeEach, describe, expect, it } from 'vitest';
import { exportSPKI, generateKeyPair, SignJWT } from 'jose';
import type { Agent, CandidateMatch, Mission, PaymentMethod, RewardActivity, UserContext, WorkflowStage } from './contracts';
import { MemoryPlatformStore } from './memoryStore';
import { buildSettlementPlan, settlementDescriptor } from './chain';
import { looksLikePrivyToken, verifyPrivyIdentityToken, verifyPrivyToken } from './privy';
import { createApp } from './worker';

type JsonBody = Record<string, any>;

let store: MemoryPlatformStore;
let app: ReturnType<typeof createApp>;
let dispatchedBody: JsonBody | null;
let dispatchedBodies: JsonBody[];
let dispatchedAuthorization: string | null;
let dispatchedAgentHeaders: Array<string | null>;
let dispatchCalls: number;
let dispatchResponder: (() => Response | Promise<Response>) | null;
let trialResponder: ((challenge: string, agentId: string, body: JsonBody) => Response | Promise<Response>) | null;
let deliveredEmails: Array<{ to: string; subject: string; html: string }>;
let currentNow: string;
let requestedLlmModels: Array<string | undefined>;

const testEnv: {
  API_KEY: string;
  PROJECT_NAME: string;
  TEST_TOPUP_ENABLED: string;
  AGENT_CREDENTIALS_JSON?: string;
  AGENT_CREDENTIALS_ENCRYPTED_JSON?: string;
  AGENT_QUALITY_GATE_MODE?: string;
  YD_RPC_URL: string;
  YD_CHAIN_ID: string;
  YD_TOKEN_ADDRESS: string;
  YD_DISTRIBUTOR_ADDRESS: string;
  YD_STAKING_ADDRESS: string;
  YD_MIN_CONFIRMATIONS: string;
  YD_TESTNET: string;
} = {
  API_KEY: 'test-project-secret',
  PROJECT_NAME: 'agentmesh-test',
  TEST_TOPUP_ENABLED: 'true',
  YD_RPC_URL: 'https://yd-rpc.example.test',
  YD_CHAIN_ID: '11155111',
  YD_TOKEN_ADDRESS: '0x1000000000000000000000000000000000000001',
  YD_DISTRIBUTOR_ADDRESS: '0x1000000000000000000000000000000000000002',
  YD_STAKING_ADDRESS: '0x1000000000000000000000000000000000000003',
  YD_MIN_CONFIRMATIONS: '2',
  YD_TESTNET: 'true',
};

const requester: UserContext = {
  id: 'requester-1',
  email: 'requester@example.com',
  displayName: 'Requester One',
  role: 'requester',
};

const developer: UserContext = {
  id: 'developer-1',
  email: 'developer@example.com',
  displayName: 'Developer One',
  role: 'developer',
};

const otherDeveloper: UserContext = {
  id: 'developer-2',
  email: 'other-developer@example.com',
  displayName: 'Developer Two',
  role: 'developer',
};

const admin: UserContext = {
  id: 'admin-1',
  email: 'admin@example.com',
  displayName: 'Platform Admin',
  role: 'admin',
};

function agent(id: string, category: string, price: number): Agent {
  return {
    id,
    ownerId: developer.id,
    name: id,
    category,
    summary: `${category} 专业 Agent，输出包含验证证据和结构化结果。`,
    tags: ['研究', '报告', '策略'],
    endpoint: `https://agents.example.com/${id}`,
    authType: 'none',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    price,
    wallet: '0x2200000000000000000000000000000000009A11',
    status: 'active',
    version: 'v1.0.0',
    trustScore: 9.2,
    successRate: 97,
    responseTime: '1.8s',
    jobs: 10,
    volume: 1000,
    author: 'Developer One',
    official: false,
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  };
}

async function api(path: string, init: RequestInit = {}, userId?: string) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (userId) headers.set('X-Test-User', userId);
  const response = await app.fetch(new Request(`http://local.test${path}`, { ...init, headers }), testEnv);
  const body = await response.json() as JsonBody;
  return { response, body };
}

async function encryptedCredentialBinding(agentId: string, credential: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyBytes = await crypto.subtle.digest('SHA-256', encoder.encode(`agentmesh-agent-credentials:v1\n${testEnv.API_KEY}`));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: encoder.encode(`agentmesh-agent-credential:${agentId}:v1`),
  }, key, encoder.encode(credential)));
  const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return JSON.stringify({ version: 1, credentials: { [agentId]: { iv: encode(iv), ciphertext: encode(ciphertext) } } });
}

async function createMission(idempotencyKey?: string, paymentMethod: PaymentMethod = 'web2_balance'): Promise<{ mission: Mission; stages: WorkflowStage[] }> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const result = await api('/api/missions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: '生成一份可信的市场进入策略报告',
      description: '研究目标市场、核验数据，并形成包含证据、风险和行动建议的完整报告。',
      category: '商业研究',
      tags: ['研究', '报告'],
      budget: 300,
      paymentMethod,
      deadline: '2026-09-01',
      priority: 'high',
      expertise: 'expert',
      yieldEnabled: true,
    }),
  }, requester.id);
  expect(result.response.status).toBe(201);
  return result.body.data;
}

async function acceptAllStageOffers(missionId: string) {
  const detail = await api(`/api/missions/${missionId}`, {}, developer.id);
  expect(detail.response.status).toBe(200);
  for (const offer of detail.body.data.offers as Array<{ id: string; status: string }>) {
    if (offer.status !== 'pending') continue;
    const response = await api(`/api/missions/${missionId}/offers/${offer.id}`, {
      method: 'POST', body: JSON.stringify({ decision: 'accepted' }),
    }, developer.id);
    expect(response.response.status).toBe(200);
  }
}

beforeEach(() => {
  dispatchedBody = null;
  dispatchedBodies = [];
  dispatchedAuthorization = null;
  dispatchedAgentHeaders = [];
  dispatchCalls = 0;
  dispatchResponder = null;
  trialResponder = null;
  deliveredEmails = [];
  requestedLlmModels = [];
  currentNow = '2026-08-16T00:00:00.000Z';
  delete testEnv.AGENT_CREDENTIALS_JSON;
  delete testEnv.AGENT_CREDENTIALS_ENCRYPTED_JSON;
  delete testEnv.AGENT_QUALITY_GATE_MODE;
  store = new MemoryPlatformStore();
  store.profiles.set(requester.id, requester);
  store.profiles.set(developer.id, developer);
  store.profiles.set(otherDeveloper.id, otherDeveloper);
  store.profiles.set(admin.id, admin);
  store.walletBalances.set(requester.id, 1_000);
  for (const item of [agent('research-agent', '数据研究', 70), agent('analysis-agent', '商业分析', 90), agent('writer-agent', '内容生成', 50)]) {
    store.agents.set(item.id, item);
  }
  app = createApp({
    storeFactory: () => store,
    identityResolver: async (request) => {
      const uid = request.headers.get('X-Test-User');
      if (!uid) return null;
      const profile = store.profiles.get(uid);
      return { uid, provider: 'pinme', email: profile?.email, displayName: profile?.displayName, claims: {} };
    },
    now: () => new Date(currentNow),
    fetcher: async (_input, init) => {
      dispatchedBody = JSON.parse(String(init?.body ?? '{}')) as JsonBody;
      dispatchedBodies.push(dispatchedBody);
      const headers = new Headers(init?.headers);
      dispatchedAuthorization = headers.get('Authorization');
      dispatchedAgentHeaders.push(headers.get('X-AgentMesh-Agent-Id'));
      const challenge = headers.get('X-AgentMesh-Trial');
      if (challenge) {
        const agentId = headers.get('X-AgentMesh-Agent-Id') ?? '';
        if (trialResponder) return trialResponder(challenge, agentId, dispatchedBody);
        const trialCase = (dispatchedBody.case as JsonBody | undefined)?.id;
        if (trialCase === 'error_handling') {
          return Response.json({ challenge, agentId, status: 'rejected', error: { code: 'TRIAL_VALIDATION_ERROR' } }, { status: 422 });
        }
        if (trialCase === 'artifact_delivery') {
          return Response.json({ challenge, agentId, status: 'accepted', output: { artifact: { kind: 'structured-report', mimeType: 'application/json' } } }, { status: 200 });
        }
        if (trialCase === 'engineering_capabilities') {
          return Response.json({ challenge, agentId, status: 'accepted', output: { modes: ['analyze', 'implement', 'review'], verification: true } }, { status: 200 });
        }
        return Response.json({ challenge, agentId, status: 'accepted', output: { schema: 'ok' } }, { status: 200 });
      }
      dispatchCalls += 1;
      if (dispatchResponder) return dispatchResponder();
      return Response.json({ accepted: true, runId: 'run-test-1' }, { status: 202 });
    },
    emailSender: async (_env, input) => {
      deliveredEmails.push(input);
      return { ok: true };
    },
    llmCaller: async (_env, _messages, options) => {
      requestedLlmModels.push(options?.model);
      return { content: JSON.stringify({
        summary: 'Official test Agent completed the assigned stage.',
        findings: ['Structured output generated by the injected test LLM.'],
        risks: [],
      }) };
    },
    endpointValidator: async () => undefined,
    depositVerifier: async () => ({
      ok: true,
      confirmations: 1,
      blockNumber: '123',
      requester: '0x7100000000000000000000000000000000008F2C',
    }),
    ydEpochPublisherVerifier: async () => ({ ok: true, blockNumber: '120', logIndex: 0, confirmations: 2 }),
    ydEpochSweepVerifier: async () => ({ ok: true, blockNumber: '130', logIndex: 0, confirmations: 2 }),
    ydClaimVerifier: async () => ({ ok: true, blockNumber: '121', logIndex: 1, confirmations: 2 }),
    ydStakingSynchronizer: async (_env, txHash, userId, walletAddress, updatedAt) => ({
      verification: { ok: true, blockNumber: '122', logIndex: 2, confirmations: 2 },
      position: {
        userId,
        walletAddress: walletAddress.toLocaleLowerCase(),
        amountUnits: '10000000000000000000',
        unlockTime: '2027-02-12T00:00:00.000Z',
        durationSeconds: 180 * 24 * 60 * 60,
        reputationBps: 10_000,
        rawPower: '3162277660',
        delegatedTo: walletAddress.toLocaleLowerCase(),
        votingPower: '3162277660',
        verified: true,
        lastTxHash: txHash,
        lastBlockNumber: '122',
        lastLogIndex: 2,
        updatedAt,
      },
    }),
    ydPowerSnapshotReader: async (_env, proposalId, candidates, requestedBlock, createdAt) => {
      const electorate = candidates.map((candidate) => ({
        proposalId,
        userId: candidate.userId,
        walletAddress: candidate.walletAddress,
        power: '100',
        delegateSources: [],
        createdAt,
      }));
      return { electorate, eligiblePower: String(electorate.length * 100), snapshotBlock: (requestedBlock ?? 100n).toString() };
    },
  });
});

describe('AgentMesh Worker', () => {
  it('runs the YD reward, claim, staking and Power-governance workflow without touching escrow', async () => {
    const linkedWallet = '0x7100000000000000000000000000000000008f2c';
    store.profiles.set(requester.id, { ...requester, walletAddress: linkedWallet });

    const publicConfig = await api('/api/yd/config');
    expect(publicConfig.response.status).toBe(200);
    expect(publicConfig.body.data).toMatchObject({ configured: true, escrowSeparated: true, earnVaultEnabled: false });

    const forbidden = await api('/api/yd/admin/epochs', {
      method: 'POST', body: JSON.stringify({}),
    }, requester.id);
    expect(forbidden.response.status).toBe(403);

    const epochCreated = await api('/api/yd/admin/epochs', {
      method: 'POST',
      body: JSON.stringify({
        epochNumber: 1,
        startsAt: '2026-08-01T00:00:00.000Z',
        endsAt: '2026-08-15T00:00:00.000Z',
        claimEndsAt: '2026-09-01T00:00:00.000Z',
        totalRewardUnits: '100000000000000000000',
        accountScoreCap: 2_000_000_000,
        rules: { settlementRequired: true },
      }),
    }, admin.id);
    expect(epochCreated.response.status).toBe(201);
    const epochId = epochCreated.body.data.id as string;

    const activity: RewardActivity = {
      id: 'YDACTIVITY-test-requester',
      sourceKey: 'mission:test:settlement:requester',
      userId: requester.id,
      missionId: 'TASK-TEST-REWARD',
      disputeId: null,
      role: 'requester',
      formulaVersion: 'agentmesh-yd-v1',
      asset: 'mUSDC',
      settledAmount: 100,
      qualityBps: 10_000,
      penaltyBps: 0,
      scoreMicros: 2_500_000,
      eligible: true,
      detail: { settlement: 'released' },
      occurredAt: '2026-08-10T00:00:00.000Z',
      createdAt: '2026-08-10T00:00:00.000Z',
    };
    expect(await store.recordRewardActivity(activity)).toBe(true);
    expect(await store.recordRewardActivity(activity)).toBe(false);

    const computed = await api(`/api/yd/admin/epochs/${epochId}/compute`, { method: 'POST', body: '{}' }, admin.id);
    expect(computed.response.status).toBe(200);
    expect(computed.body.data).toMatchObject({ state: 'computed' });
    expect(computed.body.data.allocations).toHaveLength(1);
    expect(computed.body.data.allocations[0].amountUnits).toBe('100000000000000000000');
    const publicManifest = await api(`/api/yd/epochs/${epochId}/allocations`);
    expect(publicManifest.response.status).toBe(200);
    expect(publicManifest.body.data.allocations[0]).toMatchObject({
      walletAddress: linkedWallet,
      effectiveScore: 2_500_000,
      amountUnits: '100000000000000000000',
    });
    expect(publicManifest.body.data.allocations[0].userId).toBeUndefined();

    const publishTx = `0x${'a'.repeat(64)}`;
    const published = await api(`/api/yd/admin/epochs/${epochId}/publish`, {
      method: 'POST', body: JSON.stringify({ txHash: publishTx }),
    }, admin.id);
    expect(published.response.status).toBe(200);
    expect(published.body.data.status).toBe('published');

    const overview = await api('/api/yd/overview', {}, requester.id);
    expect(overview.response.status).toBe(200);
    expect(overview.body.data.allocations[0]).toMatchObject({ status: 'unclaimed', walletAddress: linkedWallet });
    expect(overview.body.data.allocations[0].proof).toEqual([]);

    const stakingTx = `0x${'c'.repeat(64)}`;
    const staking = await api('/api/yd/staking/sync', {
      method: 'POST', body: JSON.stringify({ txHash: stakingTx }),
    }, requester.id);
    expect(staking.response.status).toBe(200);
    expect(staking.body.data).toMatchObject({ verified: true, votingPower: '3162277660' });

    const proposalCreated = await api('/api/yd/admin/governance/proposals', {
      method: 'POST',
      body: JSON.stringify({
        proposalType: 'development',
        title: '资助下一版贡献证明工具',
        description: '用生态开发预算完善贡献证明清单和公开验证工具，且不改变任务托管参数。',
        payload: { budget: 'test-only' },
        endsAt: '2026-08-17T12:00:00.000Z',
        quorumBps: 2_000,
        approvalBps: 5_001,
      }),
    }, admin.id);
    expect(proposalCreated.response.status).toBe(201);
    const proposalId = proposalCreated.body.data.proposal.id as string;
    expect(proposalCreated.body.data.currentUser.eligible).toBe(false);
    const publicGovernance = await api('/api/yd/governance/public');
    expect(publicGovernance.response.status).toBe(200);
    expect(publicGovernance.body.data[0].electorate[0]).toMatchObject({ walletAddress: linkedWallet, power: '100' });
    expect(publicGovernance.body.data[0].electorate[0].userId).toBeUndefined();

    store.profiles.set(requester.id, { ...requester, walletAddress: '0x7200000000000000000000000000000000008f2c' });
    const mismatchedWalletVote = await api(`/api/yd/governance/proposals/${proposalId}/votes`, {
      method: 'POST', body: JSON.stringify({ choice: 'for', reason: '更换绑定钱包后不能代表快照钱包投票。' }),
    }, requester.id);
    expect(mismatchedWalletVote.response.status).toBe(409);
    expect(mismatchedWalletVote.body.error.code).toBe('YD_SNAPSHOT_WALLET_MISMATCH');
    store.profiles.set(requester.id, { ...requester, walletAddress: linkedWallet });

    const voted = await api(`/api/yd/governance/proposals/${proposalId}/votes`, {
      method: 'POST', body: JSON.stringify({ choice: 'for', reason: '该提案只使用生态预算并改善公开验证能力。' }),
    }, requester.id);
    expect(voted.response.status).toBe(201);
    expect(voted.body.data.proposal.forPower).toBe('100');
    const duplicateVote = await api(`/api/yd/governance/proposals/${proposalId}/votes`, {
      method: 'POST', body: JSON.stringify({ choice: 'against', reason: '重复投票必须被拒绝并保持原计票不变。' }),
    }, requester.id);
    expect(duplicateVote.response.status).toBe(409);

    const finalized = await api(`/api/yd/governance/proposals/${proposalId}/finalize`, {
      method: 'POST', body: '{}',
    }, admin.id);
    expect(finalized.response.status).toBe(200);
    expect(finalized.body.data.proposal.status).toBe('succeeded');

    currentNow = '2026-09-02T00:00:00.000Z';
    const sweepTx = `0x${'d'.repeat(64)}`;
    const expired = await api(`/api/yd/admin/epochs/${epochId}/expire`, {
      method: 'POST', body: JSON.stringify({ txHash: sweepTx }),
    }, admin.id);
    expect(expired.response.status).toBe(200);
    expect(expired.body.data.status).toBe('expired');

    const claimTx = `0x${'b'.repeat(64)}`;
    const delayedClaimSync = await api('/api/yd/claims/sync', {
      method: 'POST', body: JSON.stringify({ epochId, txHash: claimTx }),
    }, requester.id);
    expect(delayedClaimSync.response.status).toBe(201);
    expect(delayedClaimSync.body.data.claim.txHash).toBe(claimTx);
    const replayedClaim = await api('/api/yd/claims/sync', {
      method: 'POST', body: JSON.stringify({ epochId, txHash: claimTx }),
    }, requester.id);
    expect(replayedClaim.response.status).toBe(200);
    expect(replayedClaim.body.meta.replayed).toBe(true);
    const reconciledOverview = await api('/api/yd/overview', {}, requester.id);
    expect(reconciledOverview.body.data.allocations[0].status).toBe('claimed');
  });

  it('uses the deployed Sepolia contract defaults only for the AgentMesh test project', () => {
    expect(settlementDescriptor({ PROJECT_NAME: 'agentmesh-test' }).mode).toBe('offchain_ledger_with_chain_references');
    expect(settlementDescriptor({ PROJECT_NAME: 'agentmesh-platform-74a3' })).toMatchObject({
      mode: 'verified_contract',
      assets: ['mUSDC', 'sETH'],
      network: 'eip155:11155111',
      contractAddress: '0xe05a5e46139294402393e5601d771e6c7564a573',
    });
  });

  it('cryptographically verifies Privy access tokens before accepting a Web3 identity', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
    const verificationKey = await exportSPKI(publicKey);
    const token = await new SignJWT({ sid: 'privy-session-1' })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuer('privy.io')
      .setAudience('privy-app-test')
      .setSubject('did:privy:user-1')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    expect(looksLikePrivyToken(token)).toBe(true);
    const result = await verifyPrivyToken({
      PRIVY_APP_ID: 'privy-app-test',
      PRIVY_VERIFICATION_KEY: verificationKey,
    }, token);
    expect(result.status).toBe(200);
    expect(result.identity?.uid).toBe('did:privy:user-1');
    expect(result.identity?.claims.authProvider).toBe('privy');
  });

  it('rejects a validly signed Privy token issued for a different app', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuer('privy.io')
      .setAudience('another-app')
      .setSubject('did:privy:user-2')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    const result = await verifyPrivyToken({
      PRIVY_APP_ID: 'privy-app-test',
      PRIVY_VERIFICATION_KEY: await exportSPKI(publicKey),
    }, token);

    expect(result.status).toBe(401);
    expect(result.identity).toBeUndefined();
  });

  it('uses a signed Privy identity token to map linked accounts to one canonical profile', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
    const env = { PRIVY_APP_ID: 'privy-app-test', PRIVY_VERIFICATION_KEY: await exportSPKI(publicKey) };
    const identityToken = await new SignJWT({
      linked_accounts: JSON.stringify([
        { type: 'email', address: 'same@example.com' },
        { type: 'wallet', address: '0x7100000000000000000000000000000000008F2C' },
      ]),
    })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuer('privy.io')
      .setAudience('privy-app-test')
      .setSubject('did:privy:user-linked')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    const verified = await verifyPrivyIdentityToken(env, identityToken, 'did:privy:user-linked');
    expect(verified.identity?.email).toBe('same@example.com');
    expect(verified.identity?.walletAddress).toBe('0x7100000000000000000000000000000000008f2c');

    const pinmeProfile = await store.ensureIdentityProfile({
      provider: 'pinme', subject: 'pinme-user', email: 'same@example.com', displayName: 'Same User',
    });
    const privyProfile = await store.ensureIdentityProfile({
      provider: 'privy', subject: 'did:privy:user-linked', email: verified.identity?.email,
      walletAddress: verified.identity?.walletAddress, displayName: verified.identity?.displayName ?? 'Same User',
    });
    expect(privyProfile.id).toBe(pinmeProfile.id);
    expect(privyProfile.walletAddress).toBe('0x7100000000000000000000000000000000008f2c');
  });

  it('rejects an identity when its verified email and wallet belong to different profiles', async () => {
    store.profiles.set('wallet-owner', {
      id: 'wallet-owner', displayName: 'Wallet Owner', role: 'requester',
      walletAddress: '0x7100000000000000000000000000000000008f2c',
    });
    await expect(store.ensureIdentityProfile({
      provider: 'privy', subject: 'did:privy:conflict', email: requester.email,
      walletAddress: '0x7100000000000000000000000000000000008F2C', displayName: 'Conflict',
    })).rejects.toThrow('IDENTITY_CONFLICT');
  });

  it('publishes health and capability metadata without authentication', async () => {
    const health = await api('/api/health');
    const capabilities = await api('/api/capabilities');

    expect(health.response.status).toBe(200);
    expect(health.response.headers.get('Cache-Control')).toBe('no-store');
    expect(health.body.data.service).toBe('agentmesh-control-plane');
    expect(health.body.data.authProviders).toContain('privy');
    expect(health.body.data.agentCredentialsConfigured).toBe(false);
    expect(capabilities.body.data.auth).toContain('siwe_wallet');
    expect(capabilities.body.data.auth).toContain('embedded_wallet');
    expect(capabilities.body.data.orchestration).toContain('candidate_matching');
    expect(capabilities.body.data.realtime.primary).toBe('sse');
    expect(capabilities.body.data.treasury.ledger).toBe(true);
    expect(capabilities.body.data.treasury.cursorPagination).toBe(true);
    expect(capabilities.body.data.operations.persistedPreferences).toBe(true);
    expect(capabilities.body.data.notifications.preferenceAware).toBe(true);
    expect(capabilities.body.data.operations.adminRoleManagement).toBe(true);
  });

  it('rejects origins outside the configured CORS allowlist', async () => {
    const response = await app.fetch(new Request('http://local.test/api/health', {
      headers: { Origin: 'https://evil.example' },
    }), { ...testEnv, CORS_ORIGIN: 'https://allowed.example' });
    const body = await response.json() as JsonBody;
    expect(response.status).toBe(403);
    expect(body.error.code).toBe('ORIGIN_NOT_ALLOWED');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('defaults CORS to the production domains instead of a wildcard', async () => {
    const primaryDomain = await app.fetch(new Request('http://local.test/api/health', {
      headers: { Origin: 'https://agentmesh.pinit.eth.limo' },
    }), testEnv);
    const pinmeDomain = await app.fetch(new Request('http://local.test/api/health', {
      headers: { Origin: 'https://agentmesh.pinme.dev' },
    }), testEnv);
    const rejected = await app.fetch(new Request('http://local.test/api/health', {
      headers: { Origin: 'https://evil.example' },
    }), testEnv);

    expect(primaryDomain.status).toBe(200);
    expect(primaryDomain.headers.get('Access-Control-Allow-Origin')).toBe('https://agentmesh.pinit.eth.limo');
    expect(primaryDomain.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
    expect(pinmeDomain.status).toBe(200);
    expect(pinmeDomain.headers.get('Access-Control-Allow-Origin')).toBe('https://agentmesh.pinme.dev');
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('requires authentication for private mission data', async () => {
    const result = await api('/api/missions');

    expect(result.response.status).toBe(401);
    expect(result.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('persists validated user preferences per authenticated profile', async () => {
    const defaults = await api('/api/me/preferences', {}, requester.id);
    expect(defaults.response.status).toBe(200);
    expect(defaults.body.data.taskUpdates).toBe(true);

    const invalid = await api('/api/me/preferences', {
      method: 'PUT',
      body: JSON.stringify({
        taskUpdates: true, settlementUpdates: true, productUpdates: false,
        emailChannel: true, locale: 'zh-CN', timeZone: 'Mars/Olympus',
      }),
    }, requester.id);
    expect(invalid.response.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

    const saved = await api('/api/me/preferences', {
      method: 'PUT',
      body: JSON.stringify({
        taskUpdates: false, settlementUpdates: true, productUpdates: true,
        emailChannel: false, locale: 'en-US', timeZone: 'America/New_York',
      }),
    }, requester.id);
    expect(saved.response.status).toBe(200);
    expect(saved.body.data.taskUpdates).toBe(false);
    expect(saved.body.data.locale).toBe('en-US');
    expect((await api('/api/me/preferences', {}, requester.id)).body.data.timeZone).toBe('America/New_York');
  });

  it('delivers task notifications only when the recipient preference is enabled', async () => {
    const { mission } = await createMission();
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));
    await api(`/api/missions/${mission.id}/workflow`, {
      method: 'POST', body: JSON.stringify({ assignments }),
    }, requester.id);
    await acceptAllStageOffers(mission.id);
    store.notifications.set(requester.id, []);
    deliveredEmails = [];
    await api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id);
    await store.updateUserPreferences(requester.id, {
      taskUpdates: false, settlementUpdates: true, productUpdates: false,
      emailChannel: true, locale: 'zh-CN', timeZone: 'Asia/Shanghai', updatedAt: '2026-08-16T00:00:00.000Z',
    });

    const first = await api(`/api/missions/${mission.id}/deliverables`, {
      method: 'POST',
      body: JSON.stringify({
        stageId: matches[0].stageId, name: '不应通知的交付物', uri: 'ipfs://bafysilent',
        contentHash: 'sha256:silent12345678', mimeType: 'application/json',
      }),
    }, developer.id);
    expect(first.response.status).toBe(201);
    expect(await store.listNotifications(requester.id)).toHaveLength(0);
    expect(deliveredEmails).toHaveLength(0);

    await store.updateUserPreferences(requester.id, {
      taskUpdates: true, settlementUpdates: true, productUpdates: false,
      emailChannel: true, locale: 'zh-CN', timeZone: 'Asia/Shanghai', updatedAt: '2026-08-16T00:00:00.000Z',
    });
    await api(`/api/missions/${mission.id}/deliverables`, {
      method: 'POST',
      body: JSON.stringify({
        stageId: matches[0].stageId, name: '需要通知的交付物', uri: 'ipfs://bafynotified',
        contentHash: 'sha256:notified12345678', mimeType: 'application/json',
      }),
    }, developer.id);
    expect(await store.listNotifications(requester.id)).toHaveLength(1);
    expect(deliveredEmails[0]?.to).toBe(requester.email);
    expect(deliveredEmails[0]?.subject).toContain('新的交付物待查看');
  });

  it('allows only administrators to manage roles and appends an audit action', async () => {
    const forbidden = await api('/api/admin/users', {}, requester.id);
    expect(forbidden.response.status).toBe(403);

    const users = await api('/api/admin/users', {}, admin.id);
    expect(users.response.status).toBe(200);
    expect(users.body.data).toHaveLength(4);

    const selfChange = await api(`/api/admin/users/${admin.id}/role`, {
      method: 'PUT', body: JSON.stringify({ role: 'requester' }),
    }, admin.id);
    expect(selfChange.response.status).toBe(409);
    expect(selfChange.body.error.code).toBe('SELF_ROLE_CHANGE_FORBIDDEN');

    const personaSwitch = await api('/api/me/role', {
      method: 'PUT', body: JSON.stringify({ role: 'requester' }),
    }, admin.id);
    expect(personaSwitch.response.status).toBe(200);
    expect(personaSwitch.body.data.role).toBe('admin');
    expect(store.profiles.get(admin.id)?.role).toBe('admin');

    const changed = await api(`/api/admin/users/${requester.id}/role`, {
      method: 'PUT', body: JSON.stringify({ role: 'developer' }),
    }, admin.id);
    expect(changed.response.status).toBe(200);
    expect(changed.body.data.profile.role).toBe('developer');
    expect(changed.body.data.action.detail).toEqual({ previousRole: 'requester', nextRole: 'developer' });

    const audit = await api('/api/admin/audit', {}, admin.id);
    expect(audit.response.status).toBe(200);
    expect(audit.body.data[0].targetUserId).toBe(requester.id);
    expect(audit.body.data[0].actorId).toBe(admin.id);
  });

  it('runs disputes through admin review and an append-only action trail', async () => {
    const { mission } = await createMission();
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));
    await api(`/api/missions/${mission.id}/workflow`, { method: 'POST', body: JSON.stringify({ assignments }) }, requester.id);
    await acceptAllStageOffers(mission.id);
    await api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id);
    const opened = await api(`/api/missions/${mission.id}/disputes`, {
      method: 'POST',
      body: JSON.stringify({ reason: '交付证据与任务规格存在明显差异，需要平台管理员复核。', evidence: [] }),
    }, requester.id);
    expect(opened.response.status).toBe(201);
    const disputeId = opened.body.data.id as string;

    const duplicate = await api(`/api/missions/${mission.id}/disputes`, {
      method: 'POST',
      body: JSON.stringify({ reason: '同一任务不应同时产生第二个仍在处理中的争议案件。', evidence: [] }),
    }, requester.id);
    expect(duplicate.response.status).toBe(409);
    expect(duplicate.body.error.code).toBe('ACTIVE_DISPUTE_EXISTS');

    const requesterReview = await api(`/api/disputes/${disputeId}/review`, { method: 'POST', body: '{}' }, requester.id);
    expect(requesterReview.response.status).toBe(403);

    const review = await api(`/api/disputes/${disputeId}/review`, { method: 'POST', body: '{}' }, admin.id);
    expect(review.response.status).toBe(200);
    expect(review.body.data.status).toBe('reviewing');

    const resolution = '依据任务规格与执行证据，支持争议方并要求重新生成符合要求的交付物。';
    const blockedResolution = await api(`/api/disputes/${disputeId}/resolve`, {
      method: 'POST', body: JSON.stringify({ resolution, status: 'resolved' }),
    }, admin.id);
    expect(blockedResolution.response.status).toBe(409);
    expect(blockedResolution.body.error.code).toBe('ARBITRATION_AUTHORIZATION_REQUIRED');

    const vote = await api(`/api/disputes/${disputeId}/votes`, {
      method: 'POST', body: JSON.stringify({ choice: 'support_refund', reason: '依据任务规格与交付证据，支持争议方退款并终止任务。' }),
    }, admin.id);
    expect(vote.response.status).toBe(201);
    expect(vote.body.data.proposal.status).toBe('succeeded');

    const resolved = await api(`/api/disputes/${disputeId}/resolve`, {
      method: 'POST', body: JSON.stringify({ resolution, status: 'resolved' }),
    }, admin.id);
    expect(resolved.response.status).toBe(200);
    expect(resolved.body.data.status).toBe('resolved');
    expect((await store.getMission(mission.id))?.status).toBe('cancelled');
    expect((await store.getEscrow(mission.id))?.status).toBe('refunded');
    expect((await store.getWalletAccount(requester.id)).balance).toBe(1_000);
    expect((await store.getWalletAccount(requester.id)).transactions.filter((item) => item.type === 'refund')).toHaveLength(1);

    const actions = await api(`/api/disputes/${disputeId}/actions`, {}, requester.id);
    expect(actions.response.status).toBe(200);
    expect(actions.body.data.map((item: JsonBody) => item.action)).toEqual(['review_started', 'resolved']);

    const repeated = await api(`/api/disputes/${disputeId}/resolve`, {
      method: 'POST', body: JSON.stringify({ resolution, status: 'resolved' }),
    }, admin.id);
    expect(repeated.response.status).toBe(200);
    expect(repeated.body.meta.replayed).toBe(true);
    const assignedAgents = [...new Set((store.stages.get(mission.id) ?? []).map((stage) => stage.agentId).filter(Boolean))] as string[];
    const disputeMetrics = (await Promise.all(assignedAgents.map((agentId) => store.listAgentMetricEvents(agentId)))).flat();
    expect(disputeMetrics.filter((event) => event.sourceId === disputeId && event.type === 'mission_refunded')).toHaveLength(matches.length);
    expect(disputeMetrics.filter((event) => event.sourceId === disputeId && event.type === 'dispute_lost')).toHaveLength(matches.length);
  });

  it('lets only administrators manage the arbitration council', async () => {
    const denied = await api(`/api/arbitration/members/${otherDeveloper.id}`, {
      method: 'PUT', body: JSON.stringify({ active: true }),
    }, requester.id);
    expect(denied.response.status).toBe(403);

    const appointed = await api(`/api/arbitration/members/${otherDeveloper.id}`, {
      method: 'PUT', body: JSON.stringify({ active: true }),
    }, admin.id);
    expect(appointed.response.status).toBe(200);
    expect(appointed.body.data).toMatchObject({ userId: otherDeveloper.id, status: 'active', power: 1 });

    const members = await api('/api/arbitration/members', {}, admin.id);
    expect(members.response.status).toBe(200);
    expect(members.body.data.map((item: JsonBody) => item.userId)).toContain(otherDeveloper.id);

    const users = await api('/api/admin/users', {}, admin.id);
    expect(users.body.data.find((item: JsonBody) => item.id === otherDeveloper.id).arbitration).toEqual({ status: 'active', power: 1 });
  });

  it('serializes concurrent dispute creation and accepts only the first ruling', async () => {
    const { mission } = await createMission();
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));
    await api(`/api/missions/${mission.id}/workflow`, { method: 'POST', body: JSON.stringify({ assignments }) }, requester.id);
    await acceptAllStageOffers(mission.id);
    await api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id);

    const openings = await Promise.all([
      api(`/api/missions/${mission.id}/disputes`, {
        method: 'POST', body: JSON.stringify({ reason: '并发案件 A：需要平台复核当前交付证据是否符合原始任务规格。', evidence: [] }),
      }, requester.id),
      api(`/api/missions/${mission.id}/disputes`, {
        method: 'POST', body: JSON.stringify({ reason: '并发案件 B：同一任务不能同时创建第二个仍处于活跃状态的争议。', evidence: [] }),
      }, requester.id),
    ]);
    expect(openings.map((result) => result.response.status).sort()).toEqual([201, 409]);
    expect((await store.getDisputes(mission.id))).toHaveLength(1);
    expect((await store.getEscrow(mission.id))?.status).toBe('frozen');

    const disputeId = (await store.getDisputes(mission.id))[0].id;
    await api(`/api/disputes/${disputeId}/review`, { method: 'POST', body: '{}' }, admin.id);
    const vote = await api(`/api/disputes/${disputeId}/votes`, {
      method: 'POST', body: JSON.stringify({ choice: 'support_refund', reason: '并发裁决前先完成委员会投票，授权退款结果。' }),
    }, admin.id);
    expect(vote.response.status).toBe(201);
    const rulings = await Promise.all([
      api(`/api/disputes/${disputeId}/resolve`, {
        method: 'POST', body: JSON.stringify({ status: 'resolved', resolution: '裁决 A：支持退款并终止当前任务，保留完整审计轨迹。' }),
      }, admin.id),
      api(`/api/disputes/${disputeId}/resolve`, {
        method: 'POST', body: JSON.stringify({ status: 'rejected', resolution: '裁决 B：驳回争议并恢复托管，不能覆盖首个有效结果。' }),
      }, admin.id),
    ]);
    expect(rulings.map((result) => result.response.status).sort()).toEqual([200, 409]);
    expect((await store.listDisputeActions(disputeId))).toHaveLength(2);
    expect((await store.getWalletAccount(requester.id)).transactions.filter((item) => item.type === 'refund')).toHaveLength(
      (await store.getEscrow(mission.id))?.status === 'refunded' ? 1 : 0,
    );
  });

  it('paginates developer ledger entries with an opaque cursor', async () => {
    for (let index = 0; index < 3; index += 1) {
      store.ledgerEntries.push({
        id: `ledger-page-${index}`,
        missionId: `mission-page-${index}`,
        missionTitle: `Paged Mission ${index}`,
        agentId: 'research-agent',
        agentName: 'research-agent',
        entryType: 'agent_payout',
        amount: 10 + index,
        token: 'CREDIT',
        status: 'settled',
        txHash: null,
        createdAt: `2026-08-${String(10 + index).padStart(2, '0')}T00:00:00.000Z`,
      });
    }

    const first = await api('/api/developer/ledger?limit=1', {}, developer.id);
    expect(first.response.status).toBe(200);
    expect(first.body.data.entries).toHaveLength(1);
    expect(first.body.data.pageInfo.hasMore).toBe(true);
    expect(typeof first.body.data.pageInfo.nextCursor).toBe('string');
    expect(first.body.data.weekly.length).toBeGreaterThan(0);

    const second = await api(`/api/developer/ledger?limit=1&cursor=${encodeURIComponent(first.body.data.pageInfo.nextCursor)}`, {}, developer.id);
    expect(second.response.status).toBe(200);
    expect(second.body.data.entries[0].id).not.toBe(first.body.data.entries[0].id);

    const invalid = await api('/api/developer/ledger?cursor=not-a-valid-cursor', {}, developer.id);
    expect(invalid.response.status).toBe(400);
    expect(invalid.body.error.code).toBe('INVALID_CURSOR');
  });

  it('creates an idempotent mission with normalized workflow budgets', async () => {
    const first = await createMission('mission-create-0001');
    const second = await createMission('mission-create-0001');

    expect(second.mission.id).toBe(first.mission.id);
    expect(store.missions.size).toBe(1);
    expect(first.stages.reduce((sum, stage) => sum + stage.budget, 0)).toBe(300);
    expect(first.mission.compiledSpec?.compiler).toMatchObject({ engine: 'langgraph' });
    const event = (await store.listEvents(first.mission.id)).find((item) => item.type === 'mission.created');
    expect(event?.payload).toMatchObject({ source: 'adaptive-fallback', compiler: { engine: 'langgraph' } });
  });

  it('compiles a complex mission through LangGraph and reports adaptive fallback metadata', async () => {
    const created = await api('/api/missions', {
      method: 'POST',
      body: JSON.stringify({
        title: '支付平台全栈架构迁移与生产发布',
        description: '重构大型多模块平台：完成 React 前端、Cloudflare Worker API、D1 数据库迁移、钱包支付鉴权、安全审查、端到端测试、部署监控和回滚方案。需要并行开发、集成联调和生产上线审批。',
        category: '软件工程',
        tags: ['React', 'Worker', 'D1', '支付', '安全', '部署'],
        budget: 1_200,
        paymentMethod: 'web2_balance',
        deadline: '2026-09-01',
        priority: 'urgent',
        expertise: 'principal',
        yieldEnabled: false,
      }),
    }, requester.id);
    const missionId = created.body.data.mission.id;
    const compiled = await api(`/api/missions/${missionId}/compile`, { method: 'POST', body: '{}' }, requester.id);

    expect(compiled.response.status).toBe(200);
    expect(compiled.body.meta.source).toBe('adaptive-fallback');
    expect(compiled.body.meta.compiler).toMatchObject({
      engine: 'langgraph',
      complexity: 'complex',
      modelCalls: 3,
      repairAttempts: 1,
    });
    const stages = compiled.body.data.stages as WorkflowStage[];
    const edges = compiled.body.data.edges as Array<{ sourceStageId: string; targetStageId: string }>;
    expect(stages.filter((stage) => stage.nodeType === 'task').length).toBeGreaterThanOrEqual(6);
    expect(stages.some((stage) => stage.nodeType === 'approval')).toBe(true);
    expect(stages.some((stage) => edges.filter((edge) => edge.sourceStageId === stage.id).length > 1)).toBe(true);
    expect(stages.some((stage) => edges.filter((edge) => edge.targetStageId === stage.id).length > 1)).toBe(true);
    const event = (await store.listEvents(missionId)).find((item) => item.type === 'mission.compiled');
    expect(event?.payload).toMatchObject({ source: 'adaptive-fallback', compiler: { engine: 'langgraph' } });
  });

  it('saves a connected DAG with optimistic locking and rejects a cycle', async () => {
    const { mission, stages } = await createMission();
    const now = '2026-08-16T00:00:00.000Z';
    const gate: WorkflowStage = {
      id: 'STAGE-approval-gate', missionId: mission.id, position: 4, nodeType: 'approval',
      positionX: 1040, positionY: 180, progress: 0, name: '任务方集成审批',
      purpose: '确认两个并行分支和汇合结果满足验收标准。', category: '人工审批', budget: 0,
      status: 'queued', agentId: null, input: { approvalCriteria: '结果完整且证据可核验' }, output: null,
      createdAt: now, updatedAt: now,
    };
    const nodes = [
      { ...stages[0], positionX: 80, positionY: 60 },
      { ...stages[1], positionX: 80, positionY: 300 },
      { ...stages[2], positionX: 560, positionY: 180 },
      gate,
    ];
    const edges = [
      { id: 'EDGE-root-a-join', sourceStageId: stages[0].id, targetStageId: stages[2].id },
      { id: 'EDGE-root-b-join', sourceStageId: stages[1].id, targetStageId: stages[2].id },
      { id: 'EDGE-join-gate', sourceStageId: stages[2].id, targetStageId: gate.id },
    ];

    const saved = await api(`/api/missions/${mission.id}/workflow/draft`, {
      method: 'PUT', body: JSON.stringify({ workflowVersion: 1, nodes, edges, viewport: { x: 12, y: 18, zoom: 0.85 } }),
    }, requester.id);
    expect(saved.response.status).toBe(200);
    expect(saved.body.data.mission.workflowVersion).toBe(2);
    expect(saved.body.data.edges).toHaveLength(3);
    expect(saved.body.data.stages.map((stage: JsonBody) => stage.position)).toEqual([1, 2, 3, 4]);

    const stale = await api(`/api/missions/${mission.id}/workflow/draft`, {
      method: 'PUT', body: JSON.stringify({ workflowVersion: 1, nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } }),
    }, requester.id);
    expect(stale.response.status).toBe(409);
    expect(stale.body.error.code).toBe('WORKFLOW_VERSION_CONFLICT');

    const cyclic = await api(`/api/missions/${mission.id}/workflow/draft`, {
      method: 'PUT', body: JSON.stringify({
        workflowVersion: 2, nodes, viewport: { x: 0, y: 0, zoom: 1 },
        edges: [...edges, { id: 'EDGE-cycle', sourceStageId: gate.id, targetStageId: stages[0].id }],
      }),
    }, requester.id);
    expect(cyclic.response.status).toBe(400);
    expect(cyclic.body.error.code).toBe('WORKFLOW_CYCLE');
  });

  it('rejects every invalid graph boundary before mutating the workflow version', async () => {
    const { mission, stages } = await createMission();
    const draft = (nodes: WorkflowStage[], edges: Array<{ id: string; sourceStageId: string; targetStageId: string }>) => api(
      `/api/missions/${mission.id}/workflow/draft`,
      { method: 'PUT', body: JSON.stringify({ workflowVersion: 1, nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } }) },
      requester.id,
    );

    const selfLoop = await draft(stages, [
      { id: 'EDGE-self', sourceStageId: stages[0].id, targetStageId: stages[0].id },
      { id: 'EDGE-1-2', sourceStageId: stages[0].id, targetStageId: stages[1].id },
      { id: 'EDGE-2-3', sourceStageId: stages[1].id, targetStageId: stages[2].id },
    ]);
    expect(selfLoop.body.error.code).toBe('WORKFLOW_SELF_LOOP');

    const duplicate = await draft(stages, [
      { id: 'EDGE-duplicate-a', sourceStageId: stages[0].id, targetStageId: stages[1].id },
      { id: 'EDGE-duplicate-b', sourceStageId: stages[0].id, targetStageId: stages[1].id },
      { id: 'EDGE-2-3', sourceStageId: stages[1].id, targetStageId: stages[2].id },
    ]);
    expect(duplicate.body.error.code).toBe('DUPLICATE_EDGE');

    const disconnected = await draft(stages, [
      { id: 'EDGE-only', sourceStageId: stages[0].id, targetStageId: stages[1].id },
    ]);
    expect(disconnected.body.error.code).toBe('WORKFLOW_DISCONNECTED');

    const missingPosition = await draft([
      { ...stages[0], positionX: undefined },
      stages[1],
      stages[2],
    ] as unknown as WorkflowStage[], [
      { id: 'EDGE-position-1', sourceStageId: stages[0].id, targetStageId: stages[1].id },
      { id: 'EDGE-position-2', sourceStageId: stages[1].id, targetStageId: stages[2].id },
    ]);
    expect(missingPosition.body.error.code).toBe('INVALID_NODE_POSITION');

    const overlapping = await draft(stages.map((stage) => ({ ...stage, positionX: 80, positionY: 80 })), [
      { id: 'EDGE-overlap-1', sourceStageId: stages[0].id, targetStageId: stages[1].id },
      { id: 'EDGE-overlap-2', sourceStageId: stages[1].id, targetStageId: stages[2].id },
    ]);
    expect(overlapping.body.error.code).toBe('WORKFLOW_NODE_OVERLAP');

    const badBudget = await draft([
      { ...stages[0], budget: stages[0].budget + 1 },
      stages[1],
      stages[2],
    ], [
      { id: 'EDGE-1-2', sourceStageId: stages[0].id, targetStageId: stages[1].id },
      { id: 'EDGE-2-3', sourceStageId: stages[1].id, targetStageId: stages[2].id },
    ]);
    expect(badBudget.body.error.code).toBe('WORKFLOW_BUDGET_MISMATCH');

    const gate = {
      ...stages[0],
      id: 'STAGE-root-gate',
      nodeType: 'approval' as const,
      name: '无上游审批',
      category: '人工审批',
      budget: 0,
      agentId: null,
      input: { approvalCriteria: '至少一个直接上游完成后才能审批' },
    };
    const tasks = [
      { ...stages[1], budget: stages[0].budget + stages[1].budget },
      stages[2],
    ];
    const rootGate = await draft([gate, ...tasks], [
      { id: 'EDGE-gate-task', sourceStageId: gate.id, targetStageId: tasks[0].id },
      { id: 'EDGE-task-task', sourceStageId: tasks[0].id, targetStageId: tasks[1].id },
    ]);
    expect(rootGate.body.error.code).toBe('INVALID_APPROVAL_NODE');

    const oversizedNodes = Array.from({ length: 31 }, (_, index) => ({
      ...stages[index % stages.length],
      id: `STAGE-oversized-${index}`,
      position: index + 1,
      budget: index === 0 ? mission.budget : 0,
    }));
    const oversized = await draft(oversizedNodes, oversizedNodes.slice(1).map((node, index) => ({
      id: `EDGE-oversized-${index}`,
      sourceStageId: oversizedNodes[index].id,
      targetStageId: node.id,
    })));
    expect(oversized.body.error.code).toBe('WORKFLOW_TOO_LARGE');

    const edgeLimitNodes = Array.from({ length: 30 }, (_, index) => ({
      ...stages[index % stages.length],
      id: `STAGE-edge-limit-${index}`,
      position: index + 1,
      budget: 10,
    }));
    const tooManyEdges: Array<{ id: string; sourceStageId: string; targetStageId: string }> = [];
    for (let source = 0; source < edgeLimitNodes.length && tooManyEdges.length < 81; source += 1) {
      for (let target = source + 1; target < edgeLimitNodes.length && tooManyEdges.length < 81; target += 1) {
        tooManyEdges.push({
          id: `EDGE-limit-${source}-${target}`,
          sourceStageId: edgeLimitNodes[source].id,
          targetStageId: edgeLimitNodes[target].id,
        });
      }
    }
    const oversizedEdges = await draft(edgeLimitNodes, tooManyEdges);
    expect(oversizedEdges.body.error.code).toBe('WORKFLOW_TOO_LARGE');

    const duplicateNodes = await draft([
      { ...stages[0], id: 'STAGE-duplicate', budget: 150 },
      { ...stages[1], id: 'STAGE-duplicate', budget: 150 },
    ], []);
    expect(duplicateNodes.body.error.code).toBe('DUPLICATE_NODE');

    const invalidMode = await draft([
      { ...stages[0], input: { ...stages[0].input, executionMode: 'auto-switch-agent' } },
      stages[1],
      stages[2],
    ], [
      { id: 'EDGE-mode-1', sourceStageId: stages[0].id, targetStageId: stages[1].id },
      { id: 'EDGE-mode-2', sourceStageId: stages[1].id, targetStageId: stages[2].id },
    ]);
    expect(invalidMode.body.error.code).toBe('INVALID_EXECUTION_MODE');

    expect((await store.getMission(mission.id))?.workflowVersion).toBe(1);
  });

  it('rejects missing or inactive assignments and locks the graph after escrow starts', async () => {
    const { mission, stages } = await createMission();
    const missing = await api(`/api/missions/${mission.id}/workflow`, {
      method: 'POST', body: JSON.stringify({ assignments: {} }),
    }, requester.id);
    expect(missing.response.status).toBe(400);
    expect(missing.body.error.code).toBe('INVALID_ASSIGNMENT');

    const inactive = await api(`/api/missions/${mission.id}/workflow`, {
      method: 'POST',
      body: JSON.stringify({ assignments: Object.fromEntries(stages.map((stage) => [stage.id, 'AGENT-does-not-exist'])) }),
    }, requester.id);
    expect(inactive.response.status).toBe(400);
    expect(inactive.body.error.code).toBe('INVALID_ASSIGNMENT');

    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));
    await api(`/api/missions/${mission.id}/workflow`, { method: 'POST', body: JSON.stringify({ assignments }) }, requester.id);
    await acceptAllStageOffers(mission.id);
    expect((await api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id)).response.status).toBe(200);

    const locked = await api(`/api/missions/${mission.id}/workflow/draft`, {
      method: 'PUT',
      body: JSON.stringify({
        workflowVersion: 1,
        nodes: stages,
        edges: [
          { id: 'EDGE-locked-1', sourceStageId: stages[0].id, targetStageId: stages[1].id },
          { id: 'EDGE-locked-2', sourceStageId: stages[1].id, targetStageId: stages[2].id },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      }),
    }, requester.id);
    expect(locked.response.status).toBe(409);
    expect(locked.body.error.code).toBe('WORKFLOW_LOCKED');
  });

  it('fans out root nodes, joins direct handoffs, and pauses at an approval Gate', async () => {
    const { mission, stages } = await createMission();
    const gate: WorkflowStage = {
      id: 'STAGE-runtime-gate', missionId: mission.id, position: 4, nodeType: 'approval',
      positionX: 1040, positionY: 180, progress: 0, name: '并行结果审批',
      purpose: '审批汇合节点的最终输出。', category: '人工审批', budget: 0, status: 'queued', agentId: null,
      input: { approvalCriteria: '两个根任务均有证据，汇合结果完整' }, output: null,
      createdAt: mission.createdAt, updatedAt: mission.updatedAt,
    };
    const nodes = [stages[0], stages[1], stages[2], gate];
    const edges = [
      { id: 'EDGE-a-c', sourceStageId: stages[0].id, targetStageId: stages[2].id },
      { id: 'EDGE-b-c', sourceStageId: stages[1].id, targetStageId: stages[2].id },
      { id: 'EDGE-c-g', sourceStageId: stages[2].id, targetStageId: gate.id },
    ];
    const saved = await api(`/api/missions/${mission.id}/workflow/draft`, {
      method: 'PUT', body: JSON.stringify({ workflowVersion: 1, nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } }),
    }, requester.id);
    expect(saved.response.status).toBe(200);
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    expect(matches).toHaveLength(3);
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));
    const workflow = await api(`/api/missions/${mission.id}/workflow`, {
      method: 'POST', body: JSON.stringify({ assignments }),
    }, requester.id);
    expect(workflow.body.data.offers).toHaveLength(3);
    await acceptAllStageOffers(mission.id);
    await api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id);

    const roots = await api(`/api/missions/${mission.id}/dispatch`, { method: 'POST', body: '{}' }, requester.id);
    expect(roots.response.status).toBe(202);
    expect(roots.body.data.dispatches).toHaveLength(2);
    expect(dispatchCalls).toBe(2);
    expect(dispatchedBodies).toHaveLength(2);
    expect(dispatchedBodies.every((body) => body.task.upstream.length === 0)).toBe(true);
    expect(dispatchedAgentHeaders.sort()).toEqual(dispatchedBodies.map((body) => body.task.agent.id).sort());

    const complete = async (body: JsonBody, callbackId: string) => api(`/api/hooks/agents/${body.task.agent.id}/events`, {
      method: 'POST', headers: { 'X-AgentMesh-Signature': body.callback.signature },
      body: JSON.stringify({
        missionId: mission.id, stageId: body.task.node.id, runId: body.callback.runId,
        callbackId, expiresAt: body.callback.expiresAt, status: 'done', progress: 100,
        output: {
          summary: `Output for ${body.task.node.id}`,
          findings: ['可验证结果'],
          artifactId: `ART-${callbackId}`,
          debugPayload: { shouldNotReachSuccessors: true },
        },
        ...(body.task.node.input?.executionMode === 'implement' ? {
          artifacts: [{
            name: `Artifact for ${body.task.node.id}`,
            uri: `ipfs://bafy${callbackId.replaceAll('-', '')}`,
            contentHash: `sha256:${'a'.repeat(64)}`,
            mimeType: 'application/json',
          }],
        } : {}),
      }),
    });
    expect((await complete(dispatchedBodies[0], 'callback-dag-root-a')).response.status).toBe(202);
    const prematureJoin = await api(`/api/missions/${mission.id}/dispatch`, { method: 'POST', body: '{}' }, requester.id);
    expect(prematureJoin.response.status).toBe(409);
    expect((await complete(dispatchedBodies[1], 'callback-dag-root-b')).response.status).toBe(202);
    const rootArtifact = await api(`/api/missions/${mission.id}/deliverables`, {
      method: 'POST',
      body: JSON.stringify({
        stageId: stages[0].id,
        name: '根节点证据包',
        uri: 'ipfs://bafydagrootartifact',
        contentHash: 'sha256:dag-root-artifact',
        mimeType: 'application/json',
      }),
    }, developer.id);
    expect(rootArtifact.response.status).toBe(201);

    dispatchedBodies = [];
    dispatchedAgentHeaders = [];
    const join = await api(`/api/missions/${mission.id}/dispatch`, { method: 'POST', body: '{}' }, requester.id);
    expect(join.response.status).toBe(202);
    expect(dispatchedBodies).toHaveLength(1);
    expect(dispatchedBodies[0].task.upstream).toHaveLength(2);
    expect(new Set(dispatchedBodies[0].task.upstream.map((item: JsonBody) => item.id))).toEqual(new Set([stages[0].id, stages[1].id]));
    const firstHandoff = dispatchedBodies[0].task.upstream.find((item: JsonBody) => item.id === stages[0].id);
    expect(firstHandoff.handoff).toMatchObject({ summary: `Output for ${stages[0].id}`, findings: ['可验证结果'] });
    expect(firstHandoff.handoff).not.toHaveProperty('debugPayload');
    expect(firstHandoff.output).not.toHaveProperty('artifactId');
    expect(firstHandoff.artifacts).toEqual([expect.objectContaining({
      name: '根节点证据包',
      uri: 'ipfs://bafydagrootartifact',
      contentHash: 'sha256:dag-root-artifact',
    })]);
    expect((await complete(dispatchedBodies[0], 'callback-dag-join')).response.status).toBe(202);

    const waiting = await api(`/api/missions/${mission.id}`, {}, requester.id);
    const waitingGate = waiting.body.data.stages.find((stage: JsonBody) => stage.id === gate.id);
    expect(waitingGate.status).toBe('running');
    expect(waiting.body.data.offers.every((offer: JsonBody) => offer.stageId !== gate.id)).toBe(true);

    const unauthorized = await api(`/api/missions/${mission.id}/gates/${gate.id}/decision`, {
      method: 'POST', body: JSON.stringify({ decision: 'approved' }),
    }, developer.id);
    expect(unauthorized.response.status).toBe(403);

    const missingFeedback = await api(`/api/missions/${mission.id}/gates/${gate.id}/decision`, {
      method: 'POST', body: JSON.stringify({ decision: 'rejected', reworkNodeIds: [stages[2].id] }),
    }, requester.id);
    expect(missingFeedback.body.error.code).toBe('GATE_FEEDBACK_REQUIRED');

    const missingRework = await api(`/api/missions/${mission.id}/gates/${gate.id}/decision`, {
      method: 'POST', body: JSON.stringify({ decision: 'rejected', feedback: '需要明确返工节点' }),
    }, requester.id);
    expect(missingRework.body.error.code).toBe('REWORK_NODE_REQUIRED');

    const rejected = await api(`/api/missions/${mission.id}/gates/${gate.id}/decision`, {
      method: 'POST', body: JSON.stringify({ decision: 'rejected', feedback: '汇合摘要缺少风险项', reworkNodeIds: [stages[2].id] }),
    }, requester.id);
    expect(rejected.response.status).toBe(200);
    expect(rejected.body.data.stages.find((stage: JsonBody) => stage.id === stages[2].id).status).toBe('queued');
    expect(rejected.body.data.stages.find((stage: JsonBody) => stage.id === gate.id).status).toBe('queued');
    const rejectionEvent = (await store.listEvents(mission.id)).find((event) => event.type === 'gate.rejected');
    expect(rejectionEvent?.payload.priorOutputs).toHaveProperty(stages[2].id);

    dispatchedBodies = [];
    const rework = await api(`/api/missions/${mission.id}/dispatch`, { method: 'POST', body: '{}' }, requester.id);
    expect(rework.response.status).toBe(202);
    expect(rework.body.data.stage.id).toBe(stages[2].id);
    expect((await complete(dispatchedBodies[0], 'callback-dag-rework')).response.status).toBe(202);
    expect((await store.listStages(mission.id)).find((stage) => stage.id === gate.id)?.status).toBe('running');

    const approved = await api(`/api/missions/${mission.id}/gates/${gate.id}/decision`, {
      method: 'POST', body: JSON.stringify({ decision: 'approved', feedback: '集成结果通过' }),
    }, requester.id);
    expect(approved.response.status).toBe(200);
    expect(approved.body.data.mission.status).toBe('review');
    expect(approved.body.data.stages.every((stage: JsonBody) => stage.status === 'done')).toBe(true);
  });

  it('claims an idempotency key atomically while the first request is in progress', async () => {
    const [first, second] = await Promise.all([
      store.claimIdempotent(requester.id, 'parallel-operation', 'POST', '/api/missions', 'same-request-hash'),
      store.claimIdempotent(requester.id, 'parallel-operation', 'POST', '/api/missions', 'same-request-hash'),
    ]);
    expect([first.state, second.state].sort()).toEqual(['acquired', 'pending']);
  });

  it('rejects an idempotency key reused with a different request body', async () => {
    await createMission('payload-bound-operation');
    const changed = await api('/api/missions', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'payload-bound-operation' },
      body: JSON.stringify({
        title: '生成一份可信的市场进入策略报告',
        description: '研究目标市场、核验数据，并形成包含证据、风险和行动建议的完整报告。',
        category: '商业研究',
        tags: ['研究', '报告'],
        budget: 301,
        paymentMethod: 'web2_balance',
        deadline: '2026-09-01',
        priority: 'high',
        expertise: 'expert',
        yieldEnabled: true,
      }),
    }, requester.id);
    expect(changed.response.status).toBe(409);
    expect(changed.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(store.missions.size).toBe(1);
  });

  it('credits a fixed Web2 test balance only once per 24 hours', async () => {
    store.walletBalances.set(requester.id, 0);
    const first = await api('/api/wallet/test-topup', { method: 'POST', body: '{}' }, requester.id);
    const second = await api('/api/wallet/test-topup', { method: 'POST', body: '{}' }, requester.id);

    expect(first.response.status).toBe(201);
    expect(first.body.data.credited).toBe(true);
    expect(first.body.data.account.balance).toBe(100);
    expect(second.response.status).toBe(200);
    expect(second.body.data.credited).toBe(false);
    expect(second.body.data.account.balance).toBe(100);
    expect(second.body.data.account.transactions).toHaveLength(1);
  });

  it('keeps test credits disabled outside an explicitly enabled test deployment', async () => {
    const response = await app.fetch(new Request('http://local.test/api/wallet/test-topup', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-User': requester.id }, body: '{}',
    }), { API_KEY: 'secret', PROJECT_NAME: 'production-project' });
    const body = await response.json() as JsonBody;
    expect(response.status).toBe(403);
    expect(body.error.code).toBe('TEST_TOPUP_DISABLED');
  });

  it('matches candidates, confirms a team, and starts execution', async () => {
    const { mission, stages } = await createMission();
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));

    expect(candidates.response.status).toBe(200);
    expect(matches).toHaveLength(stages.length);
    expect(matches.every((match) => match.candidates.length > 0)).toBe(true);

    const workflow = await api(`/api/missions/${mission.id}/workflow`, {
      method: 'POST',
      body: JSON.stringify({ assignments }),
    }, requester.id);
    expect(workflow.response.status).toBe(200);
    expect(workflow.body.data.mission.team.length).toBeGreaterThan(0);
    expect(workflow.body.data.offers).toHaveLength(stages.length);
    await acceptAllStageOffers(mission.id);
    const readyForPayment = await api(`/api/missions/${mission.id}`, {}, requester.id);
    expect(readyForPayment.body.data.mission.status).toBe('matching');
    expect(readyForPayment.body.data.mission.currentStage).toBe('Agent 已全部接单，等待托管支付');

    const started = await api(`/api/missions/${mission.id}/start`, {
      method: 'POST',
      body: '{}',
    }, requester.id);
    expect(started.response.status).toBe(200);
    expect(started.body.data.mission.status).toBe('running');
    expect(started.body.data.escrow.status).toBe('held');
    expect((await store.getWalletAccount(requester.id)).balance).toBe(700);
  });

  it('requires every current stage offer to be accepted before charging the requester', async () => {
    const { mission } = await createMission();
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));
    const workflow = await api(`/api/missions/${mission.id}/workflow`, {
      method: 'POST', body: JSON.stringify({ assignments }),
    }, requester.id);
    const firstOffer = workflow.body.data.offers[0];

    const replayedWorkflow = await api(`/api/missions/${mission.id}/workflow`, {
      method: 'POST', body: JSON.stringify({ assignments }),
    }, requester.id);
    expect(replayedWorkflow.response.status).toBe(200);
    expect(replayedWorkflow.body.meta.replayed).toBe(true);
    expect(replayedWorkflow.body.data.offers.map((offer: JsonBody) => offer.id)).toEqual(
      workflow.body.data.offers.map((offer: JsonBody) => offer.id),
    );

    const prematureStart = await api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id);
    expect(prematureStart.response.status).toBe(409);
    expect(prematureStart.body.error.code).toBe('OFFERS_NOT_ACCEPTED');
    expect((await store.getWalletAccount(requester.id)).balance).toBe(1_000);

    const declined = await api(`/api/missions/${mission.id}/offers/${firstOffer.id}`, {
      method: 'POST', body: JSON.stringify({ decision: 'declined' }),
    }, developer.id);
    expect(declined.response.status).toBe(200);
    expect(declined.body.data.status).toBe('declined');
    const blockedStart = await api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id);
    expect(blockedStart.body.error.code).toBe('OFFERS_NOT_ACCEPTED');
    expect((await store.getWalletAccount(requester.id)).balance).toBe(1_000);

    const reissued = await api(`/api/missions/${mission.id}/workflow`, {
      method: 'POST', body: JSON.stringify({ assignments }),
    }, requester.id);
    expect(reissued.body.data.offers.every((offer: JsonBody) => offer.status === 'pending')).toBe(true);
    expect(reissued.body.data.offers.map((offer: JsonBody) => offer.id)).not.toContain(firstOffer.id);
    await acceptAllStageOffers(mission.id);
    const started = await api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id);
    expect(started.response.status).toBe(200);
    expect((await store.getWalletAccount(requester.id)).balance).toBe(700);
  });

  it('allows only the assigned Agent owner to answer a pending, unexpired offer once', async () => {
    const { mission } = await createMission();
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));
    const workflow = await api(`/api/missions/${mission.id}/workflow`, {
      method: 'POST', body: JSON.stringify({ assignments }),
    }, requester.id);
    const offer = workflow.body.data.offers[0];
    const request = { method: 'POST', body: JSON.stringify({ decision: 'accepted' }) };

    const requesterAttempt = await api(`/api/missions/${mission.id}/offers/${offer.id}`, request, requester.id);
    const outsiderAttempt = await api(`/api/missions/${mission.id}/offers/${offer.id}`, request, otherDeveloper.id);
    expect(requesterAttempt.response.status).toBe(403);
    expect(outsiderAttempt.response.status).toBe(403);

    const accepted = await api(`/api/missions/${mission.id}/offers/${offer.id}`, request, developer.id);
    expect(accepted.response.status).toBe(200);
    expect(accepted.body.data.status).toBe('accepted');
    const duplicate = await api(`/api/missions/${mission.id}/offers/${offer.id}`, request, developer.id);
    expect(duplicate.response.status).toBe(409);
    expect(duplicate.body.error.code).toBe('OFFER_ALREADY_RESPONDED');
  });

  it('treats an unanswered offer as expired and immutable after its deadline', async () => {
    const { mission } = await createMission();
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));
    const workflow = await api(`/api/missions/${mission.id}/workflow`, {
      method: 'POST', body: JSON.stringify({ assignments }),
    }, requester.id);
    const offer = workflow.body.data.offers[0];
    const afterDeadline = '2026-08-17T00:00:00.001Z';

    expect((await store.getStageOffer(offer.id, afterDeadline))?.status).toBe('expired');
    expect(await store.respondStageOffer(offer.id, developer.id, 'accepted', afterDeadline)).toBeNull();
    expect(store.stageOffers.get(mission.id)?.find((item) => item.id === offer.id)?.status).toBe('pending');
  });

  it('starts and charges a Web2 mission only once under concurrent requests', async () => {
    const { mission } = await createMission();
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));
    await api(`/api/missions/${mission.id}/workflow`, { method: 'POST', body: JSON.stringify({ assignments }) }, requester.id);
    await acceptAllStageOffers(mission.id);

    const starts = await Promise.all([
      api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id),
      api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id),
    ]);
    expect(starts.map((result) => result.response.status)).toEqual([200, 200]);
    expect((await store.getWalletAccount(requester.id)).balance).toBe(700);
    expect((await store.getWalletAccount(requester.id)).transactions.filter((item) => item.type === 'mission_hold' && item.missionId === mission.id)).toHaveLength(1);
    expect((await store.listEvents(mission.id)).filter((event) => event.type === 'mission.started')).toHaveLength(1);
  });

  it('locks workflow assignments after escrow funding starts', async () => {
    const { mission } = await createMission();
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));
    await api(`/api/missions/${mission.id}/workflow`, { method: 'POST', body: JSON.stringify({ assignments }) }, requester.id);
    await acceptAllStageOffers(mission.id);
    await api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id);

    const rewrite = await api(`/api/missions/${mission.id}/workflow`, {
      method: 'POST', body: JSON.stringify({ assignments }),
    }, requester.id);
    expect(rewrite.response.status).toBe(409);
    expect(rewrite.body.error.code).toBe('WORKFLOW_LOCKED');
  });

  it('commits deterministic payout recipients and changes the hash when a recipient changes', async () => {
    const { stages } = await createMission();
    const agents = [...store.agents.values()];
    const assigned = stages.map((stage, index) => ({ ...stage, agentId: agents[index % agents.length].id }));
    const first = buildSettlementPlan(assigned, agents);
    const reordered = buildSettlementPlan([...assigned].reverse(), [...agents].reverse());
    expect(reordered.payoutHash).toBe(first.payoutHash);

    const changedAgents = agents.map((item) => item.id === assigned[0].agentId
      ? { ...item, wallet: '0x4400000000000000000000000000000000009A11' }
      : item);
    expect(buildSettlementPlan(assigned, changedAgents).payoutHash).not.toBe(first.payoutHash);
  });

  it('rejects a Web2 mission start when the recharged balance is insufficient', async () => {
    store.walletBalances.set(requester.id, 20);
    const { mission } = await createMission();
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));
    await api(`/api/missions/${mission.id}/workflow`, { method: 'POST', body: JSON.stringify({ assignments }) }, requester.id);
    await acceptAllStageOffers(mission.id);

    const started = await api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id);
    expect(started.response.status).toBe(409);
    expect(started.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect((await store.getWalletAccount(requester.id)).balance).toBe(20);
  });

  it('uses the verified on-chain depositor when profile identity has no wallet', async () => {
    const { mission } = await createMission(undefined, 'web3_musdc');
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));
    await api(`/api/missions/${mission.id}/workflow`, { method: 'POST', body: JSON.stringify({ assignments }) }, requester.id);
    await acceptAllStageOffers(mission.id);

    const response = await app.fetch(new Request(`http://local.test/api/missions/${mission.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Test-User': requester.id },
      body: JSON.stringify({ depositTxHash: `0x${'1'.repeat(64)}` }),
    }), {
      ...testEnv,
      SETTLEMENT_MODE: 'contract',
      BASE_RPC_URL: 'https://base-sepolia.example.com',
      BASE_CHAIN_ID: '84532',
      ESCROW_CONTRACT_ADDRESS: '0x1100000000000000000000000000000000009A11',
      MUSDC_ADDRESS: '0x1200000000000000000000000000000000009A11',
    });
    const body = await response.json() as JsonBody;

    expect(response.status).toBe(200);
    expect(body.data.mission.status).toBe('running');
    expect(body.data.escrow.requesterWalletAddress).toBe('0x7100000000000000000000000000000000008f2c');
  });

  it('streams an authenticated mission snapshot over SSE', async () => {
    const { mission } = await createMission();
    const response = await app.fetch(new Request(`http://local.test/api/missions/${mission.id}/stream`, {
      headers: { 'X-Test-User': requester.id },
    }), testEnv);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');
    const reader = response.body!.getReader();
    const first = await reader.read();
    await reader.cancel();
    expect(new TextDecoder().decode(first.value)).toContain('event: mission');
  });

  it('dispatches the next stage and accepts only its signed Agent callback', async () => {
    const { mission } = await createMission();
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));
    await api(`/api/missions/${mission.id}/workflow`, { method: 'POST', body: JSON.stringify({ assignments }) }, requester.id);
    await acceptAllStageOffers(mission.id);
    await api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id);

    const dispatched = await api(`/api/missions/${mission.id}/dispatch`, { method: 'POST', body: '{}' }, requester.id);
    expect(dispatched.response.status).toBe(202);
    expect(dispatched.body.data.stage.status).toBe('running');
    expect(dispatchedBody?.callback.signature).toHaveLength(64);
    expect(dispatchedBody?.callback.runId).toBeTruthy();
    expect(dispatchedBody?.task.upstream).toEqual([]);
    expect(dispatchedBody?.task.stage).toMatchObject({ position: 1, totalStages: 3 });

    const unsigned = await api(`/api/hooks/agents/${dispatched.body.data.agent.id}/events`, {
      method: 'POST',
      body: JSON.stringify({
        missionId: mission.id, stageId: dispatched.body.data.stage.id, status: 'done', progress: 30,
        runId: dispatchedBody?.callback.runId, callbackId: 'callback-unsigned-1', expiresAt: dispatchedBody?.callback.expiresAt,
      }),
    });
    expect(unsigned.response.status).toBe(401);

    const callback = await api(`/api/hooks/agents/${dispatched.body.data.agent.id}/events`, {
      method: 'POST',
      headers: { 'X-AgentMesh-Signature': dispatchedBody?.callback.signature },
      body: JSON.stringify({
        missionId: mission.id,
        stageId: dispatched.body.data.stage.id,
        runId: dispatchedBody?.callback.runId,
        callbackId: 'callback-signed-0001',
        expiresAt: dispatchedBody?.callback.expiresAt,
        status: 'done',
        progress: 30,
        message: '阶段已完成并生成可验证输出',
        output: { summary: 'Callback test output', verified: true, rawModelResponse: 'must-not-persist' },
        payload: { phase: 'verification', apiKey: 'must-not-persist', rawModelResponse: 'must-not-persist' },
      }),
    });
    expect(callback.response.status).toBe(202);
    expect(callback.body.data.stage.status).toBe('done');
    expect(callback.body.data.stage.output).not.toHaveProperty('rawModelResponse');
    const callbackEvent = (await store.listEvents(mission.id)).find((event) => event.type === 'stage.done');
    expect(callbackEvent?.payload).toMatchObject({ phase: 'verification', artifactCount: 0 });
    expect(callbackEvent?.payload).not.toHaveProperty('apiKey');
    expect(callbackEvent?.payload).not.toHaveProperty('rawModelResponse');
    expect(store.agentPerformance.size).toBe(1);
    expect(store.agents.get(dispatched.body.data.agent.id)?.successRate).toBe(93.3);

    const duplicate = await api(`/api/hooks/agents/${dispatched.body.data.agent.id}/events`, {
      method: 'POST',
      headers: { 'X-AgentMesh-Signature': dispatchedBody?.callback.signature },
      body: JSON.stringify({
        missionId: mission.id,
        stageId: dispatched.body.data.stage.id,
        runId: dispatchedBody?.callback.runId,
        callbackId: 'callback-signed-0001',
        expiresAt: dispatchedBody?.callback.expiresAt,
        status: 'done', progress: 30,
        output: { summary: 'Callback test output', verified: true },
      }),
    });
    expect(duplicate.response.status).toBe(200);
    expect(duplicate.body.meta.replayed).toBe(true);
    expect(store.agentPerformance.size).toBe(1);

    const lateMutation = await api(`/api/hooks/agents/${dispatched.body.data.agent.id}/events`, {
      method: 'POST',
      headers: { 'X-AgentMesh-Signature': dispatchedBody?.callback.signature },
      body: JSON.stringify({
        missionId: mission.id,
        stageId: dispatched.body.data.stage.id,
        runId: dispatchedBody?.callback.runId,
        callbackId: 'callback-late-mutation',
        expiresAt: dispatchedBody?.callback.expiresAt,
        status: 'running',
        progress: 5,
      }),
    });
    expect(lateMutation.response.status).toBe(410);
    expect(lateMutation.body.error.code).toBe('CALLBACK_EXPIRED');
    expect((await store.listStages(mission.id)).find((stage) => stage.id === dispatched.body.data.stage.id)?.status).toBe('done');
    expect(store.agentPerformance.size).toBe(1);
  });

  it('dispatches a queued stage only once under concurrent requests', async () => {
    const { mission } = await createMission();
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));
    await api(`/api/missions/${mission.id}/workflow`, { method: 'POST', body: JSON.stringify({ assignments }) }, requester.id);
    await acceptAllStageOffers(mission.id);
    await api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id);

    const responses = await Promise.all([
      api(`/api/missions/${mission.id}/dispatch`, { method: 'POST', body: '{}' }, requester.id),
      api(`/api/missions/${mission.id}/dispatch`, { method: 'POST', body: '{}' }, requester.id),
    ]);
    expect(responses.map((result) => result.response.status).sort()).toEqual([202, 409]);
    expect(dispatchCalls).toBe(1);
  });

  it('recovers a stale outbox claim with the same Agent task run ID', async () => {
    const { mission } = await createMission();
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));
    await api(`/api/missions/${mission.id}/workflow`, { method: 'POST', body: JSON.stringify({ assignments }) }, requester.id);
    await acceptAllStageOffers(mission.id);
    await api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id);

    const [outbox] = await store.listPendingDispatches(10, currentNow);
    expect(outbox).toBeTruthy();
    expect(await store.claimDispatch(outbox.id, currentNow)).toBe(true);
    expect(await store.claimStageForDispatch(mission.id, outbox.stageId)).toMatchObject({ status: 'running' });

    currentNow = '2026-08-16T00:03:00.000Z';
    const recovered = await api(`/api/missions/${mission.id}/dispatch`, { method: 'POST', body: '{}' }, requester.id);
    expect(recovered.response.status).toBe(202);
    expect(dispatchedBody?.callback.runId).toBe(outbox.runId);
    expect(dispatchedBody?.callback.expiresAt).toBe(outbox.expiresAt);
    expect(dispatchCalls).toBe(1);
    expect(store.dispatchOutbox.get(outbox.id)?.status).toBe('done');
  });

  it('reports missing Agent authentication and requires an explicit retry for the failed node', async () => {
    const { mission } = await createMission();
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));
    await api(`/api/missions/${mission.id}/workflow`, { method: 'POST', body: JSON.stringify({ assignments }) }, requester.id);
    await acceptAllStageOffers(mission.id);
    await api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id);

    let shouldRejectAuthentication = true;
    dispatchResponder = () => shouldRejectAuthentication
      ? Response.json({ error: 'Bearer token required' }, { status: 401 })
      : Response.json({ accepted: true, runId: 'run-test-retry' }, { status: 202 });

    const rejected = await api(`/api/missions/${mission.id}/dispatch`, { method: 'POST', body: '{}' }, requester.id);
    expect(rejected.response.status).toBe(409);
    expect(rejected.body.error.code).toBe('AGENT_AUTH_CONFIGURATION_REQUIRED');
    const failedStage = (await store.listStages(mission.id))[0];
    expect(failedStage.status).toBe('failed');
    expect(failedStage.output).toMatchObject({ httpStatus: 401, authType: 'none', retryable: true });
    expect((await store.listEvents(mission.id)).some((event) => event.type === 'dispatch.authentication_failed')).toBe(true);

    shouldRejectAuthentication = false;
    const implicitRetry = await api(`/api/missions/${mission.id}/dispatch`, { method: 'POST', body: '{}' }, requester.id);
    expect(implicitRetry.response.status).toBe(409);
    expect(implicitRetry.body.error.code).toBe('NO_RUNNABLE_NODE');
    expect(dispatchCalls).toBe(1);

    const retried = await api(`/api/missions/${mission.id}/nodes/${failedStage.id}/retry`, { method: 'POST', body: '{}' }, requester.id);
    expect(retried.response.status).toBe(200);
    expect(retried.body.data.stages).toContainEqual(expect.objectContaining({ id: failedStage.id, status: 'queued' }));

    const dispatchedRetry = await api(`/api/missions/${mission.id}/dispatch`, { method: 'POST', body: '{}' }, requester.id);
    expect(dispatchedRetry.response.status).toBe(202);
    expect(dispatchedRetry.body.data.stage).toMatchObject({ id: failedStage.id, status: 'running' });
    expect(dispatchCalls).toBe(2);
  });

  it('requires a real artifact for implement nodes before a signed workflow can enter acceptance', async () => {
    const { mission } = await createMission();
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));
    await api(`/api/missions/${mission.id}/workflow`, { method: 'POST', body: JSON.stringify({ assignments }) }, requester.id);
    await acceptAllStageOffers(mission.id);
    await api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id);

    for (let index = 0; index < matches.length; index += 1) {
      const dispatched = await api(`/api/missions/${mission.id}/dispatch`, { method: 'POST', body: '{}' }, requester.id);
      expect(dispatched.response.status).toBe(202);
      expect(dispatchedBody?.task.upstream).toHaveLength(index === 0 ? 0 : 1);
      if (index > 0) {
        expect(dispatchedBody?.task.upstream[0].output).toMatchObject({
          summary: `Signed output ${index}`,
          verified: true,
        });
      }
      const callback = dispatchedBody?.callback as JsonBody;
      const callbackBody = {
        missionId: mission.id,
        stageId: dispatched.body.data.stage.id,
        runId: callback.runId,
        callbackId: `callback-output-${index}`,
        expiresAt: callback.expiresAt,
        status: 'done',
        progress: Math.round(((index + 1) / matches.length) * 100),
        output: { summary: `Signed output ${index + 1}`, verified: true },
      };
      const isImplement = dispatched.body.data.stage.input.executionMode === 'implement';
      if (isImplement) {
        const missingArtifact = await api(`/api/hooks/agents/${dispatched.body.data.agent.id}/events`, {
          method: 'POST',
          headers: { 'X-AgentMesh-Signature': callback.signature },
          body: JSON.stringify(callbackBody),
        });
        expect(missingArtifact.response.status).toBe(422);
        expect(missingArtifact.body.error.code).toBe('ARTIFACT_REQUIRED');
        expect((await store.listAgentMetricEvents(dispatched.body.data.agent.id)).filter((event) => (
          event.type === 'artifact_invalid' && event.detail.runId === callback.runId
        ))).toHaveLength(1);
      }
      const completed = await api(`/api/hooks/agents/${dispatched.body.data.agent.id}/events`, {
        method: 'POST',
        headers: { 'X-AgentMesh-Signature': callback.signature },
        body: JSON.stringify({
          ...callbackBody,
          ...(isImplement ? {
            artifacts: [{
              name: 'Implementation source archive',
              uri: 'ipfs://bafyimplementationsource',
              contentHash: `sha256:${'b'.repeat(64)}`,
              mimeType: 'application/zip',
            }],
          } : {}),
        }),
      });
      expect(completed.response.status).toBe(202);
    }

    expect(await store.listDeliverables(mission.id)).toEqual([
      expect.objectContaining({ name: 'Implementation source archive', mimeType: 'application/zip' }),
    ]);
    expect((await store.getMission(mission.id))?.status).toBe('review');
    const accepted = await api(`/api/missions/${mission.id}/accept`, { method: 'POST', body: '{}' }, requester.id);
    expect(accepted.response.status).toBe(200);
    expect(accepted.body.data.mission.status).toBe('completed');
  });

  it('publishes and executes authenticated HTTP endpoints for official built-in Agents', async () => {
    const official = {
      ...agent('official-evidence-scout', '数据研究', 12),
      ownerId: 'agentmesh-official',
      name: 'Evidence Scout',
      endpoint: 'agentmesh://builtin/research',
      authType: 'none' as const,
      official: true,
    };
    store.agents.set(official.id, official);

    const directory = await api('/api/agents');
    const listed = (directory.body.data as Agent[]).find((item) => item.id === official.id);
    expect(listed?.endpoint).toBe('http://local.test/api/agents/official-evidence-scout/invoke');
    expect(listed?.authType).toBe('bearer');

    const documentation = await api('/api/agents/official-evidence-scout/invoke');
    expect(documentation.response.status).toBe(200);
    expect(documentation.body.data).toMatchObject({
      endpoint: 'http://local.test/api/agents/official-evidence-scout/invoke',
      method: 'POST',
      authentication: 'Bearer ID token',
    });

    const anonymous = await api('/api/agents/official-evidence-scout/invoke', {
      method: 'POST', body: JSON.stringify({ task: '核验市场数据' }),
    });
    expect(anonymous.response.status).toBe(401);
    expect(anonymous.body.error.code).toBe('AUTH_REQUIRED');

    const invoked = await api('/api/agents/official-evidence-scout/invoke', {
      method: 'POST',
      body: JSON.stringify({ task: '核验市场数据', context: { market: 'testnet' } }),
    }, requester.id);
    expect(invoked.response.status).toBe(200);
    expect(invoked.body.meta.source).toBe('pinme-llm');
    expect(invoked.body.data.agent).toMatchObject({ id: official.id, capability: 'research' });
    expect(invoked.body.data.result.summary).toContain('Official test Agent completed');
    expect(invoked.body.data.runtime.model).toBe('openai/gpt-5.6-sol');
    expect(requestedLlmModels.at(-1)).toBe('openai/gpt-5.6-sol');
  });

  it('auto-accepts and completes stages assigned to runnable official test Agents', async () => {
    const officialOwner: UserContext = {
      id: 'agentmesh-official', displayName: 'AgentMesh Official', role: 'developer',
    };
    store.profiles.set(officialOwner.id, officialOwner);
    store.agents.set('official-evidence-scout', {
      ...agent('official-evidence-scout', '数据研究', 12),
      ownerId: officialOwner.id,
      name: 'Evidence Scout',
      endpoint: 'agentmesh://builtin/research',
      official: true,
    });
    const { mission, stages } = await createMission();
    const assignments = Object.fromEntries(stages.map((stage) => [stage.id, 'official-evidence-scout']));
    const workflow = await api(`/api/missions/${mission.id}/workflow`, {
      method: 'POST', body: JSON.stringify({ assignments }),
    }, requester.id);

    expect(workflow.response.status).toBe(200);
    expect(workflow.body.data.offers.every((offer: { status: string }) => offer.status === 'accepted')).toBe(true);
    const started = await api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id);
    expect(started.response.status).toBe(200);

    for (const _stage of stages) {
      const dispatched = await api(`/api/missions/${mission.id}/dispatch`, { method: 'POST', body: '{}' }, requester.id);
      expect(dispatched.response.status).toBe(202);
      expect(dispatched.body.meta.builtin).toBe(true);
      expect(dispatched.body.data.stage.status).toBe('done');
      expect(dispatched.body.data.acknowledgement.completed).toBe(true);
    }

    expect(dispatchCalls).toBe(0);
    expect((await store.listDeliverables(mission.id))).toHaveLength(stages.length);
    expect((await store.getMission(mission.id))?.status).toBe('review');
  });

  it('prevents developers from forging canonical events and templates requester assistance', async () => {
    const { mission } = await createMission();
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));
    await api(`/api/missions/${mission.id}/workflow`, { method: 'POST', body: JSON.stringify({ assignments }) }, requester.id);
    await acceptAllStageOffers(mission.id);
    await api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id);

    const forged = await api(`/api/missions/${mission.id}/events`, {
      method: 'POST',
      body: JSON.stringify({ type: 'stage.done', message: '伪造阶段完成', progress: 100, currentStage: '已结算' }),
    }, developer.id);
    expect(forged.response.status).toBe(403);
    expect(forged.body.error.code).toBe('SIGNED_AGENT_CALLBACK_REQUIRED');

    const requesterOverride = await api(`/api/missions/${mission.id}/events`, {
      method: 'POST',
      body: JSON.stringify({ type: 'mission.assistance_requested', message: '伪造文本', currentStage: '已结算' }),
    }, requester.id);
    expect(requesterOverride.response.status).toBe(400);
    expect(requesterOverride.body.error.code).toBe('CANONICAL_STATE_FORBIDDEN');

    const assistance = await api(`/api/missions/${mission.id}/events`, {
      method: 'POST', body: JSON.stringify({ type: 'mission.assistance_requested', message: '调用方文本不应成为规范事件' }),
    }, requester.id);
    expect(assistance.response.status).toBe(201);
    expect(assistance.body.data.message).toBe('任务方请求平台人工协助');
    expect((await store.getMission(mission.id))?.currentStage).toBe('等待平台人工协助');

    const before = await store.getMission(mission.id);
    await store.addEvent({
      id: 'EVT-monotonic-progress', missionId: mission.id, stageId: null, type: 'admin.note',
      message: '迟到的低进度事件', actorType: 'platform', actorId: admin.id, payload: {}, createdAt: new Date().toISOString(),
    }, Math.max(0, (before?.progress ?? 0) - 1));
    expect((await store.getMission(mission.id))?.progress).toBe(before?.progress);
  });

  it('runs the deliverable, review, acceptance, and settlement lifecycle', async () => {
    const { mission } = await createMission();
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));
    await api(`/api/missions/${mission.id}/workflow`, { method: 'POST', body: JSON.stringify({ assignments }) }, requester.id);
    await acceptAllStageOffers(mission.id);
    await api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id);

    const submitted = await api(`/api/missions/${mission.id}/deliverables`, {
      method: 'POST',
      body: JSON.stringify({
        stageId: (store.stages.get(mission.id) ?? []).find((stage) => stage.input.executionMode === 'implement')?.id,
        name: '市场策略报告',
        uri: 'ipfs://bafytestreport',
        contentHash: 'sha256:1234567890abcdef',
        mimeType: 'application/pdf',
      }),
    }, developer.id);
    expect(submitted.response.status).toBe(201);

    const prematureReview = await api(`/api/missions/${mission.id}/review`, { method: 'POST', body: '{}' }, developer.id);
    expect(prematureReview.response.status).toBe(409);
    expect(prematureReview.body.error.code).toBe('WORKFLOW_INCOMPLETE');

    for (const stage of store.stages.get(mission.id) ?? []) {
      await store.updateStage(mission.id, stage.id, 'done', {
        summary: `${stage.name} completed`,
        verified: true,
      });
    }
    const review = await api(`/api/missions/${mission.id}/review`, { method: 'POST', body: '{}' }, developer.id);
    expect(review.body.data.status).toBe('review');
    expect(review.body.data.reviewDueAt).toBe('2026-08-23T00:00:00.000Z');

    const accepted = await api(`/api/missions/${mission.id}/accept`, {
      method: 'POST',
      body: '{}',
    }, requester.id);
    expect(accepted.response.status).toBe(200);
    expect(accepted.body.data.mission.status).toBe('completed');
    expect(accepted.body.data.escrow.status).toBe('released');

    const ledger = await api('/api/developer/ledger?limit=20', {}, developer.id);
    expect(ledger.response.status).toBe(200);
    expect(ledger.body.data.entries.length).toBeGreaterThan(0);
    expect(ledger.body.data.entries[0].missionId).toBe(mission.id);
    expect(ledger.body.data.entries[0].entryType).toBe('agent_payout');
    expect(ledger.body.data.totals.settled).toBeCloseTo(298.8);

    const requesterLedger = await api('/api/developer/ledger', {}, requester.id);
    expect(requesterLedger.response.status).toBe(403);
    expect(requesterLedger.body.error.code).toBe('FORBIDDEN');
  });

  it('settles a Web2 mission only once under concurrent acceptance', async () => {
    const { mission } = await createMission();
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    const matches = candidates.body.data as CandidateMatch[];
    const assignments = Object.fromEntries(matches.map((match) => [match.stageId, match.candidates[0].agent.id]));
    await api(`/api/missions/${mission.id}/workflow`, { method: 'POST', body: JSON.stringify({ assignments }) }, requester.id);
    await acceptAllStageOffers(mission.id);
    await api(`/api/missions/${mission.id}/start`, { method: 'POST', body: '{}' }, requester.id);
    await api(`/api/missions/${mission.id}/deliverables`, {
      method: 'POST',
      body: JSON.stringify({
        stageId: (store.stages.get(mission.id) ?? []).find((stage) => stage.input.executionMode === 'implement')?.id,
        name: '并发验收报告',
        uri: 'ipfs://bafyconcurrentacceptance',
        contentHash: 'sha256:concurrent-acceptance',
        mimeType: 'application/pdf',
      }),
    }, developer.id);
    for (const stage of store.stages.get(mission.id) ?? []) {
      await store.updateStage(mission.id, stage.id, 'done', {
        summary: `${stage.name} completed`,
        verified: true,
      });
    }
    await api(`/api/missions/${mission.id}/review`, { method: 'POST', body: '{}' }, developer.id);

    const accepted = await Promise.all([
      api(`/api/missions/${mission.id}/accept`, { method: 'POST', body: '{}' }, requester.id),
      api(`/api/missions/${mission.id}/accept`, { method: 'POST', body: '{}' }, requester.id),
    ]);
    expect(accepted.map((result) => result.response.status)).toEqual([200, 200]);
    expect((await store.getMission(mission.id))?.status).toBe('completed');
    expect((await store.listEvents(mission.id)).filter((event) => event.type === 'mission.accepted')).toHaveLength(1);
    expect(store.ledgerEntries.filter((entry) => entry.missionId === mission.id)).toHaveLength(
      new Set((store.stages.get(mission.id) ?? []).map((stage) => stage.agentId).filter(Boolean)).size,
    );
    expect((await store.getWalletAccount(developer.id)).transactions.filter((item) => item.type === 'agent_payout' && item.missionId === mission.id)).toHaveLength(1);
    expect((store.notifications.get(developer.id) ?? []).filter((item) => item.title === '任务已验收并结算')).toHaveLength(1);
    const assignedAgents = [...new Set((store.stages.get(mission.id) ?? []).map((stage) => stage.agentId).filter(Boolean))] as string[];
    const settlementMetrics = (await Promise.all(assignedAgents.map((agentId) => store.listAgentMetricEvents(agentId)))).flat();
    expect(settlementMetrics.filter((event) => event.sourceId === mission.id && event.type === 'mission_settled_success')).toHaveLength(
      (store.stages.get(mission.id) ?? []).filter((stage) => stage.nodeType === 'task' && stage.agentId).length,
    );
  });

  it('registers an Agent without accepting credentials into D1', async () => {
    const rejected = await api('/api/agents', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Unsafe Agent', category: '研究', summary: '这是一个足够长但错误地携带密钥的 Agent 描述。',
        tags: ['研究'], endpoint: 'https://agents.example.com/unsafe', authType: 'api_key', price: 20,
        wallet: '0x3300000000000000000000000000000000009A11', apiKey: 'must-not-store',
      }),
    }, developer.id);
    expect(rejected.response.status).toBe(400);
    expect(rejected.body.error.code).toBe('SECRET_NOT_ACCEPTED');

    const created = await api('/api/agents', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Evidence Scout', category: '数据研究', summary: '跨来源收集证据并输出带引用的结构化研究数据包。',
        tags: ['研究', '核验'], endpoint: 'https://agents.example.com/evidence-scout', authType: 'none', price: 45,
        wallet: '0x3300000000000000000000000000000000009A11',
        inputSchema: { type: 'object' }, outputSchema: { type: 'object' },
      }),
    }, developer.id);
    expect(created.response.status).toBe(201);
    expect(created.body.data.status).toBe('trial');

    const bypass = await api(`/api/agents/${created.body.data.id}/status`, {
      method: 'POST', body: JSON.stringify({ status: 'active' }),
    }, developer.id);
    expect(bypass.response.status).toBe(409);
    expect(bypass.body.error.code).toBe('AGENT_TRIAL_REQUIRED');
  });

  it('uses one shadow/enforce quality gate for the public market and mission candidates', async () => {
    const evaluatedAt = '2026-08-16T00:00:00.000Z';
    for (const [id, type, value] of [
      ['quality-trial', 'trial_passed', 98],
      ['quality-health', 'endpoint_healthy', 99],
    ] as const) {
      await store.recordAgentMetricEvent({
        id, idempotencyKey: id, agentId: 'research-agent', type, value, weight: 1, severity: 'info',
        sourceType: type === 'trial_passed' ? 'trial' : 'health', sourceId: id, detail: {}, occurredAt: evaluatedAt, createdAt: evaluatedAt,
      }, evaluatedAt);
    }
    testEnv.AGENT_QUALITY_GATE_MODE = 'enforce';
    const market = await api('/api/agents');
    expect(market.response.status).toBe(200);
    expect(market.body.data.map((item: Agent) => item.id)).toEqual(['research-agent']);
    expect(market.body.data[0].quality).toMatchObject({ eligible: true, wouldBeEligible: true, marketplaceStatus: 'listed' });

    const { mission } = await createMission();
    const candidates = await api(`/api/missions/${mission.id}/candidates`, {}, requester.id);
    expect(candidates.response.status).toBe(200);
    const candidateIds = (candidates.body.data as CandidateMatch[]).flatMap((match) => match.candidates.map((candidate) => candidate.agent.id));
    expect(new Set(candidateIds)).toEqual(new Set(['research-agent']));

    delete testEnv.AGENT_QUALITY_GATE_MODE;
    const shadowMarket = await api('/api/agents');
    expect(shadowMarket.body.data.map((item: Agent) => item.id).sort()).toEqual(['analysis-agent', 'research-agent', 'writer-agent']);
  });

  it('records an admin quality adjustment only once when the request is replayed', async () => {
    const input = {
      type: 'admin_adjustment',
      value: -5,
      reason: 'Repeated endpoint timeouts require a temporary quality adjustment.',
    };
    const headers = { 'Idempotency-Key': 'admin-quality-adjustment-1' };
    const first = await api('/api/admin/agents/research-agent/quality/events', {
      method: 'POST', headers, body: JSON.stringify(input),
    }, admin.id);
    const replay = await api('/api/admin/agents/research-agent/quality/events', {
      method: 'POST', headers, body: JSON.stringify(input),
    }, admin.id);

    expect(first.response.status, JSON.stringify(first.body)).toBe(201);
    expect(replay.response.status, JSON.stringify(replay.body)).toBe(201);
    expect(replay.body.meta.replayed).toBe(true);
    expect((await store.listAgentMetricEvents('research-agent')).filter((event) => event.type === 'admin_adjustment')).toHaveLength(1);
  });

  it('accepts only versioned requester feedback for completed and released task stages', async () => {
    const { mission, stages } = await createMission();
    const task = { ...stages[0], status: 'done' as const, agentId: 'research-agent', output: { summary: 'verified' } };
    store.stages.set(mission.id, [task]);
    store.missions.set(mission.id, { ...mission, status: 'completed', progress: 100, currentStage: '已结算' });
    const escrow = store.escrows.get(mission.id)!;
    store.escrows.set(mission.id, { ...escrow, status: 'released', releasedAt: currentNow });
    const input = { deliveryQuality: 5, requirementsFit: 4, communication: 5, onTime: true, reuse: true, comment: '交付完整，证据清晰，符合任务验收标准。' };
    const headers = { 'Idempotency-Key': 'quality-feedback-v1' };
    const first = await api(`/api/missions/${mission.id}/stages/${task.id}/feedback`, { method: 'PUT', headers, body: JSON.stringify(input) }, requester.id);
    const replay = await api(`/api/missions/${mission.id}/stages/${task.id}/feedback`, { method: 'PUT', headers, body: JSON.stringify(input) }, requester.id);
    expect(first.response.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.data.feedback.version).toBe(1);
    expect(replay.body.data.feedback.id).toBe(first.body.data.feedback.id);
    const forbidden = await api(`/api/missions/${mission.id}/stages/${task.id}/feedback`, { method: 'PUT', headers: { 'Idempotency-Key': 'quality-feedback-forbidden' }, body: JSON.stringify(input) }, developer.id);
    expect(forbidden.response.status).toBe(403);
    const updated = await api(`/api/missions/${mission.id}/stages/${task.id}/feedback`, { method: 'PUT', headers: { 'Idempotency-Key': 'quality-feedback-v2' }, body: JSON.stringify({ ...input, deliveryQuality: 4 }) }, requester.id);
    expect(updated.body.data.feedback.version).toBe(2);
    expect(await store.listAgentFeedback('research-agent')).toHaveLength(1);
    const sensitive = await api(`/api/missions/${mission.id}/stages/${task.id}/feedback`, {
      method: 'PUT', headers: { 'Idempotency-Key': 'quality-feedback-sensitive' },
      body: JSON.stringify({ ...input, comment: 'Bearer sensitive-token-value-must-not-be-public' }),
    }, requester.id);
    expect(sensitive.response.status).toBe(400);
    expect(sensitive.body.error.code).toBe('SENSITIVE_CONTENT_REJECTED');
  });

  it('reports a missing Worker credential instead of masking it as an unreachable Agent', async () => {
    const created = await api('/api/agents', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Credentialed Agent', category: '软件开发', summary: '需要由 Worker Secret 提供 Bearer Token 的测试 Agent。',
        tags: ['代码'], endpoint: 'https://agents.example.com/credentialed', authType: 'bearer', price: 10,
        wallet: '0x3300000000000000000000000000000000009A11',
        inputSchema: { type: 'object' }, outputSchema: { type: 'object' },
      }),
    }, developer.id);
    expect(created.response.status).toBe(201);

    const trial = await api(`/api/agents/${created.body.data.id}/trial`, {
      method: 'POST', body: '{}',
    }, developer.id);
    expect(trial.response.status).toBe(409);
    expect(trial.body.error.code).toBe('AGENT_CREDENTIAL_REQUIRED');
  });

  it('decrypts an encrypted Agent credential before running the live trial', async () => {
    const created = await api('/api/agents', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Encrypted Credential Agent', category: '软件开发', summary: '通过项目密钥解密独立 Bearer Token 的测试 Agent。',
        tags: ['代码'], endpoint: 'https://agents.example.com/encrypted-credential', authType: 'bearer', price: 10,
        wallet: '0x3300000000000000000000000000000000009A11',
        inputSchema: { type: 'object' }, outputSchema: { type: 'object' },
      }),
    }, developer.id);
    expect(created.response.status).toBe(201);
    testEnv.AGENT_CREDENTIALS_ENCRYPTED_JSON = await encryptedCredentialBinding(created.body.data.id, 'encrypted-agent-token');

    const trial = await api(`/api/agents/${created.body.data.id}/trial`, {
      method: 'POST', body: '{}',
    }, developer.id);
    expect(trial.response.status).toBe(200);
    expect(dispatchedAuthorization).toBe('Bearer encrypted-agent-token');
    expect(dispatchedAgentHeaders).toContain(created.body.data.id);
    expect(dispatchedAgentHeaders.filter((agentId) => agentId === created.body.data.id)).toHaveLength(4);
    expect(trial.body.data.trial).toMatchObject({ suiteVersion: 'agentmesh.trial.v3', status: 'passed' });
    expect(trial.body.data.trial.checks.map((check: { key: string }) => check.key)).toEqual(expect.arrayContaining([
      'case_structured_execution', 'case_error_handling', 'case_artifact_delivery', 'case_engineering_capabilities',
    ]));
  });

  it('fails and suspends a trial Agent whose response exposes its Worker credential', async () => {
    const created = await api('/api/agents', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Leaking Credential Agent', category: '软件开发', summary: '用于验证 Trial 响应凭据泄漏会立即触发暂停的 Agent。',
        tags: ['代码', '审查'], endpoint: 'https://agents.example.com/leaking-credential', authType: 'bearer', price: 10,
        wallet: '0x3300000000000000000000000000000000009A11',
        inputSchema: { type: 'object' }, outputSchema: { type: 'object' },
      }),
    }, developer.id);
    expect(created.response.status).toBe(201);
    testEnv.AGENT_CREDENTIALS_ENCRYPTED_JSON = await encryptedCredentialBinding(created.body.data.id, 'credential-that-must-remain-secret');
    trialResponder = (challenge, agentId) => Response.json({
      challenge, agentId, status: 'accepted', output: { authorization: 'Bearer credential-that-must-remain-secret' },
    });

    const trial = await api(`/api/agents/${created.body.data.id}/trial`, { method: 'POST', body: '{}' }, developer.id);
    expect(trial.response.status).toBe(502);
    expect(trial.body.error.code).toBe('AGENT_TRIAL_SECRET_LEAK');
    expect((await store.listAgentMetricEvents(created.body.data.id))).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'security_incident', severity: 'severe' }),
    ]));
    expect((await store.getAgentQualityStats(created.body.data.id))?.marketplaceStatus).toBe('suspended');
  });

  it('rejects loopback IPv6 Agent endpoints at registration', async () => {
    const result = await api('/api/agents', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Loopback Agent', category: '研究', summary: '这是一个尝试连接本机 IPv6 回环地址的无效 Agent 描述。',
        tags: ['研究'], endpoint: 'https://[::1]/agent', authType: 'none', price: 20,
        wallet: '0x3300000000000000000000000000000000009A11',
      }),
    }, developer.id);
    expect(result.response.status).toBe(400);
    expect(result.body.error.code).toBe('UNSAFE_AGENT_ENDPOINT');
  });

  it('validates mission inputs before writing data', async () => {
    const result = await api('/api/missions', {
      method: 'POST',
      body: JSON.stringify({ title: '短', description: '不够长', category: '研究', budget: -1, deadline: 'bad-date' }),
    }, requester.id);

    expect(result.response.status).toBe(400);
    expect(result.body.error.code).toBe('VALIDATION_ERROR');
    expect(store.missions.size).toBe(0);
  });
});
