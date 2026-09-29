-- Allow fractional quantities (kg, litres, metres) in inventory and transaction lines.
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('products', 'stock_qty'),
      ('products', 'damaged_expired'),
      ('products', 'reorder_level'),
      ('products', 'reserved_qty'),
      ('products', 'reorder_quantity'),
      ('products', 'maximum_stock_level'),
      ('sale_items', 'qty'),
      ('purchase_items', 'qty'),
      ('inventory_movements', 'quantity'),
      ('stock_counts', 'book_stock'),
      ('stock_counts', 'physical_stock'),
      ('stock_counts', 'variance')
    ) AS columns_to_widen(table_name, column_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = target.table_name AND column_name = target.column_name AND data_type = 'integer'
    ) THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE numeric(18,3)', target.table_name, target.column_name);
    END IF;
  END LOOP;
END $$;
