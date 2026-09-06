import { matchCandidates } from './logic';
import { describe, expect, it } from 'vitest';
import type { Agent, Mission, WorkflowStage } from './contracts';
import { loadMultiplierForActiveAssignments, PRICING_FORMULA_VERSION, quoteStage, settlementWeight } from './pricing';

const mission = {
  id: 'TASK-price', requesterId: 'requester', title: 'Pricing', description: 'A priced task', category: '软件开发', tags: [],
  budget: 100, paymentMethod: 'web2_balance', deadline: '2026-10-01', priority: 'high', expertise: 'principal',
  yieldEnabled: false, status: 'draft', progress: 0, currentStage: '', team: [], compiledSpec: null, workflowVersion: 1,
  workflowViewport: { x: 0, y: 0, zoom: 1 }, reviewDueAt: null, pausedAt: null, pausedBy: null, pauseReason: null,
  pauseMode: null, schedulerRevision: 0, createdAt: '2026-09-04T00:00:00.000Z', updatedAt: '2026-09-04T00:00:00.000Z',
} satisfies Mission;

const stage = {
  id: 'STAGE-price', missionId: mission.id, position: 1, nodeType: 'task', positionX: 0, positionY: 0, progress: 0,
  name: '实现', purpose: '实现功能', category: '软件开发', budget: 50, status: 'queued', agentId: 'agent-price',
  input: { executionMode: 'implement' }, output: null, attemptNo: 1, attemptCreatedAt: mission.createdAt,
  createdAt: mission.createdAt, updatedAt: mission.updatedAt,
} satisfies WorkflowStage;

const agent = {
  id: 'agent-price', ownerId: 'developer', name: 'Builder', category: '软件开发', summary: 'Builds software reliably.', tags: [],
  endpoint: 'https://agent.example.test', authType: 'none', inputSchema: {}, outputSchema: {}, price: 20, priceVersion: 3,
  wallet: '0x73325bd3e93d9a12e5d2d5219424daf0e55f856d', status: 'active', version: 'v1', trustScore: 9,
  successRate: 95, responseTime: '1s', jobs: 0, volume: 0, author: 'Developer', official: false,
  createdAt: mission.createdAt, updatedAt: mission.updatedAt,
} satisfies Agent;

describe('stage pricing', () => {
  it('creates a transparent quote from the snapshotted Agent price and mission SLA', () => {
    expect(quoteStage(mission, stage, agent)).toEqual({
      amount: 31.74,
      token: 'CREDIT',
      basePriceUsdc: 20,
      agentPriceVersion: 3,
      formulaVersion: PRICING_FORMULA_VERSION,
      comparableToBasePrice: true,
      multipliers: { complexity: 1.15, urgency: 1.15, expertise: 1.2, load: 1 },
    });
  });

  it('uses the reviewed stage budget for native-token quotes without inventing an FX rate', () => {
    const quote = quoteStage({ ...mission, paymentMethod: 'web3_seth' }, { ...stage, budget: 0.01234567 }, agent);
    expect(quote.amount).toBe(0.012346);
    expect(quote.comparableToBasePrice).toBe(false);
    expect(quote.token).toBe('sETH');
  });

  it('uses bounded active-assignment load factors', () => {
    expect(loadMultiplierForActiveAssignments(0)).toBe(0.9);
    expect(loadMultiplierForActiveAssignments(1)).toBe(1);
    expect(loadMultiplierForActiveAssignments(3)).toBe(1.1);
    expect(loadMultiplierForActiveAssignments(99)).toBe(1.2);
    expect(quoteStage(mission, stage, agent, loadMultiplierForActiveAssignments(3)).multipliers.load).toBe(1.1);
  });

  it('normalizes legacy zero base prices to the minimum billable amount', () => {
    const quote = quoteStage(
      { ...mission, priority: 'normal', expertise: 'expert' },
      { ...stage, input: { executionMode: 'analyze' } },
      { ...agent, price: 0 },
      1,
    );
    expect(quote.basePriceUsdc).toBe(0.01);
    expect(quote.amount).toBe(0.01);
  });

  it('falls back to legacy stage weights when a quote snapshot is unavailable', () => {
    expect(settlementWeight(stage, [])).toBe(50);
    expect(settlementWeight(stage, [{ stageId: stage.id, quote: { ...quoteStage(mission, stage, agent), amount: 31.74 } }])).toBe(31.74);
  });
});


describe('candidate eligibility before ranking', () => {
  it('excludes an over-budget high-reputation agent instead of keeping it as fallback', () => {
    const matches = matchCandidates(mission, [stage], [agent, { ...agent, id: 'expensive', price: 1000, trustScore: 10 }]);
    expect(matches[0].candidates.map((candidate) => candidate.agent.id)).toEqual([agent.id]);
    expect(matchCandidates(mission, [stage], [{ ...agent, price: 1000 }])[0].candidates).toEqual([]);
  });

  it('accepts the exact quote boundary and applies the current load factor', () => {
    const pricedStage = { ...stage, budget: quoteStage(mission, stage, agent).amount };
    expect(matchCandidates(mission, [pricedStage], [agent])[0].candidates).toHaveLength(1);
    expect(matchCandidates(mission, [pricedStage], [agent], new Map([[agent.id, 1.2]]))[0].candidates).toEqual([]);
  });

  it('requires every explicit capability, matching whole tags case-insensitively', () => {
    const requiredStage = { ...stage, input: { ...stage.input, requiredCapabilities: [' React ', '软件开发'] } };
    const capable = { ...agent, tags: ['react'] };
    const partial = { ...agent, id: 'partial', tags: ['react-native'] };
    expect(matchCandidates(mission, [requiredStage], [agent, partial, capable])[0].candidates.map((candidate) => candidate.agent.id)).toEqual([agent.id]);
    expect(matchCandidates(mission, [requiredStage], [{ ...capable, status: 'paused' } as Agent])[0].candidates).toEqual([]);
  });

  it('fails closed for malformed capability requirements', () => {
    for (const requiredCapabilities of ['react', [null], [''], Array(21).fill('react'), ['x'.repeat(81)]]) {
      expect(matchCandidates(mission, [{ ...stage, input: { requiredCapabilities } }], [agent])[0].candidates).toEqual([]);
    }
  });

  it('preserves legacy dynamic categories without claiming cross-domain ability', () => {
    const candidates = matchCandidates(mission, [{ ...stage, category: '质量验证' }], [agent])[0].candidates;
    expect(candidates).toHaveLength(1);
    expect(candidates[0].reasons).toContain('分类未匹配，需核实执行能力');
  });

  it('does not compare native-token budgets to USDC base prices', () => {
    const matches = matchCandidates({ ...mission, paymentMethod: 'web3_seth' }, [{ ...stage, budget: 0.001 }], [{ ...agent, price: 1000 }]);
    expect(matches[0].candidates).toHaveLength(1);
    expect(matches[0].candidates[0].quote?.token).toBe('sETH');
  });
});
