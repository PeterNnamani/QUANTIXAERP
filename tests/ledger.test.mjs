import assert from 'node:assert/strict'
import { createSeedLedgerData, postJournalEntry } from '../lib/ledger.js'

const chartOfAccounts = [
    { id: 'cash', code: '1000', name: 'Cash', accountType: 'ASSET', normalBalance: 'DEBIT' },
    { id: 'revenue', code: '4000', name: 'Sales Revenue', accountType: 'INCOME', normalBalance: 'CREDIT' },
]
const accountingPeriods = [{ id: 'period-1', fiscalYear: 2026, periodNumber: 1, startDate: '2026-01-01', endDate: '2026-01-31', status: 'OPEN' }]

const balanced = postJournalEntry(
    {
        lines: [
            { accountId: 'cash', debit: 1000, description: 'Cash receipt' },
            { accountId: 'revenue', credit: 1000, description: 'Revenue' },
        ],
    },
    chartOfAccounts,
    accountingPeriods
)

assert.equal(balanced.error, undefined)
assert.equal(balanced.lines.length, 2)

const unbalanced = postJournalEntry(
    {
        lines: [
            { accountId: 'cash', debit: 1000, description: 'Cash receipt' },
            { accountId: 'revenue', credit: 500, description: 'Revenue' },
        ],
    },
    chartOfAccounts,
    accountingPeriods
)

assert.equal(unbalanced.error, 'Journal entry must balance: debits must equal credits.')

const ledgerData = createSeedLedgerData({ sales: [{ id: 'S-1', date: '2026-08-04', customer: 'ABC Ltd', totalAmount: 250000 }], purchases: [], expenses: [] })
assert.ok(ledgerData.journalEntries.length >= 2)
assert.ok(ledgerData.journalLines.length >= 2)

console.log('ledger tests passed')
