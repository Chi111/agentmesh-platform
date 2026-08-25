-- DAO-style dispute governance: appointed council, immutable electorate snapshots and votes.

CREATE TABLE IF NOT EXISTS arbitration_members (
  user_id       TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  power         INTEGER NOT NULL DEFAULT 1 CHECK (power > 0),
  appointed_by  TEXT NOT NULL REFERENCES profiles(id),
  appointed_at  TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_arbitration_members_status
  ON arbitration_members(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS arbitration_member_actions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES profiles(id),
  actor_id      TEXT NOT NULL REFERENCES profiles(id),
  action        TEXT NOT NULL CHECK (action IN ('appointed', 'activated', 'deactivated')),
  power         INTEGER NOT NULL CHECK (power > 0),
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_arbitration_member_actions_user
  ON arbitration_member_actions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dispute_proposals (
  id                TEXT PRIMARY KEY,
  dispute_id        TEXT NOT NULL UNIQUE REFERENCES disputes(id) ON DELETE CASCADE,
  proposer_id       TEXT NOT NULL REFERENCES profiles(id),
  status            TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'succeeded', 'defeated', 'inconclusive', 'quorum_failed', 'executed')),
  weight_mode       TEXT NOT NULL DEFAULT 'one_person_one_vote'
    CHECK (weight_mode IN ('one_person_one_vote', 'power')),
  voting_starts_at  TEXT NOT NULL,
  voting_ends_at    TEXT NOT NULL,
  quorum_required   INTEGER NOT NULL CHECK (quorum_required > 0),
  eligible_weight   INTEGER NOT NULL CHECK (eligible_weight > 0),
  support_votes     INTEGER NOT NULL DEFAULT 0 CHECK (support_votes >= 0),
  oppose_votes      INTEGER NOT NULL DEFAULT 0 CHECK (oppose_votes >= 0),
  abstain_votes     INTEGER NOT NULL DEFAULT 0 CHECK (abstain_votes >= 0),
  outcome           TEXT CHECK (outcome IN ('refund_requester', 'reject_dispute')),
  finalized_at      TEXT,
  finalized_by      TEXT REFERENCES profiles(id),
  executed_at       TEXT,
  executed_by       TEXT REFERENCES profiles(id),
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dispute_proposals_status
  ON dispute_proposals(status, voting_ends_at);

CREATE TABLE IF NOT EXISTS dispute_electorate (
  proposal_id     TEXT NOT NULL REFERENCES dispute_proposals(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES profiles(id),
  power_snapshot  INTEGER NOT NULL CHECK (power_snapshot > 0),
  vote_weight     INTEGER NOT NULL CHECK (vote_weight > 0),
  created_at      TEXT NOT NULL,
  PRIMARY KEY (proposal_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dispute_electorate_user
  ON dispute_electorate(user_id, proposal_id);

CREATE TABLE IF NOT EXISTS dispute_votes (
  id            TEXT PRIMARY KEY,
  proposal_id   TEXT NOT NULL REFERENCES dispute_proposals(id) ON DELETE CASCADE,
  voter_id      TEXT NOT NULL REFERENCES profiles(id),
  choice        TEXT NOT NULL CHECK (choice IN ('support_refund', 'oppose_refund', 'abstain')),
  reason        TEXT NOT NULL,
  vote_weight   INTEGER NOT NULL CHECK (vote_weight > 0),
  created_at    TEXT NOT NULL,
  UNIQUE (proposal_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_dispute_votes_proposal
  ON dispute_votes(proposal_id, created_at ASC);

-- Bootstrap the existing platform administrators as the initial arbitration council.
INSERT OR IGNORE INTO arbitration_members
  (user_id, status, power, appointed_by, appointed_at, updated_at)
SELECT id, 'active', 1, id, datetime('now'), datetime('now')
FROM profiles
WHERE role = 'admin';
