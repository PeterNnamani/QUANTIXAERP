import { normalizePlanName } from './licensing.ts'

export const PLAN_PRICES_NGN: Record<string, number> = {
    'Growth Edition': 450000,
    'Professional Edition': 650000,
    'Enterprise Edition': 900000,
}

export function planAmountKobo(planName: unknown): number | null {
    const plan = normalizePlanName(planName)
    const amount = plan ? PLAN_PRICES_NGN[plan] : undefined
    return amount ? amount * 100 : null
}

export function normalizeBillingEmail(value: unknown): string | null {
    const email = String(value || '').trim().toLowerCase()
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

export function readPaystackMetadata(metadata: unknown): { companyId?: string; planName?: string } {
    let record = metadata
    if (typeof record === 'string') {
        try {
            record = JSON.parse(record)
        } catch {
            record = null
        }
    }
    if (!record || typeof record !== 'object') return {}

    const data = record as Record<string, unknown>
    const fields = Array.isArray(data.custom_fields) ? data.custom_fields : []
    const fieldValue = (name: string) => {
        const field = fields.find((item) => item && typeof item === 'object' && (item as { variable_name?: unknown }).variable_name === name) as { value?: unknown } | undefined
        return field?.value
    }
    const companyId = data.companyId ?? fieldValue('companyId')
    const planName = data.planName ?? fieldValue('planName')
    return {
        companyId: companyId == null || companyId === '' ? undefined : String(companyId),
        planName: planName == null || planName === '' ? undefined : String(planName),
    }
}

export function paymentMatchesPlan(payment: { amount?: unknown; currency?: unknown; metadata?: unknown } | null | undefined, planName: string, companyId: string) {
    if (!payment) return false
    const metadata = readPaystackMetadata(payment.metadata)
    const selectedPlan = normalizePlanName(planName)
    const paidPlan = normalizePlanName(metadata.planName)
    return Boolean(selectedPlan)
        && Number(payment.amount) === planAmountKobo(selectedPlan)
        && String(payment.currency || '').toUpperCase() === 'NGN'
        && metadata.companyId === String(companyId)
        && paidPlan === selectedPlan
}
