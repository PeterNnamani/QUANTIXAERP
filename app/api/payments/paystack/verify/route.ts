import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase.server'
import { getSubscriptionReplacementStatus } from '@/lib/licensing'

const planAmounts: Record<string, number> = { 'Growth Edition': 45000000, 'Professional Edition': 65000000, 'Enterprise Edition': 90000000 }

export async function POST(request: Request) {
    try {
        const { reference, companyId, planName } = await request.json()
        if (!reference || !companyId || !planName) return NextResponse.json({ error: 'Payment details are incomplete.' }, { status: 400 })
        if (!process.env.PAYSTACK_SECRET_KEY || !supabaseAdmin) return NextResponse.json({ error: 'Payment service is not configured.' }, { status: 500 })

        const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } })
        const result = await response.json()
        const payment = result.data
        if (!response.ok || !result.status || payment?.status !== 'success') return NextResponse.json({ error: payment?.gateway_response || result.message || 'Payment was not successful.' }, { status: 400 })
        if (planAmounts[planName] !== payment.amount || payment.currency !== 'NGN') return NextResponse.json({ error: 'Payment amount or currency does not match the selected plan.' }, { status: 400 })
        if (payment.metadata?.companyId !== companyId || payment.metadata?.planName !== planName) return NextResponse.json({ error: 'Payment metadata does not match this subscription.' }, { status: 400 })

        const { data: existingSubscription, error: existingSubscriptionError } = await supabaseAdmin
            .from('subscriptions')
            .select('id,plan_name,status,starts_at,amount,currency')
            .eq('company_id', companyId)
            .eq('paystack_reference', reference)
            .maybeSingle()
        if (existingSubscriptionError) return NextResponse.json({ error: existingSubscriptionError.message }, { status: 500 })
        if (existingSubscription) return NextResponse.json({ ok: true, subscription: existingSubscription })

        const now = new Date().toISOString()
        const { data: storedPayment, error: paymentError } = await supabaseAdmin.from('subscription_payments').upsert({
            company_id: companyId,
            plan_name: planName,
            amount: payment.amount / 100,
            currency: payment.currency,
            paystack_reference: reference,
            paystack_transaction_id: String(payment.id),
            status: 'success',
            paid_at: payment.paid_at || now,
            metadata: payment.metadata || null,
        }, { onConflict: 'paystack_reference' }).select('id').single()
        if (paymentError) return NextResponse.json({ error: paymentError.message }, { status: 500 })

        const { data: currentSubscription, error: currentSubscriptionError } = await supabaseAdmin
            .from('subscriptions')
            .select('id,status')
            .eq('company_id', companyId)
            .in('status', ['trial', 'active'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        if (currentSubscriptionError) return NextResponse.json({ error: currentSubscriptionError.message }, { status: 500 })

        if (currentSubscription) {
            const { error: replacementError } = await supabaseAdmin
                .from('subscriptions')
                .update({ status: getSubscriptionReplacementStatus(currentSubscription.status), updated_at: now })
                .eq('id', currentSubscription.id)
            if (replacementError) return NextResponse.json({ error: replacementError.message }, { status: 500 })
        }

        const { data: subscription, error: subscriptionError } = await supabaseAdmin.from('subscriptions').insert({
            company_id: companyId,
            plan_name: planName,
            status: 'active',
            amount: payment.amount / 100,
            currency: payment.currency,
            starts_at: now,
            paystack_reference: reference,
            updated_at: now,
        }).select('id,plan_name,status,starts_at,amount,currency').single()
        if (subscriptionError) return NextResponse.json({ error: subscriptionError.message }, { status: 500 })

        await supabaseAdmin.from('subscription_payments').update({ subscription_id: subscription.id }).eq('id', storedPayment.id)
        return NextResponse.json({ ok: true, subscription })
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to verify payment.' }, { status: 500 })
    }
}