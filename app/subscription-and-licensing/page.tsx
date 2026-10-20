'use client'

import AppLayout from '@/components/layout/app-layout'
import { useEffect, useRef, useState } from 'react'
import { useAccounting } from '@/lib/context'
import { normalizePlanName, plansMatch } from '@/lib/licensing'

declare global {
    interface Window {
        PaystackPop?: new () => {
            resumeTransaction: (accessCode: string, options: {
                onSuccess: (transaction?: { reference?: string }) => Promise<void>
                onCancel: () => void
                onError: (error: unknown) => void
                onLoad?: () => void
            }) => void
        }
    }
}

const PENDING_PAYMENT_KEY = 'quantixa.pendingPaystackPayment'
const VERIFY_POLL_MS = 4000
const VERIFY_MAX_MS = 55 * 60 * 1000

type PendingPayment = {
    reference: string
    planName?: string
    companyId: string
    startedAt: number
}

function readPendingPayment(): PendingPayment | null {
    try {
        const raw = sessionStorage.getItem(PENDING_PAYMENT_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as PendingPayment
        if (!parsed?.reference || !parsed?.companyId) return null
        return parsed
    } catch {
        return null
    }
}

function writePendingPayment(payment: PendingPayment) {
    sessionStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(payment))
}

function clearPendingPayment() {
    sessionStorage.removeItem(PENDING_PAYMENT_KEY)
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
        const fail = () => {
            paystackLoadPromise = null
            reject(new Error('Unable to load the Paystack payment window.'))
        }
        const finish = () => {
            if (window.PaystackPop) resolve()
            else fail()
        }
        const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${paystackScript}"]`)
        if (existingScript) {
            if (existingScript.dataset.loaded === 'true') {
                finish()
                return
            }
            existingScript.addEventListener('load', () => { existingScript.dataset.loaded = 'true'; finish() }, { once: true })
            existingScript.addEventListener('error', fail, { once: true })
            return
        }

        const script = document.createElement('script')
        script.src = paystackScript
        script.async = true
        script.onload = () => { script.dataset.loaded = 'true'; finish() }
        script.onerror = fail
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
    const { user, activateSubscription, setPaymentInProgress } = useAccounting()
    const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
    const [activeSubscription, setActiveSubscription] = useState<ActiveSubscription | null>(null)
    const [intendedPlan, setIntendedPlan] = useState<string | null>(null)
    const [message, setMessage] = useState('')
    const watchGeneration = useRef(0)

    useEffect(() => {
        void loadPaystack().catch(() => setMessage('Unable to load the Paystack payment window.'))
        setIntendedPlan(normalizePlanName(new URLSearchParams(window.location.search).get('plan')))
    }, [])

    const applyConfirmedSubscription = (verification: { subscription: { plan_name?: string; status: string; starts_at: string } }, planName?: string) => {
        const confirmedPlan = normalizePlanName(verification.subscription.plan_name) || normalizePlanName(planName) || planName as 'Growth Edition' | 'Professional Edition' | 'Enterprise Edition'
        setActiveSubscription({
            planName: confirmedPlan,
            status: verification.subscription.status,
            startsAt: verification.subscription.starts_at,
            nextPaymentDate: getNextPaymentDate(verification.subscription.starts_at).toISOString(),
        })
        activateSubscription({ subscriptionPlan: confirmedPlan, subscriptionStatus: 'active' })
        setMessage(`${confirmedPlan} is active. Its features are open in the menu now.`)
        const params = new URLSearchParams(window.location.search)
        params.delete('reference')
        params.delete('trxref')
        const nextQuery = params.toString()
        window.history.replaceState(null, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`)
    }

    const watchPayment = async (reference: string, planName?: string, options?: { fromCancel?: boolean }) => {
        if (!user?.companyId || !reference) return
        const generation = ++watchGeneration.current
        const existing = readPendingPayment()
        const startedAt = existing?.reference === reference ? existing.startedAt : Date.now()
        writePendingPayment({ reference, planName, companyId: user.companyId, startedAt })
        setPaymentInProgress(true)
        setLoadingPlan((current) => planName || current)
        setMessage(options?.fromCancel
            ? 'Payment window closed. Still waiting for Paystack to confirm the bank transfer — do not start a new payment yet.'
            : 'Confirming the payment with Paystack. Keep this page open while the bank transfer settles.')

        try {
            while (watchGeneration.current === generation) {
                const verifyResponse = await fetch('/api/payments/paystack/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reference, companyId: user.companyId, planName }),
                })
                const verification = await verifyResponse.json()
                if (watchGeneration.current !== generation) return

                if (verifyResponse.ok && verification.subscription) {
                    clearPendingPayment()
                    applyConfirmedSubscription(verification, planName)
                    return
                }

                if (verifyResponse.status === 202 || verification.pending) {
                    if (Date.now() - startedAt > VERIFY_MAX_MS) {
                        throw new Error('Paystack is still waiting for the bank transfer. Start a new payment if the previous checkout expired.')
                    }
                    setMessage('Waiting for Paystack to confirm the bank transfer. Keep this page open and pay the exact amount.')
                    await new Promise((resolve) => window.setTimeout(resolve, VERIFY_POLL_MS))
                    continue
                }

                throw new Error(verification.error || 'Payment verification failed.')
            }
        } catch (error) {
            if (watchGeneration.current !== generation) return
            clearPendingPayment()
            setMessage(error instanceof Error ? error.message : 'Payment verification failed.')
        } finally {
            if (watchGeneration.current === generation) {
                setLoadingPlan(null)
                setPaymentInProgress(false)
            }
        }
    }

    useEffect(() => {
        if (user?.subscriptionStatus !== 'active') return
        const planName = normalizePlanName(user.subscriptionPlan)
        if (!planName) return
        setActiveSubscription((current) => {
            if (current?.status === 'active' && plansMatch(current.planName, planName)) return { ...current, planName }
            return {
                planName,
                status: 'active',
                startsAt: current?.startsAt || new Date().toISOString(),
                nextPaymentDate: current?.nextPaymentDate || getNextPaymentDate(new Date().toISOString()).toISOString(),
            }
        })
    }, [user?.subscriptionPlan, user?.subscriptionStatus])

    useEffect(() => {
        if (!user?.companyId) return
        void fetch(`/api/payments/paystack/subscription?companyId=${encodeURIComponent(user.companyId)}`)
            .then(async (response) => {
                const result = await response.json()
                if (!response.ok) throw new Error(result.error || 'Unable to load subscription.')
                const planName = normalizePlanName(result.subscription?.plan_name)
                if (!planName || result.subscription.status !== 'active') return
                setActiveSubscription({
                    planName,
                    status: result.subscription.status,
                    startsAt: result.subscription.starts_at,
                    nextPaymentDate: getNextPaymentDate(result.subscription.starts_at).toISOString(),
                })
            })
            .catch(() => undefined)

        const callbackReference = new URLSearchParams(window.location.search).get('reference') || new URLSearchParams(window.location.search).get('trxref')
        const pending = readPendingPayment()
        if (callbackReference) {
            const planName = pending?.reference === callbackReference ? pending.planName : undefined
            void watchPayment(callbackReference, planName)
            return
        }
        if (pending && pending.companyId === user.companyId && Date.now() - pending.startedAt < VERIFY_MAX_MS) {
            void watchPayment(pending.reference, pending.planName)
        }
    }, [user?.companyId])

    const purchasePlan = async (plan: PlanCard) => {
        if (!user?.companyId) return setMessage('Your company profile is not available. Please sign in again.')
        watchGeneration.current += 1
        clearPendingPayment()
        setLoadingPlan(plan.name)
        setMessage('')
        try {
            const response = await fetch('/api/payments/paystack/initialize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planName: plan.name, companyId: user.companyId, email: user.email, staffId: user.staffId, username: user.username }),
            })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error || 'Unable to start payment.')
            await loadPaystack()
            if (!window.PaystackPop) throw new Error('Paystack payment window is unavailable.')
            if (!result.accessCode || !result.reference) throw new Error('Paystack did not return a payment access code.')

            writePendingPayment({ reference: result.reference, planName: plan.name, companyId: user.companyId, startedAt: Date.now() })
            setPaymentInProgress(true)
            setMessage('Pay the exact amount by bank transfer in the Paystack window. You can close that window after sending the transfer — this page will keep waiting for confirmation.')
            const paystack = new window.PaystackPop()
            paystack.resumeTransaction(result.accessCode, {
                onCancel: () => {
                    void watchPayment(result.reference, plan.name, { fromCancel: true })
                },
                onError: (error) => {
                    void watchPayment(result.reference, plan.name)
                    setMessage(error instanceof Error ? error.message : 'Payment window error. Still checking whether Paystack received the transfer.')
                },
                onSuccess: async (transaction) => {
                    const reference = transaction?.reference || result.reference
                    if (!reference) {
                        setPaymentInProgress(false)
                        setLoadingPlan(null)
                        clearPendingPayment()
                        setMessage('Paystack did not return a payment reference.')
                        return
                    }
                    await watchPayment(reference, plan.name)
                },
            })
        } catch (error) {
            setPaymentInProgress(false)
            setLoadingPlan(null)
            clearPendingPayment()
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
                        <div className="pricing-note">Pay the exact amount by bank transfer and keep this page open until Paystack confirms. These licence amounts are usually too large for cards. After you send the transfer, this page keeps checking even if the Paystack window is closed.</div>
                    </div>
                </div>

                {message && <div className="pricing-note" role="status" style={{ marginBottom: '18px' }}>{message}</div>}

                {activeSubscription?.status === 'active' && (
                    <div className="pricing-note" role="status" style={{ marginBottom: '18px' }}>
                        Your active licence is {activeSubscription.planName}. Only this edition is marked Active.
                    </div>
                )}

                {user?.subscriptionStatus === 'trial' && user.trialEndsAt && !activeSubscription && (
                    <div className="pricing-note" role="status" style={{ marginBottom: '18px' }}>
                        Full access trial active until {new Date(user.trialEndsAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}. Choose a plan before the trial ends to keep access.
                    </div>
                )}

                <div className="pricing-card-grid">
                    {plans.map((plan) => {
                        const isActivePlan = Boolean(activeSubscription && activeSubscription.status === 'active' && plansMatch(activeSubscription.planName, plan.name))
                        const isChosenPlan = !isActivePlan && plansMatch(intendedPlan, plan.name)
                        return (
                        <div key={plan.name} className={`${plan.highlight && !activeSubscription && !intendedPlan ? 'pricing-card highlight' : 'pricing-card'}${isActivePlan || isChosenPlan ? ' active-plan' : ''}`}>
                            <div className="plan-preface">
                                <span className="plan-label">{plan.label}</span>
                                {isActivePlan ? <span className="plan-badge">Your plan</span> : isChosenPlan ? <span className="plan-badge">Selected</span> : plan.highlight && !activeSubscription && !intendedPlan ? <span className="plan-badge">Most popular</span> : null}
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
                            {isActivePlan && (
                                <div className="plan-billing-summary">
                                    <span className="plan-active-status"><span className="plan-active-dot" />Active</span>
                                    <span>Next payment: {new Date(activeSubscription!.nextPaymentDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                    <strong>{formatAmount(plan.supportFee)} / month</strong>
                                </div>
                            )}
                            <button type="button" className={isActivePlan ? 'btn plan-button active-plan-button allow-readonly' : 'btn btn-primary plan-button allow-readonly'} onClick={() => purchasePlan(plan)} disabled={loadingPlan !== null || isActivePlan}>
                                {loadingPlan === plan.name ? 'Opening payment...' : isActivePlan ? <><span className="plan-active-dot" />Active</> : isChosenPlan ? 'Purchase selected plan' : 'Purchase'}
                            </button>
                        </div>
                    )})}
                </div>
            </div>
        </AppLayout>
    )
}
