'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calculator, CreditCard } from 'lucide-react'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting } from '@/lib/context'
import { getSupabaseClient } from '@/lib/supabase.browser'
import type { StaffMemberRecord } from '@/lib/rbac'

type PayrollPayment = {
    id: string
    staffId: string
    staffName: string
    bankName: string
    payDate: string
    currency: string
    baseAmount: number
    incentiveAmount: number
    deductions: number
    totalAmount: number
    incentiveType?: string
    reference?: string
}

type BankAccount = { id: string; name: string; balance: number; currency: string }

export default function PayrollPage() {
    const { state, updateState, user } = useAccounting()
    const [staffMembers, setStaffMembers] = useState<StaffMemberRecord[]>(state.staffMembers)
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
    const [payrollPayments, setPayrollPayments] = useState<PayrollPayment[]>([])
    const [paymentStaffId, setPaymentStaffId] = useState('')
    const [paymentBankId, setPaymentBankId] = useState('')
    const [paymentCurrency, setPaymentCurrency] = useState('NGN')
    const [baseAmount, setBaseAmount] = useState('')
    const [incentiveAmount, setIncentiveAmount] = useState('')
    const [deductions, setDeductions] = useState('')
    const [incentiveType, setIncentiveType] = useState('KPI bonus')
    const [kpiScore, setKpiScore] = useState('')
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
    const [paymentReference, setPaymentReference] = useState('')
    const [paymentProcessing, setPaymentProcessing] = useState(false)
    const [inlineNotice, setInlineNotice] = useState<{ message: string; tone: 'error' | 'success' } | null>(null)

    const selectedPaymentStaff = staffMembers.find((member) => member.staffId === paymentStaffId)
    const paymentTotal = Math.max(0, Number(baseAmount || 0) + Number(incentiveAmount || 0) - Number(deductions || 0))
    const formatMoney = (amount: number, currency = paymentCurrency) => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)

    const latestPaymentByStaff = useMemo(() => {
        const payments = new Map<string, PayrollPayment>()
        payrollPayments.forEach((payment) => {
            const current = payments.get(payment.staffId)
            if (!current || payment.payDate > current.payDate) payments.set(payment.staffId, payment)
        })
        return payments
    }, [payrollPayments])

    const getPayrollStatus = (staffId: string) => {
        const latestPayment = latestPaymentByStaff.get(staffId)
        if (!latestPayment) return { label: 'Owing', tone: 'b-red', nextDate: 'No payment recorded' }
        const nextDateValue = new Date(`${latestPayment.payDate}T12:00:00`)
        nextDateValue.setMonth(nextDateValue.getMonth() + 1)
        const nextDate = nextDateValue.toISOString().slice(0, 10)
        const today = new Date().toISOString().slice(0, 10)
        const daysUntilDue = Math.ceil((new Date(`${nextDate}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000)
        if (daysUntilDue < 0) return { label: 'Overdue', tone: 'b-red', nextDate }
        if (daysUntilDue <= 5) return { label: 'Due soon', tone: 'b-yellow', nextDate }
        return { label: 'Paid', tone: 'b-green', nextDate }
    }

    useEffect(() => {
        setStaffMembers(state.staffMembers)
    }, [state.staffMembers])

    useEffect(() => {
        const loadPayrollData = async () => {
            if (!user?.companyId) return
            const supabase = getSupabaseClient()
            if (!supabase) return
            const [{ data: banks }, { data: payments }, { data: staff }] = await Promise.all([
                supabase.from('bank_accounts').select('id,name,balance,currency').eq('company_id', user.companyId).eq('status', 'active').order('name'),
                supabase.from('staff_payments').select('*').eq('company_id', user.companyId).order('pay_date', { ascending: false }).limit(100),
                supabase.from('users').select('id,full_name,username,staff_id,salary,status').eq('company_id', user.companyId).order('created_at', { ascending: false }),
            ])
            const nextBanks = (banks || []).map((bank: any) => ({ id: bank.id, name: bank.name, balance: Number(bank.balance || 0), currency: bank.currency || 'NGN' }))
            const nextStaff = (staff || []).map((member: any) => ({
                id: String(member.id || member.staff_id), name: String(member.full_name || member.username || member.staff_id || 'Staff User'), staffId: String(member.staff_id || ''),
                pin: '', roleId: '', roleName: '', permissions: [], dataScope: 'team', status: member.status === 'disabled' ? 'disabled' : 'active', createdAt: '', salary: member.salary || undefined,
            })) as StaffMemberRecord[]
            setBankAccounts(nextBanks)
            setStaffMembers(nextStaff.length > 0 ? nextStaff : state.staffMembers)
            setPayrollPayments((payments || []).map((payment: any) => ({
                id: payment.id, staffId: payment.staff_id, staffName: nextStaff.find((member) => member.staffId === payment.staff_id)?.name || state.staffMembers.find((member) => member.staffId === payment.staff_id)?.name || 'Staff member',
                bankName: nextBanks.find((bank) => bank.id === payment.bank_account_id)?.name || 'Bank account', payDate: payment.pay_date, currency: payment.currency || 'NGN',
                baseAmount: Number(payment.base_amount || 0), incentiveAmount: Number(payment.incentive_amount || 0), deductions: Number(payment.deductions || 0), totalAmount: Number(payment.total_amount || 0), incentiveType: payment.incentive_type || '', reference: payment.reference || '',
            })))
        }
        loadPayrollData()
    }, [user?.companyId, state.staffMembers])

    useEffect(() => {
        if (paymentStaffId && selectedPaymentStaff?.salary && !baseAmount) setBaseAmount(selectedPaymentStaff.salary.replace(/[^0-9.-]/g, ''))
    }, [paymentStaffId, selectedPaymentStaff, baseAmount])

    const resetPaymentForm = () => {
        setPaymentStaffId(''); setPaymentBankId(''); setPaymentCurrency('NGN'); setBaseAmount(''); setIncentiveAmount(''); setDeductions(''); setIncentiveType('KPI bonus'); setKpiScore(''); setPaymentDate(new Date().toISOString().slice(0, 10)); setPaymentReference('')
    }

    const processStaffPayment = async () => {
        if (!user?.companyId || !paymentStaffId || !paymentBankId || !paymentDate || paymentTotal <= 0) {
            setInlineNotice({ message: 'Select a staff member and bank account, then enter a positive net pay amount.', tone: 'error' })
            return
        }
        setPaymentProcessing(true)
        try {
            const response = await fetch('/api/staff-payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: user.companyId, staffId: paymentStaffId, bankAccountId: paymentBankId, payDate: paymentDate, currency: paymentCurrency, baseAmount, incentiveAmount, deductions, incentiveType, kpiScore, reference: paymentReference }) })
            const result = await response.json()
            if (!response.ok || !result.success) throw new Error(result.error || 'Unable to process payment')
            const payment = result.payment as PayrollPayment
            const bank = bankAccounts.find((account) => account.id === paymentBankId)
            setPayrollPayments((current) => [payment, ...current])
            setBankAccounts((current) => current.map((account) => account.id === paymentBankId ? { ...account, balance: Number(result.bankBalance) } : account))
            updateState({
                banks: { ...state.banks, [bank?.name || payment.bankName]: Number(result.bankBalance) }, bankTxns: [result.bankTransaction, ...state.bankTxns],
                expenses: [{ id: payment.id, date: payment.payDate, desc: `Payroll payment - ${payment.staffName}`, category: 'Salary', amount: payment.totalAmount, bank: payment.bankName, notes: payment.reference || '', status: 'Paid', enteredBy: user.name }, ...state.expenses],
                journalEntries: result.journalEntry ? [result.journalEntry, ...state.journalEntries] : state.journalEntries, journalLines: result.journalLines ? [...result.journalLines, ...state.journalLines] : state.journalLines,
            })
            setInlineNotice({ message: `${formatMoney(payment.totalAmount, payment.currency)} paid to ${payment.staffName}. ${payment.bankName} was updated.`, tone: 'success' })
            resetPaymentForm()
        } catch (error) {
            setInlineNotice({ message: error instanceof Error ? error.message : 'Unable to process payment.', tone: 'error' })
        } finally { setPaymentProcessing(false) }
    }

    return (
        <AppLayout>
            <div className="page-shell">
                <div className="page-hero"><div><div className="eyebrow">Human Resources</div><h1 className="page-title">Payroll Management</h1><p className="page-subtitle">Calculate salaries, incentives, deductions, and payment status in one workspace.</p></div></div>
                {inlineNotice && <div className={`staff-inline-notice ${inlineNotice.tone}`} role="status">{inlineNotice.message}</div>}
                <div className="panel-card" style={{ marginBottom: 20 }}>
                    <div className="panel-head"><div><div className="panel-title"><Calculator size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} /> Payroll & Incentives</div><div className="page-subtitle">Calculate gross pay, KPI rewards, commissions, and deductions in the employee&apos;s operating currency.</div></div><span className="badge b-blue">{payrollPayments.length} payments recorded</span></div>
                    <div className="form-grid two-up">
                        <div className="fg"><label>Staff member</label><select className="allow-readonly" value={paymentStaffId} onChange={(event) => { setPaymentStaffId(event.target.value); setBaseAmount('') }}><option value="">Select staff member</option>{staffMembers.filter((member) => member.status === 'active').map((member) => <option key={member.id} value={member.staffId}>{member.name} · {member.staffId}</option>)}</select></div>
                        <div className="fg"><label>Pay date</label><input className="allow-readonly" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></div>
                        <div className="fg"><label>Paying bank account</label><select className="allow-readonly" value={paymentBankId} onChange={(event) => { const account = bankAccounts.find((item) => item.id === event.target.value); setPaymentBankId(event.target.value); if (account?.currency) setPaymentCurrency(account.currency) }}><option value="">Select bank account</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {formatMoney(account.balance, account.currency)}</option>)}</select></div>
                        <div className="fg"><label>Currency</label><select className="allow-readonly" value={paymentCurrency} onChange={(event) => setPaymentCurrency(event.target.value)}><option value="NGN">NGN · Nigerian naira</option><option value="USD">USD · US dollar</option><option value="GBP">GBP · British pound</option><option value="EUR">EUR · Euro</option></select></div>
                        <div className="fg"><label>Base salary</label><input className="allow-readonly" type="number" min="0" step="0.01" value={baseAmount} onChange={(event) => setBaseAmount(event.target.value)} placeholder={selectedPaymentStaff?.salary || '0.00'} /></div>
                        <div className="fg"><label>Incentive type</label><select className="allow-readonly" value={incentiveType} onChange={(event) => setIncentiveType(event.target.value)}><option>KPI bonus</option><option>Commission</option><option>Performance bonus</option><option>Spot award</option><option>Other incentive</option></select></div>
                        <div className="fg"><label>Incentive amount</label><input className="allow-readonly" type="number" min="0" step="0.01" value={incentiveAmount} onChange={(event) => setIncentiveAmount(event.target.value)} placeholder="0.00" /></div>
                        <div className="fg"><label>Deductions</label><input className="allow-readonly" type="number" min="0" step="0.01" value={deductions} onChange={(event) => setDeductions(event.target.value)} placeholder="0.00" /></div>
                        <div className="fg"><label>KPI score <span className="metric-note">optional, 0-100</span></label><input className="allow-readonly" type="number" min="0" max="100" step="0.01" value={kpiScore} onChange={(event) => setKpiScore(event.target.value)} placeholder="Not assessed" /></div>
                        <div className="fg"><label>Reference</label><input className="allow-readonly" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Payroll run, month, or approval ID" /></div>
                    </div>
                    <div className="inline-actions" style={{ justifyContent: 'space-between', marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)' }}><div><div className="metric-note">Net pay = base pay + incentive - deductions</div><div style={{ fontSize: 22, fontWeight: 800 }}>{formatMoney(paymentTotal)}</div></div><button className="action-btn primary allow-readonly" type="button" onClick={processStaffPayment} disabled={paymentProcessing || bankAccounts.length === 0}>{paymentProcessing ? 'Processing...' : <><CreditCard size={16} /> Pay staff</>}</button></div>
                    {bankAccounts.length === 0 && <div className="metric-note" style={{ marginTop: 12 }}>Add an active bank account in Settings before processing payroll.</div>}
                </div>
                {payrollPayments.length > 0 && <div className="panel-card"><div className="panel-head"><div><div className="panel-title">Recent payroll activity</div><div className="page-subtitle">Every payment is linked to its bank withdrawal, salary expense, and journal entry.</div></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Staff</th><th>Incentive</th><th>Bank</th><th>Net paid</th><th>Next payment</th><th>Status</th></tr></thead><tbody>{payrollPayments.slice(0, 8).map((payment) => { const schedule = getPayrollStatus(payment.staffId); return <tr key={payment.id}><td>{payment.payDate}</td><td><strong>{payment.staffName}</strong><div className="metric-note">{payment.reference || payment.staffId}</div></td><td>{payment.incentiveAmount > 0 ? `${payment.incentiveType || 'Incentive'} · ${formatMoney(payment.incentiveAmount, payment.currency)}` : '—'}</td><td>{payment.bankName}</td><td><strong>{formatMoney(payment.totalAmount, payment.currency)}</strong></td><td>{schedule.nextDate}</td><td><span className={`badge ${schedule.tone}`}>{schedule.label}</span></td></tr> })}</tbody></table></div></div>}
            </div>
        </AppLayout>
    )
}
