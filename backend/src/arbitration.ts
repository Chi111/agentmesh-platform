import type { ArbitrationProposal, ArbitrationProposalStatus } from './contracts';

export const ARBITRATION_VOTING_PERIOD_MS = 72 * 60 * 60 * 1_000;
export const ARBITRATION_QUORUM_BPS = 6_000;

export function arbitrationQuorum(totalWeight: number): number {
  return Math.max(1, Math.ceil((Math.max(0, totalWeight) * ARBITRATION_QUORUM_BPS) / 10_000));
}

export function arbitrationVotingEndsAt(startedAt: string): string {
  return new Date(Date.parse(startedAt) + ARBITRATION_VOTING_PERIOD_MS).toISOString();
}

export interface ArbitrationFinalization {
  finalizable: boolean;
  status: ArbitrationProposalStatus;
  outcome: ArbitrationProposal['outcome'];
}

export function evaluateArbitrationProposal(
  proposal: Pick<ArbitrationProposal, 'status' | 'eligibleWeight' | 'quorumRequired' | 'supportVotes' | 'opposeVotes' | 'abstainVotes' | 'votingEndsAt' | 'outcome'>,
  now: string,
): ArbitrationFinalization {
  if (proposal.status !== 'active') {
    return { finalizable: false, status: proposal.status, outcome: proposal.outcome };
  }

  const participated = proposal.supportVotes + proposal.opposeVotes + proposal.abstainVotes;
  const remaining = Math.max(0, proposal.eligibleWeight - participated);
  const quorumReached = participated >= proposal.quorumRequired;
  const deadlineReached = Date.parse(now) >= Date.parse(proposal.votingEndsAt);
  const everyoneVoted = remaining === 0;
  const refundIrreversible = quorumReached && proposal.supportVotes > proposal.opposeVotes + remaining;
  const rejectIrreversible = quorumReached && proposal.opposeVotes > proposal.supportVotes + remaining;

  if (!deadlineReached && !everyoneVoted && !refundIrreversible && !rejectIrreversible) {
    return { finalizable: false, status: 'active', outcome: null };
  }
  if (!quorumReached) {
    return deadlineReached || everyoneVoted
      ? { finalizable: true, status: 'quorum_failed', outcome: null }
      : { finalizable: false, status: 'active', outcome: null };
  }
  if (proposal.supportVotes > proposal.opposeVotes) {
    return { finalizable: true, status: 'succeeded', outcome: 'refund_requester' };
  }
  if (proposal.opposeVotes > proposal.supportVotes) {
    return { finalizable: true, status: 'defeated', outcome: 'reject_dispute' };
  }
  return deadlineReached || everyoneVoted
    ? { finalizable: true, status: 'inconclusive', outcome: null }
    : { finalizable: false, status: 'active', outcome: null };
}
