-- Durable mission pause/resume, versioned rework and scheduler checkpoints.
-- New objects are replay-safe because PinMe may execute migrations more than once.

CREATE TABLE IF NOT EXISTS mission_runtime_controls (
  mission_id          TEXT PRIMARY KEY REFERENCES missions(id) ON DELETE CASCADE,
  paused_at           TEXT,
  paused_by           TEXT REFERENCES profiles(id),
  pause_reason        TEXT,
  pause_mode          TEXT CHECK (pause_mode IS NULL OR pause_mode IN ('requester', 'emergency')),
  scheduler_revision  INTEGER NOT NULL DEFAULT 0,
  scheduler_state     TEXT NOT NULL DEFAULT 'clean' CHECK (scheduler_state IN ('clean', 'dirty')),
  change_version      INTEGER NOT NULL DEFAULT 0,
  checkpoint_sequence INTEGER NOT NULL DEFAULT 0,
  mutation_token      TEXT,
  updated_at          TEXT NOT NULL
);

INSERT OR IGNORE INTO mission_runtime_controls (mission_id, updated_at)
SELECT id, COALESCE(updated_at, datetime('now')) FROM missions;

CREATE INDEX IF NOT EXISTS idx_mission_runtime_controls_reconcile
  ON mission_runtime_controls(scheduler_state, paused_at, updated_at);

CREATE TABLE IF NOT EXISTS mission_change_requests (
  id                       TEXT PRIMARY KEY,
  mission_id               TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  version                  INTEGER NOT NULL,
  target_stage_ids_json    TEXT NOT NULL,
  reset_stage_ids_json     TEXT NOT NULL,
  reason                   TEXT NOT NULL,
  acceptance_criteria      TEXT NOT NULL,
  requested_by             TEXT NOT NULL REFERENCES profiles(id),
  prior_stage_state_json   TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied')),
  created_at               TEXT NOT NULL,
  UNIQUE (mission_id, version)
);

CREATE INDEX IF NOT EXISTS idx_mission_change_requests_mission
  ON mission_change_requests(mission_id, version DESC);

CREATE TABLE IF NOT EXISTS workflow_stage_attempts (
  id                TEXT PRIMARY KEY,
  mission_id        TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  stage_id          TEXT NOT NULL REFERENCES workflow_stages(id) ON DELETE CASCADE,
  attempt_no        INTEGER NOT NULL,
  change_request_id TEXT REFERENCES mission_change_requests(id),
  run_id            TEXT UNIQUE,
  status            TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
  input_json        TEXT NOT NULL DEFAULT '{}',
  output_json       TEXT,
  is_current        INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  started_at        TEXT,
  completed_at      TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  UNIQUE (stage_id, attempt_no)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_stage_attempts_current
  ON workflow_stage_attempts(stage_id) WHERE is_current = 1;
CREATE INDEX IF NOT EXISTS idx_workflow_stage_attempts_mission
  ON workflow_stage_attempts(mission_id, stage_id, attempt_no DESC);

INSERT OR IGNORE INTO workflow_stage_attempts
  (id, mission_id, stage_id, attempt_no, run_id, status, input_json, output_json, is_current,
   started_at, completed_at, created_at, updated_at)
SELECT
  'ATTEMPT-' || stage.id || '-1', stage.mission_id, stage.id, 1,
  (SELECT dispatch.run_id FROM agent_dispatches dispatch
   WHERE dispatch.mission_id = stage.mission_id AND dispatch.stage_id = stage.id
     AND dispatch.completed_at IS NULL AND stage.status = 'running'
   ORDER BY dispatch.created_at DESC LIMIT 1),
  stage.status, stage.input_json, stage.output_json, 1,
  CASE WHEN stage.status IN ('running', 'done', 'failed') THEN stage.created_at ELSE NULL END,
  CASE WHEN stage.status IN ('done', 'failed') THEN stage.updated_at ELSE NULL END,
  stage.created_at, stage.updated_at
FROM workflow_stages stage;

-- A replay after a partially applied deployment must also repair attempts that
-- were created before active dispatch identity backfill was added.
UPDATE workflow_stage_attempts
SET run_id = (
  SELECT dispatch.run_id FROM agent_dispatches dispatch
  WHERE dispatch.mission_id = workflow_stage_attempts.mission_id
    AND dispatch.stage_id = workflow_stage_attempts.stage_id
    AND dispatch.completed_at IS NULL
  ORDER BY dispatch.created_at DESC LIMIT 1
)
WHERE is_current = 1 AND status = 'running' AND run_id IS NULL
  AND EXISTS (
    SELECT 1 FROM agent_dispatches dispatch
    WHERE dispatch.mission_id = workflow_stage_attempts.mission_id
      AND dispatch.stage_id = workflow_stage_attempts.stage_id
      AND dispatch.completed_at IS NULL
  );

CREATE TABLE IF NOT EXISTS workflow_checkpoints (
  id                 TEXT PRIMARY KEY,
  mission_id         TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  sequence           INTEGER NOT NULL,
  kind               TEXT NOT NULL CHECK (kind IN ('pause', 'resume', 'change_request', 'reconciled')),
  workflow_version   INTEGER NOT NULL,
  scheduler_revision INTEGER NOT NULL,
  change_version     INTEGER NOT NULL,
  scheduler_state    TEXT NOT NULL CHECK (scheduler_state IN ('clean', 'dirty')),
  payload_json       TEXT NOT NULL DEFAULT '{}',
  created_by         TEXT REFERENCES profiles(id),
  created_at         TEXT NOT NULL,
  UNIQUE (mission_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_mission
  ON workflow_checkpoints(mission_id, sequence DESC);
