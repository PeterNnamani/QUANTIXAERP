import * as XLSX from 'xlsx'
import * as mammoth from 'mammoth'
import { makeID, parseNumeric } from './utils'
import { generateSku } from './sku'

export type ImportRecord = Record<string, unknown>

export type GenericImportPayload = {
    sales: Record<string, unknown>[]
    purchases: Record<string, unknown>[]
    expenses: Record<string, unknown>[]
    products: Record<string, unknown>[]
    staff: Record<string, unknown>[]
    contacts: Record<string, unknown>[]
}

export type ImportSummary = {
    sales: number
    purchases: number
    expenses: number
    products: number
    staff: number
    contacts: number
    unknown: number
}

export function normalizeKey(value: string): string {
    return value
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function stringValue(value: unknown): string {
    if (value === null || value === undefined) return ''
    return String(value).trim()
}

export function matchKey(value: unknown): string {
    return stringValue(value).toLowerCase().replace(/\s+/g, ' ')
}

const SHEET_CATEGORY_KEY = 'sheetCategory'

function firstPresent(row: ImportRecord, keys: string[]): unknown {
    for (const key of keys) {
        const value = row[key]
        if (value !== undefined && value !== null && stringValue(value) !== '') return value
    }
    return undefined
}

function normalizeRowKeys(row: ImportRecord): ImportRecord {
    return Object.entries(row).reduce((normalized, [key, value]) => {
        const normalizedKey = normalizeKey(key)
        if (!normalizedKey) return normalized
        normalized[normalizedKey] = value
        return normalized
    }, {} as ImportRecord)
}

export function parseImportDate(value: unknown): string {
    const raw = stringValue(value)
    if (!raw) return new Date().toISOString().slice(0, 10)

    const fallback = new Date().toISOString().slice(0, 10)
    const serial = typeof value === 'number' ? value : /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN
    if (Number.isFinite(serial) && serial > 0) {
        const excelDate = XLSX.SSF.parse_date_code(serial)
        if (excelDate && excelDate.y >= 1000 && excelDate.y <= 9999 && excelDate.m >= 1 && excelDate.m <= 12 && excelDate.d >= 1 && excelDate.d <= 31) {
            return `${excelDate.y}-${String(excelDate.m).padStart(2, '0')}-${String(excelDate.d).padStart(2, '0')}`
        }
    }

    const dateParts = raw.match(/^(\d{4})[-/]([01]?\d)[-/]([0-3]?\d)/)
    if (dateParts) {
        const year = Number(dateParts[1])
        const month = Number(dateParts[2])
        const day = Number(dateParts[3])
        const parsed = new Date(Date.UTC(year, month - 1, day))
        if (year >= 1000 && year <= 9999 && parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day) {
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        }
    }

    const parsed = new Date(raw)
    return Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() < 1000 || parsed.getUTCFullYear() > 9999 ? fallback : parsed.toISOString().slice(0, 10)
}

function columnKeys(row: ImportRecord): string[] {
    return Object.keys(row).filter((key) => key !== SHEET_CATEGORY_KEY).map(normalizeKey)
}

function hasKey(row: ImportRecord, keys: string[]) {
    const normalized = columnKeys(row)
    return keys.some((key) => normalized.some((item) => item.includes(key)))
}

export function classifyImportRow(row: ImportRecord): 'sales' | 'purchases' | 'expenses' | 'inventory' | 'staff' | 'contact' | 'unknown' {
    const normalizedKeys = columnKeys(row)
    const lowerValues = Object.values(row).map((value) => stringValue(value).toLowerCase()).join(' ')

    const staffKeys = ['staff', 'employee id', 'username', 'full name', 'role', 'department', 'position', 'email', 'pin', 'last login']
    const inventoryKeys = ['sku', 'product', 'item', 'name', 'description', 'stock', 'quantity', 'qty sold', 'selling price', 'unit price', 'sales revenue', 'profit', 'cogs', 'unit cost', 'cost price', 'branch', 'reorder', 'department', 'category', 'closing', 'opening', 'available', 'purchased', 'total']
    const saleKeys = ['sale date', 'sale_date', 'customer', 'invoice', 'receipt', 'payment method', 'payment status', 'total amount', 'amount paid']
    const purchaseKeys = ['purchase date', 'supplier', 'invoice number', 'purchase order', 'payment status', 'total', 'amount paid', 'balance']
    const expenseKeys = ['expense date', 'expense', 'expense number', 'expense category', 'payee', 'vendor', 'amount', 'expense account']
    const contactKeys = ['type', 'name', 'email', 'phone', 'address', 'credit limit', 'opening balance']

    const makeScore = (keywords: string[]) =>
        normalizedKeys.reduce((score, key) => score + (keywords.some((token) => key.includes(token)) ? 2 : 0), 0)

    const staffScore = makeScore(staffKeys) + (lowerValues.includes('staff') ? 1 : 0)
    const inventoryScore = makeScore(inventoryKeys) + (lowerValues.includes('stock') || lowerValues.includes('inventory') ? 2 : 0)
    const saleScore = makeScore(saleKeys) + (lowerValues.includes('sale') ? 1 : 0)
    const purchaseScore = makeScore(purchaseKeys) + (lowerValues.includes('purchase') ? 1 : 0)
    const expenseScore = makeScore(expenseKeys) + (lowerValues.includes('expense') ? 2 : 0)
    const contactScore = makeScore(contactKeys) + (lowerValues.includes('customer') || lowerValues.includes('supplier') || lowerValues.includes('vendor') ? 1 : 0)

    const isPurchaseRegister = hasKey(row, ['purchase id']) || (hasKey(row, ['supplier']) && hasKey(row, ['invoice']) && hasKey(row, ['total']))
    const isExpenseRegister = hasKey(row, ['expense', 'expense number', 'expense date']) && hasKey(row, ['amount', 'total'])

    if (isPurchaseRegister) return 'purchases'
    if (isExpenseRegister) return 'expenses'

    const scores = {
        staff: staffScore,
        inventory: inventoryScore,
        sales: saleScore,
        purchases: purchaseScore,
        expenses: expenseScore,
        contact: contactScore,
    }

    const hasSaleIdentity = hasKey(row, ['sale date', 'invoice', 'receipt', 'payment method', 'payment status', 'total amount'])
    if (hasSaleIdentity && saleScore >= 2) {
        return 'sales'
    }

    const hasStaffIdentity = hasKey(row, ['staff id', 'employee id', 'username', 'pin', 'role', 'last login'])
    if (hasStaffIdentity && !hasKey(row, ['sku', 'product', 'item']) && staffScore >= 4) {
        return 'staff'
    }

    const winner = (Object.keys(scores) as Array<keyof typeof scores>).reduce((best, current) =>
        scores[current] > scores[best] ? current : best,
        'contact' as keyof typeof scores
    )

    if (scores[winner] < 3) {
        return 'unknown'
    }

    if (winner === 'contact' && !hasKey(row, contactKeys)) {
        if (hasKey(row, saleKeys)) return 'sales'
        if (hasKey(row, purchaseKeys)) return 'purchases'
        if (hasKey(row, inventoryKeys)) return 'inventory'
        if (hasKey(row, staffKeys)) return 'staff'
    }

    return winner
}

const EXPENSE_STATUSES = ['Pending Approval', 'Approved', 'Scheduled', 'Overdue', 'Rejected']

function normalizeExpenseRow(row: ImportRecord) {
    const reference = stringValue(row['reference'] || row['expense number'] || row['expense no'] || row['expense'] || row['number'] || makeID('EXP'))
    const description = stringValue(row['description'] || row['expense description'] || row['expense'] || row['details'] || row['name']) || 'Imported expense'
    const category = stringValue(row['category'] || row['expense category'] || row['expense account'] || 'General') || 'General'
    const amount = Math.max(0, parseNumeric(row['amount'] || row['total'] || row['expense amount'] || row['value'] || 0))
    const rawStatus = matchKey(row['status'] || row['payment status'])
    const status = rawStatus === 'paid' ? 'ACTIVE' : EXPENSE_STATUSES.find((option) => option.toLowerCase() === rawStatus) || 'Pending Approval'
    const vendor = stringValue(row['vendor'] || row['payee'] || row['supplier'] || '')
    const department = stringValue(row['department'] || row['dept'] || '')
    const payment = stringValue(row['payment method'] || row['payment'] || row['method'] || '')
    const account = stringValue(row['account'] || row['payment account'] || row['bank'] || '')
    const tax = parseNumeric(row['tax'] || row['tax amount'] || 0)
    const notes = [vendor && `Vendor: ${vendor}`, department && `Department: ${department}`, payment && `Payment: ${payment}`, account && `Account: ${account}`, tax ? `Tax: ${tax}` : '', stringValue(row['notes'] || row['memo'] || '')].filter(Boolean).join(' | ')
    return { id: makeID('EXP'), reference, date: parseImportDate(row['expense date'] || row['date'] || row['transaction date']), description, category, amount, status, notes, bank: account }
}

function buildCustomerName(row: ImportRecord): string {
    return stringValue(row['customer'] || row['client'] || row['customer name'] || row['customer_name'] || row['customer_name'] || row['name'])
}

function buildSupplierName(row: ImportRecord): string {
    return stringValue(row['supplier'] || row['vendor'] || row['supplier name'] || row['supplier_name'] || row['vendor name'] || row['name'])
}

function buildProductName(row: ImportRecord): string {
    return stringValue(row['product'] || row['item'] || row['items'] || row['name'] || row['description'] || row['product name'] || row['product_name'])
}

function buildContactType(row: ImportRecord): string {
    const raw = stringValue(row['type'] || row['contact type'] || row['contact_type'] || '').toLowerCase()
    if (raw.includes('supplier')) return 'supplier'
    if (raw.includes('vendor')) return 'vendor'
    return 'customer'
}

export function normalizePaymentStatus(value: unknown): string {
    const status = stringValue(value).toUpperCase().replace(/[\s_-]+/g, ' ')
    if (!status) return 'PAID'
    if (['OUTSTANDING', 'UNPAID', 'ON CREDIT'].includes(status)) return 'CREDIT'
    if (['PART PAID', 'PARTIAL', 'PARTIALLY PAID', 'PART PAYMENT'].includes(status)) return 'PART PAYMENT'
    return status
}

function importedAmountPaid(row: ImportRecord, total: number, paymentStatus: string): number {
    const explicit = firstPresent(row, ['amount paid', 'paid amount', 'paid'])
    if (explicit !== undefined) return Math.max(0, parseNumeric(explicit))
    return paymentStatus === 'PAID' ? total : 0
}

function normalizeSaleRow(row: ImportRecord) {
    const customer = buildCustomerName(row) || 'Walk-in Customer'
    const paymentMethod = stringValue(row['payment method'] || row['payment_method'] || row['method'] || 'Transfer') || 'Transfer'
    const paymentStatus = normalizePaymentStatus(row['payment status'] || row['status'])
    const saleDate = parseImportDate(row['sale date'] || row['sale_date'] || row['date'] || row['transaction date'] || row['transaction_date'])
    const reference = stringValue(row['reference'] || row['invoice number'] || row['invoice_number'] || row['invoice'] || makeID('SL'))
    const notes = stringValue(row['notes'] || row['memo'] || row['description'] || '')
    const branch = stringValue(row['branch'] || row['location'] || 'Head Office') || 'Head Office'
    const salesRep = stringValue(row['sales rep'] || row['sales_rep'] || row['entered by'] || row['entered_by'] || 'Imported') || 'Imported'
    const itemName = buildProductName(row)
    const qty = Math.max(0, parseNumeric(row['quantity'] || row['qty'] || row['units'] || 1))
    const unitPrice = parseNumeric(row['unit price'] || row['unit_price'] || row['price'] || row['amount'] || 0)
    const itemTotal = Math.max(0, parseNumeric(row['total'] || row['line total'] || row['amount'] || qty * unitPrice))
    const subtotal = Math.max(0, parseNumeric(row['subtotal'] || row['amount'] || itemTotal))
    const tax = Math.max(0, parseNumeric(row['tax'] || row['tax amount'] || 0))
    const discount = Math.max(0, parseNumeric(row['discount'] || 0))
    const shipping = Math.max(0, parseNumeric(row['shipping'] || row['shipping amount'] || 0))
    const totalAmount = Math.max(0, parseNumeric(row['total amount'] || row['total_amount'] || row['total'] || subtotal))
    const amountPaid = importedAmountPaid(row, totalAmount, paymentStatus)
    const balance = Math.max(0, parseNumeric(firstPresent(row, ['balance', 'balance amount']) ?? totalAmount - amountPaid))

    return {
        id: makeID('SL'),
        reference,
        date: saleDate,
        customer,
        paymentMethod,
        paymentStatus,
        subtotal,
        tax,
        discount,
        shipping,
        totalAmount,
        amountPaid,
        balance,
        notes,
        status: paymentStatus === 'PAID' ? 'Completed' : 'Pending',
        branch,
        sales_rep: salesRep,
        enteredBy: salesRep,
        items: [
            {
                product: itemName || 'Item',
                dept: stringValue(row['category'] || row['dept'] || row['department'] || 'General'),
                qty,
                unitPrice,
                total: itemTotal,
            },
        ],
    }
}

function normalizePurchaseRow(row: ImportRecord) {
    const supplier = buildSupplierName(row) || 'Unknown Supplier'
    const purchaseDate = parseImportDate(row['purchase date'] || row['purchase_date'] || row['date'] || row['transaction date'] || row['transaction_date'])
    const reference = stringValue(row['reference'] || row['purchase id'] || row['purchase_id'] || row['invoice number'] || row['invoice_number'] || row['invoice'] || makeID('PUR'))
    const invoiceNumber = stringValue(row['invoice number'] || row['invoice_number'] || row['invoice'] || '')
    const purchaseOrder = stringValue(row['purchase order'] || row['purchase_order'] || '')
    const paymentMethod = stringValue(row['payment method'] || row['payment'] || row['payment_method'] || row['method'] || 'Cash') || 'Cash'
    const paymentStatus = normalizePaymentStatus(row['payment status'] || row['status'])
    const notes = stringValue(row['notes'] || row['memo'] || row['description'] || '')
    const branch = stringValue(row['branch'] || row['location'] || 'Head Office') || 'Head Office'
    const itemName = stringValue(row['product'] || row['item'] || row['description'] || row['product name'] || row['product_name'])
    const qty = Math.max(0, parseNumeric(row['quantity'] || row['qty'] || row['units'] || row['items'] || 1))
    const unitPrice = parseNumeric(row['unit price'] || row['unit_price'] || row['price'] || 0)
    const subtotal = Math.max(0, parseNumeric(row['subtotal'] || row['amount'] || qty * unitPrice))
    const tax = Math.max(0, parseNumeric(row['tax'] || row['tax amount'] || 0))
    const discount = Math.max(0, parseNumeric(row['discount'] || 0))
    const shipping = Math.max(0, parseNumeric(row['shipping'] || row['shipping amount'] || 0))
    const total = Math.max(0, parseNumeric(row['total'] || subtotal))
    const amountPaid = importedAmountPaid(row, total, paymentStatus)
    const balance = Math.max(0, parseNumeric(firstPresent(row, ['balance', 'balance amount']) ?? total - amountPaid))

    return {
        id: makeID('PUR'),
        reference,
        purchase_date: purchaseDate,
        date: purchaseDate,
        supplier,
        invoiceNumber,
        purchaseOrder,
        paymentMethod,
        paymentStatus,
        status: paymentStatus === 'PAID' ? 'Completed' : 'Pending',
        notes,
        subtotal,
        tax,
        discount,
        shipping,
        total,
        amountPaid,
        balance,
        branch,
        category: stringValue(row['category'] || row['dept'] || row['department'] || 'Inventory'),
        payment_method: paymentMethod,
        items: [
            {
                product: itemName || 'Imported Item',
                qty,
                unitPrice,
                discount,
                tax,
                total: Math.max(0, parseNumeric(row['line total'] || row['item total'] || 0) || qty * unitPrice - discount + tax),
            },
        ],
    }
}

const PRODUCT_COLUMNS = {
    category: ['category', 'dept', 'department'],
    stock_qty: ['march stock count', 'items in stock', 'stock qty', 'stock quantity', 'physical stock', 'current stock', 'stock count', 'stock balance', 'stock', 'closing', 'closing stock', 'quantity', 'qty', 'opening stock qty', 'opening stock', 'book stock'],
    unit_cost: ['unit cost', 'cost price', 'cost'],
    unit_price: ['selling price', 'unit selling price', 'sellingprice', 'unit price', 'price'],
    purchased: ['purchased', 'purchase qty', 'purchased qty', 'no purchased'],
    sold: ['sold', 'sold qty', 'qty sold'],
    description: ['description', 'product description'],
    branch: ['branch', 'location'],
    reorder_level: ['reorder level', 'reorder'],
}

const INVENTORY_FIELDS_BY_PRODUCT_FIELD: Record<string, string[]> = {
    category: ['dept'],
    stock_qty: ['openQty', 'closing'],
    unit_cost: ['unitCost'],
    unit_price: ['sellingPrice'],
    purchased: ['purchased'],
    sold: ['sold'],
    description: ['description'],
    branch: ['branch'],
    reorder_level: ['reorderLevel'],
}

export function mergeImportedInventoryItem<T extends { product: string; sku?: string }>(existing: T, imported: Partial<T>, product: { providedFields?: unknown }): T {
    const provided = Array.isArray(product.providedFields) ? product.providedFields.map(String) : Object.keys(INVENTORY_FIELDS_BY_PRODUCT_FIELD)
    const updates = Object.fromEntries(provided.flatMap((field) => INVENTORY_FIELDS_BY_PRODUCT_FIELD[field] || []).filter((key) => key in imported).map((key) => [key, imported[key as keyof T]]))
    return { ...existing, ...updates, sku: existing.sku || imported.sku }
}

function normalizeProductRow(row: ImportRecord, existingSkus: string[]) {
    const name = buildProductName(row) || 'Unnamed Product'
    const explicitSku = stringValue(row['sku'] || row['product code'] || row['item code'] || '')
    let sku = explicitSku || generateSku(name, existingSkus)
    if (!sku || sku === 'UNNAMED-PRODUCT') {
        sku = makeID('SKU')
    }
    const rawCategory = firstPresent(row, PRODUCT_COLUMNS.category)
    const category = stringValue(rawCategory ?? row[SHEET_CATEGORY_KEY]) || 'General'
    const stockQty = Math.max(0, parseNumeric(firstPresent(row, PRODUCT_COLUMNS.stock_qty) ?? 0))
    const unitCost = Math.max(0, parseNumeric(firstPresent(row, PRODUCT_COLUMNS.unit_cost) ?? 0))
    const unitPrice = Math.max(0, parseNumeric(firstPresent(row, PRODUCT_COLUMNS.unit_price) ?? 0))
    const purchased = Math.max(0, parseNumeric(firstPresent(row, PRODUCT_COLUMNS.purchased) ?? 0))
    const sold = Math.max(0, parseNumeric(firstPresent(row, PRODUCT_COLUMNS.sold) ?? 0))
    const description = stringValue(firstPresent(row, PRODUCT_COLUMNS.description))
    const branch = stringValue(firstPresent(row, PRODUCT_COLUMNS.branch))
    const reorderLevel = Math.max(0, parseNumeric(firstPresent(row, PRODUCT_COLUMNS.reorder_level) ?? 0))
    const providedFields = (Object.keys(PRODUCT_COLUMNS) as Array<keyof typeof PRODUCT_COLUMNS>).filter((field) => PRODUCT_COLUMNS[field].some((column) => column in row))

    return {
        id: makeID('PRD'),
        sku,
        skuGenerated: !explicitSku,
        providedFields,
        name,
        description,
        category,
        unit_cost: unitCost,
        unit_price: unitPrice,
        stock_qty: stockQty,
        branch,
        reorder_level: reorderLevel,
        product: name,
        dept: category,
        openQty: stockQty,
        purchased,
        sold,
        unitCost,
        sellingPrice: unitPrice,
        closing: stockQty,
    }
}

function normalizeStaffStatus(value: unknown): '' | 'active' | 'disabled' {
    const status = matchKey(value)
    if (!status) return ''
    return ['disabled', 'inactive', 'suspended', 'deactivated'].includes(status) ? 'disabled' : 'active'
}

function normalizeStaffRow(row: ImportRecord) {
    const fullName = stringValue(row['full name'] || row['full_name'] || row['staff name'] || row['employee name'] || row['name'] || '')
    const username = stringValue(row['username'] || row['user name'] || row['login'] || '')
    const staffId = stringValue(row['staff id'] || row['employee id'] || row['id'] || '')
    const roleName = stringValue(row['role'] || row['job title'] || row['position'])
    const department = stringValue(row['department'] || row['dept'] || '')
    const position = stringValue(row['position'] || row['job title'] || '')
    const branch = stringValue(row['branch'] || row['office'] || row['location'] || '')
    const email = stringValue(row['email'])
    const phone = stringValue(row['phone'] || row['mobile'] || row['contact'] || '')

    return {
        id: makeID('STF'),
        name: fullName || username || staffId || 'Staff Member',
        staffId,
        username,
        email,
        phone,
        roleId: roleName.toLowerCase().replace(/\s+/g, '-'),
        roleName,
        permissions: ['dashboard'],
        dataScope: 'team',
        status: normalizeStaffStatus(row['status']),
        branch,
        department,
        position,
        employeeId: staffId,
        pin: stringValue(row['pin']),
        createdAt: new Date().toISOString(),
    }
}

function normalizeContactRow(row: ImportRecord) {
    const type = buildContactType(row)
    const name = stringValue(row['name'] || row['full_name'] || row['contact name'] || row['customer'] || row['supplier'] || '')
    return {
        type,
        name: name || 'Unnamed Contact',
        email: stringValue(row['email'] || ''),
        phone: stringValue(row['phone'] || row['mobile'] || ''),
        address: stringValue(row['address'] || row['location'] || ''),
        credit_limit: parseNumeric(row['credit limit'] || row['credit_limit'] || 0),
        opening_balance: parseNumeric(row['opening balance'] || row['opening_balance'] || 0),
        status: matchKey(row['status']) || 'active',
    }
}

const dedupe = <T>(items: T[], keyFn: (item: T) => string) => {
    const seen = new Map<string, T>()
    items.forEach((item) => {
        const key = keyFn(item)
        if (!key) return
        if (!seen.has(key)) {
            seen.set(key, item)
        }
    })
    return Array.from(seen.values())
}

export function mergeUniqueNames(existing: string[], incoming: string[]): string[] {
    const seen = new Set(existing.map(matchKey))
    const merged = [...existing]
    incoming.forEach((name) => {
        const key = matchKey(name)
        if (!key || seen.has(key)) return
        seen.add(key)
        merged.push(stringValue(name))
    })
    return merged
}

type ImportedProductRef = { sku?: unknown; skuGenerated?: unknown; name?: unknown; product?: unknown; item?: unknown }

export function findImportedInventoryIndex<T extends { product: string; sku?: string }>(inventory: T[], product: ImportedProductRef): number {
    const sku = product.skuGenerated ? '' : matchKey(product.sku)
    if (sku) {
        const skuIndex = inventory.findIndex((item) => matchKey(item.sku) === sku)
        if (skuIndex >= 0) return skuIndex
    }
    const name = matchKey(product.name || product.product || product.item)
    return name ? inventory.findIndex((item) => matchKey(item.product) === name && (!sku || !matchKey(item.sku))) : -1
}

const STAFF_KEYS_KEPT_ON_MERGE = ['id', 'permissions', 'dataScope', 'createdAt']

export function mergeImportedStaff<T extends { id: string; staffId: string; username?: string; pin?: string; status?: string; roleId?: string; roleName?: string }>(existing: T[], incoming: T[]): T[] {
    const merged = [...existing]
    incoming.forEach((staff) => {
        const staffId = matchKey(staff.staffId)
        const username = matchKey(staff.username)
        const index = merged.findIndex((item) => (staffId && matchKey(item.staffId) === staffId) || (username && matchKey(item.username) === username))
        if (index < 0) {
            merged.push({ ...staff, pin: staff.pin || '0000', status: staff.status || 'active', roleId: staff.roleId || 'staff', roleName: staff.roleName || 'Staff' })
            return
        }
        const provided = Object.fromEntries(Object.entries(staff).filter(([key, value]) => !STAFF_KEYS_KEPT_ON_MERGE.includes(key) && value !== undefined && value !== null && value !== ''))
        const current = merged[index]
        merged[index] = { ...current, ...provided, id: current.id, staffId: current.staffId || staff.staffId }
        if (current.username) merged[index].username = current.username
    })
    return merged
}

export function prepareGenericImportPayload(rows: ImportRecord[]): { payload: GenericImportPayload; summary: ImportSummary } {
    const payload: GenericImportPayload = {
        sales: [],
        purchases: [],
        expenses: [],
        products: [],
        staff: [],
        contacts: [],
    }
    let unknown = 0

    rows.forEach((row) => {
        const category = classifyImportRow(row)

        if (category === 'sales') {
            const sale = normalizeSaleRow(row)
            payload.sales.push(sale)
            if (sale.customer) {
                payload.contacts.push({ type: 'customer', name: sale.customer, email: '', phone: '' })
            }
            return
        }

        if (category === 'purchases') {
            const purchase = normalizePurchaseRow(row)
            payload.purchases.push(purchase)
            if (purchase.supplier) {
                payload.contacts.push({ type: 'supplier', name: purchase.supplier, email: '', phone: '' })
            }
            return
        }

        if (category === 'expenses') {
            payload.expenses.push(normalizeExpenseRow(row))
            return
        }

        if (category === 'inventory') {
            const product = normalizeProductRow(row, payload.products.map((item) => String(item.sku || '')))
            payload.products.push(product)
            return
        }

        if (category === 'staff') {
            payload.staff.push(normalizeStaffRow(row))
            return
        }

        if (category === 'contact') {
            payload.contacts.push(normalizeContactRow(row))
            return
        }

        if (buildCustomerName(row)) {
            const customer = buildCustomerName(row)
            payload.sales.push(normalizeSaleRow(row))
            payload.contacts.push({ type: 'customer', name: customer, email: '', phone: '' })
            return
        }

        if (buildSupplierName(row)) {
            const supplier = buildSupplierName(row)
            payload.purchases.push(normalizePurchaseRow(row))
            payload.contacts.push({ type: 'supplier', name: supplier, email: '', phone: '' })
            return
        }

        unknown += 1
    })

    payload.sales = dedupe(payload.sales, (item) => matchKey(item.reference || item.id))
    payload.purchases = dedupe(payload.purchases, (item) => matchKey(item.reference || item.id))
    payload.expenses = dedupe(payload.expenses, (item) => matchKey(item.reference || item.id))
    payload.products = dedupe(payload.products, (item) => matchKey(item.skuGenerated ? item.name : item.sku || item.name || item.id))
    payload.staff = dedupe(payload.staff, (item) => matchKey(item.username || item.staffId || item.id))
    payload.contacts = dedupe(payload.contacts, (item) => `${matchKey(item.type || 'customer')}|${matchKey(item.name)}`)

    const summary: ImportSummary = {
        sales: payload.sales.length,
        purchases: payload.purchases.length,
        expenses: payload.expenses.length,
        products: payload.products.length,
        staff: payload.staff.length,
        contacts: payload.contacts.length,
        unknown,
    }

    return { payload, summary }
}

export async function parseSpreadsheetFile(file: File): Promise<ImportRecord[]> {
    const fileName = file.name.toLowerCase()
    const extension = fileName.split('.').pop() || ''
    if (extension === 'docx') {
        const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
        const lines = result.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        if (lines.length < 2) return []
        const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes('|') ? '|' : ','
        const headers = lines[0].split(delimiter).map((header) => header.trim())
        return lines.slice(1).map((line) => normalizeRowKeys(line.split(delimiter).reduce((row, value, index) => ({ ...row, [headers[index] || `Column ${index + 1}`]: value.trim() }), {} as ImportRecord)))
    }
    let workbook: XLSX.WorkBook

    if (extension === 'csv') {
        const text = await file.text()
        workbook = XLSX.read(text, { type: 'string' })
    } else {
        const buffer = await file.arrayBuffer()
        workbook = XLSX.read(buffer, { type: 'array' })
    }

    const rows: ImportRecord[] = []

    workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName]
        if (!worksheet) return
        const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' })
        if (sheetRows.length > 0) {
            const normalizedSheetName = sheetName.trim()
            rows.push(...sheetRows.map((row) => ({ ...normalizeRowKeys(row), [SHEET_CATEGORY_KEY]: normalizedSheetName })))
        }
    })

    return rows
}

export const parseExcelFile = parseSpreadsheetFile
