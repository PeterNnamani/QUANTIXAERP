-- Keep contacts created from older schema versions compatible with current imports.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS is_related_party boolean NOT NULL DEFAULT false;
