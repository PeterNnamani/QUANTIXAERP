'use client'

import { useMemo, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting } from '@/lib/context'
import { displayOpenBalance, moveBankBalance, settledOpenItem } from '@/lib/open-item-payment'
import { formatCurrency, formatNumber, triggerAppToast, makeID } from '@/lib/utils'
import { downloadExcel } from '@/lib/export-utils'
import PaymentModal from '@/components/modals/PaymentModal'


export default function ReceivablesPage() {
  const { state, addAuditLog, updateState } = useAccounting()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState('All Customers')
  const [selectedStatus, setSelectedStatus] = useState('All Status')
  const [selectedDueFilter, setSelectedDueFilter] = useState('All')
  const [selectedBranch, setSelectedBranch] = useState('All Branches')
  const [selectedRow, setSelectedRow] = useState(0)
  const [showFilters, setShowFilters] = useState(false)

  const customerOptions = useMemo(() => {
    const customers = Array.from(new Set(state.receivables.map((item) => item.name || item.customer).filter(Boolean)))
    return customers.length > 0 ? customers : []
  }, [state.receivables])

  const receivables = useMemo(() => {
    const source = state.receivables
    return source.map((item, idx) => ({
      id: item.id || `AR-${idx + 1}`,
      customer: item.name || item.customer,
      invoice: item.invoice || `INV-${1000 + idx}`,
      invoiceDate: item.invoiceDate || '2026-07-21',
      dueDate: item.due || item.dueDate || '2026-07-31',
      total: item.amount || item.total || 0,
      paid: item.amountPaid ?? item.amount_paid ?? item.paid ?? 0,
      balance: displayOpenBalance(item),
      status: item.status || 'Unpaid',
      daysOverdue: item.daysOverdue || 0,
      rep: item.rep || 'Peter',
      branch: item.branch || 'Lagos',
    }))
  }, [state.receivables])

  const filteredReceivables = useMemo(() => {
    const query = searchTerm.toLowerCase()

    return receivables.filter((item) => {
      const matchesQuery = !query || [item.customer, item.invoice, item.id, item.rep, item.branch].join(' ').toLowerCase().includes(query)
      const matchesCustomer = selectedCustomer === 'All Customers' || item.customer === selectedCustomer
      const matchesStatus = selectedStatus === 'All Status' || item.status === selectedStatus
      const matchesBranch = selectedBranch === 'All Branches' || item.branch === selectedBranch

      let matchesDue = true
      if (selectedDueFilter === 'Due Today') {
        matchesDue = item.daysOverdue === 0
      } else if (selectedDueFilter === 'Overdue') {
        matchesDue = item.status === 'Overdue'
      }

      return matchesQuery && matchesCustomer && matchesStatus && matchesBranch && matchesDue
    })
  }, [receivables, searchTerm, selectedBranch, selectedCustomer, selectedDueFilter, selectedStatus])

  const selectedItem = filteredReceivables[selectedRow] || filteredReceivables[0]

  const handleReceivablesAction = (action: string) => {
    triggerAppToast(action, 'The receivables workflow has been queued for processing.')
    if (action === 'Export Excel') {
      downloadExcel('receivables-export.xlsx', filteredReceivables)
      return
    }
    if (action === '+ Record Payment') {
      setShowPayment(true)
      return
    }
  }

  const [showPayment, setShowPayment] = useState(false)

  const handlePostPayment = (payment: { amount: number; transactionId: string; accountId: string; accountName: string; paymentMethod: string; date: string; note: string }) => {
    const paymentItem = receivables.find((item) => item.id === payment.transactionId) || selectedItem
    const paymentAmount = Math.min(payment.amount, paymentItem?.balance || 0)
    const bankName = payment.accountName || 'Cash / Other'
    const updatedReceivables = state.receivables.map((record) => record.id === paymentItem?.id ? settledOpenItem(record, paymentAmount) : record)
    const source = state.receivables.find((record) => record.id === paymentItem?.id)
    const updatedSales = state.sales.map((sale) => {
      if (sale.id !== source?.sourceSaleId && sale.id !== source?.invoice && sale.id !== paymentItem?.invoice) return sale
      const amountPaid = Number(sale.amountPaid || 0) + paymentAmount
      const balance = Math.max(0, Number(sale.totalAmount || 0) - amountPaid)
      return { ...sale, amountPaid, balance, paymentStatus: balance === 0 ? 'PAID' : 'CREDIT' }
    })
    const movedCash = moveBankBalance(state.bankAccounts, state.banks, payment.accountId, bankName, paymentAmount)

    const bankTxn = {
      id: makeID('TXN'),
      date: payment.date,
      name: paymentItem?.customer || 'Customer payment',
      activity: 'Customer payment received',
      method: payment.paymentMethod,
      amount: paymentAmount,
      status: 'Completed',
      description: `Receivable payment for ${paymentItem?.invoice}${payment.note ? ` - ${payment.note}` : ''}`,
      attachments: 0,
      type: 'Deposit',
      bank: bankName,
    }
    updateState({
      receivables: updatedReceivables,
      sales: updatedSales,
      banks: movedCash.banks,
      bankAccounts: movedCash.bankAccounts,
      bankTxns: [bankTxn, ...state.bankTxns],
    })
    addAuditLog('PAYMENT', 'RECEIVABLES', paymentItem?.id || 'AR-000', `Customer payment posted to accounts receivable${payment.note ? `: ${payment.note}` : '.'}`)
    triggerAppToast('Payment Posted', `Posted ${formatCurrency(paymentAmount)} for ${paymentItem?.invoice}`)
  }

  const totalOutstanding = filteredReceivables.reduce((sum, item) => sum + item.balance, 0)
  const dueToday = filteredReceivables.filter((item) => item.daysOverdue === 0 && item.balance > 0).reduce((sum, item) => sum + item.balance, 0)
  const overdue = filteredReceivables.filter((item) => item.status === 'Overdue').reduce((sum, item) => sum + item.balance, 0)
  const collectedThisMonth = filteredReceivables.reduce((sum, item) => sum + Math.max(0, item.total - item.balance), 0)

  const summaryCards = [
    { label: 'Total Outstanding', value: formatCurrency(totalOutstanding), tone: 'warning' },
    { label: 'Due Today', value: formatCurrency(dueToday), tone: 'info' },
    { label: 'Overdue', value: formatCurrency(overdue), tone: 'critical' },
    { label: 'Collected This Month', value: formatCurrency(collectedThisMonth), tone: 'success' },
    { label: 'Outstanding Invoices', value: formatNumber(filteredReceivables.filter((item) => item.balance > 0).length), tone: 'info' },
    { label: 'Customers with Balances', value: formatNumber(new Set(filteredReceivables.filter((item) => item.balance > 0).map((item) => item.customer)).size), tone: 'info' },
  ]

  return (
    <AppLayout>
      <div className="receivables-shell">
        <div className="receivables-header">
          <div>
            <div className="pg-title">Accounts Receivable</div>
            <div className="pg-subtitle">Track customer outstanding balances, due invoices, and incoming payments.</div>
          </div>
          <div className="receivables-actions">
            <button type="button" className="receivables-btn secondary" onClick={() => handleReceivablesAction('+ Record Payment')}>+ Record Payment</button>
            <button type="button" className="receivables-btn secondary" onClick={() => handleReceivablesAction('+ New Invoice')}>+ New Invoice</button>
            <button type="button" className="receivables-btn secondary" onClick={() => handleReceivablesAction('Send Reminders')}>Send Reminders</button>
            <button type="button" className="receivables-btn secondary" onClick={() => setShowFilters((prev) => !prev)}>{showFilters ? 'Hide Filters' : 'Show Filters'}</button>
            <button type="button" className="receivables-btn secondary allow-readonly" onClick={() => handleReceivablesAction('Export Excel')}>Export Excel</button>
            <button type="button" className="receivables-btn primary" onClick={() => handleReceivablesAction('Print')}>Print</button>
          </div>
        </div>

        <div className="receivables-summary-grid">
          {summaryCards.map((card) => (
            <div className={`receivables-summary-card ${card.tone}`} key={card.label}>
              <div className="receivables-summary-label">{card.label}</div>
              <div className="receivables-summary-value">{card.value}</div>
            </div>
          ))}
        </div>

        {showFilters && (
          <div className="receivables-card">
            <div className="section-head">
              <div>
                <div className="card-title">Search & Filters</div>
                <div className="section-subtitle">Find balances, overdue invoices, and customer accounts quickly.</div>
              </div>
            </div>

            <div className="receivables-search-row">
              <div className="receivables-search-field">
                <span>🔎</span>
                <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search receivables..." />
              </div>
              <div className="receivables-chip-row">
                <span className="receivables-chip success">Auto-posted</span>
                <span className="receivables-chip">Reminder ready</span>
              </div>
            </div>

            <div className="receivables-filters-grid">
              <label>
                <span>Date Filter</span>
                <select defaultValue="This Month">
                  <option>Today</option><option>Yesterday</option><option>Last 7 Days</option><option>This Month</option><option>Last Month</option><option>Custom Date</option>
                </select>
              </label>
              <label>
                <span>Due Date Filter</span>
                <select value={selectedDueFilter} onChange={(e) => setSelectedDueFilter(e.target.value)}>
                  <option>All</option><option>Due Today</option><option>Due Tomorrow</option><option>Next 7 Days</option><option>Overdue</option><option>Custom</option>
                </select>
              </label>
              <label>
                <span>Customer</span>
                <select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)}>
                  <option>All Customers</option>
                  {customerOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span>Payment Status</span>
                <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
                  <option>All Status</option><option>Paid</option><option>Partially Paid</option><option>Unpaid</option><option>Overdue</option>
                </select>
              </label>
              <label>
                <span>Branch</span>
                <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
                  <option>All Branches</option><option>Lagos</option><option>Abuja</option><option>Enugu</option>
                </select>
              </label>
              <label>
                <span>Sales Representative</span>
                <select defaultValue="All">
                  <option>All</option><option>Peter</option><option>Mary</option><option>John</option>
                </select>
              </label>
              <label>
                <span>Amount Range</span>
                <input type="number" placeholder="Minimum" />
              </label>
            </div>
          </div>
        )}

        <div className="receivables-content-grid">
          <div className="receivables-card">
            <div className="section-head">
              <div>
                <div className="card-title">Receivables Table</div>
                <div className="section-subtitle">Showing {filteredReceivables.length} outstanding invoices.</div>
              </div>
            </div>
            <div className="receivables-table-wrap">
              <table className="receivables-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Invoice Date</th>
                    <th>Due Date</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Days Overdue</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReceivables.map((item, idx) => (
                    <tr key={item.id} onClick={() => setSelectedRow(idx)} className={selectedItem?.id === item.id ? 'selected' : ''}>
                      <td>{item.invoice}</td>
                      <td>{item.customer}</td>
                      <td>{item.invoiceDate}</td>
                      <td>{item.dueDate}</td>
                      <td>{formatCurrency(item.total)}</td>
                      <td>{formatCurrency(item.paid)}</td>
                      <td>{formatCurrency(item.balance)}</td>
                      <td>{item.daysOverdue}</td>
                      <td><span className={`receivables-pill ${item.status === 'Paid' ? 'success' : item.status === 'Partially Paid' ? 'warning' : 'danger'}`}>{item.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="receivables-side-stack">
            <div className="receivables-card">
              <div className="section-head">
                <div>
                  <div className="card-title">Customer Details</div>
                  <div className="section-subtitle">Selected customer account view.</div>
                </div>
              </div>
              <div className="receivables-detail-panel">
                <div className="receivables-detail-row"><span>Customer Name</span><strong>{selectedItem?.customer || 'Unknown Customer'}</strong></div>
                <div className="receivables-detail-row"><span>Customer ID</span><strong>—</strong></div>
                <div className="receivables-detail-row"><span>Phone</span><strong>—</strong></div>
                <div className="receivables-detail-row"><span>Email</span><strong>—</strong></div>
                <div className="receivables-detail-row"><span>Credit Limit</span><strong>—</strong></div>
                <div className="receivables-detail-row"><span>Available Credit</span><strong>—</strong></div>
              </div>
            </div>

            <div className="receivables-card">
              <div className="section-head">
                <div>
                  <div className="card-title">Credit Control Panel</div>
                  <div className="section-subtitle">Watch exposures and account risk.</div>
                </div>
              </div>
              <div className="receivables-detail-panel">
                <div className="receivables-detail-row"><span>Credit Limit</span><strong>—</strong></div>
                <div className="receivables-detail-row"><span>Outstanding</span><strong>{formatCurrency(selectedItem?.balance ?? 0)}</strong></div>
                <div className="receivables-detail-row"><span>Available Credit</span><strong>—</strong></div>
                <div className="receivables-detail-row"><span>Credit Status</span><strong>—</strong></div>
              </div>
            </div>

            <div className="receivables-card">
              <div className="section-head">
                <div>
                  <div className="card-title">Collection Reminders</div>
                  <div className="section-subtitle">Reminder and follow-up workflow.</div>
                </div>
              </div>
              <div className="receivables-alert-list">
                <div className="receivables-alert warning">No reminder activity yet.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <PaymentModal open={showPayment} onClose={() => setShowPayment(false)} onConfirm={handlePostPayment} records={filteredReceivables} selectedRecordId={selectedItem?.id} selectedItem={selectedItem} recordLabel="Receivable transaction being paid" accountLabel="Paid to account" bankAccounts={state.bankAccounts} defaultAmount={selectedItem?.balance || 0} title="Record Receivable Payment" />
    </AppLayout>
  )
}
