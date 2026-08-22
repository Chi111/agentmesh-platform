-- Security invariants for verified settlement, identity linking and Agent callbacks.
-- Security fields live in the replay-safe baseline schema in 002_agentmesh_core.sql.

UPDATE profiles SET wallet_address = lower(wallet_address)
WHERE wallet_address IS NOT NULL AND trim(wallet_address) <> '';

UPDATE auth_identities SET wallet_address = lower(wallet_address)
WHERE wallet_address IS NOT NULL AND trim(wallet_address) <> '';

UPDATE agents SET wallet_address = lower(wallet_address)
WHERE wallet_address IS NOT NULL AND trim(wallet_address) <> '';

-- Preserve existing deployments even if legacy duplicate wallets exist, while
-- preventing every new duplicate link. A future cleanup can safely replace
-- these guards with a unique functional index.
CREATE TRIGGER IF NOT EXISTS trg_profiles_wallet_unique_insert
BEFORE INSERT ON profiles
WHEN NEW.wallet_address IS NOT NULL
  AND trim(NEW.wallet_address) <> ''
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE lower(wallet_address) = lower(NEW.wallet_address)
  )
BEGIN
  SELECT RAISE(ABORT, 'WALLET_ALREADY_LINKED');
END;

CREATE TRIGGER IF NOT EXISTS trg_profiles_wallet_unique_update
BEFORE UPDATE OF wallet_address ON profiles
WHEN NEW.wallet_address IS NOT NULL
  AND trim(NEW.wallet_address) <> ''
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE id <> OLD.id AND lower(wallet_address) = lower(NEW.wallet_address)
  )
BEGIN
  SELECT RAISE(ABORT, 'WALLET_ALREADY_LINKED');
END;

-- Once escrow leaves pending, recipient assignments and weights are immutable.
-- Stage status/output updates remain available to the execution engine.
CREATE TRIGGER IF NOT EXISTS trg_workflow_lock_delete
BEFORE DELETE ON workflow_stages
WHEN EXISTS (
  SELECT 1 FROM escrows
  WHERE mission_id = OLD.mission_id AND status <> 'pending'
)
BEGIN
  SELECT RAISE(ABORT, 'WORKFLOW_LOCKED');
END;

CREATE TRIGGER IF NOT EXISTS trg_workflow_lock_insert
BEFORE INSERT ON workflow_stages
WHEN EXISTS (
  SELECT 1 FROM escrows
  WHERE mission_id = NEW.mission_id AND status <> 'pending'
)
BEGIN
  SELECT RAISE(ABORT, 'WORKFLOW_LOCKED');
END;

CREATE TRIGGER IF NOT EXISTS trg_workflow_lock_settlement_fields
BEFORE UPDATE OF mission_id, position, budget_usdc, agent_id ON workflow_stages
WHEN EXISTS (
  SELECT 1 FROM escrows
  WHERE mission_id = OLD.mission_id AND status <> 'pending'
)
BEGIN
  SELECT RAISE(ABORT, 'WORKFLOW_LOCKED');
END;

CREATE TABLE IF NOT EXISTS agent_dispatches (
  run_id       TEXT PRIMARY KEY,
  mission_id   TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  stage_id     TEXT NOT NULL REFERENCES workflow_stages(id) ON DELETE CASCADE,
  agent_id     TEXT NOT NULL REFERENCES agents(id),
  expires_at   TEXT NOT NULL,
  completed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_dispatches_stage
  ON agent_dispatches(mission_id, stage_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_callback_events (
  run_id      TEXT NOT NULL REFERENCES agent_dispatches(run_id) ON DELETE CASCADE,
  callback_id TEXT NOT NULL,
  processing_token TEXT,
  applied_at  TEXT,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (run_id, callback_id)
);
