-- Scope bank accounts to a company and retain the account setup entered by Super Admin.
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'Current';
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS branch text;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS opening_balance numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS opening_balance_date date;

ALTER TABLE bank_accounts DROP CONSTRAINT IF EXISTS bank_accounts_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_company_name_key ON bank_accounts(company_id, name);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_company_id ON bank_accounts(company_id);