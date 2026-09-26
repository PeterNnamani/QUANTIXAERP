'use client'

import { useMemo, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting } from '@/lib/context'
import { formatCurrency, triggerAppToast, getCurrentDate } from '@/lib/utils'
import { downloadPdf, downloadExcel } from '@/lib/export-utils'
import { applyBankMovements, displayBankAccounts, parseBankStatement, runningBalanceById } from '@/lib/bank-ledger'
import { ArrowDown, Repeat, Download, Upload, Filter, PlusCircle, CheckCircle2 } from 'lucide-react'

const transactionTypes = ['Deposit', 'Withdrawal', 'Transfer', 'Bank Charges', 'Interest', 'Salary', 'Loan', 'Refund', 'Adjustment']
const perPageOptions = [25, 50, 100]

export default function BankTxnPage() {
  const { state, updateState, addAuditLog, user } = useAccounting()
  const companyName = state.companySettings.companyName || 'Company'
  const [search, setSearch] = useState('')
  const [filterBank, setFilterBank] = useState('All Banks')
  const [filterType, setFilterType] = useState('All Types')
  const [filterStatus, setFilterStatus] = useState('All Status')
  const [filterBranch, setFilterBranch] = useState('All Branches')
  const [filterUser, setFilterUser] = useState('All Users')
  const [itemsPerPage, setItemsPerPage] = useState(25)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedId, setSelectedId] = useState(state.bankTxns[0]?.id ?? '')
  const [activeTxnModal, setActiveTxnModal] = useState<string | null>(null)
  const [showTxnForm, setShowTxnForm] = useState(false)
  const [showExportDropdown, setShowExportDropdown] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [txnMode, setTxnMode] = useState<'Deposit' | 'Withdrawal' | 'Transfer'>('Deposit')
  const [txnBank, setTxnBank] = useState('')
  const [txnTargetBank, setTxnTargetBank] = useState('')
  const [txnAmount, setTxnAmount] = useState(0)
  const [txnMethod, setTxnMethod] = useState('Bank Transfer')
  const [txnDescription, setTxnDescription] = useState('')
  const [txnDate, setTxnDate] = useState(getCurrentDate())
  const [statementText, setStatementText] = useState('')
  const [statementBank, setStatementBank] = useState('')
  const [statementError, setStatementError] = useState('')
  const accounts = useMemo(() => displayBankAccounts(state.banks, state.bankAccounts), [state.banks, state.bankAccounts])
  const bankList = accounts.map((account) => account.name)
  const bankOptions = bankList

  const transactions = useMemo(() => {
    const openingByBank = Object.fromEntries(accounts.map((account) => [account.name, Number(account.openingBalance || 0)]))
    const balances = runningBalanceById(state.bankTxns, openingByBank)
    return state.bankTxns.map((txn) => {
      const amount = Number(txn.amount || 0)
      const bank = txn.bank || ''
      const account = accounts.find((item) => item.name === bank)
      const type = txn.type || (amount > 0 ? 'Deposit' : 'Withdrawal')
      return {
        ...txn,
        reference: txn.id,
        bank,
        type,
        debit: amount < 0 ? Math.abs(amount) : 0,
        credit: amount > 0 ? amount : 0,
        balance: balances[txn.id] ?? Number(account?.balance || 0),
        status: txn.status || 'Completed',
        payer: txn.payer || (amount > 0 ? txn.name || 'Receipt' : companyName),
        payee: txn.payee || (amount < 0 ? txn.name || 'Payment' : account?.name || 'Bank account'),
        recordedBy: txn.recordedBy || '—',
        approvedBy: txn.approvedBy || '—',
        branch: txn.branch || account?.branch || '—',
      }
    })
  }, [accounts, companyName, state.bankTxns])

  const branchOptions = [...new Set(transactions.map((txn) => txn.branch).filter((branch) => branch && branch !== '—'))]
  const userOptions = [...new Set(transactions.map((txn) => txn.recordedBy).filter((name) => name && name !== '—'))]
  const today = getCurrentDate()

  const summary = useMemo(() => {
    const deposits = transactions.filter((txn) => txn.credit > 0 && txn.date === today).reduce((sum, txn) => sum + txn.credit, 0)
    const withdrawals = transactions.filter((txn) => txn.debit > 0 && txn.date === today).reduce((sum, txn) => sum + txn.debit, 0)
    const transfers = transactions.filter((txn) => txn.type === 'Transfer').length
    const pendingTransactions = transactions.filter((txn) => txn.status.toLowerCase().includes('processing') || txn.status.toLowerCase().includes('pending')).length
    const failedTransfers = transactions.filter((txn) => txn.status.toLowerCase().includes('rejected') || txn.status.toLowerCase().includes('failed')).length
    const reconciledRate = transactions.length > 0 ? Math.round(((transactions.length - pendingTransactions - failedTransfers) / transactions.length) * 100) : 100

    return {
      deposits,
      withdrawals,
      transfers,
      pendingTransactions,
      reconciledRate: Math.min(100, reconciledRate),
      failedTransfers,
    }
  }, [today, transactions])

  const filteredTransactions = useMemo(() => {
    const term = search.trim().toLowerCase()
    return transactions.filter((txn) => {
      const matchesSearch = !term || [txn.reference, txn.description, txn.payee, txn.payer, txn.bank, txn.method].join(' ').toLowerCase().includes(term)
      const matchesBank = filterBank === 'All Banks' || txn.bank === filterBank
      const matchesType = filterType === 'All Types' || txn.type === filterType
      const matchesStatus = filterStatus === 'All Status' || txn.status === filterStatus
      const matchesBranch = filterBranch === 'All Branches' || txn.branch === filterBranch
      const matchesUser = filterUser === 'All Users' || txn.recordedBy === filterUser
      return matchesSearch && matchesBank && matchesType && matchesStatus && matchesBranch && matchesUser
    })
  }, [search, filterBank, filterType, filterStatus, filterBranch, filterUser, transactions])

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / itemsPerPage))
  const activePage = Math.min(currentPage, totalPages)
  const startIndex = (activePage - 1) * itemsPerPage
  const paginatedTransactions = filteredTransactions.slice(startIndex, startIndex + itemsPerPage)
  const pageStart = filteredTransactions.length === 0 ? 0 : startIndex + 1
  const pageEnd = Math.min(startIndex + itemsPerPage, filteredTransactions.length)
  const selectedTransaction = transactions.find((txn) => txn.id === selectedId) || transactions[0]

  const openTxnModal = (action: string) => {
    if (action === 'Import Statement' && bankList.length === 0) {
      triggerAppToast('Create Bank Account', 'You must create a bank account before importing statements.')
      return
    }
    setStatementBank(bankList[0] || '')
    setStatementText('')
    setStatementError('')
    setActiveTxnModal(action)
  }

  const closeTxnModal = () => setActiveTxnModal(null)

  const handleExportReport = (format: 'pdf' | 'excel') => {
    const payload = filteredTransactions.map((txn) => ({
      Date: txn.date,
      Reference: txn.reference,
      Bank: txn.bank,
      Description: txn.activity,
      Type: txn.type,
      Amount: txn.amount,
      Status: txn.status,
    }))

    if (format === 'pdf') {
      downloadPdf('bank-transactions.pdf', 'Bank Transactions', payload, companyName)
    } else {
      downloadExcel('bank-transactions.xlsx', payload)
    }

    triggerAppToast('Export', 'Transaction report downloaded successfully.')
    setShowExportDropdown(false)
  }

  const confirmTxnModal = () => {
    if (!activeTxnModal) return

    if (activeTxnModal === 'Import Statement') {
      const rows = parseBankStatement(statementText)
      if (!statementBank || rows.length === 0) {
        setStatementError('Choose an account and a CSV with date, description, and amount columns.')
        return
      }
      const importedTxns = rows.map((row, index) => ({
        id: `TXN-IMP-${Date.now()}-${index}`,
        date: row.date,
        name: row.description,
        activity: row.description,
        method: 'Bank statement',
        amount: row.amount,
        status: 'Completed',
        description: row.description,
        attachments: 0,
        type: row.amount >= 0 ? 'Deposit' : 'Withdrawal',
        bank: statementBank,
        recordedBy: user?.name || '—',
      }))
      const moved = applyBankMovements(state, importedTxns.map((txn) => ({ name: statementBank, delta: txn.amount })))
      updateState({ ...moved, bankTxns: [...importedTxns, ...state.bankTxns] })
      addAuditLog('IMPORT', 'BANK', `IMP-${Date.now()}`, `Imported ${importedTxns.length} statement lines into ${statementBank}.`)
      triggerAppToast('Import Statement', `${importedTxns.length} statement lines were added to ${statementBank}.`)
    }

    if (activeTxnModal === 'Reconcile') {
      const reconciledTxns = state.bankTxns.map((txn) => ({
        ...txn,
        status: txn.status === 'Processing' || txn.status === 'Pending' ? 'Completed' : txn.status,
      }))
      updateState({ bankTxns: reconciledTxns })
      addAuditLog('RECONCILE', 'BANK', 'RECON-001', 'Pending bank transactions were marked completed without changing balances.')
      triggerAppToast('Reconcile', 'Pending transactions were marked completed. Balances were not changed.')
    }

    closeTxnModal()
  }

  const handleAction = (action: string) => {
    if (action === 'Export') {
      setShowExportDropdown((current) => !current)
      setShowFilters(false)
      return
    }

    if (action === 'Filters') {
      setShowFilters((current) => !current)
      setShowExportDropdown(false)
      return
    }

    if (['Import Statement', 'Reconcile'].includes(action)) {
      openTxnModal(action)
      return
    }

    triggerAppToast(action, 'The bank workflow has been prepared and logged for review.')
  }

  const openTxnForm = (mode: 'Deposit' | 'Withdrawal' | 'Transfer') => {
    if (bankList.length === 0) {
      triggerAppToast('Create Bank Account', 'You must create a bank account before recording transactions.')
      return
    }
    setTxnMode(mode)
    setTxnBank(bankList[0])
    setTxnTargetBank(bankList[1] ?? bankList[0])
    setTxnAmount(0)
    setTxnMethod(mode === 'Transfer' ? 'Internal Transfer' : 'Bank Transfer')
    setTxnDescription('')
    setTxnDate(getCurrentDate())
    setShowTxnForm(true)
  }

  const handleSubmitTxn = () => {
    if (!txnAmount || txnAmount <= 0) {
      alert('Please enter a positive amount for the transaction.')
      return
    }
    if (!txnBank) {
      alert('Please select the bank account.')
      return
    }
    if (txnMode === 'Transfer' && txnBank === txnTargetBank) {
      alert('Please select a different target bank for transfers.')
      return
    }
    const sourceBalance = accounts.find((account) => account.name === txnBank)?.balance ?? 0
    if ((txnMode === 'Withdrawal' || txnMode === 'Transfer') && txnAmount > sourceBalance) {
      alert('That amount is higher than the available balance.')
      return
    }
    const amount = txnMode === 'Withdrawal' ? -txnAmount : txnMode === 'Deposit' ? txnAmount : -txnAmount
    const txn = {
      id: `TXN-${Date.now()}`,
      date: txnDate,
      name: txnMode === 'Transfer' ? `${txnBank} → ${txnTargetBank}` : txnMode,
      activity: txnDescription || `${txnMode} transaction`,
      method: txnMethod,
      amount,
      status: 'Completed',
      description: txnDescription || `${txnMode} transaction recorded`,
      attachments: 0,
      type: txnMode,
      bank: txnBank,
      recordedBy: user?.name || '—',
      branch: accounts.find((account) => account.name === txnBank)?.branch || '',
    }
    const movements = [{ name: txnBank, delta: amount }]
    const txnsToAdd = [txn]
    if (txnMode === 'Transfer') {
      movements.push({ name: txnTargetBank, delta: txnAmount })
      const targetTxn = {
        id: `TXN-${Date.now()}-R`,
        date: txnDate,
        name: `${txnTargetBank} receives transfer`,
        activity: txnDescription || 'Transfer received',
        method: txnMethod,
        amount: txnAmount,
        status: 'Completed',
        description: txnDescription || `Transfer from ${txnBank} to ${txnTargetBank}`,
        attachments: 0,
        type: 'Deposit',
        bank: txnTargetBank,
        recordedBy: user?.name || '—',
        branch: accounts.find((account) => account.name === txnTargetBank)?.branch || '',
      }
      txnsToAdd.push(targetTxn)
    }
    updateState({ ...applyBankMovements(state, movements), bankTxns: [...txnsToAdd, ...state.bankTxns] })
    addAuditLog('BANK_TXN', 'BANK', txn.id, `${txnMode} of ${formatCurrency(txnAmount)} recorded.`)
    triggerAppToast(`${txnMode} completed`, `${formatCurrency(txnAmount)} ${txnMode.toLowerCase()} recorded for ${txnBank}.`)
    setShowTxnForm(false)
  }

  return (
    <AppLayout>
      <div className="txn-shell">
        <div className="txn-header">
          <div>
            <div className="pg-title">Bank Transactions</div>
            <div className="pg-subtitle">Deposits, withdrawals, and transfers recorded against {companyName} accounts.</div>
          </div>
          <div className="txn-actions">
            <button
              className="btn btn-secondary"
              title={bankList.length === 0 ? 'Create a bank account first' : 'Record a deposit transaction'}
              disabled={bankList.length === 0}
              onClick={() => openTxnForm('Deposit')}
            >
              <PlusCircle size={16} style={{ marginRight: 6 }} /> Deposit
            </button>
            <button
              className="btn btn-secondary"
              title={bankList.length === 0 ? 'Create a bank account first' : 'Record a withdrawal transaction'}
              disabled={bankList.length === 0}
              onClick={() => openTxnForm('Withdrawal')}
            >
              <ArrowDown size={16} style={{ marginRight: 6 }} /> Withdraw
            </button>
            <button
              className="btn btn-secondary"
              title={bankList.length <= 1 ? 'Create at least two bank accounts first' : 'Record an inter-bank transfer'}
              disabled={bankList.length <= 1}
              onClick={() => openTxnForm('Transfer')}
            >
              <Repeat size={16} style={{ marginRight: 6 }} /> Transfer
            </button>
            <button className="btn btn-secondary" title="Import a bank statement" onClick={() => handleAction('Import Statement')}>
              <Upload size={16} style={{ marginRight: 6 }} /> Import Statement
            </button>
            <button className="btn btn-secondary" title="Run bank reconciliation" onClick={() => handleAction('Reconcile')}>
              <CheckCircle2 size={16} style={{ marginRight: 6 }} /> Reconcile
            </button>
            <div className="export-dropdown" aria-expanded={showExportDropdown ? 'true' : 'false'}>
              <button className="btn btn-primary export-toggle allow-readonly" type="button" title="Download transaction report" onClick={() => setShowExportDropdown((current) => !current)}>
                <Download size={16} style={{ marginRight: 6 }} /> Export <ArrowDown size={14} className="export-arrow" />
              </button>
              {showExportDropdown && (
                <div className="dropdown-menu">
                  <button type="button" className="dropdown-item allow-readonly" onClick={() => handleExportReport('pdf')}>
                    <span className="dropdown-icon">PDF</span>Export PDF
                  </button>
                  <button type="button" className="dropdown-item allow-readonly" onClick={() => handleExportReport('excel')}>
                    <span className="dropdown-icon">XLSX</span>Export Excel
                  </button>
                </div>
              )}
            </div>
            <button className="btn btn-secondary" title="Toggle transaction filters" type="button" onClick={() => handleAction('Filters')}>
              <Filter size={16} style={{ marginRight: 6 }} /> Filters
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="txn-filter-panel card">
            <div className="txn-form-grid">
              <label>
                <span>Search</span>
                <input type="search" placeholder="Search reference, description, bank, payee or payer..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
              <label>
                <span>Bank</span>
                <select value={filterBank} onChange={(e) => setFilterBank(e.target.value)}>
                  <option>All Banks</option>
                  {bankOptions.map((bank) => (<option key={bank}>{bank}</option>))}
                </select>
              </label>
              <label>
                <span>Transaction Type</span>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option>All Types</option>
                  {transactionTypes.map((type) => (<option key={type}>{type}</option>))}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option>All Status</option>
                  <option>Completed</option>
                  <option>Processing</option>
                  <option>Rejected</option>
                </select>
              </label>
              <label>
                <span>Branch</span>
                <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}>
                  <option>All Branches</option>
                  {branchOptions.map((branch) => <option key={branch}>{branch}</option>)}
                </select>
              </label>
              <label>
                <span>Recorded by</span>
                <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
                  <option>All Users</option>
                  {userOptions.map((name) => <option key={name}>{name}</option>)}
                </select>
              </label>
            </div>
          </div>
        )}
        <div className="txn-summary-grid">
          <div className="txn-summary-card">
            <div className="txn-summary-label">Today's Deposits</div>
            <div className="txn-summary-value">{formatCurrency(summary.deposits)}</div>
          </div>
          <div className="txn-summary-card">
            <div className="txn-summary-label">Today's Withdrawals</div>
            <div className="txn-summary-value">{formatCurrency(summary.withdrawals)}</div>
          </div>
          <div className="txn-summary-card">
            <div className="txn-summary-label">Transfers</div>
            <div className="txn-summary-value">{summary.transfers}</div>
          </div>
          <div className="txn-summary-card">
            <div className="txn-summary-label">Pending Transactions</div>
            <div className="txn-summary-value">{summary.pendingTransactions}</div>
          </div>
          <div className="txn-summary-card">
            <div className="txn-summary-label">Reconciled</div>
            <div className="txn-summary-value">{summary.reconciledRate}%</div>
          </div>
          <div className="txn-summary-card">
            <div className="txn-summary-label">Failed Transfers</div>
            <div className="txn-summary-value">{summary.failedTransfers}</div>
          </div>
        </div>

        {showTxnForm && (
          <div className="txn-modal-overlay">
            <div className="card txn-modal-card">
              <div className="card-hd">
                <div className="card-title">{txnMode} Bank Transaction</div>
              </div>
              <div className="txn-form-grid">
                <label>
                  <span>Date</span>
                  <input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
                </label>
                <label>
                  <span>Bank</span>
                  <select value={txnBank} onChange={(e) => setTxnBank(e.target.value)}>
                    {bankOptions.map((bank) => (<option key={bank} value={bank}>{bank}</option>))}
                  </select>
                </label>
                {txnMode === 'Transfer' && (
                  <label>
                    <span>Transfer To</span>
                    <select value={txnTargetBank} onChange={(e) => setTxnTargetBank(e.target.value)}>
                      {bankOptions.map((bank) => (<option key={bank} value={bank}>{bank}</option>))}
                    </select>
                  </label>
                )}
                <label>
                  <span>Amount</span>
                  <input type="number" min={0} value={txnAmount} onChange={(e) => setTxnAmount(Number(e.target.value))} placeholder="0" />
                </label>
                <label>
                  <span>Method</span>
                  <select value={txnMethod} onChange={(e) => setTxnMethod(e.target.value)}>
                    <option>Bank Transfer</option>
                    <option>Cash</option>
                    <option>Cheque</option>
                    <option>POS</option>
                    <option>Internal Transfer</option>
                  </select>
                </label>
                <label className="txn-form-description">
                  <span>Description</span>
                  <input type="text" value={txnDescription} onChange={(e) => setTxnDescription(e.target.value)} placeholder="Enter a short description" />
                </label>
              </div>
              <div className="btn-group" style={{ justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-primary" type="button" onClick={handleSubmitTxn}>{txnMode} Transaction</button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowTxnForm(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {activeTxnModal && (
          <div className="txn-modal-overlay">
            <div className="card txn-modal-card">
              <div className="card-hd">
                <div className="card-title">{activeTxnModal}</div>
              </div>
              <div className="txn-form-grid">
                {activeTxnModal === 'Import Statement' && (
                  <div className="txn-detail-panel">
                    <label>
                      <span>Account</span>
                      <select value={statementBank} onChange={(event) => setStatementBank(event.target.value)}>
                        {bankOptions.map((bank) => <option key={bank}>{bank}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Statement CSV</span>
                      <input type="file" accept=".csv,text/csv" onChange={async (event) => {
                        const file = event.target.files?.[0]
                        setStatementError('')
                        setStatementText(file ? await file.text() : '')
                      }} />
                    </label>
                    <p className="metric-note">Use columns for date, description, and amount. Debit and credit columns are also accepted. Only the rows in the file are posted.</p>
                    {statementError && <div className="import-error">{statementError}</div>}
                  </div>
                )}
                {activeTxnModal === 'Reconcile' && (
                  <div className="txn-detail-panel">
                    <div className="bank-detail-row"><span>Pending transactions</span><strong>{summary.pendingTransactions}</strong></div>
                    <div className="bank-detail-row"><span>Failed transfers</span><strong>{summary.failedTransfers}</strong></div>
                    <div className="bank-detail-row"><span>Accounts</span><strong>{bankList.length}</strong></div>
                    <p className="metric-note">This marks pending items completed. It does not add or remove money.</p>
                  </div>
                )}
              </div>
              <div className="btn-group" style={{ justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-primary" type="button" onClick={confirmTxnModal}>
                  {activeTxnModal === 'Import Statement' ? 'Import Now' : 'Reconcile'}
                </button>
                <button className="btn btn-secondary" type="button" onClick={closeTxnModal}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        <div className="txn-content-grid">
          <div className="card">
            <div className="card-hd">
              <div className="card-title">Transactions</div>
            </div>
            <div className="tbl-wrap">
              <table className="txn-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reference</th>
                    <th>Bank</th>
                    <th>Description</th>
                    <th>Type</th>
                    <th className="td-r">Debit</th>
                    <th className="td-r">Credit</th>
                    <th className="td-r">Balance</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
                        No transactions match your filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedTransactions.map((txn) => (
                      <tr key={txn.id} onClick={() => setSelectedId(txn.id)} className={selectedId === txn.id ? 'selected' : ''}>
                        <td>{txn.date}</td>
                        <td>{txn.reference}</td>
                        <td>{txn.bank}</td>
                        <td>{txn.activity}</td>
                        <td>{txn.type}</td>
                        <td className="td-r">{txn.debit ? formatCurrency(txn.debit) : '-'}</td>
                        <td className="td-r">{txn.credit ? formatCurrency(txn.credit) : '-'}</td>
                        <td className="td-r">{formatCurrency(txn.balance)}</td>
                        <td>
                          <span className={`txn-pill ${txn.status === 'Rejected' ? 'danger' : txn.status === 'Processing' ? 'warning' : 'success'}`}>{txn.status}</span>
                        </td>
                        <td>
                          <button className="btn btn-sm" title="View transaction details">View</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="txn-footer">
              <div className="txn-per-page">
                <span>Rows per page:</span>
                <div className="per-page-options">
                  {perPageOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`btn btn-sm ${itemsPerPage === option ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => {
                        setItemsPerPage(option)
                        setCurrentPage(1)
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              <div className="txn-pagination">
                <div className="page-info">{pageStart}-{pageEnd} of {filteredTransactions.length}</div>
                <div className="page-controls">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setCurrentPage(Math.max(1, activePage - 1))} disabled={activePage === 1}>‹</button>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setCurrentPage(Math.min(totalPages, activePage + 1))} disabled={activePage === totalPages}>›</button>
                </div>
              </div>
            </div>
          </div>

          <div className="txn-detail-stack">
            <div className="card">
              <div className="card-title">Transaction Details</div>
              <div className="bank-detail-panel">
                <div className="bank-detail-row"><span>Reference</span><strong>{selectedTransaction?.reference || '-'}</strong></div>
                <div className="bank-detail-row"><span>Transaction Date</span><strong>{selectedTransaction?.date || '-'}</strong></div>
                <div className="bank-detail-row"><span>Amount</span><strong>{selectedTransaction ? formatCurrency(selectedTransaction.amount) : '-'}</strong></div>
                <div className="bank-detail-row"><span>Currency</span><strong>₦</strong></div>
                <div className="bank-detail-row"><span>Description</span><strong>{selectedTransaction?.activity || '-'}</strong></div>
                <div className="bank-detail-row"><span>Payment Method</span><strong>{selectedTransaction?.method || '-'}</strong></div>
                <div className="bank-detail-row"><span>Status</span><strong>{selectedTransaction?.status || '-'}</strong></div>
                <div className="bank-detail-row"><span>Recorded by</span><strong>{selectedTransaction?.recordedBy || '—'}</strong></div>
                <div className="bank-detail-row"><span>Branch</span><strong>{selectedTransaction?.branch || '—'}</strong></div>
              </div>
            </div>
            <div className="card">
              <div className="card-title">Related record</div>
              <div className="bank-detail-panel">
                <div className="bank-detail-row"><span>Name</span><strong>{selectedTransaction?.name || '—'}</strong></div>
                <div className="bank-detail-row"><span>Description</span><strong>{selectedTransaction?.description || selectedTransaction?.activity || '—'}</strong></div>
                <div className="bank-detail-row"><span>Account</span><strong>{selectedTransaction?.bank || '—'}</strong></div>
                <div className="bank-detail-row"><span>Attachments</span><strong>{selectedTransaction?.attachments ? selectedTransaction.attachments : 'None'}</strong></div>
              </div>
            </div>
            <div className="card reconciliation-card">
              <div className="card-title">Reconciliation</div>
              <div className="bank-detail-panel">
                <div className="bank-detail-row"><span>Running balance</span><strong>{formatCurrency(selectedTransaction?.balance ?? 0)}</strong></div>
                <div className="bank-detail-row"><span>Account balance</span><strong>{formatCurrency(accounts.find((account) => account.name === selectedTransaction?.bank)?.balance ?? 0)}</strong></div>
                <div className="bank-detail-row"><span>Status</span><strong>{selectedTransaction?.status || '—'}</strong></div>
              </div>
              <div className="txn-recon-actions">
                <button className="btn btn-primary" type="button" disabled={!selectedTransaction || selectedTransaction.status === 'Completed'} onClick={() => {
                  if (!selectedTransaction) return
                  updateState({ bankTxns: state.bankTxns.map((txn) => txn.id === selectedTransaction.id ? { ...txn, status: 'Completed' } : txn) })
                  triggerAppToast('Reconcile', 'Transaction marked completed.')
                }}>Mark matched</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
