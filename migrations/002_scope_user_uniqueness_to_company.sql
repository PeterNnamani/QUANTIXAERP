-- Staff identifiers belong to a company, not to the whole platform.
-- Run this migration against existing databases created from initial_schema.sql.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_staff_id_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;

CREATE UNIQUE INDEX IF NOT EXISTS users_company_email_key ON users(company_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS users_company_staff_id_key ON users(company_id, staff_id) WHERE staff_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_company_username_key ON users(company_id, username) WHERE username IS NOT NULL;