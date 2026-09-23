-- Payroll payments are posted atomically so the bank, payroll, and ledger remain aligned.
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS staff_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
  pay_date date NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  base_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (base_amount >= 0),
  incentive_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (incentive_amount >= 0),
  deductions numeric(18,2) NOT NULL DEFAULT 0 CHECK (deductions >= 0),
  total_amount numeric(18,2) NOT NULL CHECK (total_amount > 0),
  incentive_type text,
  kpi_score numeric(5,2),
  reference text,
  status text NOT NULL DEFAULT 'PAID',
  journal_entry_id uuid REFERENCES journal_entries(id),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_payments_company_date ON staff_payments(company_id, pay_date DESC);

CREATE OR REPLACE FUNCTION process_staff_payment(
  p_company_id uuid,
  p_staff_id text,
  p_bank_account_id uuid,
  p_pay_date date,
  p_currency text,
  p_base_amount numeric,
  p_incentive_amount numeric,
  p_deductions numeric,
  p_incentive_type text,
  p_kpi_score numeric,
  p_reference text,
  p_created_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff users%ROWTYPE;
  v_bank bank_accounts%ROWTYPE;
  v_payment_id uuid := gen_random_uuid();
  v_journal_id uuid := gen_random_uuid();
  v_payroll_account uuid;
  v_cash_account uuid;
  v_total numeric(18,2);
  v_bank_txn_id uuid := gen_random_uuid();
  v_currency text := COALESCE(NULLIF(p_currency, ''), 'NGN');
BEGIN
  IF p_base_amount < 0 OR p_incentive_amount < 0 OR p_deductions < 0 THEN
    RAISE EXCEPTION 'Payroll amounts cannot be negative';
  END IF;
  v_total := round(COALESCE(p_base_amount, 0) + COALESCE(p_incentive_amount, 0) - COALESCE(p_deductions, 0), 2);
  IF v_total <= 0 THEN RAISE EXCEPTION 'Net pay must be greater than zero'; END IF;

  SELECT * INTO v_staff FROM users WHERE company_id = p_company_id AND staff_id = p_staff_id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staff member was not found'; END IF;
  SELECT * INTO v_bank FROM bank_accounts WHERE id = p_bank_account_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bank account was not found'; END IF;
  IF COALESCE(v_bank.balance, 0) < v_total THEN RAISE EXCEPTION 'Insufficient funds in %', v_bank.name; END IF;

  SELECT id INTO v_payroll_account FROM chart_of_accounts WHERE company_id = p_company_id AND name = 'Payroll Expense' LIMIT 1;
  IF v_payroll_account IS NULL THEN
    INSERT INTO chart_of_accounts (company_id, code, name, account_type, account_subtype, normal_balance, currency)
    VALUES (p_company_id, 'PAYROLL-' || replace(p_company_id::text, '-', ''), 'Payroll Expense', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT', v_currency)
    RETURNING id INTO v_payroll_account;
  END IF;

  SELECT id INTO v_cash_account FROM chart_of_accounts WHERE (company_id = p_company_id OR company_id IS NULL) AND name = 'Cash' LIMIT 1;
  IF v_cash_account IS NULL THEN
    INSERT INTO chart_of_accounts (company_id, code, name, account_type, account_subtype, normal_balance, currency)
    VALUES (p_company_id, 'CASH-' || replace(p_company_id::text, '-', ''), 'Cash', 'ASSET', 'CURRENT_ASSET', 'DEBIT', v_currency)
    RETURNING id INTO v_cash_account;
  ELSE
    UPDATE chart_of_accounts SET company_id = p_company_id WHERE id = v_cash_account AND company_id IS NULL;
  END IF;

  INSERT INTO staff_payments (id, company_id, staff_id, bank_account_id, pay_date, currency, base_amount, incentive_amount, deductions, total_amount, incentive_type, kpi_score, reference, created_by)
  VALUES (v_payment_id, p_company_id, v_staff.id, v_bank.id, COALESCE(p_pay_date, CURRENT_DATE), v_currency, p_base_amount, p_incentive_amount, p_deductions, v_total, p_incentive_type, p_kpi_score, NULLIF(p_reference, ''), p_created_by);

  INSERT INTO journal_entries (id, company_id, entry_date, reference, description, source_module, source_id, status, created_by)
  VALUES (v_journal_id, p_company_id, COALESCE(p_pay_date, CURRENT_DATE), COALESCE(NULLIF(p_reference, ''), 'PAY-' || left(v_payment_id::text, 8)), 'Payroll payment for ' || v_staff.full_name, 'PAYROLL', v_payment_id::text, 'POSTED', p_created_by);
  INSERT INTO journal_lines (company_id, entry_id, account_id, debit, credit, description) VALUES
    (p_company_id, v_journal_id, v_payroll_account, v_total, 0, 'Payroll expense for ' || v_staff.full_name),
    (p_company_id, v_journal_id, v_cash_account, 0, v_total, 'Payment from ' || v_bank.name);

  INSERT INTO bank_transactions (id, company_id, bank_account_id, txn_date, description, amount, is_reconciled, matched_journal_line_id)
  VALUES (v_bank_txn_id, p_company_id, v_bank.id, COALESCE(p_pay_date, CURRENT_DATE), 'Payroll payment - ' || v_staff.full_name, -v_total, true, (SELECT id FROM journal_lines WHERE entry_id = v_journal_id AND credit = v_total LIMIT 1));
  INSERT INTO expenses (id, company_id, reference, expense_date, description, category, amount, bank_account_id, status, notes, entered_by)
  VALUES (v_payment_id, p_company_id, v_payment_id::text, COALESCE(p_pay_date, CURRENT_DATE), 'Payroll payment - ' || v_staff.full_name, 'Salary', v_total, v_bank.id, 'Paid', NULLIF(p_reference, ''), p_created_by);
  UPDATE bank_accounts SET balance = balance - v_total, updated_at = NOW() WHERE id = v_bank.id;
  UPDATE staff_payments SET journal_entry_id = v_journal_id WHERE id = v_payment_id;

  RETURN jsonb_build_object(
    'payment', jsonb_build_object('id', v_payment_id, 'staffId', v_staff.staff_id, 'staffName', v_staff.full_name, 'bankAccountId', v_bank.id, 'bankName', v_bank.name, 'payDate', COALESCE(p_pay_date, CURRENT_DATE), 'currency', v_currency, 'baseAmount', p_base_amount, 'incentiveAmount', p_incentive_amount, 'deductions', p_deductions, 'totalAmount', v_total, 'incentiveType', p_incentive_type, 'kpiScore', p_kpi_score, 'reference', p_reference, 'status', 'PAID', 'journalEntryId', v_journal_id),
    'bankBalance', v_bank.balance - v_total,
    'bankTransaction', jsonb_build_object('id', v_bank_txn_id, 'date', COALESCE(p_pay_date, CURRENT_DATE), 'name', 'Payroll payment - ' || v_staff.full_name, 'activity', 'Payroll', 'method', 'Bank Transfer', 'amount', -v_total, 'status', 'Completed', 'description', 'Payroll payment - ' || v_staff.full_name, 'type', 'Withdrawal', 'bank', v_bank.name),
    'journalEntry', jsonb_build_object('id', v_journal_id, 'entryDate', COALESCE(p_pay_date, CURRENT_DATE), 'reference', COALESCE(NULLIF(p_reference, ''), 'PAY-' || left(v_payment_id::text, 8)), 'description', 'Payroll payment for ' || v_staff.full_name, 'sourceModule', 'PAYROLL', 'sourceId', v_payment_id, 'status', 'POSTED'),
    'journalLines', (SELECT jsonb_agg(jsonb_build_object('id', id, 'entryId', entry_id, 'accountId', account_id, 'debit', debit, 'credit', credit, 'description', description)) FROM journal_lines WHERE entry_id = v_journal_id)
  );
END;
$$;