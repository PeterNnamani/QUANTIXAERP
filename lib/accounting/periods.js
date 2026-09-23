export function buildSeedAccountingPeriods() {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth() + 1
    const paddedMonth = String(month).padStart(2, '0')

    return [
        {
            id: 'period-current',
            fiscalYear: year,
            periodNumber: month,
            startDate: `${year}-${paddedMonth}-01`,
            endDate: `${year}-${paddedMonth}-28`,
            status: 'OPEN',
        },
    ]
}

export function getCurrentPeriod(periods) {
    return periods?.find((period) => period.status === 'OPEN') || periods?.[0] || null
}

export function isPeriodClosed(period) {
    return period?.status === 'CLOSED'
}
