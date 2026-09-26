export function settledOpenItem<T extends Record<string, any>>(record: T, paymentAmount: number): T {
    const current = Number(record.balance ?? record.balanceDue ?? record.balance_due ?? record.outstandingAmount ?? record.outstanding_amount ?? record.amount ?? 0)
    const applied = Math.min(Math.max(Number(paymentAmount) || 0, 0), Math.max(current, 0))
    const nextBalance = Math.max(0, current - applied)
    const paid = Number(record.amount_paid ?? record.amountPaid ?? record.paid ?? 0) + applied
    return {
        ...record,
        balance: nextBalance,
        balanceDue: nextBalance,
        balance_due: nextBalance,
        outstandingAmount: nextBalance,
        outstanding_amount: nextBalance,
        amountPaid: paid,
        amount_paid: paid,
        paid,
        status: nextBalance <= 0 ? 'Paid' : 'Partially Paid',
    }
}

export function displayOpenBalance(record: { balance?: number | null; balanceDue?: number | null; balance_due?: number | null; outstandingAmount?: number | null; outstanding_amount?: number | null; amount?: number | null; total?: number | null; amountPaid?: number | null; amount_paid?: number | null; paid?: number | null }): number {
    const candidates = [record.balance, record.balanceDue, record.balance_due, record.outstandingAmount, record.outstanding_amount]
    for (const value of candidates) {
        if (value === undefined || value === null || (typeof value === 'string' && value === '')) continue
        const number = Number(value)
        if (!Number.isNaN(number)) return number
    }
    const total = Number(record.amount ?? record.total ?? 0)
    const paid = Number(record.amountPaid ?? record.amount_paid ?? record.paid ?? 0)
    return Math.max(total - paid, 0)
}

export type BankAccountLike = { id: string; name: string; balance?: number }

export function moveBankBalance<T extends BankAccountLike>(accounts: T[], banks: Record<string, number>, accountId: string, accountName: string, delta: number): { bankAccounts: T[]; banks: Record<string, number> } {
    const nextBanks = { ...banks }
    const name = accountName || 'Cash / Other'
    let matched = false
    const bankAccounts = accounts.map((account) => {
        const byId = Boolean(accountId) && account.id === accountId
        const byName = !accountId && account.name === name
        if (!byId && !byName) return account
        matched = true
        const balance = Number(account.balance || 0) + delta
        nextBanks[account.name] = balance
        return { ...account, balance }
    })
    if (!matched) nextBanks[name] = Number(nextBanks[name] || 0) + delta
    return { bankAccounts, banks: nextBanks }
}
