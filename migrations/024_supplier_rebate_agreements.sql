CREATE TABLE IF NOT EXISTS supplier_rebate_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  title text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  target numeric(18,2) NOT NULL DEFAULT 0,
  current_purchase numeric(18,2) NOT NULL DEFAULT 0,
  rebate_rate numeric(8,4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT supplier_rebate_agreements_period_check CHECK (period_end >= period_start),
  CONSTRAINT supplier_rebate_agreements_rate_check CHECK (rebate_rate >= 0)
);

CREATE INDEX IF NOT EXISTS idx_supplier_rebate_agreements_company
  ON supplier_rebate_agreements(company_id, period_end);
CREATE INDEX IF NOT EXISTS idx_supplier_rebate_agreements_supplier
  ON supplier_rebate_agreements(supplier_id);