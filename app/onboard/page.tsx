'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccounting } from '@/lib/context'
import { savedMenuAccess } from '@/lib/rbac'
import { ONBOARDING_COMPLETED_KEY } from '@/components/entry-page'
import styles from '@/components/auth/login.module.css'

export default function OnboardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login } = useAccounting()

  const selectedPlan = searchParams.get('plan')
  const isTrial = searchParams.get('mode') === 'trial' || !selectedPlan

  const [companyName, setCompanyName] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(true)

  useEffect(() => {
    if (window.localStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true') {
      router.replace('/login')
      return
    }
    setIsCheckingOnboarding(false)
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Client-side sanity checks (server re-validates)
    if (!/^\d{6}$/.test(pin)) {
      setError('PIN must be exactly 6 digits')
      return
    }
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
      setError('Username must be 3-32 chars: letters, digits, dot, underscore, dash')
      return
    }

    setLoading(true)

    try {
      // 1. Create the account
      const signupResp = await fetch('/api/onboard/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: companyName.trim(),
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          username: username.trim().toLowerCase(),
          pin,
        }),
      })

      const signupData = await signupResp.json().catch(() => ({}))
      if (!signupResp.ok) {
        setError(signupData.error || 'Registration failed')
        return
      }

      window.localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true')

      // 2. Auto-login via the auth-based route (v2)
      const loginResp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          pin,
        }),
      })

      const loginData = await loginResp.json().catch(() => ({}))
      if (!loginResp.ok) {
        // Account was created; just send them to login
        setError(loginData.error || 'Account created. Please sign in.')
        setTimeout(() => router.push('/login'), 1200)
        return
      }

      const raw = loginData.user
      if (!raw) {
        setError('Account created. Please sign in.')
        setTimeout(() => router.push('/login'), 1200)
        return
      }

      // 3. Map server snake_case → app camelCase
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

      login(menuAccess ? { ...databaseUser, ...menuAccess } : databaseUser, true)

      router.push(
        selectedPlan
          ? `/subscription-and-licensing?plan=${encodeURIComponent(selectedPlan)}`
          : '/dashboard'
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  if (isCheckingOnboarding) {
    return <div style={{ minHeight: '100vh', background: '#0b1220' }} aria-hidden="true" />
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.hero}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>
            <img src="/quantixa.png" alt="" />
          </div>
          <span className={styles.brandName}>Quantixa</span>
        </div>

        <div className={styles.heroCopy}>
          <span className={styles.heroEyebrow}>
            {isTrial ? '14-day free trial' : 'Get started'}
          </span>
          <h2 className={styles.heroTitle}>
            {isTrial
              ? 'Set up your workspace in under a minute.'
              : `Set up your workspace for ${selectedPlan?.replace(' Edition', '')}.`}
          </h2>
          <p className={styles.heroSub}>
            {isTrial
              ? 'Create your company, choose an admin account, and explore the full Quantixa workspace for 14 days.'
              : 'Create your company first. You will continue to secure checkout once your workspace exists.'}
          </p>
        </div>

        <div className={styles.heroFooter}>
          <span className={styles.dot} aria-hidden />
          All systems operational
        </div>
      </aside>

      <main className={styles.cardSide}>
        <div className={styles.card}>
          <header className={styles.cardHeader}>
            <div className={styles.cardMark}>
              <img src="/quantixa.png" alt="" />
            </div>
            <div>
              <h1 className={styles.cardTitle}>Create your company</h1>
              <p className={styles.cardSub}>
                Admin details and a 6-digit PIN to secure your account.
              </p>
            </div>
          </header>

          <form onSubmit={handleSubmit} autoComplete="on" noValidate>
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

            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="onboard-company">
                  Company name
                </label>
                <div className={styles.inputWrap}>
                  <input
                    id="onboard-company"
                    className={styles.input}
                    name="organization"
                    autoComplete="organization"
                    autoCorrect="on"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    disabled={loading}
                    required
                    placeholder="e.g. Acme Ltd"
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="onboard-fullname">
                  Admin full name
                </label>
                <div className={styles.inputWrap}>
                  <input
                    id="onboard-fullname"
                    className={styles.input}
                    name="name"
                    autoComplete="name"
                    autoCorrect="on"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={loading}
                    required
                    placeholder="e.g. Ada Test"
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="onboard-email">
                  Admin email
                </label>
                <div className={styles.inputWrap}>
                  <input
                    id="onboard-email"
                    className={styles.input}
                    name="email"
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    required
                    placeholder="you@company.com"
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="onboard-username">
                  Username
                </label>
                <div className={styles.inputWrap}>
                  <input
                    id="onboard-username"
                    className={styles.input}
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={loading}
                    required
                    placeholder="e.g. adatst"
                  />
                </div>
              </div>

              <div className={`${styles.field} ${styles.fullWidth}`}>
                <label className={styles.label} htmlFor="onboard-pin">
                  PIN (6 digits)
                </label>
                <div className={styles.inputWrap}>
                  <input
                    id="onboard-pin"
                    className={styles.input}
                    name="new-password"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    disabled={loading}
                    required
                    maxLength={6}
                    placeholder="6-digit PIN"
                  />
                </div>
              </div>
            </div>

            <div className={styles.row} style={{ marginTop: 16 }}>
              <span className={styles.hint}>
                You can change the PIN later from your profile.
              </span>
              <button
                type="button"
                className={styles.link}
                onClick={() => router.push('/login')}
              >
                Already have an account?
              </button>
            </div>

            <button type="submit" className={styles.submit} disabled={loading}>
              {loading ? (
                <>
                  <span className={styles.spinner} aria-hidden />
                  Creating account…
                </>
              ) : (
                'Create company'
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
            <span>Protected access. Create your company account with verified admin details.</span>
          </div>
        </div>
      </main>
    </div>
  )
}