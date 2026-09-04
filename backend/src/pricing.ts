import type { Agent, Mission, PaymentMethod, StageQuote, WorkflowStage } from './contracts';
import { paymentBudgetPrecision, paymentConfig } from './payments';

export const PRICING_FORMULA_VERSION = 'agentmesh.quote.v1';
export const MIN_AGENT_PRICE_USDC = 0.01;

const PRIORITY_MULTIPLIER: Record<Mission['priority'], number> = {
  normal: 1,
  high: 1.15,
  urgent: 1.3,
};

const EXPERTISE_MULTIPLIER: Record<Mission['expertise'], number> = {
  standard: 0.9,
  expert: 1,
  principal: 1.2,
};

const EXECUTION_MULTIPLIER: Record<string, number> = {
  analyze: 1,
  implement: 1.15,
  review: 0.9,
};

function roundedAmount(value: number, paymentMethod: PaymentMethod): number {
  return Number(value.toFixed(paymentBudgetPrecision(paymentMethod)));
}

/**
 * Translate currently active work into a bounded, deterministic utilization
 * factor. A single active assignment is neutral; idle capacity is discounted,
 * and additional concurrent work adds 5% up to the 1.2 cap.
 */
export function loadMultiplierForActiveAssignments(activeAssignments: number): number {
  const normalizedAssignments = Math.max(0, Math.floor(activeAssignments));
  if (normalizedAssignments === 0) return 0.9;
  return Number(Math.min(1.2, 0.95 + normalizedAssignments * 0.05).toFixed(2));
}

/**
 * Produce an explainable pre-funding quote. USDC-denominated base prices are
 * comparable with CREDIT and mUSDC in the current test economy. Native sETH
 * keeps the reviewed stage budget as its quote because no FX oracle exists.
 */
export function quoteStage(
  mission: Mission,
  stage: WorkflowStage,
  agent: Agent,
  loadMultiplier = 1,
): StageQuote {
  const normalizedLoad = Math.max(0.9, Math.min(1.2, loadMultiplier));
  const basePriceUsdc = Math.max(MIN_AGENT_PRICE_USDC, agent.price);
  const executionMode = String(stage.input.executionMode ?? 'analyze');
  const multipliers = {
    complexity: EXECUTION_MULTIPLIER[executionMode] ?? 1,
    urgency: PRIORITY_MULTIPLIER[mission.priority],
    expertise: EXPERTISE_MULTIPLIER[mission.expertise],
    load: Number(normalizedLoad.toFixed(2)),
  };
  const comparable = mission.paymentMethod !== 'web3_seth';
  const amount = comparable
    ? roundedAmount(basePriceUsdc * multipliers.complexity * multipliers.urgency * multipliers.expertise * multipliers.load, mission.paymentMethod)
    : roundedAmount(stage.budget, mission.paymentMethod);
  return {
    amount,
    token: paymentConfig(mission.paymentMethod).token,
    basePriceUsdc,
    agentPriceVersion: agent.priceVersion ?? 1,
    formulaVersion: PRICING_FORMULA_VERSION,
    comparableToBasePrice: comparable,
    multipliers,
  };
}

export function settlementWeight(stage: WorkflowStage, offers: Array<{ stageId: string; quote?: StageQuote }>): number {
  const quoted = offers.find((offer) => offer.stageId === stage.id)?.quote?.amount;
  return Number.isFinite(quoted) && Number(quoted) > 0 ? Number(quoted) : stage.budget;
}
