-- SQLite/D1 does not support ADD COLUMN IF NOT EXISTS. Rebuild the leaf table
-- so this migration is safe to replay during recovery as well as on upgrade.
DROP TABLE IF EXISTS deliverables_with_attempts;

CREATE TABLE deliverables_with_attempts (
  id           TEXT PRIMARY KEY,
  mission_id   TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  stage_id     TEXT REFERENCES workflow_stages(id),
  agent_id     TEXT REFERENCES agents(id),
  name         TEXT NOT NULL,
  uri          TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'accepted', 'rejected')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  attempt_no   INTEGER CHECK (attempt_no IS NULL OR attempt_no >= 1)
);

INSERT INTO deliverables_with_attempts
  (id, mission_id, stage_id, agent_id, name, uri, content_hash, mime_type, status, created_at, attempt_no)
SELECT
  d.id,
  d.mission_id,
  d.stage_id,
  d.agent_id,
  d.name,
  d.uri,
  d.content_hash,
  d.mime_type,
  d.status,
  d.created_at,
  CASE
    WHEN d.stage_id IS NULL THEN NULL
    ELSE COALESCE((
      SELECT MAX(a.attempt_no)
      FROM workflow_stage_attempts a
      WHERE a.mission_id = d.mission_id
        AND a.stage_id = d.stage_id
        AND a.created_at <= d.created_at
    ), 1)
  END
FROM deliverables d;

DROP TABLE deliverables;
ALTER TABLE deliverables_with_attempts RENAME TO deliverables;

CREATE INDEX IF NOT EXISTS idx_deliverables_mission
  ON deliverables(mission_id, created_at);

CREATE INDEX IF NOT EXISTS idx_deliverables_stage_attempt
  ON deliverables(mission_id, stage_id, attempt_no, status, created_at);
