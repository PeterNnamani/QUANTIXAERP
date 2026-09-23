CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('trial', 'active', 'expired', 'cancelled')),
  amount numeric(18,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  starts_at timestamptz NOT NULL DEFAULT NOW(),
  expires_at timestamptz,
  paystack_reference text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (company_id)
);

CREATE TABLE IF NOT EXISTS subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  plan_name text NOT NULL,
  amount numeric(18,2) NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  paystack_reference text NOT NULL UNIQUE,
  paystack_transaction_id text,
  status text NOT NULL DEFAULT 'success',
  paid_at timestamptz,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_company_id ON subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_company_id ON subscription_payments(company_id);