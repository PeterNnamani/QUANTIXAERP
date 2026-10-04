BEGIN;

-- ===== purchases =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchases_read_own ON public.purchases;
CREATE POLICY purchases_read_own ON public.purchases
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS purchases_insert_own ON public.purchases;
CREATE POLICY purchases_insert_own ON public.purchases
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS purchases_update_own ON public.purchases;
CREATE POLICY purchases_update_own ON public.purchases
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS purchases_delete_own ON public.purchases;
CREATE POLICY purchases_delete_own ON public.purchases
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

-- ===== purchase_items =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_items TO authenticated;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_items_read_own ON public.purchase_items;
CREATE POLICY purchase_items_read_own ON public.purchase_items
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS purchase_items_insert_own ON public.purchase_items;
CREATE POLICY purchase_items_insert_own ON public.purchase_items
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS purchase_items_update_own ON public.purchase_items;
CREATE POLICY purchase_items_update_own ON public.purchase_items
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS purchase_items_delete_own ON public.purchase_items;
CREATE POLICY purchase_items_delete_own ON public.purchase_items
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

-- ===== expenses =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expenses_read_own ON public.expenses;
CREATE POLICY expenses_read_own ON public.expenses
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS expenses_insert_own ON public.expenses;
CREATE POLICY expenses_insert_own ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS expenses_update_own ON public.expenses;
CREATE POLICY expenses_update_own ON public.expenses
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS expenses_delete_own ON public.expenses;
CREATE POLICY expenses_delete_own ON public.expenses
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

-- ===== expense_categories =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expense_categories_read_own ON public.expense_categories;
CREATE POLICY expense_categories_read_own ON public.expense_categories
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS expense_categories_insert_own ON public.expense_categories;
CREATE POLICY expense_categories_insert_own ON public.expense_categories
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS expense_categories_update_own ON public.expense_categories;
CREATE POLICY expense_categories_update_own ON public.expense_categories
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS expense_categories_delete_own ON public.expense_categories;
CREATE POLICY expense_categories_delete_own ON public.expense_categories
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

-- ===== products =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_read_own ON public.products;
CREATE POLICY products_read_own ON public.products
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS products_insert_own ON public.products;
CREATE POLICY products_insert_own ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS products_update_own ON public.products;
CREATE POLICY products_update_own ON public.products
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS products_delete_own ON public.products;
CREATE POLICY products_delete_own ON public.products
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

COMMIT;