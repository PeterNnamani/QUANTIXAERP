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

export const RBAC_TEMPLATES = [
    {
        id: 'super-admin',
        name: 'Super Admin',
        description: 'Platform provisioning and oversight (no transactional posting)',
        permissions: ['dashboard', 'reports', 'admin', 'settings'],
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

export function roleHasPermission(user, permission) {
    if (!user) return false
    const rolePermissions = getRolePermissions(user)
    return rolePermissions.includes(permission)
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
        '/supplier-balances': 'accounting',
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
        '/banks': 'accounting',
        '/bank-txn': 'accounting',
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
        { label: 'Supplier Balances', href: '/supplier-balances', group: 'ACCOUNTING' },
        { label: 'Customers', href: '/customers', group: 'DIRECTORY' },
        { label: 'Prepayments', href: '/prepayments', group: 'ACCOUNTING' },
        { label: 'Supplier Rebates', href: '/supplier-rebates', group: 'ACCOUNTING' },
        { label: 'Loans', href: '/loans', group: 'ACCOUNTING' },
        { label: 'Monthly Report', href: '/monthly-report', group: 'REPORTS' },
        { label: 'Annual Report', href: '/annual-report', group: 'REPORTS' },
        { label: 'Asset Schedule', href: '/asset-schedule', group: 'REPORTS' },
        { label: 'Settings', href: '/settings', group: 'AUDIT & ADMIN' },
        { label: 'Backup & Recovery', href: '/backup', group: 'AUDIT & ADMIN' },
        { label: 'Subscription & Licensing', href: '/subscription-and-licensing', group: 'AUDIT & ADMIN' },
        { label: 'User Guide', href: '/user-guide', group: 'AUDIT & ADMIN' },
    ]

    return allItems.filter((item) => {
        if (item.href === '/dashboard') return roleHasPermission(user, 'dashboard')
        if (['/sales'].includes(item.href)) return roleHasPermission(user, 'sales')
        if (['/inventory', '/product-manager'].includes(item.href)) return roleHasPermission(user, 'inventory')
        if (item.href === '/customers') return roleHasPermission(user, 'customers')
        if (['/bank-txn', '/banks', '/daily-close', '/ledger', '/receivables', '/payables', '/supplier-balances', '/prepayments', '/supplier-rebates', '/loans', '/tax'].includes(item.href)) return roleHasPermission(user, 'accounting')
        if (['/monthly-report', '/annual-report', '/asset-schedule', '/reports'].includes(item.href)) return roleHasPermission(user, 'reports')
        if (['/settings', '/backup', '/subscription-and-licensing', '/audit'].includes(item.href)) return roleHasPermission(user, 'admin') || roleHasPermission(user, 'settings')
        return true
    })
}
