-- Async export control plane. Large CSV content remains in a private external object service.

CREATE TABLE IF NOT EXISTS export_jobs (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL REFERENCES profiles(id),
  export_type       TEXT NOT NULL CHECK (export_type = 'developer_ledger'),
  token             TEXT NOT NULL CHECK (token IN ('CREDIT', 'mUSDC', 'sETH')),
  status            TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled', 'expired')),
  total_rows        INTEGER NOT NULL CHECK (total_rows > 5000),
  snapshot_created_at TEXT NOT NULL,
  snapshot_id       TEXT NOT NULL,
  processed_rows    INTEGER NOT NULL DEFAULT 0 CHECK (processed_rows >= 0),
  progress          INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  attempt           INTEGER NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  lease_owner       TEXT,
  lease_expires_at  TEXT,
  error_code        TEXT,
  error_message     TEXT,
  started_at        TEXT,
  completed_at      TEXT,
  cancelled_at      TEXT,
  expires_at        TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_owner_created
  ON export_jobs(owner_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_export_jobs_claim
  ON export_jobs(status, created_at ASC, id ASC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_export_jobs_active_owner_token
  ON export_jobs(owner_id, token)
  WHERE status IN ('queued', 'processing', 'completed');

CREATE TABLE IF NOT EXISTS export_artifacts (
  id            TEXT PRIMARY KEY,
  job_id        TEXT NOT NULL UNIQUE REFERENCES export_jobs(id),
  object_key    TEXT NOT NULL UNIQUE,
  sha256        TEXT NOT NULL,
  content_type  TEXT NOT NULL CHECK (content_type = 'text/csv'),
  row_count     INTEGER NOT NULL CHECK (row_count >= 0),
  byte_size     INTEGER NOT NULL CHECK (byte_size > 0),
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  deleted_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_export_artifacts_expiry
  ON export_artifacts(expires_at, deleted_at);

CREATE TABLE IF NOT EXISTS export_job_events (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES export_jobs(id),
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('user', 'service', 'system')),
  actor_id    TEXT,
  action      TEXT NOT NULL CHECK (action IN ('created', 'claimed', 'progressed', 'completed', 'failed', 'cancelled', 'retried', 'expired')),
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_export_job_events_job_created
  ON export_job_events(job_id, created_at ASC, id ASC);
