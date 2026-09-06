import { expect, test } from '@playwright/test';
import { BRAND } from '../shared/brand';

test('required capability selection persists and empty candidates explain next steps', async ({ page }) => {
  const profile = { id: 'market-user', email: 'market@example.test', displayName: 'Market User', role: 'requester' as 'requester' | 'developer' };
  const mission = {
    id: 'TASK-MARKET-E2E', title: 'Agent Market 浏览器验收', description: '验证邀请、接单和启动门禁。', category: '商业研究', tags: ['研究'],
    budget: 300, paymentMethod: 'web2_balance', deadline: '2026-09-01', reviewDueAt: null, priority: 'high', expertise: 'expert',
    yieldEnabled: false, status: 'matching', progress: 0, currentStage: '等待工作流确认', team: ['agent-one', 'agent-two', 'agent-three'], createdAt: '2026-08-20T00:00:00.000Z',
    workflowVersion: 1, workflowViewport: { x: 0, y: 0, zoom: 1 },
  };
  const agents = ['one', 'two', 'three'].map((suffix, index) => ({
    id: `agent-${suffix}`, ownerId: profile.id, name: `Agent ${index + 1}`, category: '商业研究', summary: '用于浏览器验收的已激活 Agent。', tags: ['研究', 'x'.repeat(81)],
    status: 'active', trustScore: 9, successRate: 90, responseTime: '1.0s', price: 90, priceVersion: 1, jobs: 0, volume: 0, author: profile.displayName,
    version: 'v1.0.0', official: false, accent: index === 0 ? 'cyan' : index === 1 ? 'lime' : 'amber', wallet: `0x${String(index + 1).padStart(40, '0')}`,
  }));
  let stages = agents.map((agent, index) => ({
    id: `stage-${index + 1}`, missionId: mission.id, position: index + 1, name: `阶段 ${index + 1}`, purpose: '完成可验证阶段输出。', category: '商业研究',
    budget: 100, status: 'queued', agentId: agent.id, nodeType: 'task', positionX: 80 + index * 330, positionY: 100, progress: 0,
    input: { executionMode: 'analyze', inputContract: '', outputContract: '' }, output: null,
  }));
  const edges = stages.slice(1).map((stage, index) => ({
    id: `edge-${index + 1}`, missionId: mission.id, sourceStageId: stages[index].id, targetStageId: stage.id,
  }));
  let offers: Array<Record<string, unknown>> = [];
  let escrowAmount = mission.budget;
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
    if (path === `/api/missions/${mission.id}`) return fulfill({ mission, stages, edges, offers, events: [], deliverables: [], escrow: { status: 'pending', amount: escrowAmount, token: 'CREDIT', network: 'agentmesh' }, disputes: [] });
    if (path === `/api/missions/${mission.id}/candidates`) return fulfill(stages.map((stage) => ({ stageId: stage.id, stageName: stage.name, candidates: [] })));
    if (path === `/api/missions/${mission.id}/workflow/draft` && request.method() === 'PUT') {
      const body = request.postDataJSON();
      stages = body.nodes;
      mission.workflowVersion += 1;
      return fulfill({ mission, stages, edges });
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


  await page.locator('.react-flow__node').first().click();
  const requirements = page.getByRole('group', { name: '必需能力标签（可选）' });
  await expect(requirements).toBeVisible();
  await expect(requirements.getByRole('checkbox', { name: 'x'.repeat(81), exact: true })).toHaveCount(0);
  await requirements.getByRole('checkbox', { name: '研究', exact: true }).check();
  await expect(requirements.getByRole('checkbox', { name: '研究', exact: true })).toBeChecked();
  const saveRequest = page.waitForRequest((request) => request.url().endsWith('/workflow/draft') && request.method() === 'PUT');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  expect((await saveRequest).postDataJSON().nodes[0].input.requiredCapabilities).toEqual(['研究']);
  await expect(page.getByText('当前已保存的节点条件下没有合格候选。', { exact: false })).toBeVisible();
  await requirements.getByRole('checkbox', { name: '研究', exact: true }).uncheck();
  await expect(requirements.getByRole('checkbox', { name: '研究', exact: true })).not.toBeChecked();
});

for (const automatic of [false, true]) test(`backend team plan persists the decision reference (${automatic ? 'initial automatic' : 'button'})`, async ({page})=>{
  const profile = { id: 'market-user', email: 'market@example.test', displayName: 'Market User', role: 'requester' as 'requester' | 'developer' };
  const mission = {
    id: 'TASK-MARKET-E2E', title: 'Agent Market 浏览器验收', description: '验证邀请、接单和启动门禁。', category: '商业研究', tags: ['研究'],
    budget: 300, paymentMethod: 'web2_balance', deadline: '2026-09-01', reviewDueAt: null, priority: 'high', expertise: 'expert',
    yieldEnabled: false, status: 'matching', progress: 0, currentStage: '等待工作流确认', team: ['agent-one', 'agent-two', 'agent-three'], createdAt: '2026-08-20T00:00:00.000Z',
    workflowVersion: 1, workflowViewport: { x: 0, y: 0, zoom: 1 },
  };
  const agents = ['one', 'two', 'three'].map((suffix, index) => ({
    id: `agent-${suffix}`, ownerId: profile.id, name: `Agent ${index + 1}`, category: '商业研究', summary: '用于浏览器验收的已激活 Agent。', tags: ['研究', 'x'.repeat(81)],
    status: 'active', trustScore: 9, successRate: 90, responseTime: '1.0s', price: 90, priceVersion: 1, jobs: 0, volume: 0, author: profile.displayName,
    version: 'v1.0.0', official: false, accent: index === 0 ? 'cyan' : index === 1 ? 'lime' : 'amber', wallet: `0x${String(index + 1).padStart(40, '0')}`,
  }));
  let stages = agents.map((agent, index) => ({
    id: `stage-${index + 1}`, missionId: mission.id, position: index + 1, name: `阶段 ${index + 1}`, purpose: '完成可验证阶段输出。', category: '商业研究',
    budget: 100, status: 'queued', agentId: automatic ? null : agent.id, nodeType: 'task', positionX: 80 + index * 330, positionY: 100, progress: 0,
    input: { executionMode: 'analyze', inputContract: '', outputContract: '' }, output: null,
  }));
  const edges = stages.slice(1).map((stage, index) => ({
    id: `edge-${index + 1}`, missionId: mission.id, sourceStageId: stages[index].id, targetStageId: stage.id,
  }));
  let offers: Array<Record<string, unknown>> = [];
  let escrowAmount = mission.budget;
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
    if (path === `/api/missions/${mission.id}`) return fulfill({ mission, stages, edges, offers, events: [], deliverables: [], escrow: { status: 'pending', amount: escrowAmount, token: 'CREDIT', network: 'agentmesh' }, disputes: [] });
    if (path === `/api/missions/${mission.id}/match-plan`) return fulfill({id:'PLAN-browser',missionId:mission.id,workflowVersion:mission.workflowVersion,policyVersion:'agentmesh.match.v2.1',snapshotHash:'test',preference:'balanced',lockedAssignments:{},createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+300000).toISOString(),status:'ready',profiles:{},candidates:{},excluded:{},totalQuote:270,makespanSeconds:180,warnings:['审核估计，非工期保证'],assignments:stages.map((stage,index)=>({stageId:stage.id,agentId:agents[index].id,startSeconds:index*60,endSeconds:(index+1)*60,quote:90,reasons:['同任务类型验证证据 2 条','当前版本同类履约 12 次'],alternatives:[]}))});
    if (path === `/api/missions/${mission.id}/candidates`) return fulfill(stages.map((stage) => ({ stageId: stage.id, stageName: stage.name, candidates: [] })));
    if (path === `/api/missions/${mission.id}/workflow/draft` && request.method() === 'PUT') {
      const body = request.postDataJSON();
      stages = body.nodes;
      mission.workflowVersion += 1;
      return fulfill({ mission, stages, edges });
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


  if (!automatic) await page.getByRole('button',{name:'自动组队',exact:true}).click();
  await expect(page.getByText('已生成整组方案。保存后可发送邀请；报价、证据和容量将在发送前再次校验。')).toBeVisible();
  await page.locator('.react-flow__node').first().click();
  const panel=page.getByRole('region',{name:'自动组队方案'});
  await expect(panel).toBeVisible();
  await expect(panel.getByText('同任务类型验证证据 2 条')).toBeVisible();
  const saved=page.waitForRequest((request)=>request.url().endsWith('/workflow/draft') && request.method()==='PUT');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  const body=(await saved).postDataJSON();
  expect(body.nodes.every((node:{input:{matchingPlanId:string}})=>node.input.matchingPlanId==='PLAN-browser')).toBe(true);
  await page.screenshot({path:'/tmp/agentmesh-v2-matching.png'});
});
