# YD Rewards and Governance

AgentMesh keeps four ledgers separate:

1. task settlement (`mUSDC`, `sETH`, or Web2 CREDIT),
2. real yield (not implemented in this release),
3. YD contribution rewards,
4. non-transferable governance Power.

The Phase 1/2 implementation does not modify `AgentMeshEscrow` and never uses escrowed task funds to pay YD rewards.

## Release scope

- `YDRewardDistributor`: immutable, Treasury-prefunded Merkle reward epochs. It has no mint function.
- `YDStaking`: verified-account YD locks, reputation-adjusted Power, delegation and historical checkpoints.
- `TestYDToken`: fixed-supply Sepolia mapping token for testing only.
- D1 reward activities, epochs, allocations, claims, staking read models, governance snapshots and votes.
- Worker APIs that verify chain receipts/events before recording claims, publications or staking state.
- `/yd-finance`: reward claim, staking, delegation and ecosystem voting UI.

Not included: Earn Vaults, real APY, real DeFi strategies, cross-chain YD, task-dispute token voting, or runtime mutation of task escrow.

## Phase 0 deployment gate

Do not configure a legacy YD address until an evidence-backed audit records:

- chain ID, contract address, bytecode/source match and deployment transaction;
- token name, symbol, decimals and total supply;
- mint, burn, pause, blacklist, upgrade and ownership/admin capabilities;
- mint cap and current minter/admin/pauser role holders;
- top holder concentration, Treasury balance and known legacy-user balances;
- whether AgentMesh has a legally and technically valid distribution allocation;
- multisig/timelock ownership and emergency role-separation plan;
- whether the token already implements `ERC20Votes` (not required here because Power lives in `YDStaking`);
- a signed decision to reuse the token or deploy the Sepolia-only mapping version.

Mainnet remains blocked until contract audit and economic-model stress testing are complete.

## Sepolia deployment

Compile and deploy without writing a private key to repository files:

```bash
SEPOLIA_RPC_URL=... \
SEPOLIA_PRIVATE_KEY=... \
YD_ADMIN_ADDRESS=0x... \
YD_TREASURY_ADDRESS=0x... \
YD_TOKEN_ADDRESS=0x... \
npm run deploy:yd:sepolia
```

For the fixed-supply Sepolia test token only, omit `YD_TOKEN_ADDRESS` and explicitly set:

```bash
YD_DEPLOY_TEST_TOKEN=true YD_TEST_SUPPLY=100000000 npm run deploy:yd:sepolia
```

The script verifies the chain and deployed constructor state. It does not publish roots or move Treasury funds.

## Runtime configuration

Configure matching Worker secrets/runtime variables:

- `YD_RPC_URL`
- `YD_CHAIN_ID=11155111`
- `YD_TOKEN_ADDRESS`
- `YD_DISTRIBUTOR_ADDRESS`
- `YD_STAKING_ADDRESS`
- `YD_TOKEN_DECIMALS`
- `YD_MIN_CONFIRMATIONS` (recommended: `2` or more)
- `YD_TESTNET=true`

Configure matching public frontend values using the `VITE_YD_*` names in `frontend/.env.example`. Contract addresses and chain IDs are public configuration; RPC credentials and private keys are not.

## Reward epoch runbook

1. Treasury transfers the fixed epoch pool to `YDRewardDistributor`.
2. An admin creates a D1 epoch after choosing the activity and claim windows.
3. After the activity window closes, the Worker computes capped account scores, exact-pool allocations and the Merkle manifest.
   The computed/published epoch endpoint exposes wallet addresses, effective scores, amounts and leaf hashes without platform user IDs, so anyone can reproduce the root from the public manifest.
4. A wallet with `ROOT_MANAGER_ROLE` publishes the exact root, amount and claim deadline.
5. The Worker verifies `EpochPublished` before marking the epoch published.
6. Users claim with their linked wallet; the Worker verifies `RewardClaimed` and records the claim idempotently.
7. After expiry, the Treasury role may sweep only the unclaimed commitment.

If a valid on-chain claim was not synchronized before the sweep, its historical `RewardClaimed` transaction can still be synchronized after the D1 epoch is marked expired. The verified event corrects that allocation from `expired` to `claimed`; no second transfer is made.

Reward roots are immutable. Corrections require a new epoch, not a root replacement.

## Staking and governance runbook

1. A role-separated account with `ACCOUNT_VERIFIER_ROLE` verifies a wallet already bound to an AgentMesh profile.
2. `REPUTATION_MANAGER_ROLE` may set the bounded reputation coefficient (0.5–1.5x).
3. The user locks YD for 30–730 days. The contract checkpoints Power through OpenZeppelin `Votes`.
4. Revoking account verification immediately removes its Power. An expired lock also has zero effective Power, but checkpointed voting units require a transaction; anyone may call `syncExpiredPower(account)` before a snapshot.
5. Ecosystem proposal creation reads `getPastVotes` at a confirmation-safe historical block and persists an immutable electorate. A requested block newer than the safe head is rejected.
6. Before accepting a snapshot, the Worker checks every linked electorate wallet at that block. Stale Power from an expired/revoked/inconsistent position fails with `YD_POWER_REQUIRES_SYNC`; call the permissionless cleanup, wait for confirmations, and create the proposal at a later block.
7. The Worker also reconstructs delegation from linked, verified source wallets and requires it to exactly match checkpointed `getPastVotes`. Unknown/unlinked sources or votes still delegated to a revoked target fail with `YD_DELEGATION_REQUIRES_RECONCILIATION`; revoke the unknown source or have the linked source re-delegate, then wait for a finalized block.
8. Each snapshot wallet can vote once. Later purchases, transfers, delegation changes or account-role changes do not alter the proposal.
9. Finalization checks Power quorum and approval thresholds. It records a governance result only; v1 does not execute arbitrary payload calls.

Task disputes remain on the separate committee one-person-one-vote path.

## Incident controls

- Pause the distributor to stop claims/publication; committed funds remain reserved.
- Pause staking to stop new locks/increases while allowing emergency withdrawal.
- Revoke compromised operational roles and rotate to a multisig.
- Never recover distributor funds below `outstandingCommitments`.
- Wait for configured confirmations and resync only monotonically newer staking events.
- Do not display “APY” or “real yield” while `earnVaultEnabled` is false.
