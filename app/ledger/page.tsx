'use client'

import { useMemo, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting } from '@/lib/context'
import { formatCurrency, formatNumber, triggerAppToast, makeID } from '@/lib/utils'
import { downloadExcel, downloadPdf } from '@/lib/export-utils'
import { calculateBalanceSheet } from '@/lib/accounting/balance-sheet'
import { postJournalEntry } from '@/lib/accounting/ledger'
import { isUuid } from '@/lib/accounting/sync'
import ManualJournalModal from '@/components/modals/ManualJournalModal'
import TrialBalanceModal from '@/components/modals/TrialBalanceModal'

function buildLedgerEntries(state: ReturnType<typeof useAccounting>['state']) {
  const accountMap = new Map(state.chartOfAccounts.map((account) => [account.id, account]))

  return state.journalEntries.flatMap((entry) => {
    const lines = state.journalLines.filter((line) => line.entryId === entry.id)
    return lines.length > 0 ? lines.map((line) => {
      const account = accountMap.get(line.accountId)
      return { id: `${entry.id}-${line.id}`, journalId: entry.id, date: entry.entryDate, account: account?.name || 'Unknown account', accountCode: account?.code || '—', accountType: account?.accountType || '', description: line.description || entry.description, debit: line.debit, credit: line.credit, balance: line.debit - line.credit, source: entry.sourceModule, status: entry.status, entry }
    }) : [{ id: entry.id, journalId: entry.id, date: entry.entryDate, account: 'No posting lines', accountCode: '—', accountType: '', description: entry.description, debit: 0, credit: 0, balance: 0, source: entry.sourceModule, status: entry.status, entry }]
  })
}

const sourceOptions = ['All Sources', 'Sales', 'Purchases', 'Expenses', 'Inventory', 'Payroll', 'Banking', 'Loans', 'Manual Journal', 'Adjustments']
const statusOptions = ['Posted', 'Pending', 'Draft', 'Reversed']
const typeOptions = ['Assets', 'Liabilities', 'Equity', 'Revenue', 'Expense']
const branchOptions = ['All Branches', 'Lagos', 'Abuja', 'Enugu', 'Port Harcourt']

export default function LedgerPage() {
  const { state, updateState, addAuditLog } = useAccounting()
  const companyName = state.companySettings.companyName || 'Company'
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedAccount, setSelectedAccount] = useState('All Accounts')
  const [selectedType, setSelectedType] = useState('All Types')
  const [selectedBranch, setSelectedBranch] = useState('All Branches')
  const [selectedSource, setSelectedSource] = useState('All Sources')
  const [selectedStatus, setSelectedStatus] = useState('Posted')
  const [selectedSort, setSelectedSort] = useState('Newest')
  const [showFilters, setShowFilters] = useState(true)
  const [showManualModal, setShowManualModal] = useState(false)
  const [showTrialModal, setShowTrialModal] = useState(false)
  const [selectedEntryIndex, setSelectedEntryIndex] = useState<number>(0)

  const journalEntries = useMemo(() => buildLedgerEntries(state), [state])
  const accounts = useMemo(() => state.chartOfAccounts.filter((account) => account.isActive !== false), [state.chartOfAccounts])

  const filteredEntries = useMemo(() => {
    const query = searchTerm.toLowerCase()

    const result = journalEntries.filter((entry) => {
      const matchesSearch = !query || [entry.id, entry.account, entry.description, entry.source].join(' ').toLowerCase().includes(query)
      const matchesAccount = selectedAccount === 'All Accounts' || entry.account === selectedAccount
      const accountTypeMap: Record<string, string> = { Assets: 'ASSET', Liabilities: 'LIABILITY', Equity: 'EQUITY', Revenue: 'INCOME', Expense: 'EXPENSE' }
      const matchesType = selectedType === 'All Types' || entry.accountType === accountTypeMap[selectedType]
      const matchesSource = selectedSource === 'All Sources' || entry.source === selectedSource || entry.source === selectedSource.toUpperCase()
      const matchesStatus = selectedStatus === 'All Status' ? true : entry.status === selectedStatus.toUpperCase()
      const matchesBranch = selectedBranch === 'All Branches' || selectedBranch === 'Lagos'

      return matchesSearch && matchesAccount && matchesType && matchesSource && matchesStatus && matchesBranch
    })

    if (selectedSort === 'Newest') {
      result.sort((a, b) => b.date.localeCompare(a.date))
    } else if (selectedSort === 'Oldest') {
      result.sort((a, b) => a.date.localeCompare(b.date))
    } else if (selectedSort === 'Largest Debit') {
      result.sort((a, b) => b.debit - a.debit)
    } else if (selectedSort === 'Largest Credit') {
      result.sort((a, b) => b.credit - a.credit)
    }

    return result
  }, [journalEntries, searchTerm, selectedAccount, selectedBranch, selectedSource, selectedSort, selectedStatus, selectedType])

  const selectedEntry = filteredEntries[selectedEntryIndex] || filteredEntries[0]
  const selectedAccountData = accounts.find((account) => account.name === selectedEntry?.account)
  const selectedAccountLines = selectedAccountData ? state.journalLines.filter((line) => line.accountId === selectedAccountData.id) : []
  const selectedAccountDebit = selectedAccountLines.reduce((sum, line) => sum + line.debit, 0)
  const selectedAccountCredit = selectedAccountLines.reduce((sum, line) => sum + line.credit, 0)
  const selectedAccountBalance = selectedAccountData?.normalBalance === 'CREDIT' ? selectedAccountCredit - selectedAccountDebit : selectedAccountDebit - selectedAccountCredit

  const balanceRows: Array<{ accountType: string; balance?: number }> = calculateBalanceSheet(state.journalLines, state.journalEntries, state.chartOfAccounts)
  const totalAssets = balanceRows.filter((row) => row.accountType === 'ASSET').reduce((sum, row) => sum + (row.balance || 0), 0)
  const totalLiabilities = balanceRows.filter((row) => row.accountType === 'LIABILITY').reduce((sum, row) => sum + (row.balance || 0), 0)
  const totalEquity = balanceRows.filter((row) => row.accountType === 'EQUITY').reduce((sum, row) => sum + (row.balance || 0), 0)

  const todaysDate = new Date().toISOString().slice(0, 10)
  const todaysEntries = state.journalEntries.filter((je) => je.entryDate === todaysDate).length
  const unpostedCount = state.journalEntries.filter((je) => je.status !== 'POSTED').length
  const openPeriod = state.accountingPeriods?.find((p) => p.status === 'OPEN')
  const periodLabel = openPeriod ? new Date(openPeriod.startDate || openPeriod.start_date).toLocaleString(undefined, { month: 'long', year: 'numeric' }) : '—'

  const summaryCards = [
    { label: 'Total Assets', value: formatCurrency(totalAssets), tone: 'info' },
    { label: 'Total Liabilities', value: formatCurrency(totalLiabilities), tone: 'info' },
    { label: 'Total Equity', value: formatCurrency(totalEquity), tone: 'info' },
    { label: "Today's Journal Entries", value: formatNumber(todaysEntries), tone: 'info' },
    { label: 'Unposted Journals', value: formatNumber(unpostedCount), tone: unpostedCount > 0 ? 'warning' : 'info' },
    { label: 'Current Accounting Period', value: periodLabel, tone: 'info' },
  ]

  const handleLedgerAction = (action: string) => {
    triggerAppToast(action, 'The ledger workflow has been queued.')
    if (action === 'Export Excel') {
      downloadExcel('general-ledger.xlsx', filteredEntries)
      return
    }
    if (action === 'Export PDF') {
      downloadPdf('general-ledger.pdf', 'General Ledger', filteredEntries.map((e) => ({ id: e.id, account: e.account, date: e.date, debit: e.debit, credit: e.credit })), companyName)
      return
    }
    if (action === 'Print') {
      triggerAppToast('Print', 'Preparing print preview...')
      return
    }
    if (action === '+ Manual Journal') {
      setShowManualModal(true)
      return
    }
    if (action === 'Trial Balance') {
      setShowTrialModal(true)
      return
    }
  }

  const handleCreateManualJournal = (input: any) => {
    const result = postJournalEntry({ ...input, entryDate: input.entryDate || todaysDate }, state.chartOfAccounts, state.accountingPeriods)
    if (result.error || !result.entry || !result.lines) {
      triggerAppToast('Manual Journal', result.error || 'Manual journal could not be posted.')
      return
    }
    updateState({ journalEntries: [result.entry, ...state.journalEntries], journalLines: [...result.lines, ...state.journalLines] })
    addAuditLog('CREATE', 'JOURNAL', result.entry.id, 'Manual journal entry created')
    triggerAppToast('Manual Journal', 'Manual journal saved')
  }

  return (
    <AppLayout>
      <div className="ledger-shell">
        <div className="ledger-header">
          <div>
            <div className="pg-title">General Ledger</div>
            <div className="pg-subtitle">View all journal entries, account balances, and financial transactions posted across the organization.</div>
          </div>
          <div className="ledger-actions">
            <button className="ledger-btn secondary" type="button" onClick={() => handleLedgerAction('+ Manual Journal')}>+ Manual Journal</button>
            <button className="ledger-btn secondary" type="button" onClick={() => handleLedgerAction('Trial Balance')}>Trial Balance</button>
            <button className="ledger-btn secondary allow-readonly" type="button" onClick={() => handleLedgerAction('Export Excel')}>Export Excel</button>
            <button className="ledger-btn secondary" type="button" onClick={() => setShowFilters((visible) => !visible)} aria-expanded={showFilters}>
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
            <button className="ledger-btn secondary allow-readonly" type="button" onClick={() => handleLedgerAction('Export PDF')}>Export PDF</button>
            <button className="ledger-btn primary" type="button" onClick={() => handleLedgerAction('Print')}>Print</button>
          </div>
        </div>

        <div className="ledger-summary-grid">
          {summaryCards.map((card) => (
            <div className={`ledger-summary-card ${card.tone}`} key={card.label}>
              <div className="ledger-summary-label">{card.label}</div>
              <div className="ledger-summary-value">{card.value}</div>
            </div>
          ))}
        </div>

        {showFilters && (
          <div className="ledger-card">
            <div className="section-head">
              <div>
                <div className="card-title">Search & Filters</div>
                <div className="section-subtitle">Filter by account, source, status, and date to investigate the ledger quickly.</div>
              </div>
            </div>

            <div className="ledger-search-row">
              <div className="ledger-search-field">
                <span>🔎</span>
                <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search journal entries..." />
              </div>
              <div className="ledger-chip-row">
                <span className="ledger-chip success">Auto-posted</span>
                <span className="ledger-chip">Audit ready</span>
              </div>
            </div>

            <div className="ledger-filters-grid">
              <label>
                <span>Date Filter</span>
                <select defaultValue="Last 30 Days">
                  <option>Today</option><option>Yesterday</option><option>Last 7 Days</option><option>Last 30 Days</option><option>This Month</option><option>Last Month</option><option>This Quarter</option><option>This Year</option><option>Custom Date</option>
                </select>
              </label>
              <label>
                <span>Account</span>
                <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}>
                  {['All Accounts', ...accounts.map((account) => account.name)].map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span>Account Type</span>
                <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                  <option>All Types</option>
                  {typeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span>Branch</span>
                <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
                  {branchOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span>Journal Source</span>
                <select value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)}>
                  {sourceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
                  <option>All Status</option>
                  {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span>Sort</span>
                <select value={selectedSort} onChange={(e) => setSelectedSort(e.target.value)}>
                  <option>Newest</option><option>Oldest</option><option>Largest Debit</option><option>Largest Credit</option><option>Account Name</option>
                </select>
              </label>
            </div>
          </div>
        )}

        <div className="ledger-content-grid">
          <div className="ledger-card">
            <div className="section-head">
              <div>
                <div className="card-title">Ledger Entries</div>
                <div className="section-subtitle">Showing {filteredEntries.length} journal entries.</div>
              </div>
            </div>
            <div className="ledger-table-wrap">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Journal No</th>
                    <th>Account</th>
                    <th>Description</th>
                    <th>Debit</th>
                    <th>Credit</th>
                    <th>Balance</th>
                    <th>Source</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry, idx) => (
                    <tr key={entry.id} onClick={() => setSelectedEntryIndex(idx)} className={selectedEntry?.id === entry.id ? 'selected' : ''}>
                      <td>{entry.date}</td>
                      <td>{entry.journalId}</td>
                      <td>{entry.account}</td>
                      <td>{entry.description}</td>
                      <td>{formatCurrency(entry.debit)}</td>
                      <td>{entry.credit > 0 ? formatCurrency(entry.credit) : '—'}</td>
                      <td>{formatCurrency(entry.balance)}</td>
                      <td>{entry.source}</td>
                      <td><span className={`ledger-pill ${entry.status === 'POSTED' ? 'success' : entry.status === 'DRAFT' ? 'warning' : 'info'}`}>{entry.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ledger-side-stack">
            <div className="ledger-card">
              <div className="section-head">
                <div>
                  <div className="card-title">Account Balance</div>
                  <div className="section-subtitle">Selected account details.</div>
                </div>
              </div>
              <div className="ledger-detail-panel">
                <div className="ledger-detail-row"><span>Account Code</span><strong>{selectedAccountData?.code || '—'}</strong></div>
                <div className="ledger-detail-row"><span>Account Name</span><strong>{selectedEntry?.account || 'Cash'}</strong></div>
                <div className="ledger-detail-row"><span>Opening Balance</span><strong>{formatCurrency(selectedAccountData?.openingBalance || 0)}</strong></div>
                <div className="ledger-detail-row"><span>Total Debits</span><strong>{formatCurrency(selectedAccountDebit)}</strong></div>
                <div className="ledger-detail-row"><span>Total Credits</span><strong>{formatCurrency(selectedAccountCredit)}</strong></div>
                <div className="ledger-detail-row"><span>Current Balance</span><strong>{formatCurrency((selectedAccountData?.openingBalance || 0) + selectedAccountBalance)}</strong></div>
              </div>
            </div>

            <div className="ledger-card">
              <div className="section-head">
                <div>
                  <div className="card-title">Trial Balance Preview</div>
                  <div className="section-subtitle">A live view of the period balance.</div>
                </div>
              </div>
              <div className="ledger-balance-list">
                {accounts.map((account) => {
                  const lines = state.journalLines.filter((line) => line.accountId === account.id)
                  const debit = lines.reduce((sum, line) => sum + line.debit, 0)
                  const credit = lines.reduce((sum, line) => sum + line.credit, 0)
                  const balance = account.normalBalance === 'CREDIT' ? credit - debit : debit - credit
                  return <div className="ledger-balance-row" key={account.id}><span>{account.name}</span><strong>{formatCurrency((account.openingBalance || 0) + balance)}</strong></div>
                })}
              </div>
            </div>

            <div className="ledger-card">
              <div className="section-head">
                <div>
                  <div className="card-title">Month-End Controls</div>
                  <div className="section-subtitle">Close and manage the accounting period.</div>
                </div>
              </div>
              <div className="ledger-detail-panel">
                <div className="ledger-detail-row"><span>Current Period</span><strong>{periodLabel}</strong></div>
                <div className="ledger-detail-row"><span>Period Status</span><strong>{openPeriod?.status || '—'}</strong></div>
                <div className="ledger-detail-row"><span>Period End</span><strong>{openPeriod?.endDate || openPeriod?.end_date || '—'}</strong></div>
              </div>
              <div className="ledger-pill-group">
                <button className="ledger-btn secondary">Close Period</button>
                <button className="ledger-btn secondary">Lock Period</button>
              </div>
            </div>
          </div>
        </div>
        <ManualJournalModal open={showManualModal} onClose={() => setShowManualModal(false)} onCreate={handleCreateManualJournal} accounts={accounts.filter((account) => isUuid(account.id))} />
        <TrialBalanceModal open={showTrialModal} onClose={() => setShowTrialModal(false)} rows={filteredEntries.map((e) => ({ account: e.account, debit: e.debit, credit: e.credit }))} />
      </div>
    </AppLayout>
  )
}

// Render modals at module level export

