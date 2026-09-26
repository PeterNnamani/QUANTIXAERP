import test from 'node:test'
import assert from 'node:assert/strict'

const {
  applyBankAccountSave,
  dedupeBankAccounts,
  mergeLoadedBankAccounts,
  planBankWrites,
  planProductWrites,
  replaceInventoryItem,
  replaceRole,
} = await import('../lib/record-upsert.js')

test('saving a bank with the same name updates the original account', () => {
  const created = applyBankAccountSave({
    bankAccounts: [],
    banks: {},
    bankTxns: [],
  }, {
    name: 'Zenith — Main',
    institution: 'Zenith',
    accountNumber: '0123456789',
    accountType: 'Current',
    currency: 'NGN',
    openingBalance: 1000,
    openingBalanceDate: '2026-01-01',
    id: '11111111-1111-4111-8111-111111111111',
  })
  const edited = applyBankAccountSave({
    bankAccounts: created.bankAccounts,
    banks: created.banks,
    bankTxns: [{ id: 'TXN-1', bank: 'Zenith — Main', amount: 50 }],
    expenses: [{ id: 'EXP-1', bank: 'Zenith — Main' }],
    sales: [{ id: 'INV-1', paymentAccount: 'Zenith — Main' }],
  }, {
    editingId: created.account.id,
    name: 'Zenith — Operating',
    institution: 'Zenith',
    accountNumber: '999',
    accountType: 'Savings',
    currency: 'NGN',
    openingBalance: 1000,
    openingBalanceDate: '2026-01-01',
  })

  assert.equal(edited.updated, true)
  assert.equal(edited.bankAccounts.length, 1)
  assert.equal(edited.account.id, '11111111-1111-4111-8111-111111111111')
  assert.equal(edited.account.name, 'Zenith — Operating')
  assert.equal(edited.account.accountType, 'Savings')
  assert.equal(edited.banks['Zenith — Main'], undefined)
  assert.equal(edited.banks['Zenith — Operating'], 1000)
  assert.equal(edited.bankTxns[0].bank, 'Zenith — Operating')
  assert.equal(edited.expenses[0].bank, 'Zenith — Operating')
  assert.equal(edited.sales[0].paymentAccount, 'Zenith — Operating')
})

test('a second save of an existing bank name does not append another account', () => {
  const books = {
    bankAccounts: [{ id: 'bank-1', name: 'Access — Ops', institution: 'Access', openingBalance: 20, balance: 80, accountType: 'Current', status: 'active' }],
    banks: { 'Access — Ops': 80 },
  }
  const saved = applyBankAccountSave(books, {
    name: 'Access — Ops',
    institution: 'Access',
    accountNumber: '44',
    accountType: 'Current',
    currency: 'NGN',
    openingBalance: 20,
    openingBalanceDate: '2026-02-01',
  })
  assert.equal(saved.conflict, false)
  assert.equal(saved.updated, true)
  assert.equal(saved.bankAccounts.length, 1)
  assert.equal(saved.account.id, 'bank-1')
  assert.equal(saved.account.accountNumber, '44')
  assert.equal(saved.account.balance, 80)
  assert.equal(saved.account.accountType, 'Current')
  assert.equal(saved.account.openingBalance, 20)
})

test('renaming onto a different bank is rejected', () => {
  const saved = applyBankAccountSave({
    bankAccounts: [
      { id: 'a', name: 'Zenith — Main', openingBalance: 10, balance: 10 },
      { id: 'b', name: 'Access — Ops', openingBalance: 5, balance: 5 },
    ],
    banks: {},
  }, { editingId: 'a', name: 'Access — Ops', openingBalance: 10 })
  assert.equal(saved.conflict, true)
  assert.equal(saved.bankAccounts.length, 2)
})

test('duplicate bank names collapse onto the original id', () => {
  const accounts = dedupeBankAccounts([
    { id: 'original', name: 'GTBank — Shop', balance: 10, accountType: 'Current' },
    { id: 'copy', name: 'gtbank — shop', balance: 40, accountType: 'Savings' },
  ])
  assert.equal(accounts.length, 1)
  assert.equal(accounts[0].id, 'original')
  assert.equal(accounts[0].accountType, 'Savings')
  assert.equal(accounts[0].balance, 40)
})

test('loaded banks with the same name and different ids stay as one account', () => {
  const merged = mergeLoadedBankAccounts(
    [{ id: 'client-id', name: 'Zenith — Main', balance: 150, openingBalance: 100 }],
    [{ id: 'db-id', name: 'Zenith — Main', balance: 90, openingBalance: 100, institution: 'Zenith' }],
  )
  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, 'db-id')
  assert.equal(merged[0].balance, 150)
  assert.equal(merged[0].institution, 'Zenith')
})

test('bank persistence reuses the database id when the name already exists', () => {
  const planned = planBankWrites(
    [{ id: '22222222-2222-4222-8222-222222222222', name: 'Zenith — Main' }],
    [{ id: '11111111-1111-4111-8111-111111111111', name: 'Zenith — Main', balance: 10 }],
  )
  assert.equal(planned.accounts.length, 1)
  assert.equal(planned.accounts[0].id, '22222222-2222-4222-8222-222222222222')
  assert.equal(planned.idMap['11111111-1111-4111-8111-111111111111'], '22222222-2222-4222-8222-222222222222')
})

test('editing a product replaces the existing sku or name', () => {
  const inventory = [
    { product: 'Rice', sku: 'RICE-1', closing: 4, openQty: 4, purchased: 2, sold: 1, unitCost: 10 },
    { product: 'Beans', sku: 'BEAN-1', closing: 3, openQty: 3, purchased: 0, sold: 0, unitCost: 8 },
  ]
  const renamed = replaceInventoryItem(inventory, {
    product: 'Rice 50kg',
    sku: 'RICE-1',
    closing: 9,
    openQty: 9,
    unitCost: 12,
    dept: 'Grains',
  }, { product: 'Rice', sku: 'RICE-1' })
  assert.equal(renamed.updated, true)
  assert.equal(renamed.inventory.length, 2)
  assert.equal(renamed.inventory[0].product, 'Rice 50kg')
  assert.equal(renamed.inventory[0].sku, 'RICE-1')
  assert.equal(renamed.inventory[0].purchased, 2)
  assert.equal(renamed.inventory[0].sold, 1)
  assert.equal(renamed.inventory[0].closing, 9)

  const sameName = replaceInventoryItem(renamed.inventory, {
    product: 'Beans',
    sku: 'BEAN-9',
    closing: 6,
    openQty: 6,
    unitCost: 9,
    dept: 'Grains',
  })
  assert.equal(sameName.inventory.filter((item) => item.product === 'Beans').length, 1)
  assert.equal(sameName.inventory.find((item) => item.product === 'Beans').sku, 'BEAN-9')
})

test('product persistence retargets an existing name instead of inserting a second sku', () => {
  const writes = planProductWrites(
    [{ id: 'prod-1', sku: 'RICE-1', name: 'Rice' }],
    [
      { product: 'Rice', sku: 'RICE-2', closing: 5 },
      { product: 'Rice', sku: 'RICE-3', closing: 1 },
    ],
  )
  assert.equal(writes.length, 1)
  assert.equal(writes[0].item.sku, 'RICE-2')
  assert.equal(writes[0].renameFromId, 'prod-1')
})

test('saving a role id or name updates the existing role', () => {
  const created = replaceRole([], { id: 'cashier', name: 'Cashier', permissions: ['dashboard'] })
  const edited = replaceRole(created.roles, { id: 'cashier', name: 'Cashier Lead', permissions: ['dashboard', 'sales'] })
  assert.equal(edited.updated, true)
  assert.equal(edited.roles.length, 1)
  assert.equal(edited.roles[0].id, 'cashier')
  assert.equal(edited.roles[0].name, 'Cashier Lead')
  assert.deepEqual(edited.roles[0].permissions, ['dashboard', 'sales'])

  const byName = replaceRole(edited.roles, { id: 'cashier-lead', name: 'Cashier Lead', permissions: ['sales'] })
  assert.equal(byName.roles.length, 1)
  assert.equal(byName.roles[0].id, 'cashier')
  assert.deepEqual(byName.roles[0].permissions, ['sales'])
})
