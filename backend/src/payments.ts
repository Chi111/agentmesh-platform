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
