import { expect, test } from '@playwright/test';

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

test('private workspace routes require authentication instead of local fallback data', async ({ page }) => {
  for (const route of ['/dashboard', '/missions/new', '/developer', '/arbitration', '/settings', '/wallet/test-funds']) {
    await page.goto(`/#${route}`);
    await expect(page.getByRole('heading', { name: '登录后进入正式工作区' })).toBeVisible();
    await expect(page.getByText('本地演示数据')).toBeVisible();
  }

  await page.getByRole('button', { name: '登录 AgentMesh' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('sidebar exposes one formal workspace status and no data-mode switch', async ({ page }) => {
  await page.goto('/#/agents');
  const sidebar = page.locator('#app-sidebar');

  await expect(sidebar.getByText('PUBLIC DIRECTORY · READ ONLY')).toBeVisible();
  await expect(sidebar.getByRole('button', { name: /连接真实工作区|连接正式工作区/ })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: '演示沙盒' })).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: '真实工作区', exact: true })).toHaveCount(0);
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
  await expect(page.getByRole('heading', { name: '登录后进入正式工作区' })).toBeVisible();
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

test('public Agent directory remains available when private workspace hydration fails', async ({ page }) => {
  const officialAgent = {
    id: 'official-evidence-scout', ownerId: 'agentmesh-official', name: 'Evidence Scout', category: '数据研究',
    summary: '面向测试网任务的证据研究 Agent，返回可审计的结构化研究结果。', tags: ['研究', '证据', '核验'],
    status: 'active', trustScore: 9.1, successRate: 91, responseTime: '1.2s', price: 12, jobs: 0, volume: 0,
    author: 'AgentMesh Official', version: 'v1.0.0', official: true, wallet: '0x2200000000000000000000000000000000000a11',
    endpoint: 'https://agentmesh-platform-74a3.api.pinme.pro/api/agents/official-evidence-scout/invoke', authType: 'bearer',
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

  await page.goto('/#/agents/official-evidence-scout');
  await expect(page.getByText('Agent Endpoint', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '打开 Endpoint' })).toHaveAttribute(
    'href',
    'https://agentmesh-platform-74a3.api.pinme.pro/api/agents/official-evidence-scout/invoke',
  );
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

test('requester invitations and developer acceptance unlock funding only after every stage responds', async ({ page }) => {
  const profile = { id: 'market-user', email: 'market@example.test', displayName: 'Market User', role: 'requester' as 'requester' | 'developer' };
  const mission = {
    id: 'TASK-MARKET-E2E', title: 'Agent Market 浏览器验收', description: '验证邀请、接单和启动门禁。', category: '商业研究', tags: ['研究'],
    budget: 300, paymentMethod: 'web2_balance', deadline: '2026-09-01', reviewDueAt: null, priority: 'high', expertise: 'expert',
    yieldEnabled: false, status: 'matching', progress: 0, currentStage: '等待工作流确认', team: ['agent-one', 'agent-two', 'agent-three'], createdAt: '2026-08-20T00:00:00.000Z',
  };
  const agents = ['one', 'two', 'three'].map((suffix, index) => ({
    id: `agent-${suffix}`, ownerId: profile.id, name: `Agent ${index + 1}`, category: '商业研究', summary: '用于浏览器验收的已激活 Agent。', tags: ['研究'],
    status: 'active', trustScore: 9, successRate: 90, responseTime: '1.0s', price: 100, jobs: 0, volume: 0, author: profile.displayName,
    version: 'v1.0.0', official: false, accent: index === 0 ? 'cyan' : index === 1 ? 'lime' : 'amber', wallet: `0x${String(index + 1).padStart(40, '0')}`,
  }));
  const stages = agents.map((agent, index) => ({
    id: `stage-${index + 1}`, missionId: mission.id, position: index + 1, name: `阶段 ${index + 1}`, purpose: '完成可验证阶段输出。', category: '商业研究',
    budget: 100, status: 'queued', agentId: agent.id, input: {}, output: null,
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
    if (path === `/api/missions/${mission.id}`) return fulfill({ mission, stages, offers, events: [], deliverables: [], escrow: { status: 'pending', amount: mission.budget, token: 'CREDIT', network: 'agentmesh' }, disputes: [] });
    if (path === `/api/missions/${mission.id}/workflow` && request.method() === 'POST') {
      offers = stages.map((stage, index) => ({ id: `offer-${index + 1}`, missionId: mission.id, stageId: stage.id, agentId: stage.agentId, status: 'pending', expiresAt: '2026-08-21T00:00:00.000Z', respondedAt: null, createdAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-20T00:00:00.000Z' }));
      return fulfill({ mission, stages, offers });
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
  await page.getByRole('button', { name: '登录 AgentMesh' }).click();
  const loginDialog = page.getByRole('dialog').last();
  await loginDialog.getByLabel('邮箱').fill(profile.email);
  await loginDialog.getByLabel('密码').fill('browser-test-password');
  await loginDialog.getByRole('button', { name: '登录真实工作区' }).click();
  await expect(page.getByRole('heading', { name: '确认执行工作流' })).toBeVisible();

  await page.getByRole('button', { name: '发送阶段邀请' }).click();
  await page.getByRole('button', { name: '确认并发送' }).click();
  await expect(page.getByText('已接单 0/3')).toBeVisible();
  await expect(page.getByRole('button', { name: '重新发送阶段邀请' })).toBeDisabled();

  const developerRoleButton = page.locator('header').getByRole('button', { name: '开发者' });
  await developerRoleButton.click();
  await expect(developerRoleButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/#\/developer$/);
  await page.goto('/#/developer/jobs');
  await expect(page.getByRole('heading', { name: '接单记录' })).toBeVisible();
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
  await expect(page.getByText('已接单 3/3')).toBeVisible();
  await expect(page.getByRole('button', { name: '确认托管并启动' })).toBeEnabled();
});
