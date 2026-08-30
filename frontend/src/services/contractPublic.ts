import {
  createPublicClient,
  defineChain,
  fallback,
  formatUnits,
  http,
  isAddress,
  parseAbi,
  parseAbiItem,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';

const contractAbi = parseAbi([
  'function paused() view returns (bool)',
  'function token() view returns (address)',
  'function treasury() view returns (address)',
  'function platformFeeBps() view returns (uint16)',
]);

const tokenAbi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);

const depositedEvent = parseAbiItem(
  'event EscrowDeposited(bytes32 indexed missionKey, address indexed requester, address indexed asset, uint256 amount, bytes32 payoutHash)',
);
const frozenEvent = parseAbiItem('event EscrowFrozen(bytes32 indexed missionKey, address indexed actor)');
const unfrozenEvent = parseAbiItem('event EscrowUnfrozen(bytes32 indexed missionKey, address indexed arbiter)');
const releasedEvent = parseAbiItem(
  'event EscrowReleased(bytes32 indexed missionKey, address indexed requester, address indexed asset, uint256 amount, uint256 platformFee, bytes32 payoutHash)',
);
const refundedEvent = parseAbiItem(
  'event EscrowRefunded(bytes32 indexed missionKey, address indexed requester, address indexed asset, uint256 amount)',
);
const activityEvents = [depositedEvent, frozenEvent, unfrozenEvent, releasedEvent, refundedEvent] as const;

const chainId = Number(import.meta.env.VITE_BASE_CHAIN_ID ?? 11_155_111);
const chainName = import.meta.env.VITE_BASE_CHAIN_NAME?.trim() || 'Sepolia';
const rpcUrl = import.meta.env.VITE_BASE_RPC_URL?.trim() || 'https://ethereum-sepolia-rpc.publicnode.com';
const configuredRpcFallbackUrls = (import.meta.env.VITE_BASE_RPC_FALLBACK_URLS ?? '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
const rpcUrls = [...new Set([
  rpcUrl,
  ...configuredRpcFallbackUrls,
  ...(chainId === 11_155_111 ? ['https://11155111.rpc.thirdweb.com'] : []),
])];
const rawEscrowAddress = import.meta.env.VITE_ESCROW_CONTRACT_ADDRESS?.trim() || '';
const rawTokenAddress = (import.meta.env.VITE_MUSDC_ADDRESS ?? import.meta.env.VITE_USDC_ADDRESS)?.trim() || '';
const deploymentBlock = BigInt(import.meta.env.VITE_ESCROW_DEPLOYMENT_BLOCK ?? 11_541_034);
const deploymentTransaction = import.meta.env.VITE_ESCROW_DEPLOYMENT_TX_HASH?.trim() || null;
const escrowAddress = isAddress(rawEscrowAddress, { strict: false }) ? rawEscrowAddress as Address : null;
const configuredTokenAddress = isAddress(rawTokenAddress, { strict: false }) ? rawTokenAddress as Address : null;

const chain = defineChain({
  id: chainId,
  name: chainName,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: rpcUrls } },
});

const publicClient = createPublicClient({
  chain,
  transport: fallback(
    rpcUrls.map((url) => http(url, { retryCount: 0, timeout: 6_000 })),
    { retryCount: 0 },
  ),
});
const explorerBaseUrl = chainId === 11_155_111 ? 'https://sepolia.etherscan.io' : 'https://etherscan.io';
const activityBlockRange = 10_000n;
const activityReorgLookback = 12n;

export const publicContractConfig = {
  chainId,
  chainName,
  escrowAddress,
  configuredTokenAddress,
  deploymentBlock,
  deploymentTransaction,
  explorerBaseUrl,
  configured: Boolean(escrowAddress),
};

export type ContractActivityKind = 'deposited' | 'frozen' | 'unfrozen' | 'released' | 'refunded';
export type ContractEscrowState = 'held' | 'frozen' | 'released' | 'refunded';

export interface ContractActivity {
  kind: ContractActivityKind;
  missionKey: Hex;
  actor: Address;
  asset: Address | null;
  amount: bigint | null;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hex;
}

export interface ContractPublicSnapshot {
  blockNumber: bigint;
  confirmations: bigint;
  codeAvailable: boolean;
  paused: boolean;
  tokenAddress: Address;
  tokenSymbol: string;
  tokenDecimals: number;
  treasury: Address;
  platformFeeBps: number;
  contractTokenBalance: bigint;
  contractNativeBalance: bigint;
  tokenDepositedVolume: bigint;
  nativeDepositedVolume: bigint;
  totalEscrows: number;
  states: Record<ContractEscrowState, number>;
  recentActivity: ContractActivity[];
  activityAvailable: boolean;
  syncedAt: string;
}

interface ActivityCache {
  blockNumber: bigint;
  activity: ContractActivity[];
}

let activityCache: ActivityCache | null = null;

function activityPosition(left: ContractActivity, right: ContractActivity) {
  if (left.blockNumber !== right.blockNumber) return left.blockNumber < right.blockNumber ? -1 : 1;
  return left.logIndex - right.logIndex;
}

async function readContractActivity(toBlock: bigint): Promise<ContractActivity[]> {
  if (toBlock < deploymentBlock) return [];

  let fromBlock = deploymentBlock;
  let retainedActivity: ContractActivity[] = [];
  if (activityCache && activityCache.blockNumber >= deploymentBlock && activityCache.blockNumber <= toBlock) {
    fromBlock = activityCache.blockNumber >= deploymentBlock + activityReorgLookback
      ? activityCache.blockNumber - activityReorgLookback + 1n
      : deploymentBlock;
    retainedActivity = activityCache.activity.filter((item) => item.blockNumber < fromBlock);
  }

  const freshActivity: ContractActivity[] = [];
  for (let chunkStart = fromBlock; chunkStart <= toBlock; chunkStart += activityBlockRange) {
    const chunkEnd = chunkStart + activityBlockRange - 1n < toBlock
      ? chunkStart + activityBlockRange - 1n
      : toBlock;
    const logs = await publicClient.getLogs({
      address: escrowAddress!,
      events: activityEvents,
      fromBlock: chunkStart,
      toBlock: chunkEnd,
      strict: true,
    });

    freshActivity.push(...logs.map((log): ContractActivity => {
      const common = {
        missionKey: log.args.missionKey,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        transactionHash: log.transactionHash,
      };
      switch (log.eventName) {
        case 'EscrowDeposited':
          return {
            ...common,
            kind: 'deposited',
            actor: log.args.requester,
            asset: log.args.asset === zeroAddress ? null : log.args.asset,
            amount: log.args.amount,
          };
        case 'EscrowFrozen':
          return { ...common, kind: 'frozen', actor: log.args.actor, asset: null, amount: null };
        case 'EscrowUnfrozen':
          return { ...common, kind: 'unfrozen', actor: log.args.arbiter, asset: null, amount: null };
        case 'EscrowReleased':
          return {
            ...common,
            kind: 'released',
            actor: log.args.requester,
            asset: log.args.asset === zeroAddress ? null : log.args.asset,
            amount: log.args.amount,
          };
        case 'EscrowRefunded':
          return {
            ...common,
            kind: 'refunded',
            actor: log.args.requester,
            asset: log.args.asset === zeroAddress ? null : log.args.asset,
            amount: log.args.amount,
          };
      }
    }));
  }

  const activity = [...retainedActivity, ...freshActivity].sort(activityPosition);
  activityCache = { blockNumber: toBlock, activity };
  return activity;
}

export async function readContractPublicSnapshot(): Promise<ContractPublicSnapshot> {
  if (!escrowAddress) throw new Error('公开合约地址尚未配置。');

  const [blockNumber, bytecode, paused, tokenAddress, treasury, platformFeeBps, contractNativeBalance] = await Promise.all([
    publicClient.getBlockNumber(),
    publicClient.getBytecode({ address: escrowAddress }),
    publicClient.readContract({ address: escrowAddress, abi: contractAbi, functionName: 'paused' }),
    publicClient.readContract({ address: escrowAddress, abi: contractAbi, functionName: 'token' }),
    publicClient.readContract({ address: escrowAddress, abi: contractAbi, functionName: 'treasury' }),
    publicClient.readContract({ address: escrowAddress, abi: contractAbi, functionName: 'platformFeeBps' }),
    publicClient.getBalance({ address: escrowAddress }),
  ]);

  const [tokenSymbol, tokenDecimals, contractTokenBalance, activityResult] = await Promise.all([
    publicClient.readContract({ address: tokenAddress, abi: tokenAbi, functionName: 'symbol' }).catch(() => 'mUSDC'),
    publicClient.readContract({ address: tokenAddress, abi: tokenAbi, functionName: 'decimals' }).catch(() => 6),
    publicClient.readContract({ address: tokenAddress, abi: tokenAbi, functionName: 'balanceOf', args: [escrowAddress] }),
    readContractActivity(blockNumber)
      .then((activity) => ({ activity, available: true }))
      .catch((activityError) => {
        console.warn(
          '[contract-public] Activity index unavailable; core contract state remains usable.',
          activityError instanceof Error ? activityError.message : activityError,
        );
        return { activity: [] as ContractActivity[], available: false };
      }),
  ]);
  const activity = activityResult.activity;
  const deposits = activity.filter((item) => item.kind === 'deposited');
  const stateByMission = new Map<string, ContractEscrowState>();
  for (const item of activity) {
    const state = item.kind === 'deposited' || item.kind === 'unfrozen'
      ? 'held'
      : item.kind === 'frozen'
        ? 'frozen'
        : item.kind;
    stateByMission.set(item.missionKey, state);
  }
  const states: Record<ContractEscrowState, number> = { held: 0, frozen: 0, released: 0, refunded: 0 };
  for (const state of stateByMission.values()) states[state] += 1;

  const tokenDepositedVolume = deposits
    .filter((item) => item.asset !== null)
    .reduce((sum, item) => sum + (item.amount ?? 0n), 0n);
  const nativeDepositedVolume = deposits
    .filter((item) => item.asset === null)
    .reduce((sum, item) => sum + (item.amount ?? 0n), 0n);

  return {
    blockNumber,
    confirmations: blockNumber >= deploymentBlock ? blockNumber - deploymentBlock + 1n : 0n,
    codeAvailable: Boolean(bytecode && bytecode !== '0x'),
    paused,
    tokenAddress,
    tokenSymbol,
    tokenDecimals: Number(tokenDecimals),
    treasury,
    platformFeeBps: Number(platformFeeBps),
    contractTokenBalance,
    contractNativeBalance,
    tokenDepositedVolume,
    nativeDepositedVolume,
    totalEscrows: deposits.length,
    states,
    recentActivity: [...activity].reverse().slice(0, 8),
    activityAvailable: activityResult.available,
    syncedAt: new Date().toISOString(),
  };
}

export function formatContractAsset(amount: bigint, decimals: number, maximumFractionDigits = 4) {
  const value = Number(formatUnits(amount, decimals));
  return value.toLocaleString('zh-CN', { maximumFractionDigits });
}
