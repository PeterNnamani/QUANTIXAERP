ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;


UPDATE sale_items AS item
SET company_id = sale.company_id
FROM sales AS sale
WHERE item.sale_id = sale.id
  AND item.company_id IS NULL;

UPDATE purchase_items AS item
SET company_id = purchase.company_id
FROM purchases AS purchase
WHERE item.purchase_id = purchase.id
  AND item.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sale_items_company_id ON sale_items(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_company_id ON purchase_items(company_id);