ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check CHECK (status IN ('trial', 'active', 'expired', 'cancelled'));

ALTER TABLE subscriptions ALTER COLUMN amount SET DEFAULT 0;