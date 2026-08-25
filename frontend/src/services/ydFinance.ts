import {
  createPublicClient,
  defineChain,
  encodeFunctionData,
  formatUnits,
  http,
  isAddress,
  parseAbi,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import type { RewardEpoch } from '../types/domain';
import type { SendTransaction } from './settlement';

const erc20Abi = parseAbi([
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
]);

const distributorAbi = parseAbi([
  'function claim(uint256 epochId,uint256 amount,bytes32[] proof)',
  'function publishEpoch(uint256 epochId,bytes32 merkleRoot,uint256 totalAllocation,uint64 claimEndsAt)',
  'function sweepExpired(uint256 epochId)',
]);

const stakingAbi = parseAbi([
  'function lock(uint128 amount,uint64 duration)',
  'function increaseLock(uint128 amount)',
  'function extendLock(uint64 duration)',
  'function withdraw()',
  'function emergencyWithdraw()',
  'function delegate(address delegatee)',
  'function syncExpiredPower(address account)',
  'function setVerifiedAccount(address account,bool verified)',
  'function setReputation(address account,uint16 newBps)',
]);

const chainId = Number(import.meta.env.VITE_YD_CHAIN_ID ?? import.meta.env.VITE_BASE_CHAIN_ID ?? 11155111);
const rpcUrl = (import.meta.env.VITE_YD_RPC_URL ?? import.meta.env.VITE_BASE_RPC_URL)?.trim();
const tokenAddress = import.meta.env.VITE_YD_TOKEN_ADDRESS?.trim();
const distributorAddress = import.meta.env.VITE_YD_DISTRIBUTOR_ADDRESS?.trim();
const stakingAddress = import.meta.env.VITE_YD_STAKING_ADDRESS?.trim();
const decimals = Math.max(0, Math.min(18, Number(import.meta.env.VITE_YD_TOKEN_DECIMALS ?? 18)));

const configured = Boolean(
  rpcUrl
    && isAddress(tokenAddress ?? '')
    && isAddress(distributorAddress ?? '')
    && isAddress(stakingAddress ?? ''),
);

const chain = defineChain({
  id: chainId,
  name: import.meta.env.VITE_BASE_CHAIN_NAME?.trim() || 'Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: rpcUrl ? [rpcUrl] : ['https://ethereum-sepolia-rpc.publicnode.com'] } },
});
const publicClient = createPublicClient({ chain, transport: http(rpcUrl || chain.rpcUrls.default.http[0]) });

export type YdWalletAction =
  | { type: 'claim'; epochNumber: number; amountUnits: string; proof: string[] }
  | { type: 'lock'; amount: string; durationDays: number }
  | { type: 'increase'; amount: string }
  | { type: 'extend'; durationDays: number }
  | { type: 'withdraw'; emergency?: boolean }
  | { type: 'delegate'; delegatee: string }
  | { type: 'sync_expired_power'; account: string }
  | { type: 'verify_account'; account: string; verified: boolean }
  | { type: 'set_reputation'; account: string; reputationBps: number }
  | { type: 'publish_epoch'; epoch: RewardEpoch }
  | { type: 'sweep_epoch'; epochNumber: number };

function requireConfig() {
  if (!configured) throw new Error('YD 测试网合约尚未配置。');
  return {
    token: tokenAddress as Address,
    distributor: distributorAddress as Address,
    staking: stakingAddress as Address,
  };
}

function positiveUnits(value: string) {
  const units = parseUnits(value.trim(), decimals);
  if (units <= 0n) throw new Error('YD 数量必须大于 0。');
  if (units > 2n ** 128n - 1n) throw new Error('YD 数量超过合约上限。');
  return units;
}

function durationSeconds(days: number) {
  if (!Number.isInteger(days) || days < 30 || days > 730) throw new Error('锁定期限必须是 30–730 天的整数。');
  return BigInt(days * 24 * 60 * 60);
}

async function waitForSuccess(hash: Hex) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 90_000 });
  if (receipt.status !== 'success') throw new Error('YD 链上交易执行失败。');
}

async function sendAndWait(sendTransaction: SendTransaction, to: Address, data: Hex) {
  const transaction = await sendTransaction({ to, data, chainId });
  await waitForSuccess(transaction.hash);
  return transaction.hash;
}

async function ensureAllowance(sendTransaction: SendTransaction, owner: Address, amount: bigint) {
  const { token, staking } = requireConfig();
  const allowance = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, staking] });
  if (allowance >= amount) return;
  await sendAndWait(sendTransaction, token, encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [staking, amount] }));
}

export function ydWalletConfigured() {
  return configured;
}

export function formatYdUnits(units: string) {
  try {
    return Number(formatUnits(BigInt(units), decimals)).toLocaleString('zh-CN', { maximumFractionDigits: 4 });
  } catch {
    return '0';
  }
}

export async function getYdWalletBalance(walletAddress: string) {
  const { token } = requireConfig();
  if (!isAddress(walletAddress, { strict: false })) return '0';
  const balance = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [walletAddress] });
  return balance.toString();
}

export async function submitYdAction(
  sendTransaction: SendTransaction,
  walletAddress: string,
  action: YdWalletAction,
): Promise<Hex> {
  const { token, distributor, staking } = requireConfig();
  if (!isAddress(walletAddress, { strict: false })) throw new Error('请连接已绑定的 EVM 钱包。');
  const owner = walletAddress as Address;

  if (action.type === 'claim') {
    if (!Number.isInteger(action.epochNumber) || action.epochNumber <= 0) throw new Error('奖励周期编号无效。');
    const amount = BigInt(action.amountUnits);
    const proof = action.proof as Hex[];
    return sendAndWait(sendTransaction, distributor, encodeFunctionData({
      abi: distributorAbi,
      functionName: 'claim',
      args: [BigInt(action.epochNumber), amount, proof],
    }));
  }

  if (action.type === 'lock' || action.type === 'increase') {
    const amount = positiveUnits(action.amount);
    const balance = await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [owner],
    });
    if (balance < amount) {
      throw new Error(`YD 余额不足：可用 ${formatYdUnits(balance.toString())} YD，需要 ${formatYdUnits(amount.toString())} YD。`);
    }
    await ensureAllowance(sendTransaction, owner, amount);
    return sendAndWait(sendTransaction, staking, encodeFunctionData({
      abi: stakingAbi,
      functionName: action.type === 'lock' ? 'lock' : 'increaseLock',
      args: action.type === 'lock' ? [amount, durationSeconds(action.durationDays)] : [amount],
    }));
  }

  if (action.type === 'extend') {
    return sendAndWait(sendTransaction, staking, encodeFunctionData({ abi: stakingAbi, functionName: 'extendLock', args: [durationSeconds(action.durationDays)] }));
  }
  if (action.type === 'withdraw') {
    return sendAndWait(sendTransaction, staking, encodeFunctionData({ abi: stakingAbi, functionName: action.emergency ? 'emergencyWithdraw' : 'withdraw' }));
  }
  if (action.type === 'delegate') {
    if (!isAddress(action.delegatee, { strict: false })) throw new Error('委托钱包地址无效。');
    return sendAndWait(sendTransaction, staking, encodeFunctionData({ abi: stakingAbi, functionName: 'delegate', args: [action.delegatee] }));
  }
  if (action.type === 'sync_expired_power') {
    if (!isAddress(action.account, { strict: false })) throw new Error('待清理钱包地址无效。');
    return sendAndWait(sendTransaction, staking, encodeFunctionData({ abi: stakingAbi, functionName: 'syncExpiredPower', args: [action.account] }));
  }
  if (action.type === 'verify_account') {
    if (!isAddress(action.account, { strict: false })) throw new Error('认证钱包地址无效。');
    return sendAndWait(sendTransaction, staking, encodeFunctionData({ abi: stakingAbi, functionName: 'setVerifiedAccount', args: [action.account, action.verified] }));
  }
  if (action.type === 'set_reputation') {
    if (!isAddress(action.account, { strict: false })) throw new Error('信誉钱包地址无效。');
    if (!Number.isInteger(action.reputationBps) || action.reputationBps < 5_000 || action.reputationBps > 15_000) throw new Error('信誉系数必须在 5000–15000 BPS。');
    return sendAndWait(sendTransaction, staking, encodeFunctionData({ abi: stakingAbi, functionName: 'setReputation', args: [action.account, action.reputationBps] }));
  }
  if (action.type === 'sweep_epoch') {
    if (!Number.isInteger(action.epochNumber) || action.epochNumber <= 0) throw new Error('奖励周期编号无效。');
    return sendAndWait(sendTransaction, distributor, encodeFunctionData({ abi: distributorAbi, functionName: 'sweepExpired', args: [BigInt(action.epochNumber)] }));
  }

  const { epoch } = action;
  if (!epoch.merkleRoot) throw new Error('奖励周期尚未完成 Merkle 计算。');
  return sendAndWait(sendTransaction, distributor, encodeFunctionData({
    abi: distributorAbi,
    functionName: 'publishEpoch',
    args: [BigInt(epoch.epochNumber), epoch.merkleRoot as Hex, BigInt(epoch.totalRewardUnits), BigInt(Math.floor(Date.parse(epoch.claimEndsAt) / 1_000))],
  }));
}
