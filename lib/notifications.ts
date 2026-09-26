export function pendingAuditActivity<T extends { event_time: string }>(logs: T[], cursor: string): { pending: T[]; nextCursor: string | null } {
    const sorted = [...logs].sort((left, right) => new Date(left.event_time).getTime() - new Date(right.event_time).getTime())
    const newest = sorted.at(-1)?.event_time
    const nextCursor = newest ? String(new Date(newest).getTime()) : (cursor || null)
    if (!cursor) return { pending: sorted.slice(-40), nextCursor }
    const cursorTime = Number(cursor)
    const pending = sorted.filter((log) => new Date(log.event_time).getTime() > cursorTime).slice(-40)
    return { pending, nextCursor }
}

export function isPayrollActivity(record: { desc?: string; description?: string; activity?: string; name?: string }): boolean {
    return /payroll/i.test(`${record.desc || ''} ${record.description || ''} ${record.activity || ''} ${record.name || ''}`)
}
