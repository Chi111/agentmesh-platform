-- `attempt_no` is part of the canonical deliverables schema in 002. PinMe
-- replays every SQL file on update-db, so this migration must remain a no-op
-- after the one-time historical table rebuild has already completed. Rebuilding
-- the table again would cascade-delete deliverable_ipfs_evidence rows.
CREATE INDEX IF NOT EXISTS idx_deliverables_mission
  ON deliverables(mission_id, created_at);

CREATE INDEX IF NOT EXISTS idx_deliverables_stage_attempt
  ON deliverables(mission_id, stage_id, attempt_no, status, created_at);
