'use client'

import { useEffect, useMemo, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting } from '@/lib/context'
import { downloadExcel, downloadFinancialReportPdf, managementAccountsToExportSections, setExportCompanyName } from '@/lib/export-utils'
import { buildManagementAccounts } from '@/lib/management-accounts'
import { appendVatSection, nextReportRun, outputVat, sectionsToExcelRows, selectAnnualSections, taxPackageSection, yearPeriod, type ReportMode } from '@/lib/report-controls'
import { formatCurrency, triggerAppToast } from '@/lib/utils'
import FinancialReportSections from '@/components/financial-report-sections'

const scheduleKey = 'quantixa:annual-report-schedule'
const statements = ['All statements', 'Profit & Loss', 'Financial Position', 'Property, Plant & Equipment']

export default function AnnualReportPage() {
    const { state } = useAccounting()
    const [year, setYear] = useState(new Date().getUTCFullYear())
    const [reportMode, setReportMode] = useState<ReportMode>('summary')
    const [selectedStatement, setSelectedStatement] = useState('All statements')
    const [includeVAT, setIncludeVAT] = useState(false)
    const [statusMessage, setStatusMessage] = useState('Annual report generated for the current year.')
    const [scheduledFor, setScheduledFor] = useState('')

    useEffect(() => {
        const stored = window.localStorage.getItem(scheduleKey)
        if (stored) setScheduledFor(stored)
    }, [])

    const period = useMemo(() => yearPeriod(year), [year])
    const exportReport = useMemo(() => buildManagementAccounts({ ...state, companyName: state.companySettings.companyName, currency: state.companySettings.currency || 'NGN' }, [period]), [state, period])
    const revenueRow = exportReport.pnl.rows.find((row) => row.label === 'Revenue')
    const profitRow = exportReport.pnl.rows.find((row) => row.label === 'Profit/(Loss) for the Period')
    const taxInclusive = state.companySettings.taxInclusive !== false
    const revenue = revenueRow?.total || 0
    const profit = profitRow?.total || 0
    const modeSections = selectAnnualSections(managementAccountsToExportSections(exportReport, false), reportMode, selectedStatement)
    const sections = [
        ...(includeVAT ? appendVatSection(modeSections, revenueRow?.values || [], [period.label], 0.075, taxInclusive) : modeSections),
        ...(reportMode === 'tax' ? [taxPackageSection(revenue, profit, 0.075, taxInclusive)] : []),
    ]
    const totalAssets = exportReport.sfp.totalAssets
    const vatAmount = includeVAT || reportMode === 'tax' ? outputVat(revenue, 0.075, taxInclusive) : 0
    const modeLabel = (mode: ReportMode) => mode === 'board' ? 'Board report' : mode === 'tax' ? 'Tax package' : 'Annual summary'

    const exportCurrentReport = () => {
        void downloadFinancialReportPdf({
            filename: `annual-report-${year}.pdf`, reportTitle: 'Annual Report', periodLabel: `${period.label} | ${modeLabel(reportMode)}`, companyName: state.companySettings.companyName,
            highlights: [{ label: 'Revenue', value: formatCurrency(revenue) }, { label: 'Net profit', value: formatCurrency(profit) }, { label: 'Total assets', value: formatCurrency(totalAssets) }, { label: 'Cash', value: formatCurrency(exportReport.notes[2]?.at(-1)?.total || 0) }, ...((includeVAT || reportMode === 'tax') ? [{ label: 'Output VAT', value: formatCurrency(vatAmount) }] : [])],
            sections,
            notes: [`Report mode: ${reportMode}; selected statement: ${selectedStatement}.`, `VAT is ${includeVAT || reportMode === 'tax' ? 'included in the report calculation.' : 'not included in this export.'}`, 'Amounts are calculated from non-void records in the selected accounting year.'],
        })
    }

    const handleAction = (action: string) => {
        if (action === 'Schedule Report') {
            const nextRun = nextReportRun('annual')
            window.localStorage.setItem(scheduleKey, nextRun)
            setScheduledFor(nextRun)
            const message = `Annual report scheduled. The next run is ${nextRun}.`
            setStatusMessage(message)
            triggerAppToast('Schedule Report', message)
            return
        }
        const message = `${modeLabel(reportMode)} prepared for ${period.label}.`
        setStatusMessage(message)
        triggerAppToast(action, message)
        if (action === 'Export PDF') exportCurrentReport()
        if (action === 'Export Excel') {
            setExportCompanyName(state.companySettings.companyName)
            downloadExcel(`annual-report-${year}.xlsx`, sectionsToExcelRows(sections))
        }
    }

    return (
        <AppLayout>
            <div className="report-shell">
                <div className="page-header report-header">
                    <div>
                        <div className="pg-title">Annual Reports</div>
                        <div className="pg-subtitle">Complete yearly financial analysis, business growth, and strategic performance.</div>
                    </div>
                    <div className="page-actions">
                        <button className="action-btn primary" type="button" onClick={() => { setReportMode('summary'); setStatusMessage(`Annual summary prepared for ${period.label}.`); triggerAppToast('Generate Annual Report', `Annual summary prepared for ${period.label}.`) }}>Generate Annual Report</button>
                        <button className="action-btn secondary" type="button" onClick={() => { setReportMode('board'); setStatusMessage(`Board report prepared for ${period.label}.`); triggerAppToast('Board Report', `Board report prepared for ${period.label}.`) }}>Board Report</button>
                        <button className="action-btn secondary allow-readonly" type="button" onClick={() => handleAction('Export PDF')}>Export PDF</button>
                        <button className="action-btn secondary allow-readonly" type="button" onClick={() => handleAction('Export Excel')}>Export Excel</button>
                        <button className="action-btn secondary" type="button" onClick={() => { setReportMode('tax'); setStatusMessage(`Tax package prepared for ${period.label}.`); triggerAppToast('Tax Package', `Tax package prepared for ${period.label}.`) }}>Tax Package</button>
                        <button className="action-btn secondary" type="button" onClick={() => handleAction('Schedule Report')}>Schedule Report</button>
                        <label><input type="checkbox" checked={includeVAT} onChange={(event) => setIncludeVAT(event.target.checked)} /> Calculate VAT on export</label>
                    </div>
                </div>

                <div className="management-controls">
                    <label>Year<input aria-label="Report year" type="number" min={2000} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value) || new Date().getUTCFullYear())} /></label>
                    <label>Statement
                        <select aria-label="Annual statement" value={selectedStatement} onChange={(event) => { setSelectedStatement(event.target.value); setReportMode('summary') }}>
                            {statements.map((statement) => <option key={statement}>{statement}</option>)}
                        </select>
                    </label>
                </div>

                <div className="report-card">
                    <div className="card-hd">
                        <div>
                            <div className="card-title">{modeLabel(reportMode)}</div>
                            <div className="section-subtitle">{period.label}. {statusMessage}{scheduledFor ? ` Next scheduled run: ${scheduledFor}.` : ''}</div>
                        </div>
                    </div>
                    <FinancialReportSections sections={sections} />
                </div>
            </div>
        </AppLayout>
    )
}
