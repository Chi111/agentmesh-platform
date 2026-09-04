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
