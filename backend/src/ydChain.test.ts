import { describe, expect, it } from 'vitest';
import {
  governancePowerRequiresSync,
  reconcileGovernanceDelegations,
  selectFinalizedSnapshotBlock,
} from './ydChain';

describe('YD governance snapshot safety', () => {
  it('only selects blocks behind the configured confirmation depth', () => {
    expect(selectFinalizedSnapshotBlock(100n, 2, null)).toBe(98n);
    expect(selectFinalizedSnapshotBlock(100n, 2, 97n)).toBe(97n);
    expect(() => selectFinalizedSnapshotBlock(100n, 2, 99n)).toThrow('YD_SNAPSHOT_NOT_FINALIZED');
  });

  it('requires a checkpoint for expired, revoked or inconsistent raw Power', () => {
    const active = { amount: 100n, unlockTime: 1_001n, rawPower: 10n, verified: true, snapshotTimestamp: 1_000n };
    expect(governancePowerRequiresSync(active)).toBe(false);
    expect(governancePowerRequiresSync({ ...active, unlockTime: 1_000n })).toBe(true);
    expect(governancePowerRequiresSync({ ...active, verified: false })).toBe(true);
    expect(governancePowerRequiresSync({ ...active, amount: 0n })).toBe(true);
    expect(governancePowerRequiresSync({ ...active, rawPower: 0n, verified: false })).toBe(false);
  });

  it('accepts only voting Power fully explained by linked verified delegation sources', () => {
    const states = [
      { userId: 'a', walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', rawPower: 4n, votingPower: 0n, delegatee: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', verified: true },
      { userId: 'b', walletAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', rawPower: 6n, votingPower: 10n, delegatee: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', verified: true },
    ];
    expect(reconcileGovernanceDelegations(states).get(states[1].walletAddress)).toEqual({
      power: 10n,
      delegateSources: [states[0].walletAddress, states[1].walletAddress],
    });
    expect(() => reconcileGovernanceDelegations([{ ...states[1], votingPower: 11n }])).toThrow('YD_DELEGATION_REQUIRES_RECONCILIATION');
    expect(() => reconcileGovernanceDelegations([{ ...states[1], verified: false }])).toThrow('YD_DELEGATION_REQUIRES_RECONCILIATION');
  });
});
