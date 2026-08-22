-- Payment selection and test-only Web2 balances.
-- CREDIT is an internal test balance and never represents withdrawable fiat or crypto.

UPDATE escrows
SET token = 'CREDIT', network = 'agentmesh', payment_method = 'web2_balance';

UPDATE ledger_entries
SET token = 'CREDIT'
WHERE token = 'USDC' AND tx_hash IS NULL;

CREATE TABLE IF NOT EXISTS wallet_balances (
  user_id    TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  balance    REAL NOT NULL DEFAULT 0 CHECK (balance >= 0),
  token      TEXT NOT NULL DEFAULT 'CREDIT' CHECK (token = 'CREDIT'),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id             TEXT PRIMARY KEY,
  settlement_key TEXT NOT NULL UNIQUE,
  user_id        TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('test_topup', 'mission_hold', 'agent_payout', 'refund')),
  amount         REAL NOT NULL CHECK (amount <> 0),
  token          TEXT NOT NULL DEFAULT 'CREDIT' CHECK (token = 'CREDIT'),
  mission_id     TEXT REFERENCES missions(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user
  ON wallet_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS test_topup_claims (
  user_id       TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  last_claim_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS trg_wallet_prevent_overdraft
BEFORE INSERT ON wallet_transactions
WHEN NEW.amount < 0
  AND COALESCE((SELECT balance FROM wallet_balances WHERE user_id = NEW.user_id), 0) + NEW.amount < 0
BEGIN
  SELECT RAISE(ABORT, 'INSUFFICIENT_BALANCE');
END;

CREATE TRIGGER IF NOT EXISTS trg_wallet_apply_transaction
AFTER INSERT ON wallet_transactions
BEGIN
  INSERT INTO wallet_balances (user_id, balance, token, updated_at)
  VALUES (NEW.user_id, NEW.amount, 'CREDIT', NEW.created_at)
  ON CONFLICT(user_id) DO UPDATE SET
    balance = wallet_balances.balance + NEW.amount,
    updated_at = NEW.created_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_test_topup_first_claim
AFTER INSERT ON test_topup_claims
BEGIN
  INSERT INTO wallet_transactions
    (id, settlement_key, user_id, transaction_type, amount, token, mission_id, created_at)
  VALUES
    (lower(hex(randomblob(16))), 'test-topup:' || NEW.user_id || ':' || NEW.last_claim_at,
     NEW.user_id, 'test_topup', 100, 'CREDIT', NULL, NEW.last_claim_at);
END;

CREATE TRIGGER IF NOT EXISTS trg_test_topup_repeat_claim
AFTER UPDATE OF last_claim_at ON test_topup_claims
WHEN NEW.last_claim_at <> OLD.last_claim_at
BEGIN
  INSERT INTO wallet_transactions
    (id, settlement_key, user_id, transaction_type, amount, token, mission_id, created_at)
  VALUES
    (lower(hex(randomblob(16))), 'test-topup:' || NEW.user_id || ':' || NEW.last_claim_at,
     NEW.user_id, 'test_topup', 100, 'CREDIT', NULL, NEW.last_claim_at);
END;
