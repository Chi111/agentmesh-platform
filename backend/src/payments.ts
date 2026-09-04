import type { PaymentMethod } from './contracts';

export type Web3PaymentMethod = Extract<PaymentMethod, 'web3_musdc' | 'web3_seth'>;
export type PaymentToken = 'CREDIT' | 'mUSDC' | 'sETH';

export const TEST_TOPUP_AMOUNT = 100;

// Public Sepolia infrastructure identifiers for the deployed AgentMesh test project.
// Environment bindings can override or disable these defaults without handling secrets.
export const AGENTMESH_TESTNET_SETTLEMENT = {
  projectName: 'agentmesh-platform-74a3',
  rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
  chainId: 11155111,
  escrowAddress: '0xe05a5e46139294402393e5601d771e6c7564a573',
  escrowDeploymentBlock: 11_541_034,
  musdcAddress: '0x38A28074C414F94024bc56AA52641DdEdDf17df7',
  musdcDecimals: 6,
  confirmations: 1,
} as const;

export const PAYMENT_CONFIG: Record<PaymentMethod, {
  token: PaymentToken;
  network: 'agentmesh' | 'sepolia';
  decimals: number;
  web3: boolean;
}> = {
  web2_balance: { token: 'CREDIT', network: 'agentmesh', decimals: 2, web3: false },
  web3_musdc: { token: 'mUSDC', network: 'sepolia', decimals: 6, web3: true },
  web3_seth: { token: 'sETH', network: 'sepolia', decimals: 18, web3: true },
};

export function paymentConfig(method: PaymentMethod) {
  return PAYMENT_CONFIG[method];
}

export function isWeb3Payment(method: PaymentMethod): method is Web3PaymentMethod {
  return PAYMENT_CONFIG[method].web3;
}

export function paymentBudgetPrecision(method: PaymentMethod): number {
  return method === 'web3_seth' ? 6 : 2;
}

export function minimumPaymentAmount(method: PaymentMethod): number {
  return 10 ** -paymentBudgetPrecision(method);
}

export function hasValidPaymentPrecision(amount: number, method: PaymentMethod): boolean {
  const scale = 10 ** paymentBudgetPrecision(method);
  const units = Math.round(amount * scale);
  return Math.abs(units / scale - amount) <= Number.EPSILON * Math.max(1, amount) * 8;
}

/** Allocate a rounded total while reserving one billable unit per task. */
export function allocatePaymentBudget(weights: number[], budget: number, method: PaymentMethod): number[] | null {
  if (weights.length === 0) return null;
  const precision = paymentBudgetPrecision(method);
  const scale = 10 ** precision;
  const totalUnits = Math.round(budget * scale);
  if (!hasValidPaymentPrecision(budget, method) || totalUnits < weights.length) return null;
  const normalizedWeights = weights.map((weight) => Number.isFinite(weight) && weight > 0 ? weight : 1);
  const totalWeight = normalizedWeights.reduce((sum, weight) => sum + weight, 0);
  const distributableUnits = totalUnits - weights.length;
  const rawExtras = normalizedWeights.map((weight) => distributableUnits * weight / totalWeight);
  const units = rawExtras.map((value) => Math.floor(value) + 1);
  let remainder = totalUnits - units.reduce((sum, value) => sum + value, 0);
  const remainderOrder = rawExtras
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let index = 0; index < remainder; index += 1) units[remainderOrder[index % remainderOrder.length].index] += 1;
  return units.map((value) => value / scale);
}
