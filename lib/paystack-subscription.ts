import { createHmac, timingSafeEqual } from 'node:crypto'
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

export function isValidPaystackSignature(rawBody: string, signature: string | null, secret: string) {
    if (!signature || !secret) return false
    const expected = createHmac('sha512', secret).update(rawBody).digest('hex')
    const received = Buffer.from(signature)
    const computed = Buffer.from(expected)
    return received.length === computed.length && timingSafeEqual(received, computed)
}

export function paystackCallbackUrl(request: Request) {
    const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '')
    if (configured) return `${configured}/subscription-and-licensing`
    const url = new URL(request.url)
    const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
    const origin = forwardedHost ? `${forwardedProto || url.protocol.replace(':', '')}://${forwardedHost}` : url.origin
    return `${origin}/subscription-and-licensing`
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

/** Paystack defaults this to ~30s; bank transfers for licence amounts need far longer. */
export const PAYSTACK_BANK_TRANSFER_SESSION_SECONDS = 60 * 60

const PENDING_PAYMENT_STATUSES = new Set(['ongoing', 'pending', 'processing', 'queued', 'pending_bank_transfer'])

export function isPendingPaystackStatus(status: unknown) {
    return PENDING_PAYMENT_STATUSES.has(String(status || '').toLowerCase())
}

export async function ensurePaystackPaymentSessionTimeout(secretKey: string, minimumSeconds = PAYSTACK_BANK_TRANSFER_SESSION_SECONDS) {
    try {
        const currentResponse = await fetch('https://api.paystack.co/integration/payment_session_timeout', {
            headers: { Authorization: `Bearer ${secretKey}` },
        })
        const currentResult = await currentResponse.json()
        const current = Number(currentResult?.data?.payment_session_timeout)
        // 0 disables the timeout entirely, which is also acceptable for bank transfer.
        if (currentResponse.ok && currentResult.status && (current === 0 || current >= minimumSeconds)) return current

        const updateResponse = await fetch('https://api.paystack.co/integration/payment_session_timeout', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeout: minimumSeconds }),
        })
        const updateResult = await updateResponse.json()
        if (!updateResponse.ok || !updateResult.status) return Number.isFinite(current) ? current : null
        return Number(updateResult?.data?.payment_session_timeout) || minimumSeconds
    } catch {
        return null
    }
}
