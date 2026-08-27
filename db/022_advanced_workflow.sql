-- Bounded advanced-workflow rules, replay checkpoints and versioned templates.
-- Separate metadata tables keep this migration replay-safe without ALTER TABLE.

CREATE TABLE IF NOT EXISTS workflow_edge_rules (
  edge_id       TEXT PRIMARY KEY REFERENCES workflow_edges(id) ON DELETE CASCADE,
  mission_id    TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  condition_json TEXT,
  mappings_json TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_edge_rules_mission
  ON workflow_edge_rules(mission_id, edge_id);

INSERT OR IGNORE INTO workflow_edge_rules
  (edge_id, mission_id, condition_json, mappings_json, created_at, updated_at)
SELECT id, mission_id, NULL, '[]', created_at, created_at FROM workflow_edges;

CREATE TABLE IF NOT EXISTS workflow_transition_checkpoints (
  id                  TEXT PRIMARY KEY,
  mission_id          TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  edge_id             TEXT NOT NULL REFERENCES workflow_edges(id) ON DELETE CASCADE,
  source_stage_id     TEXT NOT NULL REFERENCES workflow_stages(id) ON DELETE CASCADE,
  target_stage_id     TEXT NOT NULL REFERENCES workflow_stages(id) ON DELETE CASCADE,
  source_attempt_no   INTEGER NOT NULL CHECK (source_attempt_no >= 1),
  workflow_version    INTEGER NOT NULL CHECK (workflow_version >= 1),
  matched             INTEGER NOT NULL CHECK (matched IN (0, 1)),
  mapped_input_json   TEXT NOT NULL DEFAULT '{}',
  missing_required_json TEXT NOT NULL DEFAULT '[]',
  error_code          TEXT,
  created_at          TEXT NOT NULL,
  UNIQUE (mission_id, edge_id, source_attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_workflow_transition_mission
  ON workflow_transition_checkpoints(mission_id, created_at, edge_id);

CREATE TABLE IF NOT EXISTS workflow_templates (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (owner_id, name)
);

CREATE TABLE IF NOT EXISTS workflow_template_versions (
  template_id   TEXT NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL CHECK (version >= 1),
  nodes_json    TEXT NOT NULL,
  edges_json    TEXT NOT NULL,
  entry_ids_json TEXT NOT NULL,
  exit_ids_json TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (template_id, version)
);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_owner
  ON workflow_templates(owner_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_template_content_hash
  ON workflow_template_versions(template_id, content_hash);

CREATE TRIGGER IF NOT EXISTS trg_workflow_edge_rules_lock_insert
BEFORE INSERT ON workflow_edge_rules
WHEN NOT EXISTS (SELECT 1 FROM workflow_edge_rules WHERE edge_id = NEW.edge_id)
  AND EXISTS (SELECT 1 FROM escrows WHERE mission_id = NEW.mission_id AND status <> 'pending')
BEGIN
  SELECT RAISE(ABORT, 'WORKFLOW_LOCKED');
END;

CREATE TRIGGER IF NOT EXISTS trg_workflow_edge_rules_lock_update
BEFORE UPDATE ON workflow_edge_rules
WHEN EXISTS (SELECT 1 FROM escrows WHERE mission_id = OLD.mission_id AND status <> 'pending')
BEGIN
  SELECT RAISE(ABORT, 'WORKFLOW_LOCKED');
END;

CREATE TRIGGER IF NOT EXISTS trg_workflow_edge_rules_lock_delete
BEFORE DELETE ON workflow_edge_rules
WHEN EXISTS (SELECT 1 FROM escrows WHERE mission_id = OLD.mission_id AND status <> 'pending')
BEGIN
  SELECT RAISE(ABORT, 'WORKFLOW_LOCKED');
END;

CREATE TRIGGER IF NOT EXISTS trg_workflow_transition_checkpoints_immutable_update
BEFORE UPDATE ON workflow_transition_checkpoints
BEGIN
  SELECT RAISE(ABORT, 'WORKFLOW_TRANSITION_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_workflow_transition_checkpoints_immutable_delete
BEFORE DELETE ON workflow_transition_checkpoints
BEGIN
  SELECT RAISE(ABORT, 'WORKFLOW_TRANSITION_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_workflow_template_versions_immutable_update
BEFORE UPDATE ON workflow_template_versions
BEGIN
  SELECT RAISE(ABORT, 'WORKFLOW_TEMPLATE_VERSION_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_workflow_template_versions_immutable_delete
BEFORE DELETE ON workflow_template_versions
BEGIN
  SELECT RAISE(ABORT, 'WORKFLOW_TEMPLATE_VERSION_IMMUTABLE');
END;
