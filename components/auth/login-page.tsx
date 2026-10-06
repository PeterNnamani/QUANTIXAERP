'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccounting } from '@/lib/context'
import { savedMenuAccess } from '@/lib/rbac'
import styles from './login.module.css'

export default function LoginPage() {
  const router = useRouter()
  const { login, user } = useAccounting()
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
    if (user) router.replace('/dashboard')
  }, [user, router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    const normalizedUsername = username.trim()
    const normalizedPin = password.trim()

    const saveRememberedUsername = (remember: boolean) => {
      if (remember) localStorage.setItem('hw_remembered_username', username)
      else localStorage.removeItem('hw_remembered_username')
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: normalizedUsername, pin: normalizedPin }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(json.error || 'Invalid username or password')
        return
      }

      const raw = json.user
      if (!raw) {
        setError('Invalid username or password')
        return
      }

      const databaseUser = {
        id: raw.id,
        companyId: raw.company_id,
        name: raw.full_name,
        role: raw.role,
        roleId: raw.role,
        roleName: raw.role_title || raw.role,
        staffId: raw.staff_id,
        username: raw.username,
        branch: raw.branch,
        department: raw.department,
        position: raw.position,
        accessLevels: raw.access_levels,
        status: raw.status,
      }

      const menuAccess =
        databaseUser.accessLevels !== undefined && databaseUser.accessLevels !== null
          ? savedMenuAccess({ accessLevels: databaseUser.accessLevels, role: databaseUser.role })
          : null

      saveRememberedUsername(rememberMe)
      login(menuAccess ? { ...databaseUser, ...menuAccess } : databaseUser, rememberMe)
      router.push('/dashboard')
    } catch (err) {
      const timedOut =
        err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      setError(
        timedOut
          ? 'Sign-in is taking too long. Check the connection and try again.'
          : err instanceof Error
          ? err.message
          : 'Unable to sign in. Try again.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={styles.shell}>
      {/* Left hero */}
      <aside className={styles.hero}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>
            <img src="/quantixa.png" alt="" />
          </div>
          <span className={styles.brandName}>Quantixa</span>
        </div>

        <div className={styles.heroCopy}>
          <span className={styles.heroEyebrow}>Accounting, refined</span>
          <h2 className={styles.heroTitle}>
            Modern account keeping for teams that move fast.
          </h2>
          <p className={styles.heroSub}>
            Manage smarter, grow stronger, and run your finance workflows with
            accurate, efficient accounting tools.
          </p>
        </div>

        <div className={styles.heroFooter}>
          <span className={styles.dot} aria-hidden />
          All systems operational
        </div>
      </aside>

      {/* Right card */}
      <main className={styles.cardSide}>
        <div className={styles.card}>
          <header className={styles.cardHeader}>
            <div className={styles.cardMark}>
              <img src="/quantixa.png" alt="" />
            </div>
            <div>
              <h1 className={styles.cardTitle}>Log in to your account</h1>
              <p className={styles.cardSub}>Sign in with your username or staff ID and PIN.</p>
            </div>
          </header>

          <form onSubmit={handleLogin} autoComplete="on" noValidate>
            {error && (
              <div className={styles.error} role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-username">
                Username or Staff ID
              </label>
              <div className={styles.inputWrap}>
                <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <input
                  id="login-username"
                  className={styles.input}
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="e.g. adatst or STF-33573726-DUH1"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                  autoFocus
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-pin">
                PIN
              </label>
              <div className={styles.inputWrap}>
                <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  strokeLinejoin="round">
                  <rect x="4" y="11" width="16" height="9" rx="2" />
                  <path d="M8 11V7a4 4 0 1 1 8 0v4" />
                </svg>
                <input
                  id="login-pin"
                  className={styles.input}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Enter your 6-digit PIN"
                  value={password}
                  onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className={styles.row}>
              <label className={styles.remember}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Remember me
              </label>
              <a
                href="/onboard"
                className={styles.link}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  window.location.assign('/onboard')
                }}
              >
                Create company
              </a>
            </div>

            <button
              type="submit"
              className={styles.submit}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className={styles.spinner} aria-hidden />
                  Logging in…
                </>
              ) : (
                'Log in'
              )}
            </button>
          </form>

          <div className={styles.notice}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              strokeLinejoin="round">
              <rect x="6" y="10" width="12" height="9" rx="2" />
              <path d="M8 10V7a4 4 0 1 1 8 0v3" />
            </svg>
            <span>Protected access. Sign in with an authorized account only.</span>
          </div>
        </div>
      </main>
    </div>
  )
}