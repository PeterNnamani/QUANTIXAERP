'use client'

import AppLayout from '@/components/layout/app-layout'
import { useEffect, useState } from 'react'
import { useAccounting } from '@/lib/context'

declare global {
    interface Window {
        PaystackPop?: new () => {
            resumeTransaction: (accessCode: string, options: { onSuccess: () => Promise<void>; onCancel: () => void; onError: (error: unknown) => void }) => void
        }
    }
}

type FeatureSection = {
    title: string
    items: string[]
}

type PlanCard = {
    name: string
    label: string
    price: string
    description: string
    idealFor: string[]
    sections: FeatureSection[]
    supportFee: string
    highlight?: boolean
}

type ActiveSubscription = {
    planName: string
    status: string
    startsAt: string
    nextPaymentDate: string
}

function getNextPaymentDate(startsAt: string) {
    const nextDate = new Date(startsAt)
    const now = new Date()
    while (nextDate <= now) nextDate.setMonth(nextDate.getMonth() + 1)
    return nextDate
}

function formatAmount(value: string) {
    return `₦${Number(value.replace(/[^0-9.]/g, '')).toLocaleString('en-NG')}`
}

const paystackScript = 'https://js.paystack.co/v2/inline.js'
let paystackLoadPromise: Promise<void> | null = null

function loadPaystack(): Promise<void> {
    if (typeof window !== 'undefined' && window.PaystackPop) return Promise.resolve()
    if (paystackLoadPromise) return paystackLoadPromise

    paystackLoadPromise = new Promise((resolve, reject) => {
        const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${paystackScript}"]`)
        if (existingScript) {
            existingScript.addEventListener('load', () => resolve(), { once: true })
            existingScript.addEventListener('error', () => reject(new Error('Unable to load the Paystack payment window.')), { once: true })
            return
        }

        const script = document.createElement('script')
        script.src = paystackScript
        script.async = true
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('Unable to load the Paystack payment window.'))
        document.body.appendChild(script)
    })

    return paystackLoadPromise
}

const plans: PlanCard[] = [
    {
        name: 'Growth Edition',
        label: 'Growth',
        price: '₦450,000',
        description: 'A focused ERP foundation for small businesses ready to bring sales, stock, and finances into one place.',
        idealFor: ['Small businesses'],
        supportFee: '₦15,000',
        sections: [
            {
                title: 'Included',
                items: [
                    'Sales & Purchasing',
                    'Inventory Management',
                    'Accounting',
                    'Customer & Supplier Management',
                    'Reports & Dashboard',
                    'Role-Based Access',
                    '1 User',
                ],
            },
        ],
    },
    {
        name: 'Professional Edition',
        label: 'Professional',
        price: '₦650,000',
        description: 'More control for growing teams managing multiple locations, deeper inventory, and structured approvals.',
        idealFor: ['Growing businesses'],
        supportFee: '₦25,000',
        sections: [
            {
                title: 'Everything in Growth, plus',
                items: ['Multi-location', 'Advanced Inventory', 'Approval Workflows', 'Advanced Reporting', 'Up to 5 Users'],
            },
        ],
        highlight: true,
    },
    {
        name: 'Enterprise Edition',
        label: 'Enterprise',
        price: '₦900,000',
        description: 'A full-scale platform for larger organisations that need connected teams, stronger controls, and custom insight.',
        idealFor: ['Larger organisations'],
        supportFee: '₦60,000',
        sections: [
            {
                title: 'Everything in Professional, plus',
                items: ['Unlimited Users', 'Advanced Accounting', 'CRM', 'HR', 'Advanced Security', 'Business Intelligence', 'Custom Reports'],
            },
        ],
    },
]

export default function SubscriptionAndLicensingPage() {
    const { user } = useAccounting()
    const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
    const [activeSubscription, setActiveSubscription] = useState<ActiveSubscription | null>(null)
    const [message, setMessage] = useState('')

    useEffect(() => {
        void loadPaystack().catch(() => setMessage('Unable to load the Paystack payment window.'))
    }, [])

    useEffect(() => {
        if (!user?.companyId) return
        void fetch(`/api/payments/paystack/subscription?companyId=${encodeURIComponent(user.companyId)}`)
            .then(async (response) => {
                const result = await response.json()
                if (!response.ok) throw new Error(result.error || 'Unable to load subscription.')
                if (!result.subscription || result.subscription.status !== 'active') return
                setActiveSubscription({
                    planName: result.subscription.plan_name,
                    status: result.subscription.status,
                    startsAt: result.subscription.starts_at,
                    nextPaymentDate: getNextPaymentDate(result.subscription.starts_at).toISOString(),
                })
            })
            .catch(() => setActiveSubscription(null))
    }, [user?.companyId])

    const purchasePlan = async (plan: PlanCard) => {
        if (!user?.companyId) return setMessage('Your company profile is not available. Please sign in again.')
        if (!user.email || !user.email.includes('@')) return setMessage('Add a valid email address to your staff profile before purchasing a subscription.')
        setLoadingPlan(plan.name)
        setMessage('')
        try {
            const email = user.email
            const response = await fetch('/api/payments/paystack/initialize', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planName: plan.name, companyId: user.companyId, email }),
            })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error || 'Unable to start payment.')
            await loadPaystack()
            if (!window.PaystackPop) throw new Error('Paystack payment window is unavailable.')
            if (!result.accessCode) throw new Error('Paystack did not return a payment access code.')

            const paystack = new window.PaystackPop()
            paystack.resumeTransaction(result.accessCode, {
                onCancel: () => { setLoadingPlan(null); setMessage('Payment window closed before completion.') },
                onError: (error) => {
                    setLoadingPlan(null)
                    setMessage(error instanceof Error ? error.message : 'Unable to open the payment window.')
                },
                onSuccess: async () => {
                    try {
                        const verifyResponse = await fetch('/api/payments/paystack/verify', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference: result.reference, companyId: user.companyId, planName: plan.name }),
                        })
                        const verification = await verifyResponse.json()
                        if (!verifyResponse.ok) throw new Error(verification.error || 'Payment verification failed.')
                        setActiveSubscription({
                            planName: verification.subscription.plan_name,
                            status: verification.subscription.status,
                            startsAt: verification.subscription.starts_at,
                            nextPaymentDate: getNextPaymentDate(verification.subscription.starts_at).toISOString(),
                        })
                        setMessage(`${plan.name} is now active.`)
                    } catch (error) {
                        setMessage(error instanceof Error ? error.message : 'Payment verification failed.')
                    } finally {
                        setLoadingPlan(null)
                    }
                },
            })
        } catch (error) {
            setLoadingPlan(null)
            setMessage(error instanceof Error ? error.message : 'Unable to complete payment.')
        }
    }

    return (
        <AppLayout>
            <div className="pricing-page">
                <div className="pricing-hero">
                    <div>
                        <div className="eyebrow">Subscription & Licensing</div>
                        <h1 className="pricing-title">QUANTIXA licensing structure</h1>
                        <p className="pricing-copy">Choose the edition that matches your business today and your growth plans tomorrow. Every edition is backed by a one-time licence fee and a monthly support and maintenance subscription.</p>
                    </div>
                    <div className="hero-actions">
                        <div className="pricing-note">All plans include support, maintenance, and access to core ERP capabilities.</div>
                    </div>
                </div>

                {message && <div className="pricing-note" role="status" style={{ marginBottom: '18px' }}>{message}</div>}

                {user?.subscriptionStatus === 'trial' && user.trialEndsAt && (
                    <div className="pricing-note" role="status" style={{ marginBottom: '18px' }}>
                        Full access trial active until {new Date(user.trialEndsAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}. Choose a plan before the trial ends to keep access.
                    </div>
                )}

                <div className="pricing-card-grid">
                    {plans.map((plan) => (
                        <div key={plan.name} className={`${plan.highlight ? 'pricing-card highlight' : 'pricing-card'}${activeSubscription?.planName === plan.name && activeSubscription.status === 'active' ? ' active-plan' : ''}`}>
                            <div className="plan-preface">
                                <span className="plan-label">{plan.label}</span>
                                {plan.highlight && <span className="plan-badge">Most popular</span>}
                            </div>
                            <div className="plan-price">
                                <span>{plan.price}</span>
                                <span>One-time licence</span>
                            </div>
                            <div className="plan-maintenance-highlight">
                                <span className="plan-maintenance-label">Support & Maintenance</span>
                                <span className="plan-maintenance-value">{plan.supportFee}/month</span>
                            </div>
                            <p className="plan-description">{plan.description}</p>
                            <div className="plan-ideal">
                                <h3>Ideal for</h3>
                                <p>{plan.idealFor.join(' • ')}</p>
                            </div>
                            <div className="plan-sections">
                                {plan.sections.map((section) => (
                                    <div className="plan-section" key={section.title}>
                                        <h4 className="plan-section-title">{section.title}</h4>
                                        <ul className="plan-features">
                                            {section.items.map((item) => (
                                                <li key={item}>{item}</li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                            {activeSubscription?.planName === plan.name && activeSubscription.status === 'active' && (
                                <div className="plan-billing-summary">
                                    <span className="plan-active-status"><span className="plan-active-dot" />Active</span>
                                    <span>Next payment: {new Date(activeSubscription.nextPaymentDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                    <strong>{formatAmount(plan.supportFee)} / month</strong>
                                </div>
                            )}
                            <button type="button" className={activeSubscription?.planName === plan.name && activeSubscription.status === 'active' ? 'btn plan-button active-plan-button' : 'btn btn-primary plan-button'} onClick={() => purchasePlan(plan)} disabled={loadingPlan !== null || (activeSubscription?.planName === plan.name && activeSubscription.status === 'active')}>
                                {loadingPlan === plan.name ? 'Opening payment...' : activeSubscription?.planName === plan.name && activeSubscription.status === 'active' ? <><span className="plan-active-dot" />Active</> : 'Purchase'}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </AppLayout>
    )
}
