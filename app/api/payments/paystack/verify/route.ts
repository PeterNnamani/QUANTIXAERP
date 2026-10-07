import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase.server'
import { getSubscriptionReplacementStatus, normalizePlanName } from '@/lib/licensing'
import { paymentMatchesPlan } from '@/lib/paystack-subscription'

function publicSubscription<T extends { plan_name?: unknown }>(subscription: T) {
    const planName = normalizePlanName(subscription.plan_name) || subscription.plan_name
    return { ...subscription, plan_name: planName }
}

export async function POST(request: Request) {
    try {
        const { reference, companyId, planName } = await request.json()
        const plan = normalizePlanName(planName)
        if (!reference || !companyId || !plan) return NextResponse.json({ error: 'Payment details are incomplete.' }, { status: 400 })
        if (!process.env.PAYSTACK_SECRET_KEY || !supabaseAdmin) return NextResponse.json({ error: 'Payment service is not configured.' }, { status: 500 })

        const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } })
        const result = await response.json()
        const payment = result.data
        if (!response.ok || !result.status || payment?.status !== 'success') return NextResponse.json({ error: payment?.gateway_response || result.message || 'Payment was not successful.' }, { status: 400 })
        if (!paymentMatchesPlan(payment, plan, companyId)) return NextResponse.json({ error: 'Payment amount, currency, or details do not match the selected plan.' }, { status: 400 })

        const { data: existingSubscription, error: existingSubscriptionError } = await supabaseAdmin
            .from('subscriptions')
            .select('id,plan_name,status,starts_at,amount,currency')
            .eq('company_id', companyId)
            .eq('paystack_reference', reference)
            .maybeSingle()
        if (existingSubscriptionError) return NextResponse.json({ error: existingSubscriptionError.message }, { status: 500 })
        if (existingSubscription) {
            const storedPlan = normalizePlanName(existingSubscription.plan_name)
            if (storedPlan && storedPlan !== existingSubscription.plan_name) {
                await supabaseAdmin.from('subscriptions').update({ plan_name: storedPlan }).eq('id', existingSubscription.id)
            }
            return NextResponse.json({ ok: true, subscription: publicSubscription({ ...existingSubscription, plan_name: storedPlan || existingSubscription.plan_name }) })
        }

        const now = new Date().toISOString()
        const { data: storedPayment, error: paymentError } = await supabaseAdmin.from('subscription_payments').upsert({
            company_id: companyId,
            plan_name: plan,
            amount: payment.amount / 100,
            currency: payment.currency,
            paystack_reference: reference,
            paystack_transaction_id: String(payment.id),
            status: 'success',
            paid_at: payment.paid_at || now,
            metadata: payment.metadata || null,
        }, { onConflict: 'paystack_reference' }).select('id').single()
        if (paymentError) return NextResponse.json({ error: paymentError.message }, { status: 500 })

        const { data: currentSubscriptions, error: currentSubscriptionError } = await supabaseAdmin
            .from('subscriptions')
            .select('id,status')
            .eq('company_id', companyId)
            .in('status', ['trial', 'active'])
        if (currentSubscriptionError) return NextResponse.json({ error: currentSubscriptionError.message }, { status: 500 })

        const activeSubscription = {
            company_id: companyId,
            plan_name: plan,
            status: 'active',
            amount: payment.amount / 100,
            currency: payment.currency,
            starts_at: now,
            paystack_reference: reference,
            updated_at: now,
        }

        const currentRows = currentSubscriptions || []
        if (currentRows.length > 0) {
            const trialIds = currentRows.filter((row) => String(row.status).toLowerCase() === 'trial').map((row) => row.id)
            const activeIds = currentRows.filter((row) => String(row.status).toLowerCase() === 'active').map((row) => row.id)
            if (trialIds.length > 0) {
                const { error: trialError } = await supabaseAdmin
                    .from('subscriptions')
                    .update({ status: getSubscriptionReplacementStatus('trial'), updated_at: now })
                    .in('id', trialIds)
                if (trialError) return NextResponse.json({ error: trialError.message }, { status: 500 })
            }
            if (activeIds.length > 0) {
                const { error: activeError } = await supabaseAdmin
                    .from('subscriptions')
                    .update({ status: getSubscriptionReplacementStatus('active'), updated_at: now })
                    .in('id', activeIds)
                if (activeError) {
                    const latestActiveId = activeIds[0]
                    const { data: replaced, error: replaceError } = await supabaseAdmin
                        .from('subscriptions')
                        .update(activeSubscription)
                        .eq('id', latestActiveId)
                        .select('id,plan_name,status,starts_at,amount,currency')
                        .single()
                    if (replaceError || !replaced) return NextResponse.json({ error: replaceError?.message || activeError.message }, { status: 500 })
                    await supabaseAdmin.from('subscription_payments').update({ subscription_id: replaced.id }).eq('id', storedPayment.id)
                    return NextResponse.json({ ok: true, subscription: publicSubscription(replaced) })
                }
            }
        }

        const { data: subscription, error: subscriptionError } = await supabaseAdmin.from('subscriptions').insert(activeSubscription).select('id,plan_name,status,starts_at,amount,currency').single()
        if (subscriptionError) {
            const duplicateCompany = /duplicate key|unique/i.test(subscriptionError.message || '')
            const fallbackId = currentRows[0]?.id
            if (duplicateCompany && fallbackId) {
                const { data: replaced, error: replaceError } = await supabaseAdmin
                    .from('subscriptions')
                    .update(activeSubscription)
                    .eq('id', fallbackId)
                    .select('id,plan_name,status,starts_at,amount,currency')
                    .single()
                if (replaceError || !replaced) return NextResponse.json({ error: replaceError?.message || subscriptionError.message }, { status: 500 })
                await supabaseAdmin.from('subscription_payments').update({ subscription_id: replaced.id }).eq('id', storedPayment.id)
                return NextResponse.json({ ok: true, subscription: publicSubscription(replaced) })
            }
            return NextResponse.json({ error: subscriptionError.message }, { status: 500 })
        }

        await supabaseAdmin.from('subscription_payments').update({ subscription_id: subscription.id }).eq('id', storedPayment.id)
        return NextResponse.json({ ok: true, subscription: publicSubscription(subscription) })
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to verify payment.' }, { status: 500 })
    }
}
