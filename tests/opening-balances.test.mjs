import test from 'node:test'
import assert from 'node:assert/strict'

const { dashboardCashOpening, financialPositionOpenings } = await import('../lib/opening-balances.ts')
const { buildManagementAccounts } = await import('../lib/management-accounts.ts')
const { outstanding } = await import('../lib/dashboard-metrics.ts')

const accounts = [
    { name: 'Receivables', openingBalance: 500000, openingBalanceDate: '2026-01-01' },
    { name: 'Trade Receivables', openingBalance: 25000 },
    { name: 'Payables', openingBalance: 180000 },
    { name: 'Property, Plant & Equipment', openingBalance: 1200000, openingBalanceDate: '2026-01-01' },
    { name: 'Inventory', openingBalance: 75000 },
    { name: 'Prepayments', openingBalance: 12000 },
    { name: 'Loan', openingBalance: 300000 },
    { name: 'Cash', openingBalance: 40000 },
    { name: 'Cash and Bank Balance', openingBalance: 90000 },
    { name: 'Accruals', openingBalance: 8000, accountType: 'LIABILITY', normalBalance: 'CREDIT' },
    { name: 'Capital', openingBalance: 2000000, accountType: 'EQUITY', normalBalance: 'CREDIT' },
]

test('financial-position openings map onto the operational modules', () => {
    const openings = financialPositionOpenings(accounts)
    assert.equal(openings.receivables, 525000)
    assert.equal(openings.payables, 180000)
    assert.equal(openings.ppe, 1200000)
    assert.equal(openings.inventory, 75000)
    assert.equal(openings.prepayments, 12000)
    assert.equal(openings.loan, 300000)
    assert.equal(openings.cash, 40000)
    assert.equal(openings.cashAndBank, 90000)
    assert.equal(dashboardCashOpening(openings, true), 40000)
    assert.equal(dashboardCashOpening(openings, false), 130000)
})

test('dashboard receivables and payables include brought-forward openings', () => {
    const openings = financialPositionOpenings(accounts)
    const invoices = [{ balance: 15000 }, { outstanding_amount: 5000 }]
    const bills = [{ balance: 2000 }]
    assert.equal(invoices.reduce((sum, item) => sum + outstanding(item), 0) + openings.receivables, 545000)
    assert.equal(bills.reduce((sum, item) => sum + outstanding(item), 0) + openings.payables, 182000)
})

test('management accounts carry opening balances into receivables, payables, assets, and inventory', () => {
    const report = buildManagementAccounts({
        chartOfAccounts: accounts.map((account, index) => ({ id: `acct-${index}`, ...account })),
        journalEntries: [],
        journalLines: [],
        receivables: [{ name: 'Amina Stores', balance: 15000 }],
        payables: [{ supplier: 'Dangote', balance: 2000 }],
        inventory: [{ product: 'Rice', unitCost: 100, closing: 10 }],
        purchases: [{ date: '2026-09-15', total: 50000, status: 'Completed', category: 'Assets' }],
    }, [{ label: 'Sep', startDate: '2026-09-01', endDate: '2026-09-30' }])

    assert.equal(report.sfp.rows.find((row) => row.label === 'Receivables')?.total, 540000)
    assert.equal(report.sfp.rows.find((row) => row.label === 'Payables')?.total, 182000)
    assert.equal(report.sfp.rows.find((row) => row.label === 'Inventory')?.total, 76000)
    assert.equal(report.sfp.rows.find((row) => row.label === 'Property, Plant & Equipment')?.total, 1250000)
    assert.equal(report.notes[5].find((row) => row.label === 'Opening balance')?.total, 525000)
    assert.equal(report.ppe.rows[0].total, 1200000)
    assert.equal(report.ppe.rows[1].total, 50000)
})
