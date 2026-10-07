import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase.server'
import { normalizePlanName } from '@/lib/licensing'
import { normalizeBillingEmail, planAmountKobo, PLAN_PRICES_NGN } from '@/lib/paystack-subscription'

async function resolveBillingEmail(companyId: string, email: unknown, staffId: unknown, username: unknown) {
    const provided = normalizeBillingEmail(email)
    if (provided) return provided
    if (!supabaseAdmin) return null

    const staff = String(staffId || '').trim()
    const name = String(username || '').trim()
    if (!staff && !name) return null

    let query = supabaseAdmin.from('users').select('email').eq('company_id', companyId)
    query = staff ? query.eq('staff_id', staff) : query.eq('username', name)
    const { data } = await query.limit(1).maybeSingle()
    return normalizeBillingEmail(data?.email)
}

export async function POST(request: Request) {
    try {
        const { planName, companyId, email, staffId, username } = await request.json()
        const plan = normalizePlanName(planName) || ''
        const amount = plan && PLAN_PRICES_NGN[plan] ? planAmountKobo(plan) : null

        if (!plan || !amount || !companyId) return NextResponse.json({ error: 'A valid plan, company, and email are required.' }, { status: 400 })
        if (!process.env.PAYSTACK_SECRET_KEY || !process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY) return NextResponse.json({ error: 'Paystack is not configured on the server.' }, { status: 500 })
        if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase admin client is not configured.' }, { status: 500 })

        const { data: company } = await supabaseAdmin.from('companies').select('id').eq('id', companyId).maybeSingle()
        if (!company) return NextResponse.json({ error: 'Company was not found.' }, { status: 404 })

        const billingEmail = await resolveBillingEmail(String(companyId), email, staffId, username)
        if (!billingEmail) return NextResponse.json({ error: 'Add a valid email address to your staff profile before purchasing a subscription.' }, { status: 400 })

        const response = await fetch('https://api.paystack.co/transaction/initialize', {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: billingEmail,
                amount,
                currency: 'NGN',
                metadata: {
                    companyId,
                    planName: plan,
                    custom_fields: [
                        { display_name: 'Company', variable_name: 'companyId', value: String(companyId) },
                        { display_name: 'Plan', variable_name: 'planName', value: plan },
                    ],
                },
            }),
        })
        const result = await response.json()
        if (!response.ok || !result.status || !result.data?.reference) return NextResponse.json({ error: result.message || 'Unable to initialize payment.' }, { status: 502 })

        return NextResponse.json({ publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY, accessCode: result.data.access_code, reference: result.data.reference })
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to initialize payment.' }, { status: 500 })
    }
}