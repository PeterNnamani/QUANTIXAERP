-- Cost of sales: lock the unit cost of each product at the moment it is sold.
-- sale_items are rewritten whenever a sale is saved again, so costs are keyed by (sale_id, product_key)
-- and never overwritten; later cost changes do not alter the cost of goods already sold.
CREATE TABLE IF NOT EXISTS sale_item_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_key text NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  sku text,
  unit_cost numeric(18,4) NOT NULL CHECK (unit_cost >= 0),
  cost_basis text NOT NULL DEFAULT 'average_cost' CHECK (cost_basis IN ('average_cost', 'unit_cost')),
  captured_via text NOT NULL DEFAULT 'sale' CHECK (captured_via IN ('sale', 'backfill', 'report')),
  captured_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (sale_id, product_key)
);

CREATE INDEX IF NOT EXISTS idx_sale_item_costs_company_id ON sale_item_costs(company_id);
CREATE INDEX IF NOT EXISTS idx_sale_item_costs_sale_id ON sale_item_costs(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_company_sale ON sale_items(company_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_company_sale_date ON sales(company_id, sale_date);

CREATE OR REPLACE FUNCTION capture_sale_item_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_key text;
  v_product products%ROWTYPE;
  v_cost numeric(18,4);
BEGIN
  v_key := lower(trim(COALESCE(NEW.product_name, '')));
  IF v_key = '' THEN RETURN NEW; END IF;
  v_company_id := COALESCE(NEW.company_id, (SELECT company_id FROM sales WHERE id = NEW.sale_id));
  IF v_company_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.product_id IS NOT NULL THEN
    SELECT * INTO v_product FROM products WHERE id = NEW.product_id;
  END IF;
  IF v_product.id IS NULL THEN
    SELECT * INTO v_product FROM products
    WHERE company_id = v_company_id AND lower(trim(name)) = v_key
    ORDER BY (deleted_at IS NULL) DESC, updated_at DESC
    LIMIT 1;
  END IF;
  IF v_product.id IS NULL THEN RETURN NEW; END IF;

  v_cost := CASE WHEN COALESCE(v_product.average_cost, 0) > 0 THEN v_product.average_cost ELSE COALESCE(v_product.unit_cost, 0) END;
  -- A zero cost is not locked so that a cost entered later can still apply to this sale.
  IF v_cost <= 0 THEN RETURN NEW; END IF;

  INSERT INTO sale_item_costs (company_id, sale_id, product_key, product_id, sku, unit_cost, cost_basis, captured_via)
  VALUES (
    v_company_id, NEW.sale_id, v_key, v_product.id, v_product.sku, v_cost,
    CASE WHEN COALESCE(v_product.average_cost, 0) > 0 THEN 'average_cost' ELSE 'unit_cost' END,
    'sale'
  )
  ON CONFLICT (sale_id, product_key) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Recording a sale must never fail because of cost tracking.
  RAISE WARNING 'capture_sale_item_cost skipped for sale %: %', NEW.sale_id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sale_items_capture_cost ON sale_items;
CREATE TRIGGER sale_items_capture_cost
AFTER INSERT ON sale_items
FOR EACH ROW EXECUTE FUNCTION capture_sale_item_cost();

-- Existing sales have no recorded cost; use the cost on record now and mark it as an estimate.
INSERT INTO sale_item_costs (company_id, sale_id, product_key, product_id, sku, unit_cost, cost_basis, captured_via)
SELECT DISTINCT ON (si.sale_id, lower(trim(si.product_name)))
  COALESCE(si.company_id, s.company_id),
  si.sale_id,
  lower(trim(si.product_name)),
  p.id,
  p.sku,
  CASE WHEN COALESCE(p.average_cost, 0) > 0 THEN p.average_cost ELSE p.unit_cost END,
  CASE WHEN COALESCE(p.average_cost, 0) > 0 THEN 'average_cost' ELSE 'unit_cost' END,
  'backfill'
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
JOIN products p ON p.company_id = COALESCE(si.company_id, s.company_id) AND lower(trim(p.name)) = lower(trim(si.product_name))
WHERE COALESCE(si.company_id, s.company_id) IS NOT NULL
  AND trim(COALESCE(si.product_name, '')) <> ''
  AND (CASE WHEN COALESCE(p.average_cost, 0) > 0 THEN p.average_cost ELSE p.unit_cost END) > 0
ORDER BY si.sale_id, lower(trim(si.product_name)), (p.deleted_at IS NULL) DESC, p.updated_at DESC
ON CONFLICT (sale_id, product_key) DO NOTHING;
