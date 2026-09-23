-- Scope receivables and payables to the owning company so remote dashboard loads are reliable.
ALTER TABLE receivables
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE payables
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

UPDATE receivables r
SET company_id = c.company_id
FROM contacts c
WHERE r.contact_id = c.id
  AND r.company_id IS NULL;

UPDATE payables p
SET company_id = c.company_id
FROM contacts c
WHERE p.contact_id = c.id
  AND p.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_receivables_company_created
  ON receivables(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payables_company_created
  ON payables(company_id, created_at DESC);
