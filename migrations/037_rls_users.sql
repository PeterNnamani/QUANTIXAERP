BEGIN;

GRANT SELECT ON public.users TO authenticated;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_read_same_company ON public.users;
CREATE POLICY users_read_same_company ON public.users
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

-- Users should be able to update their own row (settings, last_login, etc.)
-- but not other users' rows.
DROP POLICY IF EXISTS users_update_self ON public.users;
CREATE POLICY users_update_self ON public.users
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

COMMIT;