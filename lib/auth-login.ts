export interface LoginAccountRow {
    id?: string
    company_id?: string | null
    staff_id?: string | null
    username?: string | null
    pin?: string | null
    status?: string | null
}

export type LoginMatch =
    | { ok: true, account: LoginAccountRow }
    | { ok: false, reason: 'invalid' | 'disabled' }

function isDisabled(status: string | null | undefined) {
    const normalized = String(status ?? 'active').trim().toLowerCase()
    return normalized === 'disabled' || normalized === 'inactive'
}

export function pickLoginAccount(rows: LoginAccountRow[], staffIdOrUsername: string, pin: string): LoginMatch {
    const normalizedId = staffIdOrUsername.trim().toUpperCase()
    const normalizedPin = pin.trim()
    if (!normalizedId || !normalizedPin) return { ok: false, reason: 'invalid' }

    const matches = rows.filter((row) => {
        const staffId = String(row.staff_id ?? '').trim().toUpperCase()
        const username = String(row.username ?? '').trim().toUpperCase()
        const sameAccount = staffId === normalizedId || username === normalizedId
        return Boolean(row.company_id) && sameAccount && String(row.pin ?? '').trim() === normalizedPin
    })

    if (matches.length === 0) return { ok: false, reason: 'invalid' }
    const account = matches.find((row) => !isDisabled(row.status))
    if (!account) return { ok: false, reason: 'disabled' }
    return { ok: true, account }
}
