export function isSuperAdminRole(role: unknown): boolean {
  const normalized = String(role || '').toLowerCase().replace(/[_\s]+/g, '-')
  return normalized === 'super-admin' || normalized === 'md' || normalized === 'business-owner'
}

type CompanyIdentity = {
  companyName?: string
  registrationNumber?: string
  tin?: string
  country?: string
  currency?: string
  timezone?: string
  decimalPlaces?: number
  dateFormat?: string
  taxInclusive?: boolean
  defaultBranch?: string
  notifications?: unknown
  security?: unknown
  integrations?: unknown
  ai?: unknown
  roles?: unknown
  openingCapital?: number
}

type CompanyBooks = {
  companySettings: CompanyIdentity
  sales: unknown[]
  purchases: unknown[]
  expenses: unknown[]
  expenseCategories: unknown[]
  inventory: unknown[]
  banks: Record<string, number>
  bankAccounts: unknown[]
  bankTxns: unknown[]
  receivables: unknown[]
  payables: unknown[]
  prepayments: unknown[]
  loans: unknown[]
  loanRepayments: unknown[]
  supplierList: unknown[]
  customerList: unknown[]
  auditLogs: unknown[]
  openingCapital: number
  dailyClose: unknown[]
  roles: unknown[]
  staffMembers: unknown[]
  chartOfAccounts: unknown[]
  accountingPeriods: unknown[]
  journalEntries: unknown[]
  journalLines: unknown[]
}

export function wipedCompanyBooks<T extends CompanyBooks>(state: T): T {
  return {
    ...state,
    companySettings: {
      ...state.companySettings,
      openingCapital: 0,
    },
    sales: [],
    purchases: [],
    expenses: [],
    expenseCategories: [],
    inventory: [],
    banks: {},
    bankAccounts: [],
    bankTxns: [],
    receivables: [],
    payables: [],
    prepayments: [],
    loans: [],
    loanRepayments: [],
    supplierList: [],
    customerList: [],
    auditLogs: [],
    openingCapital: 0,
    dailyClose: [],
    roles: state.roles,
    staffMembers: state.staffMembers,
    chartOfAccounts: [],
    accountingPeriods: [],
    journalEntries: [],
    journalLines: [],
  }
}

export function wipeConfirmationPhrase(companyName: string): string {
  const name = companyName.trim()
  return name || 'DELETE'
}

export const CLOSE_ACCOUNT_PHRASE = 'CLOSE'

export const COMPANY_BOOK_TABLES = [
  'bank_transactions',
  'bank_reconciliations',
  'receipt_allocations',
  'sales_invoice_lines',
  'sale_items',
  'purchase_items',
  'inventory_movements',
  'stock_counts',
  'journal_lines',
  'prepayment_schedules',
  'loan_repayment_schedules',
  'loan_repayments',
  'lease_payment_schedules',
  'depreciation_schedules',
  'asset_value_adjustments',
  'receipts',
  'sales_invoices',
  'journal_entries',
  'sales',
  'purchases',
  'expenses',
  'expense_categories',
  'products',
  'contacts',
  'customers',
  'receivables',
  'payables',
  'prepayments',
  'loans',
  'leases',
  'fixed_assets',
  'provisions',
  'deferred_tax_calculations',
  'approval_workflows',
  'supplier_rebate_agreements',
  'staff_payments',
  'audit_logs',
  'bank_accounts',
  'accounting_periods',
  'chart_of_accounts',
] as const
