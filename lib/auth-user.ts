import { explicitAccessLevels, menuAccessFromLevels, type AccessLevels } from '@/lib/access-levels'
import { getDefaultRoles, type RoleDefinition } from '@/lib/rbac'
import { normalizePlanName, type PlanName } from '@/lib/licensing'
import { type LoginIdentityRecord } from '@/lib/auth-credentials'

export {
    credentialsMatch,
    findMatchingUser,
    isUsableAccountStatus,
    normalizeLoginIdentifier,
    normalizeLoginPin,
} from '@/lib/auth-credentials'

export interface DatabaseUserRecord extends LoginIdentityRecord {
    id?: string
    company_name?: string | null
    user_settings?: Record<string, unknown> | null
    email?: string | null
    full_name?: string | null
    role?: string | null
    role_title?: string | null
    access_levels?: AccessLevels | null
    phone?: string | null
    branch?: string | null
    department?: string | null
    position?: string | null
    employee_id?: string | null
    salary?: string | null
    employment_date?: string | null
}

export interface AuthSessionUser {
    companyId: string
    companyName?: string
    name: string
    role: string
    roleId: string
    roleName?: string
    email?: string
    staffId?: string
    username?: string
    pin?: string
    permissions?: string[]
    visibleMenus?: string[]
    accessLevels?: AccessLevels
    dataScope?: 'own' | 'team' | 'branch' | 'all'
    userSettings?: Record<string, unknown>
    subscriptionPlan?: PlanName
    subscriptionStatus?: 'active' | 'trial' | 'expired' | 'cancelled'
    trialEndsAt?: string
}

export interface AuthSubscriptionRecord {
    plan_name?: string | null
    status?: string | null
    expires_at?: string | null
}

export function mapDatabaseUser(
    row: DatabaseUserRecord,
    options: {
        companyName?: string | null
        roles?: RoleDefinition[]
        subscription?: AuthSubscriptionRecord | null
    } = {},
): AuthSessionUser | null {
    if (!row?.company_id) return null

    const roles = options.roles && options.roles.length > 0 ? options.roles : getDefaultRoles()
    const roleId = String(row.role || 'cashier').toLowerCase().replace(/[_\s]+/g, '-')
    const roleDefinition = roles.find((role) => role.id === roleId) || (roleId === 'md' ? roles.find((role) => role.id === 'business-owner') : undefined)
    const companyName = options.companyName || row.company_name || undefined
    const subscriptionPlan = normalizePlanName(options.subscription?.plan_name) || undefined
    const subscriptionStatus = ['active', 'trial', 'expired', 'cancelled'].includes(String(options.subscription?.status || ''))
        ? options.subscription!.status as AuthSessionUser['subscriptionStatus']
        : undefined

    return {
        companyId: String(row.company_id),
        companyName: companyName ? String(companyName) : undefined,
        name: String(row.full_name || row.username || row.staff_id || 'Staff User'),
        role: roleId,
        roleId,
        roleName: row.role_title ? String(row.role_title) : roleDefinition?.name,
        email: row.email ? String(row.email) : undefined,
        staffId: row.staff_id ? String(row.staff_id) : undefined,
        ...(row.access_levels && typeof row.access_levels === 'object' && !Array.isArray(row.access_levels)
            ? menuAccessFromLevels(explicitAccessLevels(row.access_levels) || {})
            : {
                permissions: roleDefinition?.permissions || [],
                visibleMenus: roleDefinition?.visibleMenus,
                accessLevels: undefined,
            }),
        dataScope: roleDefinition?.dataScope || 'team',
        username: row.username ? String(row.username) : undefined,
        pin: row.pin ? String(row.pin) : undefined,
        userSettings: row.user_settings || undefined,
        subscriptionPlan,
        subscriptionStatus,
        trialEndsAt: options.subscription?.expires_at ? String(options.subscription.expires_at) : undefined,
    }
}
