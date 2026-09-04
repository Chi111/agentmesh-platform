-- Versioned Agent base prices and immutable pre-funding stage quote snapshots.
-- Side tables keep this migration replay-safe for PinMe update-db runs and let
-- offers created before this migration retain legacy stage-budget settlement.

CREATE TABLE IF NOT EXISTS agent_price_versions (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL CHECK (version >= 1),
  price_usdc  REAL NOT NULL CHECK (price_usdc > 0),
  created_by  TEXT NOT NULL REFERENCES profiles(id),
  created_at  TEXT NOT NULL,
  UNIQUE(agent_id, version)
);

CREATE INDEX IF NOT EXISTS idx_agent_price_versions_agent
  ON agent_price_versions(agent_id, version DESC);

-- Older schemas allowed zero-priced Agents. Normalize them before seeding price
-- history so zero can never be confused with a missing legacy quote.
UPDATE agents SET price_usdc = 0.01 WHERE price_usdc < 0.01;

INSERT OR IGNORE INTO agent_price_versions
  (id, agent_id, version, price_usdc, created_by, created_at)
SELECT 'AGPRICE-' || id || '-v1', id, 1, price_usdc, owner_id, created_at
FROM agents;

-- Replayed seed migrations may restore their original display price. Once a
-- version history exists it is the authority for the Agent's current price.
UPDATE agents
SET price_usdc = (
  SELECT versions.price_usdc
  FROM agent_price_versions versions
  WHERE versions.agent_id = agents.id
  ORDER BY versions.version DESC
  LIMIT 1
)
WHERE EXISTS (SELECT 1 FROM agent_price_versions versions WHERE versions.agent_id = agents.id);

CREATE TABLE IF NOT EXISTS stage_offer_quotes (
  offer_id       TEXT PRIMARY KEY REFERENCES stage_offers(id) ON DELETE CASCADE,
  amount         REAL NOT NULL CHECK (amount > 0),
  snapshot_json  TEXT NOT NULL,
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stage_offer_quotes_created
  ON stage_offer_quotes(created_at);

-- Current offers remain unique per stage. When a workflow is revised or an
-- invitation round is reissued, the previous commercial terms move here first.
CREATE TABLE IF NOT EXISTS stage_offer_quote_history (
  id             TEXT PRIMARY KEY,
  mission_id     TEXT NOT NULL,
  stage_id       TEXT NOT NULL,
  agent_id       TEXT NOT NULL,
  status         TEXT NOT NULL,
  amount         REAL NOT NULL CHECK (amount >= 0),
  snapshot_json  TEXT NOT NULL,
  expires_at     TEXT NOT NULL,
  responded_at   TEXT,
  created_at     TEXT NOT NULL,
  archived_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stage_offer_quote_history_mission
  ON stage_offer_quote_history(mission_id, created_at);
