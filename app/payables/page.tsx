'use client'

import { useMemo, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting } from '@/lib/context'
import { displayOpenBalance, moveBankBalance, settledOpenItem } from '@/lib/open-item-payment'
import { formatCurrency, formatNumber, triggerAppToast, makeID } from '@/lib/utils'
import { downloadExcel } from '@/lib/export-utils'
import PaymentModal from '@/components/modals/PaymentModal'


export default function PayablesPage() {
  const { state, addAuditLog, updateState } = useAccounting()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState('All Suppliers')
  const [selectedStatus, setSelectedStatus] = useState('All Status')
  const [selectedDueFilter, setSelectedDueFilter] = useState('All')
  const [selectedBranch, setSelectedBranch] = useState('All Branches')
  const [selectedRow, setSelectedRow] = useState(0)
  const [showFilters, setShowFilters] = useState(false)

  const supplierOptions = useMemo(() => {
    const suppliers = Array.from(new Set(state.payables.map((item) => item.supplier || item.name).filter(Boolean)))
    return suppliers.length > 0 ? suppliers : []
  }, [state.payables])

  const payables = useMemo(() => {
    return state.payables.map((item, idx) => ({
      id: item.id || `BILL-${idx + 1}`,
      supplier: item.supplier || item.name,
      invoiceNumber: item.invoice_number || item.invoiceNumber || item.invoice || `INV-${1000 + idx}`,
      purchaseRef: item.reference || item.purchaseRef || `PUR-${1000 + idx}`,
      invoiceDate: item.purchase_date || item.invoiceDate || '2026-07-21',
      dueDate: item.due_date || item.due || item.dueDate || '2026-07-31',
      total: item.amount || item.total || 0,
      paid: item.amount_paid ?? item.amountPaid ?? item.paid ?? 0,
      balance: displayOpenBalance(item),
      status: item.status || 'Unpaid',
      daysOverdue: item.daysOverdue || 0,
      branch: item.branch || 'Lagos',
    }))
  }, [state.payables])

  const filteredPayables = useMemo(() => {
    const query = searchTerm.toLowerCase()

    return payables.filter((item) => {
      const matchesQuery = !query || [item.supplier, item.id, item.invoiceNumber, item.purchaseRef].join(' ').toLowerCase().includes(query)
      const matchesSupplier = selectedSupplier === 'All Suppliers' || item.supplier === selectedSupplier
      const matchesStatus = selectedStatus === 'All Status' || item.status === selectedStatus
      const matchesBranch = selectedBranch === 'All Branches' || item.branch === selectedBranch

      let matchesDue = true
      if (selectedDueFilter === 'Due Today') {
        matchesDue = item.daysOverdue === 0
      } else if (selectedDueFilter === 'Overdue') {
        matchesDue = item.status === 'Overdue'
      }

      return matchesQuery && matchesSupplier && matchesStatus && matchesBranch && matchesDue
    })
  }, [payables, searchTerm, selectedBranch, selectedDueFilter, selectedStatus, selectedSupplier])

  const selectedItem = filteredPayables[selectedRow] || filteredPayables[0]

  const handlePayablesAction = (action: string) => {
    triggerAppToast(action, 'The payables workflow has been queued for processing.')
    if (action === 'Export Excel') {
      downloadExcel('payables-export.xlsx', filteredPayables)
    }
    if (action === '+ Record Payment') {
      setShowPayment(true)
    }
  }

  const [showPayment, setShowPayment] = useState(false)

  const handlePostPayment = (payment: { amount: number; transactionId: string; accountId: string; accountName: string; paymentMethod: string; date: string; note: string }) => {
    const paymentItem = payables.find((item) => item.id === payment.transactionId) || selectedItem
    const paymentAmount = Math.min(payment.amount, paymentItem?.balance || 0)
    const bankName = payment.accountName || 'Cash / Other'
    const updatedPayables = state.payables.map((record) => record.id === paymentItem?.id ? settledOpenItem(record, paymentAmount) : record)
    const updatedPurchases = state.purchases.map((purchase) => {
      if (purchase.id !== paymentItem?.id && purchase.id !== paymentItem?.purchaseRef) return purchase
      const amountPaid = Number(purchase.amountPaid || 0) + paymentAmount
      const balance = Math.max(0, Number(purchase.total || 0) - amountPaid)
      return { ...purchase, amountPaid, balance, paymentStatus: balance === 0 ? 'PAID' : 'PARTIAL' }
    })
    const movedCash = moveBankBalance(state.bankAccounts, state.banks, payment.accountId, bankName, -paymentAmount)

    const bankTxn = {
      id: makeID('TXN'),
      date: payment.date,
      name: paymentItem?.supplier || 'Supplier payment',
      activity: 'Supplier payment',
      method: payment.paymentMethod,
      amount: -paymentAmount,
      status: 'Completed',
      description: `Payable payment for ${paymentItem?.invoiceNumber || paymentItem?.id}${payment.note ? ` - ${payment.note}` : ''}`,
      attachments: 0,
      type: 'Withdrawal',
      bank: bankName,
    }
    updateState({
      payables: updatedPayables,
      purchases: updatedPurchases,
      banks: movedCash.banks,
      bankAccounts: movedCash.bankAccounts,
      bankTxns: [bankTxn, ...state.bankTxns],
    })
    addAuditLog('PAYMENT', 'PAYABLES', paymentItem?.id || 'BILL-000', `Supplier payment posted to accounts payable${payment.note ? `: ${payment.note}` : '.'}`)
    triggerAppToast('Payment Posted', `Posted ${formatCurrency(paymentAmount)} for ${paymentItem?.id}`)
  }

  const totalOutstanding = filteredPayables.reduce((sum, item) => sum + item.balance, 0)
  const dueToday = filteredPayables.filter((item) => item.daysOverdue === 0 && item.balance > 0).reduce((sum, item) => sum + item.balance, 0)
  const overdue = filteredPayables.filter((item) => item.status === 'Overdue').reduce((sum, item) => sum + item.balance, 0)
  const paidThisMonth = filteredPayables.reduce((sum, item) => sum + Math.max(0, item.total - item.balance), 0)

  const summaryCards = [
    { label: 'Total Outstanding', value: formatCurrency(totalOutstanding), tone: 'warning' },
    { label: 'Due Today', value: formatCurrency(dueToday), tone: 'info' },
    { label: 'Overdue Bills', value: formatCurrency(overdue), tone: 'critical' },
    { label: 'Paid This Month', value: formatCurrency(paidThisMonth), tone: 'success' },
    { label: 'Outstanding Bills', value: formatNumber(filteredPayables.filter((item) => item.balance > 0).length), tone: 'info' },
    { label: 'Active Suppliers', value: formatNumber(new Set(filteredPayables.filter((item) => item.balance > 0).map((item) => item.supplier)).size), tone: 'info' },
  ]

  return (
    <AppLayout>
      <div className="payables-shell">
        <div className="payables-header">
          <div>
            <div className="pg-title">Accounts Payable</div>
            <div className="pg-subtitle">Manage supplier invoices, outstanding bills, due payments, and vendor balances.</div>
          </div>
          <div className="payables-actions">
            <button type="button" className="payables-btn secondary" onClick={() => handlePayablesAction('+ Record Payment')}>+ Record Payment</button>
            <button type="button" className="payables-btn secondary" onClick={() => handlePayablesAction('+ New Supplier Bill')}>+ New Supplier Bill</button>
            <button type="button" className="payables-btn secondary" onClick={() => handlePayablesAction('Schedule Payment')}>Schedule Payment</button>
            <button type="button" className="payables-btn secondary" onClick={() => setShowFilters((prev) => !prev)}>{showFilters ? 'Hide Filters' : 'Show Filters'}</button>
            <button type="button" className="payables-btn secondary allow-readonly" onClick={() => handlePayablesAction('Export Excel')}>Export Excel</button>
            <button type="button" className="payables-btn primary" onClick={() => handlePayablesAction('Print')}>Print</button>
          </div>
        </div>

        <div className="payables-summary-grid">
          {summaryCards.map((card) => (
            <div className={`payables-summary-card ${card.tone}`} key={card.label}>
              <div className="payables-summary-label">{card.label}</div>
              <div className="payables-summary-value">{card.value}</div>
            </div>
          ))}
        </div>

        {showFilters && (
          <div className="payables-card">
            <div className="section-head">
              <div>
                <div className="card-title">Search & Filters</div>
                <div className="section-subtitle">Track suppliers, overdue payments, and upcoming due dates.</div>
              </div>
            </div>

            <div className="payables-search-row">
              <div className="payables-search-field">
                <span>🔎</span>
                <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search supplier bills..." />
              </div>
              <div className="payables-chip-row">
                <span className="payables-chip success">Approval ready</span>
                <span className="payables-chip">Cash forecasting</span>
              </div>
            </div>

            <div className="payables-filters-grid">
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
                <span>Supplier</span>
                <select value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)}>
                  <option>All Suppliers</option>
                  {supplierOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span>Payment Status</span>
                <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
                  <option>All Status</option><option>Paid</option><option>Partially Paid</option><option>Unpaid</option><option>Overdue</option>
                </select>
              </label>
              <label>
                <span>Purchase Status</span>
                <select defaultValue="Received">
                  <option>Received</option><option>Pending</option><option>Cancelled</option><option>Returned</option>
                </select>
              </label>
              <label>
                <span>Branch</span>
                <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
                  <option>All Branches</option><option>Lagos</option><option>Enugu</option><option>Abuja</option>
                </select>
              </label>
              <label>
                <span>Amount Filter</span>
                <input type="number" placeholder="Maximum" />
              </label>
            </div>
          </div>
        )}

        <div className="payables-content-grid">
          <div className="payables-card">
            <div className="section-head">
              <div>
                <div className="card-title">Payables Table</div>
                <div className="section-subtitle">Showing {filteredPayables.length} supplier bills.</div>
              </div>
            </div>
            <div className="payables-table-wrap">
              <table className="payables-table">
                <thead>
                  <tr>
                    <th>Invoice No</th>
                    <th>Supplier</th>
                    <th>Purchase Ref</th>
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
                  {filteredPayables.map((item, idx) => (
                    <tr key={item.id} onClick={() => setSelectedRow(idx)} className={selectedItem?.id === item.id ? 'selected' : ''}>
                      <td>{item.invoiceNumber}</td>
                      <td>{item.supplier}</td>
                      <td>{item.purchaseRef}</td>
                      <td>{item.invoiceDate}</td>
                      <td>{item.dueDate}</td>
                      <td>{formatCurrency(item.total)}</td>
                      <td>{formatCurrency(item.paid)}</td>
                      <td>{formatCurrency(item.balance)}</td>
                      <td>{item.daysOverdue}</td>
                      <td><span className={`payables-pill ${item.status === 'Paid' ? 'success' : item.status === 'Partially Paid' ? 'warning' : 'danger'}`}>{item.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="payables-side-stack">
            <div className="payables-card">
              <div className="section-head">
                <div>
                  <div className="card-title">Supplier Details</div>
                  <div className="section-subtitle">Selected supplier account view.</div>
                </div>
              </div>
              <div className="payables-detail-panel">
                <div className="payables-detail-row"><span>Supplier Name</span><strong>{selectedItem?.supplier || 'Unknown Supplier'}</strong></div>
                <div className="payables-detail-row"><span>Supplier ID</span><strong>—</strong></div>
                <div className="payables-detail-row"><span>Phone</span><strong>—</strong></div>
                <div className="payables-detail-row"><span>Email</span><strong>—</strong></div>
                <div className="payables-detail-row"><span>Payment Terms</span><strong>—</strong></div>
                <div className="payables-detail-row"><span>Credit Limit</span><strong>—</strong></div>
              </div>
            </div>

            <div className="payables-card">
              <div className="section-head">
                <div>
                  <div className="card-title">Supplier Credit Panel</div>
                  <div className="section-subtitle">Credit exposure and payment risk.</div>
                </div>
              </div>
              <div className="payables-detail-panel">
                <div className="payables-detail-row"><span>Credit Limit</span><strong>—</strong></div>
                <div className="payables-detail-row"><span>Outstanding</span><strong>{formatCurrency(selectedItem?.balance || 0)}</strong></div>
                <div className="payables-detail-row"><span>Available Credit</span><strong>—</strong></div>
                <div className="payables-detail-row"><span>Payment Terms</span><strong>—</strong></div>
              </div>
            </div>

            <div className="payables-card">
              <div className="section-head">
                <div>
                  <div className="card-title">Scheduled Payments</div>
                  <div className="section-subtitle">Upcoming bills and payment prioritization.</div>
                </div>
              </div>
              <div className="payables-alert-list">
                <div className="payables-alert warning">No scheduled payments yet.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <PaymentModal open={showPayment} onClose={() => setShowPayment(false)} onConfirm={handlePostPayment} records={filteredPayables} selectedRecordId={selectedItem?.id} selectedItem={selectedItem} recordLabel="Payable transaction being paid" bankAccounts={state.bankAccounts} defaultAmount={selectedItem?.balance || 0} title="Record Payable Payment" />
    </AppLayout>
  )
}
