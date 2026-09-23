import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase.server'

export async function POST(request: Request) {
    try {
        if (!supabaseAdmin) return NextResponse.json({ success: false, error: 'Supabase admin client is not configured' }, { status: 500 })
        const payload = await request.json()
        const required = ['companyId', 'staffId', 'bankAccountId', 'payDate']
        if (required.some((key) => !String(payload[key] || '').trim())) {
            return NextResponse.json({ success: false, error: 'Staff, bank account, and payment date are required.' }, { status: 400 })
        }
        const { data, error } = await supabaseAdmin.rpc('process_staff_payment', {
            p_company_id: payload.companyId,
            p_staff_id: payload.staffId,
            p_bank_account_id: payload.bankAccountId,
            p_pay_date: payload.payDate,
            p_currency: payload.currency || 'NGN',
            p_base_amount: Number(payload.baseAmount || 0),
            p_incentive_amount: Number(payload.incentiveAmount || 0),
            p_deductions: Number(payload.deductions || 0),
            p_incentive_type: payload.incentiveType || null,
            p_kpi_score: payload.kpiScore === '' ? null : Number(payload.kpiScore || 0),
            p_reference: payload.reference || null,
            p_created_by: payload.createdBy || null,
        })
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
        return NextResponse.json({ success: true, ...data })
    } catch (error) {
        return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
    }
}