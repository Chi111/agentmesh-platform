import type { Mission, WorkflowEdge, WorkflowStage } from './contracts';
import { MATCHING_POLICY, type MatchPlan, type MatchOption, type MatchPreference, type TaskProfile } from '../../shared/matching';

interface Scheduled { stageId: string; option: MatchOption; start: number; end: number }
function earliestSlot(rows: Scheduled[], option: MatchOption, earliest: number): number {
  const relevant = rows.filter((row) => row.option.agentId === option.agentId || row.option.pool === option.pool);
  const limits = relevant.filter((row) => row.option.pool === option.pool).map((row) => row.option.poolConcurrency);
  const poolLimit = Math.min(option.poolConcurrency, ...limits);
  const starts = [...new Set([earliest, ...relevant.map((row) => row.end).filter((end) => end >= earliest)])].sort((a, b) => a - b);
  for (const start of starts) {
    const end = start + option.durationSeconds;
    const points = [start, ...relevant.map((row) => row.start).filter((point) => point > start && point < end)];
    if (points.every((point) => {
      const active = relevant.filter((row) => row.start <= point && row.end > point);
      return active.filter((row) => row.option.agentId === option.agentId).length < option.concurrency
        && active.filter((row) => row.option.pool === option.pool).length < poolLimit;
    })) return start;
  }
  return Math.max(earliest, ...relevant.map((row) => row.end));
}

export function allocateWorkflow(input: {
  mission: Mission; stages: WorkflowStage[]; edges: WorkflowEdge[]; candidates: Record<string, MatchOption[]>;
  profiles: Record<string, TaskProfile>; excluded: MatchPlan['excluded']; snapshotHash: string; now: string;
  preference?: MatchPreference; lockedAssignments?: Record<string, string>; beamWidth?: number;
}): MatchPlan {
  const { mission, stages, edges, profiles } = input;
  const preference = input.preference ?? 'balanced';
  const locked = input.lockedAssignments ?? {};
  const warnings: string[] = [];
  const taskStages = stages.filter((stage) => stage.nodeType === 'task');
  const candidates = Object.fromEntries(taskStages.map((stage) => [stage.id,
    input.candidates[stage.id]?.filter((option) => !locked[stage.id] || option.agentId === locked[stage.id]) ?? [],
  ]));
  // Graph validation occurs at the API boundary. This also guards cycles in direct callers.
  const remaining = new Map(stages.map((stage) => [stage.id, stage]));
  const order: WorkflowStage[] = [];
  const pathCache=new Map<string,number>();
  const pathLength = (id: string, seen = new Set<string>()): number => {
    if(pathCache.has(id)) return pathCache.get(id)!;
    if (seen.has(id)) return Infinity;
    const next = new Set([...seen, id]);
    const length=Math.min(...(candidates[id]?.map((row) => row.durationSeconds) ?? [0]))
      + Math.max(0, ...edges.filter((edge) => edge.sourceStageId === id).map((edge) => pathLength(edge.targetStageId, next)));
    pathCache.set(id,length); return length;
  };
  while (remaining.size) {
    const ready = [...remaining.values()].filter((stage) => !edges.some((edge) => edge.targetStageId === stage.id && remaining.has(edge.sourceStageId)));
    ready.sort((a, b) => pathLength(b.id) - pathLength(a.id) || (candidates[a.id]?.length ?? 0) - (candidates[b.id]?.length ?? 0) || a.id.localeCompare(b.id));
    if (!ready.length) { warnings.push('工作流依赖无效'); break; }
    order.push(ready[0]); remaining.delete(ready[0].id);
  }
  const ancestors = (id: string, found = new Set<string>()): Set<string> => {
    for (const edge of edges.filter((edge) => edge.targetStageId === id)) if (!found.has(edge.sourceStageId)) { found.add(edge.sourceStageId); ancestors(edge.sourceStageId, found); }
    return found;
  };
  const deadline = mission.deadline.includes('T') ? (Date.parse(mission.deadline) - Date.parse(input.now)) / 1000 : null;
  if (deadline === null) warnings.push('截止时间未精确到时区，执行时长仅为估计');
  if (stages.some((stage) => stage.nodeType === 'approval')) warnings.push('包含人工审批，整体完成时间取决于审批等待');
  const referenceTime = Math.max(1, ...Object.values(candidates).flatMap((rows) => rows.map((row) => row.durationSeconds))) * Math.max(1, taskStages.length);
  const weights = preference === 'speed' ? [0.05, 0.5] : preference === 'cost' ? [0.5, 0.05] : [0.15, 0.15];
  const objective = (rows: Scheduled[]) => rows.reduce((sum, row) => sum + row.option.utility, 0) / Math.max(1, taskStages.length)
    - weights[0] * rows.reduce((sum, row) => sum + row.option.quote, 0) / Math.max(0.000001, mission.budget)
    - weights[1] * Math.max(0, ...rows.map((row) => row.end)) / (deadline && deadline > 0 ? deadline : referenceTime);
  let beam: Array<{ rows: Scheduled[]; ends: Record<string, number> }> = [{ rows: [], ends: {} }];
  for (const stage of order) {
    const expanded: typeof beam = [];
    for (const partial of beam) {
      const earliest = Math.max(0, ...edges.filter((edge) => edge.targetStageId === stage.id).map((edge) => partial.ends[edge.sourceStageId] ?? 0));
      if (stage.nodeType === 'approval') { expanded.push({ rows: partial.rows, ends: { ...partial.ends, [stage.id]: earliest } }); continue; }
      const upstream = ancestors(stage.id);
      for (const option of candidates[stage.id].slice(0, 8)) {
        if (profiles[stage.id]?.independentReview && partial.rows.some((row) => upstream.has(row.stageId) && row.option.ownerId === option.ownerId)) continue;
        const start = earliestSlot(partial.rows, option, earliest);
        const end = start + option.durationSeconds;
        if (deadline !== null && end > deadline) continue;
        if (partial.rows.reduce((sum, row) => sum + row.option.quote, option.quote) > mission.budget + 1e-8) continue;
        expanded.push({ rows: [...partial.rows, { stageId: stage.id, option, start, end }], ends: { ...partial.ends, [stage.id]: end } });
      }
    }
    beam = expanded.sort((a, b) => objective(b.rows) - objective(a.rows)
      || a.rows.map((row) => row.option.agentId).join('|').localeCompare(b.rows.map((row) => row.option.agentId).join('|'))).slice(0, input.beamWidth ?? 16);
    if (!beam.length) break;
  }
  const best = beam.find((item) => item.rows.length === taskStages.length && order.length === stages.length);
  if (!best) warnings.push('有界搜索未找到满足证据、容量、预算和工期的完整方案；可补齐证据、调整约束后重试');
  const rows = best?.rows ?? [];
  if (rows.some((row) => row.option.uncertainty > 0.5)) warnings.push('部分节点同类历史不足，时长采用审核估计');
  return {
    id: `PLAN-${crypto.randomUUID()}`, missionId: mission.id, workflowVersion: mission.workflowVersion,
    policyVersion: MATCHING_POLICY, snapshotHash: input.snapshotHash, preference, lockedAssignments: locked,
    createdAt: input.now, expiresAt: new Date(Date.parse(input.now) + 5 * 60_000).toISOString(),
    status: best ? 'ready' : 'needs_review', profiles, candidates: input.candidates, excluded: input.excluded,
    assignments: rows.map((row) => ({ stageId: row.stageId, agentId: row.option.agentId, startSeconds: row.start, endSeconds: row.end,
      quote: row.option.quote, reasons: row.option.reasons,
      alternatives: candidates[row.stageId].filter((option) => option.agentId !== row.option.agentId).slice(0, 2).map((option) => option.agentId),
    })),
    totalQuote: Number(rows.reduce((sum, row) => sum + row.option.quote, 0).toFixed(6)),
    makespanSeconds: best && !stages.some((stage) => stage.nodeType === 'approval') ? Math.max(0, ...rows.map((row) => row.end)) : null,
    warnings,
  };
}
