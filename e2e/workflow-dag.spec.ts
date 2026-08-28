import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

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

async function expectNoNodeOverlap(nodes: Locator) {
  await expect.poll(async () => {
    const boxes = await nodes.evaluateAll((items) => items.map((item) => {
      const box = item.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    }));
    for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
        const left = boxes[leftIndex];
        const right = boxes[rightIndex];
        if (!(left.right <= right.left || right.right <= left.left || left.bottom <= right.top || right.bottom <= left.top)) return false;
      }
    }
    return true;
  }).toBe(true);
}

async function mockWorkspace(
  page: Page,
  missionDetail: Record<string, unknown>,
  onRequest?: (route: Route) => boolean | Promise<boolean>,
  workspaceProfile = requester,
) {
  await page.route('**/api/**', async (route) => {
    if (onRequest && await onRequest(route)) return;
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/agents') return route.fulfill({ json: envelope(agents) });
    if (path === '/api/bootstrap') return route.fulfill({ json: envelope({ profile: workspaceProfile, missions: [missionDetail.mission], agents, notifications: [], developer: null }) });
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
  await page.getByLabel('名称', { exact: true }).fill('架构与风险分析');
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

test('edge inspector persists a bounded terminal Gate condition', async ({ page }) => {
  const detail = { mission: baseMission, stages: draftStages, edges: draftEdges, offers: [], events: [], deliverables: [], escrow: { status: 'pending', amount: 300, token: 'CREDIT', network: 'web2', paymentMethod: 'web2_balance' }, disputes: [] };
  let savedDraft: Record<string, unknown> | null = null;
  await mockWorkspace(page, detail, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === `/api/missions/${baseMission.id}/workflow/draft` && request.method() === 'PUT') {
      savedDraft = request.postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: envelope({ mission: { ...baseMission, workflowVersion: 4 }, stages: savedDraft.nodes, edges: savedDraft.edges }) }).then(() => true);
    }
    return false;
  });

  await page.goto(`/#/missions/${baseMission.id}/workflow`);
  await page.locator('.react-flow__edge[data-id="EDGE-implement-gate"] .react-flow__edge-interaction').dispatchEvent('click');
  await expect(page.getByText('转换规则', { exact: true })).toBeVisible();
  await page.getByText('条件 Gate', { exact: true }).click();
  await page.getByLabel('输出路径（JSON Pointer）').fill('/verified');
  await page.getByLabel('运算符').selectOption('eq');
  await page.getByLabel('比较值').fill('true');
  await page.getByRole('button', { name: '保存' }).click();

  await expect.poll(() => savedDraft).not.toBeNull();
  expect((savedDraft?.edges as Array<Record<string, unknown>>).find((edge) => edge.id === 'EDGE-implement-gate')).toMatchObject({
    condition: { op: 'eq', path: '/verified', value: true },
    mappings: [],
  });
});

test('edge inspector accepts the root JSON Pointer as a mapping source', async ({ page }) => {
  const detail = { mission: baseMission, stages: draftStages, edges: draftEdges, offers: [], events: [], deliverables: [], escrow: { status: 'pending', amount: 300, token: 'CREDIT', network: 'web2', paymentMethod: 'web2_balance' }, disputes: [] };
  let savedDraft: Record<string, unknown> | null = null;
  await mockWorkspace(page, detail, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === `/api/missions/${baseMission.id}/workflow/draft` && request.method() === 'PUT') {
      savedDraft = request.postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: envelope({ mission: { ...baseMission, workflowVersion: 4 }, stages: savedDraft.nodes, edges: savedDraft.edges }) }).then(() => true);
    }
    return false;
  });

  await page.goto(`/#/missions/${baseMission.id}/workflow`);
  await page.locator('.react-flow__edge[data-id="EDGE-analysis-implement"] .react-flow__edge-interaction').dispatchEvent('click');
  await page.getByRole('button', { name: '+ 添加' }).click();
  await page.getByLabel('来源').fill('');
  await page.getByLabel('写入').fill('/upstream');
  await page.getByRole('button', { name: '保存' }).click();

  await expect.poll(() => savedDraft).not.toBeNull();
  expect((savedDraft?.edges as Array<Record<string, unknown>>).find((edge) => edge.id === 'EDGE-analysis-implement')).toMatchObject({
    mappings: [{ from: '', to: '/upstream', required: true }],
  });
});

test('edge inspector views and edits every composite condition form as JSON', async ({ page }) => {
  const detail = { mission: baseMission, stages: draftStages, edges: draftEdges, offers: [], events: [], deliverables: [], escrow: { status: 'pending', amount: 300, token: 'CREDIT', network: 'web2', paymentMethod: 'web2_balance' }, disputes: [] };
  let savedDraft: Record<string, unknown> | null = null;
  await mockWorkspace(page, detail, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === `/api/missions/${baseMission.id}/workflow/draft` && request.method() === 'PUT') {
      savedDraft = request.postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: envelope({ mission: { ...baseMission, workflowVersion: 4 }, stages: savedDraft.nodes, edges: savedDraft.edges }) }).then(() => true);
    }
    return false;
  });

  await page.goto(`/#/missions/${baseMission.id}/workflow`);
  await page.locator('.react-flow__edge[data-id="EDGE-implement-gate"] .react-flow__edge-interaction').dispatchEvent('click');
  await page.getByText('条件 Gate', { exact: true }).click();
  const editor = page.getByLabel('完整条件 AST（JSON）');
  await editor.fill(JSON.stringify({
    op: 'or',
    conditions: [
      { op: 'eq', path: '/verified', value: true },
      { op: 'not', condition: { op: 'in', path: '/risk', value: ['critical'] } },
    ],
  }, null, 2));
  await page.getByRole('button', { name: '应用条件 JSON' }).click();
  await expect(editor).toHaveValue(/"op": "or"/u);
  await expect(editor).toHaveValue(/"op": "not"/u);
  await expect(editor).toHaveValue(/"op": "in"/u);
  await page.getByRole('button', { name: '保存' }).click();

  await expect.poll(() => savedDraft).not.toBeNull();
  expect((savedDraft?.edges as Array<Record<string, unknown>>).find((edge) => edge.id === 'EDGE-implement-gate')).toMatchObject({
    condition: {
      op: 'or',
      conditions: [
        { op: 'eq', path: '/verified', value: true },
        { op: 'not', condition: { op: 'in', path: '/risk', value: ['critical'] } },
      ],
    },
  });
});

test('template dialog saves a private version and requests static expansion', async ({ page }) => {
  const detail = { mission: baseMission, stages: draftStages, edges: draftEdges, offers: [], events: [], deliverables: [], escrow: { status: 'pending', amount: 300, token: 'CREDIT', network: 'web2', paymentMethod: 'web2_balance' }, disputes: [] };
  const templateDetail = {
    template: { id: 'TEMPLATE-e2e', ownerId: requester.id, name: '工程交付链', description: 'E2E template', currentVersion: 1, createdAt: now, updatedAt: now },
    version: { templateId: 'TEMPLATE-e2e', version: 1, nodes: draftStages, edges: draftEdges, entryIds: ['STAGE-analysis'], exitIds: ['STAGE-gate'], contentHash: `sha256:${'a'.repeat(64)}`, createdAt: now },
  };
  let templates: typeof templateDetail[] = [];
  let expansionBody: Record<string, unknown> | null = null;
  await mockWorkspace(page, detail, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/workflow-templates' && request.method() === 'GET') {
      return route.fulfill({ json: envelope(templates) }).then(() => true);
    }
    if (path === '/api/workflow-templates' && request.method() === 'POST') {
      templates = [templateDetail];
      return route.fulfill({ status: 201, json: envelope(templateDetail) }).then(() => true);
    }
    if (path === `/api/missions/${baseMission.id}/workflow/expand` && request.method() === 'POST') {
      expansionBody = request.postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: envelope({ mission: { ...baseMission, workflowVersion: 4 }, stages: draftStages, edges: draftEdges, template: templateDetail.template, templateVersion: 1, iterations: 2 }) }).then(() => true);
    }
    return false;
  });

  await page.goto(`/#/missions/${baseMission.id}/workflow`);
  await page.getByRole('button', { name: '模板与循环' }).click();
  await page.getByLabel('模板名称').fill('工程交付链');
  await page.getByLabel('说明').fill('E2E template');
  await page.getByRole('button', { name: '保存私有模板' }).click();
  await expect(page.getByRole('combobox', { name: '模板', exact: true })).toHaveValue('TEMPLATE-e2e');
  await page.getByLabel('静态次数').selectOption('2');
  await page.getByRole('button', { name: '展开到画布' }).click();

  await expect.poll(() => expansionBody).not.toBeNull();
  expect(expansionBody).toMatchObject({
    templateId: 'TEMPLATE-e2e', iterations: 2, budget: 300, workflowVersion: 3, replace: true,
  });
});

test('legacy overlapping drafts persist automatic layout before confirmation', async ({ page }) => {
  const overlappingStages = draftStages.map((stage) => ({
    ...stage,
    positionX: 80,
    positionY: 80,
    agentId: stage.nodeType === 'task' ? 'AGENT-pinme' : null,
  }));
  const detail = {
    mission: baseMission,
    stages: overlappingStages,
    edges: draftEdges,
    offers: [], events: [], deliverables: [],
    escrow: { status: 'pending', amount: 300, token: 'CREDIT', network: 'web2', paymentMethod: 'web2_balance' },
    disputes: [],
  };
  const requestOrder: string[] = [];
  let savedNodes: Array<Record<string, unknown>> = [];
  await mockWorkspace(page, detail, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === `/api/missions/${baseMission.id}/workflow/draft` && request.method() === 'PUT') {
      requestOrder.push('save');
      savedNodes = (request.postDataJSON() as { nodes: Array<Record<string, unknown>> }).nodes;
      return route.fulfill({ json: envelope({ mission: { ...baseMission, workflowVersion: 4 }, stages: savedNodes, edges: draftEdges }) }).then(() => true);
    }
    if (path === `/api/missions/${baseMission.id}/workflow` && request.method() === 'POST') {
      requestOrder.push('confirm');
      return route.fulfill({ json: envelope({ mission: { ...baseMission, workflowVersion: 4 }, stages: savedNodes, edges: draftEdges, offers: [] }) }).then(() => true);
    }
    return false;
  });

  await page.goto(`/#/missions/${baseMission.id}/workflow`);
  await expectNoNodeOverlap(page.locator('.react-flow__node'));
  await page.getByRole('button', { name: '发送邀请' }).click();
  await expect.poll(() => requestOrder).toEqual(['save', 'confirm']);
  expect(new Set(savedNodes.map((node) => `${node.positionX}:${node.positionY}`)).size).toBe(savedNodes.length);
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

test('desktop quick add places every new node in a free slot', async ({ page }) => {
  const detail = { mission: baseMission, stages: draftStages, edges: draftEdges, offers: [], events: [], deliverables: [], escrow: { status: 'pending', amount: 300, token: 'CREDIT', network: 'web2' }, disputes: [] };
  await mockWorkspace(page, detail);
  await page.goto(`/#/missions/${baseMission.id}/workflow`);

  const quickAdd = page.locator('.workflow-library-sidebar').getByRole('button', { name: 'Agent 任务' });
  await quickAdd.click();
  await quickAdd.click();
  const nodes = page.locator('.react-flow__node');
  await expect(nodes).toHaveCount(5);
  await expectNoNodeOverlap(nodes);
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

  await expect(page.getByRole('button', { name: 'AI 智能编排' })).toBeDisabled();
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
  await page.getByRole('button', { name: '任务', exact: true }).click();
  await page.getByRole('button', { name: '任务', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
  await expectNoNodeOverlap(page.locator('.react-flow__node'));
  await page.getByRole('button', { name: '关闭' }).click();
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
    { ...draftStages[0], name: 'AI 需求分析', positionX: 0, positionY: 0, agentId: null },
    { ...draftStages[1], name: 'AI 并行实现', positionX: 0, positionY: 0, agentId: null },
    { ...draftStages[2], name: 'AI 人工验收', positionX: 0, positionY: 0, agentId: null },
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
  await page.getByRole('button', { name: 'AI 智能编排' }).click();
  await expect.poll(() => compiled).toBe(true);
  await expect(page.getByText('AI 需求分析', { exact: true }).first()).toBeVisible();
  await expectNoNodeOverlap(page.locator('.react-flow__node'));
  await page.getByText('AI 需求分析', { exact: true }).first().click();
  await expect(page.getByLabel('Agent（不自动选择）')).toHaveValue('');
});

test('execution graph exposes Agent, events, artifacts and Gate controls per node', async ({ page }) => {
  await page.setViewportSize({ width: 1728, height: 907 });
  const executionMission = { ...baseMission, status: 'running', progress: 60, currentStage: '1 个待审批', team: ['AGENT-pinme'] };
  const executionStages = [
    { ...draftStages[0], status: 'done', progress: 100, attemptNo: 2, agentId: 'AGENT-pinme', output: { summary: '架构分析已完成', risks: ['依赖升级风险'] } },
    { ...draftStages[1], status: 'running', progress: 40, agentId: 'AGENT-ds' },
    { ...draftStages[1], id: 'STAGE-failed', name: '失败节点', status: 'failed', progress: 0, agentId: 'AGENT-ds' },
    { ...draftStages[2], status: 'running', progress: 0 },
  ];
  const executionEdges = [{ id: 'EDGE-analysis-gate', missionId: baseMission.id, sourceStageId: 'STAGE-analysis', targetStageId: 'STAGE-gate', condition: { op: 'exists', path: '/verified' } }];
  const detail = {
    mission: executionMission,
    stages: executionStages,
    edges: executionEdges,
    offers: [],
    events: [{ id: 'EVT-analysis-done', missionId: baseMission.id, stageId: 'STAGE-analysis', type: 'stage.done', message: '架构分析完成', createdAt: now }],
    deliverables: [
      { id: 'DEL-analysis', missionId: baseMission.id, stageId: 'STAGE-analysis', attemptNo: 2, agentId: 'AGENT-pinme', name: '架构报告', uri: 'https://artifacts.example.test/architecture', contentHash: 'sha256:architecture', mimeType: 'application/json', status: 'submitted', createdAt: now },
      { id: 'DEL-analysis-stale', missionId: baseMission.id, stageId: 'STAGE-analysis', attemptNo: 1, agentId: 'AGENT-pinme', name: '旧版架构报告', uri: 'https://artifacts.example.test/architecture-stale', contentHash: 'sha256:architecture-stale', mimeType: 'application/json', status: 'submitted', createdAt: now },
    ],
    escrow: { status: 'held', amount: 300, token: 'CREDIT', network: 'web2' },
    disputes: [],
    transitions: [
      {
        id: 'TRANSITION-analysis-gate-current', missionId: baseMission.id, edgeId: 'EDGE-analysis-gate',
        sourceStageId: 'STAGE-analysis', targetStageId: 'STAGE-gate', sourceAttemptNo: 2,
        workflowVersion: 3, matched: true, mappedInput: {}, missingRequired: [], errorCode: null, createdAt: now,
      },
      {
        id: 'TRANSITION-analysis-gate-stale', missionId: baseMission.id, edgeId: 'EDGE-analysis-gate',
        sourceStageId: 'STAGE-analysis', targetStageId: 'STAGE-gate', sourceAttemptNo: 1,
        workflowVersion: 3, matched: false, mappedInput: {}, missingRequired: [], errorCode: null,
        createdAt: new Date(Date.parse(now) + 1_000).toISOString(),
      },
    ],
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
  const executionGraph = page.getByTestId('workflow-execution-graph');
  await expectNoNodeOverlap(executionFlow.locator('.react-flow__node'));
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
  await expect(executionGraph.getByText('架构报告', { exact: true })).toBeVisible();
  await expect(executionGraph.getByText('sha256:architecture')).toBeVisible();
  await expect(executionGraph.getByText('旧版架构报告', { exact: true })).toHaveCount(0);
  await expect(executionGraph.getByText('sha256:architecture-stale')).toHaveCount(0);
  await expect(page.getByText('旧版架构报告', { exact: true })).toHaveCount(0);

  await page.getByText('失败节点', { exact: true }).first().click();
  const retryButton = page.getByRole('button', { name: '显式重试此节点' });
  await expect(retryButton).toBeVisible();
  await expect(retryButton).toBeInViewport();

  await page.getByText('任务方审批', { exact: true }).first().click();
  await expect(page.getByText('人工审批 Gate', { exact: true })).toBeVisible();
  await expect(page.getByText('已应用映射 （无字段）', { exact: true })).toBeVisible();
  await expect(page.getByText('条件为假，分支已跳过', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '批准' })).toBeInViewport();
  await expect(page.getByRole('button', { name: '驳回并返工' })).toBeInViewport();
  await page.getByLabel('返工：架构分析').check();
  await page.getByPlaceholder('审批反馈（驳回时建议填写）').fill('需要补充依赖风险');
  await page.getByRole('button', { name: '驳回并返工' }).click();
  await expect.poll(() => gateDecision).not.toBeNull();
  expect(gateDecision).toMatchObject({ decision: 'rejected', feedback: '需要补充依赖风险', reworkNodeIds: ['STAGE-analysis'] });
});

test('paused execution exposes guarded resume and versioned rework controls', async ({ page }) => {
  const pausedMission = {
    ...baseMission,
    requesterId: requester.id,
    status: 'paused',
    progress: 70,
    currentStage: '工程实现已暂停',
    team: ['AGENT-pinme'],
    pausedAt: now,
    pausedBy: requester.id,
    pauseReason: '等待新的依赖审计结果。',
    pauseMode: 'requester',
    schedulerRevision: 4,
  };
  const pausedStages = [
    { ...draftStages[0], status: 'done', progress: 100, agentId: 'AGENT-pinme', attemptNo: 1, output: { summary: '旧版架构结果', verified: true } },
    { ...draftStages[1], status: 'done', progress: 100, agentId: 'AGENT-ds', attemptNo: 2, output: { summary: '实现结果', verified: true } },
    { ...draftStages[2], status: 'done', progress: 100, attemptNo: 1, output: { decision: 'approved' } },
  ];
  const detail = {
    mission: pausedMission,
    stages: pausedStages,
    edges: draftEdges,
    offers: [],
    events: [],
    deliverables: [{
      id: 'DEL-paused', missionId: baseMission.id, stageId: 'STAGE-implement', agentId: 'AGENT-ds',
      attemptNo: 2,
      name: '暂停前工程制品', uri: 'ipfs://bafypausedartifact', contentHash: 'sha256:paused-artifact',
      mimeType: 'application/json', status: 'submitted', createdAt: now,
    }],
    escrow: { status: 'held', amount: 300, token: 'CREDIT', network: 'web2' },
    disputes: [],
    changeRequests: [{
      id: 'CHANGE-v1', missionId: baseMission.id, version: 1, targetStageIds: ['STAGE-implement'],
      resetStageIds: ['STAGE-implement', 'STAGE-gate'], reason: '第一轮返工', acceptanceCriteria: '补齐回归证据',
      requestedBy: requester.id, priorStageState: [], status: 'applied', createdAt: now,
    }],
    checkpoints: [{ id: 'CHECKPOINT-4', missionId: baseMission.id, sequence: 4, kind: 'pause', workflowVersion: 3, schedulerRevision: 4, changeVersion: 1, schedulerState: 'clean', payload: {}, createdBy: requester.id, createdAt: now }],
  };
  let changeBody: Record<string, unknown> | null = null;
  let emergencyPauseBody: Record<string, unknown> | null = null;
  await mockWorkspace(page, detail, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/change-requests') && request.method() === 'POST') {
      changeBody = request.postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: envelope(detail) }).then(() => true);
    }
    if (path.endsWith('/pause') && request.method() === 'POST') {
      emergencyPauseBody = request.postDataJSON() as Record<string, unknown>;
      return route.fulfill({
        json: envelope({ ...detail, mission: { ...pausedMission, pauseMode: 'emergency', pauseReason: '需要管理员介入处置安全风险。' } }),
      }).then(() => true);
    }
    return false;
  });

  await page.goto(`/#/missions/${baseMission.id}/execution`);
  await expect(page.getByText('已暂停', { exact: true })).toBeVisible();
  await expect(page.getByText('等待新的依赖审计结果。', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '恢复任务' })).toBeVisible();
  await expect(page.getByRole('button', { name: '派发所有就绪节点' })).toBeDisabled();
  await expect(page.getByText('返工 v1', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '请求返工' }).click();
  await expect(page.getByRole('dialog')).toContainText('只创建新的执行 attempt');
  await page.getByRole('checkbox').first().check();
  await page.getByLabel('返工原因').fill('新的依赖审计结果改变了实现约束。');
  await page.getByLabel('独立验收标准').fill('必须补充针对新约束的回归测试和风险说明。');
  await page.getByRole('button', { name: '创建返工版本' }).click();
  await expect.poll(() => changeBody).not.toBeNull();
  expect(changeBody).toMatchObject({
    targetStageIds: ['STAGE-analysis'],
    reason: '新的依赖审计结果改变了实现约束。',
    acceptanceCriteria: '必须补充针对新约束的回归测试和风险说明。',
  });

  const adminProfile = { id: 'ADMIN-e2e', email: 'admin@example.test', displayName: 'E2E Admin', role: 'admin' };
  await page.evaluate(async (nextProfile) => {
    const { useAppStore } = await import('/src/store/useAppStore.ts');
    useAppStore.setState({ profile: nextProfile, role: 'admin' });
  }, adminProfile);
  await page.getByRole('button', { name: '提升为紧急暂停' }).click();
  await expect(page.getByRole('dialog')).toContainText('提升后只有管理员可恢复调度');
  await page.getByLabel('暂停原因').fill('需要管理员介入处置安全风险。');
  await page.getByRole('button', { name: '确认提升为紧急暂停' }).click();
  await expect.poll(() => emergencyPauseBody).not.toBeNull();
  expect(emergencyPauseBody).toEqual({ reason: '需要管理员介入处置安全风险。' });
  await expect(page.getByText('管理员紧急暂停', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '恢复任务' })).toBeVisible();

  const developerProfile = { id: 'DEV-pinme', email: 'developer@example.test', displayName: 'E2E Developer', role: 'developer' };
  await page.evaluate(async (nextProfile) => {
    const { useAppStore } = await import('/src/store/useAppStore.ts');
    useAppStore.setState({ profile: nextProfile, role: 'developer' });
  }, developerProfile);
  await expect(page.getByRole('button', { name: '提交任务方验收' })).toBeDisabled();
});

test('review route exposes a requester rework path and hides it from administrators', async ({ page }) => {
  const reviewMission = {
    ...baseMission, requesterId: requester.id, status: 'review', progress: 100,
    currentStage: '等待验收', team: ['AGENT-pinme'], reviewDueAt: '2026-08-30T12:00:00.000Z',
  };
  const reviewStages = draftStages.map((stage, index) => ({
    ...stage, status: 'done', progress: 100, agentId: stage.nodeType === 'task' ? agents[index % agents.length].id : null,
    output: { summary: `${stage.name} 已完成`, verified: true },
    attemptNo: stage.id === 'STAGE-implement' ? 2 : 1,
    attemptCreatedAt: stage.id === 'STAGE-implement' ? '2026-08-22T11:00:00.000Z' : '2026-08-22T09:00:00.000Z',
  }));
  const detail = {
    mission: reviewMission, stages: reviewStages, edges: draftEdges, offers: [], events: [], deliverables: [
      {
        id: 'DEL-old-attempt', missionId: baseMission.id, stageId: 'STAGE-implement', agentId: 'AGENT-ds',
        attemptNo: 1,
        name: '旧版工程制品', uri: 'ipfs://bafyoldattempt', contentHash: 'sha256:old-attempt',
        mimeType: 'application/json', status: 'submitted', createdAt: '2026-08-22T10:00:00.000Z',
      },
      {
        id: 'DEL-current-v1', missionId: baseMission.id, stageId: 'STAGE-implement', agentId: 'AGENT-ds',
        attemptNo: 2,
        name: '当前工程制品首版', uri: 'ipfs://bafybeie5nqv6kd3qnfjuprw2scvucpip5xwh3yluiopmqcktiamcu54bdm', contentHash: `sha256:${'1'.repeat(64)}`,
        mimeType: 'application/vnd.agentmesh.manifest+json', status: 'submitted', createdAt: '2026-08-22T11:15:00.000Z',
        ipfsEvidence: {
          provider: 'pinme_ipfs', rootCid: 'bafybeie5nqv6kd3qnfjuprw2scvucpip5xwh3yluiopmqcktiamcu54bdm',
          manifestPath: '/manifest.json', manifestSha256: `sha256:${'1'.repeat(64)}`,
          manifest: {
            schema: 'agentmesh.deliverable-manifest.v1', missionId: baseMission.id, stageId: 'STAGE-implement', attemptNo: 2,
            agentId: 'AGENT-ds', logicalName: '当前工程制品首版', versionNo: 1, supersedesRootCid: null,
            acceptanceCriteriaSha256: `sha256:${'a'.repeat(64)}`, createdAt: '2026-08-22T11:15:00.000Z', generator: 'e2e/1',
            files: [{ path: 'report-old.json', sha256: `sha256:${'b'.repeat(64)}`, mimeType: 'application/json', byteSize: 40 }],
          },
          fileCount: 1, totalBytes: 40, visibility: 'public', versionNo: 1, supersedesDeliverableId: null,
          scopeKey: 'stage:STAGE-implement:attempt:2', verificationStatus: 'verified', lastVerifiedAt: now, lastVerificationError: null,
        },
      },
      {
        id: 'DEL-current-attempt', missionId: baseMission.id, stageId: 'STAGE-implement', agentId: 'AGENT-ds',
        attemptNo: 2,
        name: '当前版本工程制品', uri: 'ipfs://bafybeie5nqv6kd3qnfjuprw2scvucpip3oc6zvqrgcxlqdze6dt4bdhmsy', contentHash: `sha256:${'2'.repeat(64)}`,
        mimeType: 'application/vnd.agentmesh.manifest+json', status: 'submitted', createdAt: '2026-08-22T11:30:00.000Z',
        ipfsEvidence: {
          provider: 'pinme_ipfs', rootCid: 'bafybeie5nqv6kd3qnfjuprw2scvucpip3oc6zvqrgcxlqdze6dt4bdhmsy',
          manifestPath: '/manifest.json', manifestSha256: `sha256:${'2'.repeat(64)}`,
          manifest: {
            schema: 'agentmesh.deliverable-manifest.v1', missionId: baseMission.id, stageId: 'STAGE-implement', attemptNo: 2,
            agentId: 'AGENT-ds', logicalName: '当前版本工程制品', versionNo: 2,
            supersedesRootCid: 'bafybeie5nqv6kd3qnfjuprw2scvucpip5xwh3yluiopmqcktiamcu54bdm',
            acceptanceCriteriaSha256: `sha256:${'a'.repeat(64)}`, createdAt: '2026-08-22T11:30:00.000Z', generator: 'e2e/1',
            files: [{ path: 'report.json', sha256: `sha256:${'c'.repeat(64)}`, mimeType: 'application/json', byteSize: 42 }],
          },
          fileCount: 1, totalBytes: 42, visibility: 'public', versionNo: 2, supersedesDeliverableId: 'DEL-current-v1',
          scopeKey: 'stage:STAGE-implement:attempt:2', verificationStatus: 'declared', lastVerifiedAt: null, lastVerificationError: null,
        },
      },
      {
        id: 'DEL-mission-old', missionId: baseMission.id, stageId: null, agentId: null,
        name: '返工前最终交付', uri: 'ipfs://bafymissionold', contentHash: 'sha256:mission-old',
        mimeType: 'application/zip', status: 'submitted', createdAt: '2026-08-22T10:30:00.000Z',
      },
      {
        id: 'DEL-mission-final', missionId: baseMission.id, stageId: null, agentId: null,
        name: '任务级最终交付', uri: 'ipfs://bafymissionfinal', contentHash: 'sha256:mission-final',
        mimeType: 'application/zip', status: 'submitted', createdAt: '2026-08-22T11:45:00.000Z',
      },
    ],
    escrow: { status: 'held', amount: 300, token: 'CREDIT', network: 'web2' }, disputes: [], changeRequests: [{
      id: 'CHANGE-review-v1', missionId: baseMission.id, version: 1, targetStageIds: ['STAGE-implement'],
      resetStageIds: ['STAGE-implement', 'STAGE-gate'], reason: '补充工程证据', acceptanceCriteria: '重新提交当前版本制品',
      requestedBy: requester.id, priorStageState: [], status: 'applied', createdAt: '2026-08-22T11:00:00.000Z',
    }], checkpoints: [],
  };
  await mockWorkspace(page, detail);
  await page.goto(`/#/missions/${baseMission.id}/acceptance`);
  await expect.poll(() => page.evaluate(async () => {
    const { useAppStore } = await import('/src/store/useAppStore.ts');
    return useAppStore.getState().missions.map((mission) => mission.id);
  })).toContain(baseMission.id);
  const reworkLink = page.getByRole('link', { name: '查看执行与请求返工' });
  await expect(reworkLink).toBeVisible();
  await expect(reworkLink).toHaveAttribute('href', `#/missions/${baseMission.id}/execution`);
  await expect(page.getByText('当前版本工程制品').first()).toBeVisible();
  await expect(page.getByRole('button', { name: '任务级最终交付' })).toBeVisible();
  await expect(page.getByRole('button', { name: '旧版工程制品' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '返工前最终交付' })).toHaveCount(0);
  await expect(page.getByText('2 个历史 attempt 或已拒绝制品已保留，仅供审计，不参与当前验收。')).toBeVisible();
  await page.getByRole('button', { name: '当前版本工程制品 · v2' }).click();
  await expect(page.getByText('PinMe/IPFS v2')).toBeVisible();
  await expect(page.getByText('父版本 DEL-current-v1').first()).toBeVisible();
  await expect(page.getByText('新增文件').locator('..').getByText('+1')).toBeVisible();
  await expect(page.getByText('删除文件').locator('..').getByText('-1')).toBeVisible();
  await expect(page.getByText(/pinme export bafybeie5nqv6kd3qnfjuprw2scvucpip3oc6zvqrgcxlqdze6dt4bdhmsy/)).toBeVisible();
  await page.getByText('查看 Manifest 文件差异').click();
  await expect(page.getByText('+ report.json')).toBeVisible();
  await expect(page.getByText('- report-old.json')).toBeVisible();
  await expect(page.getByRole('button', { name: /确认交付并释放/ })).toBeEnabled();

  const admin = { id: requester.id, email: 'admin@example.test', displayName: 'E2E Admin', role: 'admin' };
  await page.evaluate(async (nextProfile) => {
    const { useAppStore } = await import('/src/store/useAppStore.ts');
    useAppStore.setState({ profile: nextProfile, role: 'requester' });
  }, admin);
  await expect(page.getByRole('link', { name: '查看执行与请求返工' })).toHaveCount(0);
});
