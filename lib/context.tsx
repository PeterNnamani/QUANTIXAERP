'use client'

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react'
import { supabase } from './supabase.browser'
import WorkspaceLoader from '@/components/layout/workspace-loader'
import { explicitAccessLevels, menuAccessFromLevels } from '@/lib/access-levels'
import { getDefaultRoles, type AccessLevels, type PermissionKey, type RoleDefinition } from '@/lib/rbac'
import { getTrialEndDate, isTrialActive, TRIAL_PLAN, type PlanName } from '@/lib/licensing'

function missingSchemaColumn(error: unknown, values: Record<string, unknown>): string | null {
  if (typeof error !== 'object' || error === null || (error as { code?: string }).code !== 'PGRST204') return null
  const message = String((error as { message?: string }).message || '')
  const match = message.match(/['"]?([a-zA-Z_][a-zA-Z0-9_]*)['"]?\s+(?:column|field)\b/i)
    || message.match(/(?:column|field)(?:\s+of)?\s+['"]?([a-zA-Z_][a-zA-Z0-9_]*)['"]?/i)
  const column = match?.[1]
  return column && Object.prototype.hasOwnProperty.call(values, column) ? column : null
}

async function upsertSaleWithSchemaFallback(saleRow: Record<string, unknown>) {
  const compatibleSaleRow = { ...saleRow }
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = await supabase!.from('sales').upsert(compatibleSaleRow, { onConflict: 'reference' }).select('id').single()
    if (!result.error) return result
    const unsupportedColumn = missingSchemaColumn(result.error, compatibleSaleRow)
    if (!unsupportedColumn) return result
    delete compatibleSaleRow[unsupportedColumn]
  }
  return { data: null, error: new Error('Sale could not match the database schema.') }
}

function enrichStoredUser(raw: any) {
  if (!raw || typeof raw !== 'object') return raw
  let roleId = typeof raw.role === 'string' ? raw.role.toLowerCase().replace(/\s+/g, '-') : raw.role
  if (roleId === 'md') roleId = 'business-owner'
  const templates = getDefaultRoles()
  let roleDef = templates.find((r) => r.id === roleId)
  if (!roleDef) roleDef = templates.find((r) => r.id === raw.role)

  const hasAccessMap = Boolean(raw.accessLevels) && typeof raw.accessLevels === 'object' && !Array.isArray(raw.accessLevels)
  const savedAccess = hasAccessMap ? menuAccessFromLevels(explicitAccessLevels(raw.accessLevels) || {}) : null
  const visibleMenus: PermissionKey[] = savedAccess
    ? savedAccess.visibleMenus
    : Array.isArray(raw.visibleMenus) && raw.visibleMenus.length > 0
      ? raw.visibleMenus
      : roleDef && Array.isArray(roleDef.visibleMenus) && roleDef.visibleMenus.length > 0
        ? roleDef.visibleMenus
        : roleDef && Array.isArray(roleDef.permissions)
          ? roleDef.permissions
          : []

  return {
    ...raw,
    role: raw.role,
    permissions: savedAccess ? savedAccess.permissions : raw.permissions,
    visibleMenus,
    accessLevels: savedAccess ? savedAccess.accessLevels : undefined,
    roleName: typeof raw.roleName === 'string' ? raw.roleName : undefined,
  }
}
import { createSeedLedgerData, postJournalEntry, findAccountByName } from '@/lib/ledger'
import { buildSeedChartOfAccounts, dedupeChartOfAccounts } from '@/lib/accounting/chart-of-accounts'
import { generateSku } from '@/lib/sku'
import { EXP_CATS } from '@/lib/utils'
import { setExportCompanyName } from '@/lib/export-utils'
import { wipedCompanyBooks } from '@/lib/company-lifecycle'
import { mergeReceivablesFromSales } from '@/lib/receivables'
import { bankTxnKey, businessReference, isUuid, isoDate, selectUnpostedJournals, shouldPostExpenseCash, subledgerReference } from '@/lib/accounting/sync'

export interface User {
  companyId?: string
  companyName?: string
  subscriptionPlan?: PlanName
  subscriptionStatus?: 'active' | 'trial' | 'expired' | 'cancelled'
  trialEndsAt?: string
  email?: string
  name: string
  role: string
  roleId?: string
  permissions?: PermissionKey[]
  visibleMenus?: PermissionKey[]
  accessLevels?: AccessLevels
  roleName?: string
  dataScope?: 'own' | 'team' | 'branch' | 'all'
  branchId?: string
  staffId?: string
  username?: string
  pin?: string
  userSettings?: UserSettings
}

export interface UserSettings {
  notificationCursor?: string
  dateFormat: string
  timezone: string
  notifications: { email: boolean; push: boolean; whatsapp: boolean }
  sessionTimeout: number
  compactMode: boolean
}

export interface StaffMember {
  id: string
  name: string
  staffId: string
  pin: string
  roleId: string
  roleName: string
  permissions: PermissionKey[]
  visibleMenus?: PermissionKey[]
  accessLevels?: AccessLevels
  dataScope: 'own' | 'team' | 'branch' | 'all'
  status: 'active' | 'disabled'
  createdAt: string
  username?: string
  password?: string
  branch?: string
  department?: string
  position?: string
  phone?: string
  email?: string
  dateOfBirth?: string
  gender?: string
  passportPhoto?: string
  employeeId?: string
  lastLogin?: string
}

export interface Sale {
  id: string
  date: string
  customer: string
  items: Array<{
    product: string
    dept: string
    qty: number
    unitPrice: number
    total: number
  }>
  totalAmount: number
  paymentMethod: string
  paymentAccount?: string
  paymentStatus: string
  notes: string
  status: string
  enteredBy: string
  amountPaid?: number
  balance?: number
  branch?: string
  orderStatus?: string
  deviceUsed?: 'Phone' | 'PC'
  customerDetails?: {
    phone?: string
    email?: string
    address?: string
  }
  deletedAt?: string
  purgeAfter?: string
}

export interface Purchase {
  id: string
  date: string
  dept: string
  product: string
  qty: number
  unitPrice: number
  transCost: number
  discount: number
  tax?: number
  total: number
  supplier: string
  bank: string
  paymentStatus: string
  dueDate: string
  notes: string
  status: string
  enteredBy: string
  invoiceNumber?: string
  purchaseOrder?: string
  branch?: string
  warehouse?: string
  category?: string
  paymentMethod?: string
  items?: Array<{
    product: string
    sku?: string
    qty: number
    unitPrice: number
    discount: number
    tax?: number
    total: number
  }>
  amountPaid?: number
  balance?: number
  employee?: string
  deletedAt?: string
  purgeAfter?: string
}

export interface Expense {
  id: string
  date: string
  desc: string
  category: string
  amount: number
  bank: string
  notes: string
  status: string
  enteredBy: string
  deletedAt?: string
  purgeAfter?: string
}

export interface InventoryItem {
  product: string
  sku?: string
  barcode?: string
  description?: string
  branch?: string
  dept: string
  subCategory?: string
  brand?: string
  uom?: string
  packSize?: string
  baseUnit?: string
  conversionFactor?: number
  openQty: number
  purchased: number
  sold: number
  reserved?: number
  unitCost: number
  averageCost?: number
  sellingPrice?: number
  closing: number
  reorderLevel?: number
  reorderQuantity?: number
  maximumStockLevel?: number
  supplier?: string
  batchNumber?: string
  expiryDate?: string
  manufacturingDate?: string
  lastPurchaseDate?: string
  lastSaleDate?: string
  active?: boolean
  remarks?: string
  damagedExpired?: number
  deletedAt?: string
  purgeAfter?: string
}

export interface PrepaymentSchedule {
  id: string
  period: string
  amount: number
  recognized: boolean
  completed: boolean
  recognitionDate: string | null
}

export interface Prepayment {
  id: string
  reference: string
  type: string
  supplier: string
  originalAmount: number
  usedAmount: number
  remainingAmount: number
  startDate: string
  endDate: string
  paymentMethod: string
  bankAccount: string
  referenceNo: string
  recordedBy: string
  recognitionStatus: string
  recognitionProgress: number
  status: string
  notes: string
  datePaid: string
  category: string
  paymentSource: string
  schedule: PrepaymentSchedule[]
}

export interface AuditLog {
  id?: string
  timestamp: string
  action: string
  type: string
  reference: string
  details: string
  user: string
  module?: string
  status?: string
  metadata?: Record<string, any>
}

export interface LedgerAccount {
  id: string
  code: string
  name: string
  accountType: string
  accountSubType?: string
  normalBalance: string
  isControlAccount?: boolean
  isActive?: boolean
  currency?: string
  openingBalance?: number
  openingBalanceDate?: string | null
}

export interface JournalEntry {
  id: string
  entryDate: string
  periodId: string
  reference: string
  description: string
  sourceModule: string
  sourceId?: string | null
  status: string
  createdBy: string
  createdAt: string
}

export interface JournalLine {
  id: string
  entryId: string
  accountId: string
  debit: number
  credit: number
  description: string
}

export interface JournalPostInput {
  id?: string
  entryDate?: string
  periodId?: string
  reference?: string
  description?: string
  sourceModule?: string
  sourceId?: string | null
  status?: string
  createdBy?: string
  lines: Array<{ accountId: string; debit?: number; credit?: number; description?: string }>
}

export interface JournalPostResult {
  entry?: JournalEntry
  lines?: JournalLine[]
  error?: string
}

export interface AppState {
  companySettings: CompanySettings
  sales: Sale[]
  purchases: Purchase[]
  expenses: Expense[]
  expenseCategories: string[]
  inventory: InventoryItem[]
  banks: Record<string, number>
  bankAccounts: BankAccount[]
  bankTxns: any[]
  receivables: any[]
  payables: any[]
  prepayments: Prepayment[]
  loans: any[]
  loanRepayments: any[]
  supplierList: string[]
  customerList: string[]
  auditLogs: AuditLog[]
  openingCapital: number
  dailyClose: any[]
  roles: RoleDefinition[]
  staffMembers: StaffMember[]
  chartOfAccounts: LedgerAccount[]
  accountingPeriods: any[]
  journalEntries: JournalEntry[]
  journalLines: JournalLine[]
}

export interface CompanySettings {
  companyName: string
  registrationNumber: string
  tin: string
  country: string
  currency: string
  timezone: string
  decimalPlaces: number
  dateFormat: string
  taxInclusive: boolean
  defaultBranch: string
  notifications: { email: boolean; push: boolean; whatsapp: boolean }
  security: { twoFactor: boolean; sessionTimeout: number; auditLogs: boolean; ipRestrictions: boolean }
  integrations: { paystack: boolean; moniepoint: boolean; flutterwave: boolean; googleDrive: boolean }
  ai: { enabled: boolean; voice: boolean; autoInsights: boolean; businessMemory: boolean }
  openingCapital: number
  roles: RoleDefinition[]
}

export interface BankAccount {
  id: string
  name: string
  institution: string
  accountNumber: string
  accountType: string
  currency: string
  branch: string
  openingBalance: number
  openingBalanceDate: string
  balance: number
  status: string
}

export interface AccountingContextType {
  user: User | null
  subscriptionLoaded: boolean
  state: AppState
  updateState: (updates: Partial<AppState>, options?: { persist?: boolean }) => void
  resetCompanyBooks: () => void
  deleteInventoryItems: (skus: string[]) => Promise<void>
  login: (userData: User, remember: boolean) => void
  logout: () => void
  addAuditLog: (action: string, type: string, reference: string, details: string) => void
  activateSubscription: (subscription: Pick<User, 'subscriptionPlan' | 'subscriptionStatus' | 'trialEndsAt'>) => void
}

const AccountingContext = createContext<AccountingContextType | undefined>(undefined)

const STORAGE_KEY = 'hw_accounting_data'
const AUTH_KEY = 'hw_auth_user'
const ONBOARDING_COMPLETED_KEY = 'quantixa_onboarding_completed'
const LOGIN_NOTIFICATION_KEY = 'quantixa_login_notification'
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000
const REMEMBER_USERNAME_KEY = 'hw_remembered_username'

const defaultState: AppState = {
  companySettings: {
    companyName: '', registrationNumber: '', tin: '', country: 'Nigeria', currency: 'NGN', timezone: 'Africa/Lagos',
    decimalPlaces: 2, dateFormat: 'DD/MM/YYYY', taxInclusive: true, defaultBranch: '',
    notifications: { email: true, push: true, whatsapp: true },
    security: { twoFactor: true, sessionTimeout: 20, auditLogs: true, ipRestrictions: false },
    integrations: { paystack: false, moniepoint: false, flutterwave: false, googleDrive: false },
    ai: { enabled: true, voice: true, autoInsights: true, businessMemory: false },
    openingCapital: 0, roles: getDefaultRoles(),
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
  roles: getDefaultRoles(),
  staffMembers: [],
  chartOfAccounts: [],
  accountingPeriods: [],
  journalEntries: [],
  journalLines: [],
}

function normalizeCompanySettings(settings: Partial<CompanySettings> | null | undefined, fallback: CompanySettings): CompanySettings {
  return {
    ...fallback,
    ...(settings || {}),
    notifications: { ...fallback.notifications, ...(settings?.notifications || {}) },
    security: { ...fallback.security, ...(settings?.security || {}) },
    integrations: { ...fallback.integrations, ...(settings?.integrations || {}) },
    ai: { ...fallback.ai, ...(settings?.ai || {}) },
    roles: Array.isArray(settings?.roles) && settings.roles.length > 0 ? settings.roles : fallback.roles,
  }
}

function normalizeRemoteSales(data: any[], saleItems: any[] = []): AppState['sales'] {
  const itemsBySale = new Map<string, any[]>()
  saleItems.forEach((item) => {
    const items = itemsBySale.get(item.sale_id) || []
    items.push({ product: item.product_name || '', dept: item.department || '', qty: Number(item.qty || 0), unitPrice: Number(item.unit_price || 0), total: Number(item.total || 0) })
    itemsBySale.set(item.sale_id, items)
  })
  return (data || []).map((item: any) => ({
    id: businessReference({ id: item.id, reference: item.reference }) || item.id,
    reference: item.reference || item.id,
    date: isoDate(item.sale_date || item.created_at),
    customer: item.contacts?.name || item.customer_name || item.customer_id || 'Unknown Customer',
    customerDetails: item.contacts ? { phone: item.contacts.phone || '', email: item.contacts.email || '', address: item.contacts.address || '' } : undefined,
    items: itemsBySale.get(item.id) || [],
    totalAmount: Number(item.total_amount || 0),
    paymentMethod: item.payment_method || '',
    paymentAccount: item.payment_account || '',
    paymentStatus: item.payment_status || '',
    notes: item.notes || '',
    status: item.status || '',
    enteredBy: item.sales_rep || item.created_by || 'System',
    amountPaid: Number(item.amount_paid || 0),
    balance: Number(item.balance ?? Math.max(0, Number(item.total_amount || 0) - Number(item.amount_paid || 0))),
    branch: item.branch || '',
    orderStatus: item.order_status || '',
    deviceUsed: item.device_used || undefined,
  }))
}

function normalizeRemotePurchases(data: any[]): AppState['purchases'] {
  return (data || []).map((item: any) => ({
    id: businessReference({ id: item.id, reference: item.reference }) || item.id,
    reference: item.reference || item.id,
    date: isoDate(item.purchase_date || item.created_at),
    dept: item.department || '',
    product: item.product_name || item.purchase_items?.[0]?.product_name || item.reference || '',
    qty: Number(item.qty || item.purchase_items?.[0]?.qty || 0),
    unitPrice: Number(item.unit_price || item.purchase_items?.[0]?.unit_price || 0),
    transCost: Number(item.shipping || 0),
    discount: Number(item.discount || 0),
    total: Number(item.total || 0),
    supplier: item.supplier_name || item.contacts?.name || item.supplier_id || 'Unknown Supplier',
    bank: item.bank || '',
    paymentStatus: item.payment_status || '',
    dueDate: item.due_date || '',
    notes: item.notes || '',
    status: item.status || '',
    enteredBy: item.created_by || 'System',
    invoiceNumber: item.invoice_number || '',
    purchaseOrder: item.purchase_order || '',
    branch: item.branch || '',
    warehouse: item.warehouse || '',
    category: item.category || '',
    paymentMethod: item.payment_method || '',
    items: (item.purchase_items || []).map((purchaseItem: any) => ({
      product: purchaseItem.product_name || '',
      sku: purchaseItem.sku || '',
      qty: Number(purchaseItem.qty || 0),
      unitPrice: Number(purchaseItem.unit_price || 0),
      discount: Number(purchaseItem.discount || 0),
      tax: Number(purchaseItem.tax || 0),
      total: Number(purchaseItem.total || 0),
    })),
  }))
}

function normalizeRemoteExpenses(data: any[]): AppState['expenses'] {
  return (data || []).map((item: any) => ({
    id: businessReference({ id: item.id, reference: item.reference }) || item.id,
    reference: item.reference || item.id,
    date: isoDate(item.expense_date || item.created_at),
    desc: item.description || item.reference || '',
    category: item.category || '',
    amount: Number(item.amount || 0),
    bank: item.bank_accounts?.name || '',
    notes: item.notes || '',
    status: item.status || '',
    enteredBy: item.entered_by || 'System',
  }))
}

function subledgerBalance(item: any) {
  const original = Number(item.original_amount ?? item.amount ?? item.total ?? 0)
  const outstanding = Number(item.outstanding_amount ?? item.balance ?? item.balanceDue ?? item.balance_due ?? original)
  const paid = Number(item.amount_paid ?? item.amountPaid ?? item.paid ?? Math.max(0, original - outstanding))
  return { original, outstanding, paid }
}

function normalizeRemoteReceivables(data: any[]) {
  return (data || []).map((item: any) => {
    const amounts = subledgerBalance(item)
    const name = item.contacts?.name || item.customer || item.name || 'Unknown Customer'
    return {
      ...item,
      id: item.id,
      contact_id: item.contact_id,
      reference: item.reference || item.invoice || item.id,
      customer: name,
      name,
      invoice: item.invoice || item.reference || item.id,
      invoiceDate: isoDate(item.invoice_date || item.due_date),
      dueDate: isoDate(item.due_date || item.dueDate),
      due: isoDate(item.due_date || item.dueDate),
      total: amounts.original,
      amount: amounts.original,
      original_amount: amounts.original,
      paid: amounts.paid,
      amountPaid: amounts.paid,
      amount_paid: amounts.paid,
      balance: amounts.outstanding,
      balanceDue: amounts.outstanding,
      outstanding_amount: amounts.outstanding,
      status: item.status || 'open',
      sourceSaleId: item.reference || item.sourceSaleId,
    }
  })
}

function normalizeRemotePayables(data: any[]) {
  return (data || []).map((item: any) => {
    const amounts = subledgerBalance(item)
    const name = item.contacts?.name || item.supplier || item.name || 'Unknown Supplier'
    return {
      ...item,
      id: item.id,
      contact_id: item.contact_id,
      reference: item.reference || item.invoice_number || item.id,
      supplier: name,
      name,
      invoice: item.invoice || item.invoice_number || item.reference || item.id,
      invoiceNumber: item.invoice_number || item.invoice || item.reference || '',
      purchaseRef: item.reference || item.purchaseRef || '',
      invoiceDate: isoDate(item.purchase_date || item.due_date),
      dueDate: isoDate(item.due_date || item.dueDate),
      due: isoDate(item.due_date || item.dueDate),
      total: amounts.original,
      amount: amounts.original,
      original_amount: amounts.original,
      paid: amounts.paid,
      amountPaid: amounts.paid,
      amount_paid: amounts.paid,
      balance: amounts.outstanding,
      balanceDue: amounts.outstanding,
      outstanding_amount: amounts.outstanding,
      status: item.status || 'open',
    }
  })
}

function normalizeRemoteInventory(data: any[]): AppState['inventory'] {
  return (data || []).map((item: any) => ({
    product: item.name || item.sku || item.id,
    sku: item.sku || '',
    barcode: item.barcode || '',
    description: item.description || '',
    branch: item.branch || '',
    dept: item.category || item.branch || 'General',
    subCategory: item.sub_category || '',
    brand: item.brand || '',
    uom: item.uom || 'Unit',
    packSize: item.pack_size || '',
    baseUnit: item.base_unit || '',
    conversionFactor: Number(item.conversion_factor || 1),
    openQty: Number(item.stock_qty || 0),
    purchased: 0,
    sold: 0,
    reserved: Number(item.reserved_qty || 0),
    unitCost: Number(item.unit_cost || 0),
    averageCost: Number(item.average_cost || item.unit_cost || 0),
    sellingPrice: Number(item.unit_price || 0),
    closing: Number(item.stock_qty || 0),
    reorderLevel: Number(item.reorder_level || 0),
    reorderQuantity: Number(item.reorder_quantity || 0),
    maximumStockLevel: Number(item.maximum_stock_level || 0),
    supplier: item.supplier || '',
    batchNumber: item.batch_number || '',
    expiryDate: item.expiry_date || '',
    manufacturingDate: item.manufacturing_date || '',
    lastPurchaseDate: item.last_purchase_date || '',
    lastSaleDate: item.last_sale_date || '',
    active: item.status !== 'inactive',
    remarks: item.remarks || '',
    damagedExpired: Number(item.damaged_expired || 0),
  }))
}

function normalizeInventorySkus(inventory: InventoryItem[]): InventoryItem[] {
  const usedSkus = inventory.map((item) => item.sku).filter((sku): sku is string => Boolean(sku))
  return inventory.map((item) => {
    if (item.sku) return item
    const sku = generateSku(item.product, usedSkus)
    usedSkus.push(sku)
    return { ...item, sku }
  })
}

function normalizeRemotePrepayments(data: any[]): AppState['prepayments'] {
  return (data || []).map((item: any) => ({
    id: item.id,
    reference: item.reference || item.id,
    type: item.prepayment_type || item.type || 'Prepayment',
    supplier: item.supplier || 'Unknown Supplier',
    originalAmount: Number(item.original_amount || item.amount || 0),
    usedAmount: Number(item.used_amount || item.amount_recognized || 0),
    remainingAmount: Number(item.remaining_amount || item.balance || 0),
    startDate: item.start_date || item.created_at?.slice(0, 10) || '',
    endDate: item.end_date || '',
    paymentMethod: item.payment_method || '',
    bankAccount: item.bank_account || '',
    referenceNo: item.reference_no || '',
    recordedBy: item.recorded_by || item.created_by || 'System',
    recognitionStatus: item.recognition_status || 'Not Started',
    recognitionProgress: Number(item.recognition_progress || 0),
    status: item.status || 'Active',
    notes: item.notes || '',
    datePaid: item.start_date || item.created_at?.slice(0, 10) || '',
    category: item.category || 'Supplier Advances',
    paymentSource: item.payment_method || 'Bank Account',
    schedule: Array.isArray(item.prepayment_schedules)
      ? item.prepayment_schedules.map((schedule: any) => ({
        id: schedule.id,
        period: schedule.period || '',
        amount: Number(schedule.amount || 0),
        recognized: Boolean(schedule.recognized),
        completed: Boolean(schedule.recognized),
        recognitionDate: schedule.recognition_date || null,
      }))
      : Array.isArray(item.schedule)
        ? item.schedule.map((schedule: any) => ({
          id: schedule.id || '',
          period: schedule.period || '',
          amount: Number(schedule.amount || 0),
          recognized: Boolean(schedule.recognized),
          completed: Boolean(schedule.recognized),
          recognitionDate: schedule.recognitionDate || null,
        }))
        : [],
  }))
}

function normalizeRemoteContacts(data: any[]) {
  const supplierList = (data || []).filter((item: any) => item.type === 'supplier').map((item: any) => item.name)
  const customerList = (data || []).filter((item: any) => item.type === 'customer').map((item: any) => item.name)
  return { supplierList, customerList }
}

function normalizeRemoteLoans(data: any[]) {
  return (data || []).map((loan: any) => ({
    id: loan.reference || loan.id,
    lender: loan.lender || '',
    type: loan.loan_type || loan.type || 'Business Loan',
    originalAmount: Number(loan.amount ?? loan.original_amount ?? 0),
    balance: Number(loan.balance ?? loan.amount ?? 0),
    interestRate: Number(loan.interest_rate ?? loan.interestRate ?? 0),
    periodMonths: Number(loan.term_months ?? loan.periodMonths ?? 0),
    startDate: loan.start_date || loan.startDate || '',
    endDate: loan.maturity_date || loan.endDate || '',
    status: loan.status ? String(loan.status).replace(/^./, (value: string) => value.toUpperCase()) : 'Active',
    principalPaid: Number(loan.principal_paid ?? 0),
    interestRemaining: Number(loan.interest_remaining ?? 0),
    paymentSchedule: Array.isArray(loan.paymentSchedule)
      ? loan.paymentSchedule
      : typeof loan.payment_schedule === 'string'
        ? (() => { try { return JSON.parse(loan.payment_schedule) } catch { return [] } })()
        : [],
  }))
}

function normalizeRemoteLoanRepayments(data: any[]) {
  return (data || []).map((repayment: any) => ({
    id: repayment.id,
    loanId: repayment.loan_reference,
    accountId: repayment.bank_account_id || '',
    accountName: repayment.bank_accounts?.name || repayment.account_name || 'Cash / Other',
    amount: Number(repayment.amount || 0),
    paymentMethod: repayment.payment_method || 'Bank Transfer',
    date: repayment.repayment_date || repayment.created_at?.slice(0, 10) || '',
    note: repayment.note || '',
  }))
}

function mergeRemoteRecords<T>(remote: T[], local: T[], failed: boolean, prefer: 'remote' | 'local' = 'remote', keyOf: (row: T) => string = (row) => String((row as { id?: string }).id || '')): T[] {
  if (failed) return local
  const key = (row: T) => keyOf(row)
  const localByKey = new Map(local.filter((row) => key(row)).map((row) => [key(row), row]))
  const remoteKeys = new Set(remote.map(key).filter(Boolean))
  const localOnly = local.filter((row) => key(row) && !remoteKeys.has(key(row)))
  if (prefer === 'local') {
    const merged = remote.map((row) => (key(row) && localByKey.has(key(row)) ? localByKey.get(key(row))! : row))
    return [...localOnly, ...merged]
  }
  return [...localOnly, ...remote]
}

function normalizeRemoteAuditLogs(data: any[]): AuditLog[] {
  return (data || []).map((item: any) => ({
    id: item.id,
    timestamp: item.event_time || item.created_at || new Date().toISOString(),
    action: item.action || 'ACTIVITY',
    type: item.event_type || item.entity || 'UPDATE',
    reference: item.reference || '',
    details: item.details || '',
    user: item.metadata?.user_name || item.user_name || item.users?.full_name || item.users?.username || 'System',
    module: item.module || item.entity || 'Accounting',
    status: item.status || 'SUCCESS',
    metadata: item.metadata || undefined,
  }))
}

export function AccountingProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false)
  const [state, setState] = useState<AppState>(defaultState)
  const [isLoading, setIsLoading] = useState(true)
  const companySettingsWriteQueue = useRef(Promise.resolve())
  const trialExpiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const remoteLoadToken = useRef(0)

  // Fetch persisted banks and bank transactions from Supabase when available
  useEffect(() => {
    let mounted = true
    setSubscriptionLoaded(false)
    if (trialExpiryTimer.current) clearTimeout(trialExpiryTimer.current)

    async function loadRemoteData() {
      if (!supabase || !user?.companyId) return
      const companyId = user.companyId
      const token = remoteLoadToken.current
      try {
        const [{ data: companyData, error: companyErr }, { data: salesData, error: salesErr }, { data: saleItemsData, error: saleItemsErr }, { data: purchasesData, error: purchasesErr }, { data: expensesData, error: expensesErr }, { data: categoriesData, error: categoriesErr }, { data: inventoryData, error: inventoryErr }, { data: prepaymentsData, error: prepaymentsErr }, { data: contactsData, error: contactsErr }, { data: banksData, error: banksErr }, { data: txnsData, error: txnsErr }, { data: loansData, error: loansErr }, { data: loanRepaymentsData, error: loanRepaymentsErr }, { data: receivablesData, error: receivablesErr }, { data: payablesData, error: payablesErr }, { data: accountsData, error: accountsErr }, { data: entriesData, error: entriesErr }, { data: linesData, error: linesErr }, { data: auditLogsData, error: auditLogsErr }, { data: subscriptionData, error: subscriptionErr }] = await Promise.all([
          supabase.from('companies').select('name,settings,created_at').eq('id', companyId).maybeSingle(),
          supabase.from('sales').select('*, contacts(name,phone,email,address)').eq('company_id', companyId).order('sale_date', { ascending: false }).limit(200),
          supabase.from('sale_items').select('*').eq('company_id', companyId),
          supabase.from('purchases').select('*, contacts(name), purchase_items(*)').eq('company_id', companyId).order('purchase_date', { ascending: false }).limit(200),
          supabase.from('expenses').select('*, bank_accounts(name)').eq('company_id', companyId).order('expense_date', { ascending: false }).limit(200),
          supabase.from('expense_categories').select('name').eq('company_id', companyId).order('name'),
          supabase.from('products').select('*').eq('company_id', companyId).is('deleted_at', null).order('updated_at', { ascending: false }).limit(200),
          supabase.from('prepayments').select('*, prepayment_schedules(*)').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200),
          supabase.from('contacts').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200),
          supabase.from('bank_accounts').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(100),
          supabase.from('bank_transactions').select('*, bank_accounts(name)').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200),
          supabase.from('loans').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200),
          supabase.from('loan_repayments').select('*, bank_accounts(name)').eq('company_id', companyId).order('repayment_date', { ascending: false }).limit(500),
          supabase.from('receivables').select('*, contacts(name)').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200),
          supabase.from('payables').select('*, contacts(name)').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200),
          supabase.from('chart_of_accounts').select('*').eq('company_id', companyId).order('code'),
          supabase.from('journal_entries').select('*').eq('company_id', companyId).order('entry_date', { ascending: false }).limit(1000),
          supabase.from('journal_lines').select('*').eq('company_id', companyId).limit(5000),
          supabase.from('audit_logs').select('*, users(full_name,username)').eq('company_id', companyId).order('event_time', { ascending: false }).limit(1000),
          supabase.from('subscriptions').select('plan_name,status,starts_at,expires_at').eq('company_id', companyId).in('status', ['trial', 'active']).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        ])

        if (salesErr) console.error('Error loading sales from Supabase', salesErr)
        if (companyErr) console.error('Error loading company settings from Supabase', companyErr)
        if (saleItemsErr) console.error('Error loading sale items from Supabase', saleItemsErr)
        if (purchasesErr) console.error('Error loading purchases from Supabase', purchasesErr)
        if (expensesErr) console.error('Error loading expenses from Supabase', expensesErr)
        if (categoriesErr && categoriesErr.code !== 'PGRST205') console.error('Error loading expense categories from Supabase', categoriesErr)
        if (inventoryErr) console.error('Error loading inventory from Supabase', inventoryErr)
        if (prepaymentsErr) {
          if (prepaymentsErr.code === 'PGRST205') {
            console.warn('Supabase prepayments table not found. Skipping prepayments remote load.')
          } else {
            console.error('Error loading prepayments from Supabase', prepaymentsErr)
          }
        }
        if (contactsErr) console.error('Error loading contacts from Supabase', contactsErr)
        if (banksErr) console.error('Error loading bank accounts from Supabase', banksErr)
        if (txnsErr) console.error('Error loading bank transactions from Supabase', txnsErr)
        if (loansErr) console.error('Error loading loans from Supabase', loansErr)
        if (loanRepaymentsErr && loanRepaymentsErr.code !== 'PGRST205') console.error('Error loading loan repayments from Supabase', loanRepaymentsErr)
        if (receivablesErr) console.error('Error loading receivables from Supabase', receivablesErr)
        if (payablesErr) console.error('Error loading payables from Supabase', payablesErr)
        if (accountsErr) console.error('Error loading chart of accounts from Supabase', accountsErr)
        if (entriesErr) console.error('Error loading journal entries from Supabase', entriesErr)
        if (linesErr) console.error('Error loading journal lines from Supabase', linesErr)
        if (auditLogsErr && auditLogsErr.code !== 'PGRST205') console.error('Error loading audit logs from Supabase', auditLogsErr)
        if (subscriptionErr && subscriptionErr.code !== 'PGRST205') console.error('Error loading subscription from Supabase', subscriptionErr)

        if (!mounted || token !== remoteLoadToken.current) return

        try {
          const params = new URLSearchParams({ companyId, ...(user.staffId ? { staffId: user.staffId } : { username: user.username || '' }) })
          const response = await fetch(`/api/users?${params.toString()}`)
          const accountResult = await response.json()
          if (response.ok && accountResult.success) {
            setUser((current) => current ? { ...current, userSettings: accountResult.userSettings || {} } : current)
          }
        } catch (error) {
          console.error('Unable to load account settings', error)
        }

        if (companyData?.name) {
          setExportCompanyName(companyData.name)
        }

        const remoteSales = salesData && salesData.length > 0 ? normalizeRemoteSales(salesData, saleItemsData || []) : []
        const remotePurchases = purchasesData && purchasesData.length > 0 ? normalizeRemotePurchases(purchasesData) : []
        const remoteExpenses = expensesData && expensesData.length > 0 ? normalizeRemoteExpenses(expensesData) : []
        const remoteExpenseCategories = (categoriesData || []).map((item: any) => item.name).filter(Boolean)
        const remoteInventory = inventoryData && inventoryData.length > 0 ? normalizeRemoteInventory(inventoryData) : []
        const remoteReceivables = mergeReceivablesFromSales(remoteSales, normalizeRemoteReceivables(receivablesData || []))
        const remotePrepayments = prepaymentsErr && prepaymentsErr.code === 'PGRST205'
          ? []
          : prepaymentsData && prepaymentsData.length > 0
            ? normalizeRemotePrepayments(prepaymentsData)
            : []
        const { supplierList, customerList } = normalizeRemoteContacts(contactsData || [])

        setState((prev) => ({
          ...prev,
          companySettings: normalizeCompanySettings({
            ...(companyData?.settings || {}),
            companyName: companyData?.name || prev.companySettings.companyName || user.companyName || '',
          }, prev.companySettings),
          openingCapital: Number(companyData?.settings?.openingCapital ?? prev.openingCapital),
          roles: Array.isArray(companyData?.settings?.roles) && companyData.settings.roles.length > 0 ? companyData.settings.roles : prev.roles,
          sales: mergeRemoteRecords(remoteSales, prev.sales, Boolean(salesErr)),
          purchases: mergeRemoteRecords(remotePurchases, prev.purchases, Boolean(purchasesErr)),
          expenses: mergeRemoteRecords(remoteExpenses, prev.expenses, Boolean(expensesErr)),
          expenseCategories: categoriesErr ? prev.expenseCategories : remoteExpenseCategories,
          inventory: mergeRemoteRecords(remoteInventory, prev.inventory, Boolean(inventoryErr), 'local', (item) => item.sku || item.product),
          prepayments: prepaymentsErr && prepaymentsErr.code !== 'PGRST205' ? prev.prepayments : mergeRemoteRecords(remotePrepayments, prev.prepayments, false),
          supplierList: contactsErr ? prev.supplierList : supplierList,
          customerList: contactsErr ? prev.customerList : customerList,
          loans: loansErr ? prev.loans : normalizeRemoteLoans(loansData || []),
          loanRepayments: loanRepaymentsErr ? prev.loanRepayments : normalizeRemoteLoanRepayments(loanRepaymentsData || []),
          receivables: mergeRemoteRecords(remoteReceivables, prev.receivables, Boolean(receivablesErr), 'local'),
          payables: mergeRemoteRecords(payablesErr ? [] : normalizeRemotePayables(payablesData || []), prev.payables, Boolean(payablesErr), 'local'),
          chartOfAccounts: accountsErr ? prev.chartOfAccounts : dedupeChartOfAccounts((accountsData || []).map((account: any) => ({
            id: account.id, code: account.code, name: account.name, accountType: account.account_type,
            accountSubType: account.account_subtype, normalBalance: account.normal_balance,
            isControlAccount: account.is_control_account, isActive: account.is_active, currency: account.currency,
            openingBalance: Number(account.opening_balance || 0), openingBalanceDate: account.opening_balance_date,
          }))),
          journalEntries: entriesErr ? prev.journalEntries : (entriesData || []).map((entry: any) => ({
            id: entry.id, entryDate: isoDate(entry.entry_date), periodId: entry.period_id, reference: entry.reference || '',
            description: entry.description || '', sourceModule: entry.source_module, sourceId: entry.source_id,
            status: entry.status, createdBy: entry.created_by || 'System', createdAt: entry.created_at,
          })),
          journalLines: linesErr ? prev.journalLines : (linesData || []).map((line: any) => ({
            id: line.id, entryId: line.entry_id, accountId: line.account_id, debit: Number(line.debit || 0),
            credit: Number(line.credit || 0), description: line.description || '',
          })),
          auditLogs: mergeRemoteRecords(auditLogsErr ? [] : normalizeRemoteAuditLogs(auditLogsData || []), prev.auditLogs, Boolean(auditLogsErr)),
        }))

        if (companyData?.name && user.companyName !== companyData.name) {
          setUser((current) => current ? { ...current, companyName: companyData.name } : current)
        }
        if (!subscriptionErr && subscriptionData?.status === 'active') {
          if (trialExpiryTimer.current) clearTimeout(trialExpiryTimer.current)
          setUser((current) => current ? { ...current, subscriptionPlan: subscriptionData.plan_name, subscriptionStatus: subscriptionData.status } : current)
        } else if (!subscriptionErr && subscriptionData?.status === 'trial' && isTrialActive(subscriptionData.starts_at, new Date())) {
          const trialEndsAt = subscriptionData.expires_at || getTrialEndDate(subscriptionData.starts_at)?.toISOString()
          if (trialExpiryTimer.current) clearTimeout(trialExpiryTimer.current)
          setUser((current) => current ? { ...current, subscriptionPlan: TRIAL_PLAN, subscriptionStatus: 'trial', trialEndsAt } : current)
          if (trialEndsAt) {
            trialExpiryTimer.current = setTimeout(() => {
              setUser((current) => current ? { ...current, subscriptionPlan: undefined, subscriptionStatus: 'expired', trialEndsAt: undefined } : current)
            }, Math.max(0, new Date(trialEndsAt).getTime() - Date.now()))
          }
        } else if (isTrialActive(companyData?.created_at)) {
          const trialEndsAt = new Date(companyData.created_at)
          trialEndsAt.setDate(trialEndsAt.getDate() + 14)
          setUser((current) => current ? { ...current, subscriptionPlan: 'Professional Edition', subscriptionStatus: 'trial', trialEndsAt: trialEndsAt.toISOString() } : current)
          trialExpiryTimer.current = setTimeout(() => {
            setUser((current) => current ? { ...current, subscriptionPlan: undefined, subscriptionStatus: 'expired', trialEndsAt: undefined } : current)
          }, Math.max(0, trialEndsAt.getTime() - Date.now()))
        } else {
          setUser((current) => current ? { ...current, subscriptionPlan: undefined, subscriptionStatus: 'expired', trialEndsAt: undefined } : current)
        }

        if (!mounted || token !== remoteLoadToken.current) return

        if (banksData && banksData.length > 0) {
          const banksMap: Record<string, number> = {}
          const bankAccounts = banksData.map((b: any) => {
            banksMap[b.name] = Number(b.balance || 0)
            return {
              id: b.id,
              name: b.name,
              institution: b.institution || '',
              accountNumber: b.account_number || '',
              accountType: b.account_type || 'Current',
              currency: b.currency || 'NGN',
              branch: b.branch || '',
              openingBalance: Number(b.opening_balance || 0),
              openingBalanceDate: b.opening_balance_date || '',
              balance: Number(b.balance || 0),
              status: b.status || 'active',
            }
          })
          setState((prev) => {
            const localById = new Map(prev.bankAccounts.filter((account) => account.id).map((account) => [account.id, account]))
            const remoteIds = new Set(bankAccounts.map((account) => account.id))
            const mergedAccounts = [
              ...prev.bankAccounts.filter((account) => account.id && !remoteIds.has(account.id)),
              ...bankAccounts.map((account) => {
                const local = localById.get(account.id)
                return local ? { ...account, balance: Number(local.balance ?? account.balance) } : account
              }),
            ]
            const banks = { ...prev.banks }
            mergedAccounts.forEach((account) => { banks[account.name] = Number(account.balance || 0) })
            return { ...prev, banks, bankAccounts: mergedAccounts }
          })
        } else if (!banksErr) {
          setState((prev) => ({ ...prev, banks: prev.banks, bankAccounts: prev.bankAccounts }))
        }

        if (txnsData && txnsData.length > 0) {
          const normalized = txnsData.map((t: any) => ({
            id: t.id,
            date: t.txn_date?.toString?.() || (t.txn_date ?? new Date().toISOString().slice(0, 10)),
            name: t.description ?? '',
            activity: t.description ?? '',
            method: 'Unknown',
            amount: Number(t.amount || 0),
            status: t.is_reconciled ? 'Completed' : 'Processing',
            description: t.description ?? '',
            attachments: 0,
            type: Number(t.amount) >= 0 ? 'Deposit' : 'Withdrawal',
            bank: t.bank_accounts?.name || '',
            created_at: t.created_at,
          }))
          setState((prev) => ({ ...prev, bankTxns: mergeRemoteRecords(normalized, prev.bankTxns, Boolean(txnsErr)) }))
        } else if (!txnsErr) {
          setState((prev) => ({ ...prev, bankTxns: prev.bankTxns }))
        }
      } catch (err) {
        console.error('Unable to load remote accounting data', err)
      }
    }

    loadRemoteData().finally(() => {
      if (mounted) setSubscriptionLoaded(true)
    })

    return () => {
      mounted = false
      if (trialExpiryTimer.current) clearTimeout(trialExpiryTimer.current)
    }
  }, [user?.companyId])

  useEffect(() => {
    // Intentionally do not seed demo ledger data on first load.
    // New installations should start with an empty `defaultState` so
    // the owner or super-admin can register the company and configure
    // the system (staff, banks, chart of accounts, opening balances, etc.).
    const savedState = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY)
    if (savedState) return
    // No action: keep `state` as `defaultState` until the owner performs setup.
  }, [])

  // Load from localStorage or sessionStorage on mount
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem(AUTH_KEY) ?? sessionStorage.getItem(AUTH_KEY)
      let companyId = user?.companyId

      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser)
          const enriched = enrichStoredUser(parsed)
          companyId = enriched.companyId || companyId
          setUser(enriched)
          const storage = window.localStorage.getItem(AUTH_KEY) ? localStorage : sessionStorage
          storage.setItem(AUTH_KEY, JSON.stringify(enriched))
        } catch (e) {
          console.warn('Unable to restore saved user', e)
        }
      }
      const savedState = companyId
        ? localStorage.getItem(`${STORAGE_KEY}:${companyId}`)
        : null
      if (savedState) {
        const parsedState = JSON.parse(savedState)
        setState({
          ...defaultState,
          ...parsedState,
          companySettings: normalizeCompanySettings(parsedState.companySettings, defaultState.companySettings),
          expenseCategories: Array.isArray(parsedState.expenseCategories) ? parsedState.expenseCategories : defaultState.expenseCategories,
          inventory: Array.isArray(parsedState.inventory) ? normalizeInventorySkus(parsedState.inventory) : defaultState.inventory,
          roles: Array.isArray(parsedState.roles) && parsedState.roles.length > 0 ? parsedState.roles : defaultState.roles,
          staffMembers: Array.isArray(parsedState.staffMembers) ? parsedState.staffMembers : defaultState.staffMembers,
        })
      }
    } catch (e) {
      console.warn('Unable to restore workspace session', e)
    } finally {
      setIsLoading(false)
    }
  }, [user?.companyId])

  const updateState = (updates: Partial<AppState>, options: { persist?: boolean } = {}) => {
    const companyId = user?.companyId
    setState((prev) => {
      const normalizedUpdates = updates.inventory
        ? { ...updates, inventory: normalizeInventorySkus(updates.inventory) }
        : updates
      const newState = { ...prev, ...normalizedUpdates }
      if (companyId) {
        localStorage.setItem(`${STORAGE_KEY}:${companyId}`, JSON.stringify(newState))
      }
      // Persist banks and bank transactions to Supabase where possible
      ; (async () => {
        if (!supabase || !companyId || options.persist === false) return

        try {
          if (updates.companySettings || updates.openingCapital !== undefined || updates.roles) {
            const settings: CompanySettings = {
              ...newState.companySettings,
              ...(updates.openingCapital !== undefined ? { openingCapital: updates.openingCapital } : {}),
              ...(updates.roles ? { roles: updates.roles } : {}),
            }
            companySettingsWriteQueue.current = companySettingsWriteQueue.current
              .catch(() => undefined)
              .then(async () => {
                const { error: companySettingsError } = await supabase!.from('companies').update({
                  name: settings.companyName.trim(), settings, updated_at: new Date().toISOString(),
                }).eq('id', companyId)
                if (companySettingsError) {
                  console.error('Unable to persist company settings', companySettingsError)
                  throw companySettingsError
                }
              })
            await companySettingsWriteQueue.current
          }

          if (updates.prepayments) {
            const prepayments = updates.prepayments as Prepayment[]
            const prepaymentRows = prepayments.map((p) => ({
              company_id: companyId,
              id: p.id || undefined,
              reference: p.reference,
              prepayment_type: p.type,
              category: p.category,
              supplier: p.supplier,
              original_amount: p.originalAmount,
              used_amount: p.usedAmount,
              remaining_amount: p.remainingAmount,
              start_date: p.startDate || null,
              end_date: p.endDate || null,
              payment_method: p.paymentMethod,
              bank_account: p.bankAccount,
              reference_no: p.referenceNo,
              recorded_by: p.recordedBy,
              recognition_status: p.recognitionStatus,
              recognition_progress: p.recognitionProgress,
              status: p.status,
              notes: p.notes,
              updated_at: new Date().toISOString(),
            }))

            const { error: prepaymentsPersistErr } = await supabase.from('prepayments').upsert(prepaymentRows, { onConflict: 'reference' })
            if (prepaymentsPersistErr) {
              if (prepaymentsPersistErr.code === 'PGRST205') {
                console.warn('Supabase prepayments table not found. Skipping prepayments persistence.')
              } else {
                throw prepaymentsPersistErr
              }
            }
            const scheduleRows = prepayments.flatMap((prepayment) => prepayment.schedule.map((schedule) => ({
              id: schedule.id || undefined,
              company_id: companyId,
              prepayment_id: prepayment.id,
              period: schedule.period,
              amount: schedule.amount,
              recognized: schedule.recognized,
              recognition_date: schedule.recognitionDate,
            })))
            const scheduleUpserts = scheduleRows.filter((row) => row.id)
            const scheduleInserts = scheduleRows.filter((row) => !row.id && row.prepayment_id)

            if (scheduleUpserts.length > 0) {
              await supabase.from('prepayment_schedules').upsert(scheduleUpserts, { onConflict: 'id' })
            }
            if (scheduleInserts.length > 0) {
              await supabase.from('prepayment_schedules').insert(scheduleInserts)
            }
          }

          if (normalizedUpdates.sales) {
            const sales = normalizedUpdates.sales as Sale[]
            for (const sale of sales) {
              const customerName = sale.customer || 'Walk-in Customer'
              let { data: customer } = await supabase.from('contacts').select('id').eq('company_id', companyId).eq('type', 'customer').eq('name', customerName).maybeSingle()
              if (!customer) {
                const result = await supabase.from('contacts').insert({ company_id: companyId, type: 'customer', name: customerName }).select('id').single()
                if (result.error) throw result.error
                customer = result.data
              }
              const saleRow = {
                company_id: companyId,
                reference: businessReference(sale),
                sale_date: sale.date,
                customer_id: customer.id,
                branch: sale.branch || null,
                sales_rep: sale.enteredBy || null,
                device_used: sale.deviceUsed || null,
                payment_method: sale.paymentMethod || 'Transfer',
                payment_account: sale.paymentAccount || null,
                payment_status: sale.paymentStatus || 'PAID',
                status: sale.status || 'ACTIVE',
                notes: sale.notes || null,
                subtotal: sale.totalAmount || 0,
                total_amount: sale.totalAmount || 0,
                amount_paid: sale.amountPaid ?? (sale.paymentStatus === 'PAID' ? sale.totalAmount : 0),
                balance: sale.balance ?? (sale.paymentStatus === 'PAID' ? 0 : sale.totalAmount),
                deleted_at: (sale as any).deletedAt || null,
                purge_after: (sale as any).purgeAfter || null,
              }
              const { data: storedSale, error: saleError } = await upsertSaleWithSchemaFallback(saleRow)
              if (saleError) throw saleError
              const { error: deleteItemsError } = await supabase.from('sale_items').delete().eq('sale_id', storedSale.id)
              if (deleteItemsError) throw deleteItemsError
              if (sale.items?.length) {
                const { error: itemError } = await supabase.from('sale_items').insert(sale.items.map((item) => ({
                  company_id: companyId,
                  sale_id: storedSale.id,
                  product_name: item.product,
                  department: item.dept || null,
                  qty: item.qty,
                  unit_price: item.unitPrice,
                  total: item.total,
                })))
                if (itemError) throw itemError
              }
            }
          }

          if (normalizedUpdates.purchases) {
            const purchases = normalizedUpdates.purchases as Purchase[]
            for (const purchase of purchases) {
              let { data: supplier } = await supabase.from('contacts').select('id').eq('company_id', companyId).eq('type', 'supplier').eq('name', purchase.supplier).maybeSingle()
              if (!supplier) {
                const result = await supabase.from('contacts').insert({ company_id: companyId, type: 'supplier', name: purchase.supplier }).select('id').single()
                if (result.error) throw result.error
                supplier = result.data
              }
              const purchaseReference = businessReference(purchase)
              const { data: storedPurchase, error: purchaseError } = await supabase.from('purchases').upsert({
                company_id: companyId,
                reference: purchaseReference,
                purchase_date: purchase.date,
                supplier_id: supplier.id,
                branch: purchase.branch || null,
                invoice_number: purchase.invoiceNumber || null,
                purchase_order: purchase.purchaseOrder || null,
                payment_method: purchase.paymentMethod || purchase.bank || 'Cash',
                payment_status: purchase.paymentStatus || 'PAID',
                status: purchase.status || 'Completed',
                notes: purchase.notes || null,
                subtotal: purchase.qty * purchase.unitPrice,
                discount: purchase.discount || 0,
                tax: purchase.items?.[0]?.tax || 0,
                shipping: purchase.transCost || 0,
                total: purchase.total || 0,
                amount_paid: purchase.amountPaid ?? 0,
                balance: purchase.balance ?? 0,
                due_date: purchase.dueDate || null,
                deleted_at: (purchase as any).deletedAt || null,
                purge_after: (purchase as any).purgeAfter || null,
              }, { onConflict: 'reference' }).select('id').single()
              if (purchaseError) throw purchaseError
              const { error: deletePurchaseItemsError } = await supabase.from('purchase_items').delete().eq('purchase_id', storedPurchase.id)
              if (deletePurchaseItemsError) throw deletePurchaseItemsError
              const purchaseItems = (purchase.items?.length ? purchase.items : [{ product: purchase.product, qty: purchase.qty, unitPrice: purchase.unitPrice, discount: purchase.discount || 0, tax: purchase.items?.[0]?.tax || 0, total: purchase.total || 0 }]).filter((item) => item.product)
              if (purchaseItems.length > 0) {
                const { error: purchaseItemError } = await supabase.from('purchase_items').insert(purchaseItems.map((item) => ({
                  company_id: companyId,
                  purchase_id: storedPurchase.id,
                  product_name: item.product,
                  qty: item.qty,
                  unit_price: item.unitPrice,
                  discount: item.discount || 0,
                  tax: item.tax || 0,
                  total: item.total || 0,
                })))
                if (purchaseItemError) throw purchaseItemError
              }
              const outstanding = Number(purchase.balance ?? Math.max(0, Number(purchase.total || 0) - Number(purchase.amountPaid || 0)))
              if (supplier?.id && purchaseReference && outstanding > 0) {
                const { error: payableError } = await supabase.from('payables').upsert({
                  company_id: companyId,
                  contact_id: supplier.id,
                  reference: purchaseReference,
                  due_date: purchase.dueDate || purchase.date || new Date().toISOString().slice(0, 10),
                  original_amount: Number(purchase.total || 0),
                  outstanding_amount: outstanding,
                  status: 'open',
                }, { onConflict: 'reference' })
                if (payableError) console.error('Unable to sync purchase payable', payableError)
              } else if (purchaseReference) {
                const { error: payableError } = await supabase.from('payables').update({ outstanding_amount: 0, status: 'paid', updated_at: new Date().toISOString() }).eq('company_id', companyId).eq('reference', purchaseReference)
                if (payableError) console.error('Unable to clear purchase payable', payableError)
              }
            }
          }

          if (normalizedUpdates.inventory) {
            const inventoryRows = (normalizedUpdates.inventory as InventoryItem[]).map((item) => ({
              company_id: companyId,
              sku: item.sku,
              name: item.product,
              description: item.description || null,
              category: item.dept || 'General',
              unit_cost: item.unitCost || 0,
              average_cost: item.averageCost ?? item.unitCost ?? 0,
              unit_price: item.sellingPrice ?? item.unitCost ?? 0,
              stock_qty: item.closing || 0,
              reserved_qty: item.reserved || 0,
              expiry_date: item.expiryDate || null,
              damaged_expired: item.damagedExpired || 0,
              reorder_level: item.reorderLevel || 0,
              reorder_quantity: item.reorderQuantity || 0,
              maximum_stock_level: item.maximumStockLevel || 0,
              branch: item.branch || null,
              deleted_at: (item as any).deletedAt || null,
              purge_after: (item as any).purgeAfter || null,
              updated_at: new Date().toISOString(),
            }))
            const { error: inventoryPersistErr } = await supabase.from('products').upsert(inventoryRows, { onConflict: 'sku' })
            if (inventoryPersistErr) throw inventoryPersistErr
          }

          if (normalizedUpdates.expenses) {
            const { data: accounts } = await supabase.from('bank_accounts').select('id,name').eq('company_id', companyId)
            const accountIds: Record<string, string> = {}
              ; (accounts || []).forEach((account: any) => { accountIds[account.name] = account.id })
            const expenseRows = (normalizedUpdates.expenses as Expense[]).map((expense) => ({
              company_id: companyId,
              reference: businessReference(expense),
              expense_date: expense.date,
              description: expense.desc,
              category: expense.category,
              amount: expense.amount,
              bank_account_id: accountIds[expense.bank] || null,
              status: expense.status,
              notes: expense.notes || null,
              deleted_at: (expense as any).deletedAt || null,
              purge_after: (expense as any).purgeAfter || null,
            }))
            const { error: expensesPersistErr } = await supabase.from('expenses').upsert(expenseRows, { onConflict: 'reference' })
            if (expensesPersistErr) throw expensesPersistErr
            const expenseReferences = expenseRows.map((row) => row.reference).filter(Boolean)
            const postedKeys = new Set<string>()
            if (expenseReferences.length > 0) {
              const [{ data: bySource }, { data: byReference }] = await Promise.all([
                supabase.from('journal_entries').select('source_id,reference').eq('company_id', companyId).in('source_id', expenseReferences),
                supabase.from('journal_entries').select('source_id,reference').eq('company_id', companyId).in('reference', expenseReferences),
              ])
              for (const row of [...(bySource || []), ...(byReference || [])]) {
                if (row.source_id) postedKeys.add(row.source_id)
                if (row.reference) postedKeys.add(row.reference)
              }
            }
            for (const expense of normalizedUpdates.expenses as Expense[]) {
              if (!shouldPostExpenseCash(expense, postedKeys)) continue
              const reference = businessReference(expense)
              const { error: postingError } = await supabase.rpc('post_accounting_cash_movement', {
                p_company_id: companyId,
                p_source_module: 'EXPENSE_PAYMENT',
                p_source_id: reference,
                p_reference: reference,
                p_entry_date: expense.date,
                p_description: expense.desc,
                p_amount: expense.amount,
                p_bank_account_name: expense.bank || null,
                p_offset_account_name: 'Expense Account',
                p_direction: 'withdrawal',
              })
              if (postingError) console.error('Unable to post expense journal', postingError)
              else postedKeys.add(reference)
            }
          }

          if (normalizedUpdates.loans) {
            const loanRows = (normalizedUpdates.loans as any[]).map((loan) => ({
              company_id: companyId,
              reference: loan.id,
              lender: loan.lender || 'Unknown lender',
              amount: Number(loan.originalAmount ?? loan.amount ?? 0),
              interest_rate: Number(loan.interestRate ?? loan.interest_rate ?? 0),
              term_months: Number(loan.periodMonths ?? loan.term_months ?? loan.term ?? 0),
              start_date: loan.startDate || new Date().toISOString().slice(0, 10),
              maturity_date: loan.endDate || loan.maturity_date || new Date().toISOString().slice(0, 10),
              balance: Number(loan.balance ?? loan.amount ?? 0),
              status: String(loan.status || 'Active').toLowerCase(),
              payment_schedule: JSON.stringify(loan.paymentSchedule || []),
              updated_at: new Date().toISOString(),
            }))
            const { error: loansPersistErr } = await supabase.from('loans').upsert(loanRows, { onConflict: 'company_id,reference' })
            if (loansPersistErr) throw loansPersistErr
          }

          if (normalizedUpdates.loanRepayments) {
            const repaymentRows = (normalizedUpdates.loanRepayments as any[]).map((repayment) => ({
              id: repayment.id || undefined,
              company_id: companyId,
              loan_reference: repayment.loanId,
              bank_account_id: repayment.accountId || null,
              amount: Number(repayment.amount || 0),
              payment_method: repayment.paymentMethod || 'Bank Transfer',
              repayment_date: repayment.date || new Date().toISOString().slice(0, 10),
              note: repayment.note || null,
            }))
            const { error: repaymentsPersistErr } = await supabase.from('loan_repayments').upsert(repaymentRows, { onConflict: 'id' })
            if (repaymentsPersistErr && repaymentsPersistErr.code !== 'PGRST205') throw repaymentsPersistErr
          }

          if (normalizedUpdates.expenseCategories) {
            const categoryRows = Array.from(new Set([...(normalizedUpdates.expenseCategories as string[]), ...EXP_CATS]))
              .map((name) => ({ company_id: companyId, name, updated_at: new Date().toISOString() }))
            const { error: categoriesPersistErr } = await supabase.from('expense_categories').upsert(categoryRows, { onConflict: 'company_id,name' })
            if (categoriesPersistErr && categoriesPersistErr.code !== 'PGRST205') throw categoriesPersistErr
          }

          if (normalizedUpdates.chartOfAccounts) {
            const accountRows = (normalizedUpdates.chartOfAccounts as LedgerAccount[]).filter((account) => isUuid(account.id)).map((account) => ({
              id: account.id,
              company_id: companyId,
              code: account.code,
              name: account.name,
              account_type: account.accountType,
              account_subtype: account.accountSubType || null,
              normal_balance: account.normalBalance,
              is_control_account: account.isControlAccount || false,
              is_active: account.isActive !== false,
              currency: account.currency || 'NGN',
              opening_balance: account.openingBalance || 0,
              opening_balance_date: account.openingBalanceDate || null,
              updated_at: new Date().toISOString(),
            }))
            if (accountRows.length > 0) {
              const { error: accountsPersistErr } = await supabase.from('chart_of_accounts').upsert(accountRows, { onConflict: 'id' })
              if (accountsPersistErr) throw accountsPersistErr
            }
          }

          if (normalizedUpdates.journalEntries || normalizedUpdates.journalLines) {
            const journalIds = newState.journalEntries.map((entry) => entry.id).filter((id) => isUuid(id))
            const { data: existingJournals } = journalIds.length > 0
              ? await supabase.from('journal_entries').select('id').eq('company_id', companyId).in('id', journalIds)
              : { data: [] }
            const pendingJournals = selectUnpostedJournals(newState.journalEntries, newState.journalLines, (existingJournals || []).map((row: { id: string }) => row.id))
            if (pendingJournals.entries.length > 0) {
              const entryRows = pendingJournals.entries.map((entry) => ({
                id: entry.id,
                company_id: companyId,
                entry_date: entry.entryDate,
                period_id: isUuid(entry.periodId) ? entry.periodId : null,
                reference: entry.reference || null,
                description: entry.description || null,
                source_module: entry.sourceModule || 'MANUAL',
                source_id: entry.sourceId || null,
                status: 'DRAFT',
                created_by: isUuid(entry.createdBy) ? entry.createdBy : null,
                updated_at: new Date().toISOString(),
              }))
              const { error: entriesPersistErr } = await supabase.from('journal_entries').insert(entryRows)
              if (entriesPersistErr) throw entriesPersistErr
              const lineRows = pendingJournals.lines.map((line) => ({
                id: line.id,
                company_id: companyId,
                entry_id: line.entryId,
                account_id: line.accountId,
                debit: line.debit || 0,
                credit: line.credit || 0,
                description: line.description || null,
              }))
              const { error: linesPersistErr } = await supabase.from('journal_lines').insert(lineRows)
              if (linesPersistErr) throw linesPersistErr
              const { error: postErr } = await supabase.from('journal_entries').update({ status: 'POSTED' }).in('id', pendingJournals.entries.map((entry) => entry.id))
              if (postErr) throw postErr
            }
          }

          const postSubledgerCash = async (transactions: any[]) => {
            for (const txn of transactions) {
              const description = String(txn.description || '')
              const isReceipt = description.startsWith('Receivable payment')
              const isSupplierPayment = description.startsWith('Payable payment')
              const reference = businessReference(txn)
              const amount = Math.abs(Number(txn.amount || 0))
              if ((!isReceipt && !isSupplierPayment) || !reference || amount <= 0) continue
              const { error: postingError } = await supabase.rpc('post_accounting_cash_movement', {
                p_company_id: companyId,
                p_source_module: isReceipt ? 'RECEIVABLE_PAYMENT' : 'PAYABLE_PAYMENT',
                p_source_id: reference,
                p_reference: reference,
                p_entry_date: txn.date || new Date().toISOString().slice(0, 10),
                p_description: description,
                p_amount: amount,
                p_bank_account_name: txn.bank || null,
                p_offset_account_name: isReceipt ? 'Receivables' : 'Payables',
                p_direction: isReceipt ? 'deposit' : 'withdrawal',
              })
              if (postingError) console.error('Unable to post subledger cash movement', postingError)
            }
          }

          if (normalizedUpdates.bankTxns) {
            const existingTxnIds = new Set((prev.bankTxns || []).map((txn: { id?: string }) => txn.id))
            await postSubledgerCash((normalizedUpdates.bankTxns as any[]).filter((txn) => txn?.id && !existingTxnIds.has(txn.id)))
          }

          const persistOpenItems = async (table: 'receivables' | 'payables', rows: any[], previousRows: any[], contactType: 'customer' | 'supplier', labelOf: (row: any) => string) => {
            const nextReferences = new Set<string>()
            for (const row of rows) {
              const reference = subledgerReference(row)
              if (!reference) continue
              nextReferences.add(reference)
              const label = labelOf(row)
              let contactId = isUuid(row.contact_id) ? row.contact_id : ''
              if (!contactId && label) {
                let { data: contact } = await supabase.from('contacts').select('id').eq('company_id', companyId).eq('type', contactType).eq('name', label).maybeSingle()
                if (!contact) {
                  const created = await supabase.from('contacts').insert({ company_id: companyId, type: contactType, name: label }).select('id').single()
                  if (created.error) {
                    console.error(`Unable to save ${table} contact`, created.error)
                    continue
                  }
                  contact = created.data
                }
                contactId = contact?.id || ''
              }
              if (!contactId) continue
              const original = Number(row.original_amount ?? row.amount ?? row.total ?? 0)
              const outstanding = Number(row.outstanding_amount ?? row.balance ?? row.balanceDue ?? row.balance_due ?? 0)
              const { error } = await supabase.from(table).upsert({
                company_id: companyId,
                contact_id: contactId,
                reference,
                due_date: isoDate(row.dueDate || row.due || row.invoiceDate) || new Date().toISOString().slice(0, 10),
                original_amount: original,
                outstanding_amount: outstanding,
                status: outstanding <= 0 ? 'paid' : 'open',
              }, { onConflict: 'reference' })
              if (error) console.error(`Unable to save ${table}`, error)
            }
            for (const previous of previousRows) {
              const reference = subledgerReference(previous)
              if (!reference || nextReferences.has(reference)) continue
              const { error } = await supabase.from(table).update({ outstanding_amount: 0, status: 'paid', updated_at: new Date().toISOString() }).eq('company_id', companyId).eq('reference', reference)
              if (error) console.error(`Unable to close ${table}`, error)
            }
          }

          if (normalizedUpdates.receivables) await persistOpenItems('receivables', normalizedUpdates.receivables as any[], prev.receivables || [], 'customer', (row) => row.customer || row.name || '')
          if (normalizedUpdates.payables) await persistOpenItems('payables', normalizedUpdates.payables as any[], prev.payables || [], 'supplier', (row) => row.supplier || row.name || '')

          if (normalizedUpdates.banks && !normalizedUpdates.bankAccounts) {
            const banksArray = Object.entries(normalizedUpdates.banks).map(([name, balance]) => ({ company_id: companyId, name, institution: name, balance, status: 'active', updated_at: new Date().toISOString() }))
            const { error: banksPersistErr } = await supabase.from('bank_accounts').upsert(banksArray, { onConflict: 'company_id,name' })
            if (banksPersistErr) throw banksPersistErr
          }

          if (normalizedUpdates.bankAccounts) {
            const bankRows = (normalizedUpdates.bankAccounts as BankAccount[]).map((account) => ({
              id: account.id,
              company_id: companyId,
              name: account.name,
              institution: account.institution,
              account_number: account.accountNumber || null,
              account_type: account.accountType,
              currency: account.currency,
              branch: account.branch || null,
              opening_balance: account.openingBalance,
              opening_balance_date: account.openingBalanceDate || null,
              balance: account.balance,
              status: account.status.toLowerCase(),
              updated_at: new Date().toISOString(),
            }))
            const { error: bankAccountsPersistErr } = await supabase.from('bank_accounts').upsert(bankRows, { onConflict: 'id' })
            if (bankAccountsPersistErr) throw bankAccountsPersistErr
          }

          if (normalizedUpdates.bankTxns) {
            // Fetch bank accounts to get IDs by name
            const { data: accounts } = await supabase.from('bank_accounts').select('id,name').eq('company_id', companyId)
            const nameToId: Record<string, string> = {}
              ; (accounts || []).forEach((a: any) => { nameToId[a.name] = a.id })

            const txnsToInsert = (normalizedUpdates.bankTxns as any[]).filter((t: any) => String(t.id || '').startsWith('TXN-')).map((t: any) => ({
              company_id: companyId,
              bank_account_id: nameToId[t.bank] ?? null,
              txn_date: t.date ?? new Date().toISOString().slice(0, 10),
              description: t.description ?? t.name ?? '',
              amount: t.amount ?? 0,
              is_reconciled: t.status === 'Completed',
            })).filter((x) => x.bank_account_id)
            const { data: existingTxns } = await supabase.from('bank_transactions').select('bank_account_id,txn_date,description,amount').eq('company_id', companyId)
            const existingTxnKeys = new Set((existingTxns || []).map((txn: any) => bankTxnKey(txn.bank_account_id, txn.txn_date, txn.description, txn.amount)))
            const freshTxns = txnsToInsert.filter((txn) => {
              const key = bankTxnKey(txn.bank_account_id, txn.txn_date, txn.description, txn.amount)
              if (existingTxnKeys.has(key)) return false
              existingTxnKeys.add(key)
              return true
            })

            if (freshTxns.length > 0) {
              await supabase.from('bank_transactions').insert(freshTxns)
            }
          }
        } catch (err) {
          console.error('Error persisting accounting updates to Supabase', err instanceof Error ? err.message : JSON.stringify(err))
        }
      })()

      return newState
    })
  }

  const deleteInventoryItems = async (skus: string[]) => {
    const uniqueSkus = Array.from(new Set(skus.filter(Boolean)))
    if (uniqueSkus.length === 0) return

    const purgeAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    if (supabase && user?.companyId) {
      const { error } = await supabase
        .from('products')
        .update({ deleted_at: new Date().toISOString(), purge_after: purgeAfter, status: 'inactive', updated_at: new Date().toISOString() })
        .eq('company_id', user.companyId)
        .in('sku', uniqueSkus)
      if (error) throw error
    }

    const deleted = new Set(uniqueSkus)
    updateState({ inventory: state.inventory.filter((item) => !deleted.has(item.sku || '')) })
  }

  const login = (userData: User, remember: boolean) => {
    const enriched = enrichStoredUser(userData)
    setUser(enriched)
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true')
    localStorage.setItem(LOGIN_NOTIFICATION_KEY, `${Date.now()}-${Math.random().toString(36).slice(2)}`)
    localStorage.removeItem(AUTH_KEY)
    sessionStorage.removeItem(AUTH_KEY)

    const storage = remember ? localStorage : sessionStorage
    storage.setItem(AUTH_KEY, JSON.stringify(enriched))
    if (supabase && enriched.companyId) {
      void supabase.from('audit_logs').insert({
        company_id: enriched.companyId,
        action: 'LOGIN',
        entity: 'AUTHENTICATION',
        module: 'Authentication',
        event_type: 'LOGIN',
        reference: enriched.staffId || enriched.username || enriched.name,
        details: `${enriched.name} signed in successfully.`,
        status: 'SUCCESS',
        metadata: { user_name: enriched.name, staff_id: enriched.staffId || null },
        event_time: new Date().toISOString(),
      })
    }
  }

  const activateSubscription = (subscription: Pick<User, 'subscriptionPlan' | 'subscriptionStatus' | 'trialEndsAt'>) => {
    setUser((current) => {
      if (!current) return current
      const next = {
        ...current,
        subscriptionPlan: subscription.subscriptionPlan,
        subscriptionStatus: subscription.subscriptionStatus,
        trialEndsAt: subscription.subscriptionStatus === 'active' ? undefined : subscription.trialEndsAt,
      }
      const stored = localStorage.getItem(AUTH_KEY)
      const storage = stored ? localStorage : sessionStorage
      if (stored || sessionStorage.getItem(AUTH_KEY)) storage.setItem(AUTH_KEY, JSON.stringify(next))
      return next
    })
  }

  const logout = () => {
    if (supabase && user?.companyId) {
      void supabase.from('audit_logs').insert({
        company_id: user.companyId,
        action: 'LOGOUT',
        entity: 'AUTHENTICATION',
        module: 'Authentication',
        event_type: 'LOGOUT',
        reference: user.staffId || user.username || user.name,
        details: `${user.name} signed out.`,
        status: 'SUCCESS',
        metadata: { user_name: user.name, staff_id: user.staffId || null },
        event_time: new Date().toISOString(),
      })
    }
    setUser(null)
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true')
    localStorage.removeItem(AUTH_KEY)
    sessionStorage.removeItem(AUTH_KEY)
    window.location.href = '/'
  }

  useEffect(() => {
    if (!user) return

    let timeoutId: ReturnType<typeof setTimeout>
    const resetInactivityTimer = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(logout, INACTIVITY_TIMEOUT_MS)
    }
    const activityEvents: Array<keyof WindowEventMap> = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll']

    activityEvents.forEach((eventName) => window.addEventListener(eventName, resetInactivityTimer, { passive: true }))
    resetInactivityTimer()

    return () => {
      clearTimeout(timeoutId)
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, resetInactivityTimer))
    }
  }, [user])

  const resetCompanyBooks = () => {
    remoteLoadToken.current += 1
    updateState(wipedCompanyBooks(state))
  }

  const addAuditLog = (action: string, type: string, reference: string, details: string) => {
    const timestamp = new Date().toISOString()
    const module = type.split('_')[0].toUpperCase()
    const log: AuditLog = {
      id: `AUD-${timestamp}`,
      timestamp,
      action,
      type,
      reference,
      details,
      user: user?.name || 'System',
      module,
      status: 'SUCCESS',
    }
    updateState({
      auditLogs: [log, ...state.auditLogs].slice(0, 1000),
    }, { persist: false })

    if (supabase && user?.companyId) {
      void (async () => {
        const actorQuery = supabase.from('users').select('id').eq('company_id', user.companyId).limit(1)
        const { data: actorRows } = user.staffId
          ? await actorQuery.eq('staff_id', user.staffId)
          : await actorQuery.eq('username', user.username || user.name)
        const { error } = await supabase.from('audit_logs').insert({
          company_id: user.companyId,
          user_id: actorRows?.[0]?.id || null,
          action,
          entity: type,
          module,
          event_type: action,
          reference,
          details,
          status: 'SUCCESS',
          metadata: { user_name: user.name, staff_id: user.staffId || null },
          event_time: timestamp,
          retention_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
        if (error) console.error('Unable to persist audit event', error)
      })()
    }
  }

  const value: AccountingContextType = {
    user,
    subscriptionLoaded,
    state,
    updateState,
    resetCompanyBooks,
    deleteInventoryItems,
    login,
    logout,
    addAuditLog,
    activateSubscription,
  }

  if (isLoading) {
    return <WorkspaceLoader phase="session" />
  }

  return (
    <AccountingContext.Provider value={value}>
      {children}
    </AccountingContext.Provider>
  )
}

export function useAccounting() {
  const context = useContext(AccountingContext)
  if (!context) {
    throw new Error('useAccounting must be used within AccountingProvider')
  }
  return context
}
