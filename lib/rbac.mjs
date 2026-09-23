const DEFAULT_ROLE_PERMISSIONS = {
    // Super Admin is a platform provisioning & oversight role — no transactional posting
    'super-admin': ['dashboard', 'reports', 'admin', 'settings'],
    // Legacy owner IDs are retained for existing accounts; the displayed role is Super Admin.
    md: ['dashboard', 'admin', 'settings'],
    'business-owner': ['dashboard', 'admin', 'settings'],
    accountant: ['dashboard', 'sales', 'accounting', 'reports'],
    cashier: ['dashboard', 'sales'],
    auditor: ['dashboard', 'reports', 'admin'],
}

const OWNER_OPERATIONAL_PERMISSIONS = [
    'sales', 'receivables', 'inventory', 'productManager', 'expenses', 'customers', 'suppliers',
    'supplierBalances', 'accounting', 'bankTxn', 'banks', 'dailyClose', 'ledger', 'payables', 'prepayments',
    'supplierRebates', 'loans', 'tax', 'reports', 'monthlyReport', 'annualReport', 'assetSchedule',
]

function isBusinessOwner(user) {
    const normalizedRole = String(user?.role || '').toLowerCase().replace(/[_\s]+/g, '-')
    return normalizedRole === 'business-owner' || normalizedRole === 'md'
}

function ownerHasFullAccess(user) {
    if (!isBusinessOwner(user)) return false
    if (user?.subscriptionStatus === 'trial') return true
    return user?.subscriptionPlan === 'Growth' || user?.subscriptionPlan === 'Growth Edition'
}

export const RBAC_TEMPLATES = [
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
        dataScope: 'own',
        template: 'Cashier',
    },
    {
        id: 'accountant',
        name: 'Accountant',
        description: 'Manages financial records',
        permissions: ['dashboard', 'sales', 'accounting', 'reports'],
        dataScope: 'team',
        template: 'Accountant',
    },
    {
        id: 'auditor',
        name: 'Auditor',
        description: 'Reviews logs and reports',
        permissions: ['dashboard', 'reports', 'admin'],
        dataScope: 'all',
        template: 'Auditor',
    },
]

export const ROLE_STORAGE_KEY = 'hw_rbac_roles'
export const USER_ROLE_STORAGE_KEY = 'hw_user_roles'

export function getDefaultRoles() {
    return RBAC_TEMPLATES.map((role) => ({ ...role }))
}

export function getStoredRoles() {
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

export function saveRoles(roles) {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(ROLE_STORAGE_KEY, JSON.stringify(roles))
}

function getRolePermissions(user) {
    if (!user) return []
    if (user.permissions && user.permissions.length > 0) return user.permissions
    return DEFAULT_ROLE_PERMISSIONS[user.role] || []
}

function getPermissionAccessLevel(user, permission) {
    if (!user) return null
    const normalizedRole = String(user.role || '').toLowerCase().replace(/[_\s]+/g, '-')
    const isOwner = normalizedRole === 'business-owner' || normalizedRole === 'md'
    if (user.accessLevels?.[permission]) return user.accessLevels[permission] || null
    if (isOwner && user.accessLevels) {
        const selectedLevel = user.accessLevels[permission]
        if (permission === 'bankTxn' || permission === 'banks') return selectedLevel === 'edit' ? 'view' : selectedLevel || null
        return selectedLevel || null
    }
    if (ownerHasFullAccess(user)) {
        if (permission === 'bankTxn' || permission === 'banks') return 'view'
        if (permission === 'admin' || permission === 'settings' || OWNER_OPERATIONAL_PERMISSIONS.includes(permission)) return 'edit'
    }
    if (user.accessLevels?.[permission]) return user.accessLevels[permission]
    if (permission === 'settings') {
        if (normalizedRole === 'super-admin') return 'edit'
    }
    if (getRolePermissions(user).includes(permission)) return 'edit'
    if (user.visibleMenus?.includes(permission)) return 'view'
    const roleDef = RBAC_TEMPLATES.find((role) => role.id === user.role)
    if (roleDef?.permissions?.includes(permission)) return 'edit'
    if (roleDef?.visibleMenus?.includes(permission)) return 'view'
    return null
}

export function roleHasPermission(user, permission) {
    return getPermissionAccessLevel(user, permission) !== null
}

export function canEditPermission(user, permission) {
    return getPermissionAccessLevel(user, permission) === 'edit'
}

const ROUTE_PERMISSIONS = {
    '/dashboard': 'dashboard', '/sales': 'sales', '/inventory': 'inventory',
    '/customers': 'customers', '/suppliers': 'suppliers', '/expenses': 'expenses', '/ledger': 'ledger', '/daily-close': 'dailyClose',
    '/receivables': 'receivables', '/payables': 'payables', '/supplier-balances': 'supplierBalances', '/prepayments': 'prepayments', '/supplier-rebates': 'supplierRebates',
    '/loans': 'loans', '/reports': 'reports', '/monthly-report': 'monthlyReport', '/annual-report': 'annualReport',
    '/asset-schedule': 'assetSchedule', '/settings': 'settings', '/backup': 'admin', '/change-password': 'settings',
    '/subscription-and-licensing': 'admin', '/audit': 'admin', '/staff-management': 'admin', '/payroll': 'admin', '/role-management': 'admin', '/bank-txn': 'bankTxn',
    '/banks': 'banks', '/tax': 'tax', '/product-manager': 'productManager', '/user-guide': 'dashboard',
}

export function getRoutePermission(pathname) {
    return Object.entries(ROUTE_PERMISSIONS).find(([path]) => pathname.startsWith(path))?.[1] || null
}

export function generateStaffId(name) {
    const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase()
    const randomSegment = Math.floor(1000 + Math.random() * 9000)
    return `${cleanName}-${randomSegment}`
}

export function generatePin() {
    return `${Math.floor(1000 + Math.random() * 9000)}`
}

export function findStaffMemberByLogin(staffMembers, staffIdOrUsername, pin) {
    const normalizedStaffId = staffIdOrUsername.trim().toUpperCase()
    const normalizedPin = pin.trim()

    return staffMembers.find((member) => {
        const matchesStaffId = member.staffId?.trim().toUpperCase() === normalizedStaffId
        const matchesUsername = member.username?.trim().toUpperCase() === normalizedStaffId
        return (matchesStaffId || matchesUsername) && member.pin?.trim() === normalizedPin
    })
}

export function canAccessRoute(user, pathname) {
    const routePermissions = {
        '/dashboard': 'dashboard',
        '/sales': 'sales',
        '/inventory': 'inventory',
        '/customers': 'customers',
        '/suppliers': 'suppliers',
        '/ledger': 'accounting',
        '/daily-close': 'accounting',
        '/receivables': 'accounting',
        '/payables': 'accounting',
        '/prepayments': 'accounting',
        '/supplier-rebates': 'accounting',
        '/loans': 'accounting',
        '/reports': 'reports',
        '/monthly-report': 'reports',
        '/annual-report': 'reports',
        '/asset-schedule': 'reports',
        '/settings': 'settings',
        '/backup': 'admin',
        '/change-password': 'settings',
        '/subscription-and-licensing': 'admin',
        '/audit': 'admin',
        '/staff-management': 'admin',
        '/banks': 'banks',
        '/bank-txn': 'bankTxn',
        '/tax': 'accounting',
        '/product-manager': 'inventory',
        '/user-guide': 'dashboard',
    }

    const matchingPermission = Object.entries(routePermissions).find(([path]) => pathname.startsWith(path))
    if (!matchingPermission) return true
    return roleHasPermission(user, matchingPermission[1])
}

export function getVisibleNavigationItems(user) {
    const allItems = [
        { label: 'Dashboard', href: '/dashboard', group: 'OVERVIEW' },
        { label: 'Sales', href: '/sales', group: 'TRANSACTIONS' },
        { label: 'Inventory', href: '/inventory', group: 'STOCK' },
        { label: 'Product Manager', href: '/product-manager', group: 'STOCK' },
        { label: 'Bank Transactions', href: '/bank-txn', group: 'BANKING' },
        { label: 'Bank Balances', href: '/banks', group: 'BANKING' },
        { label: 'Daily Closing', href: '/daily-close', group: 'ACCOUNTING' },
        { label: 'Audit Trail', href: '/audit', group: 'AUDIT & ADMIN' },
        { label: 'General Ledger', href: '/ledger', group: 'ACCOUNTING' },
        { label: 'Receivables', href: '/receivables', group: 'ACCOUNTING' },
        { label: 'Payables', href: '/payables', group: 'ACCOUNTING' },
        { label: 'Prepayments', href: '/prepayments', group: 'ACCOUNTING' },
        { label: 'Supplier Rebates', href: '/supplier-rebates', group: 'ACCOUNTING' },
        { label: 'Loans', href: '/loans', group: 'ACCOUNTING' },
        { label: 'Monthly Report', href: '/monthly-report', group: 'REPORTS' },
        { label: 'Annual Report', href: '/annual-report', group: 'REPORTS' },
        { label: 'Asset Schedule', href: '/asset-schedule', group: 'REPORTS' },
        { label: 'Staff Management', href: '/staff-management', group: 'HUMAN RESOURCES' },
        { label: 'Role Management', href: '/role-management', group: 'AUDIT & ADMIN' },
        { label: 'Settings', href: '/settings', group: 'AUDIT & ADMIN' },
        { label: 'Backup & Recovery', href: '/backup', group: 'AUDIT & ADMIN' },
        { label: 'Subscription & Licensing', href: '/subscription-and-licensing', group: 'AUDIT & ADMIN' },
        { label: 'User Guide', href: '/user-guide', group: 'AUDIT & ADMIN' },
    ]

    return allItems.filter((item) => {
        return roleHasPermission(user, getNavigationPermission(item.href))
    })
}

function getNavigationPermission(href) {
    if (href === '/dashboard') return 'dashboard'
    if (href === '/sales') return 'sales'
    if (['/inventory', '/product-manager'].includes(href)) return 'inventory'
    if (href === '/bank-txn') return 'bankTxn'
    if (href === '/banks') return 'banks'
    if (['/daily-close', '/ledger', '/receivables', '/payables', '/prepayments', '/supplier-rebates', '/loans', '/tax'].includes(href)) return 'accounting'
    if (['/monthly-report', '/annual-report', '/asset-schedule', '/reports'].includes(href)) return 'reports'
    if (['/settings', '/backup', '/subscription-and-licensing', '/audit', '/staff-management', '/role-management'].includes(href)) return 'admin'
    return 'dashboard'
}
