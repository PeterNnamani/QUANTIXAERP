'use client'

import { usePathname, useRouter } from 'next/navigation'
import { ReactNode, useState } from 'react'
import { useAccounting } from '@/lib/context'
import { planCanAccessRoute } from '@/lib/licensing'
import { canAccessRoute, getVisibleNavigationItems, hasExplicitMenuGrant } from '@/lib/rbac'
import { triggerAppToast } from '@/lib/utils'

interface NavItem {
  label: string
  href: string
  icon: string
  roles: string[]
}

const ICONS: Record<string, ReactNode> = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17h4V9H3v8Zm6 0h4V5H9v12Zm6 0h4V13h-4v4Z" />
    </svg>
  ),
  sales: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M2 10h20" />
    </svg>
  ),
  expenses: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 7h12" />
      <path d="M12 7v10" />
      <path d="M8 17h8" />
    </svg>
  ),
  bankTxn: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 7h8" />
      <path d="M8 16h8" />
      <path d="m16 4 4 4-4 4" />
      <path d="m8 20-4-4 4-4" />
    </svg>
  ),
  subscription: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M3 11h18" />
      <path d="M8 7v-3" />
      <path d="M16 7v-3" />
      <path d="M10 14h4" />
    </svg>
  ),
  banks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 20h18" />
      <path d="M12 3 2 8h20L12 3Z" />
      <path d="M7 8v12" />
      <path d="M12 8v12" />
      <path d="M17 8v12" />
    </svg>
  ),
  inventory: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M9 10v10" />
      <path d="M15 10v10" />
    </svg>
  ),
  productManager: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16v12H4z" />
      <path d="M4 10h16" />
      <path d="M7 6v-2" />
      <path d="M17 6v-2" />
    </svg>
  ),
  dailyClose: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="8" width="14" height="10" rx="2" />
      <path d="M12 12v4" />
      <path d="M9 12h6" />
    </svg>
  ),
  audit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m16 16 4 4" />
    </svg>
  ),
  ledger: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  ),
  receivables: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3" />
      <path d="M5 21c0-3.5 2.7-6 7-6s7 2.5 7 6" />
    </svg>
  ),
  payables: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16" />
      <path d="M4 10h16" />
      <path d="M4 14h10" />
      <path d="M8 18h8" />
    </svg>
  ),
  supplierBalances: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 20h12" />
      <path d="M6 4h12" />
      <path d="M6 4 12 12 6 20" />
      <path d="M18 4 12 12 18 20" />
    </svg>
  ),
  prepayments: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v6" />
      <path d="M5 12h14" />
      <path d="M7 19h10" />
      <path d="M12 9a9 9 0 0 1 0 10" />
    </svg>
  ),
  supplierRebates: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h16" />
      <path d="M4 8h16" />
      <path d="M4 16h10" />
      <path d="M14 16v4" />
    </svg>
  ),
  loans: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h16" />
      <path d="M8 4h8" />
      <path d="M6 10h12" />
      <path d="M6 14h12" />
    </svg>
  ),
  tax: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M12 16h4" />
    </svg>
  ),
  monthlyReport: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 18h16" />
      <path d="M7 14v4" />
      <path d="M12 10v8" />
      <path d="M17 6v12" />
    </svg>
  ),
  annualReport: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 10h16" />
      <path d="M10 4v4" />
      <path d="M14 4v4" />
    </svg>
  ),
  assetSchedule: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 20h14" />
      <path d="M5 7h14" />
      <path d="M5 7 12 3l7 4" />
      <path d="M9 10h6" />
      <path d="M9 13h6" />
    </svg>
  ),
  suppliers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h16" />
      <path d="M6 20V10h12v10" />
      <path d="M9 10V6h6v4" />
    </svg>
  ),
  customers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    </svg>
  ),
  changePassword: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M12 11V7a2 2 0 1 1 4 0" />
    </svg>
  ),
  userGuide: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v16H4z" />
      <path d="M8 4v16" />
      <path d="M12 13h6" />
      <path d="M12 9h6" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 8.6 15a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 8.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 15 9a1.65 1.65 0 0 0 1.82.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 15Z" />
    </svg>
  ),
}

const NAV_GROUPS = {
  OVERVIEW: [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard', roles: ['md', 'accountant', 'cashier', 'auditor'] },
  ],
  TRANSACTIONS: [
    { label: 'Sales', href: '/sales', icon: 'sales', roles: ['md', 'accountant', 'cashier'] },
    { label: 'Expenses', href: '/expenses', icon: 'expenses', roles: ['md', 'accountant'] },
  ],
  BANKING: [
    { label: 'Bank Transactions', href: '/bank-txn', icon: 'bankTxn', roles: ['md', 'accountant'] },
    { label: 'Bank Balances', href: '/banks', icon: 'banks', roles: ['md', 'accountant'] },
  ],
  STOCK: [
    { label: 'Inventory', href: '/inventory', icon: 'inventory', roles: ['md', 'accountant'] },
    { label: 'Product Manager', href: '/product-manager', icon: 'productManager', roles: ['md', 'accountant'] },
  ],
  ACCOUNTING: [
    { label: 'Daily Closing', href: '/daily-close', icon: 'dailyClose', roles: ['md', 'accountant'] },
    { label: 'Audit Trail', href: '/audit', icon: 'audit', roles: ['md', 'accountant', 'auditor'] },
    { label: 'General Ledger', href: '/ledger', icon: 'ledger', roles: ['md', 'accountant', 'auditor'] },
    { label: 'Receivables', href: '/receivables', icon: 'receivables', roles: ['md', 'accountant'] },
    { label: 'Payables', href: '/payables', icon: 'payables', roles: ['md', 'accountant'] },
    { label: 'Supplier Balances', href: '/supplier-balances', icon: 'supplierBalances', roles: ['md', 'accountant'] },
    { label: 'Prepayments', href: '/prepayments', icon: 'prepayments', roles: ['md', 'accountant'] },
    { label: 'Supplier Rebates', href: '/supplier-rebates', icon: 'supplierRebates', roles: ['md', 'accountant'] },
    { label: 'Loans', href: '/loans', icon: 'loans', roles: ['md', 'accountant'] },
  ],
  TAX: [
    { label: 'Tax Calculator', href: '/tax', icon: 'tax', roles: ['md', 'accountant'] },
  ],
  REPORTS: [
    { label: 'Monthly Report', href: '/monthly-report', icon: 'monthlyReport', roles: ['md', 'accountant', 'auditor'] },
    { label: 'Annual Report', href: '/annual-report', icon: 'annualReport', roles: ['md', 'accountant', 'auditor'] },
    { label: 'Asset Schedule', href: '/asset-schedule', icon: 'assetSchedule', roles: ['md', 'accountant', 'auditor'] },
  ],
  DIRECTORY: [
    { label: 'Customers', href: '/customers', icon: 'customers', roles: ['md', 'accountant'] },
    { label: 'Suppliers', href: '/suppliers', icon: 'suppliers', roles: ['md', 'accountant'] },
  ],
  'HUMAN RESOURCES': [
    { label: 'Staff Management', href: '/staff-management', icon: 'settings', roles: ['md'] },
  ],
  'AUDIT & ADMIN': [
    { label: 'Backup & Recovery', href: '/backup', icon: 'settings', roles: ['md'] },
    { label: 'Change Password', href: '/change-password', icon: 'changePassword', roles: ['md'] },
    { label: 'User Guide', href: '/user-guide', icon: 'userGuide', roles: ['md', 'accountant', 'cashier', 'auditor'] },
    { label: 'Subscription & Licensing', href: '/subscription-and-licensing', icon: 'subscription', roles: ['md', 'accountant', 'cashier', 'auditor'] },
    { label: 'Settings', href: '/settings', icon: 'settings', roles: ['md'] },
  ],
}

const renderIcon = (icon: string) => (
  <span className="nav-icon">{ICONS[icon] || ICONS['settings']}</span>
)

export default function Navigation({ userRole, isOpen, onNavigate }: { userRole: string; isOpen: boolean; onNavigate?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAccounting()
  const [staffMenuOpen, setStaffMenuOpen] = useState(false)

  const isActive = (href: string) => pathname.startsWith(href) || (href === '/staff-management' && pathname.startsWith('/payroll'))
  const isStaffMenuOpen = staffMenuOpen || pathname.startsWith('/staff-management') || pathname.startsWith('/payroll')

  const visibleItems = getVisibleNavigationItems(user)
    .filter((item) => item.href === '/subscription-and-licensing' || planCanAccessRoute(user?.subscriptionPlan, item.href, user?.subscriptionStatus) || hasExplicitMenuGrant(user, item.permission) || (item.permission === 'ledger' && hasExplicitMenuGrant(user, 'accounting')))
    .map((item) => ({
      ...item,
      href: item.href,
      icon: item.icon || 'settings',
      roles: [userRole],
    }))

  return (
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-brand-wrap">
          <img src="/quantixa.png" alt="QUANTIXA logo" className="sidebar-logo-image" />
          <div>
            <div className="sidebar-logo">QUANTIXA</div>
            <div className="sidebar-tagline">AI Intelligence ERP</div>
          </div>
        </div>
      </div>

      <div className="sidebar-body">
        {Object.entries(NAV_GROUPS).map(([groupName, items]) => {
          const groupItems = visibleItems.filter((item) => item.group === groupName)
          if (groupItems.length === 0) return null

          return (
            <div key={groupName}>
              <div className="nav-group-label">{groupName}</div>
              {groupItems.map((item) => (
                <div key={item.href}>
                  <div
                    className={`nav-item ${isActive(item.href) ? 'active' : ''}`}
                    onClick={() => {
                      if (!canAccessRoute(user, item.href)) {
                        triggerAppToast('Access', 'You may not have permission for this section; navigating anyway.')
                      }
                      router.push(item.href)
                      if (item.href === '/staff-management') setStaffMenuOpen(true)
                      onNavigate?.()
                    }}
                  >
                    {renderIcon(item.icon)}
                    <span>{item.label}</span>
                  </div>
                  {item.href === '/staff-management' && isStaffMenuOpen && (
                    <div
                      className={`nav-subitem ${pathname.startsWith('/payroll') ? 'active' : ''}`}
                      onClick={() => {
                        router.push('/payroll')
                        onNavigate?.()
                      }}
                    >
                      <span>Payroll Management</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
