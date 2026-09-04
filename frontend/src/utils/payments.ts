import type { PaymentMethod } from '../types/domain';

export const paymentOptions: Array<{
  method: PaymentMethod;
  title: string;
  token: 'CREDIT' | 'mUSDC' | 'sETH';
  detail: string;
}> = [
  { method: 'web2_balance', title: 'Web2 余额', token: 'CREDIT', detail: '先充值体验余额，启动任务时锁定。' },
  { method: 'web3_musdc', title: 'mUSDC', token: 'mUSDC', detail: '使用 Web3 大学 Sepolia 测试币。' },
  { method: 'web3_seth', title: 'Sepolia ETH', token: 'sETH', detail: '使用测试网原生 ETH 直接托管。' },
];

export function isWeb3Payment(method: PaymentMethod): method is Extract<PaymentMethod, 'web3_musdc' | 'web3_seth'> {
  return method !== 'web2_balance';
}

export function paymentToken(method: PaymentMethod) {
  return paymentOptions.find((option) => option.method === method)?.token ?? 'CREDIT';
}

export function formatPaymentAmount(amount: number, method: PaymentMethod) {
  const digits = method === 'web3_seth' ? 6 : 2;
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits })} ${paymentToken(method)}`;
}

export function paymentInput(method: PaymentMethod) {
  return method === 'web3_seth'
    ? { min: 0.000002, step: 0.000001, suggested: 0.01 }
    : { min: 1, step: 1, suggested: method === 'web3_musdc' ? 80 : 80 };
}
