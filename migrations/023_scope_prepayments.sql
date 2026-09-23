-- Keep prepayments and their schedules isolated by company and preserve the UI category.
ALTER TABLE prepayments
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Supplier Advances';

ALTER TABLE prepayment_schedules
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_prepayments_company_id ON prepayments(company_id);
CREATE INDEX IF NOT EXISTS idx_prepayment_schedules_company_id ON prepayment_schedules(company_id);
