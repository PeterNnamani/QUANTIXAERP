'use client'

import { useMemo, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting } from '@/lib/context'
import { formatCurrency, formatNumber, triggerAppToast } from '@/lib/utils'
import { downloadExcel } from '@/lib/export-utils'
import PaymentModal from '@/components/modals/PaymentModal'
import AddLoanModal from '@/components/modals/AddLoanModal'
import LoanActionModal from '@/components/modals/LoanActionModal'

const loanSummaryCards = [
    { label: 'Total Outstanding Debt', value: formatCurrency(0), subtitle: 'No loan records yet', tone: 'info' },
    { label: 'Total Borrowed', value: formatCurrency(0), subtitle: 'No loan records yet', tone: 'purple' },
    { label: 'Paid This Year', value: formatCurrency(0), subtitle: 'No loan records yet', tone: 'success' },
    { label: 'Upcoming Payments', value: formatCurrency(0), subtitle: 'No loan records yet', tone: 'warning' },
    { label: 'Interest Paid', value: formatCurrency(0), subtitle: 'No loan records yet', tone: 'amber' },
    { label: 'Debt Health Score', value: '0', subtitle: 'No loan records yet', tone: 'green' },
]

const loanTypes = ['All Loans', 'Bank Loan', 'Business Loan', 'Equipment Finance', 'Vehicle Loan', 'Investor Loan', 'Credit Facility', 'Overdraft']
const lenders = ['All Lenders', 'GTBank', 'UBA', 'First Bank', 'Private Investor', 'Finance Company']
const loanStatuses = ['All', 'Active', 'Pending Approval', 'Paid Off', 'Overdue', 'Restructured']
const dateRanges = ['Today', 'This Month', 'This Year', 'Custom Range']

const aiInsights = [
    'No loan records are available yet. Add loan data to populate this view.',
]

export default function LoansPage() {
    const { state, addAuditLog, updateState } = useAccounting()
    const [loanType, setLoanType] = useState('All Loans')
    const [lender, setLender] = useState('All Lenders')
    const [status, setStatus] = useState('All')
    const [dateRange, setDateRange] = useState('This Month')
    const [search, setSearch] = useState('')
    const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null)
    const [showFilters, setShowFilters] = useState(false)
    const [loanAction, setLoanAction] = useState<'settlement' | 'reports' | null>(null)

    const loans = state.loans || []
    const totalBorrowed = loans.reduce((sum, loan) => sum + Number(loan.originalAmount ?? loan.amount ?? 0), 0)
    const totalOutstanding = loans.reduce((sum, loan) => sum + Number(loan.balance ?? loan.amount ?? 0), 0)
    const totalInterest = loans.reduce((sum, loan) => sum + Number(loan.interestRemaining ?? 0), 0)
    const upcomingPayments = loans.reduce((sum, loan) => sum + (loan.paymentSchedule || []).filter((item: any) => item.date >= new Date().toISOString().slice(0, 10)).reduce((scheduleTotal: number, item: any) => scheduleTotal + Number(item.payment || 0), 0), 0)
    const loanSummaryCards = [
        { label: 'Total Outstanding Debt', value: formatCurrency(totalOutstanding), subtitle: loans.length ? 'Current loan balances' : 'No loan records yet', tone: 'info' },
        { label: 'Total Borrowed', value: formatCurrency(totalBorrowed), subtitle: loans.length ? 'Original principal' : 'No loan records yet', tone: 'purple' },
        { label: 'Paid This Year', value: formatCurrency(Math.max(0, totalBorrowed - totalOutstanding)), subtitle: 'Principal repaid', tone: 'success' },
        { label: 'Upcoming Payments', value: formatCurrency(upcomingPayments), subtitle: 'Scheduled repayments', tone: 'warning' },
        { label: 'Interest Paid', value: formatCurrency(0), subtitle: 'Recorded interest', tone: 'amber' },
        { label: 'Debt Health Score', value: loans.length ? '82' : '0', subtitle: loans.length ? 'Based on current debt' : 'No loan records yet', tone: 'green' },
    ]

    const filteredLoans = useMemo(() => {
        const query = search.trim().toLowerCase()
        return loans.filter((loan) => {
            const matchesSearch =
                !query ||
                [loan.id, loan.lender, loan.type, loan.nextPayment].join(' ').toLowerCase().includes(query)
            const matchesType = loanType === 'All Loans' || loan.type === loanType
            const matchesLender = lender === 'All Lenders' || loan.lender === lender
            const matchesStatus = status === 'All' || loan.status === status
            return matchesSearch && matchesType && matchesLender && matchesStatus
        })
    }, [loans, loanType, lender, status, search])

    const statusCounts = [
        { label: 'Active Loans', tone: 'active', count: loans.filter((loan) => loan.status === 'Active').length },
        { label: 'Payment Due Soon', tone: 'warning', count: loans.filter((loan) => loan.status === 'Pending Approval' || loan.status === 'Overdue').length },
        { label: 'Restructured', tone: 'orange', count: loans.filter((loan) => loan.status === 'Restructured').length },
        { label: 'Default Risk', tone: 'critical', count: loans.filter((loan) => loan.status === 'Overdue').length },
        { label: 'Fully Paid', tone: 'success', count: loans.filter((loan) => loan.status === 'Paid Off' || Number(loan.balance ?? 0) <= 0).length },
    ]

    const selectedLoan = filteredLoans.find((loan) => loan.id === selectedLoanId) || filteredLoans[0] || loans[0] || null
    const debtHealth = loans.length ? 82 : 0

    const handleLoanAction = (action: string) => {
        triggerAppToast(action, 'The loan workflow has been queued for processing.')
        if (action === 'Export') {
            downloadExcel('loans-export.xlsx', filteredLoans)
        }
        if (action === '+ Record Repayment') {
            setShowPayment(true)
            return
        }
        if (action === '+ Add New Loan') {
            setShowAddLoan(true)
            return
        }
        if (action === 'Early Settlement') {
            setLoanAction('settlement')
            return
        }
        if (action === 'Reports') {
            setLoanAction('reports')
            return
        }
    }

    const [showPayment, setShowPayment] = useState(false)
    const [showAddLoan, setShowAddLoan] = useState(false)

    const handlePostRepayment = (payment: { amount: number; loanId: string; accountId: string; accountName: string; paymentMethod: string; date: string; note: string }) => {
        const loan = loans.find((item) => item.id === payment.loanId)
        const repayment = Math.min(payment.amount, Number(loan?.balance ?? 0))
        const updatedLoans = loans.map((loan) => {
            if (loan.id !== payment.loanId) return loan
            const balance = Math.max(0, Number(loan.balance ?? 0) - repayment)
            return {
                ...loan,
                balance,
                principalPaid: Number(loan.principalPaid ?? 0) + repayment,
                status: balance === 0 ? 'Paid Off' : loan.status,
            }
        })
        const repaymentRecord = {
            id: `LR-${Date.now()}`,
            loanId: payment.loanId,
            accountId: payment.accountId,
            accountName: payment.accountName,
            amount: repayment,
            paymentMethod: payment.paymentMethod,
            date: payment.date,
            note: payment.note,
        }
        const updatedBankAccounts = payment.accountId
            ? state.bankAccounts.map((account) => account.id === payment.accountId ? { ...account, balance: Number(account.balance || 0) - repayment } : account)
            : state.bankAccounts
        updateState({ loans: updatedLoans, loanRepayments: [...(state.loanRepayments || []), repaymentRecord], bankAccounts: updatedBankAccounts })
        addAuditLog('PAYMENT', 'LOAN', payment.loanId, `Repayment of ${formatCurrency(repayment)} paid from ${payment.accountName}${payment.note ? ` (${payment.note})` : ''}.`)
        triggerAppToast('Repayment Posted', `${formatCurrency(repayment)} paid from ${payment.accountName}`)
    }

    const handleExportReport = (scope: 'portfolio' | 'selected') => {
        const rows = scope === 'selected' && selectedLoan ? [selectedLoan] : filteredLoans
        downloadExcel(`loans-${scope}-report.xlsx`, rows)
        setLoanAction(null)
        triggerAppToast('Report exported', 'The selected loan report was downloaded.')
    }

    const handleCreateLoan = (loan: any) => {
        updateState({ loans: [...state.loans, loan] })
        addAuditLog('CREATE', 'LOAN', loan.id, 'New loan created')
        triggerAppToast('Loan Created', `Loan ${loan.id} added`)
    }

    return (
        <AppLayout>
            <div className="transactions-shell loans-shell">
                <div className="page-header loans-header">
                    <div>
                        <div className="pg-title">Company Loans</div>
                        <div className="pg-subtitle">Manage business borrowing, repayment schedules, interest, lenders, and debt obligations.</div>
                    </div>
                    <div className="page-actions loans-actions">
                        <button type="button" className="action-btn primary" onClick={() => handleLoanAction('+ Add New Loan')}>+ Add New Loan</button>
                        <button type="button" className="action-btn secondary" onClick={() => handleLoanAction('+ Record Repayment')}>+ Record Repayment</button>
                        <button type="button" className="action-btn secondary" onClick={() => handleLoanAction('Early Settlement')}>Early Settlement</button>
                        <button type="button" className="action-btn secondary" onClick={() => handleLoanAction('Export')}>Export</button>
                        <button type="button" className="action-btn secondary" onClick={() => setShowFilters((prev) => !prev)}>{showFilters ? 'Hide Filters' : 'Show Filters'}</button>
                        <button type="button" className="action-btn secondary" onClick={() => handleLoanAction('Reports')}>Reports</button>
                    </div>
                </div>

                <div className="loans-summary-grid">
                    {loanSummaryCards.map((card) => (
                        <div key={card.label} className={`summary-card ${card.tone}`}>
                            <div className="summary-label">{card.label}</div>
                            <div className="summary-value">{card.value}</div>
                            <div className="summary-subtitle">{card.subtitle}</div>
                        </div>
                    ))}
                </div>

                <div className="loan-status-row">
                    {statusCounts.map((item) => (
                        <div key={item.label} className={`status-pill status-${item.tone}`}>
                            <span className="status-dot" />
                            {item.label} ({item.count})
                        </div>
                    ))}
                </div>

                {showFilters && (
                    <div className="loans-filters card">
                        <div className="card-hd">
                            <div>
                                <div className="card-title">Search & Filters</div>
                                <div className="section-subtitle">Search loan, lender, reference number, and refine by type, lender, status, or date range.</div>
                            </div>
                        </div>
                        <div className="loan-filters-row">
                            <div className="search-field">
                                <span>🔍</span>
                                <input
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Search loan, lender, reference number..."
                                />
                            </div>
                            <label>
                                Loan Type
                                <select value={loanType} onChange={(event) => setLoanType(event.target.value)}>
                                    {loanTypes.map((type) => (
                                        <option key={type} value={type}>{type}</option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                Lender
                                <select value={lender} onChange={(event) => setLender(event.target.value)}>
                                    {lenders.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                Status
                                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                                    {loanStatuses.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                Date Range
                                <select value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
                                    {dateRanges.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    </div>
                )}

                <PaymentModal
                    open={showPayment}
                    onClose={() => setShowPayment(false)}
                    onConfirm={handlePostRepayment}
                    loans={loans}
                    bankAccounts={state.bankAccounts}
                    selectedLoanId={selectedLoan?.id}
                    defaultAmount={Number(selectedLoan?.balance ?? 0)}
                />
                <AddLoanModal open={showAddLoan} onClose={() => setShowAddLoan(false)} onCreate={handleCreateLoan} />
                <LoanActionModal
                    open={Boolean(loanAction)}
                    action={loanAction || 'settlement'}
                    loan={selectedLoan}
                    loans={loans}
                    bankAccounts={state.bankAccounts}
                    onClose={() => setLoanAction(null)}
                    onSettle={handlePostRepayment}
                    onExport={handleExportReport}
                />

                <div className="loans-main-grid">
                    <div className="loans-table-panel">
                        <div className="card">
                            <div className="card-hd">
                                <div>
                                    <div className="card-title">Loan Portfolio</div>
                                    <div className="section-subtitle">Overview of company borrowings and debt service.</div>
                                </div>
                            </div>
                            <div className="tbl-wrap">
                                <table className="loan-table">
                                    <thead>
                                        <tr>
                                            <th>Loan ID</th>
                                            <th>Lender</th>
                                            <th>Type</th>
                                            <th className="td-r">Original Amount</th>
                                            <th className="td-r">Balance</th>
                                            <th className="td-r">Interest</th>
                                            <th>Next Payment</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredLoans.map((loan) => (
                                            <tr
                                                key={loan.id}
                                                className={loan.id === selectedLoan?.id ? 'table-row-selected' : ''}
                                                onClick={() => setSelectedLoanId(loan.id)}
                                            >
                                                <td>{loan.id}</td>
                                                <td>{loan.lender}</td>
                                                <td>{loan.type}</td>
                                                <td className="td-r">{formatCurrency(loan.originalAmount)}</td>
                                                <td className="td-r">{formatCurrency(loan.balance)}</td>
                                                <td className="td-r">{loan.interestRate}%</td>
                                                <td>{loan.nextPayment}</td>
                                                <td><span className={`status-pill ${loan.status === 'Active' ? 'success' : loan.status === 'Overdue' ? 'critical' : loan.status === 'Paid Off' ? 'green' : 'warning'}`}>{loan.status}</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="card repayment-schedule-card">
                            <div className="card-hd">
                                <div>
                                    <div className="card-title">Repayment Schedule</div>
                                    <div className="section-subtitle">Upcoming payments and loan progress.</div>
                                </div>
                            </div>
                            <div className="tbl-wrap">
                                <table className="schedule-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th className="td-r">Payment</th>
                                            <th className="td-r">Principal</th>
                                            <th className="td-r">Interest</th>
                                            <th className="td-r">Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedLoan?.paymentSchedule && selectedLoan.paymentSchedule.length > 0 ? (
                                            selectedLoan.paymentSchedule.map((item: any) => (
                                                <tr key={item.date}>
                                                    <td>{item.date}</td>
                                                    <td className="td-r">{formatCurrency(item.payment)}</td>
                                                    <td className="td-r">{formatCurrency(item.principal)}</td>
                                                    <td className="td-r">{formatCurrency(item.interest)}</td>
                                                    <td className="td-r">{formatCurrency(item.balance)}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={5} style={{ textAlign: 'center', padding: '18px 0' }}>No repayment schedule available</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <div className="loan-progress-panel">
                                <div className="progress-header">
                                    <div>
                                        <div className="summary-label">Loan Progress</div>
                                        <div className="summary-value">Paid 36%</div>
                                    </div>
                                    <div className="summary-subtitle">Borrowed · Remaining 64%</div>
                                </div>
                                <div className="timeline-bar">
                                    <div className="timeline-fill" style={{ width: '36%' }} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="loans-side-panel">
                        <div className="card detail-card">
                            <div className="card-hd">
                                <div>
                                    <div className="card-title">{selectedLoan ? `${selectedLoan.lender} ${selectedLoan.type}` : 'No loan selected'}</div>
                                    <div className="section-subtitle">{selectedLoan ? `Loan ID ${selectedLoan.id}` : 'Add a loan to view details'}</div>
                                </div>
                            </div>
                            <div className="detail-panel">
                                <div className="detail-row"><span>Original Amount</span><strong>{selectedLoan ? formatCurrency(selectedLoan.originalAmount) : formatCurrency(0)}</strong></div>
                                <div className="detail-row"><span>Outstanding Balance</span><strong>{selectedLoan ? formatCurrency(selectedLoan.balance) : formatCurrency(0)}</strong></div>
                                <div className="detail-row"><span>Interest Rate</span><strong>{selectedLoan ? `${selectedLoan.interestRate}%` : '0%'}</strong></div>
                                <div className="detail-row"><span>Loan Period</span><strong>{selectedLoan ? `${selectedLoan.periodMonths} Months` : '0 Months'}</strong></div>
                                <div className="detail-row"><span>Start Date</span><strong>{selectedLoan ? selectedLoan.startDate : 'N/A'}</strong></div>
                                <div className="detail-row"><span>End Date</span><strong>{selectedLoan ? selectedLoan.endDate : 'N/A'}</strong></div>
                            </div>
                        </div>

                        <div className="card detail-card">
                            <div className="card-hd">
                                <div>
                                    <div className="card-title">Loan Financial Breakdown</div>
                                    <div className="section-subtitle">Principal, interest, and total repayment.</div>
                                </div>
                            </div>
                            <div className="detail-panel">
                                <div className="detail-row"><span>Principal Borrowed</span><strong>{selectedLoan ? formatCurrency(selectedLoan.originalAmount) : formatCurrency(0)}</strong></div>
                                <div className="detail-row"><span>Principal Paid</span><strong>{selectedLoan ? formatCurrency(selectedLoan.principalPaid) : formatCurrency(0)}</strong></div>
                                <div className="detail-row"><span>Remaining Principal</span><strong>{selectedLoan ? formatCurrency(selectedLoan.balance) : formatCurrency(0)}</strong></div>
                                <div className="detail-row"><span>Interest Remaining</span><strong>{selectedLoan ? formatCurrency(selectedLoan.interestRemaining) : formatCurrency(0)}</strong></div>
                                <div className="detail-row"><span>Total Repayment</span><strong>{selectedLoan ? formatCurrency((selectedLoan.originalAmount || 0) + (selectedLoan.interestRemaining || 0)) : formatCurrency(0)}</strong></div>
                            </div>
                        </div>

                        <div className="card detail-card">
                            <div className="card-hd">
                                <div>
                                    <div className="card-title">Collateral Management</div>
                                    <div className="section-subtitle">Secured asset coverage and risk status.</div>
                                </div>
                            </div>
                            <div className="detail-panel">
                                <div className="detail-row"><span>Collateral</span><strong>{selectedLoan?.collateral?.asset ?? 'N/A'}</strong></div>
                                <div className="detail-row"><span>Value</span><strong>{selectedLoan?.collateral?.value ? formatCurrency(selectedLoan.collateral.value) : formatCurrency(0)}</strong></div>
                                <div className="detail-row"><span>Status</span><strong>{selectedLoan?.collateral?.status ?? 'N/A'}</strong></div>
                                <div className="detail-row"><span>Risk Coverage</span><strong>{selectedLoan?.collateral?.coverage ?? 'N/A'}</strong></div>
                            </div>
                        </div>

                        <div className="card analytics-card">
                            <div className="card-hd">
                                <div>
                                    <div className="card-title">Debt Ratio Dashboard</div>
                                    <div className="section-subtitle">Key leverage and coverage metrics.</div>
                                </div>
                            </div>
                            <div className="analytics-list">
                                <div className="analytics-item">
                                    <span>Debt To Revenue</span>
                                    <strong>32%</strong>
                                </div>
                                <div className="analytics-item">
                                    <span>Debt To Asset</span>
                                    <strong>18%</strong>
                                </div>
                                <div className="analytics-item">
                                    <span>Interest Coverage</span>
                                    <strong>4.5x</strong>
                                </div>
                                <div className="analytics-item">
                                    <span>Risk Level</span>
                                    <strong>{selectedLoan ? selectedLoan.riskRadar ?? 'N/A' : 'N/A'}</strong>
                                </div>
                            </div>
                        </div>

                        <div className="card analytics-card">
                            <div className="card-hd">
                                <div>
                                    <div className="card-title">Loan Documents</div>
                                    <div className="section-subtitle">Important loan and approval documents.</div>
                                </div>
                            </div>
                            <div className="documents-list">
                                {selectedLoan?.documents && selectedLoan.documents.length > 0 ? (
                                    selectedLoan.documents.map((document: string) => (
                                        <div key={document} className="document-row">📄 {document}</div>
                                    ))
                                ) : (
                                    <div style={{ padding: 12 }}>No documents available</div>
                                )}
                            </div>
                        </div>

                        <div className="card ai-card">
                            <div className="card-hd">
                                <div>
                                    <div className="card-title">QUANTIXA Debt Intelligence</div>
                                    <div className="section-subtitle">Predictive guidance for loan strategy and cash impact.</div>
                                </div>
                            </div>
                            <div className="ai-list">
                                {aiInsights.map((insight) => (
                                    <div key={insight} className="ai-item">
                                        <p>{insight}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    )
}
