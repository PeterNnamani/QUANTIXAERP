import test from 'node:test'
import assert from 'node:assert/strict'

const {
  applyBankAccountSave,
  dedupeBankAccounts,
  planBankWrites,
} = await import('../lib/bank-account-save.js')

test('editing a bank updates the same id and refreshes the banks map for cards', () => {
  const books = {
    banks: { 'Zenith Bank — Main': 1000 },
    bankAccounts: [{
      id: 'bank-1',
      name: 'Zenith Bank — Main',
      institution: 'Zenith Bank',
      accountNumber: '0123456789',
      accountType: 'Current',
      currency: 'NGN',
      branch: '',
      openingBalance: 1000,
      openingBalanceDate: '2026-01-01',
      balance: 1000,
      status: 'active',
    }],
    bankTxns: [{ id: 't1', bank: 'Zenith Bank — Main', amount: 50 }],
    expenses: [{ id: 'e1', bank: 'Zenith Bank — Main' }],
    sales: [{ id: 's1', paymentAccount: 'Zenith Bank — Main' }],
  }

  const saved = applyBankAccountSave(books, {
    editingId: 'bank-1',
    name: 'GTBank — Operating',
    institution: 'GTBank',
    accountNumber: '9876543210',
    accountType: 'Savings',
    currency: 'USD',
    openingBalance: 2500,
    openingBalanceDate: '2026-03-01',
    status: 'active',
  })

  assert.equal(saved.conflict, false)
  assert.equal(saved.updated, true)
  assert.equal(saved.account.id, 'bank-1')
  assert.equal(saved.account.name, 'GTBank — Operating')
  assert.equal(saved.account.institution, 'GTBank')
  assert.equal(saved.account.accountNumber, '9876543210')
  assert.equal(saved.account.balance, 2500)
  assert.equal(saved.banks['GTBank — Operating'], 2500)
  assert.equal(saved.banks['Zenith Bank — Main'], undefined)
  assert.equal(saved.bankAccounts.length, 1)
  assert.equal(saved.bankTxns[0].bank, 'GTBank — Operating')
  assert.equal(saved.expenses[0].bank, 'GTBank — Operating')
  assert.equal(saved.sales[0].paymentAccount, 'GTBank — Operating')
})

test('creating a bank with an existing name updates that account instead of duplicating', () => {
  const books = {
    banks: { 'Zenith Bank — Main': 400 },
    bankAccounts: [{
      id: 'bank-1',
      name: 'Zenith Bank — Main',
      institution: 'Zenith Bank',
      accountNumber: '111',
      accountType: 'Current',
      currency: 'NGN',
      branch: '',
      openingBalance: 400,
      openingBalanceDate: '2026-01-01',
      balance: 400,
      status: 'active',
    }],
    bankTxns: [],
    expenses: [],
    sales: [],
  }

  const saved = applyBankAccountSave(books, {
    name: 'Zenith Bank — Main',
    institution: 'Zenith Bank',
    accountNumber: '222',
    accountType: 'Current',
    currency: 'NGN',
    openingBalance: 400,
    openingBalanceDate: '2026-01-01',
    status: 'active',
  })

  assert.equal(saved.updated, true)
  assert.equal(saved.bankAccounts.length, 1)
  assert.equal(saved.account.accountNumber, '222')
})

test('planBankWrites reuses the database row when the local id differs but the name matches', () => {
  const planned = planBankWrites(
    [{ id: 'db-1', name: 'Zenith Bank — Main' }],
    [{ id: 'local-1', name: 'Zenith Bank — Main', balance: 10 }],
  )
  assert.equal(planned.accounts[0].id, 'db-1')
  assert.equal(planned.idMap['local-1'], 'db-1')
})

test('dedupeBankAccounts keeps a single row per name', () => {
  const rows = dedupeBankAccounts([
    { id: 'a', name: 'Cash', balance: 1 },
    { id: 'b', name: 'Cash', balance: 2, accountNumber: '99' },
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'a')
  assert.equal(rows[0].accountNumber, '99')
  assert.equal(rows[0].balance, 2)
})
