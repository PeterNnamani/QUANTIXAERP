-- Adds a tenant guard to every SECURITY DEFINER function that accepts
-- p_company_id. Prevents a caller from acting on a company that isn't
-- their own, even though SECURITY DEFINER bypasses RLS.

BEGIN;

-- ============================================================
-- process_staff_payment
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_staff_payment(
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
  -- Tenant guard: caller may only act on their own company.
  IF p_company_id IS DISTINCT FROM public.current_company_id() THEN
    RAISE EXCEPTION 'Not authorized to act on this company';
  END IF;

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
  VALUES (v_journal_id, p_company_id, COALESCE(p_pay_date, CURRENT_DATE), COALESCE(NULLIF(p_reference, ''), 'PAY-' || left(v_payment_id::text, 8)), 'Payroll payment for ' || v_staff.full_name, 'PAYROLL', v_payment_id::text, 'DRAFT', p_created_by);
  INSERT INTO journal_lines (company_id, entry_id, account_id, debit, credit, description) VALUES
    (p_company_id, v_journal_id, v_payroll_account, v_total, 0, 'Payroll expense for ' || v_staff.full_name),
    (p_company_id, v_journal_id, v_cash_account, 0, v_total, 'Payment from ' || v_bank.name);
  UPDATE journal_entries SET status = 'POSTED' WHERE id = v_journal_id;

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

-- ============================================================
-- post_accounting_cash_movement
-- (Guard must come BEFORE the already-posted early-return so that
--  callers can't probe existence of foreign source_ids.)
-- ============================================================
CREATE OR REPLACE FUNCTION public.post_accounting_cash_movement(
  p_company_id uuid,
  p_source_module text,
  p_source_id text,
  p_reference text,
  p_entry_date date,
  p_description text,
  p_amount numeric,
  p_bank_account_name text,
  p_offset_account_name text,
  p_direction text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric(18,2) := round(COALESCE(p_amount, 0), 2);
  v_bank bank_accounts%ROWTYPE;
  v_cash_account chart_of_accounts%ROWTYPE;
  v_offset_account chart_of_accounts%ROWTYPE;
  v_entry journal_entries%ROWTYPE;
  v_bank_line uuid;
  v_txn_id uuid;
  v_offset_type text;
  v_offset_subtype text;
  v_offset_normal text;
  v_offset_code text;
BEGIN
  -- Tenant guard FIRST (before any read of caller-supplied company data).
  IF p_company_id IS DISTINCT FROM public.current_company_id() THEN
    RAISE EXCEPTION 'Not authorized to act on this company';
  END IF;

  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('posted', false, 'reason', 'amount_not_positive');
  END IF;

  SELECT * INTO v_entry FROM journal_entries
  WHERE company_id = p_company_id AND source_module = p_source_module AND source_id = p_source_id LIMIT 1;
  IF v_entry.id IS NOT NULL THEN
    RETURN jsonb_build_object('posted', false, 'already_posted', true, 'entry_id', v_entry.id);
  END IF;

  SELECT * INTO v_bank FROM bank_accounts
  WHERE company_id = p_company_id AND status = 'active'
    AND ((NULLIF(trim(p_bank_account_name), '') IS NOT NULL AND name = p_bank_account_name)
      OR (NULLIF(trim(p_bank_account_name), '') IS NULL AND lower(COALESCE(p_direction, '')) = 'deposit' AND name ILIKE '%cash%'))
  ORDER BY
    CASE WHEN name = p_bank_account_name THEN 0
         WHEN NULLIF(trim(p_bank_account_name), '') IS NULL AND name ILIKE '% - Cash' THEN 1
         WHEN NULLIF(trim(p_bank_account_name), '') IS NULL AND name ILIKE '%cash%' THEN 2
         ELSE 3 END,
    created_at
  LIMIT 1;
  IF v_bank.id IS NULL THEN RAISE EXCEPTION 'No active bank or cash account is configured for company %', p_company_id; END IF;

  IF lower(COALESCE(p_direction, '')) = 'withdrawal' AND COALESCE(v_bank.balance, 0) < v_amount THEN
    RAISE EXCEPTION 'Insufficient funds in account %', v_bank.name;
  END IF;

  SELECT * INTO v_cash_account FROM chart_of_accounts
  WHERE company_id = p_company_id AND name IN ('Cash', 'Cash and Bank Balance')
  ORDER BY CASE WHEN name = 'Cash' THEN 0 ELSE 1 END LIMIT 1;
  IF v_cash_account.id IS NULL THEN
    INSERT INTO chart_of_accounts (company_id, code, name, account_type, account_subtype, normal_balance, currency, is_active)
    VALUES (p_company_id, 'CASH-' || left(replace(p_company_id::text, '-', ''), 20), 'Cash', 'ASSET', 'CURRENT_ASSET', 'DEBIT', 'NGN', true)
    RETURNING * INTO v_cash_account;
  END IF;

  SELECT * INTO v_offset_account FROM chart_of_accounts
  WHERE company_id = p_company_id AND name = p_offset_account_name LIMIT 1;
  IF v_offset_account.id IS NULL AND NULLIF(trim(p_offset_account_name), '') IS NOT NULL THEN
    IF p_offset_account_name ~* 'revenue|income|sales' THEN
      v_offset_type := 'INCOME'; v_offset_subtype := 'OPERATING_INCOME'; v_offset_normal := 'CREDIT';
    ELSIF p_offset_account_name ~* 'payable|loan|accrual' THEN
      v_offset_type := 'LIABILITY'; v_offset_subtype := 'CURRENT_LIABILITY'; v_offset_normal := 'CREDIT';
    ELSIF p_offset_account_name ~* 'capital|equity|retained' THEN
      v_offset_type := 'EQUITY'; v_offset_subtype := 'OWNER_EQUITY'; v_offset_normal := 'CREDIT';
    ELSE
      v_offset_type := 'EXPENSE'; v_offset_subtype := 'OPERATING_EXPENSE'; v_offset_normal := 'DEBIT';
    END IF;
    v_offset_code := left(upper(regexp_replace(p_offset_account_name, '[^A-Za-z0-9]', '', 'g')), 12) || '-' || left(replace(p_company_id::text, '-', ''), 12);
    INSERT INTO chart_of_accounts (company_id, code, name, account_type, account_subtype, normal_balance, currency, is_active)
    VALUES (p_company_id, v_offset_code, p_offset_account_name, v_offset_type, v_offset_subtype, v_offset_normal, 'NGN', true)
    RETURNING * INTO v_offset_account;
  END IF;
  IF v_cash_account.id IS NULL OR v_offset_account.id IS NULL THEN
    RAISE EXCEPTION 'Required accounting accounts are not configured for company %', p_company_id;
  END IF;

  INSERT INTO journal_entries (company_id, entry_date, reference, description, source_module, source_id, status)
  VALUES (p_company_id, COALESCE(p_entry_date, CURRENT_DATE), p_reference, p_description, p_source_module, p_source_id, 'DRAFT')
  RETURNING * INTO v_entry;

  IF lower(COALESCE(p_direction, '')) = 'withdrawal' THEN
    INSERT INTO journal_lines (company_id, entry_id, account_id, debit, credit, description)
    VALUES (p_company_id, v_entry.id, v_offset_account.id, v_amount, 0, p_description),
          (p_company_id, v_entry.id, v_cash_account.id, 0, v_amount, p_description);
    SELECT id INTO v_bank_line FROM journal_lines
    WHERE entry_id = v_entry.id AND account_id = v_cash_account.id AND credit = v_amount LIMIT 1;
    UPDATE bank_accounts SET balance = balance - v_amount, updated_at = NOW() WHERE id = v_bank.id;
    INSERT INTO bank_transactions (company_id, bank_account_id, txn_date, description, amount, is_reconciled, matched_journal_line_id)
    VALUES (p_company_id, v_bank.id, COALESCE(p_entry_date, CURRENT_DATE), p_description, -v_amount, true, v_bank_line)
    RETURNING id INTO v_txn_id;
  ELSE
    INSERT INTO journal_lines (company_id, entry_id, account_id, debit, credit, description)
    VALUES (p_company_id, v_entry.id, v_cash_account.id, v_amount, 0, p_description),
          (p_company_id, v_entry.id, v_offset_account.id, 0, v_amount, p_description);
    SELECT id INTO v_bank_line FROM journal_lines
    WHERE entry_id = v_entry.id AND account_id = v_cash_account.id AND debit = v_amount LIMIT 1;
    UPDATE bank_accounts SET balance = balance + v_amount, updated_at = NOW() WHERE id = v_bank.id;
    INSERT INTO bank_transactions (company_id, bank_account_id, txn_date, description, amount, is_reconciled, matched_journal_line_id)
    VALUES (p_company_id, v_bank.id, COALESCE(p_entry_date, CURRENT_DATE), p_description, v_amount, true, v_bank_line)
    RETURNING id INTO v_txn_id;
  END IF;

  UPDATE journal_entries SET status = 'POSTED', updated_at = NOW() WHERE id = v_entry.id;

  RETURN jsonb_build_object('posted', true, 'entry_id', v_entry.id, 'transaction_id', v_txn_id, 'bank_account_id', v_bank.id);
END;
$$;

-- ============================================================
-- apply_inventory_action
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_inventory_action(
  p_company_id uuid,
  p_sku text,
  p_action text,
  p_quantity numeric,
  p_reason text,
  p_location text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item products%ROWTYPE;
  previous_quantity numeric;
  event_id uuid;
BEGIN
  -- Tenant guard.
  IF p_company_id IS DISTINCT FROM public.current_company_id() THEN
    RAISE EXCEPTION 'Not authorized to act on this company';
  END IF;

  IF NULLIF(trim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;

  SELECT * INTO item FROM products
  WHERE company_id = p_company_id AND sku = p_sku AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found in this company'; END IF;

  previous_quantity := item.stock_qty;

  IF p_action = 'relocate' THEN
    IF NULLIF(trim(p_location), '') IS NULL THEN RAISE EXCEPTION 'A destination is required'; END IF;
    UPDATE products SET branch = trim(p_location) WHERE id = item.id RETURNING * INTO item;
  ELSIF p_action IN ('receive', 'increase', 'decrease', 'count') THEN
    IF p_quantity IS NULL OR p_quantity::text IN ('NaN','Infinity','-Infinity') OR p_quantity < 0 OR (p_quantity = 0 AND p_action <> 'count') THEN
      RAISE EXCEPTION 'Enter a valid quantity';
    END IF;
    IF p_action = 'decrease' AND p_quantity > item.stock_qty THEN
      RAISE EXCEPTION 'Quantity exceeds available stock';
    END IF;
    UPDATE products SET
      stock_qty = CASE
        WHEN p_action = 'count'    THEN p_quantity
        WHEN p_action = 'decrease' THEN stock_qty - p_quantity
        ELSE stock_qty + p_quantity
      END,
      purchased_qty = purchased_qty + CASE WHEN p_action = 'receive' THEN p_quantity ELSE 0 END,
      last_count_qty      = CASE WHEN p_action = 'count' THEN p_quantity ELSE last_count_qty END,
      last_count_variance = CASE WHEN p_action = 'count' THEN p_quantity - previous_quantity ELSE last_count_variance END,
      last_count_at       = CASE WHEN p_action = 'count' THEN NOW() ELSE last_count_at END,
      last_count_reason   = CASE WHEN p_action = 'count' THEN trim(p_reason) ELSE last_count_reason END
    WHERE id = item.id RETURNING * INTO item;
  ELSE
    RAISE EXCEPTION 'Unknown inventory action';
  END IF;

  INSERT INTO audit_logs(company_id, action, entity, reference, details, metadata)
  VALUES(
    p_company_id,
    upper(p_action),
    'INVENTORY',
    p_sku,
    trim(p_reason),
    jsonb_build_object('previous_quantity', previous_quantity, 'quantity', item.stock_qty, 'location', item.branch)
  )
  RETURNING id INTO event_id;

  RETURN to_jsonb(item) || jsonb_build_object('audit_id', event_id, 'previous_quantity', previous_quantity);
END;
$$;

COMMIT;