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
const { buildManagementAccounts } = await import('../lib/management-accounts.ts')

const period = [{ label: 'Sep', startDate: '2026-09-01', endDate: '2026-09-30' }]

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
    const account = { openingBalance: 500, openingBalanceDate: '2026-10-01', normalBalance: 'DEBIT' }
    assert.equal(signedOpeningBalance(account, '2026-09-30'), 0)
    assert.equal(signedOpeningBalance({ ...account, openingBalanceDate: '2026-09-01' }, '2026-09-30'), 500)
    assert.equal(signedOpeningBalance({ ...account, openingBalanceDate: null }, '2026-09-30'), 500)
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

test('statement of financial position uses opening balances when subledgers are empty', () => {
    const chart = [
        account('Cash and Bank Balance', 'ASSET', 'DEBIT', 80000),
        account('Inventory', 'ASSET', 'DEBIT', 15000),
        account('Receivables', 'ASSET', 'DEBIT', 5000),
        account('Property, Plant & Equipment', 'ASSET', 'DEBIT', 40000),
        account('Capital', 'EQUITY', 'CREDIT', 100000),
        account('Retained Earnings', 'EQUITY', 'CREDIT', 30000),
        account('Drawings', 'EQUITY', 'DEBIT', 10000),
        account('Loan', 'LIABILITY', 'CREDIT', 12000),
        account('Payables', 'LIABILITY', 'CREDIT', 6000),
        account('Accruals', 'LIABILITY', 'CREDIT', 2000),
    ]
    const report = buildManagementAccounts({
        chartOfAccounts: chart,
        journalEntries: [],
        journalLines: [],
    }, period)
    const row = (label) => report.sfp.rows.find((item) => item.label === label)
    assert.equal(row('Cash and Bank Balance').total, 80000)
    assert.equal(row('Inventory').total, 15000)
    assert.equal(row('Property, Plant & Equipment').total, 40000)
    assert.equal(row('Capital').total, 100000)
    assert.equal(row('Retained Earnings').total, 30000)
    assert.equal(row('Drawings').total, -10000)
    assert.equal(row('Loan').total, 12000)
    assert.equal(row('Payables').total, 6000)
    assert.equal(row('Accruals').total, 2000)
    assert.equal(report.sfp.difference, 0)
    assert.equal(report.validation.statementOfFinancialPosition, true)
    assert.equal(report.validation.notes, true)
    assert.equal(report.validation.trialBalance, true)
    assert.equal(report.notes[2].some((item) => item.label === 'Ledger balance'), true)
})

test('live bank and inventory balances are not added on top of opening balances', () => {
    const report = buildManagementAccounts({
        chartOfAccounts: [
            account('Cash and Bank Balance', 'ASSET', 'DEBIT', 80000),
            account('Inventory', 'ASSET', 'DEBIT', 15000),
            account('Capital', 'EQUITY', 'CREDIT', 100000),
        ],
        journalEntries: [],
        journalLines: [],
        bankAccounts: [{ name: 'Zenith — Main', balance: 25000, openingBalance: 20000 }],
        inventory: [{ product: 'Rice', unitCost: 100, closing: 4 }],
    }, period)
    const row = (label) => report.sfp.rows.find((item) => item.label === label)
    assert.equal(row('Cash and Bank Balance').total, 25000)
    assert.equal(row('Inventory').total, 400)
    assert.equal(report.notes[2].some((item) => item.label === 'Ledger balance'), false)
})

test('opening balances are written to existing chart rows and new rows receive database ids', async () => {
    const companyId = 'company-1'
    const rows = [{ id: '11111111-1111-4111-8111-111111111111', code: '3000', name: 'Capital', company_id: companyId }]
    const supabase = {
        from() {
            return {
                select() {
                    return { eq() { return Promise.resolve({ data: rows.map((row) => ({ ...row })), error: null }) } }
                },
                update(values) {
                    return {
                        eq(column, value) {
                            return {
                                eq() {
                                    const row = rows.find((item) => item[column] === value)
                                    if (row) Object.assign(row, values)
                                    return Promise.resolve({ error: null })
                                },
                            }
                        },
                    }
                },
                insert(row) {
                    rows.push(row)
                    return Promise.resolve({ error: null })
                },
            }
        },
    }
    const saved = await persistChartOpeningBalances(supabase, companyId, [
        { id: 'acct-capital', code: '3000', name: 'Capital', accountType: 'EQUITY', normalBalance: 'CREDIT', openingBalance: 250000, openingBalanceDate: '2026-01-01' },
        { id: 'acct-cash-bank', code: '1005', name: 'Cash and Bank Balance', accountType: 'ASSET', accountSubType: 'CURRENT_ASSET', normalBalance: 'DEBIT', isControlAccount: true, isActive: true, currency: 'NGN', openingBalance: 250000, openingBalanceDate: '' },
        { id: 'sales', code: '4000', name: 'Sales Revenue', accountType: 'INCOME', normalBalance: 'CREDIT' },
    ], () => '22222222-2222-4222-8222-222222222222')

    assert.equal(saved.find((account) => account.name === 'Capital').id, rows[0].id)
    assert.equal(rows[0].opening_balance, 250000)
    assert.equal(rows[0].opening_balance_date, '2026-01-01')
    const cash = saved.find((account) => account.name === 'Cash and Bank Balance')
    assert.equal(cash.id, '22222222-2222-4222-8222-222222222222')
    assert.equal(cash.openingBalanceDate, null)
    assert.equal(rows.find((row) => row.name === 'Cash and Bank Balance').company_id, companyId)
    assert.equal(saved.find((account) => account.name === 'Sales Revenue').id, 'sales')
    assert.equal(rows.some((row) => row.name === 'Sales Revenue'), false)
})
