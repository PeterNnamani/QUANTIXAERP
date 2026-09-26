const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value) {
    return UUID_PATTERN.test(String(value || '').trim())
}

export function businessReference(record) {
    if (!record || typeof record !== 'object') return ''
    const reference = String(record.reference || '').trim()
    const id = String(record.id || '').trim()
    if (reference && !isUuid(reference)) return reference
    if (id && !isUuid(id)) return id
    return reference || id
}

export function subledgerReference(record) {
    const reference = businessReference(record)
    if (reference && !reference.startsWith('AR-') && !reference.startsWith('BILL-')) return reference
    const invoice = String(record?.invoice || record?.invoiceNumber || record?.sourceSaleId || record?.purchaseRef || '').trim()
    if (invoice && !isUuid(invoice)) return invoice
    return reference
}

export function isoDate(value) {
    const text = String(value || '').trim()
    return text.length >= 10 ? text.slice(0, 10) : text
}

export function selectUnpostedJournals(entries = [], lines = [], existingIds = []) {
    const existing = new Set(existingIds.filter(Boolean))
    const fresh = entries.filter((entry) => isUuid(entry?.id) && !existing.has(entry.id))
    const freshIds = new Set(fresh.map((entry) => entry.id))
    const freshLines = lines.filter((line) => freshIds.has(line?.entryId) && isUuid(line.id) && isUuid(line.accountId))
    const balancedIds = new Set(fresh.filter((entry) => {
        const entryLines = freshLines.filter((line) => line.entryId === entry.id)
        const debit = entryLines.reduce((sum, line) => sum + Number(line.debit || 0), 0)
        const credit = entryLines.reduce((sum, line) => sum + Number(line.credit || 0), 0)
        return entryLines.length >= 2 && Math.abs(debit - credit) < 0.01
    }).map((entry) => entry.id))

    return {
        entries: fresh.filter((entry) => balancedIds.has(entry.id)).map((entry) => ({ ...entry, status: 'DRAFT' })),
        lines: freshLines.filter((line) => balancedIds.has(line.entryId)),
    }
}

const CLOSED_EXPENSE_STATUSES = new Set(['VOID', 'CANCELLED', 'REVERSED', 'DELETED'])

export function shouldPostExpenseCash(expense, postedKeys = new Set()) {
    const reference = businessReference(expense)
    const status = String(expense?.status || '').toUpperCase()
    if (!reference || CLOSED_EXPENSE_STATUSES.has(status)) return false
    if (Number(expense?.amount || 0) <= 0) return false
    return !postedKeys.has(reference)
}

export function bankTxnKey(accountId, date, description, amount) {
    return `${accountId}|${isoDate(date)}|${String(description || '').trim()}|${Number(amount || 0).toFixed(2)}`
}

function monthPeriod(year, monthIndex) {
    const start = new Date(Date.UTC(year, monthIndex, 1))
    const end = new Date(Date.UTC(year, monthIndex + 1, 0))
    return {
        label: start.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
    }
}

export function buildDefaultReportPeriods(today = new Date()) {
    const current = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    const monthIndex = current.getUTCMonth()
    const year = current.getUTCFullYear()
    const fyStartYear = monthIndex >= 9 ? year : year - 1

    if (monthIndex >= 9 || monthIndex <= 2) {
        const periods = []
        const cursor = new Date(Date.UTC(fyStartYear, 9, 1))
        const end = new Date(Date.UTC(year, monthIndex, 1))
        while (cursor <= end) {
            periods.push(monthPeriod(cursor.getUTCFullYear(), cursor.getUTCMonth()))
            cursor.setUTCMonth(cursor.getUTCMonth() + 1)
        }
        return periods
    }

    const periods = [{
        label: 'Oct-Mar',
        startDate: `${fyStartYear}-10-01`,
        endDate: `${fyStartYear + 1}-03-31`,
    }]
    for (let month = 3; month <= monthIndex; month += 1) {
        periods.push(monthPeriod(fyStartYear + 1, month))
    }
    return periods
}
