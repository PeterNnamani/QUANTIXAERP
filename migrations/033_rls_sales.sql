BEGIN;

-- sales
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_read_own ON public.sales;
CREATE POLICY sales_read_own ON public.sales
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS sales_insert_own ON public.sales;
CREATE POLICY sales_insert_own ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS sales_update_own ON public.sales;
CREATE POLICY sales_update_own ON public.sales
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS sales_delete_own ON public.sales;
CREATE POLICY sales_delete_own ON public.sales
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

-- sale_items
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sale_items_read_own ON public.sale_items;
CREATE POLICY sale_items_read_own ON public.sale_items
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS sale_items_insert_own ON public.sale_items;
CREATE POLICY sale_items_insert_own ON public.sale_items
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS sale_items_update_own ON public.sale_items;
CREATE POLICY sale_items_update_own ON public.sale_items
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS sale_items_delete_own ON public.sale_items;
CREATE POLICY sale_items_delete_own ON public.sale_items
  FOR DELETE TO authenticated
  USING (company_id = public.current_company_id());

COMMIT;