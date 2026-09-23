import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return `₦${value.toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}

export function formatCurrencyOrZero(value?: number | null): string {
  const v = typeof value === 'number' && !isNaN(value) ? value : 0
  return formatCurrency(v)
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

export function formatNumberOrZero(value?: number | null): string {
  const v = typeof value === 'number' && !isNaN(value) ? value : 0
  return formatNumber(v)
}

export function parseNumeric(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '')
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function makeID(prefix: string): string {
  const timestamp = Date.now().toString().slice(-8)
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0')
  return `${prefix}-${timestamp}-${random}`
}

export function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0]
}

export function triggerAppToast(title: string, description: string): void {
  if (typeof window === 'undefined') return
  const tone = /fail|error/i.test(`${title} ${description}`) ? 'error' : undefined
  window.dispatchEvent(new CustomEvent('quantixa:notification', {
    detail: { title, description, tone },
  }))
}

export function getYesterdayDate(): string {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return yesterday.toISOString().split('T')[0]
}

export function getDaysDifference(date1: string, date2: string): number {
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  const diffTime = Math.abs(d2.getTime() - d1.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

export const PRODUCTS: Record<string, string[]> = {
  BEVERAGES: [
    'Hollandia Milk 500ml',
    'Golden Morn Cereal',
    'Fanta Orange 500ml',
    'Coca-Cola 500ml',
  ],
  TOILETRIES: [
    'Lux Soap 200g',
    'Lifebouy Soap 200g',
    'Ponds Day Cream 50g',
    'Dettol Soap 200g',
  ],
  FRAGRANCES: [
    'Arabian Oud 100ml',
    'Dior Sauvage 100ml',
    'Versace Eros 100ml',
    'Chanel No. 5 100ml',
  ],
}

export const BANKS = ['Globus Bank', 'Access Bank', 'Zenith Bank', 'UBA']
export const PURCHASE_BANKS = ['Globus Bank', 'Access Bank', 'Zenith Bank', 'Credit (Payable)']
export const EXP_CATS = [
  'Admin / Overhead',
  'Office Supplies & Consumables',
  'Distribution & Logistics',
  'Sales & Marketing',
  'Office Utilities',
  'Operation & wages',
  'Cost of Goods Sold',
  'Gov. Levies, Licenses & Permits',
  'Fines & Penalties',
]
export const BANK_TXN_TYPES = [
  'Daily POS Sweep',
  'Cash Deposit',
  'Transfer',
  'Bank Charge',
  'Interest',
  'Loan Disbursement',
  'Cheque',
]

export const PAYMENT_TERMS = [
  'Cash',
  'Transfer',
  'Cheque',
  'Mobile Money',
  'POS',
  'Credit',
]

export function canEdit(role: string): boolean {
  // Only roles that should be able to create/edit transactional records
  return ['accountant', 'cashier'].includes(role)
}

export function canFin(role: string): boolean {
  return ['accountant'].includes(role)
}

export function canAudit(role: string): boolean {
  return ['md', 'accountant', 'auditor'].includes(role)
}

export function getStatusBadgeClass(status: string): string {
  switch (status?.toUpperCase()) {
    case 'PAID':
      return 'b-green'
    case 'CREDIT':
      return 'b-amber'
    case 'PART PAYMENT':
      return 'b-blue'
    case 'ACTIVE':
      return 'b-blue'
    case 'SETTLED':
      return 'b-green'
    case 'OVERDUE':
      return 'b-red'
    case 'VOID':
      return 'b-red'
    default:
      return 'b-blue'
  }
}

export function getRoleBadgeClass(role: string): string {
  switch (role?.toLowerCase()) {
    case 'md':
      return 'rp-md'
    case 'accountant':
      return 'rp-accountant'
    case 'cashier':
      return 'rp-cashier'
    case 'auditor':
      return 'rp-auditor'
    default:
      return ''
  }
}

export function calculateCOGS(qty: number, unitCost: number, openingQty: number, openingValue: number): number {
  const openingUnitCost = openingQty > 0 ? openingValue / openingQty : 0
  const weightedAverage = (openingValue + qty * unitCost) / (openingQty + qty)
  return qty * weightedAverage
}

export function calculatePIT(grossIncome: number): number {
  // Simplified PIT calculation for Nigeria
  if (grossIncome <= 300000) return 0
  if (grossIncome <= 600000) return (grossIncome - 300000) * 0.05
  if (grossIncome <= 1100000) return 15000 + (grossIncome - 600000) * 0.1
  if (grossIncome <= 1600000) return 65000 + (grossIncome - 1100000) * 0.15
  if (grossIncome <= 2100000) return 140000 + (grossIncome - 1600000) * 0.2
  if (grossIncome <= 5100000) return 240000 + (grossIncome - 2100000) * 0.25
  return 1015000 + (grossIncome - 5100000) * 0.3
}

export function calculateVAT(amount: number, rate = 0.075): number {
  // VAT is calculated on taxable sales at the configured rate
  return amount * rate
}

export function calculateCIT(profit: number, rate = 0.2): number {
  return Math.max(0, profit) * rate
}

export function calculateWHT(amount: number, rate = 0.05): number {
  return Math.max(0, amount) * rate
}

export function calculateEducationTax(profit: number, rate = 0.03): number {
  return Math.max(0, profit) * rate
}

export function calculateNDL(income: number, rate = 0.04): number {
  return Math.max(0, income) * rate
}

export function calculateTaxComplianceScore(metrics: {
  filings: number
  onTime: number
  docs: number
  checks: number
}): number {
  const filingScore = Math.min(25, (metrics.onTime / Math.max(metrics.filings, 1)) * 25)
  const docsScore = Math.min(25, (metrics.docs / 7) * 25)
  const checksScore = Math.min(25, (metrics.checks / 7) * 25)
  const base = 90
  return Math.min(100, Math.round(base + filingScore * 0.4 + docsScore * 0.4 + checksScore * 0.2))
}
