export interface LoginIdentityRecord {
    company_id?: string | null
    staff_id?: string | null
    username?: string | null
    pin?: string | null
    status?: string | null
    created_at?: string | null
    updated_at?: string | null
    last_login?: string | null
}

export function normalizeLoginIdentifier(value: unknown) {
    return String(value ?? '').trim().toUpperCase()
}

export function normalizeLoginPin(value: unknown) {
    return String(value ?? '').trim()
}

export function isUsableAccountStatus(status: unknown) {
    const normalized = String(status ?? 'active').trim().toLowerCase()
    return normalized !== 'disabled' && normalized !== 'inactive' && normalized !== 'closed'
}

export function credentialsMatch(row: LoginIdentityRecord, staffIdOrUsername: string, pin: string) {
    if (!isUsableAccountStatus(row.status)) return false
    if (normalizeLoginPin(row.pin) !== normalizeLoginPin(pin)) return false

    const identifier = normalizeLoginIdentifier(staffIdOrUsername)
    const staffId = normalizeLoginIdentifier(row.staff_id)
    const username = normalizeLoginIdentifier(row.username)
    return Boolean(identifier) && (staffId === identifier || username === identifier)
}

export function findMatchingUser<T extends LoginIdentityRecord>(rows: T[] | null | undefined, staffIdOrUsername: string, pin: string) {
    const matches = (rows || []).filter((row) => credentialsMatch(row, staffIdOrUsername, pin) && row.company_id)
    if (matches.length <= 1) return matches[0] || null

    return [...matches].sort((left, right) => {
        const leftTime = Date.parse(String(left.updated_at || left.last_login || left.created_at || '')) || 0
        const rightTime = Date.parse(String(right.updated_at || right.last_login || right.created_at || '')) || 0
        return rightTime - leftTime
    })[0]
}
