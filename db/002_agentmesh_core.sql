-- AgentMesh control-plane schema. All dates are ISO-8601 TEXT and JSON is stored as TEXT.

CREATE TABLE IF NOT EXISTS profiles (
  id           TEXT PRIMARY KEY,
  email        TEXT UNIQUE,
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'requester' CHECK (role IN ('requester', 'developer', 'admin')),
  wallet_address TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agents (
  id                 TEXT PRIMARY KEY,
  owner_id           TEXT NOT NULL REFERENCES profiles(id),
  name               TEXT NOT NULL,
  category           TEXT NOT NULL,
  summary            TEXT NOT NULL,
  tags_json          TEXT NOT NULL DEFAULT '[]',
  endpoint_url       TEXT NOT NULL,
  auth_type          TEXT NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none', 'api_key', 'bearer', 'jwt')),
  input_schema_json  TEXT NOT NULL DEFAULT '{}',
  output_schema_json TEXT NOT NULL DEFAULT '{}',
  price_usdc         REAL NOT NULL DEFAULT 0 CHECK (price_usdc >= 0),
  wallet_address     TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'paused')),
  version            TEXT NOT NULL DEFAULT 'v1.0.0',
  trust_score        REAL NOT NULL DEFAULT 0 CHECK (trust_score >= 0 AND trust_score <= 10),
  success_rate       REAL NOT NULL DEFAULT 0 CHECK (success_rate >= 0 AND success_rate <= 100),
  response_time_ms   INTEGER NOT NULL DEFAULT 0,
  jobs_count         INTEGER NOT NULL DEFAULT 0,
  volume_usdc        REAL NOT NULL DEFAULT 0,
  author_name        TEXT NOT NULL,
  official           INTEGER NOT NULL DEFAULT 0 CHECK (official IN (0, 1)),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner_id);
CREATE INDEX IF NOT EXISTS idx_agents_market ON agents(status, category, trust_score DESC);

CREATE TABLE IF NOT EXISTS missions (
  id                 TEXT PRIMARY KEY,
  requester_id       TEXT NOT NULL REFERENCES profiles(id),
  title              TEXT NOT NULL,
  description        TEXT NOT NULL,
  category           TEXT NOT NULL,
  tags_json          TEXT NOT NULL DEFAULT '[]',
  budget_usdc        REAL NOT NULL CHECK (budget_usdc > 0),
  payment_method     TEXT NOT NULL DEFAULT 'web2_balance'
    CHECK (payment_method IN ('web2_balance', 'web3_musdc', 'web3_seth')),
  deadline           TEXT NOT NULL,
  priority           TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high', 'urgent')),
  expertise          TEXT NOT NULL DEFAULT 'expert' CHECK (expertise IN ('standard', 'expert', 'principal')),
  yield_enabled      INTEGER NOT NULL DEFAULT 0 CHECK (yield_enabled IN (0, 1)),
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'matching', 'running', 'review', 'completed')),
  progress           REAL NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_stage      TEXT NOT NULL DEFAULT '',
  review_due_at      TEXT,
  team_json          TEXT NOT NULL DEFAULT '[]',
  compiled_spec_json TEXT,
  cancelled_at       TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_missions_requester ON missions(requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS workflow_stages (
  id          TEXT PRIMARY KEY,
  mission_id  TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  name        TEXT NOT NULL,
  purpose     TEXT NOT NULL,
  category    TEXT NOT NULL,
  budget_usdc REAL NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  agent_id    TEXT REFERENCES agents(id),
  input_json  TEXT NOT NULL DEFAULT '{}',
  output_json TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (mission_id, position)
);

CREATE INDEX IF NOT EXISTS idx_stages_mission ON workflow_stages(mission_id, position);
CREATE INDEX IF NOT EXISTS idx_stages_agent ON workflow_stages(agent_id, status);

CREATE TABLE IF NOT EXISTS execution_events (
  id           TEXT PRIMARY KEY,
  mission_id   TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  stage_id     TEXT REFERENCES workflow_stages(id),
  event_type   TEXT NOT NULL,
  message      TEXT NOT NULL,
  actor_type   TEXT NOT NULL CHECK (actor_type IN ('platform', 'requester', 'developer', 'agent')),
  actor_id     TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_mission ON execution_events(mission_id, created_at);

CREATE TABLE IF NOT EXISTS deliverables (
  id           TEXT PRIMARY KEY,
  mission_id   TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  stage_id     TEXT REFERENCES workflow_stages(id),
  agent_id     TEXT REFERENCES agents(id),
  name         TEXT NOT NULL,
  uri          TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'accepted', 'rejected')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deliverables_mission ON deliverables(mission_id, created_at);

CREATE TABLE IF NOT EXISTS escrows (
  id                TEXT PRIMARY KEY,
  mission_id        TEXT NOT NULL UNIQUE REFERENCES missions(id) ON DELETE CASCADE,
  amount            REAL NOT NULL CHECK (amount >= 0),
  token             TEXT NOT NULL DEFAULT 'USDC',
  network           TEXT NOT NULL DEFAULT 'base',
  payment_method    TEXT NOT NULL DEFAULT 'web2_balance'
    CHECK (payment_method IN ('web2_balance', 'web3_musdc', 'web3_seth')),
  yield_enabled     INTEGER NOT NULL DEFAULT 0 CHECK (yield_enabled IN (0, 1)),
  platform_fee_rate REAL NOT NULL DEFAULT 0.004,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'held', 'released', 'frozen', 'refunded')),
  deposit_tx_hash   TEXT,
  release_tx_hash   TEXT,
  payout_hash       TEXT,
  freeze_tx_hash    TEXT,
  resolution_tx_hash TEXT,
  released_at       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id         TEXT PRIMARY KEY,
  settlement_key TEXT NOT NULL UNIQUE,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  agent_id   TEXT REFERENCES agents(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('agent_payout', 'platform_fee', 'refund', 'yield')),
  amount     REAL NOT NULL,
  token      TEXT NOT NULL DEFAULT 'USDC',
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'failed')),
  tx_hash    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ledger_agent ON ledger_entries(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_mission ON ledger_entries(mission_id);

CREATE TABLE IF NOT EXISTS disputes (
  id            TEXT PRIMARY KEY,
  mission_id    TEXT NOT NULL REFERENCES missions(id),
  opened_by     TEXT NOT NULL REFERENCES profiles(id),
  reason        TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'rejected')),
  resolution    TEXT,
  freeze_tx_hash TEXT,
  resolution_tx_hash TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES profiles(id),
  title      TEXT NOT NULL,
  detail     TEXT NOT NULL,
  tone       TEXT NOT NULL DEFAULT 'info' CHECK (tone IN ('info', 'success', 'warning')),
  is_read    INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id      TEXT NOT NULL,
  key          TEXT NOT NULL,
  method       TEXT NOT NULL,
  path         TEXT NOT NULL,
  request_hash TEXT NOT NULL DEFAULT '',
  status_code  INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, key)
);

-- Aggregate counters update only for future, uniquely keyed settlements.
CREATE TRIGGER IF NOT EXISTS trg_agent_payout_aggregate
AFTER INSERT ON ledger_entries
WHEN NEW.entry_type = 'agent_payout' AND NEW.status = 'settled' AND NEW.agent_id IS NOT NULL
BEGIN
  UPDATE agents
  SET jobs_count = jobs_count + 1,
      volume_usdc = volume_usdc + NEW.amount,
      updated_at = NEW.created_at
  WHERE id = NEW.agent_id;
END;
