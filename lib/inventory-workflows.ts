const METADATA_KEYS = new Set(['__sheet', '__row', 'sheetcategory', 'sheet category'])

function normalizeInventoryKey(key: string): string {
    return key.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function isBlankInventoryRow(original: Record<string, unknown>): boolean {
    const sheetName = String(original.__sheet || original.sheetCategory || '').trim().toLowerCase()
    return Object.entries(original).every(([key, value]) => {
        const normalized = normalizeInventoryKey(key)
        if (!normalized || METADATA_KEYS.has(normalized) || METADATA_KEYS.has(key)) return true
        const text = String(value ?? '').trim()
        if (!text) return true
        return normalized === 'category' && text.toLowerCase() === sheetName
    })
}

export function inventoryNumber(value: unknown, label: string, fallback = 0, scale = 6): number {
    if (value === '' || value === null || value === undefined) return fallback
    const text = String(value).trim().replace(/^(?:NGN|₦|\$)\s*/i, '')
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$|^\.\d+$/.test(text)) throw new Error(`${label}: enter a non-negative number, for example 12.5 or 1,250.75.`)
    const number = Number(text.replaceAll(',', ''))
    if (!Number.isFinite(number) || number < 0) throw new Error(`${label}: invalid number.`)
    return Number(number.toFixed(scale))
}

export function mergeInventoryItems(existing: any[] = [], incoming: any[] = []): any[] {
    const imported = new Map(incoming.map((item) => [String(item.sku || '').toUpperCase(), item]))
    const merged = existing.map((item) => imported.get(String(item.sku || '').toUpperCase()) || item)
    const existingKeys = new Set(existing.map((item) => String(item.sku || '').toUpperCase()))
    merged.push(...incoming.filter((item) => !existingKeys.has(String(item.sku || '').toUpperCase())))
    return merged
}

export function findInventoryIndex(inventory: any[] = [], product: { sku?: unknown; name?: unknown; product?: unknown; item?: unknown } = {}) {
    const sku = String(product.sku || '').trim().toLowerCase()
    const name = String(product.name || product.product || product.item || '').trim().toLowerCase()
    return inventory.findIndex((item) => (sku && String(item.sku || '').toLowerCase() === sku) || (name && String(item.product || '').toLowerCase() === name))
}

export function mergeImportedProductRows(inventory: any[] = [], products: any[] = []) {
    const next = [...inventory]
    for (const product of products) {
        const productIndex = findInventoryIndex(next, product)
        const stockQty = Number(product.stock_qty ?? product.openQty ?? product.closing ?? 0)
        const inventoryProduct = {
            product: String(product.name || product.product || ''),
            sku: String(product.sku || ''),
            description: String(product.description || ''),
            branch: String(product.branch || ''),
            dept: String(product.category || product.dept || 'General'),
            openQty: stockQty,
            purchased: Number(product.purchased || 0),
            sold: Number(product.sold || 0),
            unitCost: Number(product.unit_cost ?? product.unitCost ?? 0),
            sellingPrice: Number(product.unit_price ?? product.sellingPrice ?? 0),
            closing: stockQty,
        }
        if (productIndex >= 0) {
            next[productIndex] = { ...next[productIndex], ...inventoryProduct, sku: next[productIndex].sku || inventoryProduct.sku }
        } else {
            next.push(inventoryProduct)
        }
    }
    return next
}

export function applyTransactionStockMovements(inventory: any[] = [], transactions: any[] = [], movement: 'purchased' | 'sold') {
    const next = [...inventory]
    for (const transaction of transactions) {
        const items = Array.isArray(transaction?.items) && transaction.items.length > 0
            ? transaction.items
            : transaction?.product
                ? [{ product: transaction.product, sku: transaction.sku, qty: transaction.qty }]
                : []
        for (const item of items) {
            const productIndex = findInventoryIndex(next, { name: item.product, sku: item.sku })
            if (productIndex < 0) continue
            const quantity = Math.max(0, Number(item.qty || item.quantity || 0))
            if (!quantity) continue
            const current = next[productIndex]
            const closing = Number(current.closing || 0)
            next[productIndex] = {
                ...current,
                sold: Number(current.sold || 0) + (movement === 'sold' ? quantity : 0),
                purchased: Number(current.purchased || 0) + (movement === 'purchased' ? quantity : 0),
                closing: Math.max(0, closing + (movement === 'purchased' ? quantity : -quantity)),
            }
        }
    }
    return next
}

export function restoreSoldItemsToInventory(inventory: any[] = [], items: Array<{ product?: string; sku?: string; qty?: unknown }> = []) {
    const next = [...inventory]
    for (const item of items) {
        const productIndex = findInventoryIndex(next, item)
        if (productIndex < 0) continue
        const quantity = Math.max(0, Number(item.qty || 0))
        if (!quantity) continue
        const current = next[productIndex]
        next[productIndex] = {
            ...current,
            sold: Math.max(0, Number(current.sold || 0) - quantity),
            closing: Number(current.closing || 0) + quantity,
        }
    }
    return next
}

export function productsToInventory(data: any[] = []): any[] {
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
        openQty: Number(item.opening_qty ?? item.stock_qty ?? 0),
        purchased: Number(item.purchased_qty || 0),
        sold: Number(item.sold_qty || 0),
        lastCountQty: item.last_count_qty, lastCountVariance: item.last_count_variance, lastCountAt: item.last_count_at, lastCountReason: item.last_count_reason,
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

export function prepareInventoryRows(rows: Record<string, unknown>[], existing: any[] = []): any[] {
    const used = new Set(existing.map(item => String(item.sku || '').toUpperCase()))
    const seen = new Set<string>()
    return rows.filter((row) => !isBlankInventoryRow(row)).map((original, index) => {
        const row = Object.fromEntries(Object.entries(original).map(([key, value]) => [normalizeInventoryKey(key), value]))
        const at = `${original.__sheet || 'File'} row ${original.__row || index + 2}`
        const get = (...keys: string[]) => keys.map(key => row[key]).find(value => value !== undefined && value !== null && String(value).trim() !== '')
        const name = String(get('product name', 'product', 'item name', 'item', 'name', 'description') || '').trim()
        if (!name) throw new Error(`${at}: Product Name is required. No rows have been saved.`)
        let sku = String(get('sku', 'product code', 'item code') || '').trim()
        const matches = existing.filter(item => item.product.trim().toLowerCase() === name.toLowerCase())
        if (!sku && matches.length > 1) throw new Error(`${at}: multiple products named ${name}; supply a SKU.`)
        if (!sku && matches.length === 1) sku = matches[0].sku || ''
        if (!sku) {
            const prefix = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'ITEM'
            let n = 1
            while (used.has(`${prefix}-${String(n).padStart(3, '0')}`)) n++
            sku = `${prefix}-${String(n).padStart(3, '0')}`
        }
        const key = sku.toUpperCase()
        if (seen.has(key)) throw new Error(`${at}: duplicate SKU ${sku}. Give each product a unique SKU; no rows have been saved.`)
        seen.add(key); used.add(key)
        const previous = existing.find(item => String(item.sku || '').toUpperCase() === key)
        const num = (keys: string[], fallback = 0, scale = 6) => inventoryNumber(get(...keys), `${at} ${keys[0]}`, fallback, scale)
        const openingInput = get('opening stock qty', 'opening stock', 'opening qty', 'opening quantity', 'openqty', 'open qty', 'opening balance', 'opening')
        const closingInput = get('stock qty', 'stock quantity', 'items in stock', 'march stock count', 'stock balance', 'stock bal', 'closing', 'closing stock', 'quantity', 'qty', 'stock', 'available')
        const purchased = num(['purchased', 'no purchased', 'purchase qty', 'purchased qty'], previous?.purchased || 0)
        const sold = num(['sold', 'sold qty', 'qty sold'], previous?.sold || 0)
        const opening = inventoryNumber(openingInput, `${at} opening stock`, previous?.openQty ?? (closingInput === undefined ? 0 : inventoryNumber(closingInput, `${at} stock`)))
        const closing = inventoryNumber(closingInput, `${at} stock`, openingInput !== undefined ? opening + purchased - sold : previous?.closing ?? opening + purchased - sold)
        if (closing < 0) throw new Error(`${at}: calculated stock cannot be negative.`)
        const unitCost = num(['unit cost', 'unitcost', 'cost price', 'cost'], previous?.unitCost || 0, 2)
        const result: any = {
            ...previous, product: name, sku: previous?.sku || sku,
            dept: String(get('category', 'dept', 'department', 'sheetcategory') || previous?.dept || 'General'),
            openQty: opening, purchased, sold, closing, unitCost,
            sellingPrice: num(['selling price', 'unit selling price', 'sellingprice', 'unit price', 'price'], previous?.sellingPrice ?? unitCost, 2),
            reorderLevel: num(['reorder level', 'reorder'], Number(previous?.reorderLevel || 0)),
            reorderQuantity: num(['reorder quantity'], Number(previous?.reorderQuantity || 0)),
            damagedExpired: num(['damaged expired', 'damagedexpired'], Number(previous?.damagedExpired || 0)),
        }
        for (const [field, aliases] of Object.entries({brand: ['brand'], packSize: ['pack size'], branch: ['branch', 'location', 'warehouse'], description: ['description', 'product description'], supplier: ['supplier']})) {
            const value = get(...aliases)
            if (value !== undefined) result[field] = String(value).trim()
        }
        const expiry = get('expiry date', 'expirydate', 'expiry')
        if (expiry !== undefined) {
            const date = String(expiry).trim()
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error(`${at}: use YYYY-MM-DD for expiry date.`)
            result.expiryDate = date
        }
        return result
    })
}

export function inventoryToRow(item: any, companyId: string) {
    if (!companyId || !item.sku || !item.product?.trim()) throw new Error('Company, SKU and product name are required.')
    return {
        company_id: companyId, sku: item.sku, name: item.product.trim(), category: item.dept || 'General',
        description: item.description || null, branch: item.branch || null, brand: item.brand || null,
        pack_size: item.packSize || null, supplier: item.supplier || null,
        unit_cost: inventoryNumber(item.unitCost, 'Unit cost', 0, 2), unit_price: inventoryNumber(item.sellingPrice ?? item.unitCost, 'Selling price', 0, 2),
        stock_qty: inventoryNumber(item.closing, 'Stock'), opening_qty: inventoryNumber(item.openQty, 'Opening stock'),
        purchased_qty: inventoryNumber(item.purchased, 'Purchased'), sold_qty: inventoryNumber(item.sold, 'Sold'),
        damaged_expired: inventoryNumber(item.damagedExpired, 'Damaged stock'),
        reorder_level: inventoryNumber(item.reorderLevel, 'Reorder level'), reorder_quantity: inventoryNumber(item.reorderQuantity, 'Reorder quantity'),
        reserved_qty: inventoryNumber(item.reserved, 'Reserved stock'), maximum_stock_level: inventoryNumber(item.maximumStockLevel, 'Maximum stock'),
        expiry_date: item.expiryDate || null, updated_at: new Date().toISOString(),
        ...(item.active === false ? { status: 'inactive' } : {}),
        ...(item.deletedAt ? { deleted_at: item.deletedAt } : {}),
    }
}

function missingSchemaColumn(error: unknown, values: Record<string, unknown>): string | null {
    const message = typeof error === 'object' && error !== null && 'message' in error ? String((error as {message?: unknown}).message || '') : String(error || '')
    const match = message.match(/['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\s+column/i)
        || message.match(/column\s+['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/i)
        || message.match(/Could not find the ['"]([a-zA-Z_][a-zA-Z0-9_]*)['"] column/i)
    const column = match?.[1]
    return column && Object.prototype.hasOwnProperty.call(values, column) ? column : null
}

function isMissingConstraint(error: unknown): boolean {
    const message = typeof error === 'object' && error !== null && 'message' in error ? String((error as {message?: unknown}).message || '') : String(error || '')
    return /no unique or exclusion constraint matching the ON CONFLICT/i.test(message) || (/on conflict/i.test(message) && /constraint/i.test(message))
}

async function upsertProductRows(client: any, rows: Record<string, unknown>[]) {
    const compatibleRows = rows.map((row) => ({ ...row }))
    let onConflict = 'company_id,sku'
    for (let attempt = 0; attempt < 24; attempt += 1) {
        const {error} = await client.from('products').upsert(compatibleRows, {onConflict})
        if (!error) return
        const unsupportedColumn = compatibleRows.reduce<string | null>((column, row) => column || missingSchemaColumn(error, row), null)
        if (unsupportedColumn && unsupportedColumn !== 'sku' && unsupportedColumn !== 'name') {
            compatibleRows.forEach((row) => delete row[unsupportedColumn])
            continue
        }
        if (onConflict === 'company_id,sku' && isMissingConstraint(error)) {
            onConflict = 'sku'
            continue
        }
        throw new Error(`Inventory was not confirmed saved: ${error.message}`)
    }
    throw new Error('Inventory was not confirmed saved: the products table is missing required columns.')
}

export async function loadAllInventory(client: any, companyId: string) {
    const rows: any[] = []
    let filterDeleted = true
    for (;;) {
        let query = client.from('products').select('*').eq('company_id', companyId)
        if (filterDeleted) query = query.is('deleted_at', null)
        const {data, error} = await query.order('id').range(rows.length, rows.length + 499)
        if (error) {
            if (filterDeleted && /deleted_at/.test(String(error.message || ''))) {
                filterDeleted = false
                continue
            }
            return {data: null, error}
        }
        if (!data?.length) return {data: rows, error: null}
        rows.push(...data)
    }
}

export async function saveInventoryRows(client: any, companyId: string, items: any[]) {
    if (!client || !companyId) throw new Error('Sign in to a connected company before saving.')
    if (!items.length) throw new Error('There are no inventory rows to save.')
    const rows = items.map(item => inventoryToRow(item, companyId))
    const chunkSize = 500
    for (let start = 0; start < rows.length; start += chunkSize) {
        await upsertProductRows(client, rows.slice(start, start + chunkSize))
    }
}
