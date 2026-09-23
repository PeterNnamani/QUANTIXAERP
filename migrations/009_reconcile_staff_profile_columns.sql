-- Keep staff profile writes compatible with databases created before these fields existed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_title text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_levels jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS branch text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS position text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS salary text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employment_date text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT NOW();