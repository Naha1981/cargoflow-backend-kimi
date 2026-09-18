-- Supabase external identity bridge
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS external_auth_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_external_auth_id
  ON users(external_auth_id)
  WHERE external_auth_id IS NOT NULL;
