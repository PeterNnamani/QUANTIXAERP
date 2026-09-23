export type ReportPeriod = { label: string; startDate: string; endDate: string }

type Account = {
    id: string
    name: string
    code?: string
    accountType?: string
    accountSubType?: string
    accountSubtype?: string
    normalBalance?: string
    reportLine?: string
    report_line?: string
    openingBalance?: number
}

type JournalEntry = { id: string; entryDate: string; status?: string }
type JournalLine = { entryId: string; accountId: string; debit?: number; credit?: number; description?: string; segment?: string }

export type ManagementAccountsInput = {
    companyName?: string
    currency?: string
    chartOfAccounts: Account[]
    journalEntries: JournalEntry[]
    journalLines: JournalLine[]
    sales?: Array<{ date: string; totalAmount: number; status?: string; items?: Array<{ product: string; dept?: string; total: number }> }>
    purchases?: Array<{ date: string; total: number; product?: string; category?: string; status?: string }>
    expenses?: Array<{ date: string; amount: number; category?: string; desc?: string; status?: string }>
    expenseCategories?: string[]
    inventory?: Array<{ product: string; dept?: string; unitCost: number; closing: number }>
    banks?: Record<string, number>
    bankAccounts?: Array<{ name: string; balance: number; openingBalance?: number }>
    prepayments?: Array<{ type?: string; reference?: string; remainingAmount: number }>
    receivables?: Array<{ name?: string; customer?: string; balance?: number; amount?: number; outstanding_amount?: number }>
    payables?: Array<{ name?: string; supplier?: string; balance?: number; amount?: number; outstanding_amount?: number }>
    loans?: Array<{ lender?: string; name?: string; balance?: number; amount?: number }>
    fixedAssets?: Array<{ category?: string; assetClass?: string; cost?: number; depreciation?: number; accumulatedDepreciation?: number }>
}

export type AmountRow = { label: string; note?: number; values: number[]; total: number; kind?: 'section' | 'expense' }

export type ManagementAccounts = {
    periods: ReportPeriod[]
    notes: Record<number, AmountRow[]>
    notesII: Record<number, { columns: string[]; rows: AmountRow[] }>
    ppe: { classes: string[]; rows: AmountRow[] }
    pnl: { rows: AmountRow[]; grossMargin: number }
    sfp: { rows: AmountRow[]; totalAssets: number; totalEquityLiabilities: number; difference: number }
    trialBalance: { left: AmountRow[]; right: AmountRow[]; debit: number; credit: number; balanced: boolean }
    validation: { trialBalance: boolean; statementOfFinancialPosition: boolean; notes: boolean; canSignOff: boolean }
}

const n = (value: unknown) => Number(value || 0)
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
const clean = (value: string) => value.trim().toLowerCase()
const isActive = (status?: string) => !status || !['VOID', 'REVERSED', 'CANCELLED'].includes(status.toUpperCase())

function matches(account: Account, terms: string[]) {
    const text = clean(`${account.name} ${account.accountSubType || account.accountSubtype || ''} ${account.reportLine || account.report_line || ''}`)
    return terms.some((term) => text.includes(term))
}

function lineBalance(account: Account, lines: JournalLine[], entries: JournalEntry[], endDate: string, startDate?: string) {
    const validEntries = new Set(entries.filter((entry) => entry.status === 'POSTED' && entry.entryDate <= endDate && (!startDate || entry.entryDate >= startDate)).map((entry) => entry.id))
    const value = lines.filter((line) => line.accountId === account.id && validEntries.has(line.entryId)).reduce((total, line) => total + n(line.debit) - n(line.credit), 0)
    const opening = !startDate ? n(account.openingBalance) : 0
    return account.normalBalance === 'CREDIT' ? opening - value : opening + value
}

function accountValue(accounts: Account[], lines: JournalLine[], entries: JournalEntry[], terms: string[], endDate: string) {
    return sum(accounts.filter((account) => matches(account, terms)).map((account) => lineBalance(account, lines, entries, endDate)))
}

function periodValues(periods: ReportPeriod[], calculate: (period: ReportPeriod) => number) {
    return periods.map(calculate)
}

function transactionPeriodValue(period: ReportPeriod, rows: Array<{ date: string; amount: number; status?: string }>) {
    return sum(rows.filter((row) => isActive(row.status) && row.date >= period.startDate && row.date <= period.endDate).map((row) => n(row.amount)))
}

function operatingRows(input: ManagementAccountsInput, periods: ReportPeriod[]) {
    const accounts = input.chartOfAccounts
    const entries = input.journalEntries
    const lines = input.journalLines
    const ledgerRevenue = periodValues(periods, (period) => sum(accounts.filter((account) => account.accountType === 'INCOME' || matches(account, ['revenue', 'sales income'])).map((account) => Math.abs(lineBalance(account, lines, entries, period.endDate, period.startDate)))))
    const ledgerCogs = periodValues(periods, (period) => sum(accounts.filter((account) => matches(account, ['cost of sales', 'cost of goods', 'cogs'])).map((account) => Math.abs(lineBalance(account, lines, entries, period.endDate, period.startDate)))))
    const transactionRevenue = periodValues(periods, (period) => transactionPeriodValue(period, (input.sales || []).map((sale) => ({ date: sale.date, amount: sale.totalAmount, status: sale.status }))))
    const transactionCogs = periodValues(periods, (period) => transactionPeriodValue(period, (input.purchases || [])
        .filter((purchase) => !['Assets', 'Furniture', 'Electronics', 'Fixed Asset'].includes(purchase.category || ''))
        .map((purchase) => ({ date: purchase.date, amount: purchase.total, status: purchase.status }))))
    const revenue = sum(ledgerRevenue) > 0.005 ? ledgerRevenue : transactionRevenue
    const cogs = sum(ledgerCogs) > 0.005 ? ledgerCogs : transactionCogs
    const expenseLabels = [...new Set([
        'Admin/Overhead',
        'Office Supplies & Consumables',
        'Distribution & Logistics',
        'Sales & Marketing',
        'Office Utilities',
        'Operations Cost',
        'Bank Charges',
        'Gov. Levies, Licenses & Permits',
        'Fines & Penalties',
        ...(input.expenseCategories || []),
        ...(input.expenses || []).map((expense) => expense.category || 'Uncategorised'),
    ])].filter((label) => !['Cost of Goods Sold', 'Drawings', 'Fixed Asset'].includes(label))
    const expenses = expenseLabels.map((label) => {
        const values = periodValues(periods, (period) => sum((input.expenses || [])
            .filter((expense) => isActive(expense.status) && expense.category === label && expense.date >= period.startDate && expense.date <= period.endDate)
            .map((expense) => n(expense.amount))))
        return { label, values, total: sum(values) }
    }).filter((row) => row.values.some((value) => Math.abs(value) > 0.005) || ['Operations Cost', 'Bank Charges'].includes(row.label))
    const financeCostAccounts = accounts.filter((account) => matches(account, ['finance cost', 'interest']))
    const bankChargeAccounts = accounts.filter((account) => matches(account, ['bank charge']))
    const financeExpenseValues = periodValues(periods, (period) => sum((input.expenses || [])
        .filter((expense) => isActive(expense.status) && /finance cost|interest/i.test(expense.category || '') && expense.date >= period.startDate && expense.date <= period.endDate)
        .map((expense) => n(expense.amount))))
    const bankChargeExpenseValues = periodValues(periods, (period) => sum((input.expenses || [])
        .filter((expense) => isActive(expense.status) && /bank charge|bank charges/i.test(expense.category || '') && expense.date >= period.startDate && expense.date <= period.endDate)
        .map((expense) => n(expense.amount))))
    const financeCost = periodValues(periods, (period) => {
        const ledgerValue = sum(financeCostAccounts.map((account) => Math.abs(lineBalance(account, lines, entries, period.endDate, period.startDate))))
        return ledgerValue > 0.005 ? ledgerValue : financeExpenseValues[periods.indexOf(period)] || 0
    })
    const bankCharges = periodValues(periods, (period) => {
        const ledgerValue = sum(bankChargeAccounts.map((account) => Math.abs(lineBalance(account, lines, entries, period.endDate, period.startDate))))
        return ledgerValue > 0.005 ? ledgerValue : bankChargeExpenseValues[periods.indexOf(period)] || 0
    })
    return { revenue, cogs, expenses, financeCost, bankCharges, financeCostAccounts, bankChargeAccounts }
}

export function buildManagementAccounts(input: ManagementAccountsInput, periods: ReportPeriod[]): ManagementAccounts {
    const accounts = input.chartOfAccounts
    const entries = input.journalEntries
    const lines = input.journalLines
    const orderedPeriods = periods.length > 0 ? periods : [{ label: 'Current Period', startDate: '1900-01-01', endDate: '2999-12-31' }]
    const endDate = orderedPeriods[orderedPeriods.length - 1].endDate
    const operations = operatingRows(input, orderedPeriods)
    const financeCostAccounts = operations.financeCostAccounts || []
    const bankChargeAccounts = operations.bankChargeAccounts || []
    const grossProfit = operations.revenue.map((value, index) => value - operations.cogs[index])
    const totalExpensesByPeriod = orderedPeriods.map((_, index) => sum(operations.expenses.map((row) => row.values[index])))
    const operatingProfit = grossProfit.map((value, index) => value - totalExpensesByPeriod[index])
    const profit = operatingProfit.map((value, index) => value - operations.financeCost[index] - operations.bankCharges[index])
    const expenseRows = operations.expenses.map((row) => ({ label: row.label, values: row.values.map((value) => -value), total: -row.total, kind: 'expense' as const }))
    const pnlRows: AmountRow[] = [
        { label: 'Revenue', note: 9, values: operations.revenue, total: sum(operations.revenue) },
        { label: 'Cost of Sales', note: 10, values: operations.cogs.map((value) => -value), total: -sum(operations.cogs) },
        { label: 'Gross Profit', values: grossProfit, total: sum(grossProfit) },
        ...expenseRows,
        { label: 'Total Expenses', values: totalExpensesByPeriod.map((value) => -value), total: -sum(totalExpensesByPeriod) },
        { label: 'Operating Profit/(Loss)', values: operatingProfit, total: sum(operatingProfit) },
        { label: 'Finance Cost', note: 11, values: operations.financeCost.map((value) => -value), total: -sum(operations.financeCost), kind: 'expense' as const },
        { label: 'Bank Charges', note: 12, values: operations.bankCharges.map((value) => -value), total: -sum(operations.bankCharges), kind: 'expense' as const },
        { label: 'Profit/(Loss) for the Period', values: profit, total: sum(profit) },
        { label: 'Drawings', values: [0], total: 0 },
    ]

    const bankRows = input.bankAccounts && input.bankAccounts.length > 0
        ? input.bankAccounts.map((bank) => ({ label: bank.name, value: n(bank.balance) }))
        : Object.entries(input.banks || {}).map(([label, value]) => ({ label, value: n(value) }))
    const cashRows = bankRows
    const inventoryRows = (input.inventory || []).map((item) => ({ label: item.product, value: n(item.unitCost) * n(item.closing) }))
    const prepaymentRows = (input.prepayments || []).map((item) => ({ label: item.reference || item.type || 'Prepayment', value: n(item.remainingAmount) }))
    const receivableRows = (input.receivables || []).map((item) => ({ label: item.name || item.customer || 'Debtor', value: n(item.balance ?? item.outstanding_amount ?? item.amount) }))
    const payableRows = (input.payables || []).map((item) => ({ label: item.name || item.supplier || 'Creditor', value: n(item.balance ?? item.outstanding_amount ?? item.amount) }))
    const loanRows = (input.loans || []).map((item) => ({ label: item.lender || item.name || 'Lender', value: n(item.balance ?? item.amount) }))
    const noteRows = (rows: Array<{ label: string; value: number }>, note: number): AmountRow[] => [...rows.map((row) => ({ label: row.label, values: [row.value], total: row.value })), { label: 'Subtotal', values: [sum(rows.map((row) => row.value))], total: sum(rows.map((row) => row.value)), note }]
    const notes = { 2: noteRows(cashRows, 2), 3: noteRows(inventoryRows, 3), 4: noteRows(prepaymentRows, 4), 5: noteRows(receivableRows, 5), 6: noteRows(loanRows, 6), 7: noteRows(payableRows, 7), 8: noteRows([], 8) }

    const fixedAssetPurchases = (input.purchases || [])
        .filter((purchase) => isActive(purchase.status) && ['Assets', 'Furniture', 'Electronics'].includes(purchase.category || ''))
        .map((purchase) => ({ category: purchase.category, cost: n(purchase.total), purchaseDate: purchase.date, depreciation: 0, accumulatedDepreciation: 0 }))
    const fixedAssets: Array<{ category?: string; assetClass?: string; cost?: number; depreciation?: number; accumulatedDepreciation?: number; purchaseDate?: string }> = input.fixedAssets && input.fixedAssets.length > 0
        ? input.fixedAssets
        : fixedAssetPurchases.length > 0
            ? fixedAssetPurchases
            : accounts.filter((account) => matches(account, ['property, plant', 'fixed asset', 'ppe'])).map((account) => ({ category: account.name, cost: Math.abs(lineBalance(account, lines, entries, endDate)), depreciation: 0, accumulatedDepreciation: 0 }))
    const ppeClasses = [...new Set(fixedAssets.map((asset) => asset.category || asset.assetClass || 'Other'))]
    const periodStart = orderedPeriods[0].startDate
    const assetRowsByClass = (assetClass: string) => fixedAssets.filter((asset) => (asset.category || asset.assetClass || 'Other') === assetClass)
    const additionsByClass = ppeClasses.map((assetClass) => sum(assetRowsByClass(assetClass).filter((asset) => asset.purchaseDate && asset.purchaseDate >= periodStart && asset.purchaseDate <= endDate).map((asset) => n(asset.cost))))
    const totalCostByClass = ppeClasses.map((assetClass) => sum(assetRowsByClass(assetClass).map((asset) => n(asset.cost))))
    const openingCostByClass = totalCostByClass.map((value, index) => value - additionsByClass[index])
    const openingDepreciationByClass = ppeClasses.map((assetClass) => sum(assetRowsByClass(assetClass).map((asset) => n(asset.accumulatedDepreciation))))
    const explicitDepreciationByClass = ppeClasses.map((assetClass) => sum(assetRowsByClass(assetClass).map((asset) => n(asset.depreciation))))
    const depreciationAccountValue = sum(accounts.filter((account) => matches(account, ['depreciation'])).map((account) => Math.abs(lineBalance(account, lines, entries, endDate, periodStart))))
    const explicitDepreciationTotal = sum(explicitDepreciationByClass)
    const fallbackDepreciationByClass = explicitDepreciationTotal === 0 && depreciationAccountValue !== 0
        ? ppeClasses.map((assetClass, index) => ppeClasses.length === 1 ? depreciationAccountValue : depreciationAccountValue * (totalCostByClass[index] / Math.max(1, sum(totalCostByClass))))
        : explicitDepreciationByClass
    const periodDepreciationByClass = fallbackDepreciationByClass
    const ppeRows: AmountRow[] = [
        { label: 'Cost', values: openingCostByClass, total: 0 },
        { label: 'Additions', values: additionsByClass, total: 0 },
        { label: `Balance as at ${endDate}`, values: [], total: 0 },
        { label: 'ACCUMULATED DEPRECIATION:', values: [], total: 0, kind: 'section' },
        { label: `As at 1 January ${periodStart.slice(0, 4)}`, values: openingDepreciationByClass.map((value) => -value), total: 0 },
        { label: 'For the Period', values: periodDepreciationByClass.map((value) => -value), total: 0 },
        { label: `Balance as at ${endDate}`, values: [], total: 0 },
        { label: 'CARRYING AMOUNT', values: [], total: 0, kind: 'section' },
        { label: `As at ${endDate}`, values: [], total: 0 },
    ]
    ppeRows[0].total = sum(ppeRows[0].values); ppeRows[1].total = sum(ppeRows[1].values); ppeRows[2].values = ppeRows[0].values.map((value, index) => value + ppeRows[1].values[index]); ppeRows[2].total = sum(ppeRows[2].values)
    ppeRows[4].total = sum(ppeRows[4].values); ppeRows[5].total = sum(ppeRows[5].values); ppeRows[6].values = ppeRows[4].values.map((value, index) => value + ppeRows[5].values[index]); ppeRows[6].total = sum(ppeRows[6].values)
    ppeRows[8].values = ppeRows[2].values.map((value, index) => value + ppeRows[6].values[index]); ppeRows[8].total = sum(ppeRows[8].values)

    const matrixRows = (labels: string[], calculate: (label: string, period: ReportPeriod) => number): AmountRow[] => labels.map((label) => {
        const values = orderedPeriods.map((period) => calculate(label, period))
        return { label, values, total: sum(values) }
    })
    const revenueLabels = [...new Set((input.sales || []).flatMap((sale) => (sale.items || []).map((item) => item.dept || item.product || 'Uncategorised')))]
    const cogsLabels = [...new Set((input.purchases || []).filter((purchase) => isActive(purchase.status)).map((purchase) => purchase.category || purchase.product || 'Uncategorised'))]
    const financeLabels = input.chartOfAccounts.filter((account) => matches(account, ['finance cost', 'interest'])).map((account) => account.name)
    const bankChargeLabels = input.chartOfAccounts.filter((account) => matches(account, ['bank charge'])).map((account) => account.name)
    const revenueNoteRows = matrixRows(revenueLabels, (label, period) => sum((input.sales || []).filter((sale) => sale.date >= period.startDate && sale.date <= period.endDate && isActive('POSTED')).flatMap((sale) => (sale.items || []).filter((item) => (item.dept || item.product || 'Uncategorised') === label).map((item) => n(item.total)))))
    const cogsNoteRows = matrixRows(cogsLabels, (label, period) => sum((input.purchases || []).filter((purchase) => isActive(purchase.status) && purchase.date >= period.startDate && purchase.date <= period.endDate && (purchase.category || purchase.product || 'Uncategorised') === label).map((purchase) => n(purchase.total))))
    const financeNoteRows = matrixRows(financeLabels, (label, period) => { const account = input.chartOfAccounts.find((item) => item.name === label); return account ? Math.abs(lineBalance(account, input.journalLines, input.journalEntries, period.endDate, period.startDate)) : 0 })
    const bankChargeNoteRows = matrixRows(bankChargeLabels, (label, period) => { const account = input.chartOfAccounts.find((item) => item.name === label); return account ? Math.abs(lineBalance(account, input.journalLines, input.journalEntries, period.endDate, period.startDate)) : 0 })
    const notesII = {
        9: { columns: orderedPeriods.map((period) => period.label), rows: revenueNoteRows },
        10: { columns: orderedPeriods.map((period) => period.label), rows: cogsNoteRows },
        11: { columns: orderedPeriods.map((period) => period.label), rows: financeNoteRows },
        12: { columns: orderedPeriods.map((period) => period.label), rows: bankChargeNoteRows },
    }
    const ppe = { classes: ppeClasses, rows: ppeRows }
    const cash = notes[2][notes[2].length - 1].total
    const inventory = notes[3][notes[3].length - 1].total
    const prepayments = notes[4][notes[4].length - 1].total
    const receivables = notes[5][notes[5].length - 1].total
    const loan = notes[6][notes[6].length - 1].total
    const payables = notes[7][notes[7].length - 1].total
    const accruals = 0
    const totalCurrentAssets = cash + inventory + prepayments + receivables
    const totalAssets = ppeRows[8].total + totalCurrentAssets
    const capital = accountValue(input.chartOfAccounts, input.journalLines, input.journalEntries, ['capital'], endDate)
    const drawings = pnlRows[pnlRows.length - 1].total
    const totalEquity = capital + pnlRows[pnlRows.length - 2].total + drawings
    const totalEquityLiabilities = totalEquity + loan + payables + accruals
    const sfpRows: AmountRow[] = [
        { label: 'Property, Plant & Equipment', note: 1, values: [ppeRows[8].total], total: ppeRows[8].total },
        { label: 'CURRENT ASSETS:', values: [], total: 0, kind: 'section' },
        { label: 'Cash and Bank Balance', note: 2, values: [cash], total: cash },
        { label: 'Inventory', note: 3, values: [inventory], total: inventory },
        { label: 'Prepayments', note: 4, values: [prepayments], total: prepayments },
        { label: 'Receivables', note: 5, values: [receivables], total: receivables },
        { label: 'TOTAL ASSETS', values: [totalAssets], total: totalAssets },
        { label: 'EQUITY:', values: [], total: 0, kind: 'section' },
        { label: 'Capital', values: [capital], total: capital },
        { label: 'Retained Earnings', values: [pnlRows[pnlRows.length - 2].total], total: pnlRows[pnlRows.length - 2].total },
        { label: 'Drawings', values: [drawings], total: drawings },
        { label: 'CURRENT LIABILITIES:', values: [], total: 0, kind: 'section' },
        { label: 'Loan', note: 6, values: [loan], total: loan },
        { label: 'Payables', note: 7, values: [payables], total: payables },
        { label: 'Accruals', note: 8, values: [accruals], total: accruals },
        { label: 'TOTAL EQUITY & LIABILITIES', values: [totalEquityLiabilities], total: totalEquityLiabilities },
    ]

    const accountRows = input.chartOfAccounts.map((account) => ({ account, value: lineBalance(account, input.journalLines, input.journalEntries, endDate) }))
    const leftNames = ['Revenue', 'Cost of Sales', 'Admin/Overhead', 'Office Supplies & Consumables', 'Distribution & Logistics', 'Sales & Marketing', 'Office Utilities', 'Operations and Wages', 'Depreciation', 'Govt. Levies/Licenses/Permits', 'Fines and Permits', 'Finance Cost', 'Bank Charges', 'PPE', 'Cash & Bank', 'Inventory', 'Prepayments', 'Receivables', 'Capital', 'Retained Earnings', 'Drawings', 'Loan', 'Payables', 'Accruals']
    const rightNames = ['PPE', 'Cash and Bank Balance', 'Inventory', 'Prepayments', 'Receivables', 'Capital', 'Retained Earnings', 'Drawings', 'Loan', 'Payables', 'Accruals']
    const tbRow = (label: string, names: string[]): AmountRow => {
        const value = sum(accountRows.filter(({ account }) => matches(account, names.flatMap((name) => name.toLowerCase().split(/[^a-z]+/).filter((term) => term.length > 3)))).map((row) => row.value))
        return { label, values: [Math.max(value, 0), Math.max(-value, 0)], total: value }
    }
    const left = leftNames.map((name) => tbRow(name, [name])); const right = rightNames.map((name) => tbRow(name, [name]))
    const debit = sum([...left, ...right].map((row) => row.values[0])); const credit = sum([...left, ...right].map((row) => row.values[1]))
    const trialBalance = { left, right, debit, credit, balanced: Math.abs(debit - credit) < 0.01 }
    const notesTie = [[notes[2], cash], [notes[3], inventory], [notes[4], prepayments], [notes[5], receivables], [notes[6], loan], [notes[7], payables], [notes[8], accruals]].every(([rows, faceValue]) => Math.abs((rows as AmountRow[])[(rows as AmountRow[]).length - 1].total - (faceValue as number)) < 0.01)
    return { periods: orderedPeriods, notes, notesII, ppe, pnl: { rows: pnlRows, grossMargin: sum(operations.revenue) ? sum(grossProfit) / sum(operations.revenue) : 0 }, sfp: { rows: sfpRows, totalAssets, totalEquityLiabilities, difference: totalAssets - totalEquityLiabilities }, trialBalance, validation: { trialBalance: trialBalance.balanced, statementOfFinancialPosition: Math.abs(totalAssets - totalEquityLiabilities) < 0.01, notes: notesTie, canSignOff: trialBalance.balanced && Math.abs(totalAssets - totalEquityLiabilities) < 0.01 && notesTie } }
}