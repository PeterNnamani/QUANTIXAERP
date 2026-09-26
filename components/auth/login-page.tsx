'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccounting } from '@/lib/context'
import { findStaffMemberByLogin, savedMenuAccess } from '@/lib/rbac'
import { findUserInDatabase, recordUserLogin } from '@/lib/user-db'

const AUTH_KEY = 'hw_auth_user'

// Demo credentials removed; only real database-backed users allowed.

export default function LoginPage() {
  const router = useRouter()
  const { login, user, state } = useAccounting()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const savedUsername = localStorage.getItem('hw_remembered_username')
    if (savedUsername) {
      setUsername(savedUsername)
      setRememberMe(true)
    }
  }, [])

  useEffect(() => {
    if (user) {
      router.replace('/dashboard')
    }
  }, [user, router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    const normalizedUsername = username.trim().toUpperCase()
    const normalizedPin = password.trim()

    const saveRememberedUsername = (remember: boolean) => {
      if (remember) {
        localStorage.setItem('hw_remembered_username', username)
      } else {
        localStorage.removeItem('hw_remembered_username')
      }
    }

    try {
      const matchedStaff = findStaffMemberByLogin(state.staffMembers, normalizedUsername, normalizedPin)
      const databaseUser = await findUserInDatabase(normalizedUsername, normalizedPin, state.roles)

      const localAccess = matchedStaff ? savedMenuAccess({ ...matchedStaff, role: matchedStaff.roleId }) : null
      const databaseAccess = databaseUser && databaseUser.accessLevels !== undefined
          ? savedMenuAccess({ accessLevels: databaseUser.accessLevels, role: databaseUser.role })
          : null
      const menuAccess = localAccess || databaseAccess

      if (databaseUser) {
        void recordUserLogin(databaseUser)
        saveRememberedUsername(rememberMe)
        login(menuAccess ? { ...databaseUser, ...menuAccess } : databaseUser, rememberMe)
        router.push('/dashboard')
      } else if (matchedStaff) {
        saveRememberedUsername(rememberMe)
        login({
          name: matchedStaff.name,
          role: matchedStaff.roleId,
          roleId: matchedStaff.roleId,
          roleName: matchedStaff.roleName,
          staffId: matchedStaff.staffId,
          permissions: menuAccess?.permissions || matchedStaff.permissions,
          visibleMenus: menuAccess?.visibleMenus || matchedStaff.visibleMenus,
          accessLevels: menuAccess?.accessLevels || matchedStaff.accessLevels,
          dataScope: matchedStaff.dataScope,
        }, rememberMe)
        router.push('/dashboard')
      } else {
        setError('Invalid username or password')
      }
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
      setError(timedOut ? 'Sign-in is taking too long. Check the connection and try again.' : error instanceof Error ? error.message : 'Unable to sign in. Try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Onboarding handled on the dedicated /onboard page

  return (
    <div className="auth-hero">
      <div className="hero-left">
        <div className="hero-copy">
          <span className="hero-eyebrow">Quantixa accounting</span>
          <h2>Welcome to fast, modern bookkeeping</h2>
          <p>Manage smarter, grow stronger, and get your finance workflows set up with accurate, efficient accounting tools.</p>
        </div>
      </div>

      <div className="auth-card">
        <div className="panel-header" style={{ alignItems: 'center', gap: 10 }}>
          <div className="login-mark" style={{ width: 72, height: 72, borderRadius: 12 }}>
            <img src="/quantixa.png" alt="Quantixa logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <div className="panel-eyebrow">QUANTIXA</div>
            <h1 className="panel-title">Log In to your account</h1>
            <p className="panel-copy">Sign in with your staff ID and PIN to continue.</p>
          </div>
        </div>

        <form onSubmit={handleLogin} style={{ marginTop: 8 }}>
          {error && (
            <div className="alert a-red" style={{ marginBottom: '12px' }}>
              <span style={{ flex: 1 }}>{error}</span>
            </div>
          )}

          <div className="fg" style={{ marginBottom: '12px' }}>
            <label>Staff ID</label>
            <input
              type="text"
              placeholder="Enter your staff ID or demo username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              autoFocus
            />
          </div>

          <div className="fg" style={{ marginBottom: '14px' }}>
            <label>PIN</label>
            <input
              type="password"
              placeholder="Enter your 4-digit PIN"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <label className="remember-label">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span style={{ marginLeft: 8 }}>Remember me</span>
            </label>
            <button type="button" className="link" onClick={() => router.push('/onboard')}>Create company</button>
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginBottom: '6px' }}
            disabled={isLoading}
          >
            {isLoading ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        <div className="alert a-blue login-protect-note" style={{ marginTop: 14 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px', flexShrink: 0 }}>
            <rect x="6" y="10" width="12" height="9" rx="2" />
            <path d="M8 10V7a4 4 0 1 1 8 0v3" />
          </svg>
          <span>Protected access only. Please sign in with your authorized account.</span>
        </div>
      </div>
    </div>
  )
}
