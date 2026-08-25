import { describe, expect, it } from 'vitest';
import { arbitrationQuorum, evaluateArbitrationProposal } from './arbitration';
import type { ArbitrationProposal } from './contracts';

function proposal(overrides: Partial<ArbitrationProposal> = {}): ArbitrationProposal {
  return {
    id: 'PROP-TEST',
    disputeId: 'DSP-TEST',
    proposerId: 'admin-1',
    status: 'active',
    weightMode: 'one_person_one_vote',
    votingStartsAt: '2026-08-23T00:00:00.000Z',
    votingEndsAt: '2026-08-26T00:00:00.000Z',
    quorumRequired: 2,
    eligibleWeight: 3,
    supportVotes: 0,
    opposeVotes: 0,
    abstainVotes: 0,
    outcome: null,
    finalizedAt: null,
    finalizedBy: null,
    executedAt: null,
    executedBy: null,
    createdAt: '2026-08-23T00:00:00.000Z',
    ...overrides,
  };
}

describe('DAO arbitration counting policy', () => {
  it('uses a 60 percent quorum rounded up', () => {
    expect(arbitrationQuorum(1)).toBe(1);
    expect(arbitrationQuorum(3)).toBe(2);
    expect(arbitrationQuorum(5)).toBe(3);
  });

  it('finalizes early only when the winning result is irreversible', () => {
    expect(evaluateArbitrationProposal(proposal({ supportVotes: 1 }), '2026-08-24T00:00:00.000Z').finalizable).toBe(false);
    expect(evaluateArbitrationProposal(proposal({ supportVotes: 2 }), '2026-08-24T00:00:00.000Z')).toMatchObject({
      finalizable: true,
      status: 'succeeded',
      outcome: 'refund_requester',
    });
  });

  it('does not turn abstentions or a tie into settlement authorization', () => {
    expect(evaluateArbitrationProposal(proposal({ abstainVotes: 3 }), '2026-08-24T00:00:00.000Z')).toMatchObject({
      status: 'inconclusive',
      outcome: null,
    });
    expect(evaluateArbitrationProposal(proposal({ supportVotes: 1, opposeVotes: 1, abstainVotes: 1 }), '2026-08-24T00:00:00.000Z')).toMatchObject({
      status: 'inconclusive',
      outcome: null,
    });
  });

  it('keeps funds frozen when the deadline passes without quorum', () => {
    expect(evaluateArbitrationProposal(proposal({ supportVotes: 1 }), '2026-08-26T00:00:00.000Z')).toMatchObject({
      status: 'quorum_failed',
      outcome: null,
    });
  });
});
