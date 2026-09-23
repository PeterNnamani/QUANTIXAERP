'use client'

import { useEffect, useState } from 'react'
import Modal from '@/components/ui/modal'
import type { Prepayment } from '@/lib/context'
import { getCurrentDate, makeID } from '@/lib/utils'

export type PrepaymentModalMode = 'create' | 'adjustment' | 'schedule'

type Props = {
    open: boolean
    mode: PrepaymentModalMode
    selected?: Prepayment | null
    suppliers: string[]
    onClose: () => void
    onSave: (value: Prepayment) => void
}

function uuid() {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : makeID('PREP')
}

function buildSchedule(startDate: string, months: number, amount: number) {
    const monthlyAmount = Math.round((amount / months) * 100) / 100
    return Array.from({ length: months }, (_, index) => {
        const date = new Date(`${startDate}T00:00:00`)
        date.setMonth(date.getMonth() + index)
        return {
            id: uuid(),
            period: date.toISOString().slice(0, 7),
            amount: monthlyAmount,
            recognized: false,
            completed: false,
            recognitionDate: null,
        }
    })
}

export default function PrepaymentModal({ open, mode, selected, suppliers, onClose, onSave }: Props) {
    const [reference, setReference] = useState('')
    const [type, setType] = useState('Prepayment')
    const [category, setCategory] = useState('Supplier Advances')
    const [supplier, setSupplier] = useState('')
    const [amount, setAmount] = useState('')
    const [datePaid, setDatePaid] = useState(getCurrentDate())
    const [endDate, setEndDate] = useState('')
    const [paymentMethod, setPaymentMethod] = useState('Bank Transfer')
    const [referenceNo, setReferenceNo] = useState('')
    const [months, setMonths] = useState('12')
    const [notes, setNotes] = useState('')

    useEffect(() => {
        if (!open) return
        setReference(mode === 'create' ? '' : selected?.reference || '')
        setType(selected?.type || 'Prepayment')
        setCategory(selected?.category || 'Supplier Advances')
        setSupplier(selected?.supplier || suppliers[0] || '')
        setAmount(mode === 'create' ? '' : String(selected?.originalAmount || 0))
        setDatePaid(selected?.datePaid || getCurrentDate())
        setEndDate(selected?.endDate || '')
        setPaymentMethod(selected?.paymentMethod || 'Bank Transfer')
        setReferenceNo(selected?.referenceNo || '')
        setMonths(String(selected?.schedule.length || 12))
        setNotes(selected?.notes || '')
    }, [open, mode, selected, suppliers])

    const title = mode === 'create' ? 'New Prepayment' : mode === 'adjustment' ? 'Record Prepayment Adjustment' : 'Create Recognition Schedule'
    const canSubmit = mode === 'create' ? Boolean(reference.trim()) && Number(amount) > 0 : Boolean(selected)

    const handleSubmit = () => {
        const numericAmount = Number(amount)
        const numericMonths = Math.max(1, Math.floor(Number(months) || 1))
        if (mode === 'create' && (!reference.trim() || numericAmount <= 0)) return
        if (!selected && mode !== 'create') return

        if (mode === 'adjustment') {
            const adjustment = numericAmount
            const remaining = Math.max(0, selected!.remainingAmount + adjustment)
            const usedAmount = Math.max(0, selected!.originalAmount - remaining)
            onSave({
                ...selected!,
                usedAmount,
                remainingAmount: remaining,
                status: remaining === 0 ? 'Fully Used' : selected!.status,
                recognitionStatus: remaining === 0 ? 'Fully Recognized' : selected!.recognitionStatus,
                recognitionProgress: selected!.originalAmount ? Math.min(100, Math.round((usedAmount / selected!.originalAmount) * 100)) : 0,
                notes: notes || selected!.notes,
            })
            return
        }

        const originalAmount = mode === 'create' ? numericAmount : selected!.originalAmount
        const schedule = buildSchedule(datePaid, numericMonths, originalAmount)
        onSave(mode === 'create'
            ? {
                id: uuid(), reference: reference.trim(), type, supplier: supplier.trim() || 'Unknown Supplier', originalAmount,
                usedAmount: 0, remainingAmount: originalAmount, startDate: datePaid, endDate, paymentMethod, bankAccount: '',
                referenceNo, recordedBy: 'Current User', recognitionStatus: 'Not Started', recognitionProgress: 0, status: 'Active', notes,
                datePaid, category, paymentSource: paymentMethod, schedule,
            }
            : { ...selected!, schedule, startDate: selected!.startDate || datePaid, endDate: endDate || selected!.endDate, recognitionStatus: 'Not Started', recognitionProgress: 0 })
    }

    return (
        <Modal open={open} onClose={onClose} title={title} className="prepayment-modal" footer={<div className="prepayment-modal-actions">
            <button type="button" className="prepayment-cancel-button" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit}>{mode === 'create' ? 'Save Prepayment' : mode === 'adjustment' ? 'Post Adjustment' : 'Create Schedule'}</button>
        </div>}>
            {!selected && mode !== 'create' && <div className="prepayment-modal-notice">Select a prepayment from the ledger to continue.</div>}
            <div className="prepayment-form-grid">
                {mode !== 'adjustment' && <label>Reference<input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="PRE-2026-001" disabled={mode === 'schedule'} /></label>}
                {mode === 'create' && <label>Type<input value={type} onChange={(event) => setType(event.target.value)} /></label>}
                {mode === 'create' && <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Supplier Advances</option><option>Rent</option><option>Insurance</option><option>Subscriptions</option><option>Maintenance</option><option>Utilities</option><option>Licenses</option><option>Marketing</option><option>Other</option></select></label>}
                <label>Supplier / Vendor<select value={supplier} onChange={(event) => setSupplier(event.target.value)}><option value="">Select supplier</option>{suppliers.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label>{mode === 'adjustment' ? 'Adjustment Amount (positive adds balance)' : 'Amount'}<input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={mode === 'schedule'} /></label>
                <label>Start / Paid Date<input type="date" value={datePaid} onChange={(event) => setDatePaid(event.target.value)} disabled={mode === 'schedule'} /></label>
                <label>End Date<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
                {mode === 'create' && <label>Payment Method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option>Bank Transfer</option><option>Cash</option><option>Card</option><option>Mobile Money</option></select></label>}
                {mode !== 'adjustment' && <label>Recognition Months<input type="number" min="1" max="120" value={months} onChange={(event) => setMonths(event.target.value)} /></label>}
                {mode === 'create' && <label>Payment Reference<input value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} /></label>}
                <label className="prepayment-notes-field">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} /></label>
            </div>
        </Modal>
    )
}
