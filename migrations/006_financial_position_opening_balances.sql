-- Store opening balances for every asset, liability, and equity account.
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS opening_balance numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS opening_balance_date date;