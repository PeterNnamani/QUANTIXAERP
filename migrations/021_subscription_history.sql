ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_company_id_key;

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check CHECK (status IN ('trial', 'active', 'expired', 'cancelled', 'superseded'));

CREATE INDEX IF NOT EXISTS idx_subscriptions_current_company
  ON subscriptions(company_id, status, created_at DESC);