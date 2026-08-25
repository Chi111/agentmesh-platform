import { describe, expect, it } from 'vitest';
import type { Mission, WorkflowEdge, WorkflowStage } from './contracts';
import { workflowAggregate } from './workflowGraph';

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
