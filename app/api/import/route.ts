import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase.server'
import { generateSku } from '@/lib/sku'

type GenericImportPayload = {
    companyId?: string
    staffId?: string
    sales?: any[]
    purchases?: any[]
    expenses?: any[]
    products?: any[]
    staff?: any[]
    contacts?: any[]
}

type ContactMap = Record<string, string>

type SupabaseWriteResult = { data: any; error: any }

function missingSchemaColumn(error: unknown, values: Record<string, unknown>): string | null {
    const message = typeof error === 'object' && error !== null && 'message' in error ? String((error as any).message) : String(error || '')
    const match = message.match(/['"]?([a-zA-Z_][a-zA-Z0-9_]*)['"]?\s+(?:column|field)\b/i)
        || message.match(/(?:column|field)(?:\s+of)?\s+['"]?([a-zA-Z_][a-zA-Z0-9_]*)['"]?/i)
    const column = match?.[1]
    return column && Object.prototype.hasOwnProperty.call(values, column) ? column : null
}

async function writeWithSchemaFallback(values: Record<string, unknown>, operation: (values: Record<string, unknown>) => Promise<SupabaseWriteResult>): Promise<SupabaseWriteResult> {
    const compatibleValues = { ...values }
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const result = await operation(compatibleValues)
        if (!result.error) return result
        const unsupportedColumn = missingSchemaColumn(result.error, compatibleValues)
        if (!unsupportedColumn) return result
        delete compatibleValues[unsupportedColumn]
    }
    return { data: null, error: new Error('Import could not match the database schema.') }
}

async function writeRowsWithSchemaFallback(rows: Record<string, unknown>[], operation: (rows: Record<string, unknown>[]) => Promise<SupabaseWriteResult>): Promise<SupabaseWriteResult> {
    const compatibleRows = rows.map((row) => ({ ...row }))
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const result = await operation(compatibleRows)
        if (!result.error) return result
        const unsupportedColumn = compatibleRows.reduce<string | null>((column, row) => column || missingSchemaColumn(result.error, row), null)
        if (!unsupportedColumn) return result
        compatibleRows.forEach((row) => delete row[unsupportedColumn])
    }
    return { data: null, error: new Error('Import could not match the database schema.') }
}

function normalizeContactType(value: string | undefined): string {
    const type = (value || '').toString().trim().toLowerCase()
    if (type.includes('supplier')) return 'supplier'
    if (type.includes('vendor')) return 'vendor'
    return 'customer'
}

async function findOrCreateContact(contact: any, companyId: string): Promise<string | null> {
    if (!supabaseAdmin) return null
    const type = normalizeContactType(contact.type || contact.contact_type || contact[''] || '')
    const name = String(contact.name || contact.full_name || contact.customer || contact.supplier || '').trim()
    if (!name) return null

    const { data: existing, error: existingErr } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('company_id', companyId)
        .eq('type', type)
        .eq('name', name)
        .limit(1)

    if (existingErr) {
        throw existingErr
    }

    if (existing && existing.length > 0) {
        return existing[0].id
    }

    const insertData = {
        company_id: companyId,
        type,
        name,
        email: contact.email || null,
        phone: contact.phone || null,
        address: contact.address || null,
        credit_limit: contact.credit_limit || contact.creditLimit || 0,
        opening_balance: contact.opening_balance || contact.openingBalance || 0,
        is_related_party: false,
        status: contact.status || 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }

    const { data: inserted, error: insertErr } = await writeWithSchemaFallback(insertData, (values) => supabaseAdmin!
        .from('contacts')
        .insert(values)
        .select('id')
        .limit(1))

    if (insertErr) {
        throw insertErr
    }

    return inserted?.[0]?.id || null
}

async function buildContactMap(contacts: any[], companyId: string): Promise<ContactMap> {
    const map: ContactMap = {}
    for (const item of contacts) {
        const type = normalizeContactType(item.type || item.contact_type || item[''] || '')
        const name = String(item.name || item.full_name || item.customer || item.supplier || '').trim()
        if (!name) continue
        const key = `${type}:${name}`
        if (map[key]) continue
        const id = await findOrCreateContact(item, companyId)
        if (id) map[key] = id
    }
    return map
}

async function findOrCreateProduct(product: any, companyId: string): Promise<string | null> {
    if (!supabaseAdmin) return null
    const name = String(product.name || product.product || product.item || '').trim()
    const explicitSku = String(product.sku || product.product_code || product.item_code || '').trim()
    const sku = explicitSku || generateSku(name)
    if (!sku || !name) return null

    const { data: existing, error: existingErr } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('company_id', companyId)
        .eq('sku', sku)
        .limit(1)

    if (existingErr) {
        throw existingErr
    }

    const insertData = {
        company_id: companyId,
        sku,
        name,
        description: product.description || product.product_description || '',
        category: product.category || product.dept || product.department || 'General',
        unit_cost: product.unit_cost || product.unitCost || 0,
        unit_price: product.unit_price || product.unitPrice || 0,
        stock_qty: product.stock_qty || product.openQty || product.closing || 0,
        expiry_date: product.expiry_date || product.expiryDate || product.expiry || null,
        damaged_expired: product.damaged_expired || product.damagedExpired || 0,
        reorder_level: product.reorder_level || product.reorderLevel || 0,
        branch: product.branch || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }

    if (existing && existing.length > 0) {
        const { data: updated, error: updateErr } = await writeWithSchemaFallback(insertData, (values) => supabaseAdmin!
            .from('products')
            .update(values)
            .eq('id', existing[0].id)
            .select('id')
            .limit(1))

        if (updateErr) {
            throw updateErr
        }
        return updated?.[0]?.id || existing[0].id
    }

    const { data: inserted, error: insertErr } = await writeWithSchemaFallback(insertData, (values) => supabaseAdmin!
        .from('products')
        .insert(values)
        .select('id')
        .limit(1))

    if (insertErr) {
        throw insertErr
    }

    return inserted?.[0]?.id || null
}

async function findOrCreateStaff(staff: any, companyId: string): Promise<string | null> {
    if (!supabaseAdmin) return null
    const staffId = String(staff.staffId || staff.employeeId || staff.employee_id || '').trim()
    const username = String(staff.username || '').trim()
    const fullName = String(staff.name || staff.full_name || '').trim() || username || staffId
    if (!fullName) return null

    const query = supabaseAdmin.from('users').select('id').or(
        [
            staffId ? `staff_id.eq.${staffId}` : undefined,
            username ? `username.eq.${username}` : undefined,
        ]
            .filter(Boolean)
            .join(',')
    )

    const { data: existing, error: existingErr } = await query.eq('company_id', companyId).limit(1)
    if (existingErr) {
        throw existingErr
    }

    const insertData = {
        company_id: companyId,
        staff_id: staffId || null,
        username: username || null,
        email: staff.email || `${username || staffId || 'imported'}@local`,
        full_name: fullName,
        role: String(staff.roleId || staff.role || 'staff'),
        phone: staff.phone || null,
        status: staff.status || 'active',
        branch: staff.branch || null,
        department: staff.department || null,
        position: staff.position || null,
        employee_id: staff.employeeId || staff.employee_id || null,
        pin: staff.pin || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }

    if (existing && existing.length > 0) {
        const { data: updated, error: updateErr } = await writeWithSchemaFallback(insertData, (values) => supabaseAdmin!
            .from('users')
            .update(values)
            .eq('id', existing[0].id)
            .select('id')
            .limit(1))

        if (updateErr) {
            throw updateErr
        }
        return updated?.[0]?.id || existing[0].id
    }

    const { data: inserted, error: insertErr } = await writeWithSchemaFallback(insertData, (values) => supabaseAdmin!
        .from('users')
        .insert(values)
        .select('id')
        .limit(1))

    if (insertErr) {
        throw insertErr
    }

    return inserted?.[0]?.id || null
}

async function insertSaleRecords(sales: any[], contactMap: ContactMap, companyId: string): Promise<void> {
    if (!supabaseAdmin || sales.length === 0) return

    const saleRows = sales.map((sale) => ({
        company_id: companyId,
        reference: String(sale.reference || sale.id || '').trim() || `S-${Date.now()}`,
        sale_date: sale.sale_date || sale.date || new Date().toISOString().slice(0, 10),
        customer_id: contactMap[`customer:${String(sale.customer || 'Unknown Customer').trim()}`] || null,
        branch: sale.branch || null,
        sales_rep: sale.sales_rep || sale.enteredBy || null,
        payment_method: sale.paymentMethod || sale.payment_method || 'Transfer',
        payment_status: sale.paymentStatus || sale.payment_status || 'PAID',
        status: sale.status || 'active',
        notes: sale.notes || null,
        subtotal: sale.subtotal || 0,
        tax: sale.tax || 0,
        discount: sale.discount || 0,
        shipping: sale.shipping || 0,
        total_amount: sale.totalAmount || sale.total_amount || 0,
        amount_paid: sale.amountPaid || sale.amount_paid || 0,
        balance: sale.balance || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }))

    const { error: salesErr } = await writeRowsWithSchemaFallback(saleRows, (rows) => supabaseAdmin!.from('sales').upsert(rows, { onConflict: 'reference' }))
    if (salesErr) {
        throw salesErr
    }

    const references = saleRows.map((row) => row.reference)
    const { data: storedSales, error: storedSalesErr } = await supabaseAdmin.from('sales').select('id,reference').eq('company_id', companyId).in('reference', references)
    if (storedSalesErr) throw storedSalesErr

    const salesByRef = new Map((storedSales || []).map((item: any) => [item.reference, item.id]))
    const saleItems: any[] = []

    sales.forEach((sale) => {
        const reference = String(sale.reference || sale.id || '').trim() || ''
        const saleId = salesByRef.get(reference)
        if (!saleId) return

        const item = sale.items?.[0]
        if (!item) return

        saleItems.push({
            company_id: companyId,
            sale_id: saleId,
            product_id: item.product_id || null,
            product_name: String(item.product || item.product_name || item.name || 'Imported Item').trim(),
            department: item.dept || item.department || null,
            qty: item.qty || item.quantity || 0,
            unit_price: item.unitPrice || item.unit_price || 0,
            discount: item.discount || 0,
            tax: item.tax || 0,
            total: item.total || 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
    })

    if (saleItems.length > 0) {
        const { error: saleItemsErr } = await writeRowsWithSchemaFallback(saleItems, (rows) => supabaseAdmin!.from('sale_items').insert(rows))
        if (saleItemsErr) {
            throw saleItemsErr
        }
    }
}

async function insertPurchaseRecords(purchases: any[], contactMap: ContactMap, companyId: string): Promise<void> {
    if (!supabaseAdmin || purchases.length === 0) return

    const purchaseRows = purchases.map((purchase) => ({
        company_id: companyId,
        reference: String(purchase.reference || purchase.id || '').trim() || `P-${Date.now()}`,
        purchase_date: purchase.purchase_date || purchase.date || new Date().toISOString().slice(0, 10),
        supplier_id: contactMap[`supplier:${String(purchase.supplier || 'Unknown Supplier').trim()}`] || null,
        branch: purchase.branch || null,
        invoice_number: purchase.invoiceNumber || purchase.invoice_number || null,
        purchase_order: purchase.purchaseOrder || purchase.purchase_order || null,
        payment_method: purchase.paymentMethod || purchase.payment_method || 'Cash',
        payment_status: purchase.paymentStatus || purchase.payment_status || 'PAID',
        status: purchase.status || 'active',
        notes: purchase.notes || null,
        subtotal: purchase.subtotal || 0,
        tax: purchase.tax || 0,
        discount: purchase.discount || 0,
        shipping: purchase.shipping || 0,
        total: purchase.total || 0,
        amount_paid: purchase.amountPaid || purchase.amount_paid || 0,
        balance: purchase.balance || 0,
        due_date: purchase.dueDate || purchase.due_date || null,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }))

    const { error: purchasesErr } = await writeRowsWithSchemaFallback(purchaseRows, (rows) => supabaseAdmin!.from('purchases').upsert(rows, { onConflict: 'reference' }))
    if (purchasesErr) {
        throw purchasesErr
    }

    const references = purchaseRows.map((row) => row.reference)
    const { data: storedPurchases, error: storedPurchasesErr } = await supabaseAdmin.from('purchases').select('id,reference').eq('company_id', companyId).in('reference', references)
    if (storedPurchasesErr) throw storedPurchasesErr

    const purchasesByRef = new Map((storedPurchases || []).map((item: any) => [item.reference, item.id]))
    const purchaseItems: any[] = []

    purchases.forEach((purchase) => {
        const reference = String(purchase.reference || purchase.id || '').trim() || ''
        const purchaseId = purchasesByRef.get(reference)
        if (!purchaseId) return

        const item = purchase.items?.[0]
        if (!item) return

        purchaseItems.push({
            company_id: companyId,
            purchase_id: purchaseId,
            product_id: item.product_id || null,
            product_name: String(item.product || item.product_name || item.name || 'Imported Item').trim(),
            department: item.dept || item.department || null,
            qty: item.qty || item.quantity || 0,
            unit_price: item.unitPrice || item.unit_price || 0,
            discount: item.discount || 0,
            tax: item.tax || 0,
            total: item.total || 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
    })

    if (purchaseItems.length > 0) {
        const { error: purchaseItemsErr } = await writeRowsWithSchemaFallback(purchaseItems, (rows) => supabaseAdmin!.from('purchase_items').insert(rows))
        if (purchaseItemsErr) {
            throw purchaseItemsErr
        }
    }
}

async function insertExpenseRecords(expenses: any[], companyId: string): Promise<void> {
    if (!supabaseAdmin || expenses.length === 0) return
    const rows = expenses.map((expense) => ({
        company_id: companyId,
        reference: String(expense.reference || expense.id || '').trim() || `E-${Date.now()}`,
        expense_date: expense.date || new Date().toISOString().slice(0, 10),
        description: String(expense.description || 'Imported expense'),
        category: String(expense.category || 'General'),
        amount: Number(expense.amount || 0),
        status: String(expense.status || 'Pending Approval'),
        notes: expense.notes || null,
        bank_account_id: expense.bank_account_id || null,
        entered_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }))
    const { error } = await writeRowsWithSchemaFallback(rows, (compatibleRows) => supabaseAdmin!.from('expenses').upsert(compatibleRows, { onConflict: 'reference' }))
    if (error) throw error
}

function formatErrorMessage(error: unknown): string {
    if (!error) return 'Unknown server error'
    if (error instanceof Error) return error.message
    if (typeof error === 'string') return error
    if (typeof error === 'object') {
        if ('message' in error && typeof (error as any).message === 'string') {
            return (error as any).message
        }
        try {
            return JSON.stringify(error)
        } catch {
            return String(error)
        }
    }
    return String(error)
}

export async function POST(request: Request) {
    try {
        if (!supabaseAdmin) {
            return NextResponse.json({ success: false, error: 'Supabase admin client is not configured' }, { status: 500 })
        }

        const payload = (await request.json()) as GenericImportPayload
        let companyId = String(payload.companyId || '').trim()
        if (!companyId && payload.staffId) {
            const { data: user, error: userError } = await supabaseAdmin
                .from('users')
                .select('company_id')
                .eq('staff_id', String(payload.staffId).trim())
                .limit(1)
                .maybeSingle()

            if (userError) {
                throw userError
            }
            companyId = String(user?.company_id || '').trim()
        }
        if (!companyId) {
            return NextResponse.json({ success: false, error: 'Unable to identify your company. Please sign out and sign in again before importing.' }, { status: 400 })
        }
        const contacts = Array.isArray(payload.contacts) ? payload.contacts : []
        const sales = Array.isArray(payload.sales) ? payload.sales : []
        const purchases = Array.isArray(payload.purchases) ? payload.purchases : []
        const expenses = Array.isArray(payload.expenses) ? payload.expenses : []
        const products = Array.isArray(payload.products) ? payload.products : []
        const staff = Array.isArray(payload.staff) ? payload.staff : []

        const contactMap = await buildContactMap(contacts, companyId)

        for (const sale of sales) {
            const name = String(sale.customer || sale.customer_name || sale.client || sale.name || 'Unknown Customer').trim()
            if (name) {
                const id = await findOrCreateContact({ type: 'customer', name }, companyId)
                if (id) contactMap[`customer:${name}`] = id
            }
        }

        for (const purchase of purchases) {
            const name = String(purchase.supplier || purchase.supplier_name || purchase.vendor || purchase.name || 'Unknown Supplier').trim()
            if (name) {
                const id = await findOrCreateContact({ type: 'supplier', name }, companyId)
                if (id) contactMap[`supplier:${name}`] = id
            }
        }

        for (const product of products) {
            await findOrCreateProduct(product, companyId)
        }

        for (const staffRow of staff) {
            await findOrCreateStaff(staffRow, companyId)
        }

        await insertSaleRecords(sales, contactMap, companyId)
        await insertPurchaseRecords(purchases, contactMap, companyId)
        await insertExpenseRecords(expenses, companyId)

        const counts = {
            sales: sales.length,
            purchases: purchases.length,
            expenses: expenses.length,
            products: products.length,
            staff: staff.length,
            contacts: contacts.length,
        }
        return NextResponse.json({ success: true, counts: { ...counts, total: Object.values(counts).reduce((total, count) => total + count, 0) } })
    } catch (error) {
        return NextResponse.json({ success: false, error: formatErrorMessage(error) }, { status: 500 })
    }
}
