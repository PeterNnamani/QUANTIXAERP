import { type RoleDefinition } from '@/lib/rbac'
import type { AuthSessionUser } from '@/lib/auth-user'

export type { DatabaseUserRecord } from '@/lib/auth-user'

function asUser(user: AuthSessionUser | null | undefined): AuthSessionUser | null {
    return user || null
}

export async function findUserInDatabase(
    staffIdOrUsername: string,
    pin: string,
    _roles?: RoleDefinition[],
): Promise<AuthSessionUser | null> {
    const result = await loginWithCredentials(staffIdOrUsername, pin)
    return result.user
}

export async function loginWithCredentials(staffIdOrUsername: string, pin: string): Promise<{ user: AuthSessionUser | null; error?: string }> {
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: staffIdOrUsername,
                pin,
            }),
        })

        const result = await response.json().catch(() => null)
        if (!response.ok || !result?.user) {
            return {
                user: null,
                error: result?.error || (response.ok ? 'Invalid username or password' : 'Unable to sign in right now.'),
            }
        }

        return { user: asUser(result.user), error: undefined }
    } catch (error) {
        return {
            user: null,
            error: error instanceof Error ? error.message : 'Unable to sign in right now.',
        }
    }
}

export async function recordUserLogin(user: Pick<AuthSessionUser, 'companyId' | 'staffId' | 'username'>) {
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
    accessLevels?: AuthSessionUser['accessLevels']
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
