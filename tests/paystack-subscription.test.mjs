import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { isPendingPaystackStatus, isValidPaystackSignature, normalizeBillingEmail, paymentMatchesPlan, paystackCallbackUrl, planAmountKobo, readPaystackMetadata } from '../lib/paystack-subscription.ts'

test('licence prices are charged in kobo', () => {
    assert.equal(planAmountKobo('Growth Edition'), 45000000)
    assert.equal(planAmountKobo('Professional Edition'), 65000000)
    assert.equal(planAmountKobo('Enterprise Edition'), 90000000)
    assert.equal(planAmountKobo('Unknown'), null)
})

test('billing email must be a real address', () => {
    assert.equal(normalizeBillingEmail(' Owner@Company.com '), 'owner@company.com')
    assert.equal(normalizeBillingEmail('cashier@local'), null)
    assert.equal(normalizeBillingEmail(''), null)
})

test('successful Paystack charges match the selected company and plan', () => {
    const payment = { amount: '45000000', currency: 'ngn', metadata: { companyId: 'co-1', planName: 'Growth Edition', referrer: 'https://app.example' } }
    assert.equal(paymentMatchesPlan(payment, 'Growth Edition', 'co-1'), true)
    assert.equal(paymentMatchesPlan(payment, 'Growth', 'co-1'), true)
    assert.equal(paymentMatchesPlan(payment, 'Professional Edition', 'co-1'), false)
    assert.equal(paymentMatchesPlan(payment, 'Growth Edition', 'co-2'), false)
})

test('Paystack webhook signatures must match the raw body', () => {
    const body = JSON.stringify({ event: 'charge.success', data: { reference: 'ref-1' } })
    const signature = createHmac('sha512', 'secret').update(body).digest('hex')
    assert.equal(isValidPaystackSignature(body, signature, 'secret'), true)
    assert.equal(isValidPaystackSignature(body, signature, 'other'), false)
    assert.equal(isValidPaystackSignature(body, 'short', 'secret'), false)
})

test('checkout returns to the licensing page', () => {
    const previous = process.env.NEXT_PUBLIC_APP_URL
    delete process.env.NEXT_PUBLIC_APP_URL
    try {
        const request = new Request('https://app.example/api/payments/paystack/initialize', { headers: { 'x-forwarded-host': 'billing.example', 'x-forwarded-proto': 'https' } })
        assert.equal(paystackCallbackUrl(request), 'https://billing.example/subscription-and-licensing')
    } finally {
        if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL
        else process.env.NEXT_PUBLIC_APP_URL = previous
    }
})

test('string and custom-field metadata still identify the subscription', () => {
    const metadata = JSON.stringify({
        custom_fields: [
            { variable_name: 'companyId', value: 'co-9' },
            { variable_name: 'planName', value: 'Enterprise Edition' },
        ],
    })
    assert.deepEqual(readPaystackMetadata(metadata), { companyId: 'co-9', planName: 'Enterprise Edition' })
    assert.equal(paymentMatchesPlan({ amount: 90000000, currency: 'NGN', metadata }, 'Enterprise Edition', 'co-9'), true)
})

test('bank transfer charges stay pending until Paystack confirms them', () => {
    assert.equal(isPendingPaystackStatus('ongoing'), true)
    assert.equal(isPendingPaystackStatus('pending_bank_transfer'), true)
    assert.equal(isPendingPaystackStatus('pending'), true)
    assert.equal(isPendingPaystackStatus('abandoned'), false)
    assert.equal(isPendingPaystackStatus('success'), false)
})
