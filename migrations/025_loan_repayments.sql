-- Record the funding account and debt for every loan repayment.
CREATE TABLE IF NOT EXISTS loan_repayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  loan_reference text NOT NULL,
  bank_account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL DEFAULT 'Bank Transfer',
  repayment_date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loan_repayments_company_date
  ON loan_repayments(company_id, repayment_date DESC);
CREATE INDEX IF NOT EXISTS idx_loan_repayments_loan
  ON loan_repayments(company_id, loan_reference);
