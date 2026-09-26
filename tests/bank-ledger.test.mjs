import test from 'node:test'
import assert from 'node:assert/strict'

const { applyBankMovements, displayBankAccounts, maskAccountNumber, parseBankStatement, runningBalanceById } = await import('../lib/bank-ledger.ts')

test('bank pages use saved accounts and mask the account number', () => {
  const accounts = displayBankAccounts(
    { 'Zenith — Main': 150000, 'Cash box': 4000 },
    [{
      id: 'bank-1',
      name: 'Zenith — Main',
      institution: 'Zenith Bank',
      accountNumber: '0123456789',
      accountType: 'Current',
      currency: 'NGN',
      branch: 'Ikeja',
      openingBalance: 100000,
      openingBalanceDate: '2026-01-01',
      balance: 0,
      status: 'active',
    }],
  )
  assert.equal(accounts[0].institution, 'Zenith Bank')
  assert.equal(accounts[0].balance, 150000)
  assert.equal(accounts[0].accountType, 'Current')
  assert.equal(accounts[1].name, 'Cash box')
  assert.equal(maskAccountNumber('0123456789'), '•••• 6789')
  assert.equal(maskAccountNumber(''), 'Not provided')
})

test('transfers update both the balance map and the account record', () => {
  const next = applyBankMovements({
    banks: { 'Zenith — Main': 150000, 'Access — Ops': 20000 },
    bankAccounts: [
      { id: 'a', name: 'Zenith — Main', balance: 150000 },
      { id: 'b', name: 'Access — Ops', balance: 20000 },
    ],
  }, [
    { name: 'Zenith — Main', delta: -5000 },
    { name: 'Access — Ops', delta: 5000 },
  ])
  assert.equal(next.banks['Zenith — Main'], 145000)
  assert.equal(next.banks['Access — Ops'], 25000)
  assert.equal(next.bankAccounts[0].balance, 145000)
  assert.equal(next.bankAccounts[1].balance, 25000)
})

test('statement import reads real rows and running balances stay on each bank', () => {
  const rows = parseBankStatement('Date,Description,Debit,Credit\n26/09/2026,Customer receipt,,15000\n2026-09-26,Bank charge,250,\n')
  assert.deepEqual(rows, [
    { date: '2026-09-26', description: 'Customer receipt', amount: 15000 },
    { date: '2026-09-26', description: 'Bank charge', amount: -250 },
  ])
  const balances = runningBalanceById([
    { id: 'b', date: '2026-09-02', bank: 'Zenith — Main', amount: -250 },
    { id: 'a', date: '2026-09-01', bank: 'Zenith — Main', amount: 15000 },
    { id: 'c', date: '2026-09-01', bank: 'Access — Ops', amount: 4000 },
  ], { 'Zenith — Main': 100000, 'Access — Ops': 0 })
  assert.equal(balances.a, 115000)
  assert.equal(balances.b, 114750)
  assert.equal(balances.c, 4000)
})
