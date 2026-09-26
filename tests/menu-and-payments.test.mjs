import test from 'node:test'
import assert from 'node:assert/strict'

import { getVisibleNavigationItems, savedMenuAccess } from '../lib/rbac.ts'
import { displayOpenBalance, moveBankBalance, settledOpenItem } from '../lib/open-item-payment.ts'
import { outstanding } from '../lib/dashboard-metrics.ts'

test('saved staff menu selections replace the role menu', () => {
    const cashier = {
        role: 'cashier',
        roleId: 'cashier',
        permissions: ['dashboard', 'sales', 'expenses'],
        visibleMenus: ['dashboard', 'sales', 'expenses', 'reports'],
    }
    const access = savedMenuAccess(cashier)
    assert.ok(access)
    const hrefs = getVisibleNavigationItems({ role: 'cashier', ...access }).map((item) => item.href)
    assert.ok(hrefs.includes('/expenses'))
    assert.ok(hrefs.includes('/reports'))
    assert.ok(!hrefs.includes('/settings'))
})

test('role-default lists do not lock a trial owner out of operational menus', () => {
    const owner = {
        role: 'business-owner',
        permissions: ['dashboard', 'admin', 'settings'],
        visibleMenus: ['dashboard', 'admin', 'settings', 'bankTxn', 'banks'],
        subscriptionStatus: 'trial',
        subscriptionPlan: 'Professional Edition',
    }
    assert.equal(savedMenuAccess(owner), null)
    const hrefs = getVisibleNavigationItems(owner).map((item) => item.href)
    assert.ok(hrefs.includes('/sales'))
})

test('an empty saved access map shows no menus', () => {
    const access = savedMenuAccess({ role: 'accountant', accessLevels: {} })
    assert.deepEqual(access?.visibleMenus, [])
    assert.deepEqual(getVisibleNavigationItems({ role: 'accountant', ...access }), [])
})

test('receivable and payable payments reduce the balance the dashboard reads', () => {
    const open = { id: 'AR-1', balance: 1000, balanceDue: 1000, amount: 1000, amountPaid: 0, status: 'Unpaid' }
    const partial = settledOpenItem(open, 400)
    assert.equal(partial.balance, 600)
    assert.equal(partial.balanceDue, 600)
    assert.equal(partial.outstandingAmount, 600)
    assert.equal(outstanding(partial), 600)
    assert.equal(displayOpenBalance(partial), 600)

    const paid = settledOpenItem(partial, 600)
    assert.equal(paid.balance, 0)
    assert.equal(paid.status, 'Paid')
    assert.equal(outstanding(paid), 0)
    assert.equal(displayOpenBalance({ balance: 0, balanceDue: 1000, amount: 1000 }), 0)
})

test('payment movements update the named bank account and unassigned cash', () => {
    const accounts = [{ id: 'bank-1', name: 'Zenith', balance: 150000 }]
    const received = moveBankBalance(accounts, { Zenith: 150000 }, 'bank-1', 'Zenith', 25000)
    assert.equal(received.bankAccounts[0].balance, 175000)
    assert.equal(received.banks.Zenith, 175000)

    const paid = moveBankBalance(received.bankAccounts, received.banks, '', 'Cash / Other', -10000)
    assert.equal(paid.banks['Cash / Other'], -10000)
    assert.equal(paid.bankAccounts[0].balance, 175000)
})
