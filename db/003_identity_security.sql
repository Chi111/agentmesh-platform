-- Canonical identity links allow PinMe, Privy email/social and wallets to map
-- to one AgentMesh profile without trusting browser-supplied identity fields.
CREATE TABLE IF NOT EXISTS auth_identities (
  provider       TEXT NOT NULL,
  subject        TEXT NOT NULL,
  profile_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email          TEXT,
  wallet_address TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (provider, subject)
);

CREATE INDEX IF NOT EXISTS idx_auth_identities_profile ON auth_identities(profile_id);
CREATE INDEX IF NOT EXISTS idx_auth_identities_email ON auth_identities(email);
CREATE INDEX IF NOT EXISTS idx_auth_identities_wallet ON auth_identities(wallet_address);

-- D1-backed fixed-window limiter. Rows are intentionally compact and can be
-- pruned by normal maintenance after their window has expired.
CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket       TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0
);
