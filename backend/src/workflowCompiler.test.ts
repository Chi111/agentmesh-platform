import { describe, expect, it } from 'vitest';
import type { Mission } from './contracts';
import {
  adaptiveFallbackCompilation,
  compileWorkflowWithLangGraph,
  estimateWorkflowAnalysis,
  workflowHasParallelism,
} from './workflowCompiler';
import {
  validateWorkflowGraph,
  WORKFLOW_LAYOUT_NODE_HEIGHT,
  WORKFLOW_LAYOUT_NODE_WIDTH,
} from './workflowGraph';

function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'TASK-2026-COMPILER',
    requesterId: 'requester-1',
    title: '整理一份简洁的产品说明',
    description: '根据现有资料整理产品目标、核心能力和验收清单，输出可以直接评审的说明文档。',
    category: '内容生成',
    tags: ['说明文档'],
    budget: 100,
    paymentMethod: 'web2_balance',
    deadline: '2026-09-01',
    reviewDueAt: null,
    priority: 'normal',
    expertise: 'standard',
    yieldEnabled: false,
    status: 'matching',
    progress: 0,
    currentStage: '任务已编译，等待团队确认',
    team: [],
    compiledSpec: null,
    workflowVersion: 1,
    workflowViewport: { x: 0, y: 0, zoom: 1 },
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
    ...overrides,
  };
}

function complexMission(): Mission {
  return mission({
    id: 'TASK-2026-COMPLEX',
    title: '支付平台全栈架构迁移与生产发布',
    description: '重构大型多模块平台：完成 React 前端、Cloudflare Worker API、D1 数据库迁移、钱包支付鉴权、安全审查、端到端测试、部署监控和回滚方案。需要并行开发、集成联调和生产上线审批。',
    category: '软件工程',
    tags: ['React', 'Worker', 'D1', '支付', '安全', '部署'],
    budget: 1_200,
    priority: 'urgent',
    expertise: 'principal',
  });
}

function rawCompilation(missionValue: Mission): string {
  const analysis = estimateWorkflowAnalysis(missionValue);
  const compilation = adaptiveFallbackCompilation(missionValue, analysis);
  return JSON.stringify({
    objective: missionValue.title,
    acceptanceCriteria: compilation.spec.acceptanceCriteria,
    risks: analysis.risks,
    nodes: compilation.stages.map((stage) => ({
      id: stage.id,
      nodeType: stage.nodeType,
      name: stage.name,
      purpose: stage.purpose,
      category: stage.category,
      budget: stage.budget,
      positionX: stage.positionX,
      positionY: stage.positionY,
      input: stage.input,
    })),
    edges: compilation.edges.map((edge) => ({
      source: edge.sourceStageId,
      target: edge.targetStageId,
    })),
  });
}

function fiveStageCompilation(missionValue: Mission): string {
  const stages = [
    ['scope', '目标与受众澄清', 'analyze'],
    ['strategy', '传播策略设计', 'analyze'],
    ['draft', '广告文案创作', 'implement'],
    ['verify', '卖点与事实交叉验证', 'review'],
    ['delivery', '文案定稿与交付', 'review'],
  ] as const;
  return JSON.stringify({
    objective: missionValue.title,
    acceptanceCriteria: ['文案覆盖目标受众、核心卖点和行动号召。'],
    risks: [],
    nodes: stages.map(([id, name, executionMode], index) => ({
      id,
      nodeType: 'task',
      name,
      purpose: `${name}并保留可复核证据。`,
      category: missionValue.category,
      budget: 1,
      positionX: 80 + index * 360,
      positionY: 220,
      input: {
        executionMode,
        inputContract: `${name}所需的上游输入和验收标准`,
        outputContract: `${name}的结构化结果、验证证据和制品引用`,
      },
    })),
    edges: stages.slice(1).map(([id], index) => ({ source: stages[index][0], target: id })),
  });
}

function nodesOverlap(left: WorkflowStage, right: WorkflowStage): boolean {
  return left.positionX < right.positionX + WORKFLOW_LAYOUT_NODE_WIDTH
    && left.positionX + WORKFLOW_LAYOUT_NODE_WIDTH > right.positionX
    && left.positionY < right.positionY + WORKFLOW_LAYOUT_NODE_HEIGHT
    && left.positionY + WORKFLOW_LAYOUT_NODE_HEIGHT > right.positionY;
}

function expectNoNodeOverlap(stages: WorkflowStage[]): void {
  for (let leftIndex = 0; leftIndex < stages.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < stages.length; rightIndex += 1) {
      expect(nodesOverlap(stages[leftIndex], stages[rightIndex])).toBe(false);
    }
  }
}

describe('LangGraph workflow compiler', () => {
  it('adapts fallback size and topology to actual mission complexity', () => {
    const simple = mission();
    const complex = complexMission();
    const simpleAnalysis = estimateWorkflowAnalysis(simple);
    const complexAnalysis = estimateWorkflowAnalysis(complex);
    const simpleWorkflow = adaptiveFallbackCompilation(simple, simpleAnalysis);
    const complexWorkflow = adaptiveFallbackCompilation(complex, complexAnalysis);

    expect(simpleAnalysis.complexity).toBe('simple');
    expect(simpleWorkflow.stages.filter((stage) => stage.nodeType === 'task')).toHaveLength(2);
    expect(complexAnalysis.complexity).toBe('complex');
    expect(complexWorkflow.stages.filter((stage) => stage.nodeType === 'task').length).toBeGreaterThanOrEqual(6);
    expect(complexWorkflow.stages.some((stage) => stage.nodeType === 'approval')).toBe(true);
    expect(workflowHasParallelism(complexWorkflow.stages, complexWorkflow)).toBe(true);
    expect(validateWorkflowGraph({ mission: complex, stages: complexWorkflow.stages, edges: complexWorkflow.edges })).toHaveLength(complexWorkflow.stages.length);
    expect(complexWorkflow.stages.filter((stage) => stage.nodeType === 'task').reduce((sum, stage) => sum + stage.budget, 0)).toBe(complex.budget);
  });

  it('reserves one payment quantum for every generated task', () => {
    const tiny = mission({ budget: 0.000002, paymentMethod: 'web3_seth' });
    const compiled = adaptiveFallbackCompilation(tiny);
    const taskBudgets = compiled.stages.filter((stage) => stage.nodeType === 'task').map((stage) => stage.budget);

    expect(taskBudgets).toEqual([0.000001, 0.000001]);
    expect(taskBudgets.reduce((sum, budget) => sum + budget, 0)).toBe(tiny.budget);
  });

  it('repairs one invalid planner result and saves the corrected graph', async () => {
    const target = complexMission();
    const validGraph = JSON.parse(rawCompilation(target)) as { nodes: Array<Record<string, unknown>> };
    validGraph.nodes = validGraph.nodes.map((node) => ({ ...node, positionX: 0, positionY: 0 }));
    const valid = JSON.stringify(validGraph);
    const responses = [
      JSON.stringify({
        complexity: 'complex', score: 9, rationale: 'Multiple high-risk engineering workstreams.',
        workstreams: estimateWorkflowAnalysis(target).workstreams,
        risks: ['Production payment migration'], requiresApproval: true,
        approvalReason: 'Approve integrated payment changes before final delivery.',
      }),
      JSON.stringify({ objective: target.title, nodes: [], edges: [] }),
      valid,
    ];
    const prompts: string[] = [];
    const result = await compileWorkflowWithLangGraph(target, async (messages) => {
      prompts.push(messages[0].content);
      return { content: responses.shift() };
    });

    expect(result.source).toBe('langgraph-planner');
    expect(result.metadata.modelCalls).toBe(3);
    expect(result.metadata.repairAttempts).toBe(1);
    expect(result.compilation.stages.filter((stage) => stage.nodeType === 'task').length).toBeGreaterThanOrEqual(6);
    expect(workflowHasParallelism(result.compilation.stages, result.compilation)).toBe(true);
    expectNoNodeOverlap(result.compilation.stages);
    expect(prompts[2]).toContain('repair node');
    expect(result.compilation.spec.compiler).toMatchObject({ engine: 'langgraph', repairAttempts: 1 });
  });

  it('preserves a valid AI-authored node count outside the complexity baseline', async () => {
    const target = mission({
      title: '生成一个广告文案',
      description: '根据产品卖点和目标受众生成广告文案，并完成事实核验、修改和最终交付。',
      category: '内容生成',
    });
    const responses = [
      JSON.stringify({
        complexity: 'simple', score: 2, rationale: 'Focused content task.',
        workstreams: [{ name: '广告文案创作', purpose: '完成文案创作与验证。', category: '内容生成' }],
        risks: [], requiresApproval: false, approvalReason: '',
      }),
      fiveStageCompilation(target),
    ];
    const result = await compileWorkflowWithLangGraph(target, async () => ({ content: responses.shift() }));

    expect(result.source).toBe('langgraph-planner');
    expect(result.metadata.recommendedTaskCount).toEqual({ min: 2, max: 4 });
    expect(result.metadata.modelCalls).toBe(2);
    expect(result.metadata.repairAttempts).toBe(0);
    expect(result.compilation.stages.map((stage) => stage.name)).toEqual([
      '目标与受众澄清',
      '传播策略设计',
      '广告文案创作',
      '卖点与事实交叉验证',
      '文案定稿与交付',
    ]);
  });

  it('uses adaptive fallback without a repair call when the model is unavailable', async () => {
    const target = complexMission();
    let calls = 0;
    const result = await compileWorkflowWithLangGraph(target, async () => {
      calls += 1;
      return { error: 'LLM service is not configured' };
    });

    expect(result.source).toBe('adaptive-fallback');
    expect(calls).toBe(2);
    expect(result.metadata.modelCalls).toBe(2);
    expect(result.metadata.repairAttempts).toBe(0);
    expect(result.metadata.fallbackReason).toContain('JSON workflow object');
    expect(result.compilation.stages.filter((stage) => stage.nodeType === 'task').length).toBeGreaterThanOrEqual(6);
    expect(workflowHasParallelism(result.compilation.stages, result.compilation)).toBe(true);
  });

  it('never persists upstream error text in compiler metadata', async () => {
    const leakedValue = 'Bearer sk-test-secret-that-must-not-be-recorded';
    const result = await compileWorkflowWithLangGraph(mission(), async () => ({ error: leakedValue }));

    expect(JSON.stringify(result.metadata)).not.toContain(leakedValue);
    expect(result.metadata.warnings).toContain('Workflow planning returned no usable content.');
  });
});
