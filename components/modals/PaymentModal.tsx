import React, { useEffect, useState } from 'react'
import Modal from '@/components/ui/modal'

type PaymentModalProps = {
    open: boolean
    onClose: () => void
    onConfirm: (payment: { amount: number; loanId: string; transactionId: string; accountId: string; accountName: string; paymentMethod: string; date: string; note: string }) => void
    loans?: any[]
    bankAccounts?: Array<{ id: string; name: string; institution?: string }>
    selectedLoanId?: string | null
    records?: any[]
    selectedRecordId?: string | null
    recordLabel?: string
    accountLabel?: string
    selectedItem?: any
    defaultAmount?: number
    title?: string
}

export default function PaymentModal({ open, onClose, onConfirm, loans = [], bankAccounts = [], selectedLoanId, records = [], selectedRecordId, recordLabel = 'Transaction being paid', accountLabel = 'Paid from account', selectedItem, defaultAmount = 0, title = 'Record Payment' }: PaymentModalProps) {
    const [amount, setAmount] = useState(String(defaultAmount || ''))
    const [method, setMethod] = useState('Bank Transfer')
    const [loanId, setLoanId] = useState(selectedLoanId || '')
    const [recordId, setRecordId] = useState(selectedRecordId || '')
    const [accountId, setAccountId] = useState(bankAccounts[0]?.id || 'cash-other')
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
    const [note, setNote] = useState('')

    const selectedLoan = loans.find((loan) => loan.id === loanId)
    const selectedRecord = records.find((record) => record.id === recordId) || selectedItem
    const selectedAccount = bankAccounts.find((account) => account.id === accountId)
    const outstanding = Number(selectedLoan?.balance ?? selectedRecord?.balance ?? selectedRecord?.amount ?? 0)
    const valid = Boolean(date && Number(amount) > 0 && (!loans.length || selectedLoan) && accountId && Number(amount) <= outstanding)

    useEffect(() => {
        if (!open) return
        setLoanId(selectedLoanId || loans[0]?.id || '')
        setRecordId(selectedRecordId || records[0]?.id || '')
        setAmount(String(defaultAmount || Number(selectedRecord?.balance ?? selectedItem?.balance ?? selectedItem?.amount ?? selectedLoan?.balance ?? 0)))
        setNote('')
    }, [open, selectedLoanId, selectedRecordId, selectedItem, defaultAmount, loans, records])

    useEffect(() => {
        if (!open || bankAccounts.some((account) => account.id === accountId)) return
        setAccountId(bankAccounts[0]?.id || 'cash-other')
    }, [open, bankAccounts, accountId])

    const handleConfirm = () => {
        if (!valid) return
        onConfirm({
            amount: Number(amount),
            loanId,
            transactionId: loans.length > 0 ? loanId : recordId,
            accountId: accountId === 'cash-other' ? '' : accountId,
            accountName: selectedAccount?.name || 'Cash / Other',
            paymentMethod: method,
            date,
            note: note.trim(),
        })
        onClose()
    }

    return (
        <Modal open={open} onClose={onClose} title={title} className="workflow-modal" footer={<>
            <button type="button" onClick={onClose} className="btn">Cancel</button>
            <button type="button" onClick={handleConfirm} className="btn btn-primary" disabled={!valid}>Post payment</button>
        </>}>
            <div className="workflow-form">
                <div className="workflow-intro"><span className="workflow-kicker">Loan repayment</span><h3>Record a payment</h3><p>Post the repayment to the selected loan. The updated balance is saved to the database-backed loan register.</p></div>
                {loans.length > 0 && <label className="workflow-field">Debt being paid<select value={loanId} onChange={(e) => { setLoanId(e.target.value); const nextLoan = loans.find((loan) => loan.id === e.target.value); setAmount(String(nextLoan?.balance ?? 0)) }}><option value="">Select a loan</option>{loans.map((loan) => <option key={loan.id} value={loan.id}>{loan.id} · {loan.lender} · Balance {Number(loan.balance ?? loan.amount ?? 0).toLocaleString()}</option>)}</select></label>}
                {loans.length === 0 && records.length > 0 && <label className="workflow-field">{recordLabel}<select value={recordId} onChange={(e) => { setRecordId(e.target.value); const record = records.find((item) => item.id === e.target.value); setAmount(String(record?.balance ?? record?.amount ?? 0)) }}><option value="">Select a transaction</option>{records.map((record) => <option key={record.id} value={record.id}>{record.invoice || record.invoiceNumber || record.id} · {record.customer || record.supplier || record.name || ''} · Balance {Number(record.balance ?? record.amount ?? 0).toLocaleString()}</option>)}</select></label>}
                <label className="workflow-field">{accountLabel}<select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="cash-other">Cash / Other account</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.institution ? ` · ${account.institution}` : ''}</option>)}</select></label>
                <div className="workflow-fields-row">
                    <label className="workflow-field">Amount<input type="number" min="0.01" max={outstanding} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
                    <label className="workflow-field">Payment date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
                </div>
                <label className="workflow-field">Payment method<select value={method} onChange={(e) => setMethod(e.target.value)}>
                    <option>Bank Transfer</option>
                    <option>Cash</option>
                    <option>POS</option>
                    <option>Mobile Money</option>
                </select>
                </label>
                <label className="workflow-field">Payment note / reference<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Invoice or bill being settled" rows={3} /></label>
            </div>
        </Modal>
    )
}
