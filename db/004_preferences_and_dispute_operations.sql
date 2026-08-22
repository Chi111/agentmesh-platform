-- Persist user-facing workspace preferences and append-only dispute audit actions.

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id             TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  task_updates        INTEGER NOT NULL DEFAULT 1 CHECK (task_updates IN (0, 1)),
  settlement_updates  INTEGER NOT NULL DEFAULT 1 CHECK (settlement_updates IN (0, 1)),
  product_updates     INTEGER NOT NULL DEFAULT 0 CHECK (product_updates IN (0, 1)),
  email_channel       INTEGER NOT NULL DEFAULT 1 CHECK (email_channel IN (0, 1)),
  locale              TEXT NOT NULL DEFAULT 'zh-CN' CHECK (locale IN ('zh-CN', 'en-US')),
  time_zone           TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dispute_actions (
  id          TEXT PRIMARY KEY,
  dispute_id  TEXT NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  actor_id    TEXT NOT NULL REFERENCES profiles(id),
  action      TEXT NOT NULL CHECK (action IN ('review_started', 'resolved', 'rejected')),
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dispute_actions_case
  ON dispute_actions(dispute_id, created_at ASC);
