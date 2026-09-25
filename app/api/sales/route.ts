import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase.server'

function missingSchemaColumn(error: unknown, values: Record<string, unknown>): string | null {
    if (typeof error !== 'object' || error === null || (error as { code?: string }).code !== 'PGRST204') return null
    const message = String((error as { message?: string }).message || '')
    const match = message.match(/["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?\s+(?:column|field)\b/i)
        || message.match(/(?:column|field)(?:\s+of)?\s+["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?/i)
    const column = match?.[1]
    return column && Object.prototype.hasOwnProperty.call(values, column) ? column : null
}

async function upsertSaleWithSchemaFallback(saleRow: Record<string, unknown>) {
    const compatibleSaleRow = { ...saleRow }
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const result = await supabaseAdmin!.from('sales').upsert(compatibleSaleRow, { onConflict: 'reference' }).select('id').single()
        if (!result.error) return result
        const unsupportedColumn = missingSchemaColumn(result.error, compatibleSaleRow)
        if (!unsupportedColumn) return result
        delete compatibleSaleRow[unsupportedColumn]
    }
    return { data: null, error: new Error('Sale could not match the database schema.') }
}

async function ensureSalesPostingAccounts(companyId: string) {
    const requiredAccounts = [
        { code: `1000-${companyId.replaceAll('-', '').slice(0, 12)}`, name: 'Cash', account_type: 'ASSET', account_subtype: 'CURRENT_ASSET', normal_balance: 'DEBIT', is_control_account: true },
        { code: `4000-${companyId.replaceAll('-', '').slice(0, 12)}`, name: 'Sales Revenue', account_type: 'INCOME', account_subtype: 'OPERATING_INCOME', normal_balance: 'CREDIT', is_control_account: false },
    ]
    const { data: existingAccounts, error: lookupError } = await supabaseAdmin!
        .from('chart_of_accounts')
        .select('name')
        .eq('company_id', companyId)
        .in('name', requiredAccounts.map((account) => account.name))
    if (lookupError) throw lookupError

    const existingNames = new Set((existingAccounts || []).map((account) => account.name))
    const missingAccounts = requiredAccounts
        .filter((account) => !existingNames.has(account.name))
        .map((account) => ({ ...account, company_id: companyId, currency: 'NGN', is_active: true }))
    if (missingAccounts.length === 0) return

    const { error: insertError } = await supabaseAdmin!.from('chart_of_accounts').insert(missingAccounts)
    if (insertError) throw insertError
}

function formatErrorMessage(error: unknown): string {
    if (!error) return 'Unknown server error'
    if (error instanceof Error) return error.message
    if (typeof error === 'string') return error
    if (typeof error === 'object') {
        if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
            return (error as { message: string }).message
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

        const payload = await request.json()
        const companyId = String(payload.companyId || '').trim()
        const sale = payload.sale
        if (!companyId || !sale?.id || !Array.isArray(sale.items) || sale.items.length === 0) {
            return NextResponse.json({ success: false, error: 'A company and sale items are required.' }, { status: 400 })
        }

        const customerName = String(sale.customer || '').trim() || 'Walk-in Customer'
        let customer: { id: string } | null = null
        if (customerName) {
            let customerLookupError
            const lookupResult = await supabaseAdmin
                .from('contacts')
                .select('id')
                .eq('company_id', companyId)
                .eq('type', 'customer')
                .eq('name', customerName)
                .limit(1)
                .maybeSingle()
            customer = lookupResult.data
            customerLookupError = lookupResult.error
            if (customerLookupError) throw customerLookupError
            if (!customer) {
                const result = await supabaseAdmin
                    .from('contacts')
                    .insert({ company_id: companyId, type: 'customer', name: customerName })
                    .select('id')
                    .single()
                customer = result.data
                customerLookupError = result.error
                if (customerLookupError) throw customerLookupError
            }
        }

        const totalAmount = Number(sale.totalAmount || 0)
        const amountPaid = sale.paymentStatus === 'PAID' ? totalAmount : Number(sale.amountPaid || 0)
        const saleRow = {
            company_id: companyId,
            reference: String(sale.id),
            sale_date: sale.date,
            customer_id: customer?.id || null,
            payment_method: sale.paymentMethod || 'Transfer',
            payment_account: sale.paymentAccount || null,
            payment_status: sale.paymentStatus || 'PAID',
            status: sale.status || 'ACTIVE',
            notes: sale.notes || null,
            subtotal: totalAmount,
            total_amount: totalAmount,
            amount_paid: amountPaid,
            balance: Math.max(0, totalAmount - amountPaid),
            sales_rep: sale.enteredBy || null,
            device_used: sale.deviceUsed || null,
        }
        const { data: storedSale, error: saleError } = await upsertSaleWithSchemaFallback(saleRow)
        if (saleError) throw saleError

        const itemRows = sale.items.map((item: any) => ({
            company_id: companyId,
            sale_id: storedSale.id,
            product_name: item.product,
            department: item.dept || null,
            qty: Number(item.qty || 0),
            unit_price: Number(item.unitPrice || 0),
            total: Number(item.total || 0),
        }))
        const { error: itemError } = await supabaseAdmin.from('sale_items').upsert(itemRows)
        if (itemError) throw itemError

        if (String(sale.paymentStatus || '').toUpperCase() === 'PAID') {
            await ensureSalesPostingAccounts(companyId)
            const { error: postingError } = await supabaseAdmin.rpc('post_accounting_cash_movement', {
                p_company_id: companyId,
                p_source_module: 'SALES_PAYMENT',
                p_source_id: String(sale.id),
                p_reference: String(sale.id),
                p_entry_date: sale.date || new Date().toISOString().slice(0, 10),
                p_description: `Payment received for sale ${sale.id}`,
                p_amount: Number(sale.totalAmount || 0),
                p_bank_account_name: sale.paymentAccount || null,
                p_offset_account_name: 'Sales Revenue',
                p_direction: 'deposit',
            })
            if (postingError) throw postingError
        }

        if (String(sale.paymentStatus || '').toUpperCase() !== 'PAID') {
            const receivableReference = String(sale.id)
            const outstandingAmount = Number(sale.totalAmount || 0)
            if (outstandingAmount > 0) {
                const customerId = customer?.id ?? null
                const receivableRow = {
                    company_id: companyId,
                    contact_id: customerId,
                    reference: receivableReference,
                    due_date: sale.date || new Date().toISOString().slice(0, 10),
                    original_amount: outstandingAmount,
                    outstanding_amount: outstandingAmount,
                    status: 'open',
                }
                const { error: receivableError } = await supabaseAdmin
                    .from('receivables')
                    .upsert(receivableRow, { onConflict: 'reference' })

                if (receivableError) throw receivableError
            }
        }

        return NextResponse.json({ success: true, saleId: storedSale.id })
    } catch (error) {
        return NextResponse.json({ success: false, error: formatErrorMessage(error) }, { status: 400 })
    }
}