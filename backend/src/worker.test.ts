import { beforeEach, describe, expect, it } from 'vitest';
import { exportSPKI, generateKeyPair, SignJWT } from 'jose';
import type { Agent, CandidateMatch, Mission, PaymentMethod, UserContext, WorkflowStage } from './contracts';
import { MemoryPlatformStore } from './memoryStore';
import { buildSettlementPlan, settlementDescriptor } from './chain';
import { looksLikePrivyToken, verifyPrivyIdentityToken, verifyPrivyToken } from './privy';
import { createApp } from './worker';

type JsonBody = Record<string, any>;

let store: MemoryPlatformStore;
let app: ReturnType<typeof createApp>;
let dispatchedBody: JsonBody | null;
let dispatchCalls: number;
let deliveredEmails: Array<{ to: string; subject: string; html: string }>;

const testEnv = { API_KEY: 'test-project-secret', PROJECT_NAME: 'agentmesh-test', TEST_TOPUP_ENABLED: 'true' };

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
  dispatchCalls = 0;
  deliveredEmails = [];
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
    now: () => new Date('2026-08-16T00:00:00.000Z'),
    fetcher: async (_input, init) => {
      dispatchedBody = JSON.parse(String(init?.body ?? '{}')) as JsonBody;
      const challenge = new Headers(init?.headers).get('X-AgentMesh-Trial');
      if (challenge) return Response.json({ challenge, status: 'accepted', output: { schema: 'ok' } }, { status: 200 });
      dispatchCalls += 1;
      return Response.json({ accepted: true, runId: 'run-test-1' }, { status: 202 });
    },
    emailSender: async (_env, input) => {
      deliveredEmails.push(input);
      return { ok: true };
    },
    llmCaller: async () => ({
      content: JSON.stringify({
        summary: 'Official test Agent completed the assigned stage.',
        findings: ['Structured output generated by the injected test LLM.'],
        risks: [],
      }),
    }),
    endpointValidator: async () => undefined,
  });
});

describe('AgentMesh Worker', () => {
  it('uses the deployed Sepolia contract defaults only for the AgentMesh test project', () => {
    expect(settlementDescriptor({ PROJECT_NAME: 'agentmesh-test' }).mode).toBe('offchain_ledger_with_chain_references');
    expect(settlementDescriptor({ PROJECT_NAME: 'agentmesh-platform-74a3' })).toMatchObject({
      mode: 'verified_contract',
      assets: ['mUSDC', 'sETH'],
      network: 'eip155:11155111',
      contractAddress: '0x67a44ea66e16d2d8d5d5d4b34ce0088cc9785d3e',
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

  it('defaults CORS to the bound production domain instead of a wildcard', async () => {
    const allowed = await app.fetch(new Request('http://local.test/api/health', {
      headers: { Origin: 'https://agentmesh.pinit.eth.limo' },
    }), testEnv);
    const rejected = await app.fetch(new Request('http://local.test/api/health', {
      headers: { Origin: 'https://evil.example' },
    }), testEnv);

    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://agentmesh.pinit.eth.limo');
    expect(allowed.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
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
    expect(repeated.response.status).toBe(409);
    expect(repeated.body.error.code).toBe('DISPUTE_ALREADY_RESOLVED');
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

  it('requires a verified requester wallet before accepting an on-chain deposit', async () => {
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

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('WALLET_IDENTITY_REQUIRED');
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
        output: { contentHash: 'sha256:callback-test' },
      }),
    });
    expect(callback.response.status).toBe(202);
    expect(callback.body.data.stage.status).toBe('done');
    expect(store.agentPerformance.size).toBe(1);
    expect(store.agents.get(dispatched.body.data.agent.id)?.successRate).toBe(93.3);

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
    expect(lateMutation.response.status).toBe(409);
    expect(lateMutation.body.error.code).toBe('INVALID_STAGE_TRANSITION');
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
        stageId: matches[0].stageId,
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
      await store.updateStage(mission.id, stage.id, 'done', { contentHash: `sha256:${stage.id}` });
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
        stageId: matches[0].stageId,
        name: '并发验收报告',
        uri: 'ipfs://bafyconcurrentacceptance',
        contentHash: 'sha256:concurrent-acceptance',
        mimeType: 'application/pdf',
      }),
    }, developer.id);
    for (const stage of store.stages.get(mission.id) ?? []) {
      await store.updateStage(mission.id, stage.id, 'done', { contentHash: `sha256:${stage.id}` });
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
