BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS pin_hash text;

COMMENT ON COLUMN public.users.pin      IS 'DEPRECATED: plaintext PIN. To be dropped after migration to pin_hash.';
COMMENT ON COLUMN public.users.pin_hash IS 'bcrypt hash of the staff PIN. Never store the plaintext here.';

COMMIT;