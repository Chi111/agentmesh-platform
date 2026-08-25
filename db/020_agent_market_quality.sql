-- Append-only Agent quality ledger, deterministic reputation read model and versioned feedback.

CREATE TABLE IF NOT EXISTS agent_versions (
  id                  TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version             TEXT NOT NULL,
  endpoint_url        TEXT NOT NULL,
  auth_type           TEXT NOT NULL,
  input_schema_json   TEXT NOT NULL DEFAULT '{}',
  output_schema_json  TEXT NOT NULL DEFAULT '{}',
  capabilities_json   TEXT NOT NULL DEFAULT '[]',
  created_at          TEXT NOT NULL,
  UNIQUE(agent_id, version, endpoint_url)
);
CREATE INDEX IF NOT EXISTS idx_agent_versions_agent ON agent_versions(agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_trials (
  id                  TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  agent_version_id    TEXT REFERENCES agent_versions(id),
  suite_version       TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('running', 'passed', 'failed')),
  score               REAL NOT NULL DEFAULT 0,
  response_time_ms    INTEGER NOT NULL DEFAULT 0,
  checks_json         TEXT NOT NULL DEFAULT '[]',
  summary             TEXT NOT NULL DEFAULT '',
  evidence_json       TEXT NOT NULL DEFAULT '{}',
  started_at          TEXT NOT NULL,
  completed_at        TEXT,
  created_by          TEXT NOT NULL REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_agent_trials_agent ON agent_trials(agent_id, started_at DESC);

CREATE TABLE IF NOT EXISTS agent_health_checks (
  id                  TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  status              TEXT NOT NULL CHECK (status IN ('healthy', 'unreachable', 'invalid')),
  response_time_ms    INTEGER,
  http_status         INTEGER,
  error_code          TEXT,
  checked_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_health_agent ON agent_health_checks(agent_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS agent_metric_events (
  id                  TEXT PRIMARY KEY,
  idempotency_key     TEXT NOT NULL UNIQUE,
  agent_id            TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  event_type          TEXT NOT NULL,
  value               REAL NOT NULL DEFAULT 0,
  weight              REAL NOT NULL DEFAULT 1 CHECK (weight > 0 AND weight <= 100),
  severity            TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'severe')),
  source_type         TEXT NOT NULL,
  source_id           TEXT NOT NULL,
  detail_json         TEXT NOT NULL DEFAULT '{}',
  occurred_at         TEXT NOT NULL,
  created_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_metric_events_agent ON agent_metric_events(agent_id, occurred_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_agent_metric_events_source ON agent_metric_events(source_type, source_id);

CREATE TABLE IF NOT EXISTS agent_feedback (
  id                  TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  mission_id          TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  stage_id            TEXT NOT NULL REFERENCES workflow_stages(id) ON DELETE CASCADE,
  requester_id        TEXT NOT NULL REFERENCES profiles(id),
  version             INTEGER NOT NULL CHECK (version > 0),
  delivery_quality    INTEGER NOT NULL CHECK (delivery_quality BETWEEN 1 AND 5),
  requirements_fit    INTEGER NOT NULL CHECK (requirements_fit BETWEEN 1 AND 5),
  communication       INTEGER NOT NULL CHECK (communication BETWEEN 1 AND 5),
  on_time             INTEGER NOT NULL CHECK (on_time IN (0, 1)),
  reuse_agent         INTEGER NOT NULL CHECK (reuse_agent IN (0, 1)),
  comment             TEXT NOT NULL DEFAULT '',
  effective           INTEGER NOT NULL DEFAULT 1 CHECK (effective IN (0, 1)),
  created_at          TEXT NOT NULL,
  UNIQUE(mission_id, stage_id, agent_id, version)
);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_current ON agent_feedback(agent_id, mission_id, stage_id, version DESC);

CREATE TABLE IF NOT EXISTS agent_stats (
  agent_id                    TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  marketplace_status          TEXT NOT NULL DEFAULT 'registered' CHECK (marketplace_status IN ('registered', 'verifying', 'trial', 'listed', 'degraded', 'suspended', 'retired')),
  reputation                  REAL NOT NULL DEFAULT 0,
  reliability_score           REAL NOT NULL DEFAULT 0,
  quality_score               REAL NOT NULL DEFAULT 0,
  delivery_score              REAL NOT NULL DEFAULT 0,
  response_score              REAL NOT NULL DEFAULT 0,
  history_score               REAL NOT NULL DEFAULT 0,
  risk_penalty                REAL NOT NULL DEFAULT 0,
  confidence                  TEXT NOT NULL DEFAULT 'low' CHECK (confidence IN ('low', 'medium', 'high')),
  settled_jobs                INTEGER NOT NULL DEFAULT 0,
  successful_jobs             INTEGER NOT NULL DEFAULT 0,
  failed_jobs                 INTEGER NOT NULL DEFAULT 0,
  refunded_jobs               INTEGER NOT NULL DEFAULT 0,
  trial_passed                INTEGER NOT NULL DEFAULT 0,
  endpoint_healthy            INTEGER NOT NULL DEFAULT 0,
  payout_valid                INTEGER NOT NULL DEFAULT 0,
  unresolved_severe_risks     INTEGER NOT NULL DEFAULT 0,
  premium                     INTEGER NOT NULL DEFAULT 0,
  new_agent                   INTEGER NOT NULL DEFAULT 1,
  eligibility_reasons_json    TEXT NOT NULL DEFAULT '[]',
  formula_version             TEXT NOT NULL DEFAULT 'agentmesh-quality-v1',
  last_trial_at               TEXT,
  last_health_check_at        TEXT,
  updated_at                  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_stats_market ON agent_stats(marketplace_status, reputation DESC);

CREATE TABLE IF NOT EXISTS agent_reputation_snapshots (
  id                  TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  evaluated_at        TEXT NOT NULL,
  formula_version     TEXT NOT NULL,
  event_count         INTEGER NOT NULL,
  reputation          REAL NOT NULL,
  breakdown_json      TEXT NOT NULL,
  confidence          TEXT NOT NULL,
  marketplace_status  TEXT NOT NULL,
  reasons_json        TEXT NOT NULL DEFAULT '[]',
  created_at          TEXT NOT NULL,
  UNIQUE(agent_id, evaluated_at, formula_version)
);
CREATE INDEX IF NOT EXISTS idx_agent_snapshots_agent ON agent_reputation_snapshots(agent_id, evaluated_at DESC);

INSERT OR IGNORE INTO agent_versions
  (id, agent_id, version, endpoint_url, auth_type, input_schema_json, output_schema_json, capabilities_json, created_at)
SELECT 'AGVER-' || id || '-' || replace(version, '.', '-'), id, version, endpoint_url, auth_type,
       input_schema_json, output_schema_json, tags_json, created_at
FROM agents;

INSERT OR IGNORE INTO agent_stats
  (agent_id, marketplace_status, payout_valid, eligibility_reasons_json, updated_at)
SELECT id,
       CASE WHEN status = 'trial' THEN 'trial' ELSE 'registered' END,
       CASE WHEN length(wallet_address) = 42 AND substr(wallet_address, 1, 2) = '0x' THEN 1 ELSE 0 END,
       '["正式 Trial 尚未通过","Endpoint 最近 24 小时无健康记录"]',
       updated_at
FROM agents;
