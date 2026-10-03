export function inventoryNumber(value: unknown, label: string, fallback = 0): number {
    if (value === '' || value === null || value === undefined) return fallback
    const text = String(value).trim().replace(/^(?:NGN|₦|\$)\s*/i, '')
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$|^\.\d+$/.test(text)) throw new Error(`${label}: enter a non-negative number, for example 12.5 or 1,250.75.`)
    const number = Number(text.replaceAll(',', ''))
    if (!Number.isFinite(number) || number < 0) throw new Error(`${label}: invalid number.`)
    return number
}

export function prepareInventoryRows(rows: Record<string, unknown>[], existing: any[] = []): any[] {
    const used = new Set(existing.map(item => String(item.sku || '').toUpperCase()))
    const seen = new Set<string>()
    return rows.map((original, index) => {
        const row = Object.fromEntries(Object.entries(original).map(([key, value]) => [key.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), value]))
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
        const num = (keys: string[], fallback = 0) => inventoryNumber(get(...keys), `${at} ${keys[0]}`, fallback)
        const openingInput = get('opening stock qty', 'opening stock', 'opening qty', 'opening quantity', 'openqty', 'open qty', 'opening balance', 'opening')
        const closingInput = get('stock qty', 'stock quantity', 'items in stock', 'march stock count', 'stock balance', 'stock bal', 'closing', 'closing stock', 'quantity', 'qty', 'stock', 'available')
        const purchased = num(['purchased', 'no purchased', 'purchase qty', 'purchased qty'], previous?.purchased || 0)
        const sold = num(['sold', 'sold qty', 'qty sold'], previous?.sold || 0)
        const opening = inventoryNumber(openingInput, `${at} opening stock`, previous?.openQty ?? (closingInput === undefined ? 0 : inventoryNumber(closingInput, `${at} stock`)))
        const closing = inventoryNumber(closingInput, `${at} stock`, openingInput !== undefined ? opening + purchased - sold : previous?.closing ?? opening + purchased - sold)
        if (closing < 0) throw new Error(`${at}: calculated stock cannot be negative.`)
        const unitCost = num(['unit cost', 'unitcost', 'cost price', 'cost'], previous?.unitCost || 0)
        const result: any = {
            ...previous, product: name, sku: previous?.sku || sku,
            dept: String(get('category', 'dept', 'department', 'sheetcategory') || previous?.dept || 'General'),
            openQty: opening, purchased, sold, closing, unitCost,
            sellingPrice: num(['selling price', 'unit selling price', 'sellingprice', 'unit price', 'price'], previous?.sellingPrice ?? unitCost),
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
        unit_cost: inventoryNumber(item.unitCost, 'Unit cost'), unit_price: inventoryNumber(item.sellingPrice ?? item.unitCost, 'Selling price'),
        stock_qty: inventoryNumber(item.closing, 'Stock'), opening_qty: inventoryNumber(item.openQty, 'Opening stock'),
        purchased_qty: inventoryNumber(item.purchased, 'Purchased'), sold_qty: inventoryNumber(item.sold, 'Sold'),
        damaged_expired: inventoryNumber(item.damagedExpired, 'Damaged stock'),
        reorder_level: inventoryNumber(item.reorderLevel, 'Reorder level'), reorder_quantity: inventoryNumber(item.reorderQuantity, 'Reorder quantity'),
        reserved_qty: inventoryNumber(item.reserved, 'Reserved stock'), maximum_stock_level: inventoryNumber(item.maximumStockLevel, 'Maximum stock'),
        expiry_date: item.expiryDate || null, status: item.active === false ? 'inactive' : 'active',
        updated_at: new Date().toISOString(),
    }
}

export async function loadAllInventory(client: any, companyId: string) {
    const rows: any[] = []
    for (;;) {
        const {data, error} = await client.from('products').select('*').eq('company_id', companyId).is('deleted_at', null).order('id').range(rows.length, rows.length + 499)
        if (error) return {data: null, error}
        if (!data?.length) return {data: rows, error: null}
        rows.push(...data)
    }
}

export async function saveInventoryRows(client: any, companyId: string, items: any[]) {
    if (!client || !companyId) throw new Error('Sign in to a connected company before saving.')
    if (!items.length) throw new Error('There are no inventory rows to save.')
    const rows = items.map(item => inventoryToRow(item, companyId))
    const {error} = await client.from('products').upsert(rows, {onConflict: 'company_id,sku'})
    if (error) throw new Error(`Inventory was not confirmed saved: ${error.message}. Confirm migration 030 has been applied.`)
}
