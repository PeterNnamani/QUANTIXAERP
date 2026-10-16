import { supabaseAdmin } from '@/lib/supabase.server'
import { getSubscriptionReplacementStatus, normalizePlanName, type PlanName } from '@/lib/licensing'
import { paymentMatchesPlan, readPaystackMetadata } from '@/lib/paystack-subscription'

type PaystackCharge = {
    id?: unknown
    amount?: unknown
    currency?: unknown
    status?: unknown
    paid_at?: unknown
    metadata?: unknown
    gateway_response?: unknown
}

function publicSubscription<T extends { plan_name?: unknown }>(subscription: T) {
    const planName = normalizePlanName(subscription.plan_name) || subscription.plan_name
    return { ...subscription, plan_name: planName }
}

export async function fulfillPaystackCharge(reference: string, expected?: { companyId?: string; planName?: string }) {
    if (!reference) return { status: 400, body: { error: 'Payment details are incomplete.' } }
    if (!process.env.PAYSTACK_SECRET_KEY || !supabaseAdmin) return { status: 500, body: { error: 'Payment service is not configured.' } }

    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    })
    const result = await response.json()
    const payment = result.data as PaystackCharge | undefined
    if (!response.ok || !result.status || payment?.status !== 'success') {
        const error = payment?.status === 'abandoned'
            ? 'Paystack did not receive this payment. The checkout expired before the money was confirmed, so the bank reversed it. Keep this page open and pay the exact amount by bank transfer.'
            : payment?.gateway_response || result.message || 'Payment was not successful.'
        return { status: 400, body: { error } }
    }

    const metadata = readPaystackMetadata(payment.metadata)
    const plan = normalizePlanName(expected?.planName) || normalizePlanName(metadata.planName)
    const companyId = String(expected?.companyId || metadata.companyId || '')
    if (!plan || !companyId || !paymentMatchesPlan(payment, plan, companyId)) {
        return { status: 400, body: { error: 'Payment amount, currency, or details do not match the selected plan.' } }
    }

    const { data: existingSubscription, error: existingSubscriptionError } = await supabaseAdmin
        .from('subscriptions')
        .select('id,plan_name,status,starts_at,amount,currency')
        .eq('company_id', companyId)
        .eq('paystack_reference', reference)
        .maybeSingle()
    if (existingSubscriptionError) return { status: 500, body: { error: existingSubscriptionError.message } }
    if (existingSubscription) {
        const storedPlan = normalizePlanName(existingSubscription.plan_name)
        if (storedPlan && storedPlan !== existingSubscription.plan_name) {
            await supabaseAdmin.from('subscriptions').update({ plan_name: storedPlan }).eq('id', existingSubscription.id)
        }
        return { status: 200, body: { ok: true, subscription: publicSubscription({ ...existingSubscription, plan_name: storedPlan || existingSubscription.plan_name }) } }
    }

    const recorded = await recordPaidSubscription(companyId, plan, reference, payment)
    return recorded
}

async function recordPaidSubscription(companyId: string, plan: PlanName, reference: string, payment: PaystackCharge) {
    if (!supabaseAdmin) return { status: 500, body: { error: 'Payment service is not configured.' } }
    const now = new Date().toISOString()
    const { data: storedPayment, error: paymentError } = await supabaseAdmin.from('subscription_payments').upsert({
        company_id: companyId,
        plan_name: plan,
        amount: Number(payment.amount) / 100,
        currency: payment.currency,
        paystack_reference: reference,
        paystack_transaction_id: String(payment.id),
        status: 'success',
        paid_at: payment.paid_at || now,
        metadata: payment.metadata || null,
    }, { onConflict: 'paystack_reference' }).select('id').single()
    if (paymentError || !storedPayment) return { status: 500, body: { error: paymentError?.message || 'Unable to record payment.' } }

    const { data: currentSubscriptions, error: currentSubscriptionError } = await supabaseAdmin
        .from('subscriptions')
        .select('id,status')
        .eq('company_id', companyId)
        .in('status', ['trial', 'active'])
    if (currentSubscriptionError) return { status: 500, body: { error: currentSubscriptionError.message } }

    const activeSubscription = {
        company_id: companyId,
        plan_name: plan,
        status: 'active',
        amount: Number(payment.amount) / 100,
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
            if (trialError) return { status: 500, body: { error: trialError.message } }
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
                if (replaceError || !replaced) return { status: 500, body: { error: replaceError?.message || activeError.message } }
                await supabaseAdmin.from('subscription_payments').update({ subscription_id: replaced.id }).eq('id', storedPayment.id)
                return { status: 200, body: { ok: true, subscription: publicSubscription(replaced) } }
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
            if (replaceError || !replaced) return { status: 500, body: { error: replaceError?.message || subscriptionError.message } }
            await supabaseAdmin.from('subscription_payments').update({ subscription_id: replaced.id }).eq('id', storedPayment.id)
            return { status: 200, body: { ok: true, subscription: publicSubscription(replaced) } }
        }
        return { status: 500, body: { error: subscriptionError.message } }
    }

    await supabaseAdmin.from('subscription_payments').update({ subscription_id: subscription.id }).eq('id', storedPayment.id)
    return { status: 200, body: { ok: true, subscription: publicSubscription(subscription) } }
}
