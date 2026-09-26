import test from 'node:test'
import assert from 'node:assert/strict'

const { calculateBalanceSheet } = await import('../lib/accounting/balance-sheet.js')
const {
  capitalOpeningAmount,
  mergeOpeningBalances,
  persistChartOpeningBalances,
  reconcileCapitalOpening,
  signedOpeningBalance,
} = await import('../lib/accounting/opening-balances.js')

function account(name, accountType, normalBalance, openingBalance, openingBalanceDate = '2026-01-01') {
  return { id: name.toLowerCase().replace(/[^a-z]+/g, '-'), code: name.slice(0, 4), name, accountType, normalBalance, openingBalance, openingBalanceDate }
}

test('opening balance drafts merge onto financial-position accounts and ignore other drafts', () => {
  const chart = [
    { id: 'acct-cash-bank', code: '1005', name: 'Cash and Bank Balance', accountType: 'ASSET', normalBalance: 'DEBIT', openingBalance: 10, openingBalanceDate: '2026-01-01' },
    { id: 'sales', code: '4000', name: 'Sales Revenue', accountType: 'INCOME', normalBalance: 'CREDIT', openingBalance: 5 },
  ]
  const merged = mergeOpeningBalances(chart, { 'acct-cash-bank': 0, sales: 80 }, { 'acct-cash-bank': '' })
  const cash = merged.find((item) => item.name === 'Cash and Bank Balance')
  const revenue = merged.find((item) => item.name === 'Sales Revenue')
  const capital = merged.find((item) => item.name === 'Capital')
  assert.equal(cash.openingBalance, 0)
  assert.equal(cash.openingBalanceDate, null)
  assert.equal(revenue.openingBalance, 5)
  assert.equal(capital.openingBalance, 0)
  assert.equal(merged.filter((item) => item.name === 'Capital').length, 1)
})

test('saved company capital fills an empty capital account without overwriting a posted opening', () => {
  const filled = reconcileCapitalOpening([
    { name: 'Capital', openingBalance: 0 },
    { name: 'Cash', openingBalance: 20 },
  ], 450000)
  assert.equal(capitalOpeningAmount(filled), 450000)
  assert.equal(filled.find((account) => account.name === 'Cash').openingBalance, 20)

  const posted = reconcileCapitalOpening([{ name: 'Capital', openingBalance: 1200 }], 450000)
  assert.equal(capitalOpeningAmount(posted), 1200)
})

test('opening balances dated after the report are excluded', () => {
  const row = { openingBalance: 500, openingBalanceDate: '2026-10-01', normalBalance: 'DEBIT' }
  assert.equal(signedOpeningBalance(row, '2026-09-30'), 0)
  assert.equal(signedOpeningBalance({ ...row, openingBalanceDate: '2026-09-01' }, '2026-09-30'), 500)
  assert.equal(signedOpeningBalance({ ...row, openingBalanceDate: null }, '2026-09-30'), 500)
})

test('ledger totals include brought-forward balances and reduce equity for drawings', () => {
  const chart = [
    account('Cash and Bank Balance', 'ASSET', 'DEBIT', 80000),
    account('Capital', 'EQUITY', 'CREDIT', 100000),
    account('Drawings', 'EQUITY', 'DEBIT', 20000),
  ]
  const rows = calculateBalanceSheet([], [], chart, '2026-09-30')
  const total = (type) => rows.filter((row) => row.accountType === type).reduce((sum, row) => sum + row.balance, 0)
  assert.equal(total('ASSET'), 80000)
  assert.equal(total('EQUITY'), 80000)
  assert.equal(rows.find((row) => row.name === 'Drawings').balance, -20000)
})

test('persistChartOpeningBalances updates known accounts and inserts missing ones', async () => {
  const updates = []
  const inserts = []
  const supabase = {
    from() {
      return {
        select() {
          return {
            eq: async () => ({ data: [{ id: '11111111-1111-1111-1111-111111111111', code: '1005', name: 'Cash and Bank Balance' }], error: null }),
          }
        },
        update(values) {
          return {
            eq() {
              return {
                eq: async () => {
                  updates.push(values)
                  return { error: null }
                },
              }
            },
          }
        },
        insert: async (row) => {
          inserts.push(row)
          return { error: null }
        },
      }
    },
  }

  const saved = await persistChartOpeningBalances(supabase, 'company-1', [
    { id: 'acct-cash-bank', code: '1005', name: 'Cash and Bank Balance', accountType: 'ASSET', normalBalance: 'DEBIT', openingBalance: 2500, openingBalanceDate: '2026-01-15' },
    { id: 'acct-loan', code: '2100', name: 'Loan', accountType: 'LIABILITY', normalBalance: 'CREDIT', openingBalance: 900, openingBalanceDate: '2026-02-01' },
  ], () => '22222222-2222-2222-2222-222222222222')

  assert.equal(updates.length, 1)
  assert.equal(updates[0].opening_balance, 2500)
  assert.equal(inserts.length, 1)
  assert.equal(inserts[0].name, 'Loan')
  assert.equal(saved.find((account) => account.name === 'Cash and Bank Balance').id, '11111111-1111-1111-1111-111111111111')
  assert.equal(saved.find((account) => account.name === 'Loan').id, '22222222-2222-2222-2222-222222222222')
})
