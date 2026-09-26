import test from 'node:test'
import assert from 'node:assert/strict'

const { CLOSE_ACCOUNT_PHRASE, isSuperAdminRole, wipedCompanyBooks, wipeConfirmationPhrase } = await import('../lib/company-lifecycle.ts')

test('only super admin roles can wipe or close a company', () => {
  assert.equal(isSuperAdminRole('super-admin'), true)
  assert.equal(isSuperAdminRole('MD'), true)
  assert.equal(isSuperAdminRole('business_owner'), true)
  assert.equal(isSuperAdminRole('accountant'), false)
  assert.equal(isSuperAdminRole('cashier'), false)
  assert.equal(isSuperAdminRole(''), false)
})

test('wiping books keeps the company and staff sign-in', () => {
  const wiped = wipedCompanyBooks({
    companySettings: { companyName: 'Quantixa Stores', currency: 'NGN', openingCapital: 500000, roles: [{ id: 'md' }] },
    sales: [{ id: 'INV-1' }],
    purchases: [{ id: 'PUR-1' }],
    expenses: [{ id: 'EXP-1' }],
    expenseCategories: ['Rent'],
    inventory: [{ sku: 'SKU-1' }],
    banks: { 'Zenith — Main': 25000 },
    bankAccounts: [{ id: 'bank-1', name: 'Zenith — Main' }],
    bankTxns: [{ id: 'TXN-1' }],
    receivables: [{ id: 'R-1' }],
    payables: [{ id: 'P-1' }],
    prepayments: [{ id: 'PRE-1' }],
    loans: [{ id: 'LN-1' }],
    loanRepayments: [{ id: 'RP-1' }],
    supplierList: ['Ada'],
    customerList: ['Tunde'],
    auditLogs: [{ action: 'SALE' }],
    openingCapital: 500000,
    dailyClose: [{ id: 'DC-1' }],
    roles: [{ id: 'md' }],
    staffMembers: [{ staffId: 'STF-1', username: 'owner' }],
    chartOfAccounts: [{ id: 'cash' }],
    accountingPeriods: [{ id: '2026' }],
    journalEntries: [{ id: 'JE-1', status: 'POSTED' }],
    journalLines: [{ id: 'JL-1' }],
  })

  assert.equal(wiped.companySettings.companyName, 'Quantixa Stores')
  assert.equal(wiped.companySettings.currency, 'NGN')
  assert.equal(wiped.companySettings.openingCapital, 0)
  assert.equal(wiped.openingCapital, 0)
  assert.equal(wiped.staffMembers.length, 1)
  assert.equal(wiped.roles.length, 1)
  assert.deepEqual(wiped.sales, [])
  assert.deepEqual(wiped.banks, {})
  assert.deepEqual(wiped.bankAccounts, [])
  assert.deepEqual(wiped.journalEntries, [])
  assert.deepEqual(wiped.inventory, [])
  assert.equal(wipeConfirmationPhrase('  Quantixa Stores  '), 'Quantixa Stores')
  assert.equal(wipeConfirmationPhrase('   '), 'DELETE')
  assert.equal(CLOSE_ACCOUNT_PHRASE, 'CLOSE')
})
