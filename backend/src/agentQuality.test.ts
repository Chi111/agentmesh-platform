import { describe, expect, it } from 'vitest';
import type { Agent, AgentMetricEvent } from './contracts';
import { calculateAgentQuality, feedbackWeightForPriorCount, isAgentMarketEligible, qualityGateMode } from './agentQuality';

const agent: Agent = {
  id: 'quality-agent', ownerId: 'developer', name: 'Quality Agent', category: '软件开发', summary: 'Structured engineering agent.',
  tags: ['typescript'], endpoint: 'https://agent.test.invalid', authType: 'bearer', inputSchema: {}, outputSchema: {}, price: 20,
  wallet: '0x2200000000000000000000000000000000009a11', status: 'active', version: '1.0.0', trustScore: 0,
  successRate: 0, responseTime: '待测试', jobs: 0, volume: 0, author: 'Developer', official: false,
  createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
};

function event(id: string, type: AgentMetricEvent['type'], value: number, occurredAt = '2026-08-23T00:00:00.000Z', severity: AgentMetricEvent['severity'] = 'info'): AgentMetricEvent {
  return { id, idempotencyKey: id, agentId: agent.id, type, value, weight: 1, severity, sourceType: 'trial', sourceId: id, detail: {}, occurredAt, createdAt: occurredAt };
}

describe('agent quality policy', () => {
  it('rejects an invalid evaluation timestamp instead of making recomputation nondeterministic', () => {
    expect(() => calculateAgentQuality(agent, [], 'not-a-timestamp')).toThrow('evaluatedAt must be a valid ISO timestamp');
  });

  it('is deterministic and lists a strong freshly-trialed Agent while keeping low confidence', () => {
    const events = [event('trial', 'trial_passed', 96), event('health', 'endpoint_healthy', 98)];
    const first = calculateAgentQuality(agent, events, '2026-08-23T01:00:00.000Z', 'trial');
    const second = calculateAgentQuality(agent, [...events].reverse(), '2026-08-23T01:00:00.000Z', 'trial');
    expect(second).toEqual(first);
    expect(first.reputation).toBeGreaterThanOrEqual(75);
    expect(first.marketplaceStatus).toBe('listed');
    expect(first.confidence).toBe('low');
    expect(isAgentMarketEligible(agent, first, 'enforce').eligible).toBe(true);
  });

  it('keeps legacy active Agents visible in shadow but fails closed in enforce', () => {
    expect(isAgentMarketEligible(agent, null, 'shadow')).toMatchObject({ eligible: true, wouldBeEligible: false });
    expect(isAgentMarketEligible(agent, null, 'enforce')).toMatchObject({ eligible: false, wouldBeEligible: false });
    expect(qualityGateMode('unexpected')).toBe('shadow');
  });

  it('uses hysteresis between list and degradation thresholds', () => {
    const events = [
      event('trial', 'trial_passed', 100),
      event('health', 'endpoint_healthy', 100),
      event('adjustment', 'admin_adjustment', -10),
    ];
    const listed = calculateAgentQuality(agent, events, '2026-08-23T01:00:00.000Z', 'listed');
    const cold = calculateAgentQuality(agent, events, '2026-08-23T01:00:00.000Z', 'trial');
    expect(listed.reputation).toBeGreaterThanOrEqual(65);
    expect(listed.reputation).toBeLessThan(75);
    expect(listed.marketplaceStatus).toBe('listed');
    expect(cold.marketplaceStatus).toBe('trial');
  });

  it('progressively reduces repeated feedback influence without reaching zero', () => {
    expect(feedbackWeightForPriorCount(0)).toBe(1);
    expect(feedbackWeightForPriorCount(1)).toBeCloseTo(0.7071);
    expect(feedbackWeightForPriorCount(15)).toBe(0.25);
    expect(feedbackWeightForPriorCount(100)).toBe(0.25);
  });

  it('suspends severe incidents and only recovers after resolution plus three recent successes', () => {
    const base = [
      event('trial', 'trial_passed', 100), event('health', 'endpoint_healthy', 100),
      event('success-1', 'mission_settled_success', 100), event('success-2', 'mission_settled_success', 100),
      event('success-3', 'mission_settled_success', 100), event('incident', 'security_incident', 100, '2026-08-23T00:10:00.000Z', 'severe'),
    ];
    const suspended = calculateAgentQuality(agent, base, '2026-08-23T01:00:00.000Z', 'listed');
    expect(suspended.marketplaceStatus).toBe('suspended');
    const recovered = calculateAgentQuality(agent, [...base, event('resolved', 'security_resolved', 100, '2026-08-23T00:20:00.000Z')], '2026-08-23T01:00:00.000Z', 'suspended');
    expect(recovered.unresolvedSevereRisks).toBe(0);
    expect(recovered.marketplaceStatus).toBe('listed');
  });

  it('applies time decay and confidence thresholds from settled work only', () => {
    const oldFailure = event('old-failure', 'mission_refunded', 0, '2026-04-23T00:00:00.000Z');
    const recent = Array.from({ length: 5 }, (_, index) => event(`success-${index}`, 'mission_settled_success', 100, `2026-08-${String(18 + index).padStart(2, '0')}T00:00:00.000Z`));
    const stats = calculateAgentQuality(agent, [event('trial', 'trial_passed', 95), event('health', 'endpoint_healthy', 95), oldFailure, ...recent], '2026-08-23T01:00:00.000Z', 'listed');
    expect(stats.confidence).toBe('medium');
    expect(stats.refundedJobs).toBe(1);
    expect(stats.reputation).toBeGreaterThan(70);
  });

  it('does not let one hostile feedback item erase a mature Agent history', () => {
    const settled = Array.from({ length: 20 }, (_, index) => event(`mature-success-${index}`, 'mission_settled_success', 100));
    const stats = calculateAgentQuality(agent, [
      event('mature-trial', 'trial_passed', 98),
      event('mature-health', 'endpoint_healthy', 98),
      ...settled,
      event('single-hostile-feedback', 'feedback_received', 0),
    ], '2026-08-23T01:00:00.000Z', 'listed');
    expect(stats).toMatchObject({ marketplaceStatus: 'listed', confidence: 'high', premium: true });
    expect(stats.reputation).toBeGreaterThanOrEqual(88);
  });

  it('combines available quality evidence using the fixed 40/25/20/15 source weights', () => {
    const stats = calculateAgentQuality(agent, [
      event('weighted-trial', 'trial_passed', 100),
      event('weighted-health', 'endpoint_healthy', 100),
      event('weighted-success', 'mission_settled_success', 100),
      event('weighted-artifact', 'artifact_invalid', 0),
      event('weighted-feedback', 'feedback_received', 0),
    ], '2026-08-23T01:00:00.000Z', 'listed');
    expect(stats.breakdown.quality).toBe(19.5);
  });

  it('degrades an Agent after repeated failed work even when its Trial was strong', () => {
    const failures = Array.from({ length: 8 }, (_, index) => event(`failed-work-${index}`, 'mission_failed', 0));
    const stats = calculateAgentQuality(agent, [
      event('failure-trial', 'trial_passed', 98),
      event('failure-health', 'endpoint_healthy', 98),
      ...failures,
    ], '2026-08-23T01:00:00.000Z', 'listed');
    expect(stats.marketplaceStatus).toBe('degraded');
    expect(stats.reputation).toBeLessThan(65);
  });
});
