import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBillingEmail, paymentMatchesPlan, planAmountKobo, readPaystackMetadata } from '../lib/paystack-subscription.ts'

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
