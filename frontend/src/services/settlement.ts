import {
  createPublicClient,
  defineChain,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  isAddress,
  keccak256,
  parseAbi,
  parseAbiParameters,
  parseUnits,
  stringToHex,
  type Address,
  type Hex,
} from 'viem';
import type { PaymentMethod } from '../types/domain';

const erc20Abi = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

const escrowAbi = parseAbi([
  'function depositToken(bytes32 missionKey, uint128 amount, bytes32 payoutHash)',
  'function depositNative(bytes32 missionKey, bytes32 payoutHash) payable',
  'function release(bytes32 missionKey, address[] recipients, uint256[] weights)',
  'function freeze(bytes32 missionKey)',
  'function unfreeze(bytes32 missionKey)',
  'function refund(bytes32 missionKey)',
]);

type SendTransaction = (input: {
  to: string;
  data: Hex;
  chainId: number;
  value?: bigint;
}) => Promise<{ hash: Hex }>;

export interface SettlementRecipient {
  address: string;
  weight: number;
}

function normalizedPlan(recipients: SettlementRecipient[]) {
  const aggregated = new Map<string, { address: Address; weight: bigint }>();
  for (const recipient of recipients) {
    if (!isAddress(recipient.address, { strict: false }) || !Number.isFinite(recipient.weight) || recipient.weight <= 0) {
      throw new Error('Agent 分账钱包或阶段权重无效，无法提交链上交易。');
    }
    const key = recipient.address.toLocaleLowerCase();
    const weight = parseUnits(recipient.weight.toFixed(6), 6);
    if (weight <= 0n) throw new Error('Agent 阶段权重必须大于零。');
    const current = aggregated.get(key);
    aggregated.set(key, { address: key as Address, weight: (current?.weight ?? 0n) + weight });
  }
  const entries = [...aggregated.values()].sort((left, right) => left.address.toLocaleLowerCase().localeCompare(right.address.toLocaleLowerCase()));
  if (!entries.length) throw new Error('至少需要一个有效的 Agent 分账钱包。');
  const addresses = entries.map((entry) => entry.address);
  const weights = entries.map((entry) => entry.weight);
  const payoutHash = keccak256(encodeAbiParameters(
    parseAbiParameters('address[] recipients, uint256[] weights'),
    [addresses, weights],
  ));
  return { addresses, weights, payoutHash };
}

type Web3PaymentMethod = Extract<PaymentMethod, 'web3_musdc' | 'web3_seth'>;

const chainId = Number(import.meta.env.VITE_BASE_CHAIN_ID ?? 11155111);
const rpcUrl = import.meta.env.VITE_BASE_RPC_URL?.trim();
const escrowAddress = import.meta.env.VITE_ESCROW_CONTRACT_ADDRESS?.trim();
const musdcAddress = (import.meta.env.VITE_MUSDC_ADDRESS ?? import.meta.env.VITE_USDC_ADDRESS)?.trim();
const musdcDecimals = Math.max(0, Number(import.meta.env.VITE_USDC_DECIMALS ?? 6));
const configured = import.meta.env.VITE_SETTLEMENT_MODE === 'contract'
  && Boolean(rpcUrl && isAddress(escrowAddress ?? '') && isAddress(musdcAddress ?? ''));

const chain = defineChain({
  id: chainId,
  name: import.meta.env.VITE_BASE_CHAIN_NAME?.trim() || 'Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: rpcUrl ? [rpcUrl] : ['https://ethereum-sepolia-rpc.publicnode.com'] } },
});

const publicClient = createPublicClient({ chain, transport: http(rpcUrl || chain.rpcUrls.default.http[0]) });

export function onchainSettlementConfigured() {
  return configured;
}

function requireConfig() {
  if (!configured) throw new Error('Sepolia mUSDC / sETH 托管尚未配置。');
  return { escrow: escrowAddress as Address, musdc: musdcAddress as Address };
}

async function waitForSuccess(hash: Hex) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 90_000 });
  if (receipt.status !== 'success') throw new Error('链上交易执行失败。');
}

export async function depositEscrow(
  sendTransaction: SendTransaction,
  walletAddress: string,
  missionId: string,
  amount: number,
  paymentMethod: Web3PaymentMethod,
  recipients: SettlementRecipient[],
): Promise<Hex> {
  const { escrow, musdc } = requireConfig();
  if (!isAddress(walletAddress)) throw new Error('请先连接有效的 EVM 钱包。');
  const plan = normalizedPlan(recipients);
  const units = parseUnits(String(amount), paymentMethod === 'web3_musdc' ? musdcDecimals : 18);
  if (paymentMethod === 'web3_seth') {
    const deposit = await sendTransaction({
      to: escrow,
      chainId,
      value: units,
      data: encodeFunctionData({ abi: escrowAbi, functionName: 'depositNative', args: [keccak256(stringToHex(missionId)), plan.payoutHash] }),
    });
    await waitForSuccess(deposit.hash);
    return deposit.hash;
  }
  const allowance = await publicClient.readContract({
    address: musdc,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [walletAddress, escrow],
  });
  if (allowance < units) {
    const approval = await sendTransaction({
      to: musdc,
      chainId,
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [escrow, units] }),
    });
    await waitForSuccess(approval.hash);
  }
  const deposit = await sendTransaction({
    to: escrow,
    chainId,
    data: encodeFunctionData({
      abi: escrowAbi,
      functionName: 'depositToken',
      args: [keccak256(stringToHex(missionId)), units, plan.payoutHash],
    }),
  });
  await waitForSuccess(deposit.hash);
  return deposit.hash;
}

export async function releaseEscrow(
  sendTransaction: SendTransaction,
  missionId: string,
  recipients: SettlementRecipient[],
): Promise<Hex> {
  const { escrow } = requireConfig();
  const plan = normalizedPlan(recipients);
  const release = await sendTransaction({
    to: escrow,
    chainId,
    data: encodeFunctionData({
      abi: escrowAbi,
      functionName: 'release',
      args: [
        keccak256(stringToHex(missionId)),
        plan.addresses,
        plan.weights,
      ],
    }),
  });
  await waitForSuccess(release.hash);
  return release.hash;
}

async function updateEscrowState(
  sendTransaction: SendTransaction,
  missionId: string,
  functionName: 'freeze' | 'unfreeze' | 'refund',
): Promise<Hex> {
  const { escrow } = requireConfig();
  const transaction = await sendTransaction({
    to: escrow,
    chainId,
    data: encodeFunctionData({ abi: escrowAbi, functionName, args: [keccak256(stringToHex(missionId))] }),
  });
  await waitForSuccess(transaction.hash);
  return transaction.hash;
}

export function freezeEscrow(sendTransaction: SendTransaction, missionId: string) {
  return updateEscrowState(sendTransaction, missionId, 'freeze');
}

export function unfreezeEscrow(sendTransaction: SendTransaction, missionId: string) {
  return updateEscrowState(sendTransaction, missionId, 'unfreeze');
}

export function refundEscrow(sendTransaction: SendTransaction, missionId: string) {
  return updateEscrowState(sendTransaction, missionId, 'refund');
}
