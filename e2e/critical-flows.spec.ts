import { expect, test } from '@playwright/test';
import { BRAND } from '../shared/brand';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/agents', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: [] }),
  }));
});

test('anonymous users can only browse the public Agent directory', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/#/agents');
  await expect(page.getByRole('heading', { name: 'Agent 市场' })).toBeVisible();
  await expect(page.getByText('0 AGENTS AVAILABLE')).toBeVisible();
  await expect(page.getByText('没有匹配的 Agent')).toBeVisible();
  await expect(page.getByText(/演示|SANDBOX|DEMO/i)).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('public homepage remains useful without authentication or RPC availability', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/ethereum-sepolia-rpc.publicnode.com/**', (route) => route.abort('failed'));

  await page.goto('/#/');

  await expect(page.getByRole('heading', { name: '协作有共识， 资金有路径。' })).toBeVisible();
  await expect(page.locator('header img[src="/pinme-mesh-mark.svg"]')).toBeVisible();
  await expect(page.getByRole('link', { name: '在 Etherscan 验证' })).toHaveAttribute(
    'href',
    'https://sepolia.etherscan.io/address/0xe05a5e46139294402393e5601d771e6c7564a573',
  );
  await expect(page.getByText('实时 RPC 暂时不可用，静态合约档案仍可验证。')).toBeVisible();
  await expect(page.locator('#app-sidebar')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  const scrollChapter = page.locator('.contract-hero__chapter-two');
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.05));
  await expect
    .poll(async () => Number(await scrollChapter.evaluate((element) => getComputedStyle(element).opacity)))
    .toBeGreaterThan(0.8);
  await expect(page.getByRole('heading', { name: '一条路径， 从承诺到结算。' })).toBeVisible();
  await expect
    .poll(async () => Number(await page.locator('.contract-hero__flow-step').nth(2).evaluate((element) => getComputedStyle(element).opacity)))
    .toBeGreaterThan(0.8);
  await expect
    .poll(async () =>
      page.locator('.contract-hero').evaluate((element) =>
        (element as HTMLElement).style.getPropertyValue('--hero-progress'),
      ),
    )
    .not.toBe('0%');
});

test('legacy contract URL redirects to the public homepage', async ({ page }) => {
  await page.goto('/#/contract');
  await expect(page).toHaveURL(/\/#\/$/);
  await expect(page.getByRole('heading', { name: '协作有共识， 资金有路径。' })).toBeVisible();
});

test('private workspace routes require authentication instead of local fallback data', async ({ page }) => {
  await page.goto('/#/dashboard');
  await expect(page.getByRole('heading', { name: '让复杂任务完成，让真实贡献沉淀。' })).toBeVisible();
  await expect(page.getByRole('button', { name: '登录进入工作台' })).toBeVisible();
  await expect(page.getByText('本地演示数据')).toHaveCount(0);

  for (const route of ['/missions/new', '/developer', '/arbitration', '/settings', '/wallet/test-funds']) {
    await page.goto(`/#${route}`);
    await expect(page.getByRole('heading', { name: '登录后进入正式工作区' })).toBeVisible();
    await expect(page.getByText('任务、Agent、交付证据和结算只通过已认证的 Worker 与 D1 流程处理。')).toBeVisible();
    await expect(page.getByText('本地演示数据')).toHaveCount(0);
  }

  await page.getByRole('button', { name: `登录 ${BRAND.platform.name}` }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('sidebar exposes one formal workspace status and no data-mode switch', async ({ page }) => {
  await page.goto('/#/agents');
  const sidebar = page.locator('#app-sidebar');

  await expect(sidebar.locator('img[src="/pinme-mesh-mark.svg"]')).toBeVisible();
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/pinme-mesh-mark.svg');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/site.webmanifest');
  await expect(sidebar.getByText('PUBLIC DIRECTORY · READ ONLY')).toBeVisible();
  await expect(sidebar.getByRole('button', { name: /连接真实工作区|连接正式工作区/ })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: '演示沙盒' })).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: '真实工作区', exact: true })).toHaveCount(0);
});

test('desktop sidebar collapses to an accessible icon rail and remembers the choice', async ({ page }) => {
  await page.goto('/#/agents');
  const sidebar = page.locator('#app-sidebar');

  await expect(sidebar).toHaveAttribute('data-collapsed', 'false');
  await page.getByRole('button', { name: '收起侧边栏' }).click();
  await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  await expect(sidebar).toHaveCSS('width', '76px');
  await expect(sidebar.getByRole('link', { name: 'Agent 市场' })).toBeVisible();
  await expect(sidebar.getByText('Agent 市场', { exact: true })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()?.width);

  await page.reload();
  await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  await expect(sidebar).toHaveCSS('width', '76px');
  await page.getByRole('button', { name: '展开侧边栏' }).click();
  await expect(sidebar).toHaveAttribute('data-collapsed', 'false');
  await expect(sidebar.getByText('Agent 市场', { exact: true })).toBeVisible();
});

test('verified ENS primary name replaces the current wallet label', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('agentmesh:e2e-auth', 'true');
    window.sessionStorage.setItem('agentmesh:e2e-ens', 'true');
  });
  await page.goto('/#/dashboard');

  await expect(page.locator('#app-sidebar').getByText('vitalik.eth', { exact: true })).toBeVisible();
  const walletButton = page.getByRole('button', { name: '身份钱包 vitalik.eth' });
  await expect(walletButton).toBeVisible();
  await walletButton.click();
  await expect(page.getByText('ENS', { exact: true })).toBeVisible();
  await expect(page.getByText('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', { exact: true })).toBeVisible();
});

test('mobile navigation remains accessible with the authentication gate', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/dashboard');

  const menuButton = page.getByRole('button', { name: '打开菜单' });
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await menuButton.click();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#app-sidebar')).not.toHaveAttribute('aria-hidden', 'true');
  await page.keyboard.press('Escape');
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('heading', { name: '让复杂任务完成，让真实贡献沉淀。' })).toBeVisible();
  await expect(page.getByRole('button', { name: '登录进入工作台' })).toBeVisible();
});

test('public API failure never restores showcase records', async ({ page }) => {
  await page.route('**/api/agents', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'TEST_OFFLINE', message: 'Service unavailable' } }),
  }));

  await page.goto('/#/agents');
  await expect(page.getByText('0 AGENTS AVAILABLE')).toBeVisible();
  await expect(page.getByRole('link', { name: /ScriptSmith|VisionBoard|MotionCraft/ })).toHaveCount(0);
});

test('large developer ledgers switch from browser CSV to a private async export job', async ({ page }) => {
  await page.addInitScript(() => window.sessionStorage.setItem('agentmesh:e2e-auth', 'true'));
  const profile = { id: 'export-developer', email: 'export@example.test', displayName: 'Export Developer', role: 'developer' };
  const ledger = {
    token: 'CREDIT',
    entries: [{
      id: 'ledger-visible-1', missionId: 'TASK-EXPORT', missionTitle: 'Visible ledger row', agentId: 'agent-export',
      agentName: 'Export Agent', entryType: 'agent_payout', amount: 12, token: 'CREDIT', status: 'settled',
      txHash: null, createdAt: '2026-08-27T00:00:00.000Z',
    }],
    totals: { settled: 12, pending: 0, failed: 0 }, weekly: [],
    pageInfo: { hasMore: true, nextCursor: 'opaque-next-page' },
  };
  const job = {
    id: 'EXPORT-E2E-1', token: 'CREDIT', status: 'queued', totalRows: 5_001, processedRows: 0, progress: 0,
    attempt: 1, errorCode: null, errorMessage: null, startedAt: null, completedAt: null, cancelledAt: null,
    expiresAt: '2026-09-03T00:00:00.000Z', createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z', artifact: null,
  };
  await page.route('**/api/bootstrap', (route) => route.fulfill({ json: { data: {
    profile, missions: [], agents: [], notifications: [], developer: { jobs: 1, activeAgents: 1, volume: 12, pending: 0 },
  } } }));
  await page.route('**/api/developer/ledger?**', (route) => route.fulfill({ json: { data: ledger } }));
  await page.route('**/api/developer/ledger/export-jobs', (route) => route.fulfill({
    status: route.request().method() === 'POST' ? 202 : 200,
    json: { data: route.request().method() === 'POST' ? { mode: 'async', job } : [] },
  }));

  await page.goto('/#/agents');
  await page.evaluate(async (nextProfile) => {
    const [{ setApiTokenProvider }, { useAppStore }] = await Promise.all([
      import('/src/services/api.ts'),
      import('/src/store/useAppStore.ts'),
    ]);
    setApiTokenProvider(async () => 'test-export-token');
    useAppStore.setState({ profile: nextProfile, role: 'developer', developerSummary: { jobs: 1, activeAgents: 1, volume: 12, pending: 0 } });
  }, profile);
  await page.evaluate(() => { window.location.hash = '/developer/earnings'; });
  await expect(page.getByRole('heading', { name: '收益中心' })).toBeVisible();
  await page.getByRole('button', { name: '导出 CSV' }).click();
  await expect(page.getByRole('heading', { name: '异步导出作业' })).toBeVisible();
  await expect(page.getByText('5,001 行 · attempt 1')).toBeVisible();
  await expect(page.getByText('等待已批准的私有导出服务领取')).toBeVisible();
  await expect(page.getByRole('button', { name: '取消' })).toBeVisible();
});

test('public Agent directory remains available when private workspace hydration fails', async ({ page }) => {
  const officialAgent = {
    id: 'official-evidence-scout', ownerId: 'agentmesh-official', name: 'Evidence Scout', category: '数据研究',
    summary: '面向测试网任务的证据研究 Agent，返回可审计的结构化研究结果。', tags: ['研究', '证据', '核验'],
    status: 'active', trustScore: 9.1, successRate: 91, responseTime: '1.2s', price: 12, jobs: 0, volume: 0,
    author: 'AgentMesh Official', version: 'v1.0.0', official: true, wallet: '0x2200000000000000000000000000000000000a11',
    endpoint: 'https://agentmesh-platform-74a3.api.pinme.pro/api/agents/official-evidence-scout/invoke', authType: 'bearer',
    quality: {
      agentId: 'official-evidence-scout', marketplaceStatus: 'listed', reputation: 91.5,
      breakdown: { reliability: 33, quality: 27, delivery: 14, response: 9.5, history: 8, riskPenalty: 0 },
      confidence: 'high', settledJobs: 24, successfulJobs: 23, failedJobs: 1, refundedJobs: 0,
      trialPassed: true, endpointHealthy: true, payoutValid: true, unresolvedSevereRisks: 0,
      premium: true, newAgent: false, eligibilityReasons: [], formulaVersion: 'agentmesh-quality-v1',
      lastTrialAt: '2026-08-20T00:00:00.000Z', lastHealthCheckAt: '2026-08-23T00:00:00.000Z', updatedAt: '2026-08-23T00:00:00.000Z',
      gateMode: 'enforce', eligible: true, wouldBeEligible: true,
    },
  };
  await page.unroute('**/api/agents');
  await page.route('**/api/agents', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: [officialAgent] }),
  }));
  await page.route('**/api/bootstrap', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'PRIVATE_SYNC_OFFLINE', message: 'Private workspace unavailable' } }),
  }));
  await page.route('**/api/disputes', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: [] }),
  }));
  await page.route('**/api/agents/official-evidence-scout/quality', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: {
      agent: officialAgent,
      feedback: [{ id: 'feedback-e2e', agentId: officialAgent.id, missionId: 'TASK-E2E', stageId: 'STAGE-E2E', version: 1, deliveryQuality: 5, requirementsFit: 5, communication: 4, onTime: true, reuse: true, comment: '证据清晰，交付可直接用于后续决策。', effective: true, createdAt: '2026-08-23T00:00:00.000Z' }],
      snapshots: [],
    } }),
  }));

  await page.goto('/#/agents');
  await page.evaluate(async () => {
    const [{ setApiTokenProvider }, { useAppStore }] = await Promise.all([
      import('/src/services/api.ts'),
      import('/src/store/useAppStore.ts'),
    ]);
    setApiTokenProvider(async () => 'test-access-token');
    useAppStore.getState().setProfile({ id: 'test-user', displayName: 'Test User', role: 'requester' });
    await Promise.all([
      useAppStore.getState().hydratePublic(),
      useAppStore.getState().hydratePrivate(),
    ]);
  });

  await expect(page.getByRole('heading', { name: 'Evidence Scout' })).toBeVisible();
  await expect(page.getByText('1 AGENTS AVAILABLE')).toBeVisible();
  await expect(page.getByText('91.5')).toBeVisible();
  await expect(page.getByText('高质量')).toBeVisible();

  await page.goto('/#/agents/official-evidence-scout');
  await expect(page.getByText('Agent Endpoint', { exact: true })).toBeVisible();
  await expect(page.getByText('91.5 / 100', { exact: true })).toBeVisible();
  await expect(page.getByText('证据清晰，交付可直接用于后续决策。')).toBeVisible();
  await expect(page.getByRole('link', { name: '打开 Endpoint' })).toHaveAttribute(
    'href',
    'https://agentmesh-platform-74a3.api.pinme.pro/api/agents/official-evidence-scout/invoke',
  );
});

test('an unlisted Agent keeps a public quality detail page outside the market directory', async ({ page }) => {
  const hiddenAgent = {
    id: 'quality-paused-agent', ownerId: 'developer-hidden', name: 'Paused Quality Agent', category: '软件开发',
    summary: '该 Agent 已暂停新接单，但历史质量档案仍保持公开可验证。', tags: ['代码', '审查'],
    status: 'active', trustScore: 8.2, successRate: 84, responseTime: '2.1s', price: 30, jobs: 8, volume: 1200,
    author: 'Hidden Developer', version: 'v1.0.0', official: false, wallet: '0x2200000000000000000000000000000000000b11',
    endpoint: 'https://agents.example.test/quality-paused-agent', authType: 'bearer', inputSchema: {}, outputSchema: {},
    quality: {
      agentId: 'quality-paused-agent', marketplaceStatus: 'suspended', reputation: 48,
      breakdown: { reliability: 17, quality: 16, delivery: 8, response: 7, history: 5, riskPenalty: 5 },
      confidence: 'medium', settledJobs: 8, successfulJobs: 5, failedJobs: 2, refundedJobs: 1,
      trialPassed: true, endpointHealthy: true, payoutValid: true, unresolvedSevereRisks: 0,
      premium: false, newAgent: false, eligibilityReasons: ['信誉分 48 低于 75', '市场状态为 suspended'],
      formulaVersion: 'agentmesh-quality-v1', lastTrialAt: '2026-08-20T00:00:00.000Z',
      lastHealthCheckAt: '2026-08-23T00:00:00.000Z', updatedAt: '2026-08-23T00:00:00.000Z',
      gateMode: 'enforce', eligible: false, wouldBeEligible: false,
    },
  };
  await page.route('**/api/agents/quality-paused-agent/quality', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { agent: hiddenAgent, feedback: [], snapshots: [] } }),
  }));

  await page.goto('/#/agents/quality-paused-agent');
  await expect(page.getByRole('heading', { name: 'Paused Quality Agent' })).toBeVisible();
  await expect(page.getByText('市场暂停')).toBeVisible();
  await expect(page.getByText('48 / 100', { exact: true })).toBeVisible();
  await expect(page.getByText('暂停新接单', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '用于新任务' })).toHaveCount(0);
});

test('operational errors use a localized top-right notification', async ({ page }) => {
  await page.goto('/#/agents');
  await page.unroute('**/api/agents');
  await page.route('**/api/agents', (route) => route.fulfill({
    status: 429,
    contentType: 'application/json',
    body: JSON.stringify({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please wait to try again.',
        details: { resetAt: Math.floor(Date.now() / 1_000) + 30 },
      },
    }),
  }));

  await page.evaluate(async () => {
    const [{ api }, { useAppStore }] = await Promise.all([
      import('/src/services/api.ts'),
      import('/src/store/useAppStore.ts'),
    ]);
    try {
      await api.listAgents();
    } catch (error) {
      useAppStore.getState().showToast(error instanceof Error ? error.message : '候选团队加载失败。', 'error');
    }
  });

  const notification = page.getByRole('alert');
  await expect(notification).toContainText('操作未完成');
  await expect(notification).toContainText(/请求过于频繁，请在 \d+ 秒后重试。/);
  await expect(notification).not.toContainText('Too many requests');
  await expect(notification).toHaveCSS('position', 'fixed');

  const box = await notification.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(64);
  expect(box!.y).toBeLessThan(120);
  expect(viewport!.width - box!.x - box!.width).toBeLessThanOrEqual(36);

  await notification.getByRole('button', { name: '关闭提示' }).click();
  await expect(notification).toHaveCount(0);
});

test('DAO arbitration renders a real electorate vote and locks the resulting ruling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const profile = { id: 'arbiter-admin', email: 'arbiter@example.test', displayName: 'DAO Arbiter', role: 'admin' };
  const mission = {
    id: 'TASK-DAO-E2E', title: 'DAO 仲裁浏览器验收', description: '验证一人一票的提案流程。', category: '软件开发', tags: ['仲裁'],
    budget: 100, paymentMethod: 'web2_balance', deadline: '2026-09-01', reviewDueAt: null, priority: 'high', expertise: 'expert',
    yieldEnabled: false, status: 'review', progress: 100, currentStage: '争议治理中', team: ['agent-one'], createdAt: '2026-08-23T00:00:00.000Z',
    workflowVersion: 1, workflowViewport: { x: 0, y: 0, zoom: 1 },
  };
  const dispute = {
    id: 'DSP-DAO-E2E', missionId: mission.id, openedBy: 'requester-e2e', reason: '交付物与任务规格存在明显偏差，需要委员会核验并决定是否退款。',
    evidence: [], status: 'reviewing', resolution: null, freezeTxHash: null, resolutionTxHash: null,
    createdAt: '2026-08-23T00:00:00.000Z', resolvedAt: null,
    evidenceSnapshot: {
      missionId: mission.id, acceptanceCriteriaSha256: `sha256:${'a'.repeat(64)}`, workflowVersion: 1, schedulerRevision: 2,
      eventWatermark: 'EVT-DAO-E2E', frozenBy: 'requester-e2e', frozenAt: '2026-08-23T00:00:00.000Z',
      deliverables: [{
        deliverableId: 'DEL-DAO-E2E', stageId: 'STAGE-implement', attemptNo: 1, agentId: 'agent-one', name: '冻结工程包',
        rootCid: 'bafybeie5nqv6kd3qnfjuprw2scvucpip5xwh3yluiopmqcktiamcu54bdm', manifestSha256: `sha256:${'b'.repeat(64)}`,
        versionNo: 1, verificationStatus: 'verified', createdAt: '2026-08-22T23:50:00.000Z',
      }],
    },
  };
  const proposal = {
    id: 'PROP-DAO-E2E', disputeId: dispute.id, proposerId: profile.id, status: 'active', weightMode: 'one_person_one_vote',
    weightVersion: 'one_person_one_vote.v1', round: 0, parentProposalId: null, appealReason: null, appealDeadlineAt: null,
    votingStartsAt: '2026-08-23T00:00:00.000Z', votingEndsAt: '2026-08-26T00:00:00.000Z', quorumRequired: 1, eligibleWeight: 1,
    supportVotes: 0, opposeVotes: 0, abstainVotes: 0, outcome: null, finalizedAt: null, finalizedBy: null, executedAt: null, executedBy: null,
    createdAt: '2026-08-23T00:00:00.000Z',
  };
  let governance = {
    proposal,
    electorate: [{ userId: profile.id, displayName: profile.displayName, powerSnapshot: 1, voteWeight: 1 }],
    votes: [] as Array<Record<string, unknown>>,
    rounds: [{ proposal, electorate: [{ userId: profile.id, displayName: profile.displayName, powerSnapshot: 1, voteWeight: 1 }], votes: [] as Array<Record<string, unknown>> }],
    appeal: { used: false, deadlineAt: null, canAppeal: false, reason: null, appellantId: null, createdAt: null },
    execution: null as Record<string, unknown> | null,
    executionReady: false,
    currentUser: { eligible: true, canVote: true, hasVoted: false, choice: null as string | null },
  };
  let dossierPublications: Array<Record<string, unknown>> = [];
  const dossierData = () => ({
    dossier: { schema: 'agentmesh.review-dossier.v1', kind: 'dispute', subjectId: dispute.id, missionId: mission.id, snapshot: dispute.evidenceSnapshot },
    canonicalJson: JSON.stringify({ schema: 'agentmesh.review-dossier.v1', kind: 'dispute', subjectId: dispute.id }),
    payloadSha256: `sha256:${'c'.repeat(64)}`, publications: dossierPublications,
    publishGuide: { command: `pinme upload ./agentmesh-review-${dispute.id}`, note: '使用自己的 PinMe 登录态上传。' },
  });
  const token = [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: profile.id, email: profile.email, iat: 1_787_200_000, exp: 1_818_736_000 })).toString('base64url'),
    'test-signature',
  ].join('.');
  const envelope = (data: unknown) => JSON.stringify({ data });

  await page.route('**/v1/accounts:signInWithPassword**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ localId: profile.id, email: profile.email, tenantId: 'agentmesh-platf-749a-powdj', idToken: token, refreshToken: 'test-refresh-token', expiresIn: '3600', registered: true }),
  }));
  await page.route('**/v1/accounts:lookup**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ users: [{ localId: profile.id, email: profile.email, emailVerified: true, tenantId: 'agentmesh-platf-749a-powdj' }] }),
  }));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const fulfill = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: envelope(data) });
    if (path === '/api/auth/verify') return fulfill({ profile });
    if (path === '/api/bootstrap') return fulfill({ profile, missions: [mission], agents: [], notifications: [], developer: null });
    if (path === '/api/disputes') return fulfill([dispute]);
    if (path === `/api/disputes/${dispute.id}/actions`) return fulfill([]);
    if (path === `/api/disputes/${dispute.id}/governance`) return fulfill(governance);
    if (path === `/api/missions/${mission.id}/evidence/dossier`) return fulfill(dossierData());
    if (path === `/api/missions/${mission.id}/evidence/publications` && request.method() === 'POST') {
      const input = request.postDataJSON() as { rootCid: string; payloadSha256: string };
      const publication = {
        id: 'EVID-DAO-E2E', missionId: mission.id, kind: 'dispute_dossier', subjectId: dispute.id,
        payloadSha256: input.payloadSha256, rootCid: input.rootCid, publishedBy: profile.id, createdAt: '2026-08-23T00:06:00.000Z',
      };
      dossierPublications = [publication];
      return fulfill(publication, 201);
    }
    if (path === `/api/disputes/${dispute.id}/votes` && request.method() === 'POST') {
      const input = request.postDataJSON() as { choice: string; reason: string };
      governance = {
        proposal: { ...proposal, status: 'succeeded', supportVotes: 1, outcome: 'refund_requester', finalizedAt: '2026-08-23T00:05:00.000Z', finalizedBy: profile.id },
        electorate: governance.electorate,
        votes: [{ id: 'VOTE-DAO-E2E', proposalId: proposal.id, voterId: profile.id, voterDisplayName: profile.displayName, choice: input.choice, reason: input.reason, voteWeight: 1, createdAt: '2026-08-23T00:05:00.000Z' }],
        rounds: governance.rounds,
        appeal: governance.appeal,
        execution: null,
        executionReady: true,
        currentUser: { eligible: true, canVote: false, hasVoted: true, choice: input.choice },
      };
      return fulfill(governance, 201);
    }
    return fulfill({ code: 'NOT_MOCKED', path }, 404);
  });

  await page.goto('/#/arbitration');
  await page.getByRole('button', { name: `登录 ${BRAND.platform.name}` }).click();
  const loginDialog = page.getByRole('dialog').last();
  await loginDialog.getByLabel('邮箱').fill(profile.email);
  await loginDialog.getByLabel('密码').fill('browser-test-password');
  await loginDialog.getByRole('button', { name: '登录真实工作区' }).click();

  await expect(page.getByRole('heading', { name: '仲裁治理' })).toBeVisible();
  await expect(page.getByText('1 MEMBER = 1 VOTE')).toBeVisible();
  await expect(page.getByRole('heading', { name: '一次上诉' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '不可变轮次历史' })).toBeVisible();
  await expect(page.getByText('one_person_one_vote.v1').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: '案件冻结证据' })).toBeVisible();
  await expect(page.getByText(/pinme export bafybeie5nqv6kd3qnfjuprw2scvucpip5xwh3yluiopmqcktiamcu54bdm/)).toBeVisible();
  await page.getByRole('button', { name: '下载不可变审核档案' }).click();
  await expect(page.getByText(`sha256:${'c'.repeat(64)}`)).toBeVisible();
  const dossierCid = 'bafybeie5nqv6kd3qnfjuprw2scvucpip3oc6zvqrgcxlqdze6dt4bdhmsy';
  await page.getByPlaceholder('上传后粘贴审核档案根 CID').fill(dossierCid);
  await page.getByRole('button', { name: '登记档案 CID' }).click();
  await expect(page.getByText(`已登记：ipfs://${dossierCid}`)).toBeVisible();
  await page.getByLabel('投票理由').fill('依据任务规格和交付证据，支持争议方退款并终止任务。');
  await page.getByRole('button', { name: /确认投票/ }).click();
  await expect(page.getByText('退款提案通过').first()).toBeVisible();
  await expect(page.getByRole('button', { name: '入队并执行最终裁决' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('requester invitations and developer acceptance unlock funding only after every stage responds', async ({ page }) => {
  const profile = { id: 'market-user', email: 'market@example.test', displayName: 'Market User', role: 'requester' as 'requester' | 'developer' };
  const mission = {
    id: 'TASK-MARKET-E2E', title: 'Agent Market 浏览器验收', description: '验证邀请、接单和启动门禁。', category: '商业研究', tags: ['研究'],
    budget: 300, paymentMethod: 'web2_balance', deadline: '2026-09-01', reviewDueAt: null, priority: 'high', expertise: 'expert',
    yieldEnabled: false, status: 'matching', progress: 0, currentStage: '等待工作流确认', team: ['agent-one', 'agent-two', 'agent-three'], createdAt: '2026-08-20T00:00:00.000Z',
    workflowVersion: 1, workflowViewport: { x: 0, y: 0, zoom: 1 },
  };
  const agents = ['one', 'two', 'three'].map((suffix, index) => ({
    id: `agent-${suffix}`, ownerId: profile.id, name: `Agent ${index + 1}`, category: '商业研究', summary: '用于浏览器验收的已激活 Agent。', tags: ['研究'],
    status: 'active', trustScore: 9, successRate: 90, responseTime: '1.0s', price: 100, jobs: 0, volume: 0, author: profile.displayName,
    version: 'v1.0.0', official: false, accent: index === 0 ? 'cyan' : index === 1 ? 'lime' : 'amber', wallet: `0x${String(index + 1).padStart(40, '0')}`,
  }));
  const stages = agents.map((agent, index) => ({
    id: `stage-${index + 1}`, missionId: mission.id, position: index + 1, name: `阶段 ${index + 1}`, purpose: '完成可验证阶段输出。', category: '商业研究',
    budget: 100, status: 'queued', agentId: agent.id, nodeType: 'task', positionX: 80 + index * 330, positionY: 100, progress: 0,
    input: { executionMode: 'analyze', inputContract: '', outputContract: '' }, output: null,
  }));
  const edges = stages.slice(1).map((stage, index) => ({
    id: `edge-${index + 1}`, missionId: mission.id, sourceStageId: stages[index].id, targetStageId: stage.id,
  }));
  let offers: Array<Record<string, unknown>> = [];
  const token = [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: profile.id, email: profile.email, iat: 1_787_200_000, exp: 1_818_736_000 })).toString('base64url'),
    'test-signature',
  ].join('.');
  const envelope = (data: unknown) => JSON.stringify({ data });

  await page.route('**/v1/accounts:signInWithPassword**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ localId: profile.id, email: profile.email, tenantId: 'agentmesh-platf-749a-powdj', idToken: token, refreshToken: 'test-refresh-token', expiresIn: '3600', registered: true }),
  }));
  await page.route('**/v1/accounts:lookup**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ users: [{ localId: profile.id, email: profile.email, emailVerified: true, tenantId: 'agentmesh-platf-749a-powdj' }] }),
  }));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const fulfill = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: envelope(data) });
    if (path === '/api/auth/verify') return fulfill({ profile });
    if (path === '/api/bootstrap') return fulfill({ profile, missions: [mission], agents, notifications: [], developer: profile.role === 'developer' ? { jobs: 1, activeAgents: 3, volume: 0, pending: 1 } : null });
    if (path === '/api/disputes') return fulfill([]);
    if (path === '/api/agents') return fulfill(agents);
    if (path === '/api/me/role' && request.method() === 'PUT') {
      profile.role = (request.postDataJSON() as { role: 'requester' | 'developer' }).role;
      return fulfill(profile);
    }
    if (path === `/api/missions/${mission.id}`) return fulfill({ mission, stages, edges, offers, events: [], deliverables: [], escrow: { status: 'pending', amount: mission.budget, token: 'CREDIT', network: 'agentmesh' }, disputes: [] });
    if (path === `/api/missions/${mission.id}/workflow` && request.method() === 'POST') {
      offers = stages.map((stage, index) => ({ id: `offer-${index + 1}`, missionId: mission.id, stageId: stage.id, agentId: stage.agentId, status: 'pending', expiresAt: '2026-08-21T00:00:00.000Z', respondedAt: null, createdAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-20T00:00:00.000Z' }));
      return fulfill({ mission, stages, edges, offers });
    }
    const offerMatch = path.match(new RegExp(`^/api/missions/${mission.id}/offers/(.+)$`));
    if (offerMatch && request.method() === 'POST') {
      const decision = (request.postDataJSON() as { decision: 'accepted' | 'declined' }).decision;
      offers = offers.map((offer) => offer.id === offerMatch[1] ? { ...offer, status: decision, respondedAt: '2026-08-20T00:05:00.000Z' } : offer);
      return fulfill(offers.find((offer) => offer.id === offerMatch[1]));
    }
    return fulfill({ code: 'NOT_MOCKED', path }, 404);
  });

  await page.goto(`/#/missions/${mission.id}/workflow`);
  await page.getByRole('button', { name: `登录 ${BRAND.platform.name}` }).click();
  const loginDialog = page.getByRole('dialog').last();
  await loginDialog.getByLabel('邮箱').fill(profile.email);
  await loginDialog.getByLabel('密码').fill('browser-test-password');
  await loginDialog.getByRole('button', { name: '登录真实工作区' }).click();
  await expect(page.getByRole('heading', { name: 'DAG 工作流编排' })).toBeVisible();

  await page.getByRole('button', { name: '发送邀请' }).click();
  await expect(page.getByText('已接单 0/3')).toBeVisible();
  await expect(page.getByRole('button', { name: '邀请已发送' })).toBeDisabled();

  const developerRoleButton = page.locator('header').getByRole('button', { name: '开发者' });
  await developerRoleButton.click();
  await expect(developerRoleButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/#\/developer$/);

  await page.goto('/#/developer/agents');
  const fleetScene = page.getByRole('region', { name: 'Agent 数字孪生指挥舱' });
  await expect(fleetScene).toBeVisible({ timeout: 15_000 });
  await expect(fleetScene.getByText('0 执行')).toBeVisible();
  await expect(fleetScene.getByText('3 待接单')).toBeVisible();
  await fleetScene.getByRole('button', { name: 'Agent 2，等待接单' }).click();
  await expect(fleetScene.locator('aside').getByRole('heading', { name: 'Agent 2' })).toBeVisible();
  await expect(fleetScene.locator('aside').getByText(mission.title)).toBeVisible();
  await expect(fleetScene.locator('aside').getByText('0%', { exact: true })).toBeVisible();
  const tourButton = fleetScene.getByRole('button', { name: /演示巡航|停止巡航/ });
  await tourButton.click();
  await expect(tourButton).toHaveAttribute('aria-pressed', 'true');
  await tourButton.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(fleetScene).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.goto('/#/developer/jobs');
  await expect(page.getByRole('heading', { name: '接单记录' })).toBeVisible();
  const previousViewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  const jobStatusBadge = page.locator('table tbody [data-status-badge]').first();
  await expect(jobStatusBadge).toHaveText('待接单');
  const badgeLayout = await jobStatusBadge.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, whiteSpace: getComputedStyle(element).whiteSpace };
  });
  expect(badgeLayout.whiteSpace).toBe('nowrap');
  expect(badgeLayout.width).toBeGreaterThan(badgeLayout.height);
  expect(badgeLayout.height).toBeLessThanOrEqual(32);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  if (previousViewport) await page.setViewportSize(previousViewport);
  for (let remaining = 3; remaining > 0; remaining -= 1) {
    await expect(page.getByText(`${remaining} 个待响应`)).toBeVisible();
    await page.getByRole('button', { name: '接受' }).first().click();
  }
  await expect(page.getByText('0 个待响应')).toBeVisible();

  const requesterRoleButton = page.locator('header').getByRole('button', { name: '任务方' });
  await requesterRoleButton.click();
  await expect(requesterRoleButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/#\/dashboard$/);
  await page.goto(`/#/missions/${mission.id}/workflow`);
  await expect(page.getByText('全部接单')).toBeVisible();
  await expect(page.getByRole('button', { name: '确认托管并启动' })).toBeEnabled();
});
