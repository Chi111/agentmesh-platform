import {
  createPublicClient,
  decodeEventLog,
  http,
  parseAbi,
  type Address,
  type Hex,
} from 'viem';
import type { GovernancePowerSnapshot, RewardEpoch, YdStakingPosition } from './contracts';

export interface YdChainEnv {
  YD_RPC_URL?: string;
  YD_CHAIN_ID?: string;
  YD_TOKEN_ADDRESS?: string;
  YD_DISTRIBUTOR_ADDRESS?: string;
  YD_STAKING_ADDRESS?: string;
  YD_TOKEN_DECIMALS?: string;
  YD_MIN_CONFIRMATIONS?: string;
  YD_TESTNET?: string;
  BASE_RPC_URL?: string;
  BASE_CHAIN_ID?: string;
}

const distributorAbi = parseAbi([
  'event EpochPublished(uint256 indexed epochId, bytes32 indexed merkleRoot, uint256 totalAllocation, uint64 claimEndsAt)',
  'event RewardClaimed(uint256 indexed epochId, address indexed account, uint256 amount)',
  'event EpochSwept(uint256 indexed epochId, uint256 unclaimedAmount)',
]);

const stakingAbi = parseAbi([
  'event AccountVerificationChanged(address indexed account, bool verified)',
  'event ReputationChanged(address indexed account, uint16 previousBps, uint16 newBps)',
  'event PositionChanged(address indexed account, uint256 amount, uint64 unlockTime, uint64 duration, uint256 rawPower)',
  'event PositionWithdrawn(address indexed account, uint256 amount, bool emergency)',
  'event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate)',
  'function positions(address) view returns (uint128 amount, uint64 unlockTime, uint64 duration)',
  'function reputationBps(address) view returns (uint16)',
  'function rawPowerOf(address) view returns (uint256)',
  'function delegates(address) view returns (address)',
  'function getVotes(address) view returns (uint256)',
  'function getPastVotes(address,uint256) view returns (uint256)',
  'function verifiedAccounts(address) view returns (bool)',
]);

export type YdChainVerification =
  | { ok: true; blockNumber: string; logIndex: number; confirmations: number }
  | { ok: false; status: number; code: string; message: string };

export function selectFinalizedSnapshotBlock(
  currentBlock: bigint,
  confirmations: number,
  requestedSnapshotBlock: bigint | null,
): bigint {
  if (currentBlock === 0n) throw new Error('YD_SNAPSHOT_MUST_BE_PAST');
  const confirmationDepth = BigInt(Math.max(1, confirmations));
  const safeLatest = currentBlock > confirmationDepth ? currentBlock - confirmationDepth : 0n;
  const snapshotBlock = requestedSnapshotBlock ?? safeLatest;
  if (snapshotBlock > safeLatest) throw new Error('YD_SNAPSHOT_NOT_FINALIZED');
  if (snapshotBlock >= currentBlock) throw new Error('YD_SNAPSHOT_MUST_BE_PAST');
  return snapshotBlock;
}

export function governancePowerRequiresSync(input: {
  amount: bigint;
  unlockTime: bigint;
  rawPower: bigint;
  verified: boolean;
  snapshotTimestamp: bigint;
}): boolean {
  return input.rawPower > 0n && (
    input.amount === 0n
    || !input.verified
    || input.unlockTime <= input.snapshotTimestamp
  );
}

export interface GovernanceDelegationState {
  userId: string;
  walletAddress: string;
  rawPower: bigint;
  votingPower: bigint;
  delegatee: string | null;
  verified: boolean;
}

export function reconcileGovernanceDelegations(
  states: GovernanceDelegationState[],
): Map<string, { power: bigint; delegateSources: string[] }> {
  const byWallet = new Map(states.map((state) => [state.walletAddress.toLocaleLowerCase(), state]));
  const expected = new Map<string, { power: bigint; delegateSources: string[] }>();
  for (const source of states) {
    if (!source.verified || source.rawPower <= 0n || !source.delegatee) continue;
    const target = source.delegatee.toLocaleLowerCase();
    if (!byWallet.get(target)?.verified) continue;
    const current = expected.get(target) ?? { power: 0n, delegateSources: [] };
    current.power += source.rawPower;
    current.delegateSources.push(source.walletAddress.toLocaleLowerCase());
    expected.set(target, current);
  }
  for (const state of states) {
    const wallet = state.walletAddress.toLocaleLowerCase();
    const calculated = expected.get(wallet) ?? { power: 0n, delegateSources: [] };
    if (state.votingPower !== calculated.power) throw new Error('YD_DELEGATION_REQUIRES_RECONCILIATION');
  }
  return expected;
}

function isAddress(value: string | undefined): value is Address {
  return Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value));
}

function isHash(value: string): value is Hex {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

function config(env: YdChainEnv) {
  return {
    rpcUrl: env.YD_RPC_URL?.trim() || env.BASE_RPC_URL?.trim() || '',
    chainId: Number(env.YD_CHAIN_ID ?? env.BASE_CHAIN_ID ?? 11155111),
    tokenAddress: env.YD_TOKEN_ADDRESS?.trim() || '',
    distributorAddress: env.YD_DISTRIBUTOR_ADDRESS?.trim() || '',
    stakingAddress: env.YD_STAKING_ADDRESS?.trim() || '',
    decimals: Math.max(0, Math.min(18, Number(env.YD_TOKEN_DECIMALS ?? 18))),
    confirmations: Math.max(1, Number(env.YD_MIN_CONFIRMATIONS ?? 2)),
    testnet: env.YD_TESTNET?.trim().toLocaleLowerCase() !== 'false',
  };
}

export function ydChainDescriptor(env: YdChainEnv) {
  const value = config(env);
  const configured = Boolean(value.rpcUrl)
    && isAddress(value.tokenAddress)
    && isAddress(value.distributorAddress)
    && isAddress(value.stakingAddress);
  return {
    configured,
    chainId: value.chainId,
    tokenAddress: isAddress(value.tokenAddress) ? value.tokenAddress : null,
    distributorAddress: isAddress(value.distributorAddress) ? value.distributorAddress : null,
    stakingAddress: isAddress(value.stakingAddress) ? value.stakingAddress : null,
    decimals: value.decimals,
    confirmations: value.confirmations,
    testnet: value.testnet,
    rewardLabel: value.testnet ? '测试 YD 奖励' : 'YD 奖励',
    yieldLabel: '不包含 Earn 或真实收益',
  };
}

async function receiptContext(env: YdChainEnv, txHash: string, contractAddress: string) {
  const value = config(env);
  if (!value.rpcUrl || !isAddress(contractAddress)) {
    return { error: { ok: false, status: 503, code: 'YD_CHAIN_NOT_CONFIGURED', message: 'YD chain contracts are not configured' } as const };
  }
  if (!isHash(txHash)) return { error: { ok: false, status: 400, code: 'INVALID_TX_HASH', message: 'A valid transaction hash is required' } as const };
  const client = createPublicClient({ transport: http(value.rpcUrl) });
  try {
    const [receipt, transaction, latestBlock, networkChainId] = await Promise.all([
      client.getTransactionReceipt({ hash: txHash }),
      client.getTransaction({ hash: txHash }),
      client.getBlockNumber(),
      client.getChainId(),
    ]);
    if (networkChainId !== value.chainId) return { error: { ok: false, status: 409, code: 'WRONG_YD_CHAIN', message: 'YD RPC chain ID does not match configuration' } as const };
    if (receipt.status !== 'success') return { error: { ok: false, status: 409, code: 'TX_REVERTED', message: 'The YD transaction reverted' } as const };
    if (transaction.to?.toLocaleLowerCase() !== contractAddress.toLocaleLowerCase()) {
      return { error: { ok: false, status: 400, code: 'WRONG_YD_CONTRACT', message: 'The transaction target is not the configured YD contract' } as const };
    }
    const confirmations = Number(latestBlock - receipt.blockNumber + 1n);
    if (confirmations < value.confirmations) {
      return { error: { ok: false, status: 409, code: 'TX_CONFIRMING', message: `Transaction needs ${value.confirmations - confirmations} more confirmation(s)` } as const };
    }
    return { client, receipt, transaction, confirmations };
  } catch {
    return { error: { ok: false, status: 409, code: 'TX_NOT_AVAILABLE', message: 'The YD transaction is not available from the configured RPC yet' } as const };
  }
}

export async function verifyRewardEpochPublished(env: YdChainEnv, txHash: string, epoch: RewardEpoch): Promise<YdChainVerification> {
  const value = config(env);
  const context = await receiptContext(env, txHash, value.distributorAddress);
  if ('error' in context) return context.error;
  for (const log of context.receipt.logs) {
    if (log.address.toLocaleLowerCase() !== value.distributorAddress.toLocaleLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: distributorAbi, data: log.data, topics: log.topics });
      if (decoded.eventName !== 'EpochPublished') continue;
      const args = decoded.args as { epochId: bigint; merkleRoot: Hex; totalAllocation: bigint; claimEndsAt: bigint };
      if (args.epochId !== BigInt(epoch.epochNumber)
        || args.merkleRoot.toLocaleLowerCase() !== epoch.merkleRoot?.toLocaleLowerCase()
        || args.totalAllocation !== BigInt(epoch.totalRewardUnits)
        || args.claimEndsAt !== BigInt(Math.floor(Date.parse(epoch.claimEndsAt) / 1_000))) continue;
      return { ok: true, blockNumber: context.receipt.blockNumber.toString(), logIndex: log.logIndex ?? 0, confirmations: context.confirmations };
    } catch {
      // Ignore unrelated logs.
    }
  }
  return { ok: false, status: 400, code: 'YD_EPOCH_EVENT_MISMATCH', message: 'Transaction does not publish the computed reward epoch' };
}

export async function verifyRewardClaim(
  env: YdChainEnv,
  txHash: string,
  epochNumber: number,
  walletAddress: string,
  amountUnits: string,
): Promise<YdChainVerification> {
  const value = config(env);
  const context = await receiptContext(env, txHash, value.distributorAddress);
  if ('error' in context) return context.error;
  if (context.transaction.from.toLocaleLowerCase() !== walletAddress.toLocaleLowerCase()) {
    return { ok: false, status: 403, code: 'WRONG_CHAIN_ACTOR', message: 'Claim transaction was not sent by the linked wallet' };
  }
  for (const log of context.receipt.logs) {
    if (log.address.toLocaleLowerCase() !== value.distributorAddress.toLocaleLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: distributorAbi, data: log.data, topics: log.topics });
      if (decoded.eventName !== 'RewardClaimed') continue;
      const args = decoded.args as { epochId: bigint; account: Address; amount: bigint };
      if (args.epochId !== BigInt(epochNumber)
        || args.account.toLocaleLowerCase() !== walletAddress.toLocaleLowerCase()
        || args.amount !== BigInt(amountUnits)) continue;
      return { ok: true, blockNumber: context.receipt.blockNumber.toString(), logIndex: log.logIndex ?? 0, confirmations: context.confirmations };
    } catch {
      // Ignore unrelated logs.
    }
  }
  return { ok: false, status: 400, code: 'YD_CLAIM_EVENT_MISMATCH', message: 'Transaction does not contain the expected YD claim' };
}

export async function verifyRewardEpochSwept(
  env: YdChainEnv,
  txHash: string,
  epochNumber: number,
): Promise<YdChainVerification> {
  const value = config(env);
  const context = await receiptContext(env, txHash, value.distributorAddress);
  if ('error' in context) return context.error;
  for (const log of context.receipt.logs) {
    if (log.address.toLocaleLowerCase() !== value.distributorAddress.toLocaleLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: distributorAbi, data: log.data, topics: log.topics });
      if (decoded.eventName !== 'EpochSwept') continue;
      const args = decoded.args as { epochId: bigint; unclaimedAmount: bigint };
      if (args.epochId !== BigInt(epochNumber)) continue;
      return { ok: true, blockNumber: context.receipt.blockNumber.toString(), logIndex: log.logIndex ?? 0, confirmations: context.confirmations };
    } catch {
      // Ignore unrelated logs.
    }
  }
  return { ok: false, status: 400, code: 'YD_SWEEP_EVENT_MISMATCH', message: 'Transaction does not sweep the expected YD epoch' };
}

export async function syncStakingTransaction(
  env: YdChainEnv,
  txHash: string,
  userId: string,
  walletAddress: string,
  updatedAt: string,
): Promise<{ verification: YdChainVerification; position?: YdStakingPosition }> {
  const value = config(env);
  const context = await receiptContext(env, txHash, value.stakingAddress);
  if ('error' in context) return { verification: context.error };
  let matchingLogIndex: number | null = null;
  for (const log of context.receipt.logs) {
    if (log.address.toLocaleLowerCase() !== value.stakingAddress.toLocaleLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: stakingAbi, data: log.data, topics: log.topics });
      const args = decoded.args as { account?: Address; delegator?: Address };
      const account = args.account ?? args.delegator;
      if (account?.toLocaleLowerCase() === walletAddress.toLocaleLowerCase()) matchingLogIndex = Math.max(matchingLogIndex ?? -1, log.logIndex ?? 0);
    } catch {
      // Ignore unrelated logs.
    }
  }
  if (matchingLogIndex === null) {
    return { verification: { ok: false, status: 400, code: 'YD_STAKING_EVENT_MISMATCH', message: 'Transaction does not update the linked wallet staking state' } };
  }
  const stakingAddress = value.stakingAddress as Address;
  const account = walletAddress as Address;
  const blockNumber = context.receipt.blockNumber;
  const [position, reputationBps, rawPower, delegatee, votingPower, verified] = await Promise.all([
    context.client.readContract({ address: stakingAddress, abi: stakingAbi, functionName: 'positions', args: [account], blockNumber }),
    context.client.readContract({ address: stakingAddress, abi: stakingAbi, functionName: 'reputationBps', args: [account], blockNumber }),
    context.client.readContract({ address: stakingAddress, abi: stakingAbi, functionName: 'rawPowerOf', args: [account], blockNumber }),
    context.client.readContract({ address: stakingAddress, abi: stakingAbi, functionName: 'delegates', args: [account], blockNumber }),
    context.client.readContract({ address: stakingAddress, abi: stakingAbi, functionName: 'getVotes', args: [account], blockNumber }),
    context.client.readContract({ address: stakingAddress, abi: stakingAbi, functionName: 'verifiedAccounts', args: [account], blockNumber }),
  ]);
  const [amount, unlockTime, duration] = position as readonly [bigint, bigint, bigint];
  const verification = { ok: true, blockNumber: blockNumber.toString(), logIndex: matchingLogIndex, confirmations: context.confirmations } as const;
  return {
    verification,
    position: {
      userId,
      walletAddress: walletAddress.toLocaleLowerCase(),
      amountUnits: amount.toString(),
      unlockTime: unlockTime > 0n ? new Date(Number(unlockTime) * 1_000).toISOString() : null,
      durationSeconds: Number(duration),
      reputationBps: Number(reputationBps),
      rawPower: (rawPower as bigint).toString(),
      delegatedTo: (delegatee as Address).toLocaleLowerCase() === '0x0000000000000000000000000000000000000000' ? null : (delegatee as Address).toLocaleLowerCase(),
      votingPower: (votingPower as bigint).toString(),
      verified: Boolean(verified),
      lastTxHash: txHash,
      lastBlockNumber: blockNumber.toString(),
      lastLogIndex: matchingLogIndex,
      updatedAt,
    },
  };
}

export async function readGovernancePowerSnapshot(
  env: YdChainEnv,
  proposalId: string,
  candidates: Array<{ userId: string; walletAddress: string }>,
  requestedSnapshotBlock: bigint | null,
  createdAt: string,
): Promise<{ electorate: GovernancePowerSnapshot[]; eligiblePower: string; snapshotBlock: string }> {
  const value = config(env);
  if (!value.rpcUrl || !isAddress(value.stakingAddress)) throw new Error('YD_CHAIN_NOT_CONFIGURED');
  const client = createPublicClient({ transport: http(value.rpcUrl) });
  const [currentBlock, networkChainId] = await Promise.all([client.getBlockNumber(), client.getChainId()]);
  if (networkChainId !== value.chainId) throw new Error('WRONG_YD_CHAIN');
  const snapshotBlock = selectFinalizedSnapshotBlock(currentBlock, value.confirmations, requestedSnapshotBlock);
  const snapshot = await client.getBlock({ blockNumber: snapshotBlock });
  const validCandidates = candidates.filter((candidate) => isAddress(candidate.walletAddress));
  if (validCandidates.length > 500) throw new Error('YD_GOVERNANCE_ELECTORATE_LIMIT');
  const seenWallets = new Set<string>();
  for (const candidate of validCandidates) {
    const wallet = candidate.walletAddress.toLocaleLowerCase();
    if (seenWallets.has(wallet)) throw new Error('YD_WALLET_IDENTITY_CONFLICT');
    seenWallets.add(wallet);
  }
  const states: Array<GovernanceDelegationState & { amount: bigint; unlockTime: bigint }> = [];
  for (let offset = 0; offset < validCandidates.length; offset += 20) {
    const batch = validCandidates.slice(offset, offset + 20);
    const rows = await Promise.all(batch.map(async (candidate) => {
      const account = candidate.walletAddress as Address;
      const [position, rawPower, verified, power, delegatee] = await Promise.all([
        client.readContract({ address: value.stakingAddress as Address, abi: stakingAbi, functionName: 'positions', args: [account], blockNumber: snapshotBlock }),
        client.readContract({ address: value.stakingAddress as Address, abi: stakingAbi, functionName: 'rawPowerOf', args: [account], blockNumber: snapshotBlock }),
        client.readContract({ address: value.stakingAddress as Address, abi: stakingAbi, functionName: 'verifiedAccounts', args: [account], blockNumber: snapshotBlock }),
        client.readContract({ address: value.stakingAddress as Address, abi: stakingAbi, functionName: 'getPastVotes', args: [account, snapshotBlock] }),
        client.readContract({ address: value.stakingAddress as Address, abi: stakingAbi, functionName: 'delegates', args: [account], blockNumber: snapshotBlock }),
      ]);
      const [amount, unlockTime] = position as readonly [bigint, bigint, bigint];
      const delegatedAddress = (delegatee as Address).toLocaleLowerCase();
      return {
        userId: candidate.userId,
        walletAddress: candidate.walletAddress.toLocaleLowerCase(),
        amount,
        unlockTime,
        rawPower: rawPower as bigint,
        votingPower: power as bigint,
        delegatee: delegatedAddress === '0x0000000000000000000000000000000000000000' ? null : delegatedAddress,
        verified: Boolean(verified),
      };
    }));
    states.push(...rows);
  }
  for (const state of states) {
    if (governancePowerRequiresSync({
      amount: state.amount,
      unlockTime: state.unlockTime,
      rawPower: state.rawPower,
      verified: state.verified,
      snapshotTimestamp: snapshot.timestamp,
    })) throw new Error('YD_POWER_REQUIRES_SYNC');
  }
  const reconciled = reconcileGovernanceDelegations(states);
  const electorate: GovernancePowerSnapshot[] = states.flatMap((state) => {
    const voting = reconciled.get(state.walletAddress) ?? { power: 0n, delegateSources: [] };
    return voting.power > 0n ? [{
      proposalId,
      userId: state.userId,
      walletAddress: state.walletAddress,
      power: voting.power.toString(),
      delegateSources: voting.delegateSources,
      createdAt,
    }] : [];
  });
  const eligiblePower = electorate.reduce((sum, item) => sum + BigInt(item.power), 0n);
  return { electorate, eligiblePower: eligiblePower.toString(), snapshotBlock: snapshotBlock.toString() };
}
