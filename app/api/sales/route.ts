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

async function loadPostedJournal(entryId: string | undefined) {
    if (!entryId || !supabaseAdmin) return null
    const { data: entry, error: entryError } = await supabaseAdmin
        .from('journal_entries')
        .select('id,entry_date,reference,description,source_module,source_id,status')
        .eq('id', entryId)
        .maybeSingle()
    if (entryError) throw entryError
    if (!entry) return null
    const { data: lines, error: lineError } = await supabaseAdmin
        .from('journal_lines')
        .select('id,entry_id,account_id,debit,credit,description')
        .eq('entry_id', entryId)
    if (lineError) throw lineError
    return {
        entry: {
            id: entry.id,
            entryDate: entry.entry_date,
            reference: entry.reference || '',
            description: entry.description || '',
            sourceModule: entry.source_module,
            sourceId: entry.source_id,
            status: entry.status,
        },
        lines: (lines || []).map((line) => ({
            id: line.id,
            entryId: line.entry_id,
            accountId: line.account_id,
            debit: Number(line.debit || 0),
            credit: Number(line.credit || 0),
            description: line.description || '',
        })),
    }
}

async function postReceivableSale(companyId: string, sale: { id: string; date?: string }, amount: number) {
    const sourceId = String(sale.id)
    const { data: existing, error: existingError } = await supabaseAdmin!
        .from('journal_entries')
        .select('id')
        .eq('company_id', companyId)
        .eq('source_module', 'SALES_RECEIVABLE')
        .eq('source_id', sourceId)
        .limit(1)
    if (existingError) throw existingError
    if (existing && existing.length > 0) return loadPostedJournal(existing[0].id)

    const { data: accounts, error: accountError } = await supabaseAdmin!
        .from('chart_of_accounts')
        .select('id,name')
        .eq('company_id', companyId)
        .in('name', ['Receivables', 'Sales Revenue'])
    if (accountError) throw accountError
    const debit = (accounts || []).find((account) => account.name === 'Receivables')
    const credit = (accounts || []).find((account) => account.name === 'Sales Revenue')
    if (!debit || !credit) throw new Error('Receivables and Sales Revenue accounts are required before a credit sale can post.')

    const description = `Credit sale ${sourceId}`
    const { data: entry, error: entryError } = await supabaseAdmin!
        .from('journal_entries')
        .insert({
            company_id: companyId,
            entry_date: sale.date || new Date().toISOString().slice(0, 10),
            reference: sourceId,
            description,
            source_module: 'SALES_RECEIVABLE',
            source_id: sourceId,
            status: 'DRAFT',
        })
        .select('id')
        .single()
    if (entryError) throw entryError
    const { error: lineError } = await supabaseAdmin!.from('journal_lines').insert([
        { company_id: companyId, entry_id: entry.id, account_id: debit.id, debit: amount, credit: 0, description },
        { company_id: companyId, entry_id: entry.id, account_id: credit.id, debit: 0, credit: amount, description },
    ])
    if (lineError) throw lineError
    const { error: postError } = await supabaseAdmin!.from('journal_entries').update({ status: 'POSTED' }).eq('id', entry.id)
    if (postError) throw postError
    return loadPostedJournal(entry.id)
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
        { code: `1105-${companyId.replaceAll('-', '').slice(0, 12)}`, name: 'Receivables', account_type: 'ASSET', account_subtype: 'CURRENT_ASSET', normal_balance: 'DEBIT', is_control_account: true },
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
        const paymentStatus = String(sale.paymentStatus || 'PAID').toUpperCase()
        const amountPaid = paymentStatus === 'PAID' ? totalAmount : Number(sale.amountPaid || 0)
        const saleRow = {
            company_id: companyId,
            reference: String(sale.id),
            sale_date: sale.date,
            customer_id: customer?.id || null,
            payment_method: sale.paymentMethod || 'Transfer',
            payment_account: sale.paymentAccount || null,
            payment_status: paymentStatus,
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
        const { error: deleteItemsError } = await supabaseAdmin.from('sale_items').delete().eq('sale_id', storedSale.id)
        if (deleteItemsError) throw deleteItemsError
        const { error: itemError } = await supabaseAdmin.from('sale_items').insert(itemRows)
        if (itemError) throw itemError

        const journalEntries: Array<Record<string, unknown>> = []
        const journalLines: Array<Record<string, unknown>> = []
        const rememberJournal = (posted: { entry: Record<string, unknown>; lines: Array<Record<string, unknown>> } | null) => {
            if (!posted) return
            journalEntries.push(posted.entry)
            journalLines.push(...posted.lines)
        }

        let postedBankAccount: { id: string; name: string; balance: number } | null = null
        const outstandingAmount = Math.max(0, totalAmount - amountPaid)
        if (amountPaid > 0 || outstandingAmount > 0) await ensureSalesPostingAccounts(companyId)
        if (amountPaid > 0) {
            const { data: postingData, error: postingError } = await supabaseAdmin.rpc('post_accounting_cash_movement', {
                p_company_id: companyId,
                p_source_module: 'SALES_PAYMENT',
                p_source_id: String(sale.id),
                p_reference: String(sale.id),
                p_entry_date: sale.date || new Date().toISOString().slice(0, 10),
                p_description: `Payment received for sale ${sale.id}`,
                p_amount: amountPaid,
                p_bank_account_name: sale.paymentAccount || null,
                p_offset_account_name: 'Sales Revenue',
                p_direction: 'deposit',
            })
            if (postingError) throw postingError

            const posting = postingData as { bank_account_id?: string; entry_id?: string; posted?: boolean } | null
            rememberJournal(await loadPostedJournal(posting?.entry_id))
            if (posting?.bank_account_id) {
                const { data: bankAccount, error: bankAccountError } = await supabaseAdmin
                    .from('bank_accounts')
                    .select('id,name,balance')
                    .eq('id', posting.bank_account_id)
                    .eq('company_id', companyId)
                    .single()
                if (bankAccountError) throw bankAccountError
                postedBankAccount = {
                    id: bankAccount.id,
                    name: bankAccount.name,
                    balance: Number(bankAccount.balance || 0),
                }
            }
        }

        if (outstandingAmount > 0) {
            rememberJournal(await postReceivableSale(companyId, sale, outstandingAmount))
            if (customer?.id) {
                const { error: receivableError } = await supabaseAdmin
                    .from('receivables')
                    .upsert({
                        company_id: companyId,
                        contact_id: customer.id,
                        reference: String(sale.id),
                        due_date: sale.date || new Date().toISOString().slice(0, 10),
                        original_amount: totalAmount,
                        outstanding_amount: outstandingAmount,
                        status: amountPaid > 0 ? 'partial' : 'open',
                    }, { onConflict: 'reference' })
                if (receivableError) throw receivableError
            }
        }

        return NextResponse.json({ success: true, saleId: storedSale.id, bankAccount: postedBankAccount, journalEntries, journalLines })
    } catch (error) {
        return NextResponse.json({ success: false, error: formatErrorMessage(error) }, { status: 400 })
    }
}