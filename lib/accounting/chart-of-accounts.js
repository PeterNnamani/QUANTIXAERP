export function createId(prefix, fallback = '0001') {
    const timestamp = Date.now().toString().slice(-6)
    const random = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, '0')
    return `${prefix}-${timestamp}-${random}`
}

export function roundCurrency(value) {
    return Number((value || 0).toFixed(2))
}

export function normalizeLine(line) {
    const debit = roundCurrency(line.debit || 0)
    const credit = roundCurrency(line.credit || 0)
    return {
        ...line,
        debit,
        credit,
    }
}

export function findAccountByName(accounts, name) {
    return accounts.find((account) => account.name === name || account.code === name)
}

export const requiredFinancialPositionAccounts = [
    { id: 'acct-ppe', code: '1400', name: 'Property, Plant & Equipment', accountType: 'ASSET', accountSubType: 'NON_CURRENT_ASSET', normalBalance: 'DEBIT', isControlAccount: true, isActive: true, currency: 'NGN' },
    { id: 'acct-cash-bank', code: '1005', name: 'Cash and Bank Balance', accountType: 'ASSET', accountSubType: 'CURRENT_ASSET', normalBalance: 'DEBIT', isControlAccount: true, isActive: true, currency: 'NGN' },
    { id: 'acct-inventory-balance', code: '1200', name: 'Inventory', accountType: 'ASSET', accountSubType: 'CURRENT_ASSET', normalBalance: 'DEBIT', isControlAccount: false, isActive: true, currency: 'NGN' },
    { id: 'acct-prepayments-balance', code: '1300', name: 'Prepayments', accountType: 'ASSET', accountSubType: 'CURRENT_ASSET', normalBalance: 'DEBIT', isControlAccount: false, isActive: true, currency: 'NGN' },
    { id: 'acct-receivables-balance', code: '1105', name: 'Receivables', accountType: 'ASSET', accountSubType: 'CURRENT_ASSET', normalBalance: 'DEBIT', isControlAccount: true, isActive: true, currency: 'NGN' },
    { id: 'acct-capital-balance', code: '3000', name: 'Capital', accountType: 'EQUITY', accountSubType: 'OWNER_EQUITY', normalBalance: 'CREDIT', isControlAccount: false, isActive: true, currency: 'NGN' },
    { id: 'acct-retained-earnings', code: '3100', name: 'Retained Earnings', accountType: 'EQUITY', accountSubType: 'OWNER_EQUITY', normalBalance: 'CREDIT', isControlAccount: false, isActive: true, currency: 'NGN' },
    { id: 'acct-drawings', code: '3200', name: 'Drawings', accountType: 'EQUITY', accountSubType: 'OWNER_EQUITY', normalBalance: 'DEBIT', isControlAccount: false, isActive: true, currency: 'NGN' },
    { id: 'acct-loan', code: '2100', name: 'Loan', accountType: 'LIABILITY', accountSubType: 'NON_CURRENT_LIABILITY', normalBalance: 'CREDIT', isControlAccount: false, isActive: true, currency: 'NGN' },
    { id: 'acct-payables-balance', code: '2000', name: 'Payables', accountType: 'LIABILITY', accountSubType: 'CURRENT_LIABILITY', normalBalance: 'CREDIT', isControlAccount: true, isActive: true, currency: 'NGN' },
    { id: 'acct-accruals', code: '2200', name: 'Accruals', accountType: 'LIABILITY', accountSubType: 'CURRENT_LIABILITY', normalBalance: 'CREDIT', isControlAccount: false, isActive: true, currency: 'NGN' },
]

export function dedupeChartOfAccounts(accounts = []) {
    const deduped = []
    const seen = new Set()

    for (const account of accounts) {
        const key = String(account?.name || '').trim().toLowerCase()
        if (!key) continue
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(account)
    }

    for (const account of requiredFinancialPositionAccounts) {
        const key = account.name.trim().toLowerCase()
        if (!seen.has(key)) {
            seen.add(key)
            deduped.push(account)
        }
    }

    return deduped
}

export function buildSeedChartOfAccounts() {
    const baseAccounts = [
        { id: 'acct-cash', code: '1000', name: 'Cash', accountType: 'ASSET', accountSubType: 'CURRENT_ASSET', normalBalance: 'DEBIT', isControlAccount: true, isActive: true, currency: 'NGN' },
        { id: 'acct-ar', code: '1100', name: 'Trade Receivables', accountType: 'ASSET', accountSubType: 'CURRENT_ASSET', normalBalance: 'DEBIT', isControlAccount: true, isActive: true, currency: 'NGN' },
        { id: 'acct-inventory', code: '1200', name: 'Inventory', accountType: 'ASSET', accountSubType: 'CURRENT_ASSET', normalBalance: 'DEBIT', isControlAccount: false, isActive: true, currency: 'NGN' },
        { id: 'acct-grn-clearing', code: '1250', name: 'GRN Clearing', accountType: 'LIABILITY', accountSubType: 'CURRENT_LIABILITY', normalBalance: 'CREDIT', isControlAccount: false, isActive: true, currency: 'NGN' },
        { id: 'acct-pp', code: '1300', name: 'Prepayments', accountType: 'ASSET', accountSubType: 'CURRENT_ASSET', normalBalance: 'DEBIT', isControlAccount: false, isActive: true, currency: 'NGN' },
        { id: 'acct-ap', code: '2000', name: 'Accounts Payable', accountType: 'LIABILITY', accountSubType: 'CURRENT_LIABILITY', normalBalance: 'CREDIT', isControlAccount: true, isActive: true, currency: 'NGN' },
        { id: 'acct-capital', code: '3000', name: 'Capital', accountType: 'EQUITY', accountSubType: 'OWNER_EQUITY', normalBalance: 'CREDIT', isControlAccount: false, isActive: true, currency: 'NGN' },
        { id: 'acct-revenue', code: '4000', name: 'Sales Revenue', accountType: 'INCOME', accountSubType: 'OPERATING_INCOME', normalBalance: 'CREDIT', isControlAccount: false, isActive: true, currency: 'NGN' },
        { id: 'acct-cogs', code: '5000', name: 'Cost of Goods Sold', accountType: 'EXPENSE', accountSubType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', isControlAccount: false, isActive: true, currency: 'NGN' },
        { id: 'acct-expense', code: '5010', name: 'Expense Account', accountType: 'EXPENSE', accountSubType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', isControlAccount: false, isActive: true, currency: 'NGN' },
    ]

    return dedupeChartOfAccounts([...baseAccounts, ...requiredFinancialPositionAccounts])
}
