'use client'

import { useState } from 'react'
import AppLayout from '@/components/layout/app-layout'

const requirements = [
    { label: '8+ characters', ok: (value: string) => value.length >= 8 },
    { label: 'Uppercase', ok: (value: string) => /[A-Z]/.test(value) },
    { label: 'Lowercase', ok: (value: string) => /[a-z]/.test(value) },
    { label: 'Number', ok: (value: string) => /\d/.test(value) },
    { label: 'Special character', ok: (value: string) => /[^A-Za-z0-9]/.test(value) },
]

export default function ChangePasswordPage() {
    const [oldPassword, setOldPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')

    const score = requirements.reduce((total, rule) => total + (rule.ok(newPassword) ? 1 : 0), 0)
    const strengthLabel = score <= 2 ? 'Weak' : score <= 4 ? 'Good' : 'Strong'
    const strengthPercent = `${Math.round((score / requirements.length) * 100)}%`

    const handleSave = () => {
        alert('Password change feature is ready for the next secure release.')
    }

    return (
        <AppLayout>
            <div className="page-shell">
                <div className="page-hero compact">
                    <div>
                        <div className="eyebrow">Security</div>
                        <h1 className="page-title">Change Password</h1>
                        <p className="page-subtitle">Keep your account protected with a modern, resilient password routine.</p>
                    </div>
                </div>

                <div className="content-grid">
                    <div className="panel-card">
                        <div className="security-score">
                            <div className="score-ring" style={{ background: `conic-gradient(#2563eb ${strengthPercent}, #e5e7eb 0)` }}>
                                <div className="score-ring-inner">{strengthPercent}</div>
                            </div>
                            <div>
                                <div className="panel-title">Security score</div>
                                <div className="panel-subtitle">{strengthLabel} password posture</div>
                            </div>
                        </div>

                        <div className="form-stack">
                            <div className="fg">
                                <label>Current Password</label>
                                <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
                            </div>
                            <div className="fg">
                                <label>New Password</label>
                                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                            </div>
                            <div className="fg">
                                <label>Confirm Password</label>
                                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                            </div>
                            <button className="action-btn primary" onClick={handleSave}>Save Password</button>
                        </div>
                    </div>

                    <div className="side-panel">
                        <div className="profile-card">
                            <div className="panel-title">Password strength</div>
                            <div className="strength-meter">
                                <div className="strength-label">{strengthLabel}</div>
                                <div className="meter-bar"><span style={{ width: strengthPercent }} /></div>
                            </div>
                            <div className="requirement-list">
                                {requirements.map((rule) => (
                                    <div className="requirement-row" key={rule.label}>
                                        <span>{rule.ok(newPassword) ? '✓' : '•'}</span>
                                        <span>{rule.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mini-card">
                            <div className="mini-label">Active sessions</div>
                            <div className="mini-value">Windows PC · Current</div>
                            <div className="mini-label">iPhone 13 · Yesterday</div>
                            <div className="mini-label">Chrome · Lagos</div>
                        </div>
                    </div>
                </div>

                <div className="panel-card">
                    <div className="panel-title">Security recommendations</div>
                    <div className="option-grid compact">
                        <div className="option-card">Two-factor authentication</div>
                        <div className="option-card">Passkeys</div>
                        <div className="option-card">Recovery email</div>
                        <div className="option-card">Recovery phone</div>
                    </div>
                </div>
            </div>
        </AppLayout>
    )
}
