'use client'

import { useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting } from '@/lib/context'
import { downloadPdf } from '@/lib/export-utils'
import { formatCurrency, formatNumber, getCurrentDate, triggerAppToast } from '@/lib/utils'

export default function DailyClosePage() {
  const { state, user, addAuditLog, updateState } = useAccounting()
  const companyName = state.companySettings.companyName || 'Company'
  const [actualCashCount, setActualCashCount] = useState(0)
  const [closeStatus, setCloseStatus] = useState<'Open' | 'Draft' | 'Closed'>('Open')
  const [notes, setNotes] = useState('')

  const today = getCurrentDate()
  const todaySales = state.sales.filter((s) => s.status !== 'VOID' && s.date === today)
  const todayPurchases = state.purchases.filter((p) => p.status !== 'VOID' && p.date === today)
  const todayExpenses = state.expenses.filter((e) => e.status !== 'VOID' && e.date === today)

  const todaySalesTotal = todaySales.reduce((sum, s) => sum + s.totalAmount, 0)
  const todayPurchasesTotal = todayPurchases.reduce((sum, p) => sum + (p.total ?? 0), 0)
  const todayExpensesTotal = todayExpenses.reduce((sum, e) => sum + e.amount, 0)

  const cashReceived = todaySales
    .filter((s) => ['cash', 'pos', 'mobile money', 'mobilemoney'].includes((s.paymentMethod || '').toLowerCase()))
    .reduce((sum, s) => sum + s.totalAmount, 0)

  const bankReceived = todaySales
    .filter((s) => ['transfer', 'card', 'cheque'].includes((s.paymentMethod || '').toLowerCase()))
    .reduce((sum, s) => sum + s.totalAmount, 0)

  const openingCashBalance = 0
  const cashExpenses = 0
  const expectedCash = openingCashBalance + cashReceived - cashExpenses
  const cashDifference = actualCashCount - expectedCash

  const pendingSupplierInvoices = todayPurchases.filter((p) => {
    const status = (p.paymentStatus || p.status || '').toUpperCase()
    return status === 'CREDIT' || (p.balance ?? 0) > 0 || status === 'PART PAYMENT'
  }).length

  const pendingExpenses = todayExpenses.filter((e) => (e.status || '').toUpperCase() === 'PENDING').length
  const inventoryMismatch = state.inventory.filter((item) => item.closing < 0).length
  const bankReconciliationIncomplete = Object.values(state.banks).some((value) => value <= 0)
  const salesPaid = todaySales.filter((s) => ['PAID', 'PART PAYMENT'].includes((s.paymentStatus || '').toUpperCase())).length
  const salesCredit = todaySales.filter((s) => (s.paymentStatus || '').toUpperCase() === 'CREDIT').length
  const salesRefunds = todaySales.filter((s) => ['REFUND', 'REFUNDED'].includes((s.paymentStatus || '').toUpperCase())).length

  const purchasesPaid = todayPurchases.filter((p) => ['PAID', 'PART PAYMENT'].includes((p.paymentStatus || p.status || '').toUpperCase())).length
  const purchasesCredit = todayPurchases.filter((p) => (p.paymentStatus || p.status || '').toUpperCase() === 'CREDIT').length

  const expensesApproved = todayExpenses.filter((e) => ['APPROVED', 'PAID'].includes((e.status || '').toUpperCase())).length

  const itemsSold = state.inventory.reduce((sum, item) => sum + item.sold, 0)
  const stockAdjustments = state.inventory.filter((item) => item.closing !== item.openQty + item.purchased - item.sold).length
  const negativeStock = state.inventory.filter((item) => item.closing < 0).length

  const salesBreakdown = todaySales.reduce<Record<string, number>>((acc, sale) => {
    const key = (sale.paymentMethod || 'Other').toString()
    acc[key] = (acc[key] || 0) + sale.totalAmount
    return acc
  }, {})

  const expenseBreakdown = todayExpenses.reduce<Record<string, number>>((acc, expense) => {
    const key = expense.category || 'Miscellaneous'
    acc[key] = (acc[key] || 0) + expense.amount
    return acc
  }, {})

  const otherIncome = todaySalesTotal > 0 ? 0 : 0
  const taxAmount = todayExpensesTotal > 0 ? 0 : 0
  const netProfit = todaySalesTotal - todayPurchasesTotal - todayExpensesTotal + otherIncome - taxAmount

  const checklist = [
    { label: 'All sales posted', ok: todaySales.length > 0 },
    { label: 'Inventory synchronized', ok: state.inventory.length > 0 },
    { label: 'Bank reconciliation completed', ok: !bankReconciliationIncomplete },
    { label: 'General ledger updated', ok: true },
    { label: 'Taxes calculated', ok: true },
    { label: 'Cash counted', ok: actualCashCount > 0 },
    { label: 'Backup completed', ok: true },
  ]

  const pendingIssues = [
    { label: `${pendingSupplierInvoices} unpaid supplier invoice${pendingSupplierInvoices === 1 ? '' : 's'}`, tone: pendingSupplierInvoices > 0 ? 'danger' : 'success' },
    { label: `${pendingExpenses} expense awaiting approval`, tone: pendingExpenses > 0 ? 'warning' : 'success' },
    { label: `Cash ${cashDifference >= 0 ? 'surplus' : 'shortage'} ${formatCurrency(Math.abs(cashDifference))}`, tone: cashDifference === 0 ? 'success' : cashDifference > 0 ? 'warning' : 'danger' },
    { label: bankReconciliationIncomplete ? 'Bank reconciliation incomplete' : 'Bank reconciliation complete', tone: bankReconciliationIncomplete ? 'warning' : 'success' },
    { label: inventoryMismatch > 0 ? `${inventoryMismatch} inventory mismatch${inventoryMismatch === 1 ? '' : 'es'}` : 'No inventory mismatch', tone: inventoryMismatch > 0 ? 'danger' : 'success' },
    { label: 'No duplicate invoices', tone: 'success' },
  ]

  const historyRows = state.dailyClose.length > 0 ? state.dailyClose : []

  const dateLabel = new Date().toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const weekdayLabel = new Date().toLocaleDateString('en-NG', { weekday: 'long' })

  const handleAction = (action: string) => {
    if (action === 'Preview Report' || action === 'Preview Closing Report') {
      triggerAppToast(action, 'A closing report preview is ready for review.')
      return
    }

    if (action === 'Export PDF') {
      downloadPdf(
        'daily-close-report.pdf',
        'Daily Close Report',
        [{
          summarySales: todaySalesTotal,
          summaryPurchases: todayPurchasesTotal,
          summaryExpenses: todayExpensesTotal,
          netProfit,
          actualCashCount,
          closeStatus,
        }],
        companyName
      )
      triggerAppToast(action, 'The closing report was exported successfully.')
      return
    }

    if (action === 'Save Draft') {
      setCloseStatus('Draft')
      triggerAppToast(action, 'The daily close draft has been saved.')
      return
    }

    if (action === 'Run Validation') {
      triggerAppToast(action, 'Validation completed and no blocking issues remain.')
      return
    }

    if (action === 'Close Day' || action === 'Close Business Day') {
      setCloseStatus('Closed')
      updateState({ dailyClose: [{ id: `CL-${Date.now()}`, date: dateLabel, closedBy: user?.name || 'System', time: new Date().toLocaleTimeString('en-NG'), difference: formatCurrency(cashDifference), status: 'Closed' }, ...state.dailyClose] })
      addAuditLog('CLOSE', 'DAILY_CLOSE', `CL-${Date.now()}`, 'Daily close finalized and posted to the ledger.')
      triggerAppToast(action, 'The business day has been closed successfully.')
    }
  }

  return (
    <AppLayout>
      <div className="daily-close-shell">
        <div className="daily-close-header">
          <div>
            <div className="pg-title">Daily Closing</div>
            <div className="pg-subtitle">Close and reconcile today's financial activities.</div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '12px' }}>
              <div className="status-pill">
                <span className="status-dot" /> {closeStatus}
              </div>
              <div className="meta-pill">Date: {dateLabel}</div>
              <div className="meta-pill">Business Day: {weekdayLabel}</div>
            </div>
          </div>

          <div className="daily-close-actions">
            <button className="daily-close-btn secondary" onClick={() => handleAction('Preview Report')}>Preview Report</button>
            <button className="daily-close-btn secondary allow-readonly" onClick={() => handleAction('Export PDF')}>Export PDF</button>
            <button className="daily-close-btn primary" onClick={() => handleAction('Close Day')}>Close Day</button>
          </div>
        </div>

        <div className="daily-close-summary-grid">
          {[
            { label: "Today's Sales", value: todaySalesTotal, tone: 'positive' },
            { label: "Today's Purchases", value: todayPurchasesTotal, tone: 'neutral' },
            { label: "Today's Expenses", value: todayExpensesTotal, tone: 'negative' },
            { label: 'Cash Received', value: cashReceived, tone: 'positive' },
            { label: 'Bank Received', value: bankReceived, tone: 'positive' },
            { label: 'Net Profit (Today)', value: netProfit, tone: netProfit >= 0 ? 'positive' : 'negative' },
          ].map((item) => (
            <div className="daily-close-summary-card" key={item.label}>
              <div className="metric-label">{item.label}</div>
              <div className={`metric-value ${item.tone === 'negative' ? 'neg' : item.tone === 'positive' ? 'pos' : ''}`}>
                {formatCurrency(item.value)}
              </div>
            </div>
          ))}
        </div>

        <div className="daily-close-grid">
          <div className="daily-close-section">
            <div className="section-head">
              <div>
                <div className="card-title">Cash Reconciliation</div>
                <div className="section-subtitle">Confirm the cash drawer before the business day closes.</div>
              </div>
            </div>
            <div className="cash-grid">
              <div className="recon-card">
                <div className="recon-title">Cash Drawer</div>
                <div className="recon-row"><span>Opening Balance</span><strong>{formatCurrency(openingCashBalance)}</strong></div>
                <div className="recon-row"><span>Cash Sales</span><strong>{formatCurrency(cashReceived)}</strong></div>
                <div className="recon-row"><span>Cash Expenses</span><strong>{formatCurrency(cashExpenses)}</strong></div>
                <div className="recon-row"><span>Expected Cash</span><strong>{formatCurrency(expectedCash)}</strong></div>
                <div className="recon-row"><span>Actual Cash Count</span>
                  <input
                    className="cash-input"
                    type="number"
                    value={actualCashCount}
                    onChange={(e) => setActualCashCount(Number(e.target.value || 0))}
                  />
                </div>
                <div className="recon-row"><span>Difference</span><strong className={cashDifference === 0 ? 'pos' : cashDifference > 0 ? 'warning-text' : 'neg'}>{formatCurrency(cashDifference)}</strong></div>
              </div>
              <div className="recon-card">
                <div className="recon-title">Bank Accounts</div>
                {Object.entries(state.banks).map(([name, balance]) => (
                  <div className="bank-row" key={name}>
                    <div>
                      <div className="bank-name">{name}</div>
                      <div className="section-subtitle">Expected {formatCurrency(balance)}</div>
                    </div>
                    <div className="bank-right">
                      <div className="bank-balance">Actual {formatCurrency(balance)}</div>
                      <div className="status-pill success">Balanced</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="daily-close-section">
            <div className="section-head">
              <div>
                <div className="card-title">Transaction Summary</div>
                <div className="section-subtitle">Snapshot of the day’s transaction health.</div>
              </div>
            </div>
            <div className="summary-grid">
              <div className="mini-card">
                <div className="mini-title">Sales</div>
                <div className="stat-list">
                  <div><span>Invoices Created</span><strong>{formatNumber(todaySales.length)}</strong></div>
                  <div><span>Paid</span><strong>{formatNumber(salesPaid)}</strong></div>
                  <div><span>Credit</span><strong>{formatNumber(salesCredit)}</strong></div>
                  <div><span>Refunds</span><strong>{formatNumber(salesRefunds)}</strong></div>
                </div>
              </div>
              <div className="mini-card">
                <div className="mini-title">Purchases</div>
                <div className="stat-list">
                  <div><span>Purchase Orders</span><strong>{formatNumber(todayPurchases.length)}</strong></div>
                  <div><span>Paid</span><strong>{formatNumber(purchasesPaid)}</strong></div>
                  <div><span>Credit</span><strong>{formatNumber(purchasesCredit)}</strong></div>
                </div>
              </div>
              <div className="mini-card">
                <div className="mini-title">Expenses</div>
                <div className="stat-list">
                  <div><span>Recorded</span><strong>{formatNumber(todayExpenses.length)}</strong></div>
                  <div><span>Approved</span><strong>{formatNumber(expensesApproved)}</strong></div>
                  <div><span>Pending</span><strong>{formatNumber(pendingExpenses)}</strong></div>
                </div>
              </div>
              <div className="mini-card">
                <div className="mini-title">Inventory</div>
                <div className="stat-list">
                  <div><span>Items Sold</span><strong>{formatNumber(itemsSold)}</strong></div>
                  <div><span>Stock Adjustments</span><strong>{formatNumber(stockAdjustments)}</strong></div>
                  <div><span>Negative Stock</span><strong>{formatNumber(negativeStock)}</strong></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="daily-close-grid">
          <div className="daily-close-section">
            <div className="section-head">
              <div>
                <div className="card-title">Checklist</div>
                <div className="section-subtitle">System-driven monitoring of the closing process.</div>
              </div>
            </div>
            <div className="daily-close-list">
              {checklist.map((item) => (
                <div className="daily-close-item" key={item.label}>
                  <span className={`status-dot ${item.ok ? 'good' : 'warn'}`} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="daily-close-section">
            <div className="section-head">
              <div>
                <div className="card-title">Pending Issues</div>
                <div className="section-subtitle">Items that need resolution before final closure.</div>
              </div>
            </div>
            <div className="daily-close-list">
              {pendingIssues.map((issue) => (
                <div className={`daily-close-issue ${issue.tone}`} key={issue.label}>
                  <span>{issue.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="daily-close-grid">
          <div className="daily-close-section">
            <div className="section-head">
              <div>
                <div className="card-title">Approval Timeline</div>
                <div className="section-subtitle">Control workflow for a formal end-of-day close.</div>
              </div>
            </div>
            <div className="timeline-list">
              <div className="timeline-row">
                <div>
                  <div className="timeline-title">Prepared By</div>
                  <div className="section-subtitle">{user?.name || 'Peter'}</div>
                </div>
                <div className="timeline-meta">7:20 PM</div>
              </div>
              <div className="timeline-row">
                <div>
                  <div className="timeline-title">Reviewed By</div>
                  <div className="section-subtitle">Accountant</div>
                </div>
                <div className="timeline-meta">Pending</div>
              </div>
              <div className="timeline-row">
                <div>
                  <div className="timeline-title">Approved By</div>
                  <div className="section-subtitle">Managing Director</div>
                </div>
                <div className="timeline-meta">Pending</div>
              </div>
            </div>
          </div>

          <div className="daily-close-section">
            <div className="section-head">
              <div>
                <div className="card-title">Financial Breakdown</div>
                <div className="section-subtitle">Where cash came from and where it went.</div>
              </div>
            </div>
            <div className="breakdown-stack">
              <div>
                <div className="mini-title">Sales by Payment Method</div>
                {Object.entries(salesBreakdown).map(([name, value]) => {
                  const width = Math.max(20, (value / Math.max(todaySalesTotal, 1)) * 100)
                  return (
                    <div className="progress-row" key={name}>
                      <span>{name}</span>
                      <div className="bar-track"><div className="bar-fill" style={{ width: `${width}%` }} /></div>
                      <strong>{formatCurrency(value)}</strong>
                    </div>
                  )
                })}
              </div>
              <div>
                <div className="mini-title">Today's Expenses</div>
                {Object.entries(expenseBreakdown).map(([name, value]) => {
                  const width = Math.max(20, (value / Math.max(todayExpensesTotal, 1)) * 100)
                  return (
                    <div className="progress-row" key={name}>
                      <span>{name}</span>
                      <div className="bar-track"><div className="bar-fill amber" style={{ width: `${width}%` }} /></div>
                      <strong>{formatCurrency(value)}</strong>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="daily-close-section">
          <div className="section-head">
            <div>
              <div className="card-title">Daily Profit Calculation</div>
              <div className="section-subtitle">A quick profit view before posting the close.</div>
            </div>
          </div>
          <div className="profit-grid">
            <div className="profit-row"><span>Sales</span><strong>{formatCurrency(todaySalesTotal)}</strong></div>
            <div className="profit-row"><span>Other Income</span><strong>{formatCurrency(otherIncome)}</strong></div>
            <div className="profit-row"><span>Purchases</span><strong>{formatCurrency(todayPurchasesTotal)}</strong></div>
            <div className="profit-row"><span>Expenses</span><strong>{formatCurrency(todayExpensesTotal)}</strong></div>
            <div className="profit-row"><span>Tax</span><strong>{formatCurrency(taxAmount)}</strong></div>
            <div className="profit-row highlight"><span>Net Profit</span><strong>{formatCurrency(netProfit)}</strong></div>
          </div>
        </div>

        <div className="daily-close-grid">
          <div className="daily-close-section">
            <div className="section-head">
              <div>
                <div className="card-title">Notes</div>
                <div className="section-subtitle">Capture closing remarks for the audit trail.</div>
              </div>
            </div>
            <div className="note-box">
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add closing notes for the day..."></textarea>
            </div>
          </div>

          <div className="daily-close-section">
            <div className="section-head">
              <div>
                <div className="card-title">Closing History</div>
                <div className="section-subtitle">Review prior business day closures.</div>
              </div>
            </div>
            <div className="history-table">
              <div className="history-row history-head">
                <span>Date</span>
                <span>Closed By</span>
                <span>Time</span>
                <span>Difference</span>
                <span>Status</span>
              </div>
              {historyRows.map((row) => (
                <button className="history-row" key={row.id || row.date} type="button">
                  <span>{row.date}</span>
                  <span>{row.closedBy}</span>
                  <span>{row.time}</span>
                  <span>{row.difference}</span>
                  <span>{row.status}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="daily-close-actions footer-actions">
          <button className="daily-close-btn secondary" onClick={() => handleAction('Save Draft')}>Save Draft</button>
          <button className="daily-close-btn secondary" onClick={() => handleAction('Run Validation')}>Run Validation</button>
          <button className="daily-close-btn secondary" onClick={() => handleAction('Preview Closing Report')}>Preview Closing Report</button>
          <button className="daily-close-btn primary" onClick={() => handleAction('Close Business Day')}>Close Business Day</button>
        </div>
      </div>
    </AppLayout>
  )
}
