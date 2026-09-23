-- Keep inventory loading and persistence compatible with older installations.
ALTER TABLE products ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT NOW();
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE products ADD COLUMN IF NOT EXISTS purge_after timestamptz;

DO $$
DECLARE
  legacy_company_id uuid;
BEGIN
  SELECT id INTO legacy_company_id FROM companies ORDER BY created_at LIMIT 1;
  IF legacy_company_id IS NOT NULL THEN
    UPDATE products SET company_id = legacy_company_id WHERE company_id IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_company_id ON products(company_id);
CREATE INDEX IF NOT EXISTS idx_products_purge_after ON products(purge_after) WHERE purge_after IS NOT NULL;