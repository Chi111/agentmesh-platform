import { describe, expect, it } from 'vitest';
import type { EcosystemProposal, RewardActivity } from './contracts';
import {
  allocateRewardEpoch,
  evaluateEcosystemProposal,
  rewardScoreMicros,
  verifyRewardProof,
} from './ydFinance';

const distributor = '0x1111111111111111111111111111111111111111';
const walletA = '0x2222222222222222222222222222222222222222';
const walletB = '0x3333333333333333333333333333333333333333';

function activity(userId: string, scoreMicros: number): RewardActivity {
  return {
    id: `ACT-${userId}`,
    sourceKey: `source:${userId}`,
    userId,
    missionId: 'TASK-1',
    disputeId: null,
    role: 'agent_owner',
    formulaVersion: 'agentmesh-yd-v1',
    asset: 'mUSDC',
    settledAmount: 100,
    qualityBps: 10_000,
    penaltyBps: 0,
    scoreMicros,
    eligible: true,
    detail: {},
    occurredAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
  };
}

describe('YD reward allocation', () => {
  it('uses sqrt scoring and role/penalty factors', () => {
    expect(rewardScoreMicros(100, 'agent_owner')).toBe(10_000_000);
    expect(rewardScoreMicros(100, 'requester')).toBe(2_500_000);
    expect(rewardScoreMicros(100, 'agent_owner', 12_000, 5_000)).toBe(6_000_000);
  });

  it('allocates the exact pool deterministically and produces valid proofs', () => {
    const result = allocateRewardEpoch({
      epochNumber: 1,
      chainId: 11155111,
      distributorAddress: distributor,
      totalRewardUnits: 101n,
      accountScoreCap: 1_000,
      activities: [activity('user-a', 100), activity('user-b', 300), activity('user-b', 900)],
      wallets: new Map([['user-a', walletA], ['user-b', walletB]]),
    });
    expect(result.allocations.map((item) => BigInt(item.amountUnits)).reduce((sum, amount) => sum + amount, 0n)).toBe(101n);
    expect(result.allocations.find((item) => item.userId === 'user-b')?.amountUnits).toBe('92');
    for (const allocation of result.allocations) {
      expect(verifyRewardProof(allocation.leafHash, allocation.proof, result.merkleRoot)).toBe(true);
    }
    const replay = allocateRewardEpoch({
      epochNumber: 1,
      chainId: 11155111,
      distributorAddress: distributor,
      totalRewardUnits: 101n,
      accountScoreCap: 1_000,
      activities: [activity('user-b', 900), activity('user-a', 100), activity('user-b', 300)],
      wallets: new Map([['user-b', walletB], ['user-a', walletA]]),
    });
    expect(replay.merkleRoot).toBe(result.merkleRoot);
  });

  it('omits zero-value leaves when the pool is smaller than the electorate', () => {
    const result = allocateRewardEpoch({
      epochNumber: 2,
      chainId: 11155111,
      distributorAddress: distributor,
      totalRewardUnits: 1n,
      accountScoreCap: 1_000,
      activities: [activity('user-a', 100), activity('user-b', 100)],
      wallets: new Map([['user-a', walletA], ['user-b', walletB]]),
    });
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].amountUnits).toBe('1');
    expect(verifyRewardProof(result.allocations[0].leafHash, result.allocations[0].proof, result.merkleRoot)).toBe(true);
  });
});

describe('ecosystem governance', () => {
  const proposal: EcosystemProposal = {
    id: 'GOV-1', proposalNumber: 1, proposerId: 'admin', proposalType: 'reward_weights', title: '调整奖励权重',
    description: '测试提案', payload: {}, status: 'active', snapshotBlock: '100', startsAt: '2026-08-01T00:00:00.000Z',
    endsAt: '2026-08-04T00:00:00.000Z', quorumBps: 2_000, approvalBps: 5_001, eligiblePower: '100',
    forPower: '40', againstPower: '10', abstainPower: '0', finalizedAt: null, finalizedBy: null,
    createdAt: '2026-08-01T00:00:00.000Z',
  };

  it('requires the deadline or every voter before finalizing', () => {
    expect(evaluateEcosystemProposal(proposal, '2026-08-02T00:00:00.000Z', 1, 3).finalizable).toBe(false);
  });

  it('uses snapshotted Power, quorum and strict approval', () => {
    expect(evaluateEcosystemProposal(proposal, '2026-08-05T00:00:00.000Z', 1, 3).status).toBe('succeeded');
    expect(evaluateEcosystemProposal({ ...proposal, forPower: '5', againstPower: '0' }, '2026-08-05T00:00:00.000Z', 1, 3).status).toBe('quorum_failed');
    expect(evaluateEcosystemProposal({ ...proposal, forPower: '25', againstPower: '25' }, '2026-08-05T00:00:00.000Z', 2, 3).status).toBe('defeated');
  });
});

describe('fixed arbitration compensation', () => {
  const fixed = { ...activity('user-a', 1), role: 'arbitrator' as const, detail: { source: 'reviewed_arbitration_work', fixedRewardUnits: '30' } };
  const input = {epochNumber:1,chainId:11155111,distributorAddress:distributor,totalRewardUnits:101n,accountScoreCap:1000,wallets:new Map([['user-a',walletA],['user-b',walletB]])};
  it('honors the fixed amount before distributing variable rewards and deduplicates fixed work', () => {
    const result=allocateRewardEpoch({...input,activities:[fixed,fixed,activity('user-b',100)]});
    expect(result.allocations.find(a=>a.userId==='user-a')?.amountUnits).toBe('30');
    expect(result.allocations.find(a=>a.userId==='user-b')?.amountUnits).toBe('71');
    for(const a of result.allocations)expect(verifyRewardProof(a.leafHash,a.proof,result.merkleRoot)).toBe(true);
  });
  it('does not inflate a fixed-only fee to consume the whole epoch budget', () => {
    expect(allocateRewardEpoch({...input,activities:[fixed]}).allocations[0].amountUnits).toBe('30');
  });
  it('refuses to haircut promised fees or silently discard an unlinked wallet', () => {
    expect(()=>allocateRewardEpoch({...input,totalRewardUnits:29n,activities:[fixed]})).toThrow('FIXED_REWARD_POOL_INSUFFICIENT');
    expect(()=>allocateRewardEpoch({...input,wallets:new Map(),activities:[fixed]})).toThrow('FIXED_REWARD_WALLET_REQUIRED');
  });
});
