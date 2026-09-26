import test from 'node:test'
import assert from 'node:assert/strict'

const { bankTxnKey, buildDefaultReportPeriods, businessReference, selectUnpostedJournals, shouldPostExpenseCash, subledgerReference } = await import('../lib/accounting/sync.js')
const { buildManagementAccounts } = await import('../lib/management-accounts.ts')

test('business reference survives a database reload', () => {
    assert.equal(businessReference({ id: '8b6d6c3e-6e3a-4a1e-9c1a-0d4e6f8a9b21', reference: 'INV-1001' }), 'INV-1001')
    assert.equal(businessReference({ id: 'EXP-2001' }), 'EXP-2001')
    assert.equal(subledgerReference({ id: 'AR-INV-1001', invoice: 'INV-1001', sourceSaleId: 'INV-1001' }), 'INV-1001')
})

test('new journals are saved as drafts until their lines balance', () => {
    const entryId = '11111111-1111-4111-8111-111111111111'
    const cashId = '22222222-2222-4222-8222-222222222222'
    const revenueId = '33333333-3333-4333-8333-333333333333'
    const pending = selectUnpostedJournals(
        [{ id: entryId, entryDate: '2026-09-26', status: 'POSTED' }],
        [
            { id: '44444444-4444-4444-8444-444444444444', entryId, accountId: cashId, debit: 50, credit: 0 },
            { id: '55555555-5555-4555-8555-555555555555', entryId, accountId: revenueId, debit: 0, credit: 50 },
        ],
        []
    )
    assert.equal(pending.entries[0].status, 'DRAFT')
    assert.equal(pending.lines.length, 2)

    const alreadyPosted = selectUnpostedJournals(
        [{ id: entryId, entryDate: '2026-09-26', status: 'POSTED' }],
        [{ id: '44444444-4444-4444-8444-444444444444', entryId, accountId: cashId, debit: 50, credit: 0 }],
        [entryId]
    )
    assert.equal(alreadyPosted.entries.length, 0)
})

test('expense cash is not posted twice or for void rows', () => {
    const posted = new Set(['PAY-1'])
    assert.equal(shouldPostExpenseCash({ id: 'PAY-1', amount: 100, status: 'Paid' }, posted), false)
    assert.equal(shouldPostExpenseCash({ id: 'EXP-9', amount: 100, status: 'VOID' }, posted), false)
    assert.equal(shouldPostExpenseCash({ id: 'EXP-9', amount: 100, status: 'Paid' }, posted), true)
})

test('report periods include the current month and real month ends', () => {
    const periods = buildDefaultReportPeriods(new Date('2026-09-26T12:00:00Z'))
    assert.equal(periods[0].label, 'Oct-Mar')
    assert.equal(periods.at(-1).label, 'Sep')
    assert.equal(periods.at(-1).endDate, '2026-09-30')
    assert.equal(periods.find((period) => period.label === 'Apr').endDate, '2026-04-30')
    assert.equal(periods.find((period) => period.label === 'Jun').endDate, '2026-06-30')
})

test('bank transaction keys ignore repeated saves of the same movement', () => {
    const first = bankTxnKey('bank-1', '2026-09-26', 'Payment received for sale INV-1', 1500)
    const repeat = bankTxnKey('bank-1', '2026-09-26T00:00:00.000Z', 'Payment received for sale INV-1', '1500')
    assert.equal(first, repeat)
})

test('credit sales reach the profit statement without doubling cash sales', () => {
    const report = buildManagementAccounts({
        chartOfAccounts: [
            { id: 'cash', name: 'Cash', accountType: 'ASSET', normalBalance: 'DEBIT' },
            { id: 'revenue', name: 'Sales Revenue', accountType: 'INCOME', normalBalance: 'CREDIT' },
            { id: 'bank-charge', name: 'Bank Charges', accountType: 'EXPENSE', normalBalance: 'DEBIT' },
        ],
        journalEntries: [{ id: 'je-1', entryDate: '2026-09-02', status: 'POSTED', sourceModule: 'SALES_PAYMENT', sourceId: 'INV-CASH', reference: 'INV-CASH' }],
        journalLines: [
            { entryId: 'je-1', accountId: 'cash', debit: 1000, credit: 0 },
            { entryId: 'je-1', accountId: 'revenue', debit: 0, credit: 1000 },
        ],
        sales: [
            { id: 'INV-CASH', date: '2026-09-02', totalAmount: 1000, status: 'ACTIVE', items: [{ product: 'Rice', qty: 2, total: 1000 }] },
            { id: 'INV-CREDIT', date: '2026-09-03', totalAmount: 400, status: 'ACTIVE', paymentStatus: 'CREDIT', items: [{ product: 'Rice', qty: 1, total: 400 }] },
        ],
        inventory: [{ product: 'Rice', unitCost: 100, closing: 7 }],
        purchases: [{ date: '2026-09-01', total: 5000, status: 'Completed', category: 'Inventory' }],
        expenses: [{ date: '2026-09-04', amount: 25, category: 'Bank Charges', status: 'Paid' }],
    }, [{ label: 'Sep', startDate: '2026-09-01', endDate: '2026-09-30' }])

    const revenue = report.pnl.rows.find((row) => row.label === 'Revenue')
    const cost = report.pnl.rows.find((row) => row.label === 'Cost of Sales')
    const bankCharges = report.pnl.rows.filter((row) => row.label === 'Bank Charges')
    assert.equal(revenue.total, 1400)
    assert.equal(cost.total, -300)
    assert.equal(bankCharges.length, 1)
    assert.equal(bankCharges[0].total, -25)
})
