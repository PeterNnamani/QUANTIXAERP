-- Apply after 029. Back up the database first. All schema changes are atomic.
BEGIN;
ALTER TABLE products ALTER COLUMN stock_qty TYPE numeric(18,6) USING stock_qty::numeric;
ALTER TABLE products ALTER COLUMN damaged_expired TYPE numeric(18,6) USING damaged_expired::numeric;
ALTER TABLE products ALTER COLUMN reorder_level TYPE numeric(18,6) USING reorder_level::numeric;
ALTER TABLE products ALTER COLUMN reorder_quantity TYPE numeric(18,6) USING reorder_quantity::numeric;
ALTER TABLE products ALTER COLUMN reserved_qty TYPE numeric(18,6) USING reserved_qty::numeric;
ALTER TABLE products ALTER COLUMN maximum_stock_level TYPE numeric(18,6) USING maximum_stock_level::numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS opening_qty numeric(18,6);
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchased_qty numeric(18,6) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sold_qty numeric(18,6) NOT NULL DEFAULT 0;
UPDATE products SET opening_qty = stock_qty WHERE opening_qty IS NULL;
ALTER TABLE products ALTER COLUMN opening_qty SET DEFAULT 0;
ALTER TABLE products ALTER COLUMN opening_qty SET NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_count_qty numeric(18,6);
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_count_variance numeric(18,6);
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_count_at timestamptz;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_count_reason text;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key;
CREATE UNIQUE INDEX IF NOT EXISTS products_company_sku_key ON products(company_id, sku);
ALTER TABLE chart_of_accounts DROP CONSTRAINT IF EXISTS chart_of_accounts_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_company_code_key ON chart_of_accounts(company_id, code);
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS opening_balance numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS opening_balance_date date;

-- Uses the caller's existing database permissions; does not bypass RLS.
-- Location changes move the WHOLE product balance, not partial stock between warehouses.
CREATE OR REPLACE FUNCTION apply_inventory_action(
  p_company_id uuid, p_sku text, p_action text, p_quantity numeric,
  p_reason text, p_location text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE item products%ROWTYPE; previous_quantity numeric; event_id uuid;
BEGIN
  IF NULLIF(trim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT * INTO item FROM products WHERE company_id = p_company_id AND sku = p_sku AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found in this company'; END IF;
  previous_quantity := item.stock_qty;
  IF p_action = 'relocate' THEN
    IF NULLIF(trim(p_location), '') IS NULL THEN RAISE EXCEPTION 'A destination is required'; END IF;
    UPDATE products SET branch = trim(p_location) WHERE id = item.id RETURNING * INTO item;
  ELSIF p_action IN ('receive', 'increase', 'decrease', 'count') THEN
    IF p_quantity IS NULL OR p_quantity::text IN ('NaN','Infinity','-Infinity') OR p_quantity < 0 OR (p_quantity = 0 AND p_action <> 'count') THEN RAISE EXCEPTION 'Enter a valid quantity'; END IF;
    IF p_action = 'decrease' AND p_quantity > item.stock_qty THEN RAISE EXCEPTION 'Quantity exceeds available stock'; END IF;
    UPDATE products SET
      stock_qty = CASE WHEN p_action = 'count' THEN p_quantity WHEN p_action = 'decrease' THEN stock_qty - p_quantity ELSE stock_qty + p_quantity END,
      purchased_qty = purchased_qty + CASE WHEN p_action = 'receive' THEN p_quantity ELSE 0 END,
      last_count_qty = CASE WHEN p_action = 'count' THEN p_quantity ELSE last_count_qty END,
      last_count_variance = CASE WHEN p_action = 'count' THEN p_quantity - previous_quantity ELSE last_count_variance END,
      last_count_at = CASE WHEN p_action = 'count' THEN NOW() ELSE last_count_at END,
      last_count_reason = CASE WHEN p_action = 'count' THEN trim(p_reason) ELSE last_count_reason END
    WHERE id = item.id RETURNING * INTO item;
  ELSE RAISE EXCEPTION 'Unknown inventory action'; END IF;
  INSERT INTO audit_logs(company_id, action, entity, reference, details, metadata)
    VALUES(p_company_id, upper(p_action), 'INVENTORY', p_sku, trim(p_reason),
      jsonb_build_object('previous_quantity',previous_quantity,'quantity',item.stock_qty,'location',item.branch)) RETURNING id INTO event_id;
  RETURN to_jsonb(item) || jsonb_build_object('audit_id', event_id, 'previous_quantity', previous_quantity);
END;
$$;
COMMIT;
