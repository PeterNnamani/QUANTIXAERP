import { NextResponse } from 'next/server'
import { supabaseAdmin, writeWithSchemaFallback } from '@/lib/supabase.server'

function formatErrorMessage(error: unknown): string {
    if (!error) return 'Unknown server error'
    if (error instanceof Error) return error.message
    if (typeof error === 'string') return error
    if (typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
        return (error as { message: string }).message
    }
    try {
        return JSON.stringify(error)
    } catch {
        return String(error)
    }
}

async function upsertExpenseRow(expenseRow: Record<string, unknown>) {
    const primary = await writeWithSchemaFallback(expenseRow, (row) =>
        supabaseAdmin!.from('expenses').upsert(row, { onConflict: 'reference' })
    )
    if (!primary.error) return primary
    if (!/no unique or exclusion constraint/i.test(primary.error.message || '')) return primary
    return writeWithSchemaFallback(expenseRow, (row) =>
        supabaseAdmin!.from('expenses').upsert(row, { onConflict: 'company_id,reference' })
    )
}

export async function POST(request: Request) {
    try {
        if (!supabaseAdmin) {
            return NextResponse.json({ success: false, error: 'Supabase admin client is not configured' }, { status: 500 })
        }

        const payload = await request.json()
        const companyId = String(payload.companyId || '').trim()
        const expense = payload.expense
        const description = String(expense?.desc || expense?.description || '').trim()
        const amount = Number(expense?.amount || 0)
        if (!companyId || !expense?.id || !description || !expense?.category || amount <= 0) {
            return NextResponse.json({ success: false, error: 'A company and complete expense details are required.' }, { status: 400 })
        }

        let bankAccountId: string | null = null
        if (expense.bank) {
            const { data: account, error: accountError } = await supabaseAdmin
                .from('bank_accounts')
                .select('id')
                .eq('company_id', companyId)
                .eq('name', expense.bank)
                .maybeSingle()
            if (accountError) throw accountError
            bankAccountId = account?.id || null
        }

        const expenseRow = {
            company_id: companyId,
            reference: String(expense.id),
            expense_date: expense.date || new Date().toISOString().slice(0, 10),
            description,
            category: String(expense.category),
            amount,
            bank_account_id: bankAccountId,
            status: String(expense.status || 'Pending Approval'),
            notes: expense.notes || null,
        }

        const { error: persistError } = await upsertExpenseRow(expenseRow)
        if (persistError) throw persistError

        const status = String(expense.status || '').toUpperCase()
        if (status === 'PAID' || status === 'ACTIVE') {
            const { error: postingError } = await supabaseAdmin.rpc('post_accounting_cash_movement', {
                p_company_id: companyId,
                p_source_module: 'EXPENSE_PAYMENT',
                p_source_id: String(expense.id),
                p_reference: String(expense.id),
                p_entry_date: expense.date || new Date().toISOString().slice(0, 10),
                p_description: description,
                p_amount: amount,
                p_bank_account_name: expense.bank || null,
                p_offset_account_name: 'Expense Account',
                p_direction: 'withdrawal',
            })
            if (postingError) console.error('Unable to post expense journal', postingError)
        }

        return NextResponse.json({ success: true, reference: expense.id })
    } catch (error) {
        return NextResponse.json({ success: false, error: formatErrorMessage(error) }, { status: 400 })
    }
}
