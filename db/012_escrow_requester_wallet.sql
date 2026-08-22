-- The column is part of the replay-safe base schema in 002_agentmesh_core.sql.
-- Keep this migration idempotent because PinMe may replay SQL files on save.
CREATE INDEX IF NOT EXISTS idx_escrows_requester_wallet
ON escrows(requester_wallet_address);
