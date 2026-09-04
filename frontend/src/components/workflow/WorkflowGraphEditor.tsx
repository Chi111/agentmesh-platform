import '@xyflow/react/dist/style.css';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  GitBranch,
  LayoutDashboard,
  ListTree,
  LoaderCircle,
  MoreHorizontal,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Agent,
  CandidateMatch,
  Mission,
  StageOffer,
  WorkflowCondition,
  WorkflowEdge,
  WorkflowFieldMapping,
  WorkflowStage,
  WorkflowViewport,
} from '../../types/domain';
import { formatPaymentAmount } from '../../utils/payments';
import {
  WORKFLOW_NODE_HEIGHT,
  WORKFLOW_NODE_WIDTH,
  WorkflowNodeCard,
  type WorkflowNodeData,
} from './WorkflowNodeCard';
import { findFreeWorkflowNodePosition, hasWorkflowNodeOverlap, layoutWorkflowNodes } from './workflowLayout';

type FlowNode = Node<WorkflowNodeData>;
type WorkflowEdgeData = {
  condition?: WorkflowCondition | null;
  mappings: WorkflowFieldMapping[];
};
type FlowEdge = Edge<WorkflowEdgeData>;
type Snapshot = { nodes: FlowNode[]; edges: FlowEdge[] };

function mappingTargetsOverlap(left: string, right: string): boolean {
  const leftSegments = left.slice(1).split('/');
  const rightSegments = right.slice(1).split('/');
  const sharedLength = Math.min(leftSegments.length, rightSegments.length);
  return leftSegments.slice(0, sharedLength).every((segment, index) => segment === rightSegments[index]);
}

interface Props {
  mission: Mission;
  stages: WorkflowStage[];
  edges?: WorkflowEdge[];
  agents: Agent[];
  candidateMatches: CandidateMatch[];
  offers: StageOffer[];
  locked: boolean;
  busy: boolean;
  onCompile: () => Promise<void>;
  onSave: (stages: WorkflowStage[], edges: WorkflowEdge[], viewport: WorkflowViewport) => Promise<void>;
  onConfirm: () => Promise<void>;
}

const nodeTypes = { workflowNode: WorkflowNodeCard };
const defaultViewport: WorkflowViewport = { x: 0, y: 0, zoom: 1 };
const AUTO_MATCH_MIN_SCORE = 80;
const AUTO_MATCH_MIN_LEAD = 10;

type Candidate = CandidateMatch['candidates'][number];

function candidateQuoteAmount(candidate: Candidate): number {
  return candidate.quote?.amount ?? candidate.agent.price;
}

function candidateQuoteComparable(candidate: Candidate, paymentMethod: Mission['paymentMethod']): boolean {
  return candidate.quote?.comparableToBasePrice ?? paymentMethod !== 'web3_seth';
}

function normalizedMatchValue(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function categoriesMatch(stageCategory: string, agentCategory: string): boolean {
  const stage = normalizedMatchValue(stageCategory);
  const agent = normalizedMatchValue(agentCategory);
  return Boolean(stage && agent && (stage === agent || stage.includes(agent) || agent.includes(stage)));
}

function automaticRecommendation(
  stage: WorkflowStage,
  match: CandidateMatch | null | undefined,
  paymentMethod: Mission['paymentMethod'],
): Candidate | null {
  const candidate = match?.candidates[0];
  if (!candidate || candidate.agent.status !== 'active' || candidate.score < AUTO_MATCH_MIN_SCORE) return null;
  const runnerUp = match?.candidates[1];
  if (runnerUp && candidate.score - runnerUp.score < AUTO_MATCH_MIN_LEAD) return null;
  if (!categoriesMatch(stage.category, candidate.agent.category)) return null;
  if (candidateQuoteComparable(candidate, paymentMethod) && candidateQuoteAmount(candidate) > stage.budget) return null;
  return candidate;
}

function selectionWarnings(
  stage: WorkflowStage,
  match: CandidateMatch | null | undefined,
  selectedAgent: Agent | undefined,
  paymentMethod: Mission['paymentMethod'],
): string[] {
  if (!selectedAgent) return [];
  const selectedCandidate = match?.candidates.find((candidate) => candidate.agent.id === selectedAgent.id);
  const recommendation = match?.candidates[0];
  const warnings: string[] = [];
  if (match?.candidates.length && !selectedCandidate) warnings.push('该 Agent 未进入当前节点 Top 5，暂无可比较的候选分数。');
  if (selectedCandidate && selectedCandidate.score < AUTO_MATCH_MIN_SCORE) {
    warnings.push(`当前匹配分 ${selectedCandidate.score.toFixed(1)}，低于自动匹配阈值 ${AUTO_MATCH_MIN_SCORE}。`);
  }
  if (selectedCandidate && recommendation && recommendation.agent.id !== selectedAgent.id
    && recommendation.score - selectedCandidate.score >= AUTO_MATCH_MIN_LEAD) {
    warnings.push(`比系统首选低 ${(recommendation.score - selectedCandidate.score).toFixed(1)} 分。`);
  }
  if (!categoriesMatch(stage.category, selectedAgent.category)) {
    warnings.push(`功能分类“${selectedAgent.category}”与节点分类“${stage.category}”匹配较弱。`);
  }
  if (selectedCandidate && candidateQuoteComparable(selectedCandidate, paymentMethod) && candidateQuoteAmount(selectedCandidate) > stage.budget) {
    warnings.push(`动态报价 ${formatPaymentAmount(candidateQuoteAmount(selectedCandidate), paymentMethod)} 超过节点预算 ${formatPaymentAmount(stage.budget, paymentMethod)}。`);
  }
  return warnings;
}

function normalizeStage(stage: WorkflowStage, index: number): WorkflowStage {
  const position = stage.position ?? index + 1;
  const nodeType = stage.nodeType ?? 'task';
  return {
    ...stage,
    position,
    nodeType,
    positionX: Number.isFinite(stage.positionX) ? stage.positionX : 80 + (position - 1) * 330,
    positionY: Number.isFinite(stage.positionY) ? stage.positionY : 100,
    progress: Number.isFinite(stage.progress) ? stage.progress : stage.status === 'done' ? 100 : 0,
    input: nodeType === 'task'
      ? { executionMode: 'analyze', inputContract: '', outputContract: '', ...(stage.input ?? {}) }
      : { approvalCriteria: stage.purpose, ...(stage.input ?? {}) },
  };
}

function stageNode(stage: WorkflowStage, agents: Agent[], index = 0): FlowNode {
  const normalized = normalizeStage(stage, index);
  return {
    id: normalized.id,
    type: 'workflowNode',
    position: { x: normalized.positionX, y: normalized.positionY },
    initialWidth: WORKFLOW_NODE_WIDTH,
    initialHeight: WORKFLOW_NODE_HEIGHT,
    data: {
      stage: normalized,
      agentName: agents.find((agent) => agent.id === normalized.agentId)?.name ?? null,
    },
  };
}

function resolveEdges(missionId: string, stages: WorkflowStage[], edges?: WorkflowEdge[]): WorkflowEdge[] {
  if (edges) return edges;
  const ordered = [...stages].sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
  return ordered.slice(1).map((stage, index) => ({
    id: `EDGE-legacy-${ordered[index].id}-${stage.id}`,
    missionId,
    sourceStageId: ordered[index].id,
    targetStageId: stage.id,
  }));
}

function flowEdge(edge: WorkflowEdge): FlowEdge {
  const conditional = Boolean(edge.condition);
  const mapped = Boolean(edge.mappings?.length);
  return {
    id: edge.id,
    source: edge.sourceStageId,
    target: edge.targetStageId,
    type: 'smoothstep',
    animated: true,
    data: { condition: edge.condition ?? null, mappings: edge.mappings ?? [] },
    label: conditional ? '条件' : mapped ? `映射 ${edge.mappings?.length}` : undefined,
    labelStyle: { fontSize: 9, fontWeight: 700, fill: conditional ? '#b45309' : '#475569' },
    style: { stroke: conditional ? '#f59e0b' : mapped ? '#8b5cf6' : '#00b8d9', strokeWidth: 1.5, strokeDasharray: conditional ? '6 4' : undefined },
  };
}

function graphError(nodes: FlowNode[], edges: FlowEdge[], mission: Mission, requireAssignments: boolean, activeAgentIds = new Set<string>()): string | null {
  if (!nodes.length) return '工作流至少需要一个节点。';
  if (nodes.length > 30) return '首版最多支持 30 个节点。';
  if (edges.length > 80) return '首版最多支持 80 条边。';
  if (hasWorkflowNodeOverlap(nodes)) return '节点不能互相重叠，请移动节点或使用自动布局。';
  for (const node of nodes) {
    const stage = node.data.stage;
    if (stage.name.trim().length < 2 || stage.purpose.trim().length < 2) return '每个节点都需要完整的名称和目标说明。';
    if (!Number.isFinite(stage.budget) || stage.budget < 0) return `“${stage.name}”的预算无效。`;
    if (stage.nodeType === 'task') {
      const minimumBudget = mission.paymentMethod === 'web3_seth' ? 0.000001 : 0.01;
      if (stage.budget < minimumBudget) return `“${stage.name}”的预算不能低于 ${formatPaymentAmount(minimumBudget, mission.paymentMethod)}。`;
      if (stage.category.trim().length < 2) return `“${stage.name}”需要任务分类。`;
      const mode = String(stage.input?.executionMode ?? 'analyze');
      if (!['analyze', 'implement', 'review'].includes(mode)) return `“${stage.name}”的执行模式无效。`;
      for (const key of ['inputContract', 'outputContract'] as const) {
        const value = stage.input?.[key];
        if (value !== undefined && typeof value !== 'string') return `“${stage.name}”的输入输出契约必须是文本。`;
        if (typeof value === 'string' && value.length > 4_000) return `“${stage.name}”的输入输出契约不能超过 4000 字。`;
      }
    } else {
      const criteria = typeof stage.input?.approvalCriteria === 'string' ? stage.input.approvalCriteria.trim() : '';
      if (criteria.length < 2 || criteria.length > 2_000) return `“${stage.name}”需要 2–2000 字的审批标准。`;
    }
  }
  const ids = new Set(nodes.map((node) => node.id));
  const edgeKeys = new Set<string>();
  const mappingTargetsByNode = new Map<string, string[]>();
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const undirected = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) return '连线引用了不存在的节点。';
    if (edge.source === edge.target) return '不允许节点连接自身。';
    const key = `${edge.source}:${edge.target}`;
    if (edgeKeys.has(key)) return '不允许重复连线。';
    edgeKeys.add(key);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
    undirected.get(edge.source)?.push(edge.target);
    undirected.get(edge.target)?.push(edge.source);
    const mappings = edge.data?.mappings ?? [];
    if (edge.data?.condition) {
      const target = nodes.find((node) => node.id === edge.target);
      if (target?.data.stage.nodeType !== 'approval' || edges.some((candidate) => candidate.source === edge.target)) {
        return '条件边只能指向没有下游的终态审批 Gate。';
      }
      if (mappings.length) return '同一条条件边不能同时配置字段映射。';
    }
    if (mappings.length && nodes.find((node) => node.id === edge.target)?.data.stage.nodeType !== 'task') {
      return '字段映射只能写入 Agent 任务节点。';
    }
    if (mappings.some((mapping) => (mapping.from !== '' && !mapping.from.startsWith('/')) || !mapping.to.startsWith('/'))) {
      return '字段映射须使用 JSON Pointer；来源可留空表示整个根对象，写入路径必须以 / 开头。';
    }
    const mappingTargets = mappingTargetsByNode.get(edge.target) ?? [];
    for (const mapping of mappings) {
      if (mappingTargets.some((target) => mappingTargetsOverlap(target, mapping.to))) {
        return '同一节点的入边不能写入相同或互相包含的映射目标。';
      }
      mappingTargets.push(mapping.to);
    }
    mappingTargetsByNode.set(edge.target, mappingTargets);
  }
  if (nodes.length > 1) {
    const visited = new Set<string>();
    const queue = [nodes[0].id];
    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      queue.push(...(undirected.get(id) ?? []));
    }
    if (visited.size !== nodes.length) return '图中存在孤立分组，请用连线组成一个弱连通图。';
  }
  const queue = [...indegree.entries()].filter(([, count]) => count === 0).map(([id]) => id);
  let ordered = 0;
  while (queue.length) {
    const id = queue.shift()!;
    ordered += 1;
    for (const target of outgoing.get(id) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }
  if (ordered !== nodes.length) return '工作流不能包含有向环。';
  if (nodes.some((node) => node.data.stage.nodeType === 'approval' && !edges.some((edge) => edge.target === node.id))) return '审批 Gate 至少需要一个直接上游节点。';
  const tasks = nodes.filter((node) => node.data.stage.nodeType === 'task');
  if (!tasks.length) return '至少需要一个 Agent 任务节点。';
  const budget = tasks.reduce((sum, node) => sum + node.data.stage.budget, 0);
  if (Math.abs(budget - mission.budget) > 0.000001) return `任务节点预算合计必须等于 ${formatPaymentAmount(mission.budget, mission.paymentMethod)}。`;
  if (nodes.some((node) => node.data.stage.nodeType === 'approval' && (node.data.stage.agentId || node.data.stage.budget !== 0))) return '审批 Gate 不能配置 Agent 或预算。';
  if (requireAssignments && tasks.some((node) => !node.data.stage.agentId)) return '发送邀请前必须为每个任务节点手动选择 Agent。';
  if (requireAssignments && tasks.some((node) => !activeAgentIds.has(node.data.stage.agentId!))) return '已有任务节点分配了不可用 Agent，请重新选择。';
  return null;
}

function wouldCreateCycle(source: string, target: string, edges: FlowEdge[]): boolean {
  const outgoing = new Map<string, string[]>();
  edges.forEach((edge) => outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]));
  const queue = [target];
  const visited = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (id === source) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    queue.push(...(outgoing.get(id) ?? []));
  }
  return false;
}

function edgeVisual(data: WorkflowEdgeData | undefined): Pick<FlowEdge, 'label' | 'labelStyle' | 'style'> {
  const conditional = Boolean(data?.condition);
  const mapped = Boolean(data?.mappings.length);
  return {
    label: conditional ? '条件' : mapped ? `映射 ${data?.mappings.length}` : undefined,
    labelStyle: { fontSize: 9, fontWeight: 700, fill: conditional ? '#b45309' : '#475569' },
    style: { stroke: conditional ? '#f59e0b' : mapped ? '#8b5cf6' : '#00b8d9', strokeWidth: 1.5, strokeDasharray: conditional ? '6 4' : undefined },
  };
}

function parseConditionValue(value: string): string | number | boolean | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed === null || ['string', 'number', 'boolean'].includes(typeof parsed)
      ? parsed as string | number | boolean | null
      : value;
  } catch {
    return value;
  }
}

function parseConditionDraft(value: string): WorkflowCondition {
  const parsed = JSON.parse(value) as unknown;
  const visit = (candidate: unknown): WorkflowCondition => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('条件必须是 JSON 对象。');
    const record = candidate as Record<string, unknown>;
    if (record.op === 'and' || record.op === 'or') {
      if (!Array.isArray(record.conditions) || record.conditions.length === 0) throw new Error(`${record.op} 至少需要一个子条件。`);
      return { op: record.op, conditions: record.conditions.map(visit) };
    }
    if (record.op === 'not') return { op: 'not', condition: visit(record.condition) };
    if (!['exists', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in'].includes(String(record.op))) {
      throw new Error('条件包含不支持的运算符。');
    }
    if (typeof record.path !== 'string' || (record.path !== '' && !record.path.startsWith('/'))) {
      throw new Error('叶子条件需要 JSON Pointer 路径。');
    }
    if (record.op === 'exists') return { op: 'exists', path: record.path };
    const scalar = (item: unknown): item is string | number | boolean | null => item === null || ['string', 'number', 'boolean'].includes(typeof item);
    if (record.op === 'in') {
      if (!Array.isArray(record.value) || record.value.length === 0 || !record.value.every(scalar)) {
        throw new Error('in 条件需要非空标量数组。');
      }
      return { op: 'in', path: record.path, value: record.value };
    }
    if (!scalar(record.value)) throw new Error(`${String(record.op)} 条件需要标量比较值。`);
    return { op: record.op as 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte', path: record.path, value: record.value };
  };
  return visit(parsed);
}

export function WorkflowGraphEditor({ mission, stages, edges: storedEdges, agents, candidateMatches, offers, locked, busy, onCompile, onSave, onConfirm }: Props) {
  const missionViewport = mission.workflowViewport ?? defaultViewport;
  const resolvedEdges = useMemo(() => resolveEdges(mission.id, stages, storedEdges), [mission.id, stages, storedEdges]);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(stages.map((stage, index) => stageNode(stage, agents, index)));
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(resolvedEdges.map(flowEdge));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [instance, setInstance] = useState<ReactFlowInstance<FlowNode, FlowEdge> | null>(null);
  const [viewport, setViewport] = useState<Viewport>(missionViewport);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);
  const [conditionDraft, setConditionDraft] = useState('');
  const [conditionDraftError, setConditionDraftError] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const graphRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const syncedWorkflowRef = useRef(`${mission.id}:${mission.workflowVersion}`);
  const fittedWorkflowRef = useRef<string | null>(null);
  const fitAfterNodeAddRef = useRef(false);
  const layoutNextCompilationRef = useRef(false);
  const viewportInteractionRef = useRef(false);
  const manuallyEditedAgentStagesRef = useRef(new Set<string>());
  const hasStoredViewport = Math.abs(missionViewport.x) > 0.1
    || Math.abs(missionViewport.y) > 0.1
    || Math.abs(missionViewport.zoom - 1) > 0.001;
  const activeAgents = useMemo(() => agents.filter((agent) => agent.status === 'active'), [agents]);
  const activeAgentIds = useMemo(() => new Set(activeAgents.map((agent) => agent.id)), [activeAgents]);
  const selected = nodes.find((node) => node.id === selectedId) ?? null;
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const selectedEdgeTarget = selectedEdge ? nodes.find((node) => node.id === selectedEdge.target) ?? null : null;
  const selectedCondition = selectedEdge?.data?.condition ?? null;
  const selectedConditionJson = selectedCondition ? JSON.stringify(selectedCondition, null, 2) : '';
  const editableCondition = selectedCondition && 'path' in selectedCondition && selectedCondition.op !== 'in'
    ? selectedCondition
    : null;
  const conditionalEdgeAllowed = Boolean(
    selectedEdgeTarget?.data.stage.nodeType === 'approval'
    && !edges.some((edge) => edge.source === selectedEdgeTarget.id),
  );
  const selectedInput = selected?.data.stage.input ?? {};
  const offerByStage = useMemo(() => new Map(offers.map((offer) => [offer.stageId, offer])), [offers]);
  const canReissueOffers = offers.some((offer) => offer.status === 'declined' || offer.status === 'expired');
  const selectedMatch = candidateMatches.find((match) => match.stageId === selectedId) ?? null;
  const selectedCandidateIds = new Set(selectedMatch?.candidates.map((candidate) => candidate.agent.id) ?? []);
  const agentOptions = [
    ...(selectedMatch?.candidates.map((candidate) => candidate.agent).filter((agent) => activeAgentIds.has(agent.id)) ?? []),
    ...activeAgents.filter((agent) => !selectedCandidateIds.has(agent.id)),
  ];
  const taskNodes = nodes.filter((node) => node.data.stage.nodeType === 'task');
  const gateCount = nodes.length - taskNodes.length;
  const assignedCount = taskNodes.filter((node) => node.data.stage.agentId).length;
  const taskBudget = taskNodes.reduce((sum, node) => sum + node.data.stage.budget, 0);
  const assignmentReviews = taskNodes.flatMap((node) => {
    const agentId = node.data.stage.agentId;
    if (!agentId) return [];
    const agent = agents.find((candidate) => candidate.id === agentId);
    if (!agent) return [];
    const match = candidateMatches.find((candidate) => candidate.stageId === node.id);
    const recommendation = match?.candidates[0];
    const selectedCandidate = match?.candidates.find((candidate) => candidate.agent.id === agentId);
    return [{
      stageId: node.id,
      stageName: node.data.stage.name,
      agent,
      selectedCandidate,
      recommendation,
      manuallyAdjusted: Boolean(recommendation && recommendation.agent.id !== agentId),
      warnings: selectionWarnings(node.data.stage, match, agent, mission.paymentMethod),
    }];
  });
  const selectedReview = assignmentReviews.find((review) => review.stageId === selectedId) ?? null;
  const selectedAutomaticRecommendation = selected?.data.stage.nodeType === 'task'
    ? automaticRecommendation(selected.data.stage, selectedMatch, mission.paymentMethod)
    : null;

  useEffect(() => {
    setConditionDraft(selectedConditionJson);
    setConditionDraftError('');
  }, [selectedConditionJson, selectedEdgeId]);

  useEffect(() => {
    const workflowKey = `${mission.id}:${mission.workflowVersion}`;
    const serverVersionChanged = syncedWorkflowRef.current !== workflowKey;
    // Offer/candidate refreshes can replace the detail object without changing
    // the graph version. Do not let those background updates erase local edits.
    if (dirtyRef.current && !serverVersionChanged) return;
    const nextEdges = resolvedEdges.map(flowEdge);
    const nextNodes = stages.map((stage, index) => stageNode(stage, agents, index));
    const shouldLayout = hasWorkflowNodeOverlap(nextNodes)
      || (serverVersionChanged && layoutNextCompilationRef.current);
    setNodes(shouldLayout ? layoutWorkflowNodes(nextNodes, nextEdges) : nextNodes);
    setEdges(nextEdges);
    setViewport(missionViewport);
    setDirty(shouldLayout);
    dirtyRef.current = shouldLayout;
    setHistory([]);
    setFuture([]);
    syncedWorkflowRef.current = workflowKey;
    layoutNextCompilationRef.current = false;
  }, [agents, mission.id, mission.workflowVersion, missionViewport, resolvedEdges, setEdges, setNodes, stages]);

  useEffect(() => {
    setNodes((items) => items.map((node) => ({
      ...node,
      data: {
        ...node.data,
        agentName: agents.find((agent) => agent.id === node.data.stage.agentId)?.name ?? null,
      },
    })));
  }, [agents, setNodes]);

  useEffect(() => {
    if (locked || offers.length || !candidateMatches.length) return;
    const assignments = new Map<string, Candidate>();
    for (const node of nodes) {
      if (node.data.stage.nodeType !== 'task' || node.data.stage.agentId || manuallyEditedAgentStagesRef.current.has(node.id)) continue;
      const match = candidateMatches.find((candidate) => candidate.stageId === node.id);
      const recommendation = automaticRecommendation(node.data.stage, match, mission.paymentMethod);
      if (recommendation && activeAgentIds.has(recommendation.agent.id)) assignments.set(node.id, recommendation);
    }
    if (!assignments.size) return;
    assignments.forEach((_, stageId) => manuallyEditedAgentStagesRef.current.add(stageId));
    setNodes((items) => items.map((node) => {
      const recommendation = assignments.get(node.id);
      return recommendation ? {
        ...node,
        data: {
          ...node.data,
          stage: { ...node.data.stage, agentId: recommendation.agent.id },
          agentName: recommendation.agent.name,
        },
      } : node;
    }));
    dirtyRef.current = true;
    setDirty(true);
    setMessage({ text: `已按评分和功能为 ${assignments.size} 个节点预选高置信度 Agent，可在发送邀请前调整。`, tone: 'success' });
  }, [activeAgentIds, candidateMatches, locked, mission.paymentMethod, nodes, offers.length, setNodes]);

  useEffect(() => {
    if (!instance || hasStoredViewport || !nodes.length || dirtyRef.current) return;
    const workflowKey = `${mission.id}:${mission.workflowVersion}`;
    if (fittedWorkflowRef.current === workflowKey) return;
    fittedWorkflowRef.current = workflowKey;
    const frame = window.requestAnimationFrame(() => {
      void instance.fitView({ padding: 0.2, duration: 0 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hasStoredViewport, instance, mission.id, mission.workflowVersion, nodes.length]);

  useEffect(() => {
    if (!instance || !fitAfterNodeAddRef.current) return;
    fitAfterNodeAddRef.current = false;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        void instance.fitView({ padding: 0.18, duration: 0 });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [instance, nodes.length]);

  const markDirty = () => {
    dirtyRef.current = true;
    setDirty(true);
  };

  const remember = useCallback(() => {
    setHistory((items) => [...items.slice(-39), { nodes: structuredClone(nodes), edges: structuredClone(edges) }]);
    setFuture([]);
  }, [edges, nodes]);

  const changeStage = (patch: Partial<WorkflowStage>) => {
    if (!selected || locked) return;
    remember();
    setNodes((items) => items.map((node) => node.id === selected.id ? {
      ...node,
      data: {
        ...node.data,
        stage: { ...node.data.stage, ...patch },
        agentName: patch.agentId === undefined ? node.data.agentName : activeAgents.find((agent) => agent.id === patch.agentId)?.name ?? null,
      },
    } : node));
    markDirty();
  };

  const changeAgent = (agentId: string | null) => {
    if (!selected) return;
    manuallyEditedAgentStagesRef.current.add(selected.id);
    changeStage({ agentId });
  };

  const changeEdge = (data: WorkflowEdgeData) => {
    if (!selectedEdge || locked) return;
    remember();
    setEdges((items) => items.map((edge) => edge.id === selectedEdge.id
      ? { ...edge, data, ...edgeVisual(data) }
      : edge));
    markDirty();
  };

  const changeMapping = (index: number, patch: Partial<WorkflowFieldMapping>) => {
    const mappings = [...(selectedEdge?.data?.mappings ?? [])];
    if (!mappings[index]) return;
    mappings[index] = { ...mappings[index], ...patch };
    changeEdge({ condition: selectedEdge?.data?.condition ?? null, mappings });
  };

  const applyConditionDraft = () => {
    try {
      const condition = parseConditionDraft(conditionDraft);
      setConditionDraftError('');
      changeEdge({ condition, mappings: [] });
    } catch (error) {
      setConditionDraftError(error instanceof Error ? error.message : '条件 JSON 无效。');
    }
  };

  const onConnect = (connection: Connection) => {
    if (locked || !connection.source || !connection.target || connection.source === connection.target) return;
    if (edges.some((edge) => edge.source === connection.source && edge.target === connection.target)) return;
    if (wouldCreateCycle(connection.source, connection.target, edges)) {
      setMessage({ text: '这条连线会形成循环，DAG 已阻止该操作。', tone: 'error' });
      return;
    }
    remember();
    setEdges((items) => addEdge<FlowEdge>({
      ...connection,
      id: `EDGE-${crypto.randomUUID()}`,
      type: 'smoothstep',
      animated: true,
      data: { condition: null, mappings: [] },
      ...edgeVisual(undefined),
    }, items));
    markDirty();
  };

  const addNode = (nodeType: 'task' | 'approval', position = { x: 80, y: 120 }) => {
    if (locked) return;
    if (nodes.length >= 30) {
      setMessage({ text: '首版最多支持 30 个节点。', tone: 'error' });
      return;
    }
    remember();
    const freePosition = findFreeWorkflowNodePosition(nodes, position);
    const id = `STAGE-${crypto.randomUUID()}`;
    const stage: WorkflowStage = {
      id, missionId: mission.id, position: nodes.length + 1, nodeType, positionX: freePosition.x, positionY: freePosition.y,
      progress: 0, name: nodeType === 'task' ? '新任务节点' : '人工审批 Gate',
      purpose: nodeType === 'task' ? '描述这个节点需要独立完成的目标。' : '检查所有直接上游结果是否达到审批标准。',
      category: nodeType === 'task' ? mission.category : '人工审批', budget: 0, status: 'queued', agentId: null,
      input: nodeType === 'task'
        ? { executionMode: 'implement', inputContract: '', outputContract: '' }
        : { approvalCriteria: '确认上游交付满足任务目标与验收标准。' },
          output: null,
          attemptNo: 1,
    };
    fitAfterNodeAddRef.current = true;
    setNodes((items) => [...items, stageNode(stage, agents)]);
    setSelectedId(id);
    setInspectorOpen(true);
    markDirty();
  };

  const blankCanvas = () => {
    if (locked) return;
    if (nodes.length && !window.confirm('清空当前画布？尚未保存的节点和连线会被移除。')) return;
    remember();
    setNodes([]);
    setEdges([]);
    setSelectedId(null);
    setSelectedEdgeId(null);
    setMessage({ text: '画布已清空；从节点库添加任务或 Gate 后再保存。', tone: 'success' });
    markDirty();
  };

  const deleteSelected = () => {
    if (locked || (!selectedId && !selectedEdgeId)) return;
    remember();
    if (selectedId) {
      setNodes((items) => items.filter((node) => node.id !== selectedId));
      setEdges((items) => items.filter((edge) => edge.source !== selectedId && edge.target !== selectedId));
    } else if (selectedEdgeId) {
      setEdges((items) => items.filter((edge) => edge.id !== selectedEdgeId));
    }
    setSelectedId(null);
    setSelectedEdgeId(null);
    markDirty();
  };

  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous || locked) return;
    setFuture((items) => [{ nodes: structuredClone(nodes), edges: structuredClone(edges) }, ...items].slice(0, 40));
    setNodes(previous.nodes);
    setEdges(previous.edges);
    setHistory((items) => items.slice(0, -1));
    markDirty();
  };

  const redo = () => {
    const next = future[0];
    if (!next || locked) return;
    setHistory((items) => [...items, { nodes: structuredClone(nodes), edges: structuredClone(edges) }]);
    setNodes(next.nodes);
    setEdges(next.edges);
    setFuture((items) => items.slice(1));
    markDirty();
  };

  const layout = () => {
    if (locked) return;
    remember();
    setNodes((items) => layoutWorkflowNodes(items, edges));
    markDirty();
    window.setTimeout(() => instance?.fitView({ padding: 0.18, duration: 350 }), 0);
  };

  const serialize = () => ({
    stages: nodes.map((node) => ({ ...node.data.stage, positionX: node.position.x, positionY: node.position.y })),
    edges: edges.map((edge): WorkflowEdge => ({
      id: edge.id,
      missionId: mission.id,
      sourceStageId: edge.source,
      targetStageId: edge.target,
      condition: edge.data?.condition ?? null,
      mappings: edge.data?.mappings ?? [],
    })),
  });

  const save = async () => {
    const error = graphError(nodes, edges, mission, false, activeAgentIds);
    if (error) { setMessage({ text: error, tone: 'error' }); return false; }
    try {
      const serialized = serialize();
      await onSave(serialized.stages, serialized.edges, viewport);
      setMessage({ text: '图结构、布局和节点配置已保存。', tone: 'success' });
      setDirty(false);
      dirtyRef.current = false;
      return true;
    } catch (reason) {
      setMessage({ text: reason instanceof Error ? reason.message : '工作流保存失败。', tone: 'error' });
      return false;
    }
  };

  const confirm = async () => {
    const error = graphError(nodes, edges, mission, true, activeAgentIds);
    if (error) { setMessage({ text: error, tone: 'error' }); return; }
    const underfunded = assignmentReviews.find((review) => review.selectedCandidate
      && candidateQuoteComparable(review.selectedCandidate, mission.paymentMethod)
      && candidateQuoteAmount(review.selectedCandidate) > nodes.find((node) => node.id === review.stageId)!.data.stage.budget);
    if (underfunded?.selectedCandidate) {
      const stage = nodes.find((node) => node.id === underfunded.stageId)!.data.stage;
      setMessage({
        text: `${stage.name} 的动态报价为 ${formatPaymentAmount(candidateQuoteAmount(underfunded.selectedCandidate), mission.paymentMethod)}，超过节点预算 ${formatPaymentAmount(stage.budget, mission.paymentMethod)}。请调整节点预算或更换 Agent。`,
        tone: 'error',
      });
      return;
    }
    const manualAdjustments = assignmentReviews.filter((review) => review.manuallyAdjusted);
    const riskyAssignments = assignmentReviews.filter((review) => review.warnings.length);
    if (manualAdjustments.length || riskyAssignments.length) {
      const adjustmentLines = manualAdjustments.slice(0, 6).map((review) => (
        `${review.stageName}：${review.recommendation?.agent.name ?? '系统首选'} ${review.recommendation ? `(${review.recommendation.score.toFixed(1)})` : ''} → ${review.agent.name} ${review.selectedCandidate ? `(${review.selectedCandidate.score.toFixed(1)})` : '(无候选分)'}`
      ));
      const riskLines = riskyAssignments.slice(0, 6).map((review) => `${review.stageName}：${review.warnings.join(' ')}`);
      const detail = [
        manualAdjustments.length ? `人工调整 ${manualAdjustments.length} 个节点：\n${adjustmentLines.join('\n')}` : '',
        riskyAssignments.length ? `\n需要注意 ${riskyAssignments.length} 个节点：\n${riskLines.join('\n')}` : '',
      ].filter(Boolean).join('\n');
      if (!window.confirm(`${detail}\n\n确认按当前分配发送邀请吗？`)) return;
    }
    if (dirty && !await save()) return;
    try { await onConfirm(); } catch (reason) {
      setMessage({ text: reason instanceof Error ? reason.message : '邀请发送失败。', tone: 'error' });
    }
  };

  const compileDraft = async () => {
    if (dirty && !window.confirm('AI 智能编排会重新分析复杂度并替换当前尚未保存的画布，是否继续？')) return;
    layoutNextCompilationRef.current = true;
    try { await onCompile(); } catch (reason) {
      layoutNextCompilationRef.current = false;
      setMessage({ text: reason instanceof Error ? reason.message : 'AI 工作流生成失败。', tone: 'error' });
    }
  };

  const validate = () => {
    const error = graphError(nodes, edges, mission, true, activeAgentIds);
    setMessage({ text: error ?? 'DAG 校验通过，可以发送邀请。', tone: error ? 'error' : 'success' });
    setMoreOpen(false);
  };

  const dropNode = (event: React.DragEvent) => {
    event.preventDefault();
    const nodeType = event.dataTransfer.getData('application/agentmesh-node');
    if ((nodeType !== 'task' && nodeType !== 'approval') || !instance) return;
    addNode(nodeType, instance.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };

  const toggleGateUpstream = (sourceId: string, checked: boolean) => {
    if (!selected || selected.data.stage.nodeType !== 'approval' || locked) return;
    const existing = edges.find((edge) => edge.source === sourceId && edge.target === selected.id);
    if (checked && existing) return;
    if (!checked && !existing) return;
    if (checked && wouldCreateCycle(sourceId, selected.id, edges)) {
      setMessage({ text: '这个直接上游会形成循环，无法添加。', tone: 'error' });
      return;
    }
    remember();
    setEdges((items) => checked
      ? addEdge<FlowEdge>({
        id: `EDGE-${crypto.randomUUID()}`,
        source: sourceId,
        target: selected.id,
        type: 'smoothstep',
        animated: true,
        data: { condition: null, mappings: [] },
        ...edgeVisual(undefined),
      }, items)
      : items.filter((edge) => edge.id !== existing?.id));
    markDirty();
  };

  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-card">
      <div className="relative z-30 flex shrink-0 items-center gap-2 border-b border-line bg-white px-2 py-2 sm:px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <button type="button" className="hidden size-9 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition hover:bg-canvas hover:text-ink lg:inline-flex" onClick={() => setLibraryOpen((open) => !open)} aria-label={libraryOpen ? '收起节点侧栏' : '展开节点侧栏'}>{libraryOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}</button>
          <button type="button" className="btn-signal !min-h-9 shrink-0 !rounded-lg !px-3 !py-1.5 !text-xs" onClick={() => void compileDraft()} disabled={busy || locked} title="分析任务复杂度，生成可并行、可汇合且经过校验的 DAG"><Sparkles size={14} />AI 智能编排</button>
          <div className="hidden items-center gap-1.5 lg:flex">
            <button type="button" className="btn-secondary !min-h-9 !rounded-lg !px-3 !py-1.5 !text-xs" onClick={blankCanvas} disabled={busy || locked}><Trash2 size={14} />空白画布</button>
            <button type="button" className="btn-secondary !min-h-9 !rounded-lg !px-3 !py-1.5 !text-xs" onClick={layout} disabled={busy || locked}><LayoutDashboard size={14} />自动布局</button>
            <button type="button" className="btn-secondary !min-h-9 !rounded-lg !px-3 !py-1.5 !text-xs" onClick={deleteSelected} disabled={busy || locked || (!selectedId && !selectedEdgeId)}><Trash2 size={14} />删除所选</button>
          </div>
          <button type="button" className="btn-secondary !min-h-9 shrink-0 !rounded-lg !px-2.5 !py-1.5" onClick={undo} disabled={!history.length || locked} title="撤销" aria-label="撤销"><Undo2 size={15} /></button>
          <button type="button" className="btn-secondary !min-h-9 shrink-0 !rounded-lg !px-2.5 !py-1.5" onClick={redo} disabled={!future.length || locked} title="重做" aria-label="重做"><Redo2 size={15} /></button>
          <button type="button" className="btn-secondary !min-h-9 shrink-0 !rounded-lg !px-2.5 !py-1.5 lg:hidden" onClick={() => setMoreOpen((open) => !open)} aria-label="更多编辑操作" aria-expanded={moreOpen}><MoreHorizontal size={16} /></button>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" className="hidden size-9 items-center justify-center rounded-lg border border-line text-muted transition hover:bg-canvas hover:text-ink xl:inline-flex" onClick={() => setInspectorOpen((open) => !open)} aria-label={inspectorOpen ? '收起配置侧栏' : '展开配置侧栏'}>{inspectorOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}</button>
          <button type="button" className="btn-secondary hidden !min-h-9 !rounded-lg !px-3 !py-1.5 !text-xs lg:inline-flex" onClick={validate}><CheckCircle2 size={14} />校验</button>
          <button type="button" className="btn-secondary !min-h-9 !rounded-lg !px-2.5 !py-1.5 !text-xs sm:!px-3" aria-label="保存" onClick={() => void save()} disabled={busy || locked || !dirty}>{busy ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}<span className="hidden sm:inline">保存</span></button>
          <button type="button" className="btn-primary !min-h-9 !rounded-lg !px-2.5 !py-1.5 !text-xs sm:!px-3" onClick={() => void confirm()} disabled={busy || locked || (offers.length > 0 && !canReissueOffers)}>{busy ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />}<span className="hidden sm:inline">{canReissueOffers ? '重新发送邀请' : offers.length ? '邀请已发送' : '发送邀请'}</span><span className="sm:hidden">邀请</span></button>
        </div>

        {moreOpen ? <div className="absolute left-2 top-12 z-50 w-52 rounded-xl border border-line bg-white p-2 shadow-float lg:hidden">
          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold hover:bg-canvas disabled:opacity-45" onClick={() => { layout(); setMoreOpen(false); }} disabled={busy || locked}><LayoutDashboard size={14} />自动布局</button>
          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold hover:bg-canvas disabled:opacity-45" onClick={() => { blankCanvas(); setMoreOpen(false); }} disabled={busy || locked}><Trash2 size={14} />空白画布</button>
          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold hover:bg-canvas disabled:opacity-45" onClick={() => { deleteSelected(); setMoreOpen(false); }} disabled={busy || locked || (!selectedId && !selectedEdgeId)}><Trash2 size={14} />删除所选</button>
          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold hover:bg-canvas" onClick={validate}><CheckCircle2 size={14} />校验工作流</button>
        </div> : null}
      </div>

      <div className="workflow-editor-grid min-h-0 flex-1" data-library={libraryOpen ? 'open' : 'closed'} data-inspector={inspectorOpen ? 'open' : 'closed'}>
        {libraryOpen ? <aside className="workflow-library-sidebar hidden min-h-0 flex-col overflow-hidden border-r border-line bg-canvas/70 lg:flex">
          <div className="shrink-0 border-b border-line px-4 py-3">
            <div className="flex items-center justify-between"><div><p className="eyebrow">节点侧栏</p><h2 className="mt-1 text-sm font-semibold">构建流程</h2></div><ListTree size={18} className="text-cyan" /></div>
            <p className="mt-2 text-[10px] leading-4 text-muted">拖到画布，或点击快速添加。</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 [scrollbar-width:thin]">
            {[{ type: 'task' as const, label: 'Agent 任务', detail: '分析、实现或审查', icon: Bot }, { type: 'approval' as const, label: '人工审批 Gate', detail: '暂停并等待任务方', icon: ShieldCheck }].map((item) => <button
              type="button"
              draggable={!locked}
              onDragStart={(event) => { event.dataTransfer.setData('application/agentmesh-node', item.type); event.dataTransfer.effectAllowed = 'move'; }}
              onClick={() => addNode(item.type)}
              className="mb-2 flex w-full items-center gap-3 rounded-xl border border-line bg-white p-3 text-left transition hover:border-cyan hover:shadow-sm"
              key={item.type}
              disabled={locked}
            ><span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${item.type === 'task' ? 'bg-ink text-cyan' : 'bg-amber-100 text-amber-700'}`}><item.icon size={17} /></span><span className="min-w-0"><strong className="block text-xs">{item.label}</strong><span className="mt-0.5 block text-[9px] text-muted">{item.detail}</span></span><Plus size={13} className="ml-auto shrink-0 text-muted" /></button>)}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-line bg-white p-2.5"><p className="text-[9px] text-muted">节点 / 连线</p><p className="mt-1 font-mono text-xs font-semibold">{nodes.length}<span className="text-muted"> / </span>{edges.length}</p></div>
              <div className="rounded-xl border border-line bg-white p-2.5"><p className="text-[9px] text-muted">Agent 已分配</p><p className="mt-1 font-mono text-xs font-semibold">{assignedCount}<span className="text-muted"> / </span>{taskNodes.length}</p></div>
              <div className="col-span-2 rounded-xl border border-line bg-white p-2.5"><div className="flex items-center justify-between"><p className="text-[9px] text-muted">任务预算</p><span className="font-mono text-[9px] text-muted">{gateCount} Gate</span></div><p className={`mt-1 truncate font-mono text-xs font-semibold ${Math.abs(taskBudget - mission.budget) > 0.000001 ? 'text-warning' : 'text-ink'}`}>{formatPaymentAmount(taskBudget, mission.paymentMethod)} / {formatPaymentAmount(mission.budget, mission.paymentMethod)}</p></div>
            </div>

            <div className="mt-5 flex items-center justify-between"><p className="eyebrow">流程节点</p><span className="font-mono text-[9px] text-muted">{nodes.length}/30</span></div>
            <nav className="mt-2 space-y-1" aria-label="工作流节点列表">{nodes.map((node) => <button type="button" className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition ${selectedId === node.id ? 'bg-cyan/10 text-ink' : 'text-muted hover:bg-white hover:text-ink'}`} onClick={() => { setSelectedId(node.id); setSelectedEdgeId(null); setInspectorOpen(true); }} key={node.id}><span className={`size-1.5 shrink-0 rounded-full ${node.data.stage.nodeType === 'approval' ? 'bg-warning' : node.data.stage.agentId ? 'bg-lime' : 'bg-cyan'}`} /><span className="min-w-0 flex-1 truncate text-[10px] font-semibold">{node.data.stage.name}</span><span className="font-mono text-[8px]">{node.data.stage.nodeType === 'approval' ? 'GATE' : 'TASK'}</span></button>)}</nav>

            <div className="mt-4 rounded-xl border border-line bg-white p-3 text-[9px] leading-4 text-muted"><GitBranch size={13} className="mb-1.5 text-cyan" />最多 30 个节点 / 80 条边；条件仅用于终态 Gate，循环会在启动前静态展开。</div>
          </div>
        </aside> : null}

        <div ref={graphRef} className="mesh-grid relative h-full min-h-0 overflow-hidden bg-[#f7f9f8]" onDrop={dropNode} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}>
          <div className="absolute left-3 top-3 z-10 flex gap-2 lg:hidden"><button type="button" className="btn-secondary !min-h-9 !px-3 !text-xs shadow-sm" onClick={() => addNode('task')}><Bot size={14} />任务</button><button type="button" className="btn-secondary !min-h-9 !px-3 !text-xs shadow-sm" onClick={() => addNode('approval')}><ShieldCheck size={14} />Gate</button></div>
          <div className="pointer-events-none absolute right-3 top-3 z-10 hidden items-center gap-2 rounded-lg border border-line bg-white/90 px-2.5 py-1.5 text-[9px] text-muted shadow-sm sm:flex"><MousePointer2 size={12} />拖动平移 · 使用 ± 缩放</div>
          {message ? <div className={`absolute left-1/2 top-3 z-20 flex max-w-[min(520px,calc(100%-1.5rem))] -translate-x-1/2 items-start gap-2 rounded-xl border bg-white px-3 py-2 text-xs shadow-float ${message.tone === 'error' ? 'border-danger/30 text-danger' : 'border-lime/40 text-lime-700'}`} role={message.tone === 'error' ? 'alert' : 'status'}><span className="min-w-0 flex-1">{message.text}</span><button type="button" className="shrink-0 text-muted hover:text-ink" onClick={() => setMessage(null)} aria-label="关闭提示"><X size={13} /></button></div> : null}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={(changes) => {
              const allowedChanges = locked
                ? changes.filter((change) => change.type !== 'remove' && change.type !== 'position')
                : changes;
              onNodesChange(allowedChanges);
              if (!locked && changes.some((change) => change.type === 'remove' || (change.type === 'position' && !change.dragging))) markDirty();
            }}
            onEdgesChange={(changes) => { if (!locked) { onEdgesChange(changes); if (changes.some((change) => change.type === 'remove')) markDirty(); } }}
            onConnect={onConnect}
            onInit={setInstance}
            onNodeClick={(_, node) => { setSelectedId(node.id); setSelectedEdgeId(null); setInspectorOpen(true); }}
            onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedId(null); setInspectorOpen(true); }}
            onPaneClick={() => { setSelectedId(null); setSelectedEdgeId(null); setInspectorOpen(false); setMoreOpen(false); }}
            onNodeDragStart={remember}
            onNodesDelete={remember}
            onEdgesDelete={remember}
            nodesDraggable={!locked}
            nodesConnectable={!locked}
            deleteKeyCode={locked ? null : ['Backspace', 'Delete']}
            elementsSelectable
            fitView={!hasStoredViewport}
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.15}
            maxZoom={2.5}
            defaultViewport={missionViewport}
            zoomOnScroll={false}
            panOnScroll={false}
            preventScrolling
            onMoveStart={(event) => { viewportInteractionRef.current = event !== null; }}
            onMoveEnd={(_, nextViewport) => {
              const changed = Math.abs(nextViewport.x - viewport.x) > 0.1
                || Math.abs(nextViewport.y - viewport.y) > 0.1
                || Math.abs(nextViewport.zoom - viewport.zoom) > 0.001;
              setViewport(nextViewport);
              if (!locked && changed && viewportInteractionRef.current) markDirty();
              viewportInteractionRef.current = false;
            }}
          >
            <Background gap={20} size={1} color="#cbd5d1" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!hidden !border !border-line !bg-white md:!block" nodeColor={(node) => (node.data as WorkflowNodeData).stage.nodeType === 'approval' ? '#f59e0b' : '#00b8d9'} />
          </ReactFlow>
        </div>

        {inspectorOpen ? <aside className={`${selected || selectedEdge ? 'fixed inset-x-2 bottom-2 z-50 flex max-h-[70dvh] rounded-2xl border shadow-2xl md:inset-y-2 md:left-auto md:right-2 md:w-[360px] md:max-h-none lg:static lg:w-auto lg:rounded-none lg:border-y-0 lg:border-r-0 lg:shadow-none' : 'hidden lg:flex'} min-h-0 flex-col overflow-hidden border-l border-line bg-white`}>
          <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3"><div className="min-w-0"><p className="eyebrow">{selectedEdge ? '连线配置' : '节点配置'}</p><h3 className="mt-1 truncate text-sm font-semibold">{selected ? selected.data.stage.nodeType === 'task' ? 'Agent 任务' : '人工审批 Gate' : selectedEdge ? '转换规则' : '属性检查器'}</h3></div><button type="button" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-muted transition hover:bg-canvas hover:text-ink" onClick={() => { setInspectorOpen(false); setSelectedId(null); setSelectedEdgeId(null); }}><X size={13} /><span className="lg:hidden">关闭</span><span className="hidden lg:inline">收起</span></button></div>
          {selected ? <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 [scrollbar-width:thin]">
            <div className="rounded-xl border border-line bg-canvas/45 p-3"><div className="flex items-center justify-between gap-2"><span className="font-mono text-[9px] text-muted">{selected.id}</span><span className={`rounded-md px-2 py-1 font-mono text-[8px] ${selected.data.stage.nodeType === 'task' ? 'bg-ink text-cyan' : 'bg-amber-100 text-amber-700'}`}>{selected.data.stage.nodeType === 'task' ? 'TASK' : 'GATE'}</span></div></div>
            <label><span className="field-label !mb-1.5 !text-xs">名称</span><input className="field" value={selected.data.stage.name} onChange={(event) => changeStage({ name: event.target.value })} disabled={locked} /></label>
            <label><span className="field-label !mb-1.5 !text-xs">目标 / 审批说明</span><textarea className="field min-h-24 resize-none" value={selected.data.stage.purpose} onChange={(event) => changeStage({ purpose: event.target.value })} disabled={locked} /></label>
            {selected.data.stage.nodeType === 'task' ? <>
              <div className="grid grid-cols-2 gap-3"><label><span className="field-label !mb-1.5 !text-xs">分类</span><input className="field" value={selected.data.stage.category} onChange={(event) => changeStage({ category: event.target.value })} disabled={locked} /></label><label><span className="field-label !mb-1.5 !text-xs">预算</span><input className="field font-mono" type="number" min={mission.paymentMethod === 'web3_seth' ? 0.000001 : 0.01} step="0.000001" value={selected.data.stage.budget} onChange={(event) => changeStage({ budget: Number(event.target.value) })} disabled={locked} /></label></div>
              <label><span className="field-label !mb-1.5 !text-xs">Agent（系统推荐，可手动调整）</span><select className="field" value={selected.data.stage.agentId ?? ''} onChange={(event) => changeAgent(event.target.value || null)} disabled={locked}><option value="">请选择 Agent</option>{agentOptions.map((agent) => <option value={agent.id} key={agent.id}>{agent.name} · {agent.category}</option>)}</select></label>
              {selectedReview?.manuallyAdjusted ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800"><div className="flex items-center gap-2 font-semibold"><AlertTriangle size={14} />已手动调整</div><p className="mt-1 text-[10px] leading-4">系统首选 {selectedReview.recommendation?.agent.name}（{selectedReview.recommendation?.score.toFixed(1)} 分），当前为 {selectedReview.agent.name}{selectedReview.selectedCandidate ? `（${selectedReview.selectedCandidate.score.toFixed(1)} 分）` : '（无候选分）'}。</p></div> : selectedAutomaticRecommendation && selected.data.stage.agentId === selectedAutomaticRecommendation.agent.id ? <p className="rounded-xl border border-lime/40 bg-lime/10 p-3 text-xs font-semibold text-lime-700"><CheckCircle2 className="mr-1.5 inline" size={14} />已采用系统高置信度推荐 · {selectedAutomaticRecommendation.score.toFixed(1)} 分</p> : null}
              {selectedReview?.warnings.length ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[10px] leading-4 text-amber-800" role="alert"><p className="font-semibold">发送邀请前请确认</p><ul className="mt-1 list-disc space-y-1 pl-4">{selectedReview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
              {selectedMatch?.candidates.length ? <div><div className="mb-1.5 flex items-center justify-between gap-2"><p className="field-label !mb-0 !text-xs">候选建议</p><span className="text-[9px] text-muted">自动阈值 {AUTO_MATCH_MIN_SCORE} · 领先 {AUTO_MATCH_MIN_LEAD}</span></div><div className="space-y-2">{selectedMatch.candidates.slice(0, 3).map((candidate, index) => {
                const recommended = index === 0;
                const automaticallyEligible = recommended && Boolean(automaticRecommendation(selected.data.stage, selectedMatch, mission.paymentMethod));
                return <button type="button" className={`w-full rounded-xl border p-3 text-left text-xs transition ${selected.data.stage.agentId === candidate.agent.id ? 'border-cyan bg-cyan/5' : 'border-line hover:border-cyan/40'}`} onClick={() => changeAgent(candidate.agent.id)} disabled={locked || candidate.agent.status !== 'active'} key={candidate.agent.id}><span className="flex items-center justify-between gap-2"><span className="min-w-0"><strong>{candidate.agent.name}</strong>{recommended ? <span className={`ml-2 rounded px-1.5 py-0.5 text-[8px] font-semibold ${automaticallyEligible ? 'bg-lime/15 text-lime-700' : 'bg-canvas text-muted'}`}>{automaticallyEligible ? '系统推荐' : '候选首位'}</span> : null}{selected.data.stage.agentId === candidate.agent.id ? <span className="ml-1 rounded bg-cyan/10 px-1.5 py-0.5 text-[8px] font-semibold text-cyan">当前</span> : null}</span><span className="text-right"><span className="block font-mono text-cyan">{candidate.score.toFixed(1)}</span><span className="block font-mono text-[9px] text-muted">报价 {formatPaymentAmount(candidateQuoteAmount(candidate), mission.paymentMethod)}</span></span></span><span className="mt-1 block line-clamp-2 text-[10px] leading-4 text-muted">{candidate.reasons.join(' · ')}</span></button>;
              })}</div></div> : null}
              <label><span className="field-label !mb-1.5 !text-xs">执行模式</span><select className="field" value={String(selectedInput.executionMode ?? 'analyze')} onChange={(event) => changeStage({ input: { ...selectedInput, executionMode: event.target.value } })} disabled={locked}><option value="analyze">Analyze</option><option value="implement">Implement</option><option value="review">Review</option></select></label>
              <label><span className="field-label !mb-1.5 !text-xs">输入契约</span><textarea className="field min-h-20 resize-none font-mono text-xs" value={String(selectedInput.inputContract ?? '')} onChange={(event) => changeStage({ input: { ...selectedInput, inputContract: event.target.value } })} disabled={locked} placeholder="描述直接上游需提供的字段或制品" /></label>
              <label><span className="field-label !mb-1.5 !text-xs">输出契约</span><textarea className="field min-h-20 resize-none font-mono text-xs" value={String(selectedInput.outputContract ?? '')} onChange={(event) => changeStage({ input: { ...selectedInput, outputContract: event.target.value } })} disabled={locked} placeholder="描述交接摘要与 artifact reference" /></label>
            </> : <><label><span className="field-label !mb-1.5 !text-xs">审批标准</span><textarea className="field min-h-28 resize-none" value={String(selectedInput.approvalCriteria ?? '')} onChange={(event) => changeStage({ input: { ...selectedInput, approvalCriteria: event.target.value } })} disabled={locked} /></label><div><p className="field-label !mb-1.5 !text-xs">直接上游节点</p><div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-line p-3">{nodes.filter((node) => node.id !== selected.id).map((node) => { const checked = edges.some((edge) => edge.source === node.id && edge.target === selected.id); return <label className="flex items-start gap-2 text-xs" key={node.id}><input type="checkbox" className="mt-0.5" checked={checked} onChange={(event) => toggleGateUpstream(node.id, event.target.checked)} disabled={locked} /><span><strong className="block text-ink">{node.data.stage.name}</strong><span className="text-[10px] text-muted">{node.data.stage.nodeType === 'approval' ? 'Gate' : '任务节点'}</span></span></label>; })}</div><p className="mt-2 text-[10px] leading-4 text-muted">Gate 会等待这里勾选的所有直接上游完成。</p></div></>}
            {offerByStage.get(selected.id) ? <p className="rounded-xl bg-canvas p-3 text-xs text-muted">邀请状态：<strong className="text-ink">{offerByStage.get(selected.id)?.status}</strong></p> : null}
          </div> : selectedEdge ? <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 [scrollbar-width:thin]">
            <div className="rounded-xl border border-line bg-canvas/45 p-3">
              <span className="font-mono text-[9px] text-muted">{selectedEdge.id}</span>
              <p className="mt-2 text-xs font-semibold">{nodes.find((node) => node.id === selectedEdge.source)?.data.stage.name ?? selectedEdge.source}</p>
              <p className="mt-1 text-[10px] text-muted">→ {selectedEdgeTarget?.data.stage.name ?? selectedEdge.target}</p>
            </div>
            <label className="flex items-start gap-2 rounded-xl border border-line p-3 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={Boolean(selectedCondition)}
                disabled={locked || (!selectedCondition && !conditionalEdgeAllowed)}
                onChange={(event) => changeEdge({
                  condition: event.target.checked ? { op: 'exists', path: '/verified' } : null,
                  mappings: event.target.checked ? [] : selectedEdge.data?.mappings ?? [],
                })}
              />
              <span><strong className="block text-ink">条件 Gate</strong><span className="mt-1 block text-[10px] leading-4 text-muted">仅允许指向无下游的终态审批 Gate；条件为假时自动跳过。</span></span>
            </label>
            {selectedCondition ? <>
              <label><span className="field-label !mb-1.5 !text-xs">完整条件 AST（JSON）</span><textarea className="field min-h-40 resize-y font-mono text-[10px] leading-4" value={conditionDraft} onChange={(event) => { setConditionDraft(event.target.value); setConditionDraftError(''); }} disabled={locked} spellCheck={false} /></label>
              <p className="text-[10px] leading-4 text-muted">支持 exists、比较、in、and、or 和 not；复合条件可在这里完整查看和编辑。</p>
              {conditionDraftError ? <p className="rounded-lg bg-danger/10 p-2 text-[10px] text-danger" role="alert">{conditionDraftError}</p> : null}
              <button type="button" className="btn-secondary !min-h-8 !px-3 !py-1.5 !text-[10px]" onClick={applyConditionDraft} disabled={locked}>应用条件 JSON</button>
              {editableCondition ? <>
                <label><span className="field-label !mb-1.5 !text-xs">输出路径（JSON Pointer）</span><input className="field font-mono text-xs" value={editableCondition.path} onChange={(event) => changeEdge({ condition: { ...editableCondition, path: event.target.value }, mappings: [] })} disabled={locked} placeholder="/result/verified" /></label>
                <label><span className="field-label !mb-1.5 !text-xs">运算符</span><select className="field" value={editableCondition.op} onChange={(event) => {
                  const op = event.target.value as 'exists' | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
                  const condition: WorkflowCondition = op === 'exists'
                    ? { op, path: editableCondition.path }
                    : { op, path: editableCondition.path, value: 'value' in editableCondition ? editableCondition.value as string | number | boolean | null : true };
                  changeEdge({ condition, mappings: [] });
                }} disabled={locked}><option value="exists">存在</option><option value="eq">等于</option><option value="neq">不等于</option><option value="gt">大于</option><option value="gte">大于等于</option><option value="lt">小于</option><option value="lte">小于等于</option></select></label>
                {editableCondition.op !== 'exists' ? <label><span className="field-label !mb-1.5 !text-xs">比较值</span><input className="field font-mono text-xs" value={String('value' in editableCondition ? editableCondition.value : '')} onChange={(event) => changeEdge({ condition: { ...editableCondition, value: parseConditionValue(event.target.value) } as WorkflowCondition, mappings: [] })} disabled={locked} placeholder='true、42 或文本' /></label> : null}
              </> : null}
            </> : null}

            <div>
              <div className="flex items-center justify-between"><p className="field-label !mb-0 !text-xs">字段映射</p><button type="button" className="text-[10px] font-semibold text-cyan disabled:opacity-40" disabled={locked || Boolean(selectedCondition) || selectedEdgeTarget?.data.stage.nodeType !== 'task' || (selectedEdge.data?.mappings.length ?? 0) >= 20} onClick={() => changeEdge({ condition: null, mappings: [...(selectedEdge.data?.mappings ?? []), { from: '/summary', to: '/summary', required: true }] })}>+ 添加</button></div>
              <p className="mt-1 text-[10px] leading-4 text-muted">把直接上游的结构化输出写入目标任务的 mappedInput。</p>
              <div className="mt-2 space-y-2">{(selectedEdge.data?.mappings ?? []).map((mapping, index) => <div className="rounded-xl border border-line p-3" key={`${selectedEdge.id}-mapping-${index}`}>
                <label><span className="field-label !mb-1 !text-[10px]">来源</span><input className="field !py-2 font-mono text-[10px]" value={mapping.from} onChange={(event) => changeMapping(index, { from: event.target.value })} disabled={locked} /></label>
                <label className="mt-2 block"><span className="field-label !mb-1 !text-[10px]">写入</span><input className="field !py-2 font-mono text-[10px]" value={mapping.to} onChange={(event) => changeMapping(index, { to: event.target.value })} disabled={locked} /></label>
                <div className="mt-2 flex items-center justify-between"><label className="inline-flex items-center gap-2 text-[10px]"><input type="checkbox" checked={mapping.required !== false} onChange={(event) => changeMapping(index, { required: event.target.checked })} disabled={locked} />缺失即阻断</label><button type="button" className="text-[10px] font-semibold text-danger" onClick={() => changeEdge({ condition: null, mappings: (selectedEdge.data?.mappings ?? []).filter((_, candidateIndex) => candidateIndex !== index) })} disabled={locked}>删除</button></div>
              </div>)}</div>
            </div>
          </div> : <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6 text-center"><GitBranch size={28} className="text-muted/40" /><p className="mt-3 text-sm font-semibold">选择节点或连线</p><p className="mt-1 max-w-48 text-xs leading-5 text-muted">配置节点属性、条件 Gate 或字段映射。</p></div>}
        </aside> : null}
      </div>
    </section>
  );
}
