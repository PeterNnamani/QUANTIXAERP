ALTER TABLE users
  ADD COLUMN IF NOT EXISTS user_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_users_company_staff_id
  ON users(company_id, staff_id);