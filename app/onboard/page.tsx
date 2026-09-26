'use client'

import React, { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccounting } from '@/lib/context'
import { loginWithCredentials } from '@/lib/user-db'
import { ONBOARDING_COMPLETED_KEY } from '@/components/entry-page'

function OnboardForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { login } = useAccounting()
    const selectedPlan = searchParams.get('plan')
    const isTrial = searchParams.get('mode') === 'trial' || !selectedPlan

    const [companyName, setCompanyName] = useState('')
    const [adminFullName, setAdminFullName] = useState('')
    const [adminEmail, setAdminEmail] = useState('')
    const [username, setUsername] = useState('')
    const [pin, setPin] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        const nextCompanyName = companyName.trim()
        const nextAdminName = adminFullName.trim()
        const nextUsername = username.trim()
        const nextPin = pin.trim()

        if (!nextCompanyName || !nextAdminName || !nextUsername || !nextPin) {
            setError('Company name, admin name, username, and PIN are required.')
            return
        }

        if (nextPin.length < 4 || nextPin.length > 6) {
            setError('PIN must be 4 to 6 characters.')
            return
        }

        setLoading(true)

        try {
            const resp = await fetch('/api/onboard/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyName: nextCompanyName,
                    adminFullName: nextAdminName,
                    adminEmail: adminEmail.trim(),
                    username: nextUsername,
                    pin: nextPin,
                }),
            })
            const data = await resp.json().catch(() => null)
            if (!resp.ok) {
                setError(data?.error || 'Registration failed')
                setLoading(false)
                return
            }

            window.localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true')

            const createdUser = data?.user
            const signedInUser = createdUser || (await loginWithCredentials(nextUsername, nextPin)).user
            if (signedInUser) {
                login(signedInUser, true)
                router.push(selectedPlan ? `/subscription-and-licensing?plan=${encodeURIComponent(selectedPlan)}` : '/dashboard')
                return
            }

            setError(data?.staffId
                ? `Registration complete. Sign in with ${nextUsername} or ${data.staffId}.`
                : 'Registration complete. Please sign in.')
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        }

        setLoading(false)
    }

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
                <div className="panel-header">
                    <div className="login-mark" style={{ width: 72, height: 72, borderRadius: 12 }}>
                        <img src="/quantixa.png" alt="Quantixa logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                    <div>
                        <div className="panel-eyebrow">QUANTIXA</div>
                        <h1 className="panel-title" style={{ margin: 0 }}>{isTrial ? 'Start your free trial' : `Choose ${selectedPlan?.replace(' Edition', '')}`}</h1>
                        <p className="panel-copy" style={{ margin: '0', maxWidth: '100%' }}>{isTrial ? 'Set up your company and explore the full QUANTIXA workspace for 14 days.' : 'Set up your company first. You will continue to secure checkout after your workspace is created.'}</p>
                    </div>
                </div>

                <div style={{ height: 14 }} />
                {error && (
                    <div className="alert a-red" style={{ marginBottom: '12px' }}>{error}</div>
                )}

                <form onSubmit={handleSubmit} autoComplete="off">
                    <div className="auth-form-grid" style={{ marginBottom: '12px' }}>
                        <div className="fg">
                            <label>Company name</label>
                            <input name="companyName" autoComplete="off" value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={loading} required placeholder="Enter company name" />
                        </div>

                        <div className="fg">
                            <label>Admin full name</label>
                            <input name="adminFullName" autoComplete="off" value={adminFullName} onChange={(e) => setAdminFullName(e.target.value)} disabled={loading} required placeholder="Enter admin full name" />
                        </div>

                        <div className="fg">
                            <label>Admin email</label>
                            <input name="adminEmail" autoComplete="off" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} disabled={loading} type="email" placeholder="Enter admin email" />
                        </div>

                        <div className="fg">
                            <label>Username</label>
                            <input name="username" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} disabled={loading} required placeholder="Choose a username" />
                        </div>

                        <div className="fg full-width">
                            <label>PIN (4-digit)</label>
                            <input name="pin" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)} disabled={loading} required maxLength={6} type="password" placeholder="Enter a secure PIN" />
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: '12px' }} disabled={loading}>{loading ? 'Registering...' : 'Create company'}</button>
                </form>

                <div className="alert a-blue login-protect-note">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px', flexShrink: 0 }}>
                        <rect x="6" y="10" width="12" height="9" rx="2" />
                        <path d="M8 10V7a4 4 0 1 1 8 0v3" />
                    </svg>
                    <span>Protected access only. Please create your company account with verified admin details.</span>
                </div>

                <div style={{ marginTop: 12 }}>
                    <button type="button" className="link" onClick={() => router.push('/login')} style={{ padding: 0 }}>Already have an account? Sign in</button>
                </div>
            </div>
        </div>
    )
}

export default function OnboardPage() {
    return (
        <Suspense fallback={<div className="auth-boot" aria-hidden="true" />}>
            <OnboardForm />
        </Suspense>
    )
}
