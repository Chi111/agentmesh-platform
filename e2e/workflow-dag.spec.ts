import { expect, test, type Page, type Route } from '@playwright/test';

const now = '2026-08-22T12:00:00.000Z';
const requester = { id: 'USER-e2e-requester', email: 'requester@example.test', displayName: 'E2E Requester', role: 'requester' };
const agents = [
  {
    id: 'AGENT-pinme', name: 'PinMe Sol Engineering Agent', category: '软件开发', summary: '复杂工程任务', tags: ['架构', '代码'],
    status: 'active', trustScore: 9.8, successRate: 98.5, responseTime: '2m', price: 80, jobs: 42, volume: 3200,
    author: 'PinMe', version: '2.0.0', official: false, accent: 'cyan', ownerId: 'DEV-pinme', wallet: '0x1000000000000000000000000000000000000001',
  },
  {
    id: 'AGENT-ds', name: 'DeepSeek Engineering Agent', category: '软件开发', summary: '日常工程任务', tags: ['代码', '检查'],
    status: 'active', trustScore: 8.9, successRate: 94.2, responseTime: '1m', price: 40, jobs: 76, volume: 4100,
    author: 'DeepSeek', version: '2.0.0', official: false, accent: 'lime', ownerId: 'DEV-ds', wallet: '0x2000000000000000000000000000000000000002',
  },
];

const baseMission = {
  id: 'MISSION-DAG-E2E', title: '复杂工程 DAG 验证', description: '通过并行任务、人工审批和汇合节点完成完整工程交付。',
  category: '软件开发', tags: ['TypeScript', 'React'], budget: 300, paymentMethod: 'web2_balance', deadline: '2026-09-30',
  priority: 'high', expertise: 'principal', yieldEnabled: false, status: 'matching', progress: 0, createdAt: now,
  currentStage: 'DAG 草稿已保存，等待校验与邀请', team: [], reviewDueAt: null, workflowVersion: 3,
  workflowViewport: { x: 0, y: 0, zoom: 1 },
};

const draftStages = [
  {
    id: 'STAGE-analysis', missionId: baseMission.id, position: 1, nodeType: 'task', positionX: 80, positionY: 80, progress: 0,
    name: '架构分析', purpose: '分析仓库边界并输出实施方案。', category: '软件开发', budget: 120, status: 'queued', agentId: null,
    input: { executionMode: 'analyze', inputContract: '任务目标', outputContract: '架构摘要' }, output: null,
  },
  {
    id: 'STAGE-implement', missionId: baseMission.id, position: 2, nodeType: 'task', positionX: 430, positionY: 80, progress: 0,
    name: '工程实现', purpose: '实现多文件代码变更并完成验证。', category: '软件开发', budget: 180, status: 'queued', agentId: null,
    input: { executionMode: 'implement', inputContract: '架构摘要', outputContract: '变更摘要和制品' }, output: null,
  },
  {
    id: 'STAGE-gate', missionId: baseMission.id, position: 3, nodeType: 'approval', positionX: 780, positionY: 80, progress: 0,
    name: '任务方审批', purpose: '检查实现与验证结果。', category: '人工审批', budget: 0, status: 'queued', agentId: null,
    input: { approvalCriteria: '测试通过且风险已说明' }, output: null,
  },
];

const draftEdges = [
  { id: 'EDGE-analysis-implement', missionId: baseMission.id, sourceStageId: 'STAGE-analysis', targetStageId: 'STAGE-implement' },
  { id: 'EDGE-implement-gate', missionId: baseMission.id, sourceStageId: 'STAGE-implement', targetStageId: 'STAGE-gate' },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('agentmesh:e2e-auth', 'true');
  });
});

function envelope(data: unknown) {
  return { data, meta: { requestId: 'REQ-e2e' } };
}

async function mockWorkspace(page: Page, missionDetail: Record<string, unknown>, onRequest?: (route: Route) => boolean | Promise<boolean>) {
  await page.route('**/api/**', async (route) => {
    if (onRequest && await onRequest(route)) return;
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/agents') return route.fulfill({ json: envelope(agents) });
    if (path === '/api/bootstrap') return route.fulfill({ json: envelope({ profile: requester, missions: [missionDetail.mission], agents, notifications: [], developer: null }) });
    if (path === '/api/disputes') return route.fulfill({ json: envelope([]) });
    if (path === `/api/missions/${baseMission.id}/candidates`) return route.fulfill({ json: envelope(draftStages.filter((stage) => stage.nodeType === 'task').map((stage) => ({
      stageId: stage.id,
      stageName: stage.name,
      candidates: [
        { agent: agents[0], score: 98.2, reasons: ['复杂工程能力匹配', '深度审查'] },
        { agent: agents[1], score: 89.4, reasons: ['常规代码能力匹配', '响应快'] },
      ],
    }))) });
    if (path === `/api/missions/${baseMission.id}/stream`) return route.fulfill({ status: 503, json: { error: { code: 'STREAM_TEST_DISABLED' } } });
    if (path === `/api/missions/${baseMission.id}`) return route.fulfill({ json: envelope(missionDetail) });
    return route.fulfill({ status: 404, json: { error: { code: 'UNMOCKED', message: `${request.method()} ${path}` } } });
  });
}

test('desktop editor supports manual assignment, save, clear and undo', async ({ page }) => {
  const detail = { mission: baseMission, stages: draftStages, edges: draftEdges, offers: [], events: [], deliverables: [], escrow: { status: 'pending', amount: 300, token: 'CREDIT', network: 'web2', paymentMethod: 'web2_balance' }, disputes: [] };
  let savedDraft: Record<string, unknown> | null = null;
  await mockWorkspace(page, detail, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === `/api/missions/${baseMission.id}/workflow/draft` && request.method() === 'PUT') {
      savedDraft = request.postDataJSON() as Record<string, unknown>;
      const nodes = savedDraft.nodes as typeof draftStages;
      return route.fulfill({ json: envelope({ mission: { ...baseMission, workflowVersion: 4 }, stages: nodes, edges: savedDraft.edges }) }).then(() => true);
    }
    return false;
  });

  await page.goto(`/#/missions/${baseMission.id}/workflow`);
  await expect(page.getByRole('heading', { name: 'DAG 工作流编排' })).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);

  await page.getByText('架构分析', { exact: true }).first().click();
  await expect(page.getByText('候选建议（需手动选择）')).toBeVisible();
  await expect(page.getByLabel('Agent（不自动选择）')).toHaveValue('');
  await page.getByLabel('Agent（不自动选择）').selectOption('AGENT-pinme');
  await page.getByLabel('名称').fill('架构与风险分析');
  await page.getByRole('button', { name: '保存' }).click();
  await expect.poll(() => savedDraft).not.toBeNull();
  expect(savedDraft?.workflowVersion).toBe(3);
  expect((savedDraft?.nodes as Array<Record<string, unknown>>).find((node) => node.id === 'STAGE-analysis')).toMatchObject({ name: '架构与风险分析', agentId: 'AGENT-pinme' });

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '空白画布' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await page.getByTitle('撤销').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(3);

  await page.getByText('架构与风险分析', { exact: true }).first().click();
  await page.getByRole('button', { name: '删除所选' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.getByTitle('撤销').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await page.getByTitle('重做').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.getByTitle('撤销').click();
  await page.getByRole('button', { name: '自动布局' }).click();
  await page.getByRole('button', { name: '校验' }).click();
  await expect(page.getByText('发送邀请前必须为每个任务节点手动选择 Agent。')).toBeVisible();
});

test('desktop editor creates nodes by drag and connects handles', async ({ page }) => {
  const detail = { mission: baseMission, stages: draftStages, edges: draftEdges, offers: [], events: [], deliverables: [], escrow: { status: 'pending', amount: 300, token: 'CREDIT', network: 'web2' }, disputes: [] };
  await mockWorkspace(page, detail);
  await page.goto(`/#/missions/${baseMission.id}/workflow`);

  const canvas = page.locator('.react-flow').first();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await page.getByRole('button', { name: '人工审批 Gate' }).dispatchEvent('dragstart', { dataTransfer });
  await canvas.dispatchEvent('dragover', {
    dataTransfer,
    clientX: canvasBox!.x + 220,
    clientY: canvasBox!.y + canvasBox!.height * 0.68,
  });
  await canvas.dispatchEvent('drop', {
    dataTransfer,
    clientX: canvasBox!.x + 220,
    clientY: canvasBox!.y + canvasBox!.height * 0.68,
  });
  await dataTransfer.dispose();
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  const addedGate = page.locator('.react-flow__node').filter({ hasText: '人工审批 Gate' });
  await expect(addedGate).toHaveCount(1);

  const sourceHandle = page.locator('[data-id="STAGE-gate"] .react-flow__handle.source');
  const targetHandle = addedGate.locator('.react-flow__handle.target');
  await sourceHandle.dragTo(targetHandle);
  await expect(page.locator('.react-flow__edge')).toHaveCount(3);

  await page.getByTitle('撤销').click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await page.getByTitle('撤销').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await page.getByTitle('重做').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
});

test('funded workflow locks graph mutation including keyboard deletion', async ({ page }) => {
  const lockedMission = { ...baseMission, status: 'running', currentStage: '2 个节点执行中' };
  const detail = {
    mission: lockedMission,
    stages: draftStages.map((stage) => stage.nodeType === 'task' ? { ...stage, agentId: 'AGENT-pinme' } : stage),
    edges: draftEdges,
    offers: [],
    events: [],
    deliverables: [],
    escrow: { status: 'held', amount: 300, token: 'CREDIT', network: 'web2' },
    disputes: [],
  };
  await mockWorkspace(page, detail);
  await page.goto(`/#/missions/${baseMission.id}/workflow`);

  await expect(page.getByRole('button', { name: 'AI 生成' })).toBeDisabled();
  await page.getByText('架构分析', { exact: true }).first().click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.getByRole('button', { name: '删除所选' })).toBeDisabled();
});

test('mobile editor keeps a full canvas and opens node configuration as a bottom drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const detail = { mission: baseMission, stages: draftStages, edges: draftEdges, offers: [], events: [], deliverables: [], escrow: { status: 'pending', amount: 300, token: 'CREDIT', network: 'web2' }, disputes: [] };
  await mockWorkspace(page, detail);
  await page.goto(`/#/missions/${baseMission.id}/workflow`);
  await expect(page.getByRole('button', { name: '任务' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gate' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await page.locator('.react-flow__node[data-id="STAGE-analysis"]').click();
  const drawer = page.locator('aside').filter({ has: page.getByText('节点配置') });
  await expect(drawer).toBeVisible();
  const box = await drawer.boundingBox();
  expect(box?.y).toBeGreaterThan(200);
  expect(Math.abs((box?.y ?? 0) + (box?.height ?? 0) - 844)).toBeLessThan(20);
  await page.getByRole('button', { name: '关闭' }).click();
  await page.locator('.react-flow__node[data-id="STAGE-gate"]').click();
  await expect(page.getByText('直接上游节点')).toBeVisible();
  await expect(page.locator('label').filter({ hasText: '工程实现' }).getByRole('checkbox')).toBeChecked();
});

test('compact desktop docks node configuration on the right', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 800 });
  const detail = { mission: baseMission, stages: draftStages, edges: draftEdges, offers: [], events: [], deliverables: [], escrow: { status: 'pending', amount: 300, token: 'CREDIT', network: 'web2' }, disputes: [] };
  await mockWorkspace(page, detail);
  await page.goto(`/#/missions/${baseMission.id}/workflow`);

  await page.locator('.react-flow__node[data-id="STAGE-analysis"]').click();
  const inspector = page.locator('aside').filter({ has: page.getByText('节点配置') });
  await expect(inspector).toBeVisible();
  await expect(page.locator('.workflow-library-sidebar')).toBeHidden();

  const inspectorBox = await inspector.boundingBox();
  const canvasBox = await page.locator('.react-flow').boundingBox();
  expect(inspectorBox?.width).toBeLessThanOrEqual(322);
  expect(inspectorBox?.x).toBeGreaterThan((canvasBox?.x ?? 0) + (canvasBox?.width ?? 0) - 2);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
});

test('AI compile replaces the draft graph without assigning an Agent', async ({ page }) => {
  const detail = { mission: baseMission, stages: draftStages, edges: draftEdges, offers: [], events: [], deliverables: [], escrow: { status: 'pending', amount: 300, token: 'CREDIT', network: 'web2' }, disputes: [] };
  const compiledStages = [
    { ...draftStages[0], name: 'AI 需求分析', positionX: 100, positionY: 60, agentId: null },
    { ...draftStages[1], name: 'AI 并行实现', positionX: 460, positionY: 60, agentId: null },
    { ...draftStages[2], name: 'AI 人工验收', positionX: 820, positionY: 60, agentId: null },
  ];
  let compiled = false;
  await mockWorkspace(page, detail, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === `/api/missions/${baseMission.id}/compile` && request.method() === 'POST') {
      compiled = true;
      return route.fulfill({ json: envelope({ mission: { ...baseMission, workflowVersion: 4 }, stages: compiledStages, edges: draftEdges }) }).then(() => true);
    }
    return false;
  });

  await page.goto(`/#/missions/${baseMission.id}/workflow`);
  await page.getByRole('button', { name: 'AI 生成' }).click();
  await expect.poll(() => compiled).toBe(true);
  await expect(page.getByText('AI 需求分析', { exact: true }).first()).toBeVisible();
  await page.getByText('AI 需求分析', { exact: true }).first().click();
  await expect(page.getByLabel('Agent（不自动选择）')).toHaveValue('');
});

test('execution graph exposes Agent, events, artifacts and Gate controls per node', async ({ page }) => {
  await page.setViewportSize({ width: 1728, height: 907 });
  const executionMission = { ...baseMission, status: 'running', progress: 60, currentStage: '1 个待审批', team: ['AGENT-pinme'] };
  const executionStages = [
    { ...draftStages[0], status: 'done', progress: 100, agentId: 'AGENT-pinme', output: { summary: '架构分析已完成', risks: ['依赖升级风险'] } },
    { ...draftStages[1], status: 'running', progress: 40, agentId: 'AGENT-ds' },
    { ...draftStages[1], id: 'STAGE-failed', name: '失败节点', status: 'failed', progress: 0, agentId: 'AGENT-ds', positionX: 460, positionY: 340 },
    { ...draftStages[2], status: 'running', progress: 0 },
  ];
  const executionEdges = [{ id: 'EDGE-analysis-gate', missionId: baseMission.id, sourceStageId: 'STAGE-analysis', targetStageId: 'STAGE-gate' }];
  const detail = {
    mission: executionMission,
    stages: executionStages,
    edges: executionEdges,
    offers: [],
    events: [{ id: 'EVT-analysis-done', missionId: baseMission.id, stageId: 'STAGE-analysis', type: 'stage.done', message: '架构分析完成', createdAt: now }],
    deliverables: [{ id: 'DEL-analysis', missionId: baseMission.id, stageId: 'STAGE-analysis', agentId: 'AGENT-pinme', name: '架构报告', uri: 'https://artifacts.example.test/architecture', contentHash: 'sha256:architecture', mimeType: 'application/json', status: 'submitted', createdAt: now }],
    escrow: { status: 'held', amount: 300, token: 'CREDIT', network: 'web2' },
    disputes: [],
  };
  let gateDecision: Record<string, unknown> | null = null;
  await mockWorkspace(page, detail, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/gates/STAGE-gate/decision') && request.method() === 'POST') {
      gateDecision = request.postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: envelope({ mission: executionMission, stages: executionStages, edges: executionEdges }) }).then(() => true);
    }
    return false;
  });

  await page.goto(`/#/missions/${baseMission.id}/execution`);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  const executionFlow = page.locator('.workflow-execution-flow');
  await expect(executionFlow).toHaveClass(/dark/);
  await expect(executionFlow.locator('.react-flow__attribution')).toHaveCSS('background-color', 'rgba(13, 17, 23, 0.82)');
  await expect(executionFlow.locator('.react-flow__controls-button').first()).toHaveCSS('background-color', 'rgb(22, 33, 41)');
  const runningTaskCard = executionFlow.locator('.react-flow__node[data-id="STAGE-implement"] article');
  await expect(runningTaskCard).toHaveCSS('background-color', 'rgb(236, 251, 253)');
  await expect(runningTaskCard.getByText('执行中')).toHaveCSS('color', 'rgb(0, 127, 150)');
  await page.getByText('架构分析', { exact: true }).first().click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await expect(page.getByText('PinMe Sol Engineering Agent', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('架构分析完成')).toBeVisible();
  await expect(page.getByText('架构报告', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('sha256:architecture')).toBeVisible();

  await page.getByText('失败节点', { exact: true }).first().click();
  const retryButton = page.getByRole('button', { name: '显式重试此节点' });
  await expect(retryButton).toBeVisible();
  await expect(retryButton).toBeInViewport();

  await page.getByText('任务方审批', { exact: true }).first().click();
  await expect(page.getByText('人工审批 Gate', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '批准' })).toBeInViewport();
  await expect(page.getByRole('button', { name: '驳回并返工' })).toBeInViewport();
  await page.getByLabel('返工：架构分析').check();
  await page.getByPlaceholder('审批反馈（驳回时建议填写）').fill('需要补充依赖风险');
  await page.getByRole('button', { name: '驳回并返工' }).click();
  await expect.poll(() => gateDecision).not.toBeNull();
  expect(gateDecision).toMatchObject({ decision: 'rejected', feedback: '需要补充依赖风险', reworkNodeIds: ['STAGE-analysis'] });
});
