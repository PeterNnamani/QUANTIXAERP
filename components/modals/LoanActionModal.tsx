'use client'

import { useMemo, useState } from 'react'
import Modal from '@/components/ui/modal'
import { formatCurrency } from '@/lib/utils'

type LoanActionModalProps = {
    open: boolean
    action: 'settlement' | 'reports'
    loan?: any
    loans: any[]
    bankAccounts: Array<{ id: string; name: string; institution?: string }>
    onClose: () => void
    onSettle: (payment: { amount: number; loanId: string; accountId: string; accountName: string; paymentMethod: string; date: string; note: string }) => void
    onExport: (scope: 'portfolio' | 'selected') => void
}

export default function LoanActionModal({ open, action, loan, loans, bankAccounts, onClose, onSettle, onExport }: LoanActionModalProps) {
    const [amount, setAmount] = useState(Number(loan?.balance || 0))
    const [accountId, setAccountId] = useState(bankAccounts[0]?.id || 'cash-other')
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
    const [scope, setScope] = useState<'portfolio' | 'selected'>('portfolio')
    const outstanding = Number(loan?.balance || 0)
    const selectedAccount = bankAccounts.find((account) => account.id === accountId)
    const summary = useMemo(() => ({
        borrowed: loans.reduce((sum, item) => sum + Number(item.originalAmount ?? item.amount ?? 0), 0),
        outstanding: loans.reduce((sum, item) => sum + Number(item.balance ?? item.amount ?? 0), 0),
        active: loans.filter((item) => item.status === 'Active').length,
    }), [loans])

    if (action === 'reports') {
        return (
            <Modal open={open} onClose={onClose} title="Loan reports" className="workflow-modal" footer={<button type="button" className="btn btn-primary" onClick={() => onExport(scope)}>Export report</button>}>
                <div className="workflow-form">
                    <div className="workflow-intro"><span className="workflow-kicker">Portfolio reporting</span><h3>Choose a report scope</h3><p>Export the current database-backed loan view for review or reconciliation.</p></div>
                    <label className="workflow-field">Report scope<select value={scope} onChange={(event) => setScope(event.target.value as 'portfolio' | 'selected')}><option value="portfolio">Full loan portfolio</option><option value="selected" disabled={!loan}>Selected loan only</option></select></label>
                    <div className="workflow-report-grid"><div><span>Total borrowed</span><strong>{formatCurrency(summary.borrowed)}</strong></div><div><span>Outstanding</span><strong>{formatCurrency(summary.outstanding)}</strong></div><div><span>Active loans</span><strong>{summary.active}</strong></div></div>
                </div>
            </Modal>
        )
    }

    const valid = Boolean(loan && amount > 0 && amount <= outstanding)
    return (
        <Modal open={open} onClose={onClose} title="Early settlement" className="workflow-modal" footer={<>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={!valid} onClick={() => { onSettle({ amount: Number(amount), loanId: loan.id, accountId: accountId === 'cash-other' ? '' : accountId, accountName: selectedAccount ? `${selectedAccount.name}${selectedAccount.institution ? ` (${selectedAccount.institution})` : ''}` : 'Cash / Other', paymentMethod: 'Bank Transfer', date, note: '' }); onClose() }}>Post settlement</button>
        </>}>
            <div className="workflow-form">
                <div className="workflow-intro"><span className="workflow-kicker">Debt settlement</span><h3>{loan ? `${loan.lender} ${loan.type}` : 'No loan selected'}</h3><p>Post a final or partial settlement against the selected loan. The balance is saved to the loan record.</p></div>
                <div className="workflow-summary"><span>Outstanding balance</span><strong>{formatCurrency(outstanding)}</strong></div>
                <label className="workflow-field">Debt being paid<input value={loan ? `${loan.id} · ${loan.lender}` : 'No loan selected'} readOnly /></label>
                <label className="workflow-field">Paid from account<select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="cash-other">Cash / Other account</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.institution ? ` · ${account.institution}` : ''}</option>)}</select></label>
                <label className="workflow-field">Settlement amount<input autoFocus type="number" min="0.01" max={outstanding} step="0.01" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label>
                <label className="workflow-field">Settlement date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
                {amount > outstanding && <p className="workflow-error">Settlement cannot be greater than the outstanding balance.</p>}
            </div>
        </Modal>
    )
}
