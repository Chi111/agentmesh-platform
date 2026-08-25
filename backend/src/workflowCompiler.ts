import { END, START, StateGraph, StateSchema } from '@langchain/langgraph/web';
import { z } from 'zod';
import type { Mission, WorkflowStage } from './contracts';
import {
  parseLlmCompilation,
  type WorkflowCompilation,
} from './logic';
import { incomingStageIds, validateWorkflowGraph } from './workflowGraph';

export type WorkflowComplexity = 'simple' | 'moderate' | 'complex';

export interface WorkflowAnalysis {
  complexity: WorkflowComplexity;
  score: number;
  rationale: string;
  recommendedTaskCount: { min: number; max: number };
  workstreams: Array<{ name: string; purpose: string; category: string }>;
  risks: string[];
  requiresApproval: boolean;
  approvalReason: string;
}

export type WorkflowCompilerLlmCaller = (
  messages: Array<{ role: 'system' | 'user'; content: string }>,
) => Promise<{ content?: string; error?: string }>;

export interface WorkflowCompilerMetadata {
  engine: 'langgraph';
  version: 1;
  complexity: WorkflowComplexity;
  complexityScore: number;
  recommendedTaskCount: { min: number; max: number };
  modelCalls: number;
  repairAttempts: number;
  warnings: string[];
  fallbackReason: string | null;
}

export interface WorkflowCompilerResult {
  compilation: WorkflowCompilation;
  source: 'langgraph-planner' | 'adaptive-fallback';
  metadata: WorkflowCompilerMetadata;
}

const TASK_COUNT_RANGES: Record<WorkflowComplexity, { min: number; max: number }> = {
  simple: { min: 2, max: 4 },
  moderate: { min: 4, max: 7 },
  complex: { min: 6, max: 12 },
};

const DOMAIN_TEMPLATES = [
  {
    category: '数据研究',
    terms: ['研究', '调研', '数据', '证据', '竞品', '市场', 'research', 'analysis'],
    name: '证据研究与约束核验',
    purpose: '收集并核验任务所需事实、约束、基线和外部依赖，明确证据质量与未知项。',
  },
  {
    category: '前端工程',
    terms: ['前端', 'react', 'vue', '页面', '交互', 'ui', 'ux', 'frontend'],
    name: '前端与交互实现',
    purpose: '实现用户可见界面、交互状态和前端集成，并产出可验证的构建结果。',
  },
  {
    category: '后端工程',
    terms: ['后端', 'worker', 'api', '接口', '服务', '队列', 'backend'],
    name: '后端服务与接口实现',
    purpose: '实现服务端业务逻辑、接口与外部集成，保留错误处理和验证证据。',
  },
  {
    category: '数据工程',
    terms: ['数据库', 'd1', 'sql', 'schema', '数据模型', '迁移', '存储', 'database'],
    name: '数据模型与迁移实现',
    purpose: '设计数据模型、约束与迁移路径，验证数据完整性和兼容性。',
  },
  {
    category: '安全审查',
    terms: ['安全', '鉴权', '认证', '权限', '密钥', '支付', '钱包', '合约', 'security', 'auth'],
    name: '安全边界与风险审查',
    purpose: '检查认证授权、输入边界、敏感数据和资金相关风险，并提供可执行修复建议。',
  },
  {
    category: '内容生成',
    terms: ['内容', '文案', '报告', '脚本', '写作', 'copywriting', 'report'],
    name: '核心内容与结构化交付',
    purpose: '依据上游事实和约束形成结构清晰、可复核且符合目标受众的核心内容。',
  },
  {
    category: '视觉生成',
    terms: ['视频', '图像', '视觉', '素材', '动画', 'video', 'image', 'design'],
    name: '视觉资产与生成流程',
    purpose: '完成视觉方案、素材生成和一致性检查，输出可直接验收的资产引用。',
  },
  {
    category: '集成工程',
    terms: ['集成', '联调', '全栈', '系统', '平台', '工程', 'mvp', 'integration', 'fullstack'],
    name: '系统集成与接口联调',
    purpose: '整合相互依赖的模块和制品，处理接口契约、兼容性与端到端联调问题。',
  },
  {
    category: '交付工程',
    terms: ['部署', '发布', '上线', '运维', '监控', 'deploy', 'release', 'production'],
    name: '发布准备与运行验证',
    purpose: '完成构建、配置、发布前检查和运行验证，记录回滚条件与残余风险。',
  },
] as const;

const COMPLEXITY_TERMS = [
  '复杂', '大型', '多模块', '多文件', '架构', '重构', '系统', '平台', '工程', 'mvp',
  '全栈', '端到端', '迁移', '上线', 'production', 'architecture', 'multi-module',
];

const APPROVAL_TERMS = [
  '支付', '钱包', '合约', '密钥', '权限', '鉴权', '认证', '隐私', '生产', '上线',
  '迁移', '删除', '退款', '结算', 'security', 'payment', 'wallet', 'production',
];

const GENERIC_WORKSTREAMS: WorkflowAnalysis['workstreams'] = [
  {
    category: '方案设计',
    name: '方案设计与关键决策',
    purpose: '形成可执行方案，明确关键决策、接口边界、取舍和验证路径。',
  },
  {
    category: '核心执行',
    name: '核心实现与证据记录',
    purpose: '完成任务的核心生产或实现，持续记录变更、证据和未决问题。',
  },
  {
    category: '质量验证',
    name: '独立验证与缺陷检查',
    purpose: '依据验收标准执行独立检查，识别缺陷、回归风险和证据缺口。',
  },
  {
    category: '交付整合',
    name: '依赖整合与交付准备',
    purpose: '整合上游结果和制品，解决依赖冲突并准备可验收交付包。',
  },
  {
    category: '风险分析',
    name: '边界条件与失败模式分析',
    purpose: '检查边界条件、失败模式、兼容性和恢复策略，形成剩余风险清单。',
  },
  {
    category: '验收设计',
    name: '验收用例与验证基线',
    purpose: '把目标转化为可执行验收用例、通过条件和可复核的验证基线。',
  },
  {
    category: '文档交付',
    name: '交付说明与使用指引',
    purpose: '整理操作说明、已知限制、验证结果和后续行动，降低交付使用成本。',
  },
];

function missionText(mission: Mission): string {
  return [mission.title, mission.description, mission.category, ...mission.tags].join('\n').toLocaleLowerCase();
}

function rankComplexity(value: WorkflowComplexity): number {
  return value === 'simple' ? 0 : value === 'moderate' ? 1 : 2;
}

function complexityForScore(score: number): WorkflowComplexity {
  return score <= 3 ? 'simple' : score <= 6 ? 'moderate' : 'complex';
}

function distinctWorkstreams(text: string): WorkflowAnalysis['workstreams'] {
  return DOMAIN_TEMPLATES
    .filter((template) => template.terms.some((term) => text.includes(term)))
    .map(({ name, purpose, category }) => ({ name, purpose, category }));
}

export function estimateWorkflowAnalysis(mission: Mission): WorkflowAnalysis {
  const text = missionText(mission);
  const workstreams = distinctWorkstreams(text);
  let score = 1;
  if (mission.description.length >= 220) score += 1;
  if (mission.description.length >= 800) score += 1;
  if (mission.expertise === 'expert') score += 1;
  if (mission.expertise === 'principal') score += 2;
  if (mission.priority === 'high') score += 1;
  if (mission.priority === 'urgent') score += 2;
  if (mission.tags.length >= 4) score += 1;
  if (workstreams.length >= 3) score += 1;
  if (workstreams.length >= 5) score += 1;
  if (COMPLEXITY_TERMS.some((term) => text.includes(term))) score += 2;
  if (APPROVAL_TERMS.some((term) => text.includes(term))) score += 1;
  score = Math.max(1, Math.min(10, score));
  const complexity = complexityForScore(score);
  const requiresApproval = complexity !== 'simple' && (
    mission.priority === 'urgent' || APPROVAL_TERMS.some((term) => text.includes(term))
  );
  return {
    complexity,
    score,
    rationale: `根据任务长度、专业等级、优先级、领域跨度和风险关键词评估为${complexity}。`,
    recommendedTaskCount: TASK_COUNT_RANGES[complexity],
    workstreams,
    risks: requiresApproval ? ['存在高风险变更或发布边界，需要任务方在汇合后确认。'] : [],
    requiresApproval,
    approvalReason: requiresApproval ? '高风险变更在进入最终交付前需要人工确认。' : '',
  };
}

function targetTaskCount(analysis: WorkflowAnalysis): number {
  if (analysis.complexity === 'simple') return analysis.score >= 3 ? 3 : 2;
  if (analysis.complexity === 'moderate') {
    return Math.min(7, 4 + Math.min(2, Math.max(0, analysis.workstreams.length - 2)) + (analysis.score >= 6 ? 1 : 0));
  }
  return Math.min(12, 6 + Math.min(4, Math.max(0, analysis.workstreams.length - 3)) + (analysis.score >= 9 ? 1 : 0));
}

function fallbackWorkstreams(analysis: WorkflowAnalysis, count: number): WorkflowAnalysis['workstreams'] {
  return [...analysis.workstreams, ...GENERIC_WORKSTREAMS]
    .filter((item, index, rows) => rows.findIndex((candidate) => candidate.name === item.name) === index)
    .slice(0, count);
}

export function adaptiveFallbackCompilation(
  mission: Mission,
  analysis = estimateWorkflowAnalysis(mission),
): WorkflowCompilation {
  const taskCount = targetTaskCount(analysis);
  const nodes: Array<Record<string, unknown>> = [];
  const edges: Array<{ source: string; target: string }> = [];
  const addTask = (input: {
    id: string;
    name: string;
    purpose: string;
    category: string;
    budget: number;
    executionMode: 'analyze' | 'implement' | 'review';
    positionX: number;
    positionY: number;
    inputContract: string;
    outputContract: string;
  }) => {
    nodes.push({
      id: input.id,
      nodeType: 'task',
      name: input.name,
      purpose: input.purpose,
      category: input.category,
      budget: input.budget,
      positionX: input.positionX,
      positionY: input.positionY,
      input: {
        executionMode: input.executionMode,
        inputContract: input.inputContract,
        outputContract: input.outputContract,
      },
    });
  };
  addTask({
    id: 'scope',
    name: '目标拆解与验收建模',
    purpose: `把“${mission.title}”拆解为可执行范围、约束、依赖和验收标准。`,
    category: '需求分析',
    budget: 0.8,
    executionMode: 'analyze',
    positionX: 80,
    positionY: 220,
    inputContract: '原始任务目标、描述、预算、期限、专业等级和已知约束',
    outputContract: '范围说明、验收标准、依赖清单、风险与标准交接摘要',
  });

  if (taskCount === 2) {
    addTask({
      id: 'delivery',
      name: '核心执行与验收交付',
      purpose: `完成${mission.category}的核心工作，验证结果并形成可直接验收的最终交付。`,
      category: mission.category,
      budget: 2.2,
      executionMode: 'implement',
      positionX: 460,
      positionY: 220,
      inputContract: '范围说明、验收标准与任务方提供的原始资料',
      outputContract: '最终交付、验证结果、风险说明和制品引用',
    });
    edges.push({ source: 'scope', target: 'delivery' });
  } else if (analysis.complexity === 'simple') {
    const [stream] = fallbackWorkstreams(analysis, 1);
    addTask({
      id: 'core',
      name: stream.name,
      purpose: stream.purpose,
      category: stream.category,
      budget: 1.8,
      executionMode: 'implement',
      positionX: 440,
      positionY: 220,
      inputContract: '已确认的范围、验收标准和必要原始资料',
      outputContract: '核心结果、执行证据、风险和制品引用',
    });
    addTask({
      id: 'review',
      name: '质量检查与最终交付',
      purpose: '复核核心结果与验收标准的一致性，修正明显缺口并生成最终交付包。',
      category: '质量验证',
      budget: 1.2,
      executionMode: 'review',
      positionX: 800,
      positionY: 220,
      inputContract: '核心结果、执行证据和任务验收标准',
      outputContract: '最终交付、逐项验收结果、剩余风险和制品引用',
    });
    edges.push({ source: 'scope', target: 'core' }, { source: 'core', target: 'review' });
  } else {
    const hasIntegrationTask = analysis.complexity === 'complex';
    const branchCount = taskCount - (hasIntegrationTask ? 3 : 2);
    const streams = fallbackWorkstreams(analysis, branchCount);
    const spacing = 190;
    const firstY = 220 - ((streams.length - 1) * spacing) / 2;
    streams.forEach((stream, index) => {
      const id = `workstream-${index + 1}`;
      addTask({
        id,
        name: stream.name,
        purpose: stream.purpose,
        category: stream.category,
        budget: 1.5,
        executionMode: stream.category.includes('研究') || stream.category.includes('分析') ? 'analyze' : 'implement',
        positionX: 440,
        positionY: firstY + index * spacing,
        inputContract: '统一范围、验收标准、直接相关资料和必要的上游制品引用',
        outputContract: '该工作流的结构化结果、验证证据、风险和制品引用',
      });
      edges.push({ source: 'scope', target: id });
    });

    let joinSourceIds = streams.map((_, index) => `workstream-${index + 1}`);
    if (hasIntegrationTask) {
      addTask({
        id: 'integration',
        name: '并行结果集成与联调',
        purpose: '汇合各独立工作流结果，处理接口、依赖和冲突，形成完整候选交付。',
        category: '集成工程',
        budget: 1.4,
        executionMode: 'implement',
        positionX: 800,
        positionY: 220,
        inputContract: '所有直接上游工作流的交接摘要、验证证据和制品引用',
        outputContract: '集成候选交付、联调结果、变更摘要、风险和制品引用',
      });
      joinSourceIds.forEach((source) => edges.push({ source, target: 'integration' }));
      joinSourceIds = ['integration'];
    }

    let reviewPredecessors = joinSourceIds;
    if (analysis.requiresApproval) {
      nodes.push({
        id: 'approval',
        nodeType: 'approval',
        name: '任务方关键结果审批',
        purpose: analysis.approvalReason || '确认关键结果和风险满足进入最终交付的条件。',
        category: '人工审批',
        budget: 0,
        positionX: hasIntegrationTask ? 1_120 : 800,
        positionY: 220,
        input: {
          approvalCriteria: '直接上游结果完整、关键风险已披露、验证证据可复核，并满足任务方定义的验收边界。',
        },
      });
      joinSourceIds.forEach((source) => edges.push({ source, target: 'approval' }));
      reviewPredecessors = ['approval'];
    }

    addTask({
      id: 'review',
      name: '独立复核与最终交付',
      purpose: '对集成结果执行独立质量检查和验收复核，形成可直接验收的最终交付包。',
      category: '质量验证',
      budget: 1.4,
      executionMode: 'review',
      positionX: analysis.requiresApproval ? (hasIntegrationTask ? 1_440 : 1_120) : (hasIntegrationTask ? 1_120 : 800),
      positionY: 220,
      inputContract: '所有汇合结果、审批结论、验收标准、验证证据和制品引用',
      outputContract: '最终交付、逐项验收结果、变更与验证统计、剩余风险和制品引用',
    });
    reviewPredecessors.forEach((source) => edges.push({ source, target: 'review' }));
  }

  const parsed = parseLlmCompilation(JSON.stringify({
    objective: mission.title,
    acceptanceCriteria: [
      '工作流输出覆盖任务目标和明确约束',
      '每个任务节点提供结构化交接摘要、验证证据和制品引用',
      '并行结果在最终交付前完成汇合与一致性检查',
      '最终交付可由任务方依据验收标准独立复核',
    ],
    risks: analysis.risks,
    nodes,
    edges,
  }), mission);
  if (!parsed) throw new Error('Adaptive workflow fallback could not be normalized');
  parsed.stages = validateWorkflowGraph({ mission, stages: parsed.stages, edges: parsed.edges });
  parsed.spec = {
    ...parsed.spec,
    source: 'adaptive-fallback',
    complexity: analysis.complexity,
    complexityScore: analysis.score,
  };
  return parsed;
}

function jsonObjectContent(content: string): string | null {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : null;
}

function stringList(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim().slice(0, 500)).slice(0, limit)
    : [];
}

function parseAnalysis(content: string, local: WorkflowAnalysis): WorkflowAnalysis | null {
  const json = jsonObjectContent(content);
  if (!json) return null;
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
  const rawScore = Number(value.score);
  const score = Number.isFinite(rawScore) ? Math.max(local.score, Math.min(10, Math.max(1, rawScore))) : local.score;
  const rawComplexity = ['simple', 'moderate', 'complex'].includes(String(value.complexity))
    ? String(value.complexity) as WorkflowComplexity
    : complexityForScore(score);
  const scoreComplexity = complexityForScore(score);
  const complexity = [local.complexity, rawComplexity, scoreComplexity]
    .sort((left, right) => rankComplexity(right) - rankComplexity(left))[0];
  const normalizedScore = Math.max(score, complexity === 'complex' ? 7 : complexity === 'moderate' ? 4 : 1);
  const rawWorkstreams = Array.isArray(value.workstreams)
    ? value.workstreams.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Record<string, unknown>;
      const name = typeof row.name === 'string' ? row.name.trim().slice(0, 120) : '';
      const purpose = typeof row.purpose === 'string' ? row.purpose.trim().slice(0, 600) : '';
      const category = typeof row.category === 'string' ? row.category.trim().slice(0, 80) : '';
      return name && purpose && category ? [{ name, purpose, category }] : [];
    }).slice(0, 10)
    : [];
  const mergedWorkstreams = [...rawWorkstreams, ...local.workstreams].filter((item, index, rows) => (
    rows.findIndex((candidate) => candidate.category === item.category || candidate.name === item.name) === index
  ));
  const requiresApproval = local.requiresApproval || value.requiresApproval === true;
  return {
    complexity,
    score: normalizedScore,
    rationale: typeof value.rationale === 'string' && value.rationale.trim()
      ? value.rationale.trim().slice(0, 1_000)
      : local.rationale,
    recommendedTaskCount: TASK_COUNT_RANGES[complexity],
    workstreams: mergedWorkstreams,
    risks: [...stringList(value.risks, 8), ...local.risks].filter((item, index, rows) => rows.indexOf(item) === index).slice(0, 8),
    requiresApproval,
    approvalReason: requiresApproval
      ? typeof value.approvalReason === 'string' && value.approvalReason.trim()
        ? value.approvalReason.trim().slice(0, 1_000)
        : local.approvalReason || '关键结果在最终交付前需要任务方确认。'
      : '',
  };
}

function missionContext(mission: Mission): Record<string, unknown> {
  return {
    title: mission.title,
    description: mission.description,
    category: mission.category,
    tags: mission.tags,
    budget: mission.budget,
    paymentMethod: mission.paymentMethod,
    deadline: mission.deadline,
    priority: mission.priority,
    expertise: mission.expertise,
  };
}

function analysisPrompt(mission: Mission, local: WorkflowAnalysis): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content: 'You are the analysis node of a workflow compiler. Return one JSON object only. Assess actual execution complexity instead of defaulting to three stages. Required keys: complexity (simple|moderate|complex), score (1-10), rationale, workstreams (array of name, purpose, category), risks (string array), requiresApproval (boolean), approvalReason. Identify independently executable workstreams for parallel DAG branches. Do not choose or mention Agents.',
    },
    {
      role: 'user',
      content: JSON.stringify({ mission: missionContext(mission), deterministicBaseline: local }),
    },
  ];
}

function planningPrompt(mission: Mission, analysis: WorkflowAnalysis): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content: `You are the planning node of a DAG workflow compiler. Return one JSON object only with objective, acceptanceCriteria, risks, nodes, and edges. Use ${analysis.recommendedTaskCount.min}-${analysis.recommendedTaskCount.max} task nodes because this mission is ${analysis.complexity}; do not default to three. Add at most two approval nodes, with zero budget, only when analysis requires them. Give every node a unique stable short id. Task nodes require nodeType="task", name, purpose, category, positive relative budget, positionX, positionY, and input with executionMode (analyze|implement|review), non-empty inputContract and outputContract. Approval nodes require nodeType="approval", name, purpose, category, positionX, positionY, and non-empty input.approvalCriteria. Edges use source and target ids. Express independent workstreams as fan-out branches and join them before integration or review. The graph must be weakly connected, acyclic, and have no duplicate edges. Include at least one final review task for moderate or complex work. Never assign an Agent.`,
    },
    {
      role: 'user',
      content: JSON.stringify({ mission: missionContext(mission), analysis }),
    },
  ];
}

function repairPrompt(
  mission: Mission,
  analysis: WorkflowAnalysis,
  candidate: string,
  validationErrors: string[],
): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content: 'You are the repair node of a DAG workflow compiler. Return the complete corrected workflow JSON object only. Fix every listed validation error while preserving useful mission-specific detail. Do not assign Agents. Do not add cycles, disconnected nodes, duplicate edges, or budget to approval nodes.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        mission: missionContext(mission),
        analysis,
        validationErrors,
        candidate: candidate.slice(0, 24_000),
      }),
    },
  ];
}

async function safeCall(
  caller: WorkflowCompilerLlmCaller,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
): Promise<{ content?: string; error?: string }> {
  try {
    return await caller(messages);
  } catch {
    return { error: 'LLM invocation failed' };
  }
}

function candidateQualityErrors(compilation: WorkflowCompilation, analysis: WorkflowAnalysis): string[] {
  const errors: string[] = [];
  const tasks = compilation.stages.filter((stage) => stage.nodeType === 'task');
  const approvals = compilation.stages.filter((stage) => stage.nodeType === 'approval');
  if (tasks.length < analysis.recommendedTaskCount.min || tasks.length > analysis.recommendedTaskCount.max) {
    errors.push(`Task node count ${tasks.length} must be within ${analysis.recommendedTaskCount.min}-${analysis.recommendedTaskCount.max} for ${analysis.complexity} work.`);
  }
  const names = new Set(tasks.map((stage) => stage.name.trim().toLocaleLowerCase()));
  if (names.size !== tasks.length) errors.push('Task node names must be distinct and mission-specific.');
  const missingContract = tasks.find((stage) => (
    typeof stage.input.inputContract !== 'string' || !stage.input.inputContract.trim()
    || typeof stage.input.outputContract !== 'string' || !stage.input.outputContract.trim()
  ));
  if (missingContract) errors.push(`Task node ${missingContract.name} requires non-empty inputContract and outputContract.`);
  if (analysis.complexity !== 'simple' && !tasks.some((stage) => stage.input.executionMode === 'review')) {
    errors.push('Moderate and complex workflows require a final review task.');
  }
  if (analysis.requiresApproval && approvals.length === 0) {
    errors.push('This high-risk workflow requires an approval node after its upstream work is complete.');
  }
  if (analysis.complexity !== 'simple' && analysis.workstreams.length >= 2) {
    const outgoingCounts = new Map(compilation.stages.map((stage) => [stage.id, 0]));
    for (const edge of compilation.edges) outgoingCounts.set(edge.sourceStageId, (outgoingCounts.get(edge.sourceStageId) ?? 0) + 1);
    const hasFanOut = [...outgoingCounts.values()].some((count) => count > 1);
    const hasJoin = compilation.stages.some((stage) => incomingStageIds(stage.id, compilation.edges).length > 1);
    if (!hasFanOut || !hasJoin) errors.push('Independent workstreams must be represented as fan-out branches that join before final delivery.');
  }
  return errors;
}

function validateCandidate(
  content: string | undefined,
  mission: Mission,
  analysis: WorkflowAnalysis,
): { compilation?: WorkflowCompilation; errors: string[] } {
  const json = content ? jsonObjectContent(content) : null;
  if (!json) return { errors: ['The planner did not return a JSON workflow object.'] };
  const compilation = parseLlmCompilation(json, mission);
  if (!compilation) return { errors: ['The planner JSON is missing valid nodes or exceeds platform limits.'] };
  try {
    compilation.stages = validateWorkflowGraph({ mission, stages: compilation.stages, edges: compilation.edges });
  } catch (error) {
    return { errors: [error instanceof Error ? error.message.slice(0, 500) : 'Workflow graph validation failed.'] };
  }
  const errors = candidateQualityErrors(compilation, analysis);
  return errors.length ? { errors } : { compilation, errors: [] };
}

const CompilerState = new StateSchema({
  analysis: z.custom<WorkflowAnalysis>().optional(),
  candidate: z.string().optional(),
  compilation: z.custom<WorkflowCompilation>().optional(),
  validationErrors: z.array(z.string()).default(() => []),
  warnings: z.array(z.string()).default(() => []),
  modelCalls: z.number().int().nonnegative().default(0),
  repairAttempts: z.number().int().nonnegative().default(0),
  source: z.enum(['langgraph-planner', 'adaptive-fallback']).optional(),
  fallbackReason: z.string().nullable().default(null),
});

export async function compileWorkflowWithLangGraph(
  mission: Mission,
  caller: WorkflowCompilerLlmCaller,
): Promise<WorkflowCompilerResult> {
  const localAnalysis = estimateWorkflowAnalysis(mission);
  const graph = new StateGraph(CompilerState)
    .addNode('analyze', async (state) => {
      const result = await safeCall(caller, analysisPrompt(mission, localAnalysis));
      const parsed = result.content ? parseAnalysis(result.content, localAnalysis) : null;
      return {
        analysis: parsed ?? localAnalysis,
        modelCalls: state.modelCalls + 1,
        warnings: parsed
          ? state.warnings
          : [...state.warnings, 'Complexity analysis was unavailable or invalid; deterministic analysis was used.'],
      };
    })
    .addNode('plan', async (state) => {
      const analysis = state.analysis ?? localAnalysis;
      const result = await safeCall(caller, planningPrompt(mission, analysis));
      return {
        candidate: result.content,
        modelCalls: state.modelCalls + 1,
        warnings: result.content
          ? state.warnings
          : [...state.warnings, 'Workflow planning returned no usable content.'],
      };
    })
    .addNode('validate', (state) => {
      const checked = validateCandidate(state.candidate, mission, state.analysis ?? localAnalysis);
      return { compilation: checked.compilation, validationErrors: checked.errors };
    })
    .addNode('repair', async (state) => {
      const result = await safeCall(caller, repairPrompt(
        mission,
        state.analysis ?? localAnalysis,
        state.candidate ?? '',
        state.validationErrors,
      ));
      return {
        candidate: result.content ?? state.candidate,
        modelCalls: state.modelCalls + 1,
        repairAttempts: state.repairAttempts + 1,
        warnings: result.content
          ? state.warnings
          : [...state.warnings, 'Workflow repair returned no usable content.'],
      };
    })
    .addNode('fallback', (state) => {
      const analysis = state.analysis ?? localAnalysis;
      const reason = state.validationErrors.join(' ').slice(0, 1_000) || 'AI workflow compilation did not produce a valid graph.';
      return {
        compilation: adaptiveFallbackCompilation(mission, analysis),
        source: 'adaptive-fallback' as const,
        fallbackReason: reason,
        warnings: [...state.warnings, reason].filter((item, index, rows) => rows.indexOf(item) === index),
      };
    })
    .addEdge(START, 'analyze')
    .addEdge('analyze', 'plan')
    .addEdge('plan', 'validate')
    .addConditionalEdges('validate', (state) => {
      if (state.compilation) return 'done';
      return state.candidate && state.repairAttempts < 1 ? 'repair' : 'fallback';
    }, { repair: 'repair', fallback: 'fallback', done: END })
    .addEdge('repair', 'validate')
    .addEdge('fallback', END)
    .compile({ name: 'agentmesh-workflow-compiler' });

  let state: typeof CompilerState.State;
  try {
    state = await graph.invoke({});
  } catch {
    const reason = 'LangGraph execution failed before a valid workflow was produced.';
    state = {
      analysis: localAnalysis,
      compilation: adaptiveFallbackCompilation(mission, localAnalysis),
      validationErrors: [reason],
      warnings: [reason],
      modelCalls: 0,
      repairAttempts: 0,
      source: 'adaptive-fallback',
      fallbackReason: reason,
    };
  }

  const analysis = state.analysis ?? localAnalysis;
  const source = state.source ?? (state.compilation ? 'langgraph-planner' : 'adaptive-fallback');
  const fallbackReason = source === 'adaptive-fallback'
    ? state.fallbackReason ?? (state.validationErrors.join(' ').slice(0, 1_000) || 'Workflow compilation failed.')
    : null;
  const compilation = state.compilation ?? adaptiveFallbackCompilation(mission, analysis);
  const metadata: WorkflowCompilerMetadata = {
    engine: 'langgraph',
    version: 1,
    complexity: analysis.complexity,
    complexityScore: analysis.score,
    recommendedTaskCount: analysis.recommendedTaskCount,
    modelCalls: state.modelCalls,
    repairAttempts: state.repairAttempts,
    warnings: state.warnings.slice(0, 8),
    fallbackReason,
  };
  compilation.spec = {
    ...compilation.spec,
    source,
    compiler: metadata,
  };
  return { compilation, source, metadata };
}

export function workflowHasParallelism(stages: WorkflowStage[], compilation: WorkflowCompilation): boolean {
  const outgoing = new Map(stages.map((stage) => [stage.id, 0]));
  for (const edge of compilation.edges) outgoing.set(edge.sourceStageId, (outgoing.get(edge.sourceStageId) ?? 0) + 1);
  return [...outgoing.values()].some((count) => count > 1)
    && stages.some((stage) => incomingStageIds(stage.id, compilation.edges).length > 1);
}
