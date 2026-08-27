import type { Agent, Mission, WorkflowEdge, WorkflowStage, WorkflowViewport } from './contracts';
import { paymentBudgetPrecision } from './payments';
import {
  validateWorkflowCondition,
  validateWorkflowMappings,
  workflowMappingTargetsOverlap,
  WorkflowDslError,
} from './workflowDsl';

export const MAX_WORKFLOW_NODES = 30;
export const MAX_WORKFLOW_EDGES = 80;
export const DEFAULT_WORKFLOW_VIEWPORT: WorkflowViewport = { x: 0, y: 0, zoom: 1 };
export const WORKFLOW_LAYOUT_NODE_WIDTH = 250;
export const WORKFLOW_LAYOUT_NODE_HEIGHT = 184;

const WORKFLOW_LAYOUT_COLUMN_GAP = 120;
const WORKFLOW_LAYOUT_ROW_GAP = 72;
const WORKFLOW_LAYOUT_MARGIN = 40;

export class WorkflowValidationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export function linearEdges(missionId: string, stages: WorkflowStage[], now = new Date().toISOString()): WorkflowEdge[] {
  return [...stages]
    .sort((left, right) => left.position - right.position)
    .slice(1)
    .map((stage, index) => ({
      id: `EDGE-${crypto.randomUUID()}`,
      missionId,
      sourceStageId: [...stages].sort((left, right) => left.position - right.position)[index].id,
      targetStageId: stage.id,
      createdAt: now,
    }));
}

export function normalizeViewport(value: Partial<WorkflowViewport> | null | undefined): WorkflowViewport {
  const x = Number(value?.x);
  const y = Number(value?.y);
  const zoom = Number(value?.zoom);
  return {
    x: Number.isFinite(x) ? Math.max(-100_000, Math.min(100_000, x)) : 0,
    y: Number.isFinite(y) ? Math.max(-100_000, Math.min(100_000, y)) : 0,
    zoom: Number.isFinite(zoom) ? Math.max(0.1, Math.min(4, zoom)) : 1,
  };
}

export function incomingStageIds(stageId: string, edges: WorkflowEdge[]): string[] {
  return edges.filter((edge) => edge.targetStageId === stageId).map((edge) => edge.sourceStageId);
}

export function outgoingStageIds(stageId: string, edges: WorkflowEdge[]): string[] {
  return edges.filter((edge) => edge.sourceStageId === stageId).map((edge) => edge.targetStageId);
}

export function topologicalOrder(stages: WorkflowStage[], edges: WorkflowEdge[]): WorkflowStage[] {
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const indegree = new Map(stages.map((stage) => [stage.id, 0]));
  const outgoing = new Map(stages.map((stage) => [stage.id, [] as string[]]));
  for (const edge of edges) {
    if (!stageById.has(edge.sourceStageId) || !stageById.has(edge.targetStageId)) {
      throw new WorkflowValidationError('INVALID_EDGE', 'Every edge must reference nodes in this workflow');
    }
    indegree.set(edge.targetStageId, (indegree.get(edge.targetStageId) ?? 0) + 1);
    outgoing.get(edge.sourceStageId)?.push(edge.targetStageId);
  }
  const compare = (left: string, right: string) => {
    const leftStage = stageById.get(left)!;
    const rightStage = stageById.get(right)!;
    return leftStage.position - rightStage.position || left.localeCompare(right);
  };
  const queue = [...indegree.entries()].filter(([, value]) => value === 0).map(([id]) => id).sort(compare);
  const ordered: WorkflowStage[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    ordered.push(stageById.get(id)!);
    for (const targetId of outgoing.get(id) ?? []) {
      const next = (indegree.get(targetId) ?? 0) - 1;
      indegree.set(targetId, next);
      if (next === 0) {
        queue.push(targetId);
        queue.sort(compare);
      }
    }
  }
  if (ordered.length !== stages.length) throw new WorkflowValidationError('WORKFLOW_CYCLE', 'Workflow must be a directed acyclic graph');
  return ordered;
}

export function layoutWorkflowStages(stages: WorkflowStage[], edges: WorkflowEdge[]): WorkflowStage[] {
  if (!stages.length) return [];
  const ordered = topologicalOrder(stages, edges);
  const rankById = new Map<string, number>();
  const columns = new Map<number, WorkflowStage[]>();

  for (const stage of ordered) {
    const rank = incomingStageIds(stage.id, edges).reduce(
      (highest, sourceId) => Math.max(highest, (rankById.get(sourceId) ?? -1) + 1),
      0,
    );
    rankById.set(stage.id, rank);
    columns.set(rank, [...(columns.get(rank) ?? []), stage]);
  }

  const rowPitch = WORKFLOW_LAYOUT_NODE_HEIGHT + WORKFLOW_LAYOUT_ROW_GAP;
  const columnPitch = WORKFLOW_LAYOUT_NODE_WIDTH + WORKFLOW_LAYOUT_COLUMN_GAP;
  const largestColumn = Math.max(...[...columns.values()].map((column) => column.length));
  const positionById = new Map<string, { x: number; y: number }>();

  for (const [rank, column] of columns) {
    const centeredOffset = ((largestColumn - column.length) * rowPitch) / 2;
    column.forEach((stage, index) => {
      positionById.set(stage.id, {
        x: WORKFLOW_LAYOUT_MARGIN + rank * columnPitch,
        y: WORKFLOW_LAYOUT_MARGIN + centeredOffset + index * rowPitch,
      });
    });
  }

  return stages.map((stage) => {
    const position = positionById.get(stage.id)!;
    return { ...stage, positionX: position.x, positionY: position.y };
  });
}

export function workflowStagesOverlap(left: WorkflowStage, right: WorkflowStage): boolean {
  return left.positionX < right.positionX + WORKFLOW_LAYOUT_NODE_WIDTH
    && left.positionX + WORKFLOW_LAYOUT_NODE_WIDTH > right.positionX
    && left.positionY < right.positionY + WORKFLOW_LAYOUT_NODE_HEIGHT
    && left.positionY + WORKFLOW_LAYOUT_NODE_HEIGHT > right.positionY;
}

export function hasWorkflowStageOverlap(stages: WorkflowStage[]): boolean {
  for (let leftIndex = 0; leftIndex < stages.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < stages.length; rightIndex += 1) {
      if (workflowStagesOverlap(stages[leftIndex], stages[rightIndex])) return true;
    }
  }
  return false;
}

function assertWeaklyConnected(stages: WorkflowStage[], edges: WorkflowEdge[]): void {
  if (stages.length <= 1) return;
  const adjacency = new Map(stages.map((stage) => [stage.id, [] as string[]]));
  for (const edge of edges) {
    adjacency.get(edge.sourceStageId)?.push(edge.targetStageId);
    adjacency.get(edge.targetStageId)?.push(edge.sourceStageId);
  }
  const visited = new Set<string>();
  const queue = [stages[0].id];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    queue.push(...(adjacency.get(id) ?? []).filter((candidate) => !visited.has(candidate)));
  }
  if (visited.size !== stages.length) throw new WorkflowValidationError('WORKFLOW_DISCONNECTED', 'Workflow graph must be weakly connected');
}

export function validateWorkflowGraph(input: {
  mission: Mission;
  stages: WorkflowStage[];
  edges: WorkflowEdge[];
  agents?: Agent[];
  requireAssignments?: boolean;
}): WorkflowStage[] {
  const { mission, stages, edges, agents = [], requireAssignments = false } = input;
  if (stages.length < 1) throw new WorkflowValidationError('WORKFLOW_EMPTY', 'Workflow must contain at least one node');
  if (stages.length > MAX_WORKFLOW_NODES) throw new WorkflowValidationError('WORKFLOW_TOO_LARGE', `Workflow supports at most ${MAX_WORKFLOW_NODES} nodes`);
  if (edges.length > MAX_WORKFLOW_EDGES) throw new WorkflowValidationError('WORKFLOW_TOO_LARGE', `Workflow supports at most ${MAX_WORKFLOW_EDGES} edges`);
  const ids = new Set<string>();
  for (const stage of stages) {
    if (!stage.id || ids.has(stage.id)) throw new WorkflowValidationError('DUPLICATE_NODE', 'Workflow node IDs must be unique');
    ids.add(stage.id);
    if (stage.missionId !== mission.id) throw new WorkflowValidationError('INVALID_NODE', 'Every node must belong to this mission');
    if (stage.name.trim().length < 2 || stage.name.length > 120 || stage.purpose.trim().length < 2 || stage.purpose.length > 600) {
      throw new WorkflowValidationError('INVALID_NODE', 'Every workflow node requires a bounded name and purpose');
    }
    if (!Number.isFinite(stage.positionX) || !Number.isFinite(stage.positionY)) {
      throw new WorkflowValidationError('INVALID_NODE', 'Workflow node positions must be finite');
    }
    if (!Number.isFinite(stage.budget) || stage.budget < 0) throw new WorkflowValidationError('INVALID_NODE_BUDGET', 'Workflow node budgets must be finite and non-negative');
    if (stage.nodeType === 'approval') {
      if (stage.agentId || stage.budget !== 0) throw new WorkflowValidationError('INVALID_APPROVAL_NODE', 'Approval nodes cannot have an Agent or budget');
      const criteria = typeof stage.input.approvalCriteria === 'string' ? stage.input.approvalCriteria.trim() : '';
      if (criteria.length < 2 || criteria.length > 2_000) throw new WorkflowValidationError('INVALID_APPROVAL_CRITERIA', 'Approval nodes require bounded approval criteria');
    } else if (stage.nodeType !== 'task') {
      throw new WorkflowValidationError('INVALID_NODE_TYPE', 'Workflow node type must be task or approval');
    } else {
      if (stage.category.trim().length < 2 || stage.category.length > 80) throw new WorkflowValidationError('INVALID_NODE', 'Task nodes require a bounded category');
      const executionMode = stage.input.executionMode;
      if (executionMode !== undefined && !['analyze', 'implement', 'review'].includes(String(executionMode))) {
        throw new WorkflowValidationError('INVALID_EXECUTION_MODE', 'Task execution mode must be analyze, implement, or review');
      }
    }
  }
  if (hasWorkflowStageOverlap(stages)) {
    throw new WorkflowValidationError('WORKFLOW_NODE_OVERLAP', 'Workflow nodes cannot overlap');
  }
  const edgeKeys = new Set<string>();
  const edgeIds = new Set<string>();
  const mappingTargetsByNode = new Map<string, string[]>();
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  for (const edge of edges) {
    if (!edge.id || edge.missionId !== mission.id) throw new WorkflowValidationError('INVALID_EDGE', 'Every edge must belong to this mission');
    if (edgeIds.has(edge.id)) throw new WorkflowValidationError('DUPLICATE_EDGE', 'Workflow edge IDs must be unique');
    edgeIds.add(edge.id);
    if (edge.sourceStageId === edge.targetStageId) throw new WorkflowValidationError('WORKFLOW_SELF_LOOP', 'Workflow cannot contain self loops');
    const key = `${edge.sourceStageId}\n${edge.targetStageId}`;
    if (edgeKeys.has(key)) throw new WorkflowValidationError('DUPLICATE_EDGE', 'Workflow cannot contain duplicate edges');
    edgeKeys.add(key);
    try {
      if (edge.condition) validateWorkflowCondition(edge.condition);
      const mappings = validateWorkflowMappings(edge.mappings ?? []);
      if (edge.condition) {
        const target = stageById.get(edge.targetStageId);
        if (target?.nodeType !== 'approval' || outgoingStageIds(target.id, edges).length !== 0) {
          throw new WorkflowValidationError('UNSAFE_CONDITIONAL_BRANCH', 'Conditional edges may only target terminal approval Gates');
        }
        if (mappings.length > 0) throw new WorkflowValidationError('INVALID_EDGE_RULE', 'Conditional Gate edges cannot also map task input');
      }
      if (mappings.length > 0 && stageById.get(edge.targetStageId)?.nodeType !== 'task') {
        throw new WorkflowValidationError('INVALID_FIELD_MAPPING', 'Field mappings may only target Agent task nodes');
      }
      const targets = mappingTargetsByNode.get(edge.targetStageId) ?? [];
      for (const mapping of mappings) {
        if (targets.some((target) => workflowMappingTargetsOverlap(target, mapping.to))) {
          throw new WorkflowValidationError('DUPLICATE_MAPPING_TARGET', 'Incoming edges cannot write overlapping mappedInput pointers');
        }
        targets.push(mapping.to);
      }
      mappingTargetsByNode.set(edge.targetStageId, targets);
    } catch (error) {
      if (error instanceof WorkflowValidationError) throw error;
      if (error instanceof WorkflowDslError) throw new WorkflowValidationError(error.code, error.message);
      throw error;
    }
  }
  const ordered = topologicalOrder(stages, edges);
  assertWeaklyConnected(stages, edges);
  const rootApproval = stages.find((stage) => stage.nodeType === 'approval' && incomingStageIds(stage.id, edges).length === 0);
  if (rootApproval) throw new WorkflowValidationError('INVALID_APPROVAL_NODE', 'Approval nodes require at least one direct upstream node');
  const taskStages = stages.filter((stage) => stage.nodeType === 'task');
  if (taskStages.length < 1) throw new WorkflowValidationError('TASK_NODE_REQUIRED', 'Workflow must contain at least one Agent task node');
  const precision = paymentBudgetPrecision(mission.paymentMethod);
  const tolerance = 10 ** -precision / 2;
  const taskBudget = taskStages.reduce((sum, stage) => sum + stage.budget, 0);
  if (Math.abs(taskBudget - mission.budget) > tolerance) {
    throw new WorkflowValidationError('WORKFLOW_BUDGET_MISMATCH', 'Task node budgets must add up to the mission budget');
  }
  if (requireAssignments) {
    const activeAgentIds = new Set(agents.filter((agent) => agent.status === 'active').map((agent) => agent.id));
    const unassigned = taskStages.find((stage) => !stage.agentId || !activeAgentIds.has(stage.agentId));
    if (unassigned) throw new WorkflowValidationError('INVALID_ASSIGNMENT', `Task node ${unassigned.id} requires an active Agent`);
  }
  return ordered.map((stage, index) => ({ ...stage, position: index + 1 }));
}

export function readyNodes(stages: WorkflowStage[], edges: WorkflowEdge[]): { tasks: WorkflowStage[]; approvals: WorkflowStage[] } {
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  const ready = stages.filter((stage) => {
    if (stage.status !== 'queued') return false;
    return incomingStageIds(stage.id, edges).every((sourceId) => byId.get(sourceId)?.status === 'done');
  });
  return {
    tasks: ready.filter((stage) => stage.nodeType === 'task'),
    approvals: ready.filter((stage) => stage.nodeType === 'approval'),
  };
}

export function blockedNodeIds(stages: WorkflowStage[], edges: WorkflowEdge[]): Set<string> {
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  const blocked = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const stage of stages) {
      if (stage.status !== 'queued' || blocked.has(stage.id)) continue;
      const isBlocked = incomingStageIds(stage.id, edges).some((sourceId) => byId.get(sourceId)?.status === 'failed' || blocked.has(sourceId));
      if (isBlocked) {
        blocked.add(stage.id);
        changed = true;
      }
    }
  }
  return blocked;
}

export function workflowAggregate(stages: WorkflowStage[], edges: WorkflowEdge[]): { progress: number; currentStage: string } {
  const tasks = stages.filter((stage) => stage.nodeType === 'task');
  const budget = tasks.reduce((sum, stage) => sum + stage.budget, 0);
  const weighted = tasks.reduce((sum, stage) => {
    const progress = stage.status === 'done' ? 100 : stage.status === 'queued' ? 0 : stage.progress;
    return sum + stage.budget * progress;
  }, 0);
  const allDone = stages.length > 0 && stages.every((stage) => stage.status === 'done');
  const progress = allDone ? 100 : Math.max(0, Math.min(99, Math.round(budget > 0 ? weighted / budget : 0)));
  const running = tasks.filter((stage) => stage.status === 'running').length;
  const approvals = stages.filter((stage) => stage.nodeType === 'approval' && stage.status === 'running').length;
  const blocked = blockedNodeIds(stages, edges).size;
  const failed = tasks.filter((stage) => stage.status === 'failed').length;
  const parts = [
    running ? `${running} 个节点执行中` : '',
    approvals ? `${approvals} 个待审批` : '',
    blocked ? `${blocked} 个阻塞` : '',
    failed ? `${failed} 个失败` : '',
  ].filter(Boolean);
  return { progress, currentStage: allDone ? '工作流已完成，等待验收' : parts.join(' · ') || '等待可执行节点' };
}
