-- Bind idempotency keys to request semantics and enforce one active dispute per mission.
-- Concurrency fields live in the replay-safe baseline schemas in 002 and 007.

UPDATE agent_callback_events
SET processing_token = 'legacy:' || run_id || ':' || callback_id,
    applied_at = created_at
WHERE processing_token IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_disputes_single_active_insert
BEFORE INSERT ON disputes
WHEN NEW.status IN ('open', 'reviewing')
  AND EXISTS (
    SELECT 1 FROM disputes
    WHERE mission_id = NEW.mission_id AND status IN ('open', 'reviewing')
  )
BEGIN
  SELECT RAISE(ABORT, 'ACTIVE_DISPUTE_EXISTS');
END;

CREATE TRIGGER IF NOT EXISTS trg_disputes_single_active_update
BEFORE UPDATE OF status, mission_id ON disputes
WHEN NEW.status IN ('open', 'reviewing')
  AND EXISTS (
    SELECT 1 FROM disputes
    WHERE mission_id = NEW.mission_id
      AND id <> NEW.id
      AND status IN ('open', 'reviewing')
  )
BEGIN
  SELECT RAISE(ABORT, 'ACTIVE_DISPUTE_EXISTS');
END;

CREATE TRIGGER IF NOT EXISTS trg_disputes_require_held_escrow
BEFORE INSERT ON disputes
WHEN NOT EXISTS (
    SELECT 1 FROM disputes
    WHERE mission_id = NEW.mission_id AND status IN ('open', 'reviewing')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM missions m
    JOIN escrows e ON e.mission_id = m.id
    WHERE m.id = NEW.mission_id
      AND m.status IN ('running', 'review')
      AND m.cancelled_at IS NULL
      AND e.status = 'held'
  )
BEGIN
  SELECT RAISE(ABORT, 'ESCROW_NOT_HELD');
END;
