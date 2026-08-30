-- User-owned PinMe upload credentials. Ciphertext is encrypted by the Worker
-- with the project secret; plaintext AppKeys are never stored in D1.

CREATE TABLE IF NOT EXISTS user_pinme_credentials (
  user_id TEXT PRIMARY KEY,
  address_hint TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);
