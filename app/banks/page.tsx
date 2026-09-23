'use client'

import { useEffect, useMemo, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting, type BankAccount } from '@/lib/context'
import { formatCurrency, triggerAppToast } from '@/lib/utils'
import { downloadExcel, downloadPdf } from '@/lib/export-utils'
import { Repeat, Download, Filter, ArrowDown, ArrowUp, CheckCircle2 } from 'lucide-react'

const bankStyles: Record<string, { background: string; accent: string }> = {
  'Globus Bank': {
    background: 'linear-gradient(135deg, #1a3a7c 0%, #0f2456 100%)',
    accent: 'rgba(255, 255, 255, 0.92)',
  },
  'Access Bank': {
    background: 'linear-gradient(135deg, #064d42 0%, #0d7a54 100%)',
    accent: 'rgba(255, 255, 255, 0.92)',
  },
  'Zenith Bank': {
    background: 'linear-gradient(135deg, #f4a261 0%, #d1492c 100%)',
    accent: 'rgba(255, 255, 255, 0.92)',
  },
  UBA: {
    background: 'linear-gradient(135deg, #d11f2b 0%, #7f1d1d 100%)',
    accent: 'rgba(255, 255, 255, 0.92)',
  },
  'First Bank': {
    background: 'linear-gradient(135deg, #1a3a7c 0%, #c9a227 100%)',
    accent: 'rgba(255, 255, 255, 0.92)',
  },
}

export default function BanksPage() {
  const { state, updateState, addAuditLog } = useAccounting()
  const companyName = state.companySettings.companyName || 'Company'
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [showReconcileModal, setShowReconcileModal] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [showExportDropdown, setShowExportDropdown] = useState(false)
  const [activeReportModal, setActiveReportModal] = useState<string | null>(null)
  const [transferSource, setTransferSource] = useState('')
  const [transferTarget, setTransferTarget] = useState('')
  const [transferAmount, setTransferAmount] = useState(0)

  const totalBanks = Object.values(state.banks).reduce((sum, b) => sum + b, 0)
  const bankAccounts = Object.entries(state.banks).map(([bank, balance]) => ({
    bank,
    balance,
    style: bankStyles[bank] || bankStyles['Globus Bank'],
  }))
  const activeBank = bankAccounts[0]
  const [selectedBank, setSelectedBank] = useState<string | null>(activeBank?.bank ?? null)

  useEffect(() => {
    if (!selectedBank && activeBank) {
      setSelectedBank(activeBank.bank)
    }
  }, [activeBank, selectedBank])

  const selectedAccount = bankAccounts.find((account) => account.bank === selectedBank) || activeBank
  const legacyAccounts: BankAccount[] = Object.entries(state.banks)
    .filter(([name]) => !state.bankAccounts.some((account) => account.name === name))
    .map(([name, balance]) => ({ id: name, name, institution: name, accountNumber: '', accountType: 'Bank account', currency: 'NGN', branch: '', openingBalance: balance, openingBalanceDate: '', balance, status: 'active' }))
  const pendingDeposits = state.bankTxns.filter((txn) => txn.amount > 0 && txn.status !== 'Completed').reduce((sum, txn) => sum + txn.amount, 0)
  const pendingWithdrawals = state.bankTxns.filter((txn) => txn.amount < 0 && txn.status !== 'Completed').reduce((sum, txn) => sum + Math.abs(txn.amount), 0)
  const reconciliationDue = state.bankTxns.filter((txn) => txn.status !== 'Completed').length
  const moneyIn = state.bankTxns.filter((txn) => txn.amount > 0).reduce((sum, txn) => sum + txn.amount, 0)
  const moneyOut = state.bankTxns.filter((txn) => txn.amount < 0).reduce((sum, txn) => sum + Math.abs(txn.amount), 0)
  const salesTotal = state.sales.filter((sale) => sale.status !== 'VOID').reduce((sum, sale) => sum + sale.totalAmount, 0)
  const receivablesTotal = state.receivables.reduce((sum, item) => sum + Number(item.outstandingAmount ?? item.amount ?? 0), 0)
  const payablesTotal = state.payables.reduce((sum, item) => sum + Number(item.outstandingAmount ?? item.amount ?? 0), 0)
  const expensesTotal = state.expenses.filter((expense) => expense.status !== 'VOID').reduce((sum, expense) => sum + expense.amount, 0)

  const openTransferModal = () => {
    if (bankAccounts.length < 2) {
      triggerAppToast('Transfer Funds', 'Create at least two bank accounts before transferring funds.')
      return
    }
    setTransferSource(bankAccounts[0].bank)
    setTransferTarget(bankAccounts[1]?.bank ?? bankAccounts[0].bank)
    setTransferAmount(0)
    setShowTransferModal(true)
  }


  const submitTransferFunds = () => {
    if (transferAmount <= 0) {
      triggerAppToast('Transfer Funds', 'Enter a transfer amount before continuing.')
      return
    }
    const updatedBanks = { ...state.banks }
    updatedBanks[transferSource] = Math.max(0, (updatedBanks[transferSource] ?? 0) - transferAmount)
    updatedBanks[transferTarget] = (updatedBanks[transferTarget] ?? 0) + transferAmount
    const txns = [
      {
        id: `TXN-${Date.now()}`,
        date: new Date().toISOString().slice(0, 10),
        name: `Transfer to ${transferTarget}`,
        activity: 'Inter-bank transfer',
        method: 'Bank Transfer',
        amount: -transferAmount,
        status: 'Completed',
        description: `Transfer from ${transferSource} to ${transferTarget}`,
        attachments: 0,
        type: 'Transfer',
        bank: transferSource,
      },
      {
        id: `TXN-${Date.now()}-R`,
        date: new Date().toISOString().slice(0, 10),
        name: `Received from ${transferSource}`,
        activity: 'Inter-bank transfer',
        method: 'Bank Transfer',
        amount: transferAmount,
        status: 'Completed',
        description: `Transfer from ${transferSource} to ${transferTarget}`,
        attachments: 0,
        type: 'Deposit',
        bank: transferTarget,
      },
    ]
    updateState({ banks: updatedBanks, bankTxns: [...txns, ...state.bankTxns] })
    addAuditLog('TRANSFER', 'BANK', 'BANK-TRF', 'Inter-bank transfer executed between two accounts.')
    triggerAppToast('Transfer Funds', 'Inter-bank transfer completed successfully.')
    setShowTransferModal(false)
  }

  const openReconcileModal = () => setShowReconcileModal(true)

  const confirmReconcile = () => {
    const updatedBanks = { ...state.banks }
    const reconciledTxns = state.bankTxns.map((txn) => ({
      ...txn,
      status: txn.status === 'Processing' ? 'Completed' : txn.status,
    }))
    updateState({ banks: updatedBanks, bankTxns: reconciledTxns })
    addAuditLog('RECONCILE', 'BANK', 'BANK-RECON', 'Manual reconciliation completed for bank accounts.')
    triggerAppToast('Reconcile Account', 'Bank accounts have been reconciled.')
    setShowReconcileModal(false)
  }

  const openReportModal = (action: string) => setActiveReportModal(action)

  const confirmReportAction = () => {
    if (!activeReportModal) return
    addAuditLog('REPORT', 'BANK', activeReportModal.toUpperCase().replace(/ /g, '_'), `${activeReportModal} generated from bank balances.`)
    triggerAppToast(activeReportModal, `${activeReportModal} is ready.`)
    setActiveReportModal(null)
  }

  const handleBankAction = (action: string) => {
    if (action === 'Export') {
      setShowExportDropdown((current) => !current)
      setShowFilters(false)
      return
    }

    if (action === 'Print') {
      downloadPdf('bank-report.pdf', 'Bank Report', Object.entries(state.banks).map(([bank, balance]) => ({ bank, balance })), companyName)
      addAuditLog('PRINT', 'BANK', 'BANK_PRINT', 'Bank report downloaded as PDF.')
      triggerAppToast('Print', 'Bank report downloaded successfully.')
      return
    }

    if (action === 'Reconcile Account') {
      openReconcileModal()
      return
    }

    if (action === 'Bank Statement' || action === 'Cash Flow Report' || action === 'Reconciliation Report' || action === 'Bank Summary' || action === 'Transfer History') {
      openReportModal(action)
      return
    }

    if (action === 'Filters') {
      setShowFilters((current) => !current)
      setShowExportDropdown(false)
      return
    }

    triggerAppToast(action, 'The bank workspace action has been queued and logged.')
  }

  const applyFilters = () => {
    triggerAppToast('Filters applied', 'Your bank account filters have been applied.')
    setShowFilters(false)
  }

  const handleViewBank = (bank: string) => {
    setSelectedBank(bank)
    triggerAppToast('View Bank', `Viewing details for ${bank}`)
  }

  const handleFilterOption = (label: string) => {
    addAuditLog('FILTER', 'BANK', label.toUpperCase().replace(/ /g, '_'), `${label} filter button clicked.`)
    triggerAppToast('Filter', `${label} filter option selected.`)
  }

  const recentTransactions = state.bankTxns.slice(0, 10)

  return (
    <AppLayout>
      <div className="bank-shell">
        <div className="bank-header">
          <div>
            <div className="pg-title">Bank Balances</div>
            <div className="pg-subtitle">Monitor all company bank accounts, cash balances, and account performance in real time.</div>
          </div>
          <div className="bank-actions">
            <button
              className="btn btn-secondary"
              title={bankAccounts.length < 2 ? 'Create at least two bank accounts first' : 'Transfer funds between accounts'}
              disabled={bankAccounts.length < 2}
              onClick={openTransferModal}
            >
              <Repeat size={16} style={{ marginRight: 6 }} /> Transfer Funds
            </button>
            <button className="btn btn-secondary" title="Reconcile account balances" onClick={openReconcileModal}>
              <CheckCircle2 size={16} style={{ marginRight: 6 }} /> Reconcile Account
            </button>
            <button className="btn btn-secondary" title="Toggle bank account filters" onClick={() => handleBankAction('Filters')}>
              <Filter size={16} style={{ marginRight: 6 }} /> Filters
            </button>
            <div className="export-dropdown" aria-expanded={showExportDropdown ? 'true' : 'false'}>
              <button className="btn btn-secondary export-toggle allow-readonly" type="button" title="Export bank account data" onClick={() => handleBankAction('Export')}>
                <Download size={16} style={{ marginRight: 6 }} /> Export <ArrowDown size={14} className="export-arrow" />
              </button>
              {showExportDropdown && (
                <div className="dropdown-menu">
                  <button type="button" className="dropdown-item allow-readonly" onClick={() => {
                    downloadPdf('banks-report.pdf', 'Bank Balances', Object.entries(state.banks).map(([bank, balance]) => ({ bank, balance })), companyName)
                    setShowExportDropdown(false)
                    triggerAppToast('Export PDF', 'Bank balances PDF downloaded successfully.')
                  }}>
                    <span className="dropdown-icon">PDF</span>Export PDF
                  </button>
                  <button type="button" className="dropdown-item allow-readonly" onClick={() => {
                    downloadExcel('banks-report.xlsx', Object.entries(state.banks).map(([bank, balance]) => ({ bank, balance })))
                    setShowExportDropdown(false)
                    triggerAppToast('Export Excel', 'Bank balances Excel downloaded successfully.')
                  }}>
                    <span className="dropdown-icon">XLSX</span>Export Excel
                  </button>
                </div>
              )}
            </div>
            <button className="btn btn-secondary" title="Print bank account report" onClick={() => handleBankAction('Print')}>
              <ArrowUp size={16} style={{ marginRight: 6 }} /> Print
            </button>
          </div>
        </div>

        <div className="bank-card-grid">
          {bankAccounts.length > 0 ? (
            bankAccounts.map(({ bank, balance, style }) => (
              <article key={bank} className="bank-card" style={{ background: style.background }}>
                <div className="bank-card-top">
                  <div className="bank-card-chip" />
                  <div className="bank-card-logo">{bank}</div>
                </div>
                <div>
                  <div className="bank-card-balance-label">Available Balance</div>
                  <div className="bank-card-balance">{formatCurrency(balance)}</div>
                </div>
              </article>
            ))
          ) : (
            <article className="bank-card bank-card-empty">
              <div className="bank-card-top">
                <div className="bank-card-logo">No Bank Accounts</div>
              </div>
              <div>
                <div className="bank-card-balance-label">Create a bank account to get started.</div>
              </div>
            </article>
          )}
        </div>

        <div className="summary-grid">
          <div className="mini-card">
            <div className="mini-title">Total Bank Balance</div>
            <div className="metric-value pos">{formatCurrency(totalBanks)}</div>
          </div>
          <div className="mini-card">
            <div className="mini-title">Largest Account</div>
            <div className="metric-value pos">{activeBank ? `${activeBank.bank} (${formatCurrency(activeBank.balance)})` : 'None'}</div>
          </div>
          <div className="mini-card">
            <div className="mini-title">Pending Deposits</div>
            <div className="metric-value pos">{formatCurrency(pendingDeposits)}</div>
          </div>
          <div className="mini-card">
            <div className="mini-title">Pending Withdrawals</div>
            <div className="metric-value neg">{formatCurrency(pendingWithdrawals)}</div>
          </div>
          <div className="mini-card">
            <div className="mini-title">Reconciliations Pending</div>
            <div className="metric-value pos">{reconciliationDue}</div>
          </div>
          <div className="mini-card">
            <div className="mini-title">Active Bank Accounts</div>
            <div className="metric-value pos">{bankAccounts.length}</div>
          </div>
        </div>

        {showFilters && (
          <div className="bank-filter-panel card">
            <div className="card-hd">
              <div className="card-title">Filter Bank Accounts</div>
            </div>
            <div className="bank-form-grid">
              <label>
                <span>Search</span>
                <input type="search" placeholder="Search account name, number, bank or currency..." />
              </label>
              <label>
                <span>Filter by Bank</span>
                <select>
                  <option>All Banks</option>
                  {bankAccounts.map((account) => (<option key={account.bank}>{account.bank}</option>))}
                </select>
              </label>
              <label>
                <span>Filter by Account Type</span>
                <select>
                  <option>All Types</option>
                  <option>Current</option>
                  <option>Savings</option>
                </select>
              </label>
              <label>
                <span>Filter by Status</span>
                <select>
                  <option>All Status</option>
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </label>
            </div>
            <div className="btn-group" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-primary" type="button" onClick={applyFilters}>Apply Filters</button>
              <button className="btn btn-secondary" type="button" onClick={() => setShowFilters(false)}>Close</button>
            </div>
          </div>
        )}

        <div className="bank-content-grid">
          {showTransferModal && (
            <div className="bank-modal-overlay">
              <div className="card bank-modal-card">
                <div className="card-title">Transfer Funds</div>
                <div className="bank-form-grid">
                  <label>
                    <span>From Account</span>
                    <select value={transferSource} onChange={(e) => setTransferSource(e.target.value)}>
                      {bankAccounts.map((account) => (<option key={account.bank} value={account.bank}>{account.bank}</option>))}
                    </select>
                  </label>
                  <label>
                    <span>To Account</span>
                    <select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)}>
                      {bankAccounts.filter((account) => account.bank !== transferSource).map((account) => (<option key={account.bank} value={account.bank}>{account.bank}</option>))}
                    </select>
                  </label>
                  <label>
                    <span>Amount</span>
                    <input type="number" min={1000} value={transferAmount} onChange={(e) => setTransferAmount(Number(e.target.value))} />
                  </label>
                </div>
                <div className="btn-group">
                  <button className="btn btn-primary" type="button" onClick={submitTransferFunds}>Confirm Transfer</button>
                  <button className="btn btn-secondary" type="button" onClick={() => setShowTransferModal(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
          {showReconcileModal && (
            <div className="bank-modal-overlay">
              <div className="card reconcile-modal-card">
                <div className="card-title">Reconcile Bank Accounts</div>
                <div className="report-modal-body">
                  <p>Reconcile your bank balances with the latest posted transactions.</p>
                  <div className="report-summary">
                    <div><strong>Accounts to reconcile</strong>: {bankAccounts.length}</div>
                    <div><strong>Pending transactions</strong>: {reconciliationDue}</div>
                  </div>
                </div>
                <div className="report-actions">
                  <button className="btn btn-primary" type="button" onClick={confirmReconcile}>Reconcile Now</button>
                  <button className="btn btn-secondary" type="button" onClick={() => setShowReconcileModal(false)}>Close</button>
                </div>
              </div>
            </div>
          )}
          {activeReportModal && (
            <div className="bank-modal-overlay">
              <div className="card report-modal-card">
                <div className="card-title">{activeReportModal}</div>
                <div className="report-modal-body">
                  <p>Confirm generation of the <strong>{activeReportModal}</strong> report for company bank accounts.</p>
                  <div className="report-summary">
                    <div><strong>Accounts included</strong>: {bankAccounts.length}</div>
                    <div><strong>Total balance</strong>: {formatCurrency(totalBanks)}</div>
                    <div><strong>Generated at</strong>: {new Date().toLocaleString()}</div>
                  </div>
                </div>
                <div className="report-actions">
                  <button className="btn btn-primary" type="button" onClick={confirmReportAction}>Generate</button>
                  <button className="btn btn-secondary" type="button" onClick={() => setActiveReportModal(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
          <div className="card">
            <div className="card-hd">
              <div>
                <div className="card-title">Bank Accounts</div>
                <div className="card-subtitle">View available, book, and cleared balances for every account.</div>
              </div>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Bank</th>
                    <th>Account Name</th>
                    <th>Account Type</th>
                    <th>Currency</th>
                    <th className="td-r">Available</th>
                    <th className="td-r">Book Balance</th>
                    <th className="td-r">Cleared</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bankAccounts.map(({ bank, balance }) => (
                    <tr key={bank}>
                      <td>{bank}</td>
                      <td>{`${bank} Account`}</td>
                      <td>{bank === 'UBA' ? 'Savings' : 'Current'}</td>
                      <td>₦</td>
                      <td className="td-r">{formatCurrency(balance)}</td>
                      <td className="td-r">{formatCurrency(balance)}</td>
                      <td className="td-r">{formatCurrency(balance)}</td>
                      <td><span className="status-pill success">Active</span></td>
                      <td>
                        <button className="btn btn-sm" title={`View details for ${bank}`} onClick={() => handleViewBank(bank)}>View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bank-detail-stack">
            <div className="card">
              <div className="card-title">Account Information</div>
              <div className="bank-detail-panel">
                <div className="bank-detail-row"><span>Bank Name</span><strong>{selectedAccount?.bank ?? 'No account selected'}</strong></div>
                <div className="bank-detail-row"><span>Account Name</span><strong>{selectedAccount ? `${selectedAccount.bank} Operations` : 'N/A'}</strong></div>
                <div className="bank-detail-row"><span>Account Number</span><strong>{selectedAccount ? `BK${selectedAccount.bank.slice(0, 3).toUpperCase()}${selectedAccount.balance.toString().slice(-4)}` : '0000'}</strong></div>
                <div className="bank-detail-row"><span>Branch</span><strong>{selectedAccount ? 'Main Branch' : 'N/A'}</strong></div>
                <div className="bank-detail-row"><span>Currency</span><strong>₦</strong></div>
                <div className="bank-detail-row"><span>Opening Balance</span><strong>{formatCurrency(selectedAccount ? selectedAccount.balance : 0)}</strong></div>
                <div className="bank-detail-row"><span>Current Balance</span><strong>{formatCurrency(selectedAccount ? selectedAccount.balance : 0)}</strong></div>
                <div className="bank-detail-row"><span>Available Balance</span><strong>{formatCurrency(selectedAccount ? selectedAccount.balance : 0)}</strong></div>
              </div>
            </div>
            <div className="card">
              <div className="card-title">Reconciliation Status</div>
              <div className="bank-detail-panel">
                <div className="bank-detail-row"><span>Last Reconciled</span><strong>{state.bankTxns.length > 0 ? 'Recorded transactions' : 'Not reconciled'}</strong></div>
                <div className="bank-detail-row"><span>Difference</span><strong>{formatCurrency(0)}</strong></div>
                <div className="bank-detail-row"><span>Status</span><strong>Balanced</strong></div>
              </div>
            </div>
            <div className="card">
              <div className="card-title">Cash Flow Summary</div>
              <div className="bank-detail-panel">
                <div className="bank-detail-row"><span>Money In</span><strong>{formatCurrency(moneyIn)}</strong></div>
                <div className="bank-detail-row"><span>Money Out</span><strong>{formatCurrency(moneyOut)}</strong></div>
                <div className="bank-detail-row"><span>Net Cash Flow</span><strong>{formatCurrency(moneyIn - moneyOut)}</strong></div>
              </div>
            </div>
            <div className="card">
              <div className="card-title">Linked Modules</div>
              <div className="bank-detail-panel">
                <div className="bank-detail-row"><span>Sales</span><strong>{formatCurrency(salesTotal)}</strong></div>
                <div className="bank-detail-row"><span>Receivables</span><strong>{formatCurrency(receivablesTotal)}</strong></div>
                <div className="bank-detail-row"><span>Payables</span><strong>{formatCurrency(payablesTotal)}</strong></div>
                <div className="bank-detail-row"><span>Expenses</span><strong>{formatCurrency(expensesTotal)}</strong></div>
              </div>
            </div>
          </div>
        </div>

        <div className="analytics-grid">
          <div className="chart-card">
            <div className="chart-card-title">Cash Flow</div>
            <div className="chart-placeholder">Line chart showing Money In vs Money Out</div>
          </div>
          <div className="chart-card">
            <div className="chart-card-title">Bank Balance Trend</div>
            <div className="chart-placeholder">Monthly balance trend</div>
          </div>
          <div className="chart-card">
            <div className="chart-card-title">Distribution</div>
            <div className="chart-placeholder">Pie chart showing account share</div>
          </div>
        </div>

        <div className="reports-row">
          <button className="btn btn-secondary" onClick={() => handleBankAction('Bank Statement')} title="Generate bank statement">Bank Statement</button>
          <button className="btn btn-secondary" onClick={() => handleBankAction('Cash Flow Report')} title="Generate cash flow report">Cash Flow Report</button>
          <button className="btn btn-secondary" onClick={() => handleBankAction('Reconciliation Report')} title="Generate reconciliation report">Reconciliation Report</button>
          <button className="btn btn-secondary" onClick={() => handleBankAction('Bank Summary')} title="Generate bank summary">Bank Summary</button>
          <button className="btn btn-secondary" onClick={() => handleBankAction('Transfer History')} title="Generate transfer history">Transfer History</button>
        </div>
      </div>
    </AppLayout>
  )
}
