import React, { useState } from 'react'
import Modal from '@/components/ui/modal'
import { getCurrentDate, makeID } from '@/lib/utils'

export default function AddLoanModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (loan: any) => void }) {
    const [lender, setLender] = useState('GTBank')
    const [amount, setAmount] = useState(0)
    const [term, setTerm] = useState(12)
    const [interestRate, setInterestRate] = useState(0)
    const [type, setType] = useState('Business Loan')
    const [startDate, setStartDate] = useState(getCurrentDate())

    const handleCreate = () => {
        const principal = Math.max(0, Number(amount) || 0)
        const months = Math.max(1, Number(term) || 1)
        const endDate = new Date(`${startDate}T00:00:00`)
        endDate.setMonth(endDate.getMonth() + months)
        const annualRate = Math.max(0, Number(interestRate) || 0) / 100
        const totalInterest = principal * annualRate * months / 12
        const monthlyPrincipal = principal / months
        const monthlyInterest = totalInterest / months
        const paymentSchedule = Array.from({ length: months }, (_, index) => {
            const paymentDate = new Date(`${startDate}T00:00:00`)
            paymentDate.setMonth(paymentDate.getMonth() + index + 1)
            const remainingPrincipal = Math.max(0, principal - monthlyPrincipal * (index + 1))
            return {
                date: paymentDate.toISOString().slice(0, 10), payment: monthlyPrincipal + monthlyInterest,
                principal: monthlyPrincipal, interest: monthlyInterest, balance: remainingPrincipal,
            }
        })
        const loan = {
            id: makeID('LN'), lender: lender.trim() || 'Unknown lender', type, originalAmount: principal, amount: principal,
            balance: principal, term: months, periodMonths: months, interestRate: Math.max(0, Number(interestRate) || 0),
            startDate, endDate: endDate.toISOString().slice(0, 10), status: 'Active', principalPaid: 0,
            interestRemaining: totalInterest, paymentSchedule,
        }
        onCreate(loan)
        onClose()
    }

    return (
        <Modal open={open} onClose={onClose} title="Add new loan" className="workflow-modal" footer={<>
            <button type="button" onClick={onClose} className="btn">Cancel</button>
            <button type="button" onClick={handleCreate} className="btn btn-primary" disabled={!lender.trim() || amount <= 0 || term <= 0 || interestRate < 0}>Create loan</button>
        </>}>
            <div className="workflow-form">
                <div className="workflow-intro"><span className="workflow-kicker">Loan portfolio</span><h3>Capture borrowing terms</h3><p>New loans are saved to the company loan register and appear in the portfolio immediately.</p></div>
                <div className="workflow-fields-row">
                    <label className="workflow-field">Lender<input autoFocus value={lender} onChange={(e) => setLender(e.target.value)} /></label>
                    <label className="workflow-field">Loan type<select value={type} onChange={(e) => setType(e.target.value)}><option>Business Loan</option><option>Bank Loan</option><option>Equipment Finance</option><option>Vehicle Loan</option><option>Investor Loan</option><option>Credit Facility</option><option>Overdraft</option></select></label>
                </div>
                <div className="workflow-fields-row">
                    <label className="workflow-field">Amount<input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></label>
                    <label className="workflow-field">Term (months)<input type="number" min="1" value={term} onChange={(e) => setTerm(Number(e.target.value))} /></label>
                </div>
                <div className="workflow-fields-row">
                    <label className="workflow-field">Interest rate (%)<input type="number" min="0" step="0.01" value={interestRate} onChange={(e) => setInterestRate(Number(e.target.value))} /></label>
                    <label className="workflow-field">Start date<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
                </div>
            </div>
        </Modal>
    )
}
