import { explicitAccessLevels, menuAccessFromLevels, type AccessLevel, type AccessLevels } from './access-levels'

export type PermissionKey =
    | 'dashboard'
    | 'sales'
    | 'receivables'
    | 'inventory'
    | 'productManager'
    | 'expenses'
    | 'customers'
    | 'suppliers'
    | 'supplierBalances'
    | 'accounting'
    | 'bankTxn'
    | 'banks'
    | 'dailyClose'
    | 'ledger'
    | 'payables'
    | 'prepayments'
    | 'supplierRebates'
    | 'loans'
    | 'tax'
    | 'reports'
    | 'monthlyReport'
    | 'annualReport'
    | 'assetSchedule'
    | 'admin'
    | 'settings'

export type { AccessLevel, AccessLevels } from './access-levels'
export { explicitAccessLevels, menuAccessFromLevels }

export interface RoleDefinition {
    id: string
    name: string
    description: string
    permissions: PermissionKey[]
    visibleMenus?: PermissionKey[]
    dataScope: 'own' | 'team' | 'branch' | 'all'
    branchId?: string
    template?: string
}

export interface UserWithRole {
    name: string
    role: string
    roleId?: string
    permissions?: PermissionKey[]
    visibleMenus?: PermissionKey[]
    accessLevels?: AccessLevels
    roleName?: string
    dataScope?: RoleDefinition['dataScope']
    branchId?: string
    staffId?: string
    subscriptionPlan?: string
    subscriptionStatus?: 'active' | 'trial' | 'expired' | 'cancelled'
}

export interface StaffMemberRecord {
    id: string
    name: string
    staffId: string
    pin: string
    roleId: string
    roleName: string
    permissions: PermissionKey[]
    visibleMenus?: PermissionKey[]
    accessLevels?: AccessLevels
    dataScope: RoleDefinition['dataScope']
    status: 'active' | 'disabled'
    createdAt: string
    branch?: string
    department?: string
    position?: string
    phone?: string
    email?: string
    dateOfBirth?: string
    gender?: string
    passportPhoto?: string
    employeeId?: string
    username?: string
    password?: string
    salary?: string
    employmentDate?: string
    lastLogin?: string
}

const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
    // Super Admin is a platform provisioning & oversight role — no transactional posting
    'super-admin': ['dashboard', 'reports', 'admin', 'settings'],
    // Legacy owner IDs are retained for existing accounts; the displayed role is Super Admin.
    md: ['dashboard', 'admin', 'settings'],
    'business-owner': ['dashboard', 'admin', 'settings'],
    accountant: ['dashboard', 'sales', 'expenses', 'accounting', 'reports', 'customers', 'suppliers'],
    // Sales officer / cashier: sales-focused
    'sales-officer': ['dashboard', 'sales'],
    'sales-manager': ['dashboard', 'sales'],
    cashier: ['dashboard', 'sales'],
    // Purchasing officer: purchases-focused
    'purchasing-officer': ['dashboard'],
    // Stock / Inventory manager
    'stock-manager': ['dashboard', 'inventory'],
    // HR officer: basic dashboard and staff management visibility
    'hr-officer': ['dashboard'],
    // Treasury officer: banking and accounting visibility
    'treasury-officer': ['dashboard', 'accounting', 'reports'],
    auditor: ['dashboard', 'reports', 'admin'],
}

const OWNER_OPERATIONAL_PERMISSIONS: PermissionKey[] = [
    'sales', 'receivables', 'inventory', 'productManager', 'expenses', 'customers', 'suppliers',
    'supplierBalances', 'accounting', 'bankTxn', 'banks', 'dailyClose', 'ledger', 'payables', 'prepayments',
    'supplierRebates', 'loans', 'tax', 'reports', 'monthlyReport', 'annualReport', 'assetSchedule',
]

function isBusinessOwner(user: Pick<UserWithRole, 'role'> | null | undefined): boolean {
    const normalizedRole = String(user?.role || '').toLowerCase().replace(/[_\s]+/g, '-')
    return normalizedRole === 'business-owner' || normalizedRole === 'md'
}

function ownerHasFullAccess(user: Pick<UserWithRole, 'role' | 'subscriptionPlan' | 'subscriptionStatus'> | null | undefined): boolean {
    if (!isBusinessOwner(user)) return false
    if (user?.subscriptionStatus === 'trial') return true
    return user?.subscriptionPlan === 'Growth' || user?.subscriptionPlan === 'Growth Edition'
}

export const RBAC_TEMPLATES: RoleDefinition[] = [
    {
        id: 'super-admin',
        name: 'Super Admin',
        description: 'Platform provisioning and oversight (no transactional posting)',
        permissions: ['dashboard', 'reports', 'admin', 'settings'],
        visibleMenus: ['dashboard', 'reports', 'admin', 'settings', 'bankTxn', 'banks', 'assetSchedule'],
        dataScope: 'all',
        template: 'Super Admin',
    },
    {
        id: 'business-owner',
        name: 'Super Admin',
        description: 'Company owner with administration and staff provisioning access',
        permissions: ['dashboard', 'admin', 'settings'],
        visibleMenus: ['dashboard', 'admin', 'settings', 'bankTxn', 'banks'],
        dataScope: 'all',
        template: 'Super Admin',
    },
    {
        id: 'cashier',
        name: 'Cashier',
        description: 'Handles sales and cash transactions',
        permissions: ['dashboard', 'sales'],
        visibleMenus: ['dashboard', 'sales'],
        dataScope: 'own',
        template: 'Cashier',
    },
    {
        id: 'accountant',
        name: 'Accountant',
        description: 'Manages financial records',
        permissions: ['dashboard', 'sales', 'expenses', 'accounting', 'reports'],
        visibleMenus: ['dashboard', 'sales', 'expenses', 'accounting', 'reports'],
        dataScope: 'team',
        template: 'Accountant',
    },
    {
        id: 'sales-officer',
        name: 'Sales Officer',
        description: 'Handles sales operations',
        permissions: ['dashboard', 'sales'],
        visibleMenus: ['dashboard', 'sales'],
        dataScope: 'own',
        template: 'Sales Officer',
    },
    {
        id: 'sales-manager',
        name: 'Sales Manager',
        description: 'Manages sales team; primarily view/reporting for sales, inventory and receivables',
        permissions: ['dashboard', 'sales'],
        visibleMenus: ['dashboard', 'sales', 'inventory', 'receivables'],
        dataScope: 'team',
        template: 'Sales Manager',
    },
    {
        id: 'purchasing-officer',
        name: 'Purchasing Officer',
        description: 'Manages purchase orders and supplier interactions',
        permissions: ['dashboard'],
        visibleMenus: ['dashboard'],
        dataScope: 'team',
        template: 'Purchasing Officer',
    },
    {
        id: 'stock-manager',
        name: 'Stock Manager',
        description: 'Manages inventory and product listings',
        permissions: ['dashboard', 'inventory'],
        visibleMenus: ['dashboard', 'inventory'],
        dataScope: 'branch',
        template: 'Stock Manager',
    },
    {
        id: 'auditor',
        name: 'Auditor',
        description: 'Reviews logs and reports',
        permissions: ['dashboard', 'reports', 'admin'],
        visibleMenus: ['dashboard', 'reports'],
        dataScope: 'all',
        template: 'Auditor',
    },
    {
        id: 'hr-officer',
        name: 'HR Officer',
        description: 'Manages staff records and HR processes',
        permissions: ['dashboard'],
        visibleMenus: ['dashboard'],
        dataScope: 'team',
        template: 'HR Officer',
    },
    {
        id: 'treasury-officer',
        name: 'Treasury Officer',
        description: 'Manages bank transactions and treasury operations',
        permissions: ['dashboard', 'accounting', 'reports'],
        visibleMenus: ['dashboard', 'accounting', 'reports'],
        dataScope: 'team',
        template: 'Treasury Officer',
    },
]

export const ROLE_STORAGE_KEY = 'hw_rbac_roles'
export const USER_ROLE_STORAGE_KEY = 'hw_user_roles'

export function getDefaultRoles(): RoleDefinition[] {
    return RBAC_TEMPLATES.map((role) => ({ ...role, visibleMenus: role.visibleMenus ? [...role.visibleMenus] : undefined }))
}

export function getStoredRoles(): RoleDefinition[] {
    if (typeof window === 'undefined') return getDefaultRoles()
    const raw = window.localStorage.getItem(ROLE_STORAGE_KEY)
    if (!raw) return getDefaultRoles()
    try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : getDefaultRoles()
    } catch {
        return getDefaultRoles()
    }
}

export function saveRoles(roles: RoleDefinition[]) {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(ROLE_STORAGE_KEY, JSON.stringify(roles))
}

function getRolePermissions(user: Pick<UserWithRole, 'role' | 'permissions'> | null | undefined): PermissionKey[] {
    if (!user) return []
    if (user.permissions && user.permissions.length > 0) return user.permissions as PermissionKey[]
    return DEFAULT_ROLE_PERMISSIONS[user.role] || []
}

function roleTemplateAccess(role: string | undefined): AccessLevels {
    const roleId = String(role || '').toLowerCase().replace(/[_\s]+/g, '-')
    const roleDef = RBAC_TEMPLATES.find((item) => item.id === roleId) || (roleId === 'md' ? RBAC_TEMPLATES.find((item) => item.id === 'business-owner') : undefined)
    const access: AccessLevels = {}
    roleDef?.visibleMenus?.forEach((key) => { access[key] = 'view' })
    roleDef?.permissions.forEach((key) => { access[key] = 'edit' })
    return access
}

function sameAccess(left: AccessLevels, right: AccessLevels) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    for (const key of keys) {
        if (left[key as PermissionKey] !== right[key as PermissionKey]) return false
    }
    return true
}

export function savedMenuAccess(record: { role?: string; roleId?: string; accessLevels?: AccessLevels | null; visibleMenus?: PermissionKey[] | null; permissions?: PermissionKey[] | null } | null | undefined) {
    if (!record) return null
    if (record.accessLevels && typeof record.accessLevels === 'object' && !Array.isArray(record.accessLevels)) {
        return menuAccessFromLevels(explicitAccessLevels(record.accessLevels) || {})
    }
    const fromLists: AccessLevels = {}
    record.visibleMenus?.forEach((key) => { fromLists[key] = 'view' })
    record.permissions?.forEach((key) => { fromLists[key] = 'edit' })
    if (Object.keys(fromLists).length === 0) return null
    if (sameAccess(fromLists, roleTemplateAccess(record.role || record.roleId))) return null
    return menuAccessFromLevels(fromLists)
}

export function resolveMenuAccess(user: Pick<UserWithRole, 'role' | 'permissions' | 'visibleMenus' | 'accessLevels'> | null | undefined) {
    return savedMenuAccess(user) || menuAccessFromLevels(roleTemplateAccess(user?.role))
}

export function hasExplicitMenuGrant(user: Pick<UserWithRole, 'accessLevels'> | null | undefined, permission: PermissionKey | null): boolean {
    if (!permission) return false
    const level = explicitAccessLevels(user?.accessLevels)?.[permission]
    return level === 'view' || level === 'edit'
}

export function getPermissionAccessLevel(
    user: Pick<UserWithRole, 'role' | 'permissions' | 'visibleMenus' | 'accessLevels' | 'subscriptionPlan' | 'subscriptionStatus'> | null | undefined,
    permission: PermissionKey,
): AccessLevel | null {
    if (!user) return null
    const normalizedRole = String(user.role || '').toLowerCase().replace(/[_\s]+/g, '-')
    if (user.accessLevels && typeof user.accessLevels === 'object' && !Array.isArray(user.accessLevels)) {
        const selectedLevel = user.accessLevels[permission]
        const level = selectedLevel === 'view' || selectedLevel === 'edit' ? selectedLevel : null
        if ((permission === 'bankTxn' || permission === 'banks') && level === 'edit') return 'view'
        return level
    }
    if (ownerHasFullAccess(user)) {
        if (permission === 'bankTxn' || permission === 'banks') return 'view'
        if (permission === 'admin' || permission === 'settings' || OWNER_OPERATIONAL_PERMISSIONS.includes(permission)) return 'edit'
    }
    if (permission === 'settings' && normalizedRole === 'super-admin') return 'edit'
    if (getRolePermissions(user).includes(permission)) return 'edit'
    if (user.visibleMenus?.includes(permission)) return 'view'

    const roleDef = RBAC_TEMPLATES.find((role) => role.id === user.role)
    if (roleDef?.permissions.includes(permission)) return 'edit'
    if (roleDef?.visibleMenus?.includes(permission)) return 'view'
    return null
}

export function roleHasPermission(user: Pick<UserWithRole, 'role' | 'permissions'> | null | undefined, permission: PermissionKey): boolean {
    return getPermissionAccessLevel(user, permission) !== null
}

export function canEditPermission(
    user: Pick<UserWithRole, 'role' | 'permissions' | 'visibleMenus' | 'accessLevels'> | null | undefined,
    permission: PermissionKey,
): boolean {
    return getPermissionAccessLevel(user, permission) === 'edit'
}

const ROUTE_PERMISSIONS: Record<string, PermissionKey> = {
    '/dashboard': 'dashboard', '/sales': 'sales', '/inventory': 'inventory',
    '/customers': 'customers', '/suppliers': 'suppliers', '/expenses': 'expenses', '/ledger': 'ledger', '/daily-close': 'dailyClose',
    '/receivables': 'receivables', '/payables': 'payables', '/supplier-balances': 'supplierBalances', '/prepayments': 'prepayments', '/supplier-rebates': 'supplierRebates',
    '/loans': 'loans', '/reports': 'reports', '/monthly-report': 'monthlyReport', '/annual-report': 'annualReport',
    '/asset-schedule': 'assetSchedule', '/settings': 'settings', '/backup': 'admin', '/change-password': 'settings',
    '/subscription-and-licensing': 'admin', '/audit': 'admin', '/staff-management': 'admin', '/payroll': 'admin', '/role-management': 'admin', '/bank-txn': 'bankTxn',
    '/banks': 'banks', '/tax': 'tax', '/product-manager': 'productManager', '/user-guide': 'dashboard',
}

export function getRoutePermission(pathname: string): PermissionKey | null {
    return Object.entries(ROUTE_PERMISSIONS).find(([path]) => pathname.startsWith(path))?.[1] || null
}

export function canAccessRoute(user: Pick<UserWithRole, 'role' | 'permissions' | 'visibleMenus' | 'accessLevels'> | null | undefined, pathname: string): boolean {
    const permission = getRoutePermission(pathname)
    if (!permission) return true
    if (roleHasPermission(user, permission)) return true
    if (permission === 'ledger' && roleHasPermission(user, 'accounting')) return true
    return false
}

export function generateStaffId(name: string): string {
    const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase()
    const randomSegment = Math.floor(1000 + Math.random() * 9000)
    return `${cleanName}-${randomSegment}`
}

export function generatePin(): string {
    return `${Math.floor(1000 + Math.random() * 9000)}`
}

export function findStaffMemberByLogin(
    staffMembers: Array<Pick<StaffMemberRecord, 'staffId' | 'pin' | 'username'>>,
    staffIdOrUsername: string,
    pin: string,
): StaffMemberRecord | undefined {
    const normalizedStaffId = staffIdOrUsername.trim().toUpperCase()
    const normalizedPin = pin.trim()

    return staffMembers.find((member) => {
        const matchesStaffId = member.staffId?.trim().toUpperCase() === normalizedStaffId
        const matchesUsername = member.username?.trim().toUpperCase() === normalizedStaffId
        return (matchesStaffId || matchesUsername) && member.pin?.trim() === normalizedPin
    }) as StaffMemberRecord | undefined
}

export function getVisibleNavigationItems(user: Pick<UserWithRole, 'role' | 'permissions' | 'visibleMenus' | 'accessLevels' | 'subscriptionPlan' | 'subscriptionStatus'> | null | undefined) {
    const allItems = [
        { label: 'Dashboard', href: '/dashboard', group: 'OVERVIEW', permission: 'dashboard' as PermissionKey, icon: 'dashboard' },
        { label: 'Sales', href: '/sales', group: 'TRANSACTIONS', permission: 'sales' as PermissionKey, icon: 'sales' },
        { label: 'Expenses', href: '/expenses', group: 'TRANSACTIONS', permission: 'expenses' as PermissionKey, icon: 'expenses' },
        { label: 'Customers', href: '/customers', group: 'DIRECTORY', permission: 'customers' as PermissionKey, icon: 'customers' },
        { label: 'Suppliers', href: '/suppliers', group: 'DIRECTORY', permission: 'suppliers' as PermissionKey, icon: 'suppliers' },
        { label: 'Inventory', href: '/inventory', group: 'STOCK', permission: 'inventory' as PermissionKey, icon: 'inventory' },
        { label: 'Product Manager', href: '/product-manager', group: 'STOCK', permission: 'productManager' as PermissionKey, icon: 'productManager' },
        { label: 'Bank Transactions', href: '/bank-txn', group: 'BANKING', permission: 'bankTxn' as PermissionKey, icon: 'bankTxn' },
        { label: 'Bank Balances', href: '/banks', group: 'BANKING', permission: 'banks' as PermissionKey, icon: 'banks' },
        { label: 'Daily Closing', href: '/daily-close', group: 'ACCOUNTING', permission: 'dailyClose' as PermissionKey, icon: 'dailyClose' },
        { label: 'Audit Trail', href: '/audit', group: 'AUDIT & ADMIN', permission: 'admin' as PermissionKey, icon: 'audit' },
        { label: 'General Ledger', href: '/ledger', group: 'ACCOUNTING', permission: 'ledger' as PermissionKey, icon: 'ledger' },
        { label: 'Reports', href: '/reports', group: 'REPORTS', permission: 'reports' as PermissionKey, icon: 'reports' },
        { label: 'Tax', href: '/tax', group: 'ACCOUNTING', permission: 'tax' as PermissionKey, icon: 'tax' },
        { label: 'Receivables', href: '/receivables', group: 'ACCOUNTING', permission: 'receivables' as PermissionKey, icon: 'receivables' },
        { label: 'Payables', href: '/payables', group: 'ACCOUNTING', permission: 'payables' as PermissionKey, icon: 'payables' },
        { label: 'Supplier Balances', href: '/supplier-balances', group: 'ACCOUNTING', permission: 'supplierBalances' as PermissionKey, icon: 'supplierBalances' },
        { label: 'Prepayments', href: '/prepayments', group: 'ACCOUNTING', permission: 'prepayments' as PermissionKey, icon: 'prepayments' },
        { label: 'Supplier Rebates', href: '/supplier-rebates', group: 'ACCOUNTING', permission: 'supplierRebates' as PermissionKey, icon: 'supplierRebates' },
        { label: 'Loans', href: '/loans', group: 'ACCOUNTING', permission: 'loans' as PermissionKey, icon: 'loans' },
        { label: 'Monthly Report', href: '/monthly-report', group: 'REPORTS', permission: 'monthlyReport' as PermissionKey, icon: 'monthlyReport' },
        { label: 'Annual Report', href: '/annual-report', group: 'REPORTS', permission: 'annualReport' as PermissionKey, icon: 'annualReport' },
        { label: 'Asset Schedule', href: '/asset-schedule', group: 'REPORTS', permission: 'assetSchedule' as PermissionKey, icon: 'assetSchedule' },
        { label: 'Staff Management', href: '/staff-management', group: 'HUMAN RESOURCES', permission: 'admin' as PermissionKey, icon: 'settings' },
        { label: 'Settings', href: '/settings', group: 'AUDIT & ADMIN', permission: 'settings' as PermissionKey, icon: 'settings' },
        { label: 'Backup & Recovery', href: '/backup', group: 'AUDIT & ADMIN', permission: 'admin' as PermissionKey, icon: 'settings' },
        { label: 'Subscription & Licensing', href: '/subscription-and-licensing', group: 'AUDIT & ADMIN', permission: 'admin' as PermissionKey, icon: 'subscription' },
        { label: 'User Guide', href: '/user-guide', group: 'AUDIT & ADMIN', permission: 'dashboard' as PermissionKey, icon: 'userGuide' },
    ]

    return allItems.filter((item) => {
        if (roleHasPermission(user, item.permission)) return true
        return item.permission === 'ledger' && roleHasPermission(user, 'accounting')
    })
}
