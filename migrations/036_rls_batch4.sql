BEGIN;

-- ===== receivables =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receivables TO authenticated;
ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS receivables_read_own ON public.receivables;
CREATE POLICY receivables_read_own ON public.receivables
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS receivables_insert_own ON public.receivables;
CREATE POLICY receivables_insert_own ON public.receivables
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS receivables_update_own ON public.receivables;
CREATE POLICY receivables_update_own ON public.receivables
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS receivables_delete_own ON public.receivables;
CREATE POLICY receivables_delete_own ON public.receivables
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

-- ===== payables =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payables TO authenticated;
ALTER TABLE public.payables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payables_read_own ON public.payables;
CREATE POLICY payables_read_own ON public.payables
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS payables_insert_own ON public.payables;
CREATE POLICY payables_insert_own ON public.payables
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS payables_update_own ON public.payables;
CREATE POLICY payables_update_own ON public.payables
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS payables_delete_own ON public.payables;
CREATE POLICY payables_delete_own ON public.payables
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

-- ===== chart_of_accounts =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_of_accounts TO authenticated;
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chart_of_accounts_read_own ON public.chart_of_accounts;
CREATE POLICY chart_of_accounts_read_own ON public.chart_of_accounts
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS chart_of_accounts_insert_own ON public.chart_of_accounts;
CREATE POLICY chart_of_accounts_insert_own ON public.chart_of_accounts
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS chart_of_accounts_update_own ON public.chart_of_accounts;
CREATE POLICY chart_of_accounts_update_own ON public.chart_of_accounts
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS chart_of_accounts_delete_own ON public.chart_of_accounts;
CREATE POLICY chart_of_accounts_delete_own ON public.chart_of_accounts
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

-- ===== journal_entries =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journal_entries_read_own ON public.journal_entries;
CREATE POLICY journal_entries_read_own ON public.journal_entries
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS journal_entries_insert_own ON public.journal_entries;
CREATE POLICY journal_entries_insert_own ON public.journal_entries
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS journal_entries_update_own ON public.journal_entries;
CREATE POLICY journal_entries_update_own ON public.journal_entries
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS journal_entries_delete_own ON public.journal_entries;
CREATE POLICY journal_entries_delete_own ON public.journal_entries
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

-- ===== journal_lines =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_lines TO authenticated;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journal_lines_read_own ON public.journal_lines;
CREATE POLICY journal_lines_read_own ON public.journal_lines
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS journal_lines_insert_own ON public.journal_lines;
CREATE POLICY journal_lines_insert_own ON public.journal_lines
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS journal_lines_update_own ON public.journal_lines;
CREATE POLICY journal_lines_update_own ON public.journal_lines
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS journal_lines_delete_own ON public.journal_lines;
CREATE POLICY journal_lines_delete_own ON public.journal_lines
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

-- ===== audit_logs =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO authenticated;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_read_own ON public.audit_logs;
CREATE POLICY audit_logs_read_own ON public.audit_logs
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS audit_logs_insert_own ON public.audit_logs;
CREATE POLICY audit_logs_insert_own ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS audit_logs_update_own ON public.audit_logs;
CREATE POLICY audit_logs_update_own ON public.audit_logs
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS audit_logs_delete_own ON public.audit_logs;
CREATE POLICY audit_logs_delete_own ON public.audit_logs
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

-- ===== subscriptions =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriptions_read_own ON public.subscriptions;
CREATE POLICY subscriptions_read_own ON public.subscriptions
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS subscriptions_insert_own ON public.subscriptions;
CREATE POLICY subscriptions_insert_own ON public.subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS subscriptions_update_own ON public.subscriptions;
CREATE POLICY subscriptions_update_own ON public.subscriptions
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS subscriptions_delete_own ON public.subscriptions;
CREATE POLICY subscriptions_delete_own ON public.subscriptions
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

COMMIT;