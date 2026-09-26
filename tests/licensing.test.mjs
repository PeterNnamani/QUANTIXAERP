import test from 'node:test'
import assert from 'node:assert/strict'
import { getPlanUserLimit, getSubscriptionReplacementStatus, getTrialEndDate, isTrialActive, planCanAccessRoute, planHasFeature, seatLimitForSubscription, TRIAL_PLAN } from '../lib/licensing.ts'

test('new companies receive full access for 14 days', () => {
    const startedAt = '2026-01-01T00:00:00.000Z'
    assert.equal(isTrialActive(startedAt, '2026-01-14T23:59:59.000Z'), true)
    assert.equal(isTrialActive(startedAt, getTrialEndDate(startedAt)), false)
    assert.equal(planCanAccessRoute('Professional Edition', '/sales'), true)
    assert.equal(planCanAccessRoute('Professional Edition', '/staff-management'), true)
    assert.equal(planCanAccessRoute(undefined, '/sales', 'trial'), true)
    assert.equal(TRIAL_PLAN, 'Professional Edition')
})

test('plan entitlements inherit lower-tier features', () => {
    assert.equal(planHasFeature('Growth Edition', 'sales-purchasing'), true)
    assert.equal(planHasFeature('Professional Edition', 'inventory-management'), true)
    assert.equal(planHasFeature('Professional Edition', 'crm'), false)
    assert.equal(planHasFeature('Enterprise Edition', 'custom-reports'), true)
})

test('plan routes enforce the advertised tier boundary', () => {
    assert.equal(planCanAccessRoute('Growth Edition', '/asset-schedule'), false)
    assert.equal(planCanAccessRoute('Growth Edition', '/monthly-report'), true)
    assert.equal(planCanAccessRoute('Growth Edition', '/sales'), true)
    assert.equal(planCanAccessRoute('Professional Edition', '/asset-schedule'), true)
    assert.equal(planCanAccessRoute('Professional Edition', '/annual-report'), true)
    assert.equal(planCanAccessRoute('Professional Edition', '/tax'), false)
    assert.equal(planCanAccessRoute('Enterprise Edition', '/tax'), true)
    assert.equal(planCanAccessRoute('Enterprise Edition', '/audit'), true)
    assert.equal(planCanAccessRoute('Growth Edition', '/tax', 'trial'), true)
    assert.equal(planCanAccessRoute(undefined, '/dashboard', 'expired'), false)
    assert.equal(planCanAccessRoute('Professional Edition', '/staff-management'), true)
    assert.equal(planCanAccessRoute('Enterprise Edition', '/staff-management'), true)
    assert.equal(planCanAccessRoute('Professional Edition', '/role-management'), true)
    assert.equal(planCanAccessRoute('Growth Edition', '/sales'), true)
    assert.equal(planCanAccessRoute('Growth Edition', '/banks'), true)
    assert.equal(planCanAccessRoute('Growth Edition', '/product-manager'), false)
    assert.equal(planCanAccessRoute('Professional Edition', '/product-manager'), true)
})

test('Growth includes the core owner operations', () => {
    assert.equal(planHasFeature('Growth Edition', 'banking'), true)
    assert.equal(planHasFeature('Growth Edition', 'product-management'), true)
    assert.equal(planHasFeature('Growth Edition', 'customer-supplier-management'), true)
})

test('user limits count the company owner seat', () => {
    assert.equal(getPlanUserLimit('Growth Edition'), 1)
    assert.equal(getPlanUserLimit('Professional Edition'), 5)
    assert.equal(getPlanUserLimit('Enterprise Edition'), null)
    assert.equal(seatLimitForSubscription('Growth Edition', 'trial'), 5)
    assert.equal(seatLimitForSubscription('Growth Edition', 'active'), 1)
    assert.equal(seatLimitForSubscription('Enterprise Edition', 'active'), null)
    assert.equal(seatLimitForSubscription('Professional Edition', 'expired'), 0)
})

test('replacing a subscription closes the previous state correctly', () => {
    assert.equal(getSubscriptionReplacementStatus('trial'), 'cancelled')
    assert.equal(getSubscriptionReplacementStatus('active'), 'superseded')
})