-- The three built-in Agents are operated by the platform administrator. Their
-- on-chain payouts share the administrator wallet, while their Web2 ownership
-- follows the verified Google/email profile UID. The two payment identities
-- remain independent and are joined only through Agent ownership.

UPDATE profiles
SET role = 'admin',
    updated_at = datetime('now')
WHERE lower(COALESCE(email, '')) = 'chi435900020@gmail.com';

UPDATE agents
SET wallet_address = '0x73325bd3e93d9a12e5d2d5219424daf0e55f856d',
    updated_at = datetime('now')
WHERE id IN (
  'official-evidence-scout',
  'official-strategy-analyst',
  'official-delivery-writer'
);

-- Preserve any CREDIT earned before the ownership correction. Replaying this
-- migration is safe because the legacy balance is zeroed after the transfer.
INSERT INTO wallet_balances (user_id, balance, token, updated_at)
SELECT
  administrator.id,
  legacy.balance,
  legacy.token,
  datetime('now')
FROM profiles AS administrator
JOIN wallet_balances AS legacy ON legacy.user_id = 'agentmesh-official'
WHERE lower(COALESCE(administrator.email, '')) = 'chi435900020@gmail.com'
ON CONFLICT(user_id) DO UPDATE SET
  balance = ROUND(wallet_balances.balance + excluded.balance, 6),
  token = excluded.token,
  updated_at = excluded.updated_at;

UPDATE wallet_balances
SET balance = 0,
    updated_at = datetime('now')
WHERE user_id = 'agentmesh-official'
  AND EXISTS (
    SELECT 1
    FROM profiles
    WHERE lower(COALESCE(email, '')) = 'chi435900020@gmail.com'
  );

UPDATE wallet_transactions
SET user_id = (
  SELECT id
  FROM profiles
  WHERE lower(COALESCE(email, '')) = 'chi435900020@gmail.com'
  LIMIT 1
)
WHERE user_id = 'agentmesh-official'
  AND transaction_type = 'agent_payout'
  AND EXISTS (
    SELECT 1
    FROM profiles
    WHERE lower(COALESCE(email, '')) = 'chi435900020@gmail.com'
  );

UPDATE reward_activities
SET user_id = (
  SELECT id
  FROM profiles
  WHERE lower(COALESCE(email, '')) = 'chi435900020@gmail.com'
  LIMIT 1
)
WHERE user_id = 'agentmesh-official'
  AND role = 'agent_owner'
  AND EXISTS (
    SELECT 1
    FROM profiles
    WHERE lower(COALESCE(email, '')) = 'chi435900020@gmail.com'
  );

UPDATE agents
SET owner_id = (
      SELECT id
      FROM profiles
      WHERE lower(COALESCE(email, '')) = 'chi435900020@gmail.com'
      LIMIT 1
    ),
    author_name = (
      SELECT display_name
      FROM profiles
      WHERE lower(COALESCE(email, '')) = 'chi435900020@gmail.com'
      LIMIT 1
    ),
    updated_at = datetime('now')
WHERE id IN (
    'official-evidence-scout',
    'official-strategy-analyst',
    'official-delivery-writer'
  )
  AND EXISTS (
    SELECT 1
    FROM profiles
    WHERE lower(COALESCE(email, '')) = 'chi435900020@gmail.com'
  );

-- Fresh environments can run migrations before the administrator first signs
-- in. These triggers complete the same binding once the verified Web2 profile
-- is inserted or updated with the administrator email.
CREATE TRIGGER IF NOT EXISTS trg_official_agents_admin_profile_insert
AFTER INSERT ON profiles
WHEN lower(COALESCE(NEW.email, '')) = 'chi435900020@gmail.com'
BEGIN
  UPDATE profiles
  SET role = 'admin',
      updated_at = datetime('now')
  WHERE id = NEW.id AND role <> 'admin';

  INSERT INTO wallet_balances (user_id, balance, token, updated_at)
  SELECT NEW.id, balance, token, datetime('now')
  FROM wallet_balances
  WHERE user_id = 'agentmesh-official'
  ON CONFLICT(user_id) DO UPDATE SET
    balance = ROUND(wallet_balances.balance + excluded.balance, 6),
    token = excluded.token,
    updated_at = excluded.updated_at;

  UPDATE wallet_balances
  SET balance = 0,
      updated_at = datetime('now')
  WHERE user_id = 'agentmesh-official';

  UPDATE wallet_transactions
  SET user_id = NEW.id
  WHERE user_id = 'agentmesh-official'
    AND transaction_type = 'agent_payout';

  UPDATE reward_activities
  SET user_id = NEW.id
  WHERE user_id = 'agentmesh-official'
    AND role = 'agent_owner';

  UPDATE agents
  SET owner_id = NEW.id,
      wallet_address = '0x73325bd3e93d9a12e5d2d5219424daf0e55f856d',
      author_name = NEW.display_name,
      updated_at = datetime('now')
  WHERE id IN (
    'official-evidence-scout',
    'official-strategy-analyst',
    'official-delivery-writer'
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_official_agents_admin_profile_update
AFTER UPDATE OF email, role, display_name ON profiles
WHEN lower(COALESCE(NEW.email, '')) = 'chi435900020@gmail.com'
BEGIN
  UPDATE profiles
  SET role = 'admin',
      updated_at = datetime('now')
  WHERE id = NEW.id AND role <> 'admin';

  INSERT INTO wallet_balances (user_id, balance, token, updated_at)
  SELECT NEW.id, balance, token, datetime('now')
  FROM wallet_balances
  WHERE user_id = 'agentmesh-official'
  ON CONFLICT(user_id) DO UPDATE SET
    balance = ROUND(wallet_balances.balance + excluded.balance, 6),
    token = excluded.token,
    updated_at = excluded.updated_at;

  UPDATE wallet_balances
  SET balance = 0,
      updated_at = datetime('now')
  WHERE user_id = 'agentmesh-official';

  UPDATE wallet_transactions
  SET user_id = NEW.id
  WHERE user_id = 'agentmesh-official'
    AND transaction_type = 'agent_payout';

  UPDATE reward_activities
  SET user_id = NEW.id
  WHERE user_id = 'agentmesh-official'
    AND role = 'agent_owner';

  UPDATE agents
  SET owner_id = NEW.id,
      wallet_address = '0x73325bd3e93d9a12e5d2d5219424daf0e55f856d',
      author_name = NEW.display_name,
      updated_at = datetime('now')
  WHERE id IN (
    'official-evidence-scout',
    'official-strategy-analyst',
    'official-delivery-writer'
  );
END;
