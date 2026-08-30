-- Visual DAG workflow model, graph locking and durable dispatch fan-out.
--
-- PinMe may replay every SQL file during a full save. DAG columns therefore
-- live in the replay-safe baseline schema in 002; this migration only performs
-- idempotent data backfill and creates graph-specific objects.

UPDATE workflow_stages
SET position_x = 80 + ((position - 1) * 320), position_y = 160
WHERE position_x = 0 AND position_y = 0
  AND NOT EXISTS (
    SELECT 1 FROM escrows
    WHERE escrows.mission_id = workflow_stages.mission_id
      AND escrows.status <> 'pending'
  );

CREATE TABLE IF NOT EXISTS workflow_edges (
  id              TEXT PRIMARY KEY,
  mission_id      TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  source_stage_id TEXT NOT NULL REFERENCES workflow_stages(id) ON DELETE CASCADE,
  target_stage_id TEXT NOT NULL REFERENCES workflow_stages(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL,
  CHECK (source_stage_id <> target_stage_id),
  UNIQUE (mission_id, source_stage_id, target_stage_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_edges_mission_source
  ON workflow_edges(mission_id, source_stage_id);
CREATE INDEX IF NOT EXISTS idx_workflow_edges_mission_target
  ON workflow_edges(mission_id, target_stage_id);

-- Preserve historical linear execution by connecting each stage to its next
-- greater position. Only backfill an entirely edge-less, still-editable
-- workflow: PinMe replays this file, and adding "missing" positional edges to
-- a newer explicit DAG would both change its semantics and trip the escrow
-- workflow lock after funding.
INSERT OR IGNORE INTO workflow_edges (id, mission_id, source_stage_id, target_stage_id, created_at)
SELECT
  'EDGE-MIGRATED-' || lower(hex(randomblob(12))),
  source.mission_id,
  source.id,
  target.id,
  datetime('now')
FROM workflow_stages source
JOIN workflow_stages target
  ON target.mission_id = source.mission_id
 AND target.position = (
   SELECT MIN(candidate.position)
   FROM workflow_stages candidate
   WHERE candidate.mission_id = source.mission_id
     AND candidate.position > source.position
 )
WHERE NOT EXISTS (
  SELECT 1 FROM workflow_edges existing
  WHERE existing.mission_id = source.mission_id
)
AND NOT EXISTS (
  SELECT 1 FROM escrows
  WHERE escrows.mission_id = source.mission_id
    AND escrows.status <> 'pending'
);

CREATE TABLE IF NOT EXISTS workflow_dispatch_outbox (
  id              TEXT PRIMARY KEY,
  mission_id      TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  stage_id        TEXT NOT NULL REFERENCES workflow_stages(id) ON DELETE CASCADE,
  run_id          TEXT NOT NULL UNIQUE,
  expires_at      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (mission_id, stage_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_dispatch_outbox_ready
  ON workflow_dispatch_outbox(status, next_attempt_at, created_at);

CREATE TRIGGER IF NOT EXISTS trg_workflow_edges_lock_insert
BEFORE INSERT ON workflow_edges
WHEN EXISTS (
  SELECT 1 FROM escrows WHERE mission_id = NEW.mission_id AND status <> 'pending'
)
BEGIN
  SELECT RAISE(ABORT, 'WORKFLOW_LOCKED');
END;

CREATE TRIGGER IF NOT EXISTS trg_workflow_edges_lock_update
BEFORE UPDATE ON workflow_edges
WHEN EXISTS (
  SELECT 1 FROM escrows WHERE mission_id = OLD.mission_id AND status <> 'pending'
)
BEGIN
  SELECT RAISE(ABORT, 'WORKFLOW_LOCKED');
END;

CREATE TRIGGER IF NOT EXISTS trg_workflow_edges_lock_delete
BEFORE DELETE ON workflow_edges
WHEN EXISTS (
  SELECT 1 FROM escrows WHERE mission_id = OLD.mission_id AND status <> 'pending'
)
BEGIN
  SELECT RAISE(ABORT, 'WORKFLOW_LOCKED');
END;

CREATE TRIGGER IF NOT EXISTS trg_workflow_nodes_lock_graph_fields
BEFORE UPDATE OF node_type, position_x, position_y, name, purpose, category, input_json ON workflow_stages
WHEN EXISTS (
  SELECT 1 FROM escrows WHERE mission_id = OLD.mission_id AND status <> 'pending'
)
BEGIN
  SELECT RAISE(ABORT, 'WORKFLOW_LOCKED');
END;
