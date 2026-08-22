-- Admin-only role operations are appended here so access changes remain auditable.

CREATE TABLE IF NOT EXISTS admin_actions (
  id             TEXT PRIMARY KEY,
  actor_id       TEXT NOT NULL REFERENCES profiles(id),
  target_user_id TEXT NOT NULL REFERENCES profiles(id),
  action         TEXT NOT NULL CHECK (action IN ('role_changed')),
  detail_json    TEXT NOT NULL DEFAULT '{}',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_created
  ON admin_actions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_actions_target
  ON admin_actions(target_user_id, created_at DESC);

-- This database guard closes the race where two administrators attempt to
-- demote one another concurrently after both observed an admin count of two.
CREATE TRIGGER IF NOT EXISTS trg_profiles_keep_last_admin
BEFORE UPDATE OF role ON profiles
WHEN OLD.role = 'admin'
  AND NEW.role <> 'admin'
  AND (SELECT COUNT(*) FROM profiles WHERE role = 'admin') <= 1
BEGIN
  SELECT RAISE(ABORT, 'LAST_ADMIN_REQUIRED');
END;
