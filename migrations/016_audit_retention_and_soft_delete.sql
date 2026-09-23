-- Durable organization-scoped audit events and delayed record deletion.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS module text;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'SUCCESS';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS retention_until timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '30 days');

UPDATE audit_logs
SET company_id = COALESCE(company_id, (SELECT company_id FROM users WHERE users.id = audit_logs.user_id))
WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_event_time
  ON audit_logs(company_id, event_time DESC);

CREATE OR REPLACE FUNCTION record_row_change_as_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_company_id uuid;
  changed_reference text;
BEGIN
  changed_company_id := COALESCE((to_jsonb(NEW)->>'company_id')::uuid, (to_jsonb(OLD)->>'company_id')::uuid);
  changed_reference := COALESCE(to_jsonb(NEW)->>'reference', to_jsonb(OLD)->>'reference', to_jsonb(NEW)->>'id', to_jsonb(OLD)->>'id');

  IF changed_company_id IS NOT NULL THEN
    INSERT INTO audit_logs (company_id, action, entity, module, event_type, reference, details, status, metadata)
    VALUES (
      changed_company_id,
      TG_OP,
      UPPER(TG_TABLE_NAME),
      UPPER(TG_TABLE_NAME),
      TG_OP,
      changed_reference,
      format('%s %s record %s', TG_OP, TG_TABLE_NAME, COALESCE(changed_reference, 'unknown')),
      'SUCCESS',
      jsonb_build_object('source', 'database_trigger', 'old', to_jsonb(OLD), 'new', to_jsonb(NEW))
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'sales', 'purchases', 'expenses', 'products', 'bank_transactions',
    'receivables', 'payables', 'loans', 'prepayments', 'contacts',
    'bank_accounts', 'journal_entries', 'stock_counts', 'inventory_movements',
    'users', 'expense_categories', 'sale_items', 'purchase_items', 'staff_payments', 'subscriptions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'audit_' || table_name || '_row_change', table_name);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION record_row_change_as_audit()', 'audit_' || table_name || '_row_change', table_name);
  END LOOP;
END $$;

-- Operational records are retained after a user requests deletion. A scheduled
-- call to purge_expired_soft_deleted_records can remove them after 30 days.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'sales', 'purchases', 'expenses', 'products', 'bank_transactions',
    'receivables', 'payables', 'loans', 'prepayments', 'contacts',
    'bank_accounts', 'journal_entries', 'stock_counts', 'inventory_movements'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_at timestamptz', table_name);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS purge_after timestamptz', table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(purge_after) WHERE purge_after IS NOT NULL', 'idx_' || table_name || '_purge_after', table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION purge_expired_soft_deleted_records()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM inventory_movements WHERE purge_after IS NOT NULL AND purge_after <= NOW();
  DELETE FROM stock_counts WHERE purge_after IS NOT NULL AND purge_after <= NOW();
  DELETE FROM bank_transactions WHERE purge_after IS NOT NULL AND purge_after <= NOW();
  DELETE FROM journal_entries WHERE purge_after IS NOT NULL AND purge_after <= NOW();
  DELETE FROM prepayments WHERE purge_after IS NOT NULL AND purge_after <= NOW();
  DELETE FROM receivables WHERE purge_after IS NOT NULL AND purge_after <= NOW();
  DELETE FROM payables WHERE purge_after IS NOT NULL AND purge_after <= NOW();
  DELETE FROM loans WHERE purge_after IS NOT NULL AND purge_after <= NOW();
  DELETE FROM expenses WHERE purge_after IS NOT NULL AND purge_after <= NOW();
  DELETE FROM purchases WHERE purge_after IS NOT NULL AND purge_after <= NOW();
  DELETE FROM sales WHERE purge_after IS NOT NULL AND purge_after <= NOW();
  DELETE FROM products WHERE purge_after IS NOT NULL AND purge_after <= NOW();
  DELETE FROM contacts WHERE purge_after IS NOT NULL AND purge_after <= NOW();
  DELETE FROM bank_accounts WHERE purge_after IS NOT NULL AND purge_after <= NOW();
END;
$$;