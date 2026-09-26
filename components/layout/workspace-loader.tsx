'use client'

const phases = {
    session: { title: 'Signing you in', detail: 'Checking your account and company access.' },
    company: { title: 'Loading your company', detail: 'Bringing in sales, stock, banks, and the ledger.' },
    dashboard: { title: 'Preparing your dashboard', detail: 'The figures on the next screen come from those records.' },
} as const

export default function WorkspaceLoader({ phase = 'company' }: { phase?: keyof typeof phases }) {
    const copy = phases[phase]
    return (
        <div className="workspace-loader" role="status" aria-live="polite">
            <div className="workspace-loader-card">
                <div className="workspace-loader-mark" aria-hidden="true"><span /><span /><span /></div>
                <p className="workspace-loader-brand">QUANTIXA</p>
                <h1>{copy.title}</h1>
                <p>{copy.detail}</p>
            </div>
        </div>
    )
}
