-- YD rewards, staking read model and ecosystem governance.
-- This migration is additive and does not alter AgentMeshEscrow or task settlement tables.

CREATE TABLE IF NOT EXISTS reward_epochs (
  id                    TEXT PRIMARY KEY,
  epoch_number          INTEGER NOT NULL UNIQUE CHECK (epoch_number > 0),
  status                TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'computed', 'published', 'expired')),
  starts_at             TEXT NOT NULL,
  ends_at               TEXT NOT NULL,
  claim_ends_at         TEXT NOT NULL,
  total_reward_units    TEXT NOT NULL CHECK (length(total_reward_units) > 0),
  account_score_cap     INTEGER NOT NULL CHECK (account_score_cap > 0),
  formula_version       TEXT NOT NULL,
  rules_json            TEXT NOT NULL DEFAULT '{}',
  chain_id              INTEGER NOT NULL CHECK (chain_id > 0),
  distributor_address   TEXT NOT NULL,
  merkle_root           TEXT,
  manifest_hash         TEXT,
  publish_tx_hash       TEXT,
  computed_at           TEXT,
  published_at          TEXT,
  created_by            TEXT NOT NULL REFERENCES profiles(id),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  CHECK (julianday(ends_at) > julianday(starts_at)),
  CHECK (julianday(claim_ends_at) > julianday(ends_at))
);

CREATE INDEX IF NOT EXISTS idx_reward_epochs_status
  ON reward_epochs(status, starts_at DESC);

CREATE TABLE IF NOT EXISTS reward_activities (
  id                    TEXT PRIMARY KEY,
  source_key            TEXT NOT NULL UNIQUE,
  user_id               TEXT NOT NULL REFERENCES profiles(id),
  mission_id            TEXT REFERENCES missions(id),
  dispute_id            TEXT REFERENCES disputes(id),
  role                  TEXT NOT NULL CHECK (role IN ('requester', 'agent_owner', 'arbitrator')),
  formula_version       TEXT NOT NULL,
  asset                 TEXT NOT NULL,
  settled_amount        REAL NOT NULL CHECK (settled_amount >= 0),
  quality_bps           INTEGER NOT NULL CHECK (quality_bps BETWEEN 0 AND 20000),
  penalty_bps           INTEGER NOT NULL CHECK (penalty_bps BETWEEN 0 AND 10000),
  score_micros          INTEGER NOT NULL CHECK (score_micros >= 0),
  eligible              INTEGER NOT NULL DEFAULT 1 CHECK (eligible IN (0, 1)),
  detail_json           TEXT NOT NULL DEFAULT '{}',
  occurred_at           TEXT NOT NULL,
  created_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reward_activities_epoch_window
  ON reward_activities(eligible, occurred_at, user_id);

CREATE TABLE IF NOT EXISTS reward_allocations (
  id                    TEXT PRIMARY KEY,
  epoch_id              TEXT NOT NULL REFERENCES reward_epochs(id) ON DELETE CASCADE,
  user_id               TEXT NOT NULL REFERENCES profiles(id),
  wallet_address        TEXT NOT NULL,
  effective_score       INTEGER NOT NULL CHECK (effective_score > 0),
  amount_units          TEXT NOT NULL,
  leaf_hash             TEXT NOT NULL,
  proof_json            TEXT NOT NULL DEFAULT '[]',
  status                TEXT NOT NULL DEFAULT 'unclaimed' CHECK (status IN ('unclaimed', 'claimed', 'expired')),
  claim_tx_hash         TEXT,
  claimed_at            TEXT,
  created_at            TEXT NOT NULL,
  UNIQUE (epoch_id, user_id),
  UNIQUE (epoch_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_reward_allocations_user
  ON reward_allocations(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reward_claims (
  id                    TEXT PRIMARY KEY,
  epoch_id              TEXT NOT NULL REFERENCES reward_epochs(id),
  user_id               TEXT NOT NULL REFERENCES profiles(id),
  wallet_address        TEXT NOT NULL,
  amount_units          TEXT NOT NULL,
  tx_hash               TEXT NOT NULL,
  block_number          TEXT NOT NULL,
  log_index             INTEGER NOT NULL CHECK (log_index >= 0),
  claimed_at            TEXT NOT NULL,
  UNIQUE (epoch_id, user_id),
  UNIQUE (tx_hash, log_index)
);

CREATE TABLE IF NOT EXISTS staking_positions (
  user_id               TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  wallet_address        TEXT NOT NULL UNIQUE,
  amount_units          TEXT NOT NULL DEFAULT '0',
  unlock_time           TEXT,
  duration_seconds      INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  reputation_bps        INTEGER NOT NULL DEFAULT 10000 CHECK (reputation_bps BETWEEN 5000 AND 15000),
  raw_power             TEXT NOT NULL DEFAULT '0',
  delegated_to          TEXT,
  voting_power          TEXT NOT NULL DEFAULT '0',
  verified              INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  last_tx_hash          TEXT,
  last_block_number     TEXT,
  last_log_index        INTEGER,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_staking_positions_delegate
  ON staking_positions(delegated_to, updated_at DESC);

CREATE TABLE IF NOT EXISTS governance_proposals (
  id                    TEXT PRIMARY KEY,
  proposal_number       INTEGER NOT NULL UNIQUE CHECK (proposal_number > 0),
  proposer_id           TEXT NOT NULL REFERENCES profiles(id),
  proposal_type         TEXT NOT NULL
    CHECK (proposal_type IN ('reward_release', 'reward_weights', 'ecosystem_grant', 'development', 'platform_parameter')),
  title                 TEXT NOT NULL,
  description           TEXT NOT NULL,
  payload_json          TEXT NOT NULL DEFAULT '{}',
  status                TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'succeeded', 'defeated', 'quorum_failed', 'cancelled')),
  snapshot_block        TEXT NOT NULL,
  starts_at             TEXT NOT NULL,
  ends_at               TEXT NOT NULL,
  quorum_bps            INTEGER NOT NULL CHECK (quorum_bps BETWEEN 1 AND 10000),
  approval_bps          INTEGER NOT NULL CHECK (approval_bps BETWEEN 5001 AND 10000),
  eligible_power        TEXT NOT NULL,
  for_power             TEXT NOT NULL DEFAULT '0',
  against_power         TEXT NOT NULL DEFAULT '0',
  abstain_power         TEXT NOT NULL DEFAULT '0',
  finalized_at          TEXT,
  finalized_by          TEXT REFERENCES profiles(id),
  created_at            TEXT NOT NULL,
  CHECK (julianday(ends_at) > julianday(starts_at))
);

CREATE INDEX IF NOT EXISTS idx_governance_proposals_status
  ON governance_proposals(status, ends_at DESC);

CREATE TABLE IF NOT EXISTS governance_power_snapshots (
  proposal_id           TEXT NOT NULL REFERENCES governance_proposals(id) ON DELETE CASCADE,
  user_id               TEXT NOT NULL REFERENCES profiles(id),
  wallet_address        TEXT NOT NULL,
  power                 TEXT NOT NULL,
  delegate_sources_json TEXT NOT NULL DEFAULT '[]',
  created_at            TEXT NOT NULL,
  PRIMARY KEY (proposal_id, user_id),
  UNIQUE (proposal_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_governance_snapshots_user
  ON governance_power_snapshots(user_id, proposal_id);

CREATE TABLE IF NOT EXISTS governance_votes (
  id                    TEXT PRIMARY KEY,
  proposal_id           TEXT NOT NULL REFERENCES governance_proposals(id) ON DELETE CASCADE,
  voter_id              TEXT NOT NULL REFERENCES profiles(id),
  wallet_address        TEXT NOT NULL,
  choice                TEXT NOT NULL CHECK (choice IN ('for', 'against', 'abstain')),
  power                 TEXT NOT NULL,
  reason                TEXT NOT NULL,
  created_at            TEXT NOT NULL,
  UNIQUE (proposal_id, voter_id),
  UNIQUE (proposal_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_governance_votes_proposal
  ON governance_votes(proposal_id, created_at ASC);

CREATE TABLE IF NOT EXISTS yd_admin_actions (
  id                    TEXT PRIMARY KEY,
  actor_id              TEXT NOT NULL REFERENCES profiles(id),
  action                TEXT NOT NULL,
  target_id             TEXT NOT NULL,
  detail_json           TEXT NOT NULL DEFAULT '{}',
  created_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_yd_admin_actions_created
  ON yd_admin_actions(created_at DESC);
