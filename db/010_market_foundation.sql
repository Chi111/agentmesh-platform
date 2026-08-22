-- Agent owner offers, empirical execution outcomes, and explicit review SLA.
-- review_due_at is declared in the base missions table so PinMe's repeatable
-- full-schema import remains idempotent for existing deployments.

CREATE TABLE IF NOT EXISTS stage_offers (
  id           TEXT PRIMARY KEY,
  mission_id   TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  stage_id     TEXT NOT NULL UNIQUE REFERENCES workflow_stages(id) ON DELETE CASCADE,
  agent_id     TEXT NOT NULL REFERENCES agents(id),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  expires_at   TEXT NOT NULL,
  responded_at TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stage_offers_mission
  ON stage_offers(mission_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_stage_offers_agent
  ON stage_offers(agent_id, status, expires_at);

CREATE TRIGGER IF NOT EXISTS trg_stage_offers_lock_insert
BEFORE INSERT ON stage_offers
WHEN EXISTS (
  SELECT 1 FROM escrows WHERE mission_id = NEW.mission_id AND status <> 'pending'
)
BEGIN
  SELECT RAISE(ABORT, 'WORKFLOW_LOCKED');
END;

CREATE TRIGGER IF NOT EXISTS trg_stage_offers_lock_update
BEFORE UPDATE ON stage_offers
WHEN EXISTS (
  SELECT 1 FROM escrows WHERE mission_id = OLD.mission_id AND status <> 'pending'
)
BEGIN
  SELECT RAISE(ABORT, 'WORKFLOW_LOCKED');
END;

CREATE TRIGGER IF NOT EXISTS trg_stage_offers_lock_delete
BEFORE DELETE ON stage_offers
WHEN EXISTS (
  SELECT 1 FROM escrows WHERE mission_id = OLD.mission_id AND status <> 'pending'
)
BEGIN
  SELECT RAISE(ABORT, 'WORKFLOW_LOCKED');
END;

CREATE TABLE IF NOT EXISTS agent_performance_events (
  stage_id    TEXT PRIMARY KEY REFERENCES workflow_stages(id) ON DELETE CASCADE,
  mission_id  TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  agent_id    TEXT NOT NULL REFERENCES agents(id),
  outcome     TEXT NOT NULL CHECK (outcome IN ('done', 'failed')),
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_performance_agent
  ON agent_performance_events(agent_id, created_at DESC);

-- The original trigger inserted a negative opening balance before reaching its
-- UPSERT branch, and INSERT OR IGNORE on the parent transaction could suppress
-- the balance update. Seed negative transactions at zero, then apply the delta
-- only in the existing-account branch.
DROP TRIGGER IF EXISTS trg_wallet_apply_transaction;

CREATE TRIGGER trg_wallet_apply_transaction
AFTER INSERT ON wallet_transactions
BEGIN
  INSERT INTO wallet_balances (user_id, balance, token, updated_at)
  VALUES (NEW.user_id, CASE WHEN NEW.amount > 0 THEN NEW.amount ELSE 0 END, 'CREDIT', NEW.created_at)
  ON CONFLICT(user_id) DO UPDATE SET
    balance = wallet_balances.balance + NEW.amount,
    updated_at = NEW.created_at;
END;
