'use client'

import { ArrowRight, BarChart3, Check, CircleDollarSign, Database, LockKeyhole, Menu, Package, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const plans = [
    {
        label: 'Growth',
        name: 'Growth Edition',
        price: '₦450,000',
        support: '₦15,000/month',
        description: 'A focused ERP foundation for small businesses ready to bring sales, stock, and finances into one place.',
        features: ['Sales & Purchasing', 'Inventory Management', 'Accounting', '1 user'],
    },
    {
        label: 'Professional',
        name: 'Professional Edition',
        price: '₦650,000',
        support: '₦25,000/month',
        description: 'More control for growing teams managing multiple locations, deeper inventory, and structured approvals.',
        features: ['Everything in Growth', 'Multi-location', 'Approval Workflows', 'Up to 5 users'],
        popular: true,
    },
    {
        label: 'Enterprise',
        name: 'Enterprise Edition',
        price: '₦900,000',
        support: '₦60,000/month',
        description: 'A full-scale platform for larger organisations that need connected teams, stronger controls, and custom insight.',
        features: ['Everything in Professional', 'Unlimited users', 'Advanced Security', 'Custom Reports'],
    },
]

const capabilities = [
    { icon: BarChart3, title: 'Know your numbers', copy: 'See cash, sales, expenses, and performance in one clear workspace.' },
    { icon: Package, title: 'Run operations', copy: 'Connect purchasing, stock, suppliers, and customers without spreadsheet drift.' },
    { icon: ShieldCheck, title: 'Stay in control', copy: 'Use permissions, audit trails, and reliable records to protect every decision.' },
]

export default function LandingPage() {
    const router = useRouter()
    const [menuOpen, setMenuOpen] = useState(false)

    const goToOnboarding = (plan?: string) => {
        const query = plan ? `?plan=${encodeURIComponent(plan)}` : '?mode=trial'
        router.push(`/onboard${query}`)
    }

    return (
        <main className="landing-page">
            <nav className="landing-nav" aria-label="Main navigation">
                <button type="button" className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                    <span className="landing-brand-mark"><img src="/quantixa.png" alt="" /></span>
                    <span className="landing-brand-wordmark">Quantixa</span>
                </button>
                <div className={`landing-nav-links ${menuOpen ? 'is-open' : ''}`}>
                    <a href="#why-quantixa" onClick={() => setMenuOpen(false)}>Why Quantixa</a>
                    <a href="#plans" onClick={() => setMenuOpen(false)}>Plans</a>
                    <button type="button" className="landing-nav-login" onClick={() => router.push('/login')}>Sign in</button>
                    <button type="button" className="landing-nav-cta" onClick={() => goToOnboarding()}>Start free trial <ArrowRight size={16} /></button>
                </div>
                <button type="button" className="landing-menu-button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Close menu' : 'Open menu'}>
                    {menuOpen ? <X size={22} /> : <Menu size={22} />}
                </button>
            </nav>

            <section className="landing-hero">
                <div className="landing-hero-copy">
                    <div className="landing-kicker"><Sparkles size={15} /> Finance, operations, and clarity</div>
                    <h1>Your business, <em>beautifully</em> accounted for.</h1>
                    <p className="landing-hero-lede">QUANTIXA brings the essential work of running a business into one intelligent ERP, so you can make faster decisions with confidence.</p>
                    <div className="landing-hero-actions">
                        <button type="button" className="landing-primary-button" onClick={() => goToOnboarding()}>Start your free trial <ArrowRight size={18} /></button>
                        <button type="button" className="landing-secondary-button" onClick={() => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' })}>Explore plans</button>
                    </div>
                    <div className="landing-trust-line"><LockKeyhole size={14} /> 14-day trial · No card required · Set up in minutes</div>
                </div>
                <div className="landing-hero-visual" aria-label="QUANTIXA workspace preview">
                    <div className="landing-orbit orbit-one" />
                    <div className="landing-orbit orbit-two" />
                    <div className="landing-dashboard-preview">
                        <div className="preview-topline"><span className="preview-dot" /><span>QUANTIXA workspace</span><span className="preview-live">Live</span></div>
                        <div className="preview-heading"><div><span>Good morning</span><strong>Your business at a glance</strong></div><span className="preview-date">This month</span></div>
                        <div className="preview-metrics"><div><span>Cash position</span><strong>₦8.42m</strong><small className="positive">↑ 12.8%</small></div><div><span>Revenue</span><strong>₦14.76m</strong><small className="positive">↑ 8.4%</small></div></div>
                        <div className="preview-chart"><div className="preview-chart-label"><span>Revenue performance</span><strong>₦14.76m</strong></div><div className="preview-bars"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></div>
                        <div className="preview-footer"><span><CircleDollarSign size={15} /> Receivables</span><strong>82% collected</strong><span className="preview-check"><Check size={14} /></span></div>
                    </div>
                </div>
            </section>

            <section className="landing-capabilities" id="why-quantixa">
                <div className="landing-section-intro"><span className="landing-kicker">One connected system</span><h2>Everything important, in one view.</h2></div>
                <div className="landing-capability-grid">{capabilities.map(({ icon: Icon, title, copy }) => <article key={title} className="landing-capability"><span className="landing-capability-icon"><Icon size={21} /></span><h3>{title}</h3><p>{copy}</p></article>)}</div>
            </section>

            <section className="landing-plans" id="plans">
                <div className="landing-section-intro landing-plans-intro"><span className="landing-kicker">Plans that grow with you</span><h2>Start where you are. Scale when you are ready.</h2><p>Every plan includes the tools and support to build a stronger financial foundation.</p></div>
                <div className="landing-plan-grid">{plans.map((plan) => <article key={plan.name} className={`landing-plan ${plan.popular ? 'is-popular' : ''}`}>
                    {plan.popular && <div className="landing-plan-badge">Most popular</div>}
                    <div className="landing-plan-label">{plan.label}</div><h3>{plan.name}</h3><p className="landing-plan-description">{plan.description}</p>
                    <div className="landing-plan-price"><strong>{plan.price}</strong><span>one-time licence</span></div><div className="landing-plan-support">Support & maintenance <strong>{plan.support}</strong></div>
                    <ul>{plan.features.map((feature) => <li key={feature}><Check size={15} />{feature}</li>)}</ul>
                    <button type="button" className={plan.popular ? 'landing-primary-button' : 'landing-outline-button'} onClick={() => goToOnboarding(plan.name)}>Choose {plan.label} <ArrowRight size={16} /></button>
                </article>)}</div>
                <p className="landing-plan-note">Not ready to choose? Start with a full-access free trial and decide after you have seen your workspace.</p>
            </section>

            <section className="landing-final-cta"><div><span className="landing-kicker">A clearer next step</span><h2>Make room for better decisions.</h2><p>Set up your company today and bring your business into focus.</p></div><button type="button" className="landing-primary-button" onClick={() => goToOnboarding()}>Create your workspace <ArrowRight size={18} /></button></section>
            <footer className="landing-footer"><span>© {new Date().getFullYear()} QUANTIXA</span><span>Intelligent ERP for ambitious businesses</span><button type="button" onClick={() => router.push('/login')}>Already have an account? Sign in</button></footer>
        </main>
    )
}
