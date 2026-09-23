import { buildSeedChartOfAccounts, findAccountByName, normalizeLine, roundCurrency, createId } from './chart-of-accounts.js'
import { buildSeedAccountingPeriods, getCurrentPeriod } from './periods.js'
import { calculateBalanceSheet } from './balance-sheet.js'

export function postJournalEntry(input, chartOfAccounts, accountingPeriods) {
    if (!Array.isArray(input.lines) || input.lines.length === 0) {
        return { error: 'Journal entry must contain at least one posting line.' }
    }

    const lines = input.lines.map(normalizeLine)
    const hasDebit = lines.some((line) => line.debit > 0)
    const hasCredit = lines.some((line) => line.credit > 0)

    if (!hasDebit || !hasCredit) {
        return { error: 'Each journal entry must include both debit and credit lines.' }
    }

    const debitTotal = lines.reduce((sum, line) => sum + line.debit, 0)
    const creditTotal = lines.reduce((sum, line) => sum + line.credit, 0)

    if (roundCurrency(debitTotal) !== roundCurrency(creditTotal)) {
        return { error: 'Journal entry must balance: debits must equal credits.' }
    }

    const invalidLine = lines.find((line) => line.debit > 0 && line.credit > 0)
    if (invalidLine) {
        return { error: 'A posting line cannot contain both debit and credit.' }
    }

    const period = (accountingPeriods || []).find((item) => item.id === input.periodId) || getCurrentPeriod(accountingPeriods) || (accountingPeriods || [])[0]
    const entry = {
        id: input.id || createId('JE'),
        entryDate: input.entryDate || new Date().toISOString().slice(0, 10),
        periodId: period?.id || input.periodId || 'period-current',
        reference: input.reference || 'AUTO',
        description: input.description || 'System posting',
        sourceModule: input.sourceModule || 'MANUAL',
        sourceId: input.sourceId || null,
        status: input.status || 'POSTED',
        createdBy: input.createdBy || 'system',
        createdAt: new Date().toISOString(),
    }

    const accountIds = new Set((chartOfAccounts || []).map((account) => account.id))
    const invalidAccount = lines.find((line) => !accountIds.has(line.accountId))
    if (invalidAccount) {
        return { error: 'One or more posting lines reference an unknown account.' }
    }

    const postedLines = lines.map((line) => ({
        id: globalThis.crypto?.randomUUID?.() || createId('JL'),
        entryId: entry.id,
        accountId: line.accountId,
        debit: line.debit,
        credit: line.credit,
        description: line.description || entry.description,
        costCenter: line.costCenter || null,
        segment: line.segment || null,
    }))

    return { entry, lines: postedLines }
}

export function createSeedLedgerData({ sales = [], purchases = [], expenses = [], openingCapital = 850000 } = {}) {
    const chartOfAccounts = buildSeedChartOfAccounts()
    const accountingPeriods = buildSeedAccountingPeriods()
    const journalEntries = []
    const journalLines = []

    const cashAccount = findAccountByName(chartOfAccounts, 'Cash')
    const capitalAccount = findAccountByName(chartOfAccounts, 'Capital')
    const receivablesAccount = findAccountByName(chartOfAccounts, 'Trade Receivables')
    const revenueAccount = findAccountByName(chartOfAccounts, 'Sales Revenue')
    const inventoryAccount = findAccountByName(chartOfAccounts, 'Inventory')
    const payablesAccount = findAccountByName(chartOfAccounts, 'Accounts Payable')
    const expenseAccount = findAccountByName(chartOfAccounts, 'Expense Account')

    if (cashAccount && capitalAccount) {
        const opening = postJournalEntry(
            {
                id: 'JE-OPENING',
                entryDate: new Date().toISOString().slice(0, 10),
                periodId: accountingPeriods[0].id,
                reference: 'OPENING',
                description: 'Opening capital contribution',
                sourceModule: 'MANUAL',
                lines: [
                    { accountId: cashAccount.id, debit: openingCapital, description: 'Opening cash balance' },
                    { accountId: capitalAccount.id, credit: openingCapital, description: 'Opening capital contribution' },
                ],
            },
            chartOfAccounts,
            accountingPeriods
        )

        if (!opening.error) {
            journalEntries.push(opening.entry)
            journalLines.push(...opening.lines)
        }
    }

    sales.forEach((sale, index) => {
        const salePosting = postJournalEntry(
            {
                id: `JE-SALES-${index + 1}`,
                entryDate: sale.date,
                periodId: accountingPeriods[0].id,
                reference: sale.id,
                description: `Sales posting for ${sale.customer}`,
                sourceModule: 'SALES',
                sourceId: sale.id,
                lines: [
                    { accountId: receivablesAccount?.id || cashAccount?.id, debit: sale.totalAmount, description: `Receivable for ${sale.customer}` },
                    { accountId: revenueAccount?.id, credit: sale.totalAmount, description: `Revenue from ${sale.customer}` },
                ],
            },
            chartOfAccounts,
            accountingPeriods
        )

        if (!salePosting.error) {
            journalEntries.push(salePosting.entry)
            journalLines.push(...salePosting.lines)
        }
    })

    purchases.forEach((purchase, index) => {
        const purchasePosting = postJournalEntry(
            {
                id: `JE-PURCH-${index + 1}`,
                entryDate: purchase.date,
                periodId: accountingPeriods[0].id,
                reference: purchase.invoiceNumber || purchase.id,
                description: `Purchase posting for ${purchase.supplier}`,
                sourceModule: 'PURCHASES',
                sourceId: purchase.id,
                lines: [
                    { accountId: inventoryAccount?.id, debit: purchase.total, description: `Inventory for ${purchase.product}` },
                    { accountId: payablesAccount?.id, credit: purchase.total, description: `Payables for ${purchase.supplier}` },
                ],
            },
            chartOfAccounts,
            accountingPeriods
        )

        if (!purchasePosting.error) {
            journalEntries.push(purchasePosting.entry)
            journalLines.push(...purchasePosting.lines)
        }
    })

    expenses.forEach((expense, index) => {
        const expensePosting = postJournalEntry(
            {
                id: `JE-EXP-${index + 1}`,
                entryDate: expense.date,
                periodId: accountingPeriods[0].id,
                reference: expense.id,
                description: expense.desc,
                sourceModule: 'EXPENSES',
                sourceId: expense.id,
                lines: [
                    { accountId: expenseAccount?.id, debit: expense.amount, description: expense.desc },
                    { accountId: cashAccount?.id, credit: expense.amount, description: expense.desc },
                ],
            },
            chartOfAccounts,
            accountingPeriods
        )

        if (!expensePosting.error) {
            journalEntries.push(expensePosting.entry)
            journalLines.push(...expensePosting.lines)
        }
    })

    return {
        chartOfAccounts,
        accountingPeriods,
        journalEntries,
        journalLines,
        balanceSheet: calculateBalanceSheet(journalLines, journalEntries, chartOfAccounts),
    }
}

export function calculateBalanceSheetAsOf(journalLines, journalEntries, chartOfAccounts, asOfDate) {
    return calculateBalanceSheet(journalLines, journalEntries, chartOfAccounts, asOfDate)
}

export { buildSeedChartOfAccounts, findAccountByName, buildSeedAccountingPeriods, getCurrentPeriod }
