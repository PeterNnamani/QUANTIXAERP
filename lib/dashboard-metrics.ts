export type DatedAmount = { date?: string; amount: number; status?: string }
export type PerformancePoint = { label: string; start: string; end: string; revenue: number; expenses: number; profit: number }

const dateKeyOf = (value?: string) => String(value || '').slice(0, 10)

export function dateKey(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

export function addDays(day: string, offset: number): string {
    const date = new Date(`${day.slice(0, 10)}T00:00:00`)
    date.setDate(date.getDate() + offset)
    return dateKey(date)
}

const isVoid = (status?: string) => ['VOID', 'CANCELLED', 'REVERSED'].includes(String(status || '').toUpperCase())

export function sumOnDate(records: DatedAmount[], day: string): number {
    return records.reduce((total, record) => dateKeyOf(record.date) === day && !isVoid(record.status) ? total + Number(record.amount || 0) : total, 0)
}

export function seriesForDays(records: DatedAmount[], endDay: string, days: number): number[] {
    return Array.from({ length: days }, (_, index) => sumOnDate(records, addDays(endDay, index - (days - 1))))
}

export function percentChange(current: number, previous: number): string {
    if (previous === 0) return current === 0 ? '0%' : current > 0 ? '+100%' : '-100%'
    const change = Math.round(((current - previous) / Math.abs(previous)) * 100)
    return `${change >= 0 ? '+' : ''}${change}%`
}

export function performanceSeries(input: {
    sales: DatedAmount[]
    expenses: DatedAmount[]
    purchases: DatedAmount[]
    endDay: string
    days: number
    buckets?: number
}): PerformancePoint[] {
    const count = input.buckets ?? 7
    const startDay = addDays(input.endDay, -(input.days - 1))
    return Array.from({ length: count }, (_, index) => {
        const offset = Math.floor((index * input.days) / count)
        const nextOffset = Math.floor(((index + 1) * input.days) / count)
        const start = addDays(startDay, offset)
        const end = addDays(startDay, Math.max(offset, nextOffset - 1))
        const inBucket = (record: DatedAmount) => {
            const day = dateKeyOf(record.date)
            return Boolean(day && day >= start && day <= end && !isVoid(record.status))
        }
        const revenue = input.sales.filter(inBucket).reduce((total, record) => total + record.amount, 0)
        const expenses = input.expenses.filter(inBucket).reduce((total, record) => total + record.amount, 0)
        const purchases = input.purchases.filter(inBucket).reduce((total, record) => total + record.amount, 0)
        const label = input.days <= 7
            ? new Date(`${start}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' })
            : input.days <= 31
                ? `Wk ${index + 1}`
                : input.days <= 92
                    ? new Date(`${start}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : new Date(`${start}T00:00:00`).toLocaleDateString('en-US', { month: 'short' })
        return { label, start, end, revenue, expenses: expenses + purchases, profit: revenue - expenses - purchases }
    })
}

export function outstanding(record: { balance?: number; balanceDue?: number; outstanding_amount?: number; outstandingAmount?: number; amount?: number }): number {
    return Number(record.balance ?? record.balanceDue ?? record.outstanding_amount ?? record.outstandingAmount ?? record.amount ?? 0)
}

export function dueOn(records: Array<{ dueDate?: string; due?: string; status?: string; balance?: number; balanceDue?: number; outstanding_amount?: number; outstandingAmount?: number; amount?: number }>, day: string): number {
    return records.reduce((total, record) => {
        const due = dateKeyOf(record.dueDate || record.due)
        return due === day ? total + outstanding(record) : total
    }, 0)
}

export function overdueAmount(records: Array<{ dueDate?: string; due?: string; status?: string; balance?: number; balanceDue?: number; outstanding_amount?: number; outstandingAmount?: number; amount?: number }>, today: string): number {
    return records.reduce((total, record) => {
        const balance = outstanding(record)
        if (balance <= 0) return total
        const due = dateKeyOf(record.dueDate || record.due)
        const status = String(record.status || '').toUpperCase()
        return status === 'OVERDUE' || (due && due < today) ? total + balance : total
    }, 0)
}

export function businessHealth(input: { cash: number; profit: number; overdue: number; outOfStock: number; lowStock: number }): { score: number; label: string; checks: Array<{ label: string; ok: boolean }> } {
    const checks = [
        { label: 'Cash', ok: input.cash >= 0 },
        { label: 'Profit', ok: input.profit >= 0 },
        { label: 'Collections', ok: input.overdue <= 0 },
        { label: 'Stock', ok: input.outOfStock === 0 && input.lowStock === 0 },
    ]
    const score = Math.round((checks.filter((check) => check.ok).length / checks.length) * 100)
    const label = score >= 100 ? 'Excellent' : score >= 75 ? 'Strong' : score >= 50 ? 'Stable' : 'Needs attention'
    return { score, label, checks }
}
