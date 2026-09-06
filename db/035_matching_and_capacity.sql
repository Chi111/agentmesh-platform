-- Evidence-driven matching snapshots and execution slots. Existing execution stays compatible.
CREATE TABLE IF NOT EXISTS agent_execution_profiles (
  agent_id TEXT PRIMARY KEY REFERENCES agents(id),
  agent_version TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  pool TEXT NOT NULL,
  max_concurrency INTEGER NOT NULL CHECK(max_concurrency BETWEEN 1 AND 64),
  pool_concurrency INTEGER NOT NULL CHECK(pool_concurrency BETWEEN 1 AND 64),
  data_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS matching_capability_evidence (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  source_id TEXT NOT NULL,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matching_evidence_agent ON matching_capability_evidence(agent_id);
CREATE TABLE IF NOT EXISTS matching_outcomes (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matching_outcomes_agent ON matching_outcomes(agent_id);
CREATE TABLE IF NOT EXISTS matching_plans (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  created_at TEXT NOT NULL,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matching_plans_mission ON matching_plans(mission_id,created_at);
CREATE TABLE IF NOT EXISTS agent_capacity_leases (
  run_id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  stage_id TEXT NOT NULL REFERENCES workflow_stages(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  agent_version TEXT NOT NULL,
  pool TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','quarantined','released')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  claim_token TEXT NOT NULL DEFAULT '',
  contacted_at TEXT,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_capacity_pool ON agent_capacity_leases(pool,status);
CREATE INDEX IF NOT EXISTS idx_capacity_agent ON agent_capacity_leases(agent_id,status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_capacity_stage ON agent_capacity_leases(stage_id) WHERE status <> 'released';

-- Terminal callback application and slot release share the callback transaction.
CREATE TRIGGER IF NOT EXISTS matching_release_terminal_callback AFTER UPDATE OF applied_at ON agent_callback_events
WHEN NEW.applied_at IS NOT NULL AND EXISTS (
  SELECT 1 FROM agent_dispatches d WHERE d.run_id=NEW.run_id AND d.completed_at IS NOT NULL
)
BEGIN
  UPDATE agent_capacity_leases SET status='released',completed_at=NEW.applied_at WHERE run_id=NEW.run_id;
END;
CREATE TRIGGER IF NOT EXISTS matching_profile_update_guard BEFORE UPDATE ON agent_execution_profiles
WHEN EXISTS (SELECT 1 FROM agent_capacity_leases l JOIN agents a ON a.id=NEW.agent_id
  WHERE l.status<>'released' AND (l.agent_id=NEW.agent_id OR l.pool=a.owner_id||':'||NEW.pool OR l.pool=a.owner_id||':'||OLD.pool))
BEGIN SELECT RAISE(ABORT,'CAPACITY_IN_USE'); END;
CREATE TRIGGER IF NOT EXISTS matching_profile_insert_guard BEFORE INSERT ON agent_execution_profiles
WHEN EXISTS (SELECT 1 FROM agent_capacity_leases l JOIN agents a ON a.id=NEW.agent_id
  WHERE l.status<>'released' AND (l.agent_id=NEW.agent_id OR l.pool=a.owner_id||':'||NEW.pool))
BEGIN SELECT RAISE(ABORT,'CAPACITY_IN_USE'); END;
