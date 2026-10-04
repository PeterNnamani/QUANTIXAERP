BEGIN;

-- ===== contacts =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contacts_read_own ON public.contacts;
CREATE POLICY contacts_read_own ON public.contacts
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS contacts_insert_own ON public.contacts;
CREATE POLICY contacts_insert_own ON public.contacts
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS contacts_update_own ON public.contacts;
CREATE POLICY contacts_update_own ON public.contacts
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS contacts_delete_own ON public.contacts;
CREATE POLICY contacts_delete_own ON public.contacts
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

-- ===== bank_accounts =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_accounts_read_own ON public.bank_accounts;
CREATE POLICY bank_accounts_read_own ON public.bank_accounts
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS bank_accounts_insert_own ON public.bank_accounts;
CREATE POLICY bank_accounts_insert_own ON public.bank_accounts
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS bank_accounts_update_own ON public.bank_accounts;
CREATE POLICY bank_accounts_update_own ON public.bank_accounts
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS bank_accounts_delete_own ON public.bank_accounts;
CREATE POLICY bank_accounts_delete_own ON public.bank_accounts
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

-- ===== bank_transactions =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_transactions_read_own ON public.bank_transactions;
CREATE POLICY bank_transactions_read_own ON public.bank_transactions
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS bank_transactions_insert_own ON public.bank_transactions;
CREATE POLICY bank_transactions_insert_own ON public.bank_transactions
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS bank_transactions_update_own ON public.bank_transactions;
CREATE POLICY bank_transactions_update_own ON public.bank_transactions
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS bank_transactions_delete_own ON public.bank_transactions;
CREATE POLICY bank_transactions_delete_own ON public.bank_transactions
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

-- ===== prepayments =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prepayments TO authenticated;
ALTER TABLE public.prepayments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prepayments_read_own ON public.prepayments;
CREATE POLICY prepayments_read_own ON public.prepayments
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS prepayments_insert_own ON public.prepayments;
CREATE POLICY prepayments_insert_own ON public.prepayments
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS prepayments_update_own ON public.prepayments;
CREATE POLICY prepayments_update_own ON public.prepayments
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS prepayments_delete_own ON public.prepayments;
CREATE POLICY prepayments_delete_own ON public.prepayments
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

-- ===== prepayment_schedules =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prepayment_schedules TO authenticated;
ALTER TABLE public.prepayment_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prepayment_schedules_read_own ON public.prepayment_schedules;
CREATE POLICY prepayment_schedules_read_own ON public.prepayment_schedules
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS prepayment_schedules_insert_own ON public.prepayment_schedules;
CREATE POLICY prepayment_schedules_insert_own ON public.prepayment_schedules
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS prepayment_schedules_update_own ON public.prepayment_schedules;
CREATE POLICY prepayment_schedules_update_own ON public.prepayment_schedules
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS prepayment_schedules_delete_own ON public.prepayment_schedules;
CREATE POLICY prepayment_schedules_delete_own ON public.prepayment_schedules
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

-- ===== loans =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loans TO authenticated;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loans_read_own ON public.loans;
CREATE POLICY loans_read_own ON public.loans
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS loans_insert_own ON public.loans;
CREATE POLICY loans_insert_own ON public.loans
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS loans_update_own ON public.loans;
CREATE POLICY loans_update_own ON public.loans
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS loans_delete_own ON public.loans;
CREATE POLICY loans_delete_own ON public.loans
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

-- ===== loan_repayments =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_repayments TO authenticated;
ALTER TABLE public.loan_repayments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loan_repayments_read_own ON public.loan_repayments;
CREATE POLICY loan_repayments_read_own ON public.loan_repayments
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS loan_repayments_insert_own ON public.loan_repayments;
CREATE POLICY loan_repayments_insert_own ON public.loan_repayments
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS loan_repayments_update_own ON public.loan_repayments;
CREATE POLICY loan_repayments_update_own ON public.loan_repayments
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS loan_repayments_delete_own ON public.loan_repayments;
CREATE POLICY loan_repayments_delete_own ON public.loan_repayments
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

COMMIT;