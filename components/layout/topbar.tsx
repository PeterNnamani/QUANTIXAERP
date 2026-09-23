'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Moon, Sun, User2, ChevronDown } from 'lucide-react'
import { User } from '@/lib/context'
import { getRoleBadgeClass } from '@/lib/utils'
import NotificationBell from './notification-bell'

export default function Topbar({
  user,
  onLogout,
  onToggleSidebar,
  isSidebarOpen,
}: {
  user: User
  onLogout: () => void
  onToggleSidebar?: () => void
  isSidebarOpen?: boolean
}) {
  const roleBadgeClass = getRoleBadgeClass(user.role)
  const [menuOpen, setMenuOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const router = useRouter()

  const roleLabel =
    user.role === 'super-admin'
      ? 'Super Admin'
      : user.role === 'md' || user.role === 'business-owner'
        ? 'Super Admin'
        : user.role === 'accountant'
          ? 'Accountant'
          : user.role === 'cashier' || user.role === 'sales-officer'
            ? 'Sales Officer'
            : user.role === 'purchasing-officer'
              ? 'Purchasing Officer'
              : user.role === 'stock-manager'
                ? 'Stock Manager'
                : user.role === 'hr-officer'
                  ? 'HR Officer'
                  : user.role === 'treasury-officer'
                    ? 'Treasury'
                    : 'Auditor'
  const roleFull =
    user.role === 'super-admin'
      ? 'Super Admin'
      : user.role === 'md' || user.role === 'business-owner'
        ? 'Super Admin'
        : user.role === 'accountant'
          ? 'Accountant'
          : user.role === 'cashier' || user.role === 'sales-officer'
            ? 'Sales Officer'
            : user.role === 'purchasing-officer'
              ? 'Purchasing Officer'
              : user.role === 'stock-manager'
                ? 'Stock Manager'
                : user.role === 'hr-officer'
                  ? 'HR Officer'
                  : user.role === 'treasury-officer'
                    ? 'Treasury Officer'
                    : 'Auditor'

  useEffect(() => {
    const storedTheme = window.localStorage.getItem('hw-theme') as 'light' | 'dark' | null
    const initialTheme = storedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    setTheme(initialTheme)
    document.documentElement.dataset.theme = initialTheme
  }, [])

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus()
    }
  }, [searchOpen])

  const handleSearchDismiss = (event: React.FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as HTMLElement | null
    if (!event.currentTarget.contains(nextTarget) && !searchTerm) {
      setSearchOpen(false)
    }
  }

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(nextTheme)
    document.documentElement.dataset.theme = nextTheme
    window.localStorage.setItem('hw-theme', nextTheme)
  }

  return (
    <div className="topbar">
      <button
        type="button"
        className={`topbar-menu-toggle ${isSidebarOpen ? 'open' : ''}`}
        onClick={onToggleSidebar}
        aria-label={isSidebarOpen ? 'Hide navigation' : 'Show navigation'}
      >
        <span />
        <span />
        <span />
      </button>
      <div className="topbar-brand">
        <div className="topbar-icon">
          <img src="/quantixa.png" alt="QUANTIXA logo" />
        </div>
        <div>
          <div className="topbar-name">QUANTIXA</div>
          <div className="topbar-sub">Intelligent ERP</div>
        </div>
      </div>

      <div className="topbar-right">
        <div className="topbar-search-wrap" onBlur={handleSearchDismiss} role="search" aria-label="Global search">
          {!searchOpen ? (
            <button
              type="button"
              className="topbar-search-trigger"
              onClick={() => setSearchOpen(true)}
              aria-label="Open search"
            >
              <Search size={18} />
            </button>
          ) : (
            <div className="topbar-search active">
              <Search className="search-icon" size={16} />
              <input
                ref={searchInputRef}
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search QUANTIXA"
                aria-label="Search QUANTIXA"
              />
              <button
                type="button"
                className="topbar-search-close"
                onClick={() => {
                  setSearchOpen(false)
                  setSearchTerm('')
                }}
                aria-label="Close search"
              >
                ×
              </button>
            </div>
          )}
          <div className="topbar-sep" aria-hidden="true" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button type="button" className="topbar-theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <NotificationBell user={user} />
          <div className="profile">
            <div className="user-avatar">
              <User2 size={18} />
            </div>

            <button
              className="profile-trigger"
              onClick={() => setMenuOpen((s) => !s)}
              aria-expanded={menuOpen}
              aria-label="Open profile menu"
            >
              <div className="profile-info">
                <span className="profile-name">{user.name}</span>
                <span className="profile-title">{roleFull}</span>
              </div>
              <ChevronDown size={16} />
            </button>

            <div className={`profile-menu ${menuOpen ? 'open' : ''}`} role="menu">
              <button className="profile-item" onClick={() => router.push('/settings')} role="menuitem">Settings</button>
              <button className="profile-item" onClick={() => router.push('/user-guide')} role="menuitem">Help</button>
              <button className="profile-item" onClick={onLogout} role="menuitem">Logout</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
