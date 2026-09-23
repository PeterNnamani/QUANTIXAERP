-- Store the manually assigned staff title and per-menu view/edit access.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_title text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_levels jsonb;