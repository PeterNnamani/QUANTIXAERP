'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, Check, CircleDollarSign, FileText, Filter, MoreHorizontal, Paperclip, Plus, Search, Trash2, Upload, X } from 'lucide-react'
import AppLayout from '@/components/layout/app-layout'
import BulkImport from '@/components/bulk-import'
import { Expense, useAccounting } from '@/lib/context'
import { canEdit, EXP_CATS as DEFAULT_EXP_CATS, formatCurrency, getCurrentDate, makeID } from '@/lib/utils'
import { canEditPermission } from '@/lib/rbac'
import { getSupabaseClient } from '@/lib/supabase.browser'
import { downloadExcel } from '@/lib/export-utils'

type Tab = 'Expenses' | 'Reimbursements' | 'Recurring' | 'Categories'
type ExpenseStatus = 'Pending Approval' | 'Approved' | 'Scheduled' | 'Paid' | 'Overdue' | 'Rejected'

const statusOptions: Array<'All Statuses' | ExpenseStatus> = ['All Statuses', 'Pending Approval', 'Approved', 'Scheduled', 'Paid', 'Overdue', 'Rejected']
const paymentMethods = ['Bank Transfer', 'Cash', 'Card', 'Cheque', 'Direct Debit', 'Other']
const departments = ['All Departments', 'Operations', 'Finance', 'Sales', 'Marketing', 'People']

function displayStatus(expense: Expense): ExpenseStatus {
    if (expense.status === 'VOID') return 'Rejected'
    if (expense.status === 'ACTIVE') return 'Paid'
    return (statusOptions.includes(expense.status as ExpenseStatus) ? expense.status : 'Pending Approval') as ExpenseStatus
}
function dateLabel(value: string) {
    return new Date(`${value}T00:00:00`).toLocaleDateString('en-NG', { month: 'short', day: '2-digit', year: 'numeric' })
}

export default function ExpensesPage() {
    const { state, updateState, user, addAuditLog } = useAccounting()
    const [activeTab, setActiveTab] = useState<Tab>('Expenses')
    const [showForm, setShowForm] = useState(false)
    const [showFilters, setShowFilters] = useState(false)
    const [search, setSearch] = useState('')
    const [status, setStatus] = useState<'All Statuses' | ExpenseStatus>('All Statuses')
    const [category, setCategory] = useState('All Categories')
    const [department, setDepartment] = useState('All Departments')
    const [period, setPeriod] = useState('All dates')
    const [selectedId, setSelectedId] = useState(state.expenses[0]?.id ?? '')
    const [showPreview, setShowPreview] = useState(false)
    const [receiptName, setReceiptName] = useState('')
    const [newCategory, setNewCategory] = useState('')
    const [approvalMessage, setApprovalMessage] = useState('')
    const [fundsError, setFundsError] = useState('')
    const receiptInput = useRef<HTMLInputElement>(null)
    const EXP_CATS = useMemo(() => Array.from(new Set([...DEFAULT_EXP_CATS, ...(state.expenseCategories || [])])), [state.expenseCategories])
    const [formData, setFormData] = useState({ date: getCurrentDate(), desc: '', category: '', amount: 0, tax: 0, bank: Object.keys(state.banks)[0] || 'Globus Bank', vendor: '', department: 'Operations', method: 'Bank Transfer', notes: '', project: '', reference: '', status: 'Pending Approval' as ExpenseStatus })

    const selectedAccountBalance = useMemo(() => {
        const match = state.bankAccounts.find((account) => account.name === formData.bank)
        const fallbackBalance = state.banks[formData.bank] ?? 0
        return Number(match?.balance ?? fallbackBalance)
    }, [formData.bank, state.bankAccounts, state.banks])

    const expenseCategories = useMemo(() => Array.from(new Set([...EXP_CATS, ...(state.expenseCategories || [])])), [state.expenseCategories])
    const expenses = useMemo(() => state.expenses.filter((expense) => expense.status !== 'VOID'), [state.expenses])
    const selectedExpense = expenses.find((expense) => expense.id === selectedId) || expenses[0]
    const normalizedRoles = [user?.role, user?.roleId, user?.roleName].filter(Boolean).map((value) => String(value).toLowerCase().replace(/[\s_]+/g, '-'))
    const canApproveExpenses = normalizedRoles.some((role) => role.includes('manager') || ['md', 'business-owner'].includes(role)) || canEditPermission(user, 'expenses')

    const filteredExpenses = useMemo(() => {
        const query = search.toLowerCase().trim()
        const today = new Date()
        const rangeStart = period === 'All dates' ? null : new Date(today)
        if (rangeStart && period === 'Last 30 days') rangeStart.setDate(today.getDate() - 29)
        if (rangeStart && period === 'This quarter') rangeStart.setMonth(Math.floor(today.getMonth() / 3) * 3, 1)
        if (rangeStart && period === 'This year') rangeStart.setMonth(0, 1)
        if (rangeStart && period === 'This month') rangeStart.setDate(1)
        return expenses.filter((expense) => {
            const searchable = `${expense.id} ${expense.desc} ${expense.category} ${expense.bank} ${expense.notes}`.toLowerCase()
            const expenseDate = new Date(`${expense.date}T00:00:00`)
            return (!rangeStart || (expenseDate >= rangeStart && expenseDate <= today)) && (!query || searchable.includes(query)) && (status === 'All Statuses' || displayStatus(expense) === status) && (category === 'All Categories' || expense.category === category) && (department === 'All Departments' || expense.notes.includes(`Department: ${department}`))
        })
    }, [expenses, search, status, category, department, period])

    const metrics = useMemo(() => {
        const total = expenses.reduce((sum, expense) => sum + expense.amount, 0)
        const paid = expenses.filter((expense) => displayStatus(expense) === 'Paid').reduce((sum, expense) => sum + expense.amount, 0)
        const pendingItems = expenses.filter((expense) => ['Pending Approval', 'Approved', 'Scheduled'].includes(displayStatus(expense)))
        const pending = pendingItems.reduce((sum, expense) => sum + expense.amount, 0)
        const overdue = expenses.filter((expense) => displayStatus(expense) === 'Overdue').reduce((sum, expense) => sum + expense.amount, 0)
        const thisMonth = expenses.filter((expense) => new Date(expense.date).getMonth() === new Date().getMonth()).reduce((sum, expense) => sum + expense.amount, 0)
        const tax = expenses.reduce((sum, expense) => sum + expense.amount * 0.075, 0)
        return { total, paid, pending, pendingCount: pendingItems.length, overdue, thisMonth, tax }
    }, [expenses])

    const categoryTotals = useMemo(() => expenseCategories.map((name) => ({ name, amount: expenses.filter((expense) => expense.category === name).reduce((sum, expense) => sum + expense.amount, 0) })).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount), [expenses, expenseCategories])
    const maxCategory = Math.max(...categoryTotals.map((item) => item.amount), 1)
    const monthlyExpenses = useMemo(() => {
        const months = Array.from({ length: 8 }, (_, index) => {
            const date = new Date()
            date.setDate(1)
            date.setMonth(date.getMonth() - (7 - index))
            return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, label: date.toLocaleDateString('en-NG', { month: 'short' }), amount: 0 }
        })
        const totals = new Map(months.map((month) => [month.key, 0]))
        expenses.forEach((expense) => {
            const date = new Date(`${expense.date}T00:00:00`)
            if (!Number.isNaN(date.getTime())) {
                const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
                if (totals.has(key)) totals.set(key, (totals.get(key) || 0) + Number(expense.amount || 0))
            }
        })
        return months.map((month) => ({ ...month, amount: totals.get(month.key) || 0 }))
    }, [expenses])
    const maxMonthlyExpense = Math.max(...monthlyExpenses.map((month) => month.amount), 1)

    const saveExpense = () => {
        if (!formData.desc || formData.amount <= 0 || !formData.category) return
        const selectedBalance = Number(selectedAccountBalance || 0)
        if (selectedBalance < formData.amount) {
            setFundsError(`Insufficient funds in ${formData.bank}. Available: ${formatCurrency(selectedBalance)}. Needed: ${formatCurrency(formData.amount)}.`)
            return
        }

        setFundsError('')
        const expense: Expense = { id: makeID('EXP'), date: formData.date, desc: formData.desc, category: formData.category, amount: formData.amount, bank: formData.bank, status: formData.status, enteredBy: user?.name || 'System', notes: [`Vendor: ${formData.vendor || 'Unassigned'}`, `Department: ${formData.department}`, `Payment: ${formData.method}`, `Tax: ${formData.tax}`, formData.project ? `Project: ${formData.project}` : '', formData.reference ? `Reference: ${formData.reference}` : '', formData.notes, receiptName ? `Receipt: ${receiptName}` : ''].filter(Boolean).join(' | ') }
        const updatedBanks = { ...state.banks }
        const updatedBankAccounts = state.bankAccounts.map((account) => {
            if (account.name !== expense.bank) return account
            const balance = Number(account.balance ?? 0) - expense.amount
            updatedBanks[account.name] = balance
            return { ...account, balance }
        })
        if (updatedBankAccounts.every((account) => account.name !== expense.bank) && expense.bank) {
            const nextBalance = Number(updatedBanks[expense.bank] ?? 0) - expense.amount
            updatedBanks[expense.bank] = nextBalance
        }
        const paymentTxn = [{
            id: `TXN-${expense.id}`,
            date: expense.date,
            name: expense.desc,
            activity: `Payment made for ${expense.id}`,
            method: formData.method,
            amount: -expense.amount,
            status: 'Completed',
            description: expense.desc,
            attachments: 0,
            type: 'Withdrawal',
            bank: expense.bank,
        }]
        updateState({ expenses: [expense, ...state.expenses], banks: updatedBanks, bankAccounts: updatedBankAccounts, bankTxns: [...paymentTxn, ...state.bankTxns] })
        addAuditLog('CREATE', 'EXPENSE', expense.id, `${expense.category} expense recorded: ${formatCurrency(expense.amount)}`)
        setSelectedId(expense.id)
        setShowForm(false)
        setReceiptName('')
        setFormData({ ...formData, date: getCurrentDate(), desc: '', amount: 0, tax: 0, vendor: '', project: '', reference: '', notes: '' })
    }

    const addCategory = () => {
        const categoryName = newCategory.trim()
        if (!categoryName || expenseCategories.includes(categoryName)) return
        updateState({ expenseCategories: [...(state.expenseCategories || []), categoryName] })
        setFormData({ ...formData, category: categoryName })
        setNewCategory('')
    }

    const approveExpense = async () => {
        if (!selectedExpense || displayStatus(selectedExpense) !== 'Pending Approval' || !canApproveExpenses) return

        const supabase = getSupabaseClient()
        if (!supabase || !user?.companyId) {
            setApprovalMessage('Approval could not be saved because the company database is unavailable.')
            return
        }

        const nextStatus = 'Approved'
        const { data: referenceRows, error: referenceError } = await supabase
            .from('expenses')
            .update({ status: nextStatus, updated_at: new Date().toISOString() })
            .eq('company_id', user.companyId)
            .eq('reference', selectedExpense.id)
            .select('id')

        if (referenceError) {
            setApprovalMessage('Approval could not be saved. Please try again.')
            return
        }

        if (!referenceRows?.length) {
            const { error: idError } = await supabase
                .from('expenses')
                .update({ status: nextStatus, updated_at: new Date().toISOString() })
                .eq('company_id', user.companyId)
                .eq('id', selectedExpense.id)

            if (idError) {
                setApprovalMessage('Approval could not be saved. Please try again.')
                return
            }
        }

        const nextExpenses = state.expenses.map((expense) => expense.id === selectedExpense.id ? { ...expense, status: nextStatus } : expense)
        updateState({ expenses: nextExpenses }, { persist: false })
        addAuditLog('APPROVE', 'EXPENSE', selectedExpense.id, `${selectedExpense.category} expense approved by ${user.name}`)
        setApprovalMessage('Expense approved and saved.')
    }

    const deleteExpense = () => {
        if (!selectedExpense || !window.confirm(`Delete expense ${selectedExpense.id}? It will remain retained for 30 days.`)) return
        const purgeAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        updateState({ expenses: state.expenses.map((expense) => expense.id === selectedExpense.id ? { ...expense, status: 'VOID', deletedAt: new Date().toISOString(), purgeAfter } : expense) })
        addAuditLog('DELETE', 'EXPENSE', selectedExpense.id, `Expense ${selectedExpense.id} was deleted and retained until ${purgeAfter}.`)
        setShowPreview(false)
    }

    useEffect(() => {
        const approveButton = document.querySelector('.expense-preview-actions .btn-primary') as HTMLButtonElement | null
        if (!approveButton) return
        if (!canApproveExpenses || !selectedExpense || displayStatus(selectedExpense) !== 'Pending Approval') {
            approveButton.style.display = 'none'
            return
        }
        approveButton.style.display = ''
        const handleApproval = () => { void approveExpense() }
        approveButton.addEventListener('click', handleApproval)
        return () => approveButton.removeEventListener('click', handleApproval)
    }, [canApproveExpenses, selectedExpense, state.expenses])

    useEffect(() => {
        const preview = document.querySelector('.expense-preview-bubble') as HTMLElement | null
        const shell = document.querySelector('.expense-register-shell') as HTMLElement | null
        const selectedRow = shell?.querySelector('tbody tr.selected') as HTMLElement | null
        const positionPreview = () => {
            if (!preview || !shell || !selectedRow || !showPreview) return
            const shellTop = shell.getBoundingClientRect().top
            const rowTop = selectedRow.getBoundingClientRect().top
            const rowCenter = rowTop - shellTop + selectedRow.offsetHeight / 2
            const previewTop = Math.max(16, rowCenter - preview.offsetHeight / 2)
            preview.style.top = `${previewTop}px`
        }
        const header = preview?.querySelector('.expense-preview-header')
        if (preview) preview.setAttribute('aria-hidden', showPreview ? 'false' : 'true')
        if (preview) preview.style.display = showPreview ? '' : 'none'
        positionPreview()
        const closeButton = header ? document.createElement('button') : null
        if (closeButton && header) {
            closeButton.type = 'button'
            closeButton.className = 'icon-button'
            closeButton.setAttribute('aria-label', 'Close expense details')
            closeButton.title = 'Close'
            closeButton.textContent = '×'
            closeButton.addEventListener('click', () => setShowPreview(false))
            header.appendChild(closeButton)
        }

        const handleOutsideClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement
            if (target.closest('.expense-preview-bubble')) return
            const row = target.closest('tbody tr')
            if (!row) {
                setShowPreview(false)
            } else if (showPreview && row.classList.contains('selected')) {
                setShowPreview(false)
            } else {
                setShowPreview(true)
            }
        }
        document.addEventListener('mousedown', handleOutsideClick)
        window.addEventListener('resize', positionPreview)
        window.addEventListener('scroll', positionPreview, true)

        return () => {
            document.removeEventListener('mousedown', handleOutsideClick)
            window.removeEventListener('resize', positionPreview)
            window.removeEventListener('scroll', positionPreview, true)
            closeButton?.remove()
        }
    }, [showPreview, selectedId, selectedExpense])

    const exportExpenses = () => downloadExcel('expenses.xlsx', filteredExpenses.map((expense) => ({ Date: expense.date, Number: expense.id, Description: expense.desc, Category: expense.category, Amount: expense.amount, Status: displayStatus(expense), Account: expense.bank })))
    const resetFilters = () => { setSearch(''); setStatus('All Statuses'); setCategory('All Categories'); setDepartment('All Departments'); setPeriod('All dates') }

    return (
        <AppLayout>
            <div className="module-shell expenses-workspace">
                <header className="module-header"><div><div className="eyebrow">Operations / Finance</div><div className="module-title">Expenses</div><div className="module-subtitle">Track, manage, approve, and analyze business expenses.</div></div><div className="module-actions"><button className="btn btn-secondary" onClick={exportExpenses}><ArrowDownToLine size={15} /> Export</button><button className="btn btn-secondary" onClick={() => setShowFilters((value) => !value)}><Filter size={15} /> Filters</button>{canEdit(user?.role || '') && <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> Add Expense</button>}</div></header>
                <nav className="expense-tabs" aria-label="Expense views">{(['Expenses', 'Reimbursements', 'Recurring', 'Categories'] as Tab[]).map((tab) => <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}{tab === 'Expenses' && <span>{expenses.length}</span>}</button>)}</nav>
                <div className="module-actions"><BulkImport label="Bulk upload" onImportComplete={() => setPeriod('All dates')} tableColumns={['Date', 'Expense #', 'Description', 'Category', 'Vendor', 'Amount', 'Tax', 'Total', 'Payment', 'Account', 'Status']} /></div>
                {activeTab === 'Expenses' && <>
                    <section className="dashboard-card-grid expense-metrics">{[['Total Expenses', metrics.total, 'Across selected records', 'metric-blue'], ['Paid', metrics.paid, 'Expenses settled', 'metric-green'], ['Pending', metrics.pending, `${metrics.pendingCount} expenses`, 'metric-amber'], ['Overdue', metrics.overdue, 'Approved, unpaid', 'metric-red'], ['This Month', metrics.thisMonth, 'Current period', 'metric-teal'], ['Tax / VAT', metrics.tax, 'Estimated recoverable', 'metric-purple']].map(([label, amount, note, tone]) => <div className={`dashboard-card ${tone}`} key={label as string}><div className="metric-label">{label}</div><div className="metric-value">{formatCurrency(amount as number)}</div><div className="metric-note">{note}</div></div>)}</section>
                    {showFilters && <section className="filter-panel expense-filter-panel"><div className="filter-row"><label className="search-filter"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search expenses, vendors, or references..." /></label><label>Date range<select value={period} onChange={(event) => setPeriod(event.target.value)}><option>This month</option><option>Last 30 days</option><option>This quarter</option><option>This year</option><option>All dates</option></select></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>{statusOptions.map((option) => <option key={option}>{option}</option>)}</select></label><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option>All Categories</option>{EXP_CATS.map((option) => <option key={option}>{option}</option>)}</select></label><label>Department<select value={department} onChange={(event) => setDepartment(event.target.value)}>{departments.map((option) => <option key={option}>{option}</option>)}</select></label><button className="btn btn-ghost" onClick={resetFilters}>Clear filters</button></div></section>}
                    <div className="module-content-grid expense-main-grid"><div className="expense-register-shell"><section className="card expense-register"><div className="card-hd"><div><div className="card-title">Expense register</div><div className="section-subtitle">{filteredExpenses.length} records {period.toLowerCase()}</div></div><button className="icon-button" title="More register options"><MoreHorizontal size={18} /></button></div><div className="tbl-wrap"><table><thead><tr><th>Date</th><th>Expense #</th><th>Description</th><th>Category</th><th>Vendor</th><th className="td-r">Amount</th><th className="td-r">Tax</th><th className="td-r">Total</th><th>Payment</th><th>Account</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredExpenses.length === 0 ? <tr><td colSpan={12} className="empty-state">No expenses match these filters.</td></tr> : filteredExpenses.map((expense) => { const expenseStatus = displayStatus(expense); const tax = expense.amount * 0.075; const vendor = expense.notes.match(/Vendor: ([^|]+)/)?.[1]?.trim() || 'Unassigned'; return <tr key={expense.id} className={selectedExpense?.id === expense.id ? 'selected' : ''} onClick={() => setSelectedId(expense.id)}><td>{dateLabel(expense.date)}</td><td><strong>{expense.id}</strong></td><td>{expense.desc}</td><td>{expense.category}</td><td>{vendor}</td><td className="td-r">{formatCurrency(expense.amount)}</td><td className="td-r muted-cell">{formatCurrency(tax)}</td><td className="td-r"><strong>{formatCurrency(expense.amount + tax)}</strong></td><td>{expense.notes.match(/Payment: ([^|]+)/)?.[1] || 'Bank Transfer'}</td><td>{expense.bank}</td><td><span className={`status-pill status-${expenseStatus.toLowerCase().replaceAll(' ', '-')}`}>{expenseStatus}</span></td><td><button className="icon-button expense-delete-button" type="button" title={`Delete ${expense.id}`} aria-label={`Delete ${expense.id}`} onClick={(event) => { event.stopPropagation(); setSelectedId(expense.id); deleteExpense() }}><Trash2 size={16} /></button></td></tr> })}</tbody></table></div></section>{selectedExpense && <div className="expense-preview-bubble" role="dialog" aria-live="polite"><div className="expense-preview-header"><div><span className="eyebrow">Selected expense</span><h3>{selectedExpense.id}</h3></div><span className={`status-pill status-${displayStatus(selectedExpense).toLowerCase().replaceAll(' ', '-')}`}>{displayStatus(selectedExpense)}</span></div><div className="expense-preview-body"><div className="expense-preview-main"><strong>{selectedExpense.desc}</strong><span>{dateLabel(selectedExpense.date)} • {selectedExpense.category}</span></div><div className="expense-preview-amount">{formatCurrency(selectedExpense.amount * 1.075)}</div></div><div className="expense-preview-meta"><div><label>Vendor</label><strong>{selectedExpense.notes.match(/Vendor: ([^|]+)/)?.[1]?.trim() || 'Unassigned'}</strong></div><div><label>Account</label><strong>{selectedExpense.bank}</strong></div><div><label>Method</label><strong>{selectedExpense.notes.match(/Payment: ([^|]+)/)?.[1] || 'Bank Transfer'}</strong></div></div><div className="expense-preview-actions"><button className="btn btn-secondary"><FileText size={15} /> Journal</button><button className="btn btn-primary">Approve</button></div></div>}</div>
                    </div>
                    <section className="expense-analytics-grid"><div className="chart-card"><div className="card-hd"><div><div className="chart-card-title">Monthly expenses</div><div className="section-subtitle">Actual spend for the last eight months</div></div><CircleDollarSign size={18} className="muted-cell" /></div><div className="bar-chart">{monthlyExpenses.map((month) => <div className="bar-column" key={month.key} title={`${month.label} ${formatCurrency(month.amount)}`}><strong className="bar-amount">{formatCurrency(month.amount)}</strong><div className="bar-value" style={{ height: `${month.amount ? Math.max(10, (month.amount / maxMonthlyExpense) * 100) : 4}%` }} /><span>{month.label}</span></div>)}</div></div><div className="chart-card"><div className="chart-card-title">Expenses by category</div><div className="category-bars">{categoryTotals.slice(0, 5).map((item) => <div className="category-bar" key={item.name}><div><span>{item.name}</span><strong>{formatCurrency(item.amount)}</strong></div><i style={{ width: `${(item.amount / maxCategory) * 100}%` }} /></div>)}{categoryTotals.length === 0 && <div className="empty-state">Category insights appear as expenses are recorded.</div>}</div></div></section>
                </>}
                {activeTab !== 'Expenses' && <section className="card empty-module-state"><div className="empty-module-icon"><CircleDollarSign size={24} /></div><h2>{activeTab}</h2><p>This workspace is ready for {activeTab.toLowerCase()} records and approvals.</p><button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> Add record</button></section>}
                {showForm && <div className="expense-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowForm(false)}><section className="expense-modal"><div className="card-hd"><div><div className="card-title">Add expense</div><div className="section-subtitle">Create an auditable expense record and route it for approval.</div></div><button className="icon-button" onClick={() => setShowForm(false)} aria-label="Close"><X size={18} /></button></div><div className="expense-form-grid"><label>Expense date<input type="date" value={formData.date} onChange={(event) => setFormData({ ...formData, date: event.target.value })} /></label><label>Expense number<input value="Auto-generated" disabled /></label><label className="field-wide">Description<input value={formData.desc} onChange={(event) => setFormData({ ...formData, desc: event.target.value })} placeholder="e.g. Office internet subscription" /></label><label>Category<select value={formData.category} onChange={(event) => setFormData({ ...formData, category: event.target.value })}><option value="">Select category</option>{EXP_CATS.map((option) => <option key={option} value={option}>{option}</option>)}</select><span className="field-optional">Add another category</span><div className="category-add-row"><input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addCategory()} placeholder="New category name" /><button type="button" className="btn btn-secondary" onClick={addCategory}>Add</button></div></label><label>Vendor / payee<input value={formData.vendor} onChange={(event) => setFormData({ ...formData, vendor: event.target.value })} placeholder="Vendor name" /></label><label>Amount<input type="number" min="0" value={formData.amount || ''} onChange={(event) => { setFormData({ ...formData, amount: Number(event.target.value) }); setFundsError('') }} placeholder="0" /></label><label>Tax / VAT<input type="number" min="0" value={formData.tax || ''} onChange={(event) => setFormData({ ...formData, tax: Number(event.target.value) })} placeholder="0" /></label><label>Payment account<select value={formData.bank} onChange={(event) => { setFormData({ ...formData, bank: event.target.value }); setFundsError('') }}>{Object.keys(state.banks).map((bank) => <option key={bank}>{bank}</option>)}</select></label><label>Department<select value={formData.department} onChange={(event) => setFormData({ ...formData, department: event.target.value })}>{departments.slice(1).map((option) => <option key={option}>{option}</option>)}</select></label><label>Payment method<select value={formData.method} onChange={(event) => setFormData({ ...formData, method: event.target.value })}>{paymentMethods.map((option) => <option key={option}>{option}</option>)}</select></label><label>Payment status<select value={formData.status} onChange={(event) => setFormData({ ...formData, status: event.target.value as ExpenseStatus })}>{statusOptions.slice(1).map((option) => <option key={option}>{option}</option>)}</select></label><label>Project <span className="field-optional">Optional</span><input value={formData.project} onChange={(event) => setFormData({ ...formData, project: event.target.value })} placeholder="Project code" /></label><label>Reference / transaction ID<span className="field-optional">Optional</span><input value={formData.reference} onChange={(event) => setFormData({ ...formData, reference: event.target.value })} placeholder="e.g. TXN-1024" /></label><label className="field-wide">Notes<span className="field-optional">Optional</span><textarea value={formData.notes} onChange={(event) => setFormData({ ...formData, notes: event.target.value })} placeholder="Add context for reviewers" /></label>{fundsError && <div className="field-wide field-error" role="alert">{fundsError}</div>}<div className="field-wide"><button className="receipt-upload" onClick={() => receiptInput.current?.click()}><Paperclip size={16} /> {receiptName || 'Upload receipt or invoice'}<Upload size={15} /></button><input ref={receiptInput} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" hidden onChange={(event) => setReceiptName(event.target.files?.[0]?.name || '')} /></div></div><div className="btn-group"><button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="btn btn-primary" onClick={saveExpense}>Save expense</button></div></section></div>}
            </div>
        </AppLayout>
    )
}

