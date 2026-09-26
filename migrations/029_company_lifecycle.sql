-- Company lifecycle: a Super Admin can wipe books while keeping the company,
-- or close the account and delete the company. Posted journals are immutable
-- unless this reset flag is set inside wipe_company_books.
-- Apply this migration in the Supabase SQL editor before using Delete company data.

CREATE OR REPLACE FUNCTION prevent_posted_journal_entry_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('quantixa.company_reset', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'POSTED' THEN
    RAISE EXCEPTION 'Cannot modify posted journal entry %', OLD.id;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'POSTED' THEN
    RAISE EXCEPTION 'Cannot delete posted journal entry %', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_posted_journal_line_modification()
RETURNS TRIGGER AS $$
DECLARE
  parent_status text;
  parent_entry_id uuid;
BEGIN
  IF current_setting('quantixa.company_reset', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    parent_entry_id := OLD.entry_id;
  ELSE
    parent_entry_id := NEW.entry_id;
  END IF;

  SELECT status INTO parent_status FROM journal_entries WHERE id = parent_entry_id;
  IF parent_status = 'POSTED' THEN
    RAISE EXCEPTION 'Cannot modify journal lines for posted entry %', parent_entry_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION wipe_company_books(p_company_id uuid, p_close boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tbl text;
  book_tables text[] := ARRAY[
    'bank_transactions',
    'bank_reconciliations',
    'receipt_allocations',
    'sales_invoice_lines',
    'sale_items',
    'purchase_items',
    'inventory_movements',
    'stock_counts',
    'journal_lines',
    'prepayment_schedules',
    'loan_repayment_schedules',
    'loan_repayments',
    'lease_payment_schedules',
    'depreciation_schedules',
    'asset_value_adjustments',
    'receipts',
    'sales_invoices',
    'journal_entries',
    'sales',
    'purchases',
    'expenses',
    'expense_categories',
    'products',
    'contacts',
    'customers',
    'receivables',
    'payables',
    'prepayments',
    'loans',
    'leases',
    'fixed_assets',
    'provisions',
    'deferred_tax_calculations',
    'approval_workflows',
    'supplier_rebate_agreements',
    'staff_payments',
    'audit_logs',
    'bank_accounts',
    'accounting_periods',
    'chart_of_accounts'
  ];
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Company is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Company % was not found', p_company_id;
  END IF;

  PERFORM set_config('quantixa.company_reset', 'on', true);

  IF to_regclass('public.bank_transactions') IS NOT NULL AND to_regclass('public.bank_accounts') IS NOT NULL THEN
    DELETE FROM bank_transactions bt USING bank_accounts ba WHERE bt.bank_account_id = ba.id AND ba.company_id = p_company_id;
  END IF;
  IF to_regclass('public.bank_reconciliations') IS NOT NULL AND to_regclass('public.bank_accounts') IS NOT NULL THEN
    DELETE FROM bank_reconciliations br USING bank_accounts ba WHERE br.bank_account_id = ba.id AND ba.company_id = p_company_id;
  END IF;
  IF to_regclass('public.receipt_allocations') IS NOT NULL AND to_regclass('public.receipts') IS NOT NULL THEN
    DELETE FROM receipt_allocations ra USING receipts r WHERE ra.receipt_id = r.id AND r.company_id = p_company_id;
  END IF;
  IF to_regclass('public.journal_lines') IS NOT NULL AND to_regclass('public.journal_entries') IS NOT NULL THEN
    DELETE FROM journal_lines jl USING journal_entries je WHERE jl.entry_id = je.id AND je.company_id = p_company_id;
  END IF;

  FOREACH tbl IN ARRAY book_tables LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'company_id'
    ) THEN
      EXECUTE format('DELETE FROM %I WHERE company_id = $1', tbl) USING p_company_id;
    END IF;
  END LOOP;

  UPDATE companies
  SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{openingCapital}', '0'::jsonb, true),
      updated_at = NOW()
  WHERE id = p_company_id;

  IF p_close THEN
    IF to_regclass('public.subscription_payments') IS NOT NULL THEN
      DELETE FROM subscription_payments WHERE company_id = p_company_id;
    END IF;
    IF to_regclass('public.subscriptions') IS NOT NULL THEN
      DELETE FROM subscriptions WHERE company_id = p_company_id;
    END IF;
    DELETE FROM users WHERE company_id = p_company_id;
    DELETE FROM companies WHERE id = p_company_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION wipe_company_books(uuid, boolean) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION wipe_company_books(uuid, boolean) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION wipe_company_books(uuid, boolean) FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION wipe_company_books(uuid, boolean) TO service_role';
  END IF;
END $$;
