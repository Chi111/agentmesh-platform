import type { Agent, CandidateMatch, Mission, UserContext, WorkflowStage } from './contracts';
import { paymentBudgetPrecision } from './payments';

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

export function fallbackCompilation(mission: Mission): { spec: Record<string, unknown>; stages: WorkflowStage[] } {
  const now = new Date().toISOString();
  const categories = mission.category.includes('视频')
    ? ['内容生成', '图像生成', '视频生成']
    : mission.category.includes('研究') || mission.category.includes('分析')
      ? ['数据研究', '商业分析', '内容生成']
      : [mission.category, '质量验证', '交付整合'];
  const names = mission.category.includes('视频')
    ? ['叙事策略与脚本', '视觉设定与素材', '生成合成与质检']
    : ['目标澄清与资料采集', '核心执行与交叉验证', '交付整合与质量检查'];
  const weights = [0.2, 0.35, 0.45];
  const precision = paymentBudgetPrecision(mission.paymentMethod);
  const stages = names.map<WorkflowStage>((name, index) => ({
    id: makeId('STAGE'),
    missionId: mission.id,
    position: index + 1,
    name,
    purpose: index === 0
      ? `把“${mission.title}”整理为结构化输入和验收标准。`
      : index === 1
        ? `完成${mission.category}的核心生产，并持续记录可验证证据。`
        : '汇总上游输出，执行质量校验并生成最终交付包。',
    category: categories[index],
    budget: Number((mission.budget * weights[index]).toFixed(precision)),
    status: 'queued',
    agentId: null,
    input: { missionId: mission.id, dependsOn: index === 0 ? [] : [index] },
    output: null,
    createdAt: now,
    updatedAt: now,
  }));
  const allocated = stages.reduce((sum, stage) => sum + stage.budget, 0);
  stages[stages.length - 1].budget = Number((stages[stages.length - 1].budget + mission.budget - allocated).toFixed(precision));
  return {
    spec: {
      objective: mission.title,
      acceptanceCriteria: [
        '交付物与任务描述一致',
        '每个阶段保留执行证据与内容哈希',
        '最终交付可由任务方独立验收',
      ],
      constraints: {
        budget: mission.budget,
        deadline: mission.deadline,
        expertise: mission.expertise,
      },
      source: 'deterministic-fallback',
    },
    stages,
  };
}

type LlmCompilation = {
  objective?: unknown;
  acceptanceCriteria?: unknown;
  risks?: unknown;
  stages?: unknown;
};

export function parseLlmCompilation(content: string, mission: Mission): { spec: Record<string, unknown>; stages: WorkflowStage[] } | null {
  let parsed: LlmCompilation;
  try {
    parsed = JSON.parse(content) as LlmCompilation;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed.stages) || parsed.stages.length < 1 || parsed.stages.length > 8) return null;
  const now = new Date().toISOString();
  const rawStages = parsed.stages as Array<Record<string, unknown>>;
  const requestedBudgets = rawStages.map((stage) => {
    const value = Number(stage.budget ?? 0);
    return Number.isFinite(value) && value > 0 ? value : mission.budget / rawStages.length;
  });
  const requestedTotal = requestedBudgets.reduce((sum, value) => sum + value, 0) || 1;
  const precision = paymentBudgetPrecision(mission.paymentMethod);
  const stages: WorkflowStage[] = rawStages.map((stage, index) => ({
    id: makeId('STAGE'),
    missionId: mission.id,
    position: index + 1,
    name: typeof stage.name === 'string' && stage.name.trim() ? stage.name.trim().slice(0, 120) : `执行阶段 ${index + 1}`,
    purpose: typeof stage.purpose === 'string' ? stage.purpose.trim().slice(0, 600) : '',
    category: typeof stage.category === 'string' && stage.category.trim() ? stage.category.trim().slice(0, 80) : mission.category,
    budget: Number((mission.budget * (requestedBudgets[index] / requestedTotal)).toFixed(precision)),
    status: 'queued',
    agentId: null,
    input: typeof stage.input === 'object' && stage.input !== null ? stage.input as Record<string, unknown> : {},
    output: null,
    createdAt: now,
    updatedAt: now,
  }));
  const allocated = stages.reduce((sum, stage) => sum + stage.budget, 0);
  stages[stages.length - 1].budget = Number((stages[stages.length - 1].budget + mission.budget - allocated).toFixed(precision));
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
  };
}

export function matchCandidates(mission: Mission, stages: WorkflowStage[], agents: Agent[]): CandidateMatch[] {
  const activeAgents = agents.filter((agent) => agent.status === 'active');
  const missionTags = mission.tags.map(normalize);
  return stages.map((stage) => {
    const stageCategory = normalize(stage.category);
    const ranked = activeAgents.map((agent) => {
      const agentTags = agent.tags.map(normalize);
      const exactCategory = normalize(agent.category) === stageCategory;
      const fuzzyCategory = normalize(agent.category).includes(stageCategory) || stageCategory.includes(normalize(agent.category));
      const tagHits = missionTags.filter((tag) => agentTags.some((agentTag) => agentTag.includes(tag) || tag.includes(agentTag))).length;
      const categoryScore = exactCategory ? 35 : fuzzyCategory ? 24 : 4;
      const tagScore = Math.min(25, tagHits * 8);
      const trustScore = Math.min(20, agent.trustScore * 2);
      const qualityScore = Math.min(10, agent.successRate / 10);
      const hasComparableReferencePrice = mission.paymentMethod !== 'web3_seth';
      const priceScore = hasComparableReferencePrice
        ? agent.price <= stage.budget ? 10 : Math.max(0, 10 - ((agent.price - stage.budget) / Math.max(stage.budget, 1)) * 10)
        : 5;
      const fairness = stableNoise(`${mission.id}:${stage.id}:${agent.id}`) * 2;
      const score = Number(Math.min(100, categoryScore + tagScore + trustScore + qualityScore + priceScore + fairness).toFixed(1));
      const reasons = [
        exactCategory ? '专业分类完全匹配' : fuzzyCategory ? '专业分类相近' : '具备跨领域执行能力',
        tagHits ? `命中 ${tagHits} 个任务标签` : '依据历史质量进入候选池',
        `信任分 ${agent.trustScore.toFixed(1)} · 成功率 ${agent.successRate.toFixed(1)}%`,
        hasComparableReferencePrice
          ? agent.price <= stage.budget ? '报价处于阶段预算内' : '报价高于阶段预算'
          : 'sETH 任务不与法币参考价直接比较',
      ];
      return { agent, score, reasons };
    }).sort((left, right) => right.score - left.score || left.agent.id.localeCompare(right.agent.id));
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
