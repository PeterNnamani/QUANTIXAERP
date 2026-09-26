'use client'

import { useEffect, useMemo, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting } from '@/lib/context'
import { formatCurrency, triggerAppToast } from '@/lib/utils'
import { downloadExcel, downloadPdf } from '@/lib/export-utils'
import { applyBankMovements, displayBankAccounts, maskAccountNumber } from '@/lib/bank-ledger'
import { Repeat, Download, Filter, ArrowDown, ArrowUp, CheckCircle2 } from 'lucide-react'

const knownBankStyles: Record<string, string> = {
  'Globus Bank': 'linear-gradient(135deg, #1a3a7c 0%, #0f2456 100%)',
  'Access Bank': 'linear-gradient(135deg, #064d42 0%, #0d7a54 100%)',
  'Zenith Bank': 'linear-gradient(135deg, #b45309 0%, #9a3412 100%)',
  UBA: 'linear-gradient(135deg, #b91c1c 0%, #7f1d1d 100%)',
  'First Bank': 'linear-gradient(135deg, #1a3a7c 0%, #854d0e 100%)',
}

const palette = [
  'linear-gradient(135deg, #1a3a7c 0%, #0f2456 100%)',
  'linear-gradient(135deg, #0f3d4c 0%, #155e75 100%)',
  'linear-gradient(135deg, #3f3f46 0%, #1f2937 100%)',
  'linear-gradient(135deg, #1e3a5f 0%, #334155 100%)',
]

function cardBackground(institution: string) {
  if (knownBankStyles[institution]) return knownBankStyles[institution]
  const index = [...institution].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length
  return palette[index]
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
  const [filterQuery, setFilterQuery] = useState('')
  const [filterInstitution, setFilterInstitution] = useState('All Banks')
  const [filterType, setFilterType] = useState('All Types')
  const [filterStatus, setFilterStatus] = useState('All Status')
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null)

  const accounts = useMemo(
    () => displayBankAccounts(state.banks, state.bankAccounts),
    [state.banks, state.bankAccounts],
  )
  const institutions = [...new Set(accounts.map((account) => account.institution))]
  const accountTypes = [...new Set(accounts.map((account) => account.accountType))]
  const visibleAccounts = accounts.filter((account) => {
    const query = filterQuery.trim().toLowerCase()
    const matchesQuery = !query || [account.name, account.institution, account.accountNumber, account.currency, account.branch].join(' ').toLowerCase().includes(query)
    const matchesInstitution = filterInstitution === 'All Banks' || account.institution === filterInstitution
    const matchesType = filterType === 'All Types' || account.accountType === filterType
    const matchesStatus = filterStatus === 'All Status' || account.status.toLowerCase() === filterStatus.toLowerCase()
    return matchesQuery && matchesInstitution && matchesType && matchesStatus
  })
  const totalBanks = accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0)
  const largestAccount = [...accounts].sort((left, right) => right.balance - left.balance)[0]
  const selectedAccount = visibleAccounts.find((account) => account.id === selectedBankId) || visibleAccounts[0] || accounts[0]
  const accountTransactions = state.bankTxns.filter((txn) => !selectedAccount || txn.bank === selectedAccount.name)
  const pendingDeposits = accountTransactions.filter((txn) => txn.amount > 0 && txn.status !== 'Completed').reduce((sum, txn) => sum + txn.amount, 0)
  const pendingWithdrawals = accountTransactions.filter((txn) => txn.amount < 0 && txn.status !== 'Completed').reduce((sum, txn) => sum + Math.abs(txn.amount), 0)
  const reconciliationDue = state.bankTxns.filter((txn) => txn.status !== 'Completed').length
  const moneyIn = accountTransactions.filter((txn) => txn.amount > 0).reduce((sum, txn) => sum + txn.amount, 0)
  const moneyOut = accountTransactions.filter((txn) => txn.amount < 0).reduce((sum, txn) => sum + Math.abs(txn.amount), 0)
  const flowTotal = Math.max(moneyIn + moneyOut, 1)
  const salesTotal = state.sales.filter((sale) => sale.status !== 'VOID').reduce((sum, sale) => sum + sale.totalAmount, 0)
  const receivablesTotal = state.receivables.reduce((sum, item) => sum + Number(item.outstandingAmount ?? item.amount ?? 0), 0)
  const payablesTotal = state.payables.reduce((sum, item) => sum + Number(item.outstandingAmount ?? item.amount ?? 0), 0)
  const expensesTotal = state.expenses.filter((expense) => expense.status !== 'VOID').reduce((sum, expense) => sum + expense.amount, 0)

  useEffect(() => {
    if (!selectedBankId && accounts[0]) setSelectedBankId(accounts[0].id)
  }, [accounts, selectedBankId])

  const exportRows = visibleAccounts.map((account) => ({
    Bank: account.institution,
    Account: account.name,
    Number: account.accountNumber || '',
    Type: account.accountType,
    Currency: account.currency,
    Branch: account.branch || '',
    'Opening balance': account.openingBalance,
    'Available balance': account.balance,
    Status: account.status,
  }))

  const openTransferModal = () => {
    if (accounts.length < 2) {
      triggerAppToast('Transfer Funds', 'Create at least two bank accounts before transferring funds.')
      return
    }
    setTransferSource(accounts[0].name)
    setTransferTarget(accounts[1].name)
    setTransferAmount(0)
    setShowTransferModal(true)
  }

  const submitTransferFunds = () => {
    if (transferAmount <= 0) {
      triggerAppToast('Transfer Funds', 'Enter a transfer amount before continuing.')
      return
    }
    if (transferSource === transferTarget) {
      triggerAppToast('Transfer Funds', 'Choose two different accounts.')
      return
    }
    const sourceBalance = accounts.find((account) => account.name === transferSource)?.balance ?? 0
    if (transferAmount > sourceBalance) {
      triggerAppToast('Transfer Funds', 'That amount is higher than the available balance.')
      return
    }
    const moved = applyBankMovements(state, [
      { name: transferSource, delta: -transferAmount },
      { name: transferTarget, delta: transferAmount },
    ])
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
    updateState({ ...moved, bankTxns: [...txns, ...state.bankTxns] })
    addAuditLog('TRANSFER', 'BANK', 'BANK-TRF', `Transferred ${formatCurrency(transferAmount)} from ${transferSource} to ${transferTarget}.`)
    triggerAppToast('Transfer Funds', 'Inter-bank transfer completed.')
    setShowTransferModal(false)
  }

  const confirmReconcile = () => {
    const reconciledTxns = state.bankTxns.map((txn) => ({
      ...txn,
      status: txn.status === 'Processing' || txn.status === 'Pending' ? 'Completed' : txn.status,
    }))
    updateState({ bankTxns: reconciledTxns })
    addAuditLog('RECONCILE', 'BANK', 'BANK-RECON', 'Marked pending bank transactions as completed.')
    triggerAppToast('Reconcile Account', 'Pending transactions were marked completed. Balances were not changed.')
    setShowReconcileModal(false)
  }

  const confirmReportAction = () => {
    if (!activeReportModal) return
    const stamp = new Date().toISOString().slice(0, 10)
    if (activeReportModal === 'Bank Statement') {
      const rows = (selectedAccount ? state.bankTxns.filter((txn) => txn.bank === selectedAccount.name) : state.bankTxns)
        .map((txn) => ({ Date: txn.date, Account: txn.bank, Description: txn.description || txn.activity, Type: txn.type, Amount: txn.amount, Status: txn.status }))
      downloadPdf(`bank-statement-${stamp}.pdf`, 'Bank Statement', rows, companyName)
    } else if (activeReportModal === 'Cash Flow Report') {
      downloadPdf(`cash-flow-${stamp}.pdf`, 'Cash Flow Report', [{ Account: selectedAccount?.name || 'All accounts', 'Money in': moneyIn, 'Money out': moneyOut, 'Net cash': moneyIn - moneyOut }], companyName)
    } else if (activeReportModal === 'Reconciliation Report') {
      const rows = state.bankTxns.filter((txn) => txn.status !== 'Completed').map((txn) => ({ Date: txn.date, Account: txn.bank, Description: txn.description || txn.activity, Amount: txn.amount, Status: txn.status }))
      downloadPdf(`reconciliation-${stamp}.pdf`, 'Reconciliation Report', rows, companyName)
    } else if (activeReportModal === 'Transfer History') {
      const rows = state.bankTxns.filter((txn) => txn.type === 'Transfer').map((txn) => ({ Date: txn.date, Account: txn.bank, Description: txn.description || txn.activity, Amount: txn.amount, Status: txn.status }))
      downloadPdf(`transfers-${stamp}.pdf`, 'Transfer History', rows, companyName)
    } else {
      downloadPdf(`bank-summary-${stamp}.pdf`, 'Bank Summary', exportRows, companyName)
    }
    addAuditLog('REPORT', 'BANK', activeReportModal.toUpperCase().replace(/ /g, '_'), `${activeReportModal} downloaded.`)
    triggerAppToast(activeReportModal, `${activeReportModal} downloaded.`)
    setActiveReportModal(null)
  }

  return (
    <AppLayout>
      <div className="bank-shell">
        <div className="bank-header">
          <div>
            <div className="pg-title">Bank Balances</div>
            <div className="pg-subtitle">Live balances for the accounts saved on {companyName}.</div>
          </div>
          <div className="bank-actions">
            <button className="btn btn-secondary" title={accounts.length < 2 ? 'Create at least two bank accounts first' : 'Transfer funds between accounts'} disabled={accounts.length < 2} onClick={openTransferModal}>
              <Repeat size={16} style={{ marginRight: 6 }} /> Transfer Funds
            </button>
            <button className="btn btn-secondary" title="Mark pending transactions completed" onClick={() => setShowReconcileModal(true)}>
              <CheckCircle2 size={16} style={{ marginRight: 6 }} /> Reconcile Account
            </button>
            <button className="btn btn-secondary" title="Filter bank accounts" onClick={() => { setShowFilters((current) => !current); setShowExportDropdown(false) }}>
              <Filter size={16} style={{ marginRight: 6 }} /> Filters
            </button>
            <div className="export-dropdown" aria-expanded={showExportDropdown ? 'true' : 'false'}>
              <button className="btn btn-secondary export-toggle allow-readonly" type="button" title="Export bank account data" onClick={() => { setShowExportDropdown((current) => !current); setShowFilters(false) }}>
                <Download size={16} style={{ marginRight: 6 }} /> Export <ArrowDown size={14} className="export-arrow" />
              </button>
              {showExportDropdown && (
                <div className="dropdown-menu">
                  <button type="button" className="dropdown-item allow-readonly" onClick={() => { downloadPdf('banks-report.pdf', 'Bank Balances', exportRows, companyName); setShowExportDropdown(false) }}>
                    <span className="dropdown-icon">PDF</span>Export PDF
                  </button>
                  <button type="button" className="dropdown-item allow-readonly" onClick={() => { downloadExcel('banks-report.xlsx', exportRows); setShowExportDropdown(false) }}>
                    <span className="dropdown-icon">XLSX</span>Export Excel
                  </button>
                </div>
              )}
            </div>
            <button className="btn btn-secondary" title="Print bank account report" onClick={() => { downloadPdf('bank-report.pdf', 'Bank Report', exportRows, companyName); addAuditLog('PRINT', 'BANK', 'BANK_PRINT', 'Bank report downloaded as PDF.') }}>
              <ArrowUp size={16} style={{ marginRight: 6 }} /> Print
            </button>
          </div>
        </div>

        <div className="bank-card-grid">
          {visibleAccounts.length > 0 ? visibleAccounts.map((account) => (
            <article key={account.id} className={`bank-card ${selectedAccount?.id === account.id ? 'is-selected' : ''}`} style={{ background: cardBackground(account.institution) }} onClick={() => setSelectedBankId(account.id)}>
              <div className="bank-card-top">
                <div className="bank-card-chip" />
                <div className="bank-card-logo">{account.institution}</div>
              </div>
              <div className="bank-card-number">{maskAccountNumber(account.accountNumber)}</div>
              <div className="bank-card-footer">
                <div>
                  <div className="bank-card-balance-label">Available balance</div>
                  <div className="bank-card-balance">{formatCurrency(account.balance)}</div>
                  <div className="bank-card-account">{account.name}</div>
                  <div className="bank-card-type">{account.accountType} · {account.currency}{account.branch ? ` · ${account.branch}` : ''}</div>
                </div>
              </div>
            </article>
          )) : (
            <article className="bank-card bank-card-empty" style={{ background: '#1a3a7c' }}>
              <div className="bank-card-top"><div className="bank-card-logo">No bank accounts</div></div>
              <div className="bank-card-balance-label">{accounts.length === 0 ? 'Create an account in Settings to start tracking cash.' : 'No accounts match these filters.'}</div>
            </article>
          )}
        </div>

        <div className="summary-grid">
          <div className="mini-card"><div className="mini-title">Total bank balance</div><div className="metric-value pos">{formatCurrency(totalBanks)}</div></div>
          <div className="mini-card"><div className="mini-title">Largest account</div><div className="metric-value pos">{largestAccount ? `${largestAccount.institution} (${formatCurrency(largestAccount.balance)})` : 'None'}</div></div>
          <div className="mini-card"><div className="mini-title">Pending deposits</div><div className="metric-value pos">{formatCurrency(pendingDeposits)}</div></div>
          <div className="mini-card"><div className="mini-title">Pending withdrawals</div><div className="metric-value neg">{formatCurrency(pendingWithdrawals)}</div></div>
          <div className="mini-card"><div className="mini-title">Reconciliations pending</div><div className="metric-value pos">{reconciliationDue}</div></div>
          <div className="mini-card"><div className="mini-title">Active bank accounts</div><div className="metric-value pos">{accounts.filter((account) => account.status.toLowerCase() === 'active').length}</div></div>
        </div>

        {showFilters && (
          <div className="bank-filter-panel card">
            <div className="card-hd"><div className="card-title">Filter bank accounts</div></div>
            <div className="bank-form-grid">
              <label><span>Search</span><input type="search" value={filterQuery} placeholder="Account name, number, bank, or currency" onChange={(event) => setFilterQuery(event.target.value)} /></label>
              <label><span>Bank</span><select value={filterInstitution} onChange={(event) => setFilterInstitution(event.target.value)}><option>All Banks</option>{institutions.map((institution) => <option key={institution}>{institution}</option>)}</select></label>
              <label><span>Account type</span><select value={filterType} onChange={(event) => setFilterType(event.target.value)}><option>All Types</option>{accountTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label><span>Status</span><select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}><option>All Status</option><option>Active</option><option>Inactive</option></select></label>
            </div>
            <div className="btn-group" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" type="button" onClick={() => { setFilterQuery(''); setFilterInstitution('All Banks'); setFilterType('All Types'); setFilterStatus('All Status') }}>Clear</button>
              <button className="btn btn-primary" type="button" onClick={() => setShowFilters(false)}>Done</button>
            </div>
          </div>
        )}

        {showTransferModal && (
          <div className="bank-modal-overlay">
            <div className="card bank-modal-card">
              <div className="card-title">Transfer funds</div>
              <div className="bank-form-grid">
                <label><span>From account</span><select value={transferSource} onChange={(event) => setTransferSource(event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.name}>{account.name} · {formatCurrency(account.balance)}</option>)}</select></label>
                <label><span>To account</span><select value={transferTarget} onChange={(event) => setTransferTarget(event.target.value)}>{accounts.filter((account) => account.name !== transferSource).map((account) => <option key={account.id} value={account.name}>{account.name}</option>)}</select></label>
                <label><span>Amount</span><input type="number" min={0} value={transferAmount} onChange={(event) => setTransferAmount(Number(event.target.value))} /></label>
              </div>
              <div className="btn-group">
                <button className="btn btn-primary" type="button" onClick={submitTransferFunds}>Confirm transfer</button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowTransferModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {showReconcileModal && (
          <div className="bank-modal-overlay">
            <div className="card reconcile-modal-card">
              <div className="card-title">Reconcile bank accounts</div>
              <div className="report-modal-body">
                <p>Mark pending and processing transactions as completed. This does not change any balance.</p>
                <div className="report-summary">
                  <div><strong>Accounts</strong>: {accounts.length}</div>
                  <div><strong>Pending transactions</strong>: {reconciliationDue}</div>
                </div>
              </div>
              <div className="report-actions">
                <button className="btn btn-primary" type="button" onClick={confirmReconcile}>Mark completed</button>
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
                <p>Download the {activeReportModal.toLowerCase()} from the accounts and transactions currently saved.</p>
                <div className="report-summary">
                  <div><strong>Accounts</strong>: {visibleAccounts.length}</div>
                  <div><strong>Total balance</strong>: {formatCurrency(totalBanks)}</div>
                </div>
              </div>
              <div className="report-actions">
                <button className="btn btn-primary" type="button" onClick={confirmReportAction}>Download</button>
                <button className="btn btn-secondary" type="button" onClick={() => setActiveReportModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        <div className="bank-content-grid">
          <div className="card">
            <div className="card-hd">
              <div>
                <div className="card-title">Bank accounts</div>
                <div className="card-subtitle">{visibleAccounts.length} of {accounts.length} accounts</div>
              </div>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Bank</th>
                    <th>Account</th>
                    <th>Number</th>
                    <th>Type</th>
                    <th>Currency</th>
                    <th className="td-r">Opening</th>
                    <th className="td-r">Available</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAccounts.map((account) => (
                    <tr key={account.id}>
                      <td>{account.institution}</td>
                      <td>{account.name}</td>
                      <td>{maskAccountNumber(account.accountNumber)}</td>
                      <td>{account.accountType}</td>
                      <td>{account.currency}</td>
                      <td className="td-r">{formatCurrency(account.openingBalance)}</td>
                      <td className="td-r">{formatCurrency(account.balance)}</td>
                      <td><span className={`status-pill ${account.status.toLowerCase() === 'active' ? 'success' : ''}`}>{account.status}</span></td>
                      <td><button className="btn btn-sm" type="button" onClick={() => setSelectedBankId(account.id)}>View</button></td>
                    </tr>
                  ))}
                  {visibleAccounts.length === 0 && <tr><td colSpan={9}>No bank accounts match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bank-detail-stack">
            <div className="card">
              <div className="card-title">Account information</div>
              <div className="bank-detail-panel">
                <div className="bank-detail-row"><span>Bank</span><strong>{selectedAccount?.institution ?? 'No account selected'}</strong></div>
                <div className="bank-detail-row"><span>Account name</span><strong>{selectedAccount?.name ?? '—'}</strong></div>
                <div className="bank-detail-row"><span>Account number</span><strong>{selectedAccount ? maskAccountNumber(selectedAccount.accountNumber) : '—'}</strong></div>
                <div className="bank-detail-row"><span>Branch</span><strong>{selectedAccount?.branch || '—'}</strong></div>
                <div className="bank-detail-row"><span>Currency</span><strong>{selectedAccount?.currency || '—'}</strong></div>
                <div className="bank-detail-row"><span>Opening balance</span><strong>{formatCurrency(selectedAccount?.openingBalance || 0)}</strong></div>
                <div className="bank-detail-row"><span>Available balance</span><strong>{formatCurrency(selectedAccount?.balance || 0)}</strong></div>
              </div>
            </div>
            <div className="card">
              <div className="card-title">Cash movement</div>
              <div className="bank-detail-panel">
                <div className="bank-detail-row"><span>Money in</span><strong>{formatCurrency(moneyIn)}</strong></div>
                <div className="bank-share"><span style={{ width: `${(moneyIn / flowTotal) * 100}%` }} /></div>
                <div className="bank-detail-row"><span>Money out</span><strong>{formatCurrency(moneyOut)}</strong></div>
                <div className="bank-share out"><span style={{ width: `${(moneyOut / flowTotal) * 100}%` }} /></div>
                <div className="bank-detail-row"><span>Net cash</span><strong>{formatCurrency(moneyIn - moneyOut)}</strong></div>
              </div>
            </div>
            <div className="card">
              <div className="card-title">Balance share</div>
              <div className="bank-detail-panel">
                {accounts.length === 0 && <div className="metric-note">No accounts yet.</div>}
                {accounts.map((account) => (
                  <div key={account.id}>
                    <div className="bank-detail-row"><span>{account.institution}</span><strong>{formatCurrency(account.balance)}</strong></div>
                    <div className="bank-share"><span style={{ width: `${totalBanks > 0 ? (account.balance / totalBanks) * 100 : 0}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-title">Linked records</div>
              <div className="bank-detail-panel">
                <div className="bank-detail-row"><span>Sales</span><strong>{formatCurrency(salesTotal)}</strong></div>
                <div className="bank-detail-row"><span>Receivables</span><strong>{formatCurrency(receivablesTotal)}</strong></div>
                <div className="bank-detail-row"><span>Payables</span><strong>{formatCurrency(payablesTotal)}</strong></div>
                <div className="bank-detail-row"><span>Expenses</span><strong>{formatCurrency(expensesTotal)}</strong></div>
              </div>
            </div>
          </div>
        </div>

        <div className="reports-row">
          {['Bank Statement', 'Cash Flow Report', 'Reconciliation Report', 'Bank Summary', 'Transfer History'].map((report) => (
            <button key={report} className="btn btn-secondary" type="button" onClick={() => setActiveReportModal(report)}>{report}</button>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
