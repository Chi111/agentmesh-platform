import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hex,
} from 'viem';
import type {
  EcosystemProposal,
  EcosystemProposalStatus,
  RewardAllocation,
  RewardActivity,
  RewardEpoch,
} from './contracts';

export const REWARD_FORMULA_VERSION = 'agentmesh-yd-v1';
export const DEFAULT_REWARD_ROLE_BPS = {
  requester: 2_500,
  agent_owner: 10_000,
  arbitrator: 1_000,
} as const;

export function rewardScoreMicros(
  settledAmount: number,
  role: keyof typeof DEFAULT_REWARD_ROLE_BPS,
  qualityBps = 10_000,
  penaltyBps = 0,
): number {
  if (!Number.isFinite(settledAmount) || settledAmount < 0) throw new Error('INVALID_SETTLED_AMOUNT');
  if (!Number.isInteger(qualityBps) || qualityBps < 0 || qualityBps > 20_000) throw new Error('INVALID_QUALITY_BPS');
  if (!Number.isInteger(penaltyBps) || penaltyBps < 0 || penaltyBps > 10_000) throw new Error('INVALID_PENALTY_BPS');
  const baseMicros = Math.floor(Math.sqrt(settledAmount) * 1_000_000);
  const roleAdjusted = Math.floor(baseMicros * DEFAULT_REWARD_ROLE_BPS[role] / 10_000);
  const qualityAdjusted = Math.floor(roleAdjusted * qualityBps / 10_000);
  return Math.max(0, Math.floor(qualityAdjusted * (10_000 - penaltyBps) / 10_000));
}

export interface RewardAccountScore {
  userId: string;
  walletAddress: Address;
  effectiveScore: number;
}

export interface RewardMerkleAllocation extends RewardAccountScore {
  amountUnits: string;
  leafHash: Hex;
  proof: Hex[];
}

function hexCompare(left: Hex, right: Hex): number {
  return left.toLocaleLowerCase().localeCompare(right.toLocaleLowerCase());
}

function hashPair(left: Hex, right: Hex): Hex {
  const [first, second] = hexCompare(left, right) <= 0 ? [left, right] : [right, left];
  return keccak256(`0x${first.slice(2)}${second.slice(2)}`);
}

export function rewardLeaf(
  chainId: number,
  distributorAddress: Address,
  epochNumber: number,
  walletAddress: Address,
  amountUnits: bigint,
): Hex {
  return keccak256(encodeAbiParameters(
    parseAbiParameters('uint256 chainId, address distributor, uint256 epochId, address account, uint256 amount'),
    [BigInt(chainId), distributorAddress, BigInt(epochNumber), walletAddress, amountUnits],
  ));
}

function merkleLayers(leaves: Hex[]): Hex[][] {
  if (leaves.length === 0) return [];
  const layers = [leaves];
  while (layers.at(-1)!.length > 1) {
    const current = layers.at(-1)!;
    const next: Hex[] = [];
    for (let index = 0; index < current.length; index += 2) {
      next.push(index + 1 < current.length ? hashPair(current[index], current[index + 1]) : current[index]);
    }
    layers.push(next);
  }
  return layers;
}

function proofFor(layers: Hex[][], leafIndex: number): Hex[] {
  const proof: Hex[] = [];
  let index = leafIndex;
  for (let depth = 0; depth < layers.length - 1; depth += 1) {
    const sibling = index % 2 === 0 ? index + 1 : index - 1;
    if (sibling < layers[depth].length) proof.push(layers[depth][sibling]);
    index = Math.floor(index / 2);
  }
  return proof;
}

export function verifyRewardProof(leaf: Hex, proof: Hex[], root: Hex): boolean {
  return proof.reduce((current, sibling) => hashPair(current, sibling), leaf).toLocaleLowerCase() === root.toLocaleLowerCase();
}

export function allocateRewardEpoch(input: {
  epochNumber: number;
  chainId: number;
  distributorAddress: Address;
  totalRewardUnits: bigint;
  accountScoreCap: number;
  activities: RewardActivity[];
  wallets: Map<string, Address>;
}): { merkleRoot: Hex; manifestHash: Hex; allocations: RewardMerkleAllocation[] } {
  if (input.totalRewardUnits <= 0n) throw new Error('INVALID_REWARD_POOL');
  const scores = new Map<string, number>();
  const fixed = new Map<string, bigint>();
  const sources = new Set<string>();
  for (const activity of input.activities) {
    if (!activity.eligible || activity.scoreMicros <= 0) continue;
    const fixedUnits = activity.detail.source === 'reviewed_arbitration_work' ? activity.detail.fixedRewardUnits : null;
    const wallet = input.wallets.get(activity.userId);
    if (fixedUnits !== null) {
      if (sources.has(activity.sourceKey)) continue;
      sources.add(activity.sourceKey);
      if (activity.role !== 'arbitrator' || typeof fixedUnits !== 'string' || !/^[1-9][0-9]*$/.test(fixedUnits)) throw new Error('INVALID_FIXED_REWARD');
      if (!wallet) throw new Error('FIXED_REWARD_WALLET_REQUIRED');
      fixed.set(activity.userId, (fixed.get(activity.userId) ?? 0n) + BigInt(fixedUnits));
    } else if (wallet) {
      scores.set(activity.userId, Math.min(input.accountScoreCap, (scores.get(activity.userId) ?? 0) + activity.scoreMicros));
    }
  }
  const accounts = [...new Set([...scores.keys(), ...fixed.keys()])]
    .map(userId => ({ userId, walletAddress: input.wallets.get(userId)!, effectiveScore: scores.get(userId) ?? 0 }))
    .sort((left, right) => left.walletAddress.toLocaleLowerCase().localeCompare(right.walletAddress.toLocaleLowerCase()));
  if (accounts.length === 0) throw new Error('NO_ELIGIBLE_REWARD_ACCOUNTS');
  const fixedTotal = [...fixed.values()].reduce((sum, value) => sum + value, 0n);
  if (fixedTotal > input.totalRewardUnits) throw new Error('FIXED_REWARD_POOL_INSUFFICIENT');
  const variablePool = input.totalRewardUnits - fixedTotal;
  const totalScore = accounts.reduce((sum, account) => sum + BigInt(account.effectiveScore), 0n);
  const variableAmounts = accounts.map(account => totalScore ? variablePool * BigInt(account.effectiveScore) / totalScore : 0n);
  let remainder = totalScore ? variablePool - variableAmounts.reduce((sum, amount) => sum + amount, 0n) : 0n;
  const remainderOrder = accounts.map((account, index) => ({ index, account })).filter(item => item.account.effectiveScore > 0)
    .sort((left, right) => right.account.effectiveScore - left.account.effectiveScore || left.account.userId.localeCompare(right.account.userId));
  for (let cursor = 0; remainder > 0n; cursor += 1) {
    variableAmounts[remainderOrder[cursor % remainderOrder.length].index] += 1n;
    remainder -= 1n;
  }
  // A fixed-only epoch leaves surplus unallocated for the existing expiry/reclaim flow.
  const amounts = accounts.map((account, index) => variableAmounts[index] + (fixed.get(account.userId) ?? 0n));

  const fundedAccounts = accounts
    .map((account, index) => ({ account, amount: amounts[index] }))
    .filter((item) => item.amount > 0n);
  const leaves = fundedAccounts.map(({ account, amount }) => rewardLeaf(
    input.chainId,
    input.distributorAddress,
    input.epochNumber,
    account.walletAddress,
    amount,
  ));
  const layers = merkleLayers(leaves);
  const merkleRoot = layers.at(-1)![0];
  const allocations = fundedAccounts.map(({ account, amount }, index) => ({
    ...account,
    // Existing allocation schema requires a positive score; fixed fees do not use this sentinel for proportional allocation.
    effectiveScore: Math.max(1, account.effectiveScore),
    amountUnits: amount.toString(),
    leafHash: leaves[index],
    proof: proofFor(layers, index),
  }));
  const manifestHash = keccak256(encodeAbiParameters(
    parseAbiParameters('bytes32 root, uint256 totalReward, uint256 accountCount'),
    [merkleRoot, input.totalRewardUnits, BigInt(allocations.length)],
  ));
  return { merkleRoot, manifestHash, allocations };
}

export function evaluateEcosystemProposal(
  proposal: EcosystemProposal,
  now: string,
  voterCount: number,
  electorateCount: number,
): { finalizable: boolean; status: EcosystemProposalStatus; quorumRequired: bigint } {
  const eligible = BigInt(proposal.eligiblePower);
  const forPower = BigInt(proposal.forPower);
  const againstPower = BigInt(proposal.againstPower);
  const abstainPower = BigInt(proposal.abstainPower);
  const participated = forPower + againstPower + abstainPower;
  const quorumRequired = (eligible * BigInt(proposal.quorumBps) + 9_999n) / 10_000n;
  const finalizable = Date.parse(now) >= Date.parse(proposal.endsAt) || (electorateCount > 0 && voterCount >= electorateCount);
  if (!finalizable) return { finalizable: false, status: 'active', quorumRequired };
  if (participated < quorumRequired) return { finalizable: true, status: 'quorum_failed', quorumRequired };
  const decisive = forPower + againstPower;
  if (decisive === 0n) return { finalizable: true, status: 'defeated', quorumRequired };
  const approved = forPower > againstPower && forPower * 10_000n >= decisive * BigInt(proposal.approvalBps);
  return { finalizable: true, status: approved ? 'succeeded' : 'defeated', quorumRequired };
}

export function publicRewardAllocation(allocation: RewardAllocation): RewardAllocation {
  return { ...allocation, proof: [] };
}

export function epochAcceptsActivity(epoch: RewardEpoch, activity: RewardActivity): boolean {
  return epoch.status === 'draft'
    && Date.parse(activity.occurredAt) >= Date.parse(epoch.startsAt)
    && Date.parse(activity.occurredAt) < Date.parse(epoch.endsAt);
}
