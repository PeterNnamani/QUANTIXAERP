import { explicitAccessLevels, menuAccessFromLevels, type AccessLevels, type RoleDefinition } from '@/lib/rbac'
import type { User } from '@/lib/context'

export class SignInError extends Error {
    code: 'disabled' | 'unavailable'

    constructor(code: 'disabled' | 'unavailable', message: string) {
        super(message)
        this.name = 'SignInError'
        this.code = code
    }
}

export interface DatabaseUserRecord {
    id?: string
    company_id?: string | null
    company_name?: string | null
    staff_id?: string | null
    username?: string | null
    pin?: string | null
    user_settings?: Record<string, unknown> | null
    email?: string | null
    full_name?: string | null
    role?: string | null
    role_title?: string | null
    access_levels?: AccessLevels | null
    phone?: string | null
    status?: string | null
    branch?: string | null
    department?: string | null
    position?: string | null
    employee_id?: string | null
    salary?: string | null
    employment_date?: string | null
    created_at?: string | null
    updated_at?: string | null
    last_login?: string | null
}

export function userFromDatabaseRecord(match: DatabaseUserRecord, roles: RoleDefinition[]): User | null {
    if (!match.company_id) return null

    const roleId = String(match.role || 'cashier')
    const roleDefinition = roles.find((role) => role.id === roleId)

    return {
        companyId: String(match.company_id || ''),
        companyName: match.company_name ? String(match.company_name) : undefined,
        name: String(match.full_name || match.username || match.staff_id || 'Staff User'),
        role: roleId,
        roleId,
        roleName: match.role_title ? String(match.role_title) : roleDefinition?.name,
        email: match.email ? String(match.email) : undefined,
        staffId: match.staff_id ? String(match.staff_id) : undefined,
        ...(match.access_levels && typeof match.access_levels === 'object' && !Array.isArray(match.access_levels)
            ? menuAccessFromLevels(explicitAccessLevels(match.access_levels) || {})
            : {
            permissions: roleDefinition?.permissions || [],
            visibleMenus: roleDefinition?.visibleMenus,
            accessLevels: undefined,
        }),
        dataScope: roleDefinition?.dataScope || 'team',
        username: match.username ? String(match.username) : undefined,
        pin: match.pin ? String(match.pin) : undefined,
        userSettings: match.user_settings || undefined,
    }
}

export async function findUserInDatabase(
    staffIdOrUsername: string,
    pin: string,
    roles: RoleDefinition[],
): Promise<User | null> {
    const normalizedId = staffIdOrUsername.trim().toUpperCase()
    const normalizedPin = pin.trim()
    if (!normalizedId || !normalizedPin) return null

    let response: Response
    try {
        response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ staffIdOrUsername: normalizedId, pin: normalizedPin }),
            signal: AbortSignal.timeout(20000),
        })
    } catch (error) {
        console.warn('Unable to reach sign-in', error)
        throw new SignInError('unavailable', 'Sign-in is unavailable right now.')
    }

    const result = await response.json().catch(() => ({}))
    if (response.status === 401) return null
    if (response.status === 403) {
        throw new SignInError('disabled', String(result.error || 'This account is disabled.'))
    }
    if (!response.ok || !result.success || !result.user) {
        throw new SignInError('unavailable', String(result.error || 'Sign-in is unavailable right now.'))
    }

    return userFromDatabaseRecord(result.user as DatabaseUserRecord, roles)
}

export async function recordUserLogin(user: Pick<User, 'companyId' | 'staffId' | 'username'>) {
    if (!user.companyId || (!user.staffId && !user.username)) return

    try {
        await fetch('/api/users/last-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                companyId: user.companyId,
                staffId: user.staffId,
                username: user.username,
            }),
        })
    } catch (error) {
        console.warn('Unable to record user login time', error)
    }
}

export async function saveUserToDatabase(payload: {
    companyId: string
    staffId: string
    username: string
    pin: string
    fullName: string
    roleId: string
    roleTitle?: string
    accessLevels?: AccessLevels
    email?: string
    phone?: string
    branch?: string
    department?: string
    position?: string
    employeeId?: string
    salary?: string
    employmentDate?: string
    status?: string
}) {
    const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })

    const result = await response.json()
    if (!response.ok || !result.success) {
        console.warn('Unable to write staff user to users table', result.error)
        return { success: false, error: result.error || 'Unable to save user' }
    }

    return { success: true }
}
