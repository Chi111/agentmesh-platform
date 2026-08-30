-- Create a canonical Web2 profile for the platform administrator before the
-- first Google sign-in. A later verified sign-in with the same email is linked
-- to this profile by ensureIdentityProfile; no Web3 wallet is stored here.

INSERT INTO profiles (id, email, display_name, role)
SELECT
  'agentmesh-admin',
  'chi435900020@gmail.com',
  'Platform Administrator',
  'admin'
WHERE NOT EXISTS (
  SELECT 1
  FROM profiles
  WHERE lower(COALESCE(email, '')) = 'chi435900020@gmail.com'
);

-- Migration 032 installs the profile update trigger that assigns official
-- Agent ownership and transfers any legacy CREDIT rewards. Updating an
-- existing profile also handles deployments where the administrator signed in
-- between migrations 032 and 033.
UPDATE profiles
SET role = 'admin',
    updated_at = datetime('now')
WHERE lower(COALESCE(email, '')) = 'chi435900020@gmail.com';
