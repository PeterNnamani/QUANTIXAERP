export function calculateAccountBalance(account, journalLines) {
    const debitTotal = journalLines.reduce((sum, line) => sum + (line.debit || 0), 0)
    const creditTotal = journalLines.reduce((sum, line) => sum + (line.credit || 0), 0)

    return account.normalBalance === 'DEBIT'
        ? debitTotal - creditTotal
        : creditTotal - debitTotal
}

export function calculateBalanceSheet(journalLines, journalEntries, chartOfAccounts, asOfDate) {
    const cutoff = asOfDate ? new Date(asOfDate) : new Date()

    const postedEntryIds = new Set(
        journalEntries
            .filter((entry) => entry.status === 'POSTED' && new Date(entry.entryDate) <= cutoff)
            .map((entry) => entry.id)
    )

    const linesByAccount = journalLines.reduce((acc, line) => {
        if (!postedEntryIds.has(line.entryId)) return acc
        const list = acc[line.accountId] || []
        list.push(line)
        acc[line.accountId] = list
        return acc
    }, {})

    return chartOfAccounts
        .filter((account) => ['ASSET', 'LIABILITY', 'EQUITY'].includes(account.accountType))
        .map((account) => ({
            accountId: account.id,
            code: account.code,
            name: account.name,
            accountType: account.accountType,
            accountSubType: account.accountSubType,
            balance: calculateAccountBalance(account, linesByAccount[account.id] || []),
        }))
        .filter((row) => row.balance !== 0)
}
