import type {
  Agent,
  AgentMetricEvent,
  AgentMarketplaceStatus,
  AgentQualityBreakdown,
  AgentQualityGateMode,
  AgentQualityStats,
} from './contracts';

export const AGENT_QUALITY_FORMULA_VERSION = 'agentmesh-quality-v1';
const DECAY_HALF_LIFE_DAYS = 60;
const HEALTH_WINDOW_MS = 24 * 60 * 60 * 1_000;

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Number(value.toFixed(1));
}

function validDate(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function decayWeight(event: AgentMetricEvent, evaluatedAtMs: number): number {
  if (event.severity === 'severe') return event.weight;
  const ageDays = Math.max(0, evaluatedAtMs - validDate(event.occurredAt)) / 86_400_000;
  return event.weight * (0.5 ** (ageDays / DECAY_HALF_LIFE_DAYS));
}

function weightedAverage(rows: Array<{ value: number; weight: number }>, fallback: number): number {
  const denominator = rows.reduce((sum, row) => sum + row.weight, 0);
  if (denominator <= 0) return fallback;
  return rows.reduce((sum, row) => sum + clamp(row.value) * row.weight, 0) / denominator;
}

function weightedQualitySources(sources: Array<{ sourceWeight: number; rows: Array<{ value: number; weight: number }> }>): number {
  const available = sources.filter((source) => source.rows.length > 0);
  const denominator = available.reduce((sum, source) => sum + source.sourceWeight, 0);
  if (denominator <= 0) return 50;
  return available.reduce((sum, source) => (
    sum + weightedAverage(source.rows, 50) * source.sourceWeight
  ), 0) / denominator;
}

function latestOf(events: AgentMetricEvent[], types: AgentMetricEvent['type'][]): AgentMetricEvent | null {
  return events
    .filter((event) => types.includes(event.type))
    .sort((left, right) => validDate(right.occurredAt) - validDate(left.occurredAt) || right.id.localeCompare(left.id))[0] ?? null;
}

function payoutValid(agent: Agent): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(agent.wallet);
}

function lifecycleStatus(
  previous: AgentMarketplaceStatus,
  reputation: number,
  trialPassed: boolean,
  endpointHealthy: boolean,
  validPayout: boolean,
  unresolvedSevereRisks: number,
  recentOutcomes: AgentMetricEvent[],
): AgentMarketplaceStatus {
  if (previous === 'retired') return 'retired';
  if (unresolvedSevereRisks > 0 || reputation < 50) return 'suspended';
  const recoveryReady = reputation >= 75
    && trialPassed
    && endpointHealthy
    && validPayout
    && recentOutcomes.length >= 3
    && recentOutcomes.slice(0, 3).every((event) => event.type === 'mission_settled_success');
  if (previous === 'suspended' && !recoveryReady) return 'suspended';
  if (!trialPassed) return previous === 'listed' || previous === 'degraded' ? 'degraded' : previous === 'registered' || previous === 'verifying' ? previous : 'trial';
  if (!endpointHealthy || !validPayout) return previous === 'listed' || previous === 'degraded' ? 'degraded' : 'trial';
  if (previous === 'listed' && reputation >= 65) return 'listed';
  if (reputation >= 75) return 'listed';
  if (reputation < 65 || previous === 'degraded' || previous === 'suspended') return 'degraded';
  return 'trial';
}

export function feedbackWeightForPriorCount(priorFeedbackCount: number): number {
  const normalized = Math.max(0, Math.floor(priorFeedbackCount));
  return Number(Math.max(0.25, 1 / Math.sqrt(normalized + 1)).toFixed(4));
}

export function qualityGateMode(value: string | undefined): AgentQualityGateMode {
  return value?.trim().toLocaleLowerCase() === 'enforce' ? 'enforce' : 'shadow';
}

export function calculateAgentQuality(
  agent: Agent,
  inputEvents: AgentMetricEvent[],
  evaluatedAt: string,
  previousStatus: AgentMarketplaceStatus = 'registered',
): AgentQualityStats {
  const evaluatedAtMs = Date.parse(evaluatedAt);
  if (!Number.isFinite(evaluatedAtMs)) throw new Error('evaluatedAt must be a valid ISO timestamp');
  const orderedEvents = inputEvents
    .filter((event) => validDate(event.occurredAt) <= evaluatedAtMs)
    .sort((left, right) => validDate(left.occurredAt) - validDate(right.occurredAt) || left.id.localeCompare(right.id));
  const latestFeedbackBySource = new Map<string, AgentMetricEvent>();
  for (const event of orderedEvents) {
    if (event.type === 'feedback_received') latestFeedbackBySource.set(event.sourceId, event);
  }
  const events = orderedEvents.filter((event) => event.type !== 'feedback_received' || latestFeedbackBySource.get(event.sourceId)?.id === event.id);
  const weighted = events.map((event) => ({ event, weight: decayWeight(event, evaluatedAtMs) }));
  const outcomes = events.filter((event) => ['mission_settled_success', 'mission_failed', 'mission_timeout', 'mission_refunded'].includes(event.type));
  const recentOutcomes = [...outcomes].sort((left, right) => validDate(right.occurredAt) - validDate(left.occurredAt) || right.id.localeCompare(left.id));
  const successfulJobs = outcomes.filter((event) => event.type === 'mission_settled_success').length;
  const failedJobs = outcomes.filter((event) => event.type === 'mission_failed' || event.type === 'mission_timeout').length;
  const refundedJobs = outcomes.filter((event) => event.type === 'mission_refunded').length;
  const settledJobs = successfulJobs + failedJobs + refundedJobs;

  const reliabilityRows = weighted.flatMap(({ event, weight }) => {
    if (event.type === 'mission_settled_success') return [{ value: 100, weight }];
    if (['mission_failed', 'mission_timeout', 'mission_refunded'].includes(event.type)) return [{ value: 0, weight }];
    if (event.type === 'trial_passed') return [{ value: event.value, weight: weight * 5 }];
    if (event.type === 'trial_failed') return [{ value: 0, weight: weight * 5 }];
    return [];
  });
  const reliabilitySuccess = reliabilityRows.reduce((sum, row) => sum + (row.value / 100) * row.weight, 0);
  const reliabilityWeight = reliabilityRows.reduce((sum, row) => sum + row.weight, 0);
  const reliability = (reliabilitySuccess + 5) / (reliabilityWeight + 10);

  const trialQualityRows = weighted.flatMap(({ event, weight }) => {
    if (event.type === 'trial_passed') return [{ value: event.value, weight }];
    if (event.type === 'trial_failed') return [{ value: 0, weight }];
    return [];
  });
  const acceptanceQualityRows = weighted.flatMap(({ event, weight }) => {
    if (event.type === 'mission_settled_success') return [{ value: event.value || 100, weight }];
    if (['mission_failed', 'mission_refunded', 'dispute_lost'].includes(event.type)) return [{ value: 0, weight }];
    return [];
  });
  const artifactQualityRows = weighted.flatMap(({ event, weight }) => {
    if (event.type === 'artifact_verified') return [{ value: event.value || 100, weight }];
    if (event.type === 'artifact_invalid') return [{ value: 0, weight }];
    return [];
  });
  const feedbackQualityRows = weighted.flatMap(({ event, weight }) => (
    event.type === 'feedback_received' ? [{ value: event.value, weight }] : []
  ));
  const quality = weightedQualitySources([
    { sourceWeight: 0.40, rows: trialQualityRows },
    { sourceWeight: 0.25, rows: acceptanceQualityRows },
    { sourceWeight: 0.20, rows: artifactQualityRows },
    { sourceWeight: 0.15, rows: feedbackQualityRows },
  ]) / 100;

  const delivery = weightedAverage(weighted.flatMap(({ event, weight }) => {
    if (event.type === 'artifact_verified') return [{ value: event.value || 100, weight }];
    if (event.type === 'artifact_invalid') return [{ value: 0, weight }];
    if (event.type === 'trial_passed') return [{ value: event.value, weight }];
    return [];
  }), 50) / 100;

  const response = weightedAverage(weighted.flatMap(({ event, weight }) => {
    if (event.type === 'endpoint_healthy') return [{ value: event.value, weight }];
    if (event.type === 'endpoint_unreachable') return [{ value: 0, weight }];
    return [];
  }), 50) / 100;
  const history = Math.min(1, Math.log1p(settledJobs) / Math.log1p(20));
  let unresolvedSevereRisks = 0;
  for (const event of events) {
    if (event.type === 'security_incident' && event.severity === 'severe') unresolvedSevereRisks += 1;
    if (event.type === 'security_resolved') unresolvedSevereRisks = Math.max(0, unresolvedSevereRisks - 1);
  }
  const riskPenalty = clamp(weighted.reduce((penalty, { event, weight }) => {
    if (event.type === 'mission_refunded') return penalty + 8 * weight;
    if (event.type === 'dispute_lost') return penalty + 10 * weight;
    if (event.type === 'artifact_invalid') return penalty + 5 * weight;
    if (event.type === 'mission_timeout') return penalty + 4 * weight;
    if (event.type === 'security_incident' && event.severity !== 'severe') return penalty + 15 * weight;
    if (event.type === 'admin_adjustment') return penalty - event.value * weight;
    return penalty;
  }, unresolvedSevereRisks * 50), -20, 100);
  const breakdown: AgentQualityBreakdown = {
    reliability: round(35 * reliability),
    quality: round(30 * quality),
    delivery: round(15 * delivery),
    response: round(10 * response),
    history: round(10 * history),
    riskPenalty: round(riskPenalty),
  };
  const reputation = round(clamp(
    breakdown.reliability + breakdown.quality + breakdown.delivery + breakdown.response + breakdown.history - breakdown.riskPenalty,
  ));

  const latestTrial = latestOf(events, ['trial_passed', 'trial_failed']);
  const latestHealth = latestOf(events, ['endpoint_healthy', 'endpoint_unreachable']);
  const trialPassed = latestTrial?.type === 'trial_passed';
  const endpointHealthy = latestHealth?.type === 'endpoint_healthy'
    && evaluatedAtMs - validDate(latestHealth.occurredAt) <= HEALTH_WINDOW_MS;
  const validPayout = payoutValid(agent);
  const marketplaceStatus = lifecycleStatus(previousStatus, reputation, trialPassed, endpointHealthy, validPayout, unresolvedSevereRisks, recentOutcomes);
  const reasons: string[] = [];
  if (agent.status !== 'active') reasons.push('Agent 尚未启用接单');
  if (!trialPassed) reasons.push('正式 Trial 尚未通过');
  if (!endpointHealthy) reasons.push('Endpoint 最近 24 小时无健康记录');
  if (!validPayout) reasons.push('结算钱包无效');
  if (unresolvedSevereRisks > 0) reasons.push('存在未解决的严重风险事件');
  if (reputation < 75) reasons.push(`信誉分 ${reputation} 低于 75`);
  if (marketplaceStatus === 'suspended' || marketplaceStatus === 'retired') reasons.push(`市场状态为 ${marketplaceStatus}`);

  return {
    agentId: agent.id,
    marketplaceStatus,
    reputation,
    breakdown,
    confidence: settledJobs < 5 ? 'low' : settledJobs < 20 ? 'medium' : 'high',
    settledJobs,
    successfulJobs,
    failedJobs,
    refundedJobs,
    trialPassed,
    endpointHealthy,
    payoutValid: validPayout,
    unresolvedSevereRisks,
    premium: reputation >= 88 && settledJobs >= 20,
    newAgent: settledJobs < 5,
    eligibilityReasons: reasons,
    formulaVersion: AGENT_QUALITY_FORMULA_VERSION,
    lastTrialAt: latestTrial?.occurredAt ?? null,
    lastHealthCheckAt: latestHealth?.occurredAt ?? null,
    updatedAt: evaluatedAt,
  };
}

export function isAgentMarketEligible(
  agent: Agent,
  stats: AgentQualityStats | null,
  mode: AgentQualityGateMode,
): { eligible: boolean; wouldBeEligible: boolean; reasons: string[] } {
  const reasons = stats?.eligibilityReasons ?? ['尚未建立市场质量档案'];
  const wouldBeEligible = Boolean(stats)
    && stats.marketplaceStatus === 'listed'
    && stats.reputation >= 75
    && stats.trialPassed
    && stats.endpointHealthy
    && stats.payoutValid
    && stats.unresolvedSevereRisks === 0
    && agent.status === 'active';
  return {
    eligible: mode === 'shadow' ? agent.status === 'active' : wouldBeEligible,
    wouldBeEligible,
    reasons: wouldBeEligible ? [] : reasons,
  };
}
