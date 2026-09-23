-- Keep accounting writes compatible with databases created before tenancy and sale-device fields were added.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS device_used text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_account text;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sales_company_id ON sales(company_id);
CREATE INDEX IF NOT EXISTS idx_purchases_company_id ON purchases(company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_company_id ON expenses(company_id);

CREATE UNIQUE INDEX IF NOT EXISTS sales_reference_key ON sales(reference);
CREATE UNIQUE INDEX IF NOT EXISTS purchases_reference_key ON purchases(reference);
CREATE UNIQUE INDEX IF NOT EXISTS expenses_reference_key ON expenses(reference);