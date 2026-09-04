import type { Agent, CandidateMatch, Mission, UserContext, WorkflowEdge, WorkflowStage } from './contracts';
import { allocatePaymentBudget } from './payments';
import { quoteStage } from './pricing';
import { linearEdges } from './workflowGraph';

export function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function makeMissionId(): string {
  const year = new Date().getUTCFullYear();
  return `TASK-${year}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function stableNoise(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export function canAccessMission(user: UserContext, mission: Mission, agents: Agent[], stages: WorkflowStage[]): boolean {
  if (user.role === 'admin' || mission.requesterId === user.id) return true;
  if (user.role !== 'developer') return false;
  const ownedAgentIds = new Set(agents.filter((agent) => agent.ownerId === user.id).map((agent) => agent.id));
  return stages.some((stage) => stage.agentId && ownedAgentIds.has(stage.agentId));
}

export interface WorkflowCompilation {
  spec: Record<string, unknown>;
  stages: WorkflowStage[];
  edges: WorkflowEdge[];
}

type LlmCompilation = {
  objective?: unknown;
  acceptanceCriteria?: unknown;
  risks?: unknown;
  stages?: unknown;
  nodes?: unknown;
  edges?: unknown;
};

export function parseLlmCompilation(content: string, mission: Mission): WorkflowCompilation | null {
  let parsed: LlmCompilation;
  try {
    parsed = JSON.parse(content) as LlmCompilation;
  } catch {
    return null;
  }
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : parsed.stages;
  if (!Array.isArray(nodes) || nodes.length < 1 || nodes.length > 30) return null;
  const now = new Date().toISOString();
  const rawStages = nodes as Array<Record<string, unknown>>;
  const taskRows = rawStages.filter((stage) => stage.nodeType !== 'approval');
  if (taskRows.length < 1) return null;
  const requestedBudgets = taskRows.map((stage) => {
    const value = Number(stage.budget ?? 0);
    return Number.isFinite(value) && value > 0 ? value : mission.budget / taskRows.length;
  });
  const allocatedBudgets = allocatePaymentBudget(requestedBudgets, mission.budget, mission.paymentMethod);
  if (!allocatedBudgets) return null;
  let taskIndex = 0;
  const externalIds = new Map<string, string>();
  const stages: WorkflowStage[] = rawStages.map((stage, index) => {
    const id = makeId('STAGE');
    const externalId = typeof stage.id === 'string' && stage.id.trim() ? stage.id.trim() : String(index + 1);
    externalIds.set(externalId, id);
    const nodeType = stage.nodeType === 'approval' ? 'approval' : 'task';
    const allocatedBudget = nodeType === 'task' ? allocatedBudgets[taskIndex++] : 0;
    return {
    id,
    missionId: mission.id,
    position: index + 1,
    nodeType,
    positionX: Number.isFinite(Number(stage.positionX)) ? Number(stage.positionX) : 80 + (index % 4) * 320,
    positionY: Number.isFinite(Number(stage.positionY)) ? Number(stage.positionY) : 100 + Math.floor(index / 4) * 220,
    progress: 0,
    name: typeof stage.name === 'string' && stage.name.trim() ? stage.name.trim().slice(0, 120) : `执行阶段 ${index + 1}`,
    purpose: typeof stage.purpose === 'string' ? stage.purpose.trim().slice(0, 600) : '',
    category: typeof stage.category === 'string' && stage.category.trim() ? stage.category.trim().slice(0, 80) : mission.category,
    budget: allocatedBudget,
    status: 'queued',
    agentId: null,
    input: (() => {
      const rawInput = typeof stage.input === 'object' && stage.input !== null
        ? stage.input as Record<string, unknown>
        : {};
      if (nodeType === 'approval') {
        return {
          approvalCriteria: typeof rawInput.approvalCriteria === 'string' && rawInput.approvalCriteria.trim()
            ? rawInput.approvalCriteria.trim().slice(0, 2_000)
            : '确认所有直接上游结果满足任务目标和验收标准。',
        };
      }
      const executionMode = ['analyze', 'implement', 'review'].includes(String(rawInput.executionMode))
        ? String(rawInput.executionMode)
        : index === 0 ? 'analyze' : index === rawStages.length - 1 ? 'review' : 'implement';
      return {
        ...rawInput,
        executionMode,
        inputContract: typeof rawInput.inputContract === 'string' ? rawInput.inputContract.slice(0, 4_000) : '',
        outputContract: typeof rawInput.outputContract === 'string' ? rawInput.outputContract.slice(0, 4_000) : '',
      };
    })(),
    output: null,
    attemptNo: 1,
    attemptCreatedAt: now,
    createdAt: now,
    updatedAt: now,
  }; });
  const finalTask = [...stages].reverse().find((stage) => stage.nodeType === 'task');
  if (!finalTask) return null;
  const rawEdges = Array.isArray(parsed.edges) ? parsed.edges as Array<Record<string, unknown>> : [];
  const edges = rawEdges.flatMap((edge) => {
    const source = externalIds.get(String(edge.source ?? edge.sourceStageId ?? ''));
    const target = externalIds.get(String(edge.target ?? edge.targetStageId ?? ''));
    return source && target ? [{
      id: makeId('EDGE'), missionId: mission.id, sourceStageId: source, targetStageId: target, createdAt: now,
    }] : [];
  });
  const normalizedEdges = edges.length || rawEdges.length ? edges : linearEdges(mission.id, stages, now);
  const acceptanceCriteria = Array.isArray(parsed.acceptanceCriteria)
    ? parsed.acceptanceCriteria.filter((item): item is string => typeof item === 'string').slice(0, 12)
    : [];
  return {
    spec: {
      objective: typeof parsed.objective === 'string' ? parsed.objective : mission.title,
      acceptanceCriteria,
      risks: Array.isArray(parsed.risks) ? parsed.risks.filter((item): item is string => typeof item === 'string').slice(0, 8) : [],
      source: 'pinme-llm',
    },
    stages,
    edges: normalizedEdges,
  };
}

export function matchCandidates(
  mission: Mission,
  stages: WorkflowStage[],
  agents: Agent[],
  loadMultiplierByAgent = new Map<string, number>(),
): CandidateMatch[] {
  const activeAgents = agents.filter((agent) => agent.status === 'active');
  const missionTags = mission.tags.map(normalize);
  return stages.filter((stage) => stage.nodeType === 'task').map((stage) => {
    const stageCategory = normalize(stage.category);
    const ranked = activeAgents.map((agent) => {
      const agentTags = agent.tags.map(normalize);
      const exactCategory = normalize(agent.category) === stageCategory;
      const fuzzyCategory = normalize(agent.category).includes(stageCategory) || stageCategory.includes(normalize(agent.category));
      const tagHits = missionTags.filter((tag) => agentTags.some((agentTag) => agentTag.includes(tag) || tag.includes(agentTag))).length;
      const categoryScore = exactCategory ? 35 : fuzzyCategory ? 24 : 4;
      const tagScore = Math.min(25, tagHits * 8);
      const reputation = agent.quality?.reputation;
      const trustScore = Math.min(20, reputation === undefined ? agent.trustScore * 2 : reputation / 5);
      const qualityScore = Math.min(10, agent.quality ? agent.quality.breakdown.quality / 3 : agent.successRate / 10);
      const quote = quoteStage(mission, stage, agent, loadMultiplierByAgent.get(agent.id) ?? 1);
      const hasComparableReferencePrice = quote.comparableToBasePrice;
      const priceScore = hasComparableReferencePrice
        ? quote.amount <= stage.budget ? 10 : Math.max(0, 10 - ((quote.amount - stage.budget) / Math.max(stage.budget, 1)) * 10)
        : 5;
      const fairness = stableNoise(`${mission.id}:${stage.id}:${agent.id}`) * 2;
      const exposureAdjustment = agent.quality?.newAgent ? -6 : agent.quality?.premium ? 2 : 0;
      const score = Number(Math.max(0, Math.min(100, categoryScore + tagScore + trustScore + qualityScore + priceScore + fairness + exposureAdjustment)).toFixed(1));
      const reasons = [
        exactCategory ? '专业分类完全匹配' : fuzzyCategory ? '专业分类相近' : '具备跨领域执行能力',
        tagHits ? `命中 ${tagHits} 个任务标签` : '依据历史质量进入候选池',
        agent.quality
          ? `信誉 ${agent.quality.reputation.toFixed(1)} · ${agent.quality.confidence === 'low' ? '低' : agent.quality.confidence === 'medium' ? '中' : '高'}置信度`
          : `信任分 ${agent.trustScore.toFixed(1)} · 成功率 ${agent.successRate.toFixed(1)}%`,
        hasComparableReferencePrice
          ? quote.amount <= stage.budget ? `动态报价 ${quote.amount} 处于阶段预算内` : `动态报价 ${quote.amount} 高于阶段预算`
          : 'sETH 任务不与法币参考价直接比较',
        agent.quality?.newAgent ? '新 Agent 低置信度限量曝光' : agent.quality?.premium ? '高质量历史获得稳定曝光' : '使用标准公平曝光权重',
      ];
      return { agent, score, reasons, quote };
    }).sort((left, right) => {
      const leftOverBudget = left.quote.comparableToBasePrice && left.quote.amount > stage.budget;
      const rightOverBudget = right.quote.comparableToBasePrice && right.quote.amount > stage.budget;
      if (leftOverBudget !== rightOverBudget) return leftOverBudget ? 1 : -1;
      return right.score - left.score || left.agent.id.localeCompare(right.agent.id);
    });
    return { stageId: stage.id, stageName: stage.name, candidates: ranked.slice(0, 5) };
  });
}

export function fallbackTrialScore(agent: Agent): number {
  let score = 5;
  if (agent.summary.length >= 40) score += 1;
  if (agent.tags.length >= 2) score += 0.7;
  if (agent.endpoint.startsWith('https://')) score += 1;
  if (Object.keys(agent.inputSchema).length > 0) score += 0.7;
  if (Object.keys(agent.outputSchema).length > 0) score += 0.7;
  if (agent.wallet.length >= 10) score += 0.4;
  return Number(Math.min(9.2, score).toFixed(1));
}

export function parseTrialScore(content: string): { score: number; summary: string } | null {
  try {
    const value = JSON.parse(content) as { score?: unknown; summary?: unknown };
    const score = Number(value.score);
    if (!Number.isFinite(score) || score < 0 || score > 10) return null;
    return {
      score: Number(score.toFixed(1)),
      summary: typeof value.summary === 'string' ? value.summary.slice(0, 600) : 'AI 试炼完成。',
    };
  } catch {
    return null;
  }
}
