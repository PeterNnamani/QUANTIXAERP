'use client'

import { useMemo, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting } from '@/lib/context'
import { buildManagementAccounts, type ManagementAccounts, type ReportPeriod } from '@/lib/management-accounts'
import { triggerAppToast } from '@/lib/utils'

const defaultPeriods: ReportPeriod[] = [
  { label: 'Oct-Mar', startDate: '2025-10-01', endDate: '2026-03-31' },
  ...['Apr', 'May', 'Jun', 'Jul', 'Aug'].map((label, index) => ({ label, startDate: `2026-${String(index + 4).padStart(2, '0')}-01`, endDate: `2026-${String(index + 4).padStart(2, '0')}-31` })),
]
const tabs = ['TB', 'SFP', 'P&L', 'NOTES', 'NOTES II', 'PPE'] as const
type Tab = typeof tabs[number]
const formatAmount = (value: number, currency = 'NGN') => new Intl.NumberFormat('en-NG', { style: 'currency', currency, currencyDisplay: 'symbol', minimumFractionDigits: 2 }).format(value)
const reportInput = (state: ReturnType<typeof useAccounting>['state']) => ({ ...state, companyName: state.companySettings.companyName, currency: state.companySettings.currency || 'NGN' })

function Status({ ok, label }: { ok: boolean; label: string }) { return <span className={`management-status ${ok ? 'ok' : 'fail'}`}>{ok ? '✓' : '!'} {label}</span> }

function ReportTable({ title, columns, rows, currency, onValueClick }: { title?: string; columns: string[]; rows: Array<{ label: string; note?: number; values: number[]; total?: number; kind?: 'section' | 'expense' }>; currency: string; onValueClick?: (note?: number) => void }) {
  return <div className="management-table-wrap">{title && <h3>{title}</h3>}<table className="management-table"><thead><tr><th>ITEM</th><th>NOTE</th>{columns.map((column) => <th className="amount" key={column}>{column}<small>{currency === 'NGN' ? '₦' : currency}</small></th>)}</tr></thead><tbody>{rows.map((row) => row.kind === 'section' ? <tr key={row.label} className="report-section-row"><td colSpan={columns.length + 2}>{row.label}</td></tr> : <tr key={`${row.label}-${row.note || ''}`} className={row.label.toUpperCase() === row.label || row.label.includes('TOTAL') || row.label.includes('Profit') ? 'emphasis' : ''}><td><button type="button" className="management-link" onClick={() => onValueClick?.(row.note)}>{row.label}</button></td><td>{row.note || ''}</td>{columns.map((column, index) => <td className="amount" key={`${row.label}-${column}`}>{formatAmount(row.values[index] ?? (index === columns.length - 1 ? row.total || 0 : 0), currency)}</td>)}</tr>)}</tbody></table></div>
}

function StatusPanel({ report }: { report: ManagementAccounts }) { return <div className="management-validation"><strong>Validation dashboard</strong><Status ok={report.validation.trialBalance} label="TB debits = credits" /><Status ok={report.validation.statementOfFinancialPosition} label="SFP balances" /><Status ok={report.validation.notes} label="Notes tie to face statements" /><span className={report.validation.canSignOff ? 'signoff-ready' : 'signoff-blocked'}>{report.validation.canSignOff ? 'Ready for sign-off' : 'Sign-off blocked'}</span></div> }

export default function ReportsPage() {
  const { state } = useAccounting()
  const [activeTab, setActiveTab] = useState<Tab>('SFP')
  const [periods, setPeriods] = useState(defaultPeriods)
  const [periodEnd, setPeriodEnd] = useState(defaultPeriods[defaultPeriods.length - 1].endDate)
  const currency = state.companySettings.currency || 'NGN'
  const report = useMemo(() => buildManagementAccounts(reportInput(state), periods), [state, periods])
  const pnlRows = useMemo(() => {
    const expenseIndex = report.pnl.rows.findIndex((row) => row.kind === 'expense')
    if (expenseIndex < 0) return report.pnl.rows
    return [...report.pnl.rows.slice(0, expenseIndex), { label: 'EXPENSES', values: [], total: 0, kind: 'section' as const }, ...report.pnl.rows.slice(expenseIndex)]
  }, [report])
  const pnlExportRows = pnlRows
  const updatePeriod = (index: number, field: keyof ReportPeriod, value: string) => setPeriods((current) => current.map((period, periodIndex) => periodIndex === index ? { ...period, [field]: value } : period))
  const navigateToNote = (note?: number) => { if (note) setActiveTab(note >= 9 ? 'NOTES II' : note === 1 ? 'PPE' : 'NOTES') }
  const exportExcel = async () => {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    const append = (name: string, rows: Array<Array<string | number | { f: string }>>) => {
      const sheet = XLSX.utils.aoa_to_sheet([[state.companySettings.companyName || 'Company'], [name], ...rows])
      const blue = { patternType: 'solid', fgColor: { rgb: '1A3A7C' } }
      const whiteBold = { bold: true, color: { rgb: 'FFFFFF' } }
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1')
      for (let row = range.s.r; row <= range.e.r; row += 1) {
        for (let column = range.s.c; column <= range.e.c; column += 1) {
          const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })] as ({ v?: unknown; s?: { fill?: typeof blue; font?: typeof whiteBold } } | undefined)
          if (!cell) continue
          const value = String(cell.v ?? '')
          if (row === 2 || value === 'EXPENSES' || value === 'ACCUMULATED DEPRECIATION:' || value === 'CARRYING AMOUNT' || value.toUpperCase().includes('TOTAL')) {
            cell.s = { fill: blue, font: whiteBold }
          }
        }
      }
      XLSX.utils.book_append_sheet(workbook, sheet, name)
    }
    const rowsFor = (rows: Array<{ label: string; note?: number; values: number[]; total?: number; kind?: 'section' | 'expense' }>, columns: string[]) => [['ITEM', 'NOTE', ...columns], ...rows.map((row) => [row.label, row.note || '', ...(row.kind === 'section' ? columns.map(() => '') : columns.map((_, index) => row.values[index] ?? row.total ?? 0))])]
    const tbStart = 4; const tbEnd = tbStart + report.trialBalance.left.length - 1
    append('TB', [['ITEM', 'DEBIT (₦)', 'CREDIT (₦)'], ...report.trialBalance.left.map((row) => [row.label, row.values[0], row.values[1]]), ['TOTAL', { f: `SUM(B${tbStart}:B${tbEnd})` }, { f: `SUM(C${tbStart}:C${tbEnd})` }]])
    append('SFP', rowsFor(report.sfp.rows, ['AMOUNT']))
    append('P&L', rowsFor(pnlExportRows, [...periods.map((period) => period.label), 'Total']))
    append('NOTES', Object.entries(report.notes).flatMap(([note, rows]) => [[`Note ${note}`], ...rowsFor(rows, ['AMOUNT'])]))
    append('NOTES II', [9, 10, 11, 12].flatMap((note) => [[`Note ${note}`], ...rowsFor(report.notesII[note].rows, report.notesII[note].columns)]))
    append('PPE', rowsFor(report.ppe.rows, [...report.ppe.classes, 'Total']))
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true })
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); const link = document.createElement('a'); link.href = url; link.download = 'management-accounts.xlsx'; link.click(); URL.revokeObjectURL(url)
  }
  const exportPdf = () => { window.print(); triggerAppToast('PDF export', 'Use the print dialog to save the selected report as PDF.') }

  return <AppLayout><div className="management-accounts-shell"><div className="pg-hd management-header"><div><div className="pg-title">Management Accounts</div><div className="pg-subtitle">Linked financial statements from the posted ledger.</div></div><div className="management-actions"><button className="action-btn secondary allow-readonly" type="button" onClick={() => void exportExcel()}>Export Excel</button><button className="action-btn secondary allow-readonly" type="button" onClick={exportPdf}>Export PDF</button></div></div><div className="management-controls"><label>Period end<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>{periods.map((period, index) => <div className="period-editor" key={`${index}-${period.label}`}><input aria-label={`Period ${index + 1} label`} value={period.label} onChange={(event) => updatePeriod(index, 'label', event.target.value)} /><input aria-label={`Period ${index + 1} start`} type="date" value={period.startDate} onChange={(event) => updatePeriod(index, 'startDate', event.target.value)} /><input aria-label={`Period ${index + 1} end`} type="date" value={period.endDate} onChange={(event) => updatePeriod(index, 'endDate', event.target.value)} /></div>)}<button className="action-btn secondary" type="button" onClick={() => setPeriods((current) => [...current, { label: 'New period', startDate: periodEnd, endDate: periodEnd }])}>Add period</button></div><StatusPanel report={report} /><nav className="management-tabs" aria-label="Management accounts reports">{tabs.map((tab) => <button className={activeTab === tab ? 'active' : ''} key={tab} type="button" onClick={() => setActiveTab(tab)}>{tab}</button>)}</nav><section className="management-report" aria-live="polite"><h1>{state.companySettings.companyName || 'Company'}</h1><h2>{activeTab === 'SFP' ? `STATEMENT OF FINANCIAL POSITION AS AT ${periodEnd}` : activeTab === 'P&L' ? 'STATEMENT OF PROFIT OR LOSS' : activeTab === 'TB' ? 'TRIAL BALANCE' : activeTab === 'PPE' ? 'PPE SCHEDULE' : activeTab}</h2>{activeTab === 'TB' && <div className="management-two-column"><ReportTable title="Income Statement + Supporting Accounts" columns={['DEBIT (₦)', 'CREDIT (₦)']} rows={report.trialBalance.left} currency={currency} /><ReportTable title="Balance Sheet Accounts" columns={['DEBIT (₦)', 'CREDIT (₦)']} rows={report.trialBalance.right} currency={currency} /></div>}{activeTab === 'SFP' && <ReportTable columns={['AMOUNT']} rows={report.sfp.rows} currency={currency} onValueClick={navigateToNote} />}{activeTab === 'P&L' && <><ReportTable columns={[...periods.map((period) => period.label), 'Total']} rows={pnlRows} currency={currency} /><p className="management-footnote">Gross Margin: {(report.pnl.grossMargin * 100).toFixed(2)}% | Retained Earnings and Drawings are linked to this statement.</p></>}{activeTab === 'NOTES' && <>{Object.entries(report.notes).map(([note, rows]) => <ReportTable key={note} title={`Note ${note}`} columns={['AMOUNT']} rows={rows} currency={currency} />)}</>}{activeTab === 'NOTES II' && <>{[9, 10, 11, 12].map((note) => <ReportTable key={note} title={`Note ${note}`} columns={report.notesII[note].columns} rows={report.notesII[note].rows} currency={currency} />)}</>}{activeTab === 'PPE' && <ReportTable columns={[...report.ppe.classes, 'Total']} rows={report.ppe.rows} currency={currency} />}</section></div></AppLayout>
}
