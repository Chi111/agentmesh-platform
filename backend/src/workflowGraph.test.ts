import { describe, expect, it } from 'vitest';
import type { Mission, WorkflowEdge, WorkflowStage } from './contracts';
import { hasWorkflowStageOverlap, layoutWorkflowStages, validateWorkflowGraph, workflowAggregate } from './workflowGraph';

const missionId = 'MISSION-weighted-progress';
const now = '2026-08-22T00:00:00.000Z';

const mission: Mission = {
  id: missionId,
  requesterId: 'USER-requester',
  title: '预算加权 DAG',
  description: '验证工作流聚合进度。',
  category: '软件开发',
  tags: [],
  budget: 300,
  paymentMethod: 'web2_balance',
  deadline: '2026-09-01',
  priority: 'high',
  expertise: 'expert',
  yieldEnabled: false,
  status: 'running',
  progress: 0,
  currentStage: '',
  reviewDueAt: null,
  team: [],
  compiledSpec: null,
  workflowVersion: 1,
  workflowViewport: { x: 0, y: 0, zoom: 1 },
  pausedAt: null,
  pausedBy: null,
  pauseReason: null,
  pauseMode: null,
  schedulerRevision: 0,
  createdAt: now,
  updatedAt: now,
};

function stage(input: Partial<WorkflowStage> & Pick<WorkflowStage, 'id' | 'position' | 'budget' | 'status'>): WorkflowStage {
  return {
    missionId: mission.id,
    nodeType: 'task',
    positionX: input.position * 300,
    positionY: 100,
    progress: 0,
    name: `节点 ${input.position}`,
    purpose: '完成可验证输出。',
    category: '软件开发',
    agentId: 'AGENT-engineering',
    input: { executionMode: 'implement' },
    output: null,
    attemptNo: 1,
    attemptCreatedAt: now,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

describe('workflowAggregate', () => {
  it('reports exact zero before work starts and weights task progress by budget', () => {
    const stages = [
      stage({ id: 'STAGE-small', position: 1, budget: 100, status: 'queued' }),
      stage({ id: 'STAGE-large', position: 2, budget: 200, status: 'queued' }),
    ];
    const edges: WorkflowEdge[] = [{
      id: 'EDGE-small-large',
      missionId,
      sourceStageId: stages[0].id,
      targetStageId: stages[1].id,
      createdAt: now,
    }];

    expect(workflowAggregate(stages, edges).progress).toBe(0);
    expect(workflowAggregate([
      { ...stages[0], status: 'done', progress: 100 },
      { ...stages[1], status: 'running', progress: 25 },
    ], edges).progress).toBe(50);
  });

  it('does not report 100 until task and approval nodes are all done', () => {
    const taskNode = stage({ id: 'STAGE-task', position: 1, budget: 300, status: 'done', progress: 100 });
    const gate: WorkflowStage = {
      ...stage({ id: 'STAGE-gate', position: 2, budget: 0, status: 'running' }),
      nodeType: 'approval',
      category: '人工审批',
      agentId: null,
      input: { approvalCriteria: '验证结果完整。' },
    };
    const edges: WorkflowEdge[] = [{
      id: 'EDGE-task-gate',
      missionId,
      sourceStageId: taskNode.id,
      targetStageId: gate.id,
      createdAt: now,
    }];

    expect(workflowAggregate([taskNode, gate], edges)).toMatchObject({ progress: 99, currentStage: '1 个待审批' });
    expect(workflowAggregate([taskNode, { ...gate, status: 'done' }], edges)).toMatchObject({ progress: 100, currentStage: '工作流已完成，等待验收' });
  });
});

describe('workflow layout validation', () => {
  it('rejects zero or sub-quantum task budgets while keeping zero-cost approval nodes valid', () => {
    const zeroTask = stage({ id: 'STAGE-zero', position: 1, budget: 0, status: 'queued' });
    expect(() => validateWorkflowGraph({ mission: { ...mission, budget: 0 }, stages: [zeroTask], edges: [] }))
      .toThrow('Task node budgets must be at least 0.01');

    const tinySethTask = stage({ id: 'STAGE-tiny-seth', position: 1, budget: 0.0000009, status: 'queued' });
    expect(() => validateWorkflowGraph({
      mission: { ...mission, budget: 0.0000009, paymentMethod: 'web3_seth' },
      stages: [tinySethTask],
      edges: [],
    })).toThrow('Task node budgets must be at least 0.000001');

    const validSethTask = { ...tinySethTask, budget: 0.000001 };
    expect(validateWorkflowGraph({
      mission: { ...mission, budget: 0.000001, paymentMethod: 'web3_seth' },
      stages: [validSethTask],
      edges: [],
    })).toHaveLength(1);
  });

  it('rejects overlapping persisted coordinates and accepts the same graph after layout', () => {
    const stages = [
      stage({ id: 'STAGE-overlap-a', position: 1, budget: 100, status: 'queued', positionX: 80, positionY: 80 }),
      stage({ id: 'STAGE-overlap-b', position: 2, budget: 200, status: 'queued', positionX: 80, positionY: 80 }),
    ];
    const edges: WorkflowEdge[] = [{
      id: 'EDGE-overlap',
      missionId,
      sourceStageId: stages[0].id,
      targetStageId: stages[1].id,
      createdAt: now,
    }];

    expect(() => validateWorkflowGraph({ mission, stages, edges })).toThrow('Workflow nodes cannot overlap');

    const laidOut = layoutWorkflowStages(stages, edges);
    expect(hasWorkflowStageOverlap(laidOut)).toBe(false);
    expect(validateWorkflowGraph({ mission, stages: laidOut, edges })).toHaveLength(2);
  });

  it('accepts mapped task input and only terminal conditional approval Gates', () => {
    const source = stage({ id: 'STAGE-source', position: 1, budget: 100, status: 'queued' });
    const target = stage({ id: 'STAGE-target', position: 2, budget: 200, status: 'queued' });
    const gate: WorkflowStage = {
      ...stage({ id: 'STAGE-risk-gate', position: 3, budget: 0, status: 'queued' }),
      nodeType: 'approval', agentId: null, category: '人工审批',
      input: { approvalCriteria: '高风险输出需要人工批准。' },
    };
    const edges: WorkflowEdge[] = [
      {
        id: 'EDGE-mapped', missionId, sourceStageId: source.id, targetStageId: target.id,
        mappings: [{ from: '/result/id', to: '/request/sourceId', required: true }], createdAt: now,
      },
      {
        id: 'EDGE-condition', missionId, sourceStageId: target.id, targetStageId: gate.id,
        condition: { op: 'eq', path: '/risk', value: 'high' }, createdAt: now,
      },
    ];
    expect(validateWorkflowGraph({ mission, stages: [source, target, gate], edges })).toHaveLength(3);

    expect(() => validateWorkflowGraph({
      mission,
      stages: [source, target, gate],
      edges: [
        { ...edges[0], condition: { op: 'exists', path: '/result' }, mappings: [] },
        edges[1],
      ],
    })).toThrow('Conditional edges may only target terminal approval Gates');
    expect(() => validateWorkflowGraph({
      mission,
      stages: [source, target, gate],
      edges: [
        edges[0],
        edges[1],
        { id: 'EDGE-gate-downstream', missionId, sourceStageId: gate.id, targetStageId: target.id, createdAt: now },
      ],
    })).toThrow();
  });

  it('rejects ancestor and descendant mapping targets across incoming edges', () => {
    const left = stage({ id: 'STAGE-left', position: 1, budget: 100, status: 'queued' });
    const right = stage({ id: 'STAGE-right', position: 2, budget: 100, status: 'queued' });
    const target = stage({ id: 'STAGE-merge', position: 3, budget: 100, status: 'queued' });
    const edges: WorkflowEdge[] = [
      {
        id: 'EDGE-left-merge', missionId, sourceStageId: left.id, targetStageId: target.id,
        mappings: [{ from: '/result', to: '/request', required: true }], createdAt: now,
      },
      {
        id: 'EDGE-right-merge', missionId, sourceStageId: right.id, targetStageId: target.id,
        mappings: [{ from: '/id', to: '/request/id', required: true }], createdAt: now,
      },
    ];

    expect(() => validateWorkflowGraph({ mission, stages: [left, right, target], edges }))
      .toThrow('overlapping mappedInput pointers');
  });
});


describe('mandatory capability validation', () => {
  it.each(['react', [null], [''], Array(21).fill('react'), ['x'.repeat(81)]].map((value) => [value]))('rejects malformed requirements: %j', (requiredCapabilities) => {
    const node = stage({ id: 'required', position: 1, budget: 300, status: 'queued', input: { requiredCapabilities } });
    expect(() => validateWorkflowGraph({ mission, stages: [node], edges: [], agents: [] })).toThrow('Required capabilities');
  });
});
