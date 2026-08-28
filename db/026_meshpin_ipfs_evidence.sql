CREATE TABLE IF NOT EXISTS deliverable_ipfs_evidence (
  deliverable_id          TEXT PRIMARY KEY REFERENCES deliverables(id) ON DELETE CASCADE,
  mission_id              TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  scope_key               TEXT NOT NULL,
  version_no              INTEGER NOT NULL CHECK (version_no >= 1),
  supersedes_deliverable_id TEXT REFERENCES deliverables(id),
  provider                TEXT NOT NULL CHECK (provider = 'pinme_ipfs'),
  root_cid                TEXT NOT NULL,
  manifest_path           TEXT NOT NULL CHECK (manifest_path = '/manifest.json'),
  manifest_sha256         TEXT NOT NULL,
  manifest_json           TEXT NOT NULL,
  file_count              INTEGER NOT NULL CHECK (file_count >= 0),
  total_bytes             INTEGER NOT NULL CHECK (total_bytes >= 0),
  visibility              TEXT NOT NULL CHECK (visibility IN ('public', 'encrypted')),
  verification_status     TEXT NOT NULL DEFAULT 'declared'
    CHECK (verification_status IN ('declared', 'verified', 'unavailable', 'hash_mismatch', 'invalid_manifest')),
  last_verified_at        TEXT,
  last_verification_error TEXT,
  submitted_by            TEXT NOT NULL,
  created_at              TEXT NOT NULL,
  UNIQUE (mission_id, scope_key, version_no),
  UNIQUE (mission_id, scope_key, root_cid)
);

CREATE INDEX IF NOT EXISTS idx_ipfs_evidence_mission_scope
  ON deliverable_ipfs_evidence(mission_id, scope_key, version_no);

CREATE TABLE IF NOT EXISTS mission_acceptance_snapshots (
  mission_id                  TEXT PRIMARY KEY REFERENCES missions(id) ON DELETE CASCADE,
  deliverables_json           TEXT NOT NULL,
  acceptance_criteria_sha256  TEXT NOT NULL,
  workflow_version            INTEGER NOT NULL,
  scheduler_revision          INTEGER NOT NULL,
  event_watermark             TEXT,
  accepted_by                 TEXT NOT NULL,
  created_at                  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dispute_evidence_snapshots (
  dispute_id                  TEXT PRIMARY KEY REFERENCES disputes(id) ON DELETE CASCADE,
  mission_id                  TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  deliverables_json           TEXT NOT NULL,
  acceptance_criteria_sha256  TEXT NOT NULL,
  workflow_version            INTEGER NOT NULL,
  scheduler_revision          INTEGER NOT NULL,
  event_watermark             TEXT,
  frozen_by                   TEXT NOT NULL,
  created_at                  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence_publications (
  id              TEXT PRIMARY KEY,
  mission_id      TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('acceptance_dossier', 'dispute_dossier')),
  subject_id      TEXT NOT NULL,
  payload_sha256  TEXT NOT NULL,
  root_cid        TEXT NOT NULL,
  published_by    TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  UNIQUE (kind, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_evidence_publications_mission
  ON evidence_publications(mission_id, created_at DESC);
