import type { Agent, Mission, WorkflowStage } from './contracts';
import type { MatchingData, MatchOption, TaskProfile } from '../../shared/matching';
import { parseRequiredCapabilities, meetsRequiredCapabilities } from '../../shared/agentRequirements';
import { quoteStage } from './pricing';

const strings = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim().toLowerCase()) : [];
// The compiler's structured node category is the family. Never inherit mission tags.
export function taskProfile(stage: WorkflowStage): TaskProfile {
  const input = stage.input ?? {};
  const family = stage.category.trim().toLowerCase();
  const capabilities = parseRequiredCapabilities(input.requiredCapabilities);
  const mode = ['analyze', 'implement', 'review'].includes(String(input.executionMode)) ? input.executionMode as TaskProfile['mode'] : 'analyze';
  const unknowns: string[] = [];
  if (input.executionMode!==undefined && !['analyze','implement','review'].includes(String(input.executionMode))) unknowns.push('执行模式无效');
  if (!family) unknowns.push('缺少节点任务类型');
  if (capabilities === null) unknowns.push('必需能力格式无效');
  // Text contracts cannot be treated as machine-verified schema compatibility.
  for (const side of ['input', 'output']) {
    if (input[`${side}Contract`] && !input[`${side}Type`]) unknowns.push(`${side === 'input' ? '输入' : '输出'}契约尚未指定可验证类型`);
  }
  if (input.requiredTools !== undefined && (!Array.isArray(input.requiredTools) || strings(input.requiredTools).length !== (input.requiredTools as unknown[]).length)) unknowns.push('工具要求格式无效');
  if (input.riskTier !== undefined && !['normal', 'high'].includes(String(input.riskTier))) unknowns.push('风险级别无效');
  return {
    version: 1, family, mode, objective: `${stage.name}\n${stage.purpose}`,
    acceptance: strings(input.acceptanceCriteria), capabilities: capabilities ?? [], tools: strings(input.requiredTools),
    inputType: typeof input.inputType === 'string' && input.inputType.trim() ? input.inputType.trim().toLowerCase() : null,
    outputType: typeof input.outputType === 'string' && input.outputType.trim() ? input.outputType.trim().toLowerCase() : null,
    independentReview: input.independentReview === true, risk: input.riskTier === 'high' ? 'high' : 'normal', unknowns,
  };
}

export function rankEvidenceCandidates(
  mission: Mission, stage: WorkflowStage, agents: Agent[], data: MatchingData,
  load: Map<string, number>, now: string,
): { profile: TaskProfile; options: MatchOption[]; excluded: Array<{ agentId: string; reasons: string[] }> } {
  const profile = taskProfile(stage);
  const excluded: Array<{ agentId: string; reasons: string[] }> = [];
  const options: MatchOption[] = [];
  for (const agent of agents) {
    const reasons = [...profile.unknowns];
    if(!meetsRequiredCapabilities(agent,stage.input.requiredCapabilities)) reasons.push('未声明必需能力');
    if (agent.status !== 'active') reasons.push('Agent 未启用');
    // Shadow scores never authorize automated assignment.
    if (!agent.quality?.wouldBeEligible) reasons.push('市场验证门槛未通过');
    const resource = data.profiles.find((row) => row.agentId === agent.id && row.agentVersion === agent.version);
    if (!resource) reasons.push('尚未声明当前版本容量');
    const evidence = data.evidence.filter((row) => row.agentId === agent.id && row.agentVersion === agent.version
      && row.family === profile.family && row.mode === profile.mode && Date.parse(row.expiresAt) > Date.parse(now)
      && Date.parse(row.verifiedAt) <= Date.parse(now));
    const compatible = evidence.filter((row) => profile.capabilities.every((value) => row.capabilities.includes(value))
      && profile.tools.every((value) => row.tools.includes(value))
      && (!profile.inputType || row.inputTypes.includes(profile.inputType))
      && (!profile.outputType || row.outputTypes.includes(profile.outputType)));
    if (!compatible.length) reasons.push('缺少同任务类型、执行模式和契约的有效验证证据');
    if (profile.risk === 'high' && !profile.acceptance.length) reasons.push('高风险节点缺少明确验收标准');
    const quote = quoteStage(mission, stage, agent, load.get(agent.id) ?? 1);
    if (quote.comparableToBasePrice && quote.amount > stage.budget) reasons.push('动态报价超过节点预算');
    if (data.leases.some((lease) => lease.agentId === agent.id && lease.status !== 'released')) reasons.push('存在未结束执行，结束时间尚未确认');
    if((data.commitments??[]).some((row)=>row.missionId!==mission.id && (row.agentId===agent.id || (resource && data.profiles.some((p)=>p.agentId===row.agentId && p.pool===resource.pool && agents.find((a)=>a.id===p.agentId)?.ownerId===agent.ownerId))))) reasons.push('已有其他任务的接单承诺，需完成后重新匹配');
    if (resource && data.leases.some((lease) => lease.pool === `${agent.ownerId}:${resource.pool}` && lease.status !== 'released')) reasons.push('共享资源池有未结束执行，需完成后重新匹配');
    if (reasons.length || !resource || !compatible.length) { excluded.push({ agentId: agent.id, reasons }); continue; }
    const records = data.outcomes.filter((row) => row.agentId === agent.id && row.agentVersion === agent.version && row.family === profile.family && row.mode === profile.mode);
    const successes = records.filter((row) => row.success).length;
    const reliability = (successes + 2) / (records.length + 4); // explicit weak Beta(2,2) prior, not displayed as probability
    const quality = records.length ? records.reduce((sum, row) => sum + row.quality, 0) / records.length : 0.5;
    const best = [...compatible].sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt) || a.id.localeCompare(b.id))[0];
    const uncertainty = records.length >= 20 ? 0.15 : records.length >= 5 ? 0.4 : 0.8;
    const fit = best.quality / 100;
    const handoff = profile.inputType && profile.outputType ? 1 : 0.5;
    const utility = 0.35 * fit + 0.30 * quality + 0.25 * reliability + 0.10 * handoff - 0.15 * uncertainty;
    const durations = records.flatMap((row) => row.durationSeconds && row.durationSeconds > 0 ? [row.durationSeconds] : []).sort((a, b) => a - b);
    // Never pretend endpoint response latency is execution duration; sparse data uses reviewed estimates.
    const durationSeconds = durations.length >= 20 ? Math.max(best.durationSeconds, durations[Math.ceil(durations.length * 0.9) - 1]) : best.durationSeconds;
    options.push({
      agentId: agent.id, ownerId: agent.ownerId, utility, score: Math.round(utility * 1000) / 10, quote: quote.amount,
      durationSeconds, durationSource: durations.length >= 20 ? 'observed' : 'reviewed-estimate',
      evidenceIds: compatible.map((row) => row.id).sort(), sampleCount: records.length, uncertainty,
      reasons: [`同类 ${profile.family} / ${profile.mode} 验证证据 ${compatible.length} 条`,
        `当前版本同类履约 ${records.length} 次，成功 ${successes} 次`,
        `预计执行 ${Math.ceil(durationSeconds / 60)} 分钟（${durations.length >= 20 ? '历史与审核估计的保守值' : '审核估计，样本不足'}）`,
        `报价 ${quote.amount} ${quote.token}`, `不确定性${uncertainty > 0.5 ? '较高' : '中低'}；匹配分不是成功率`],
      pool: `${agent.ownerId}:${resource.pool}`, concurrency: resource.maxConcurrency, poolConcurrency: resource.poolConcurrency,
    });
  }
  return { profile, options: options.sort((a, b) => b.utility - a.utility || a.agentId.localeCompare(b.agentId)), excluded };
}


/** Model output affects relevance only. It can neither add eligibility nor invent evidence. */
export function applySemanticAssessment(
  options: Record<string, MatchOption[]>, content: string,
): number {
  let parsed: { assessments?: unknown };
  try { parsed = JSON.parse(content); } catch { return 0; }
  if (!Array.isArray(parsed.assessments)) return 0;
  let applied = 0;
  const seen = new Set<string>();
  for (const row of parsed.assessments) {
    if (!row || typeof row !== 'object' || typeof row.stageId !== 'string' || typeof row.agentId !== 'string'
      || !Number.isFinite(row.fit) || row.fit < 0 || row.fit > 1 || !Array.isArray(row.evidenceIds) || !row.evidenceIds.length) continue;
    const option = options[row.stageId]?.find((item) => item.agentId === row.agentId);
    const key = `${row.stageId}:${row.agentId}`;
    if (!option || seen.has(key) || row.evidenceIds.some((id: unknown) => typeof id !== 'string' || !option.evidenceIds.includes(id))) continue;
    seen.add(key);
    option.utility += 0.15 * (row.fit - 0.5);
    option.score = Math.round(option.utility * 1000) / 10;
    option.reasons.push(`目标与验收语义适配 ${Math.round(row.fit * 100)} / 100（辅助判断，非能力认证）`);
    applied += 1;
  }
  Object.values(options).forEach((rows) => rows.sort((a,b) => b.utility-a.utility || a.agentId.localeCompare(b.agentId)));
  return applied;
}
