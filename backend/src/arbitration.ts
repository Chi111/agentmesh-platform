import type { ArbitrationProposal, ArbitrationProposalStatus } from './contracts';

export const ARBITRATION_VOTING_PERIOD_MS = 72 * 60 * 60 * 1_000;
export const ARBITRATION_APPEAL_PERIOD_MS = 72 * 60 * 60 * 1_000;
export const ARBITRATION_QUORUM_BPS = 6_000;

export function arbitrationQuorum(totalWeight: number): number {
  return Math.max(1, Math.ceil((Math.max(0, totalWeight) * ARBITRATION_QUORUM_BPS) / 10_000));
}

export function arbitrationVotingEndsAt(startedAt: string): string {
  return new Date(Date.parse(startedAt) + ARBITRATION_VOTING_PERIOD_MS).toISOString();
}

export function arbitrationAppealEndsAt(finalizedAt: string): string {
  return new Date(Date.parse(finalizedAt) + ARBITRATION_APPEAL_PERIOD_MS).toISOString();
}

export function arbitrationWeightVersion(mode: ArbitrationProposal['weightMode']): ArbitrationProposal['weightVersion'] {
  return mode === 'power' ? 'member_power.v1' : 'one_person_one_vote.v1';
}

export function arbitrationVoteWeight(mode: ArbitrationProposal['weightMode'], power: number): number {
  return mode === 'power' ? Math.max(1, Math.floor(power)) : 1;
}

export function arbitrationExecutionReady(proposal: ArbitrationProposal | null, hasAppeal: boolean, now: string): boolean {
  const validOutcome = proposal?.status === 'succeeded' && proposal.outcome === 'refund_requester'
    || proposal?.status === 'defeated' && proposal.outcome === 'reject_dispute';
  if (!proposal || !validOutcome) return false;
  if (proposal.round === 1) return true;
  return !hasAppeal && Boolean(proposal.appealDeadlineAt)
    && Date.parse(now) >= Date.parse(proposal.appealDeadlineAt!);
}

export async function arbitrationExecutionPayloadHash(
  disputeId: string,
  proposalId: string,
  action: 'refund_requester' | 'reject_dispute',
): Promise<string> {
  const payload = JSON.stringify({ action, disputeId, proposalId, scope: 'task_dispute', version: 1 });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
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
