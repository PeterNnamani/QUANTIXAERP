-- Initial Supabase/PostgreSQL schema for H&amp;W Solutions Accounting
-- Create all core tables and indexes needed for the accounting app.

-- Company tenancy. Every business record is owned by exactly one company.
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- Users and roles
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL,
  role_title text,
  access_levels jsonb,
  phone text,
  staff_id text,
  username text,
  pin text,
  user_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  branch text,
  department text,
  position text,
  employee_id text,
  salary text,
  employment_date text,
  last_login timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_company_email_key ON users(company_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS users_company_staff_id_key ON users(company_id, staff_id) WHERE staff_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_company_username_key ON users(company_id, username) WHERE username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Accounting ledger core
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE')),
  account_subtype text,
  normal_balance text NOT NULL CHECK (normal_balance IN ('DEBIT','CREDIT')),
  parent_id uuid REFERENCES chart_of_accounts(id),
  is_control_account boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  currency text NOT NULL DEFAULT 'NGN',
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  opening_balance_date date,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year integer NOT NULL,
  period_number integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL,
  period_id uuid REFERENCES accounting_periods(id),
  reference text,
  description text,
  source_module text NOT NULL,
  source_id text,
  reversal_of_entry_id uuid REFERENCES journal_entries(id),
  status text NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT','POSTED','REVERSED')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  debit numeric(18,2) NOT NULL DEFAULT 0,
  credit numeric(18,2) NOT NULL DEFAULT 0,
  description text,
  cost_center text,
  segment text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK (NOT (debit > 0 AND credit > 0))
);

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_type ON chart_of_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_id ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_id ON journal_lines(account_id);

CREATE OR REPLACE FUNCTION balance_sheet_as_of(as_of_date date)
RETURNS TABLE (
  account_id uuid,
  code text,
  name text,
  account_type text,
  account_subtype text,
  balance numeric(18,2)
) AS $$
SELECT coa.id,
       coa.code,
       coa.name,
       coa.account_type,
       coa.account_subtype,
       CASE WHEN coa.normal_balance = 'DEBIT'
            THEN COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)
            ELSE COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0)
       END AS balance
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.entry_id
JOIN chart_of_accounts coa ON coa.id = jl.account_id
WHERE je.entry_date <= as_of_date
  AND je.status = 'POSTED'
  AND coa.account_type IN ('ASSET','LIABILITY','EQUITY')
GROUP BY coa.id, coa.code, coa.name, coa.account_type, coa.account_subtype;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE VIEW balance_sheet_posted_accounts AS
SELECT coa.id AS account_id,
       coa.code,
       coa.name,
       coa.account_type,
       coa.account_subtype,
       CASE WHEN coa.normal_balance = 'DEBIT'
            THEN COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)
            ELSE COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0)
       END AS balance
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.entry_id
JOIN chart_of_accounts coa ON coa.id = jl.account_id
WHERE je.status = 'POSTED'
  AND coa.account_type IN ('ASSET','LIABILITY','EQUITY')
GROUP BY coa.id, coa.code, coa.name, coa.account_type, coa.account_subtype;

-- Bank accounts
CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  institution text NOT NULL,
  account_number text,
  account_type text NOT NULL DEFAULT 'Current',
  currency text NOT NULL DEFAULT 'NGN',
  branch text,
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  opening_balance_date date,
  balance numeric(18,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_institution ON bank_accounts(institution);

-- Prepayments and recognition schedules
CREATE TABLE IF NOT EXISTS prepayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  prepayment_type text NOT NULL DEFAULT 'Prepayment',
  supplier text,
  original_amount numeric(18,2) NOT NULL DEFAULT 0,
  used_amount numeric(18,2) NOT NULL DEFAULT 0,
  remaining_amount numeric(18,2) NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  payment_method text,
  bank_account text,
  reference_no text,
  recorded_by text,
  recognition_status text NOT NULL DEFAULT 'Not Started',
  recognition_progress numeric(5,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prepayments_supplier ON prepayments(supplier);
CREATE INDEX IF NOT EXISTS idx_prepayments_status ON prepayments(status);

CREATE TABLE IF NOT EXISTS prepayment_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prepayment_id uuid NOT NULL REFERENCES prepayments(id) ON DELETE CASCADE,
  period text NOT NULL,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  recognized boolean NOT NULL DEFAULT false,
  recognition_date date,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prepayment_schedules_prepayment_id ON prepayment_schedules(prepayment_id);

-- Customers / suppliers / vendors
CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('customer', 'supplier', 'vendor')),
  name text NOT NULL,
  email text,
  phone text,
  address text,
  credit_limit numeric(18,2) NOT NULL DEFAULT 0,
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  is_related_party boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(type);

-- Products and inventory
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text,
  unit_cost numeric(18,2) NOT NULL DEFAULT 0,
  unit_price numeric(18,2) NOT NULL DEFAULT 0,
  stock_qty integer NOT NULL DEFAULT 0,
  expiry_date date,
  damaged_expired integer NOT NULL DEFAULT 0,
  reorder_level integer NOT NULL DEFAULT 0,
  branch text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date date;
ALTER TABLE products ADD COLUMN IF NOT EXISTS damaged_expired integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS branch text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_category text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS uom text NOT NULL DEFAULT 'Unit';
ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_size text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS base_unit text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS conversion_factor numeric(18,6) NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reserved_qty integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS average_cost numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_quantity integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS maximum_stock_level integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS batch_number text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturing_date date;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_purchase_date date;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_sale_date date;
ALTER TABLE products ADD COLUMN IF NOT EXISTS remarks text;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'warehouse') THEN
    UPDATE products SET branch = COALESCE(branch, warehouse);
    ALTER TABLE products DROP COLUMN warehouse;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- Sales and sale items
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  sale_date date NOT NULL,
  customer_id uuid NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  branch text,
  sales_rep text,
  payment_method text NOT NULL,
  payment_status text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  notes text,
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  tax numeric(18,2) NOT NULL DEFAULT 0,
  discount numeric(18,2) NOT NULL DEFAULT 0,
  shipping numeric(18,2) NOT NULL DEFAULT 0,
  total_amount numeric(18,2) NOT NULL DEFAULT 0,
  amount_paid numeric(18,2) NOT NULL DEFAULT 0,
  balance numeric(18,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);

CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  department text,
  qty integer NOT NULL DEFAULT 0,
  unit_price numeric(18,2) NOT NULL DEFAULT 0,
  discount numeric(18,2) NOT NULL DEFAULT 0,
  tax numeric(18,2) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);

-- Purchases and purchase items
CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  purchase_date date NOT NULL,
  supplier_id uuid NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  branch text,
  invoice_number text,
  purchase_order text,
  payment_method text NOT NULL,
  payment_status text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  notes text,
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  tax numeric(18,2) NOT NULL DEFAULT 0,
  discount numeric(18,2) NOT NULL DEFAULT 0,
  shipping numeric(18,2) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL DEFAULT 0,
  amount_paid numeric(18,2) NOT NULL DEFAULT 0,
  balance numeric(18,2) NOT NULL DEFAULT 0,
  due_date date,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_purchase_date ON purchases(purchase_date);

CREATE TABLE IF NOT EXISTS purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  department text,
  qty integer NOT NULL DEFAULT 0,
  unit_price numeric(18,2) NOT NULL DEFAULT 0,
  discount numeric(18,2) NOT NULL DEFAULT 0,
  tax numeric(18,2) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  expense_date date NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  amount numeric(18,2) NOT NULL,
  bank_account_id uuid REFERENCES bank_accounts(id),
  status text NOT NULL DEFAULT 'active',
  notes text,
  entered_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

CREATE TABLE IF NOT EXISTS expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_company_id ON expense_categories(company_id);

-- Inventory movements
CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  movement_date date NOT NULL,
  quantity integer NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('inbound', 'outbound', 'adjustment', 'transfer')),
  source text,
  destination text,
  reference text,
  unit_cost numeric(18,2) NOT NULL DEFAULT 0,
  total_cost numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_id ON inventory_movements(product_id);

ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS transaction_id text;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS reference_number text;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS from_location text;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS to_location text;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS supplier_customer text;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS staff text;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS batch_number text;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS expiry_date date;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS remarks text;

CREATE TABLE IF NOT EXISTS stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_date date NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  book_stock integer NOT NULL DEFAULT 0,
  physical_stock integer NOT NULL DEFAULT 0,
  variance integer NOT NULL DEFAULT 0,
  unit_cost numeric(18,2) NOT NULL DEFAULT 0,
  variance_value numeric(18,2) NOT NULL DEFAULT 0,
  reason text,
  verified_by text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_counts_product_id ON stock_counts(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_counts_date ON stock_counts(count_date);

-- Subledger tables for sales, receipts, and reconciliation
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  ar_account_id uuid REFERENCES chart_of_accounts(id),
  credit_limit numeric(18,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id),
  invoice_date date NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('DRAFT','UNPAID','PARTIALLY_PAID','PAID','VOID')),
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  tax_amount numeric(18,2) NOT NULL DEFAULT 0,
  total_amount numeric(18,2) NOT NULL DEFAULT 0,
  journal_entry_id uuid REFERENCES journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  quantity numeric(18,2) NOT NULL DEFAULT 0,
  unit_price numeric(18,2) NOT NULL DEFAULT 0,
  line_total numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id),
  bank_account_id uuid REFERENCES bank_accounts(id),
  receipt_date date NOT NULL,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  journal_entry_id uuid REFERENCES journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipt_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES sales_invoices(id) ON DELETE RESTRICT,
  amount_applied numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  txn_date date NOT NULL,
  description text,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  is_reconciled boolean NOT NULL DEFAULT false,
  matched_journal_line_id uuid REFERENCES journal_lines(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  statement_date date NOT NULL,
  statement_closing_balance numeric(18,2) NOT NULL DEFAULT 0,
  book_closing_balance numeric(18,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS','COMPLETED')),
  completed_by uuid REFERENCES users(id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- Receivables and payables
CREATE TABLE IF NOT EXISTS receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  reference text NOT NULL UNIQUE,
  due_date date NOT NULL,
  original_amount numeric(18,2) NOT NULL,
  outstanding_amount numeric(18,2) NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  reference text NOT NULL UNIQUE,
  due_date date NOT NULL,
  original_amount numeric(18,2) NOT NULL,
  outstanding_amount numeric(18,2) NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- Loans and financing
CREATE TABLE IF NOT EXISTS loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lender text NOT NULL,
  amount numeric(18,2) NOT NULL,
  interest_rate numeric(8,4) NOT NULL,
  term_months integer NOT NULL,
  start_date date NOT NULL,
  maturity_date date NOT NULL,
  payment_schedule text,
  balance numeric(18,2) NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loan_repayment_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  payment_date date NOT NULL,
  period_number integer NOT NULL,
  principal_amount numeric(18,2) NOT NULL DEFAULT 0,
  interest_amount numeric(18,2) NOT NULL DEFAULT 0,
  total_payment numeric(18,2) GENERATED ALWAYS AS (principal_amount + interest_amount) STORED,
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  closing_balance numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lessor text NOT NULL,
  lease_start date NOT NULL,
  lease_end date NOT NULL,
  lease_term_months integer NOT NULL,
  right_of_use_asset_account_id uuid REFERENCES chart_of_accounts(id),
  lease_liability_account_id uuid REFERENCES chart_of_accounts(id),
  initial_lease_liability numeric(18,2) NOT NULL DEFAULT 0,
  discount_rate numeric(8,4),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','TERMINATED','EXPIRED')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lease_payment_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id uuid NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  payment_date date NOT NULL,
  period_number integer NOT NULL,
  principal_amount numeric(18,2) NOT NULL DEFAULT 0,
  interest_amount numeric(18,2) NOT NULL DEFAULT 0,
  lease_liability_closing_balance numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_tag text UNIQUE,
  name text NOT NULL,
  category text,
  acquisition_date date NOT NULL,
  cost numeric(18,2) NOT NULL DEFAULT 0,
  residual_value numeric(18,2) NOT NULL DEFAULT 0,
  useful_life_years numeric(5,2),
  depreciation_method text NOT NULL DEFAULT 'STRAIGHT_LINE'
    CHECK (depreciation_method IN ('STRAIGHT_LINE','REDUCING_BALANCE','UNITS_OF_PRODUCTION')),
  depreciation_rate numeric(5,2),
  total_estimated_units numeric(18,2),
  asset_account_id uuid REFERENCES chart_of_accounts(id),
  accum_depreciation_account_id uuid REFERENCES chart_of_accounts(id),
  depreciation_expense_account_id uuid REFERENCES chart_of_accounts(id),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISPOSED','FULLY_DEPRECIATED')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS depreciation_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  period_id uuid REFERENCES accounting_periods(id),
  opening_nbv numeric(18,2) NOT NULL DEFAULT 0,
  depreciation_amount numeric(18,2) NOT NULL DEFAULT 0,
  closing_nbv numeric(18,2) NOT NULL DEFAULT 0,
  journal_entry_id uuid REFERENCES journal_entries(id),
  is_reversed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_value_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('REVALUATION','IMPAIRMENT','CORRECTION')),
  adjustment_date date NOT NULL,
  old_value numeric(18,2),
  new_value numeric(18,2),
  reason text,
  supporting_document_url text,
  approved_by uuid REFERENCES users(id),
  journal_entry_id uuid REFERENCES journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS provisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provision_type text NOT NULL,
  description text,
  recognition_date date NOT NULL,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  current_portion numeric(18,2) NOT NULL DEFAULT 0,
  long_term_portion numeric(18,2) NOT NULL DEFAULT 0,
  journal_entry_id uuid REFERENCES journal_entries(id),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','REMEASURED','RELEASED','CLOSED')),
  review_date date,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deferred_tax_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid REFERENCES fixed_assets(id),
  tax_basis numeric(18,2),
  carrying_amount numeric(18,2),
  temporary_difference numeric(18,2),
  deferred_tax_amount numeric(18,2),
  calculation_date date NOT NULL,
  journal_entry_id uuid REFERENCES journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approval_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  requested_by uuid REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_time timestamptz NOT NULL DEFAULT NOW(),
  user_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity text NOT NULL,
  reference text,
  details text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_time ON audit_logs(event_time);

-- Add tenancy to existing installations as well as fresh installs. Existing
-- rows are kept together in one legacy company and can be reassigned later.
DO $$
DECLARE
  legacy_company_id uuid;
  table_name text;
BEGIN
  INSERT INTO companies (name)
  SELECT 'Legacy company'
  WHERE NOT EXISTS (SELECT 1 FROM companies);

  SELECT id INTO legacy_company_id FROM companies ORDER BY created_at LIMIT 1;

  FOR table_name IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> 'companies'
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE', table_name);
    EXECUTE format('UPDATE %I SET company_id = $1 WHERE company_id IS NULL', table_name) USING legacy_company_id;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(company_id)', 'idx_' || table_name || '_company_id', table_name);
  END LOOP;
END $$;

-- Trigger helper for updated_at fields
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_accounting_period_open()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.period_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM accounting_periods WHERE id = NEW.period_id AND status = 'CLOSED'
  ) THEN
    RAISE EXCEPTION 'Cannot post journal entry into closed accounting period %', NEW.period_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_posted_journal_entry_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'POSTED' THEN
    RAISE EXCEPTION 'Cannot modify posted journal entry %', OLD.id;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'POSTED' THEN
    RAISE EXCEPTION 'Cannot delete posted journal entry %', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_posted_journal_line_modification()
RETURNS TRIGGER AS $$
DECLARE
  parent_status text;
  parent_entry_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    parent_entry_id := OLD.entry_id;
  ELSE
    parent_entry_id := NEW.entry_id;
  END IF;

  SELECT status INTO parent_status FROM journal_entries WHERE id = parent_entry_id;
  IF parent_status = 'POSTED' THEN
    RAISE EXCEPTION 'Cannot modify journal lines for posted entry %', parent_entry_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers with conditional logic (drop and recreate to avoid conflicts)
DO $$
BEGIN
  DROP TRIGGER IF EXISTS users_updated_at_executed ON users;
  CREATE TRIGGER users_updated_at_executed BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS chart_of_accounts_updated_at_executed ON chart_of_accounts;
  CREATE TRIGGER chart_of_accounts_updated_at_executed BEFORE UPDATE ON chart_of_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS accounting_periods_updated_at_executed ON accounting_periods;
  CREATE TRIGGER accounting_periods_updated_at_executed BEFORE UPDATE ON accounting_periods FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS journal_entries_updated_at_executed ON journal_entries;
  CREATE TRIGGER journal_entries_updated_at_executed BEFORE UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS journal_entries_period_open_executed ON journal_entries;
  CREATE TRIGGER journal_entries_period_open_executed BEFORE INSERT OR UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION enforce_accounting_period_open();

  DROP TRIGGER IF EXISTS journal_entries_immutable_executed ON journal_entries;
  CREATE TRIGGER journal_entries_immutable_executed BEFORE UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION prevent_posted_journal_entry_modification();

  DROP TRIGGER IF EXISTS journal_lines_immutable_executed ON journal_lines;
  CREATE TRIGGER journal_lines_immutable_executed BEFORE INSERT OR UPDATE OR DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION prevent_posted_journal_line_modification();

  DROP TRIGGER IF EXISTS bank_accounts_updated_at_executed ON bank_accounts;
  CREATE TRIGGER bank_accounts_updated_at_executed BEFORE UPDATE ON bank_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS customers_updated_at_executed ON customers;
  CREATE TRIGGER customers_updated_at_executed BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS sales_invoices_updated_at_executed ON sales_invoices;
  CREATE TRIGGER sales_invoices_updated_at_executed BEFORE UPDATE ON sales_invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS receipts_updated_at_executed ON receipts;
  CREATE TRIGGER receipts_updated_at_executed BEFORE UPDATE ON receipts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS bank_transactions_updated_at_executed ON bank_transactions;
  CREATE TRIGGER bank_transactions_updated_at_executed BEFORE UPDATE ON bank_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS bank_reconciliations_updated_at_executed ON bank_reconciliations;
  CREATE TRIGGER bank_reconciliations_updated_at_executed BEFORE UPDATE ON bank_reconciliations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS contacts_updated_at_executed ON contacts;
  CREATE TRIGGER contacts_updated_at_executed BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS products_updated_at_executed ON products;
  CREATE TRIGGER products_updated_at_executed BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS sales_updated_at_executed ON sales;
  CREATE TRIGGER sales_updated_at_executed BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS purchase_updated_at_executed ON purchases;
  CREATE TRIGGER purchase_updated_at_executed BEFORE UPDATE ON purchases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS expenses_updated_at_executed ON expenses;
  CREATE TRIGGER expenses_updated_at_executed BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS receivables_updated_at_executed ON receivables;
  CREATE TRIGGER receivables_updated_at_executed BEFORE UPDATE ON receivables FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS payables_updated_at_executed ON payables;
  CREATE TRIGGER payables_updated_at_executed BEFORE UPDATE ON payables FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS loans_updated_at_executed ON loans;
  CREATE TRIGGER loans_updated_at_executed BEFORE UPDATE ON loans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS audit_logs_updated_at_executed ON audit_logs;
  CREATE TRIGGER audit_logs_updated_at_executed BEFORE UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
END $$;
