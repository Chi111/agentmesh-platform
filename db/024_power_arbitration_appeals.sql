-- Additive proposal rounds, one appeal and a fail-closed governance execution queue.

CREATE TABLE IF NOT EXISTS dispute_proposal_rounds (
  id                  TEXT PRIMARY KEY,
  dispute_id          TEXT NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  round               INTEGER NOT NULL CHECK (round IN (0, 1)),
  parent_proposal_id  TEXT REFERENCES dispute_proposal_rounds(id),
  proposer_id         TEXT NOT NULL REFERENCES profiles(id),
  appeal_reason       TEXT,
  appeal_deadline_at  TEXT,
  status              TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'succeeded', 'defeated', 'inconclusive', 'quorum_failed', 'executed')),
  weight_mode         TEXT NOT NULL CHECK (weight_mode IN ('one_person_one_vote', 'power')),
  weight_version      TEXT NOT NULL CHECK (weight_version IN ('one_person_one_vote.v1', 'member_power.v1')),
  voting_starts_at    TEXT NOT NULL,
  voting_ends_at      TEXT NOT NULL,
  quorum_required     INTEGER NOT NULL CHECK (quorum_required > 0),
  eligible_weight     INTEGER NOT NULL CHECK (eligible_weight > 0),
  support_votes       INTEGER NOT NULL DEFAULT 0 CHECK (support_votes >= 0),
  oppose_votes        INTEGER NOT NULL DEFAULT 0 CHECK (oppose_votes >= 0),
  abstain_votes       INTEGER NOT NULL DEFAULT 0 CHECK (abstain_votes >= 0),
  outcome             TEXT CHECK (outcome IN ('refund_requester', 'reject_dispute')),
  finalized_at        TEXT,
  finalized_by        TEXT REFERENCES profiles(id),
  executed_at         TEXT,
  executed_by         TEXT REFERENCES profiles(id),
  created_at          TEXT NOT NULL,
  UNIQUE (dispute_id, round),
  CHECK ((round = 0 AND parent_proposal_id IS NULL AND appeal_reason IS NULL)
      OR (round = 1 AND parent_proposal_id IS NOT NULL AND length(trim(appeal_reason)) >= 20))
);

CREATE INDEX IF NOT EXISTS idx_dispute_proposal_rounds_status
  ON dispute_proposal_rounds(status, voting_ends_at);

CREATE TABLE IF NOT EXISTS dispute_round_electorate (
  proposal_id     TEXT NOT NULL REFERENCES dispute_proposal_rounds(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES profiles(id),
  power_snapshot  INTEGER NOT NULL CHECK (power_snapshot > 0),
  vote_weight     INTEGER NOT NULL CHECK (vote_weight > 0),
  created_at      TEXT NOT NULL,
  PRIMARY KEY (proposal_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dispute_round_electorate_user
  ON dispute_round_electorate(user_id, proposal_id);

CREATE TABLE IF NOT EXISTS dispute_round_votes (
  id            TEXT PRIMARY KEY,
  proposal_id   TEXT NOT NULL REFERENCES dispute_proposal_rounds(id) ON DELETE CASCADE,
  voter_id      TEXT NOT NULL REFERENCES profiles(id),
  choice        TEXT NOT NULL CHECK (choice IN ('support_refund', 'oppose_refund', 'abstain')),
  reason        TEXT NOT NULL,
  vote_weight   INTEGER NOT NULL CHECK (vote_weight > 0),
  created_at    TEXT NOT NULL,
  UNIQUE (proposal_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_dispute_round_votes_proposal
  ON dispute_round_votes(proposal_id, created_at ASC);

CREATE TABLE IF NOT EXISTS dispute_governance_events (
  id          TEXT PRIMARY KEY,
  dispute_id  TEXT NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  actor_id    TEXT NOT NULL REFERENCES profiles(id),
  action      TEXT NOT NULL CHECK (action IN ('appeal_created', 'execution_queued', 'execution_executed')),
  note        TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dispute_governance_events_case
  ON dispute_governance_events(dispute_id, created_at ASC);

CREATE TABLE IF NOT EXISTS governance_execution_queue (
  id            TEXT PRIMARY KEY,
  scope         TEXT NOT NULL CHECK (scope IN ('task_dispute', 'ecosystem')),
  source_id     TEXT NOT NULL,
  proposal_id   TEXT NOT NULL,
  action_type   TEXT NOT NULL CHECK (action_type IN ('refund_requester', 'reject_dispute')),
  payload_hash  TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('queued', 'awaiting_transaction', 'executed', 'cancelled')),
  requested_by  TEXT NOT NULL REFERENCES profiles(id),
  requested_at  TEXT NOT NULL,
  tx_hash       TEXT,
  executed_by   TEXT REFERENCES profiles(id),
  executed_at   TEXT,
  UNIQUE (scope, source_id)
);

CREATE INDEX IF NOT EXISTS idx_governance_execution_status
  ON governance_execution_queue(scope, status, requested_at ASC);

INSERT OR IGNORE INTO dispute_proposal_rounds
  (id, dispute_id, round, parent_proposal_id, proposer_id, appeal_reason, appeal_deadline_at,
   status, weight_mode, weight_version, voting_starts_at, voting_ends_at, quorum_required,
   eligible_weight, support_votes, oppose_votes, abstain_votes, outcome, finalized_at,
   finalized_by, executed_at, executed_by, created_at)
SELECT id, dispute_id, 0, NULL, proposer_id, NULL,
  CASE WHEN finalized_at IS NOT NULL THEN datetime(finalized_at, '+72 hours') ELSE NULL END,
  status, weight_mode,
  CASE WHEN weight_mode = 'power' THEN 'member_power.v1' ELSE 'one_person_one_vote.v1' END,
  voting_starts_at, voting_ends_at, quorum_required, eligible_weight, support_votes,
  oppose_votes, abstain_votes, outcome, finalized_at, finalized_by, executed_at, executed_by, created_at
FROM dispute_proposals;

INSERT OR IGNORE INTO dispute_round_electorate
  (proposal_id, user_id, power_snapshot, vote_weight, created_at)
SELECT proposal_id, user_id, power_snapshot, vote_weight, created_at
FROM dispute_electorate;

INSERT OR IGNORE INTO dispute_round_votes
  (id, proposal_id, voter_id, choice, reason, vote_weight, created_at)
SELECT id, proposal_id, voter_id, choice, reason, vote_weight, created_at
FROM dispute_votes;
