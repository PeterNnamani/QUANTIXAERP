-- Ensure loans created by the application are tenant-scoped on older installations.
ALTER TABLE loans ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_loans_company_id ON loans(company_id);
ALTER TABLE loans ADD COLUMN IF NOT EXISTS reference text;
UPDATE loans SET reference = COALESCE(reference, id::text) WHERE reference IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_loans_company_reference ON loans(company_id, reference);