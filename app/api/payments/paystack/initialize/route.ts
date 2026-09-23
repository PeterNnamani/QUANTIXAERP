import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase.server'

const plans: Record<string, { amount: number; name: string }> = {
    'Growth Edition': { amount: 450000, name: 'Growth Edition' },
    'Professional Edition': { amount: 650000, name: 'Professional Edition' },
    'Enterprise Edition': { amount: 900000, name: 'Enterprise Edition' },
}

export async function POST(request: Request) {
    try {
        const { planName, companyId, email } = await request.json()
        const plan = plans[String(planName)]

        if (!plan || !companyId || !email) return NextResponse.json({ error: 'A valid plan, company, and email are required.' }, { status: 400 })
        if (!process.env.PAYSTACK_SECRET_KEY || !process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY) return NextResponse.json({ error: 'Paystack is not configured on the server.' }, { status: 500 })
        if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase admin client is not configured.' }, { status: 500 })

        const { data: company } = await supabaseAdmin.from('companies').select('id').eq('id', companyId).maybeSingle()
        if (!company) return NextResponse.json({ error: 'Company was not found.' }, { status: 404 })

        const response = await fetch('https://api.paystack.co/transaction/initialize', {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: String(email).trim(), amount: plan.amount * 100, currency: 'NGN', metadata: { companyId, planName: plan.name } }),
        })
        const result = await response.json()
        if (!response.ok || !result.status || !result.data?.reference) return NextResponse.json({ error: result.message || 'Unable to initialize payment.' }, { status: 502 })

        return NextResponse.json({ publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY, accessCode: result.data.access_code, reference: result.data.reference })
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to initialize payment.' }, { status: 500 })
    }
}