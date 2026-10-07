import { supabaseAdmin } from '@/lib/supabase.server'
import { getTrialEndDate, isTrialActive, normalizePlanName, pickCurrentSubscription, TRIAL_PLAN } from '@/lib/licensing'

export async function loadCompanySubscription(companyId: string) {
    if (!supabaseAdmin) return { subscription: null, error: 'Payment service is not configured.' }

    const { data, error } = await supabaseAdmin
        .from('subscriptions')
        .select('id,plan_name,status,starts_at,expires_at,amount,currency,created_at')
        .eq('company_id', companyId)
        .in('status', ['trial', 'active'])
        .order('created_at', { ascending: false })

    if (error) return { subscription: null, error: error.message }

    const current = pickCurrentSubscription(data)
    if (current) {
        const planName = normalizePlanName(current.plan_name) || current.plan_name
        return { subscription: { ...current, plan_name: planName }, error: null }
    }

    const { data: company } = await supabaseAdmin.from('companies').select('created_at').eq('id', companyId).maybeSingle()
    if (company?.created_at && isTrialActive(company.created_at)) {
        const trialEndsAt = getTrialEndDate(company.created_at)
        return {
            subscription: {
                plan_name: TRIAL_PLAN,
                status: 'trial',
                starts_at: company.created_at,
                expires_at: trialEndsAt?.toISOString() || null,
                amount: 0,
                currency: 'NGN',
            },
            error: null,
        }
    }

    return { subscription: null, error: null }
}
