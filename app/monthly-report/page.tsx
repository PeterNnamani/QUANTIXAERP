'use client'

import { useEffect, useMemo, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting } from '@/lib/context'
import { downloadExcel, downloadFinancialReportPdf, managementAccountsToExportSections, setExportCompanyName } from '@/lib/export-utils'
import { buildManagementAccounts } from '@/lib/management-accounts'
import { appendVatSection, monthPeriod, nextReportRun, outputVat, previousPeriod, reportPeriod, sectionsToExcelRows, type ReportRange } from '@/lib/report-controls'
import { formatCurrency, triggerAppToast } from '@/lib/utils'
import FinancialReportSections from '@/components/financial-report-sections'

const scheduleKey = 'quantixa:monthly-report-schedule'

export default function MonthlyReportPage() {
    const { state } = useAccounting()
    const today = new Date().toISOString().slice(0, 10)
    const [activeRange, setActiveRange] = useState<ReportRange>('Monthly')
    const [month, setMonth] = useState(today.slice(0, 7))
    const [anchorDate, setAnchorDate] = useState(today)
    const [compare, setCompare] = useState(false)
    const [includeVAT, setIncludeVAT] = useState(false)
    const [statusMessage, setStatusMessage] = useState('Report generated for the current month.')
    const [scheduledFor, setScheduledFor] = useState('')

    useEffect(() => {
        const stored = window.localStorage.getItem(scheduleKey)
        if (stored) setScheduledFor(stored)
    }, [])

    const periods = useMemo(() => {
        const currentPeriod = activeRange === 'Monthly' ? monthPeriod(month) : reportPeriod(activeRange, anchorDate)
        return compare ? [previousPeriod(currentPeriod), currentPeriod] : [currentPeriod]
    }, [activeRange, anchorDate, compare, month])
    const exportReport = useMemo(() => buildManagementAccounts({ ...state, companyName: state.companySettings.companyName, currency: state.companySettings.currency || 'NGN' }, periods), [state, periods])
    const revenueRow = exportReport.pnl.rows.find((row) => row.label === 'Revenue')
    const profitRow = exportReport.pnl.rows.find((row) => row.label === 'Profit/(Loss) for the Period')
    const taxInclusive = state.companySettings.taxInclusive !== false
    const sections = includeVAT ? appendVatSection(managementAccountsToExportSections(exportReport), revenueRow?.values || [], periods.map((period) => period.label), 0.075, taxInclusive) : managementAccountsToExportSections(exportReport)
    const inventoryValue = state.inventory.reduce((sum, item) => sum + item.unitCost * item.closing, 0)
    const periodLabel = periods.map((period) => period.label).join(compare ? ' compared with ' : '')
    const vatAmount = includeVAT ? outputVat(revenueRow?.total || 0, 0.075, taxInclusive) : 0

    const exportCurrentReport = (action: 'Export PDF' | 'Export Excel') => {
        if (action === 'Export PDF') {
            void downloadFinancialReportPdf({
                filename: `monthly-report-${activeRange.toLowerCase()}.pdf`, reportTitle: 'Monthly Report', periodLabel: `${periodLabel} | ${activeRange} view`, companyName: state.companySettings.companyName,
                highlights: [{ label: 'Revenue', value: formatCurrency(revenueRow?.total || 0) }, { label: 'Net profit', value: formatCurrency(profitRow?.total || 0) }, { label: 'Inventory value', value: formatCurrency(inventoryValue) }, { label: 'Cash', value: formatCurrency(exportReport.notes[2]?.at(-1)?.total || 0) }, ...(includeVAT ? [{ label: 'Output VAT', value: formatCurrency(vatAmount) }] : [])],
                sections,
                notes: [`Report range: ${activeRange}.`, `VAT is ${includeVAT ? 'included in the report calculation.' : 'not included in this export.'}`, 'Amounts are calculated from non-void records in the selected period.'],
            })
        }
        if (action === 'Export Excel') {
            setExportCompanyName(state.companySettings.companyName)
            downloadExcel(`monthly-report-${activeRange.toLowerCase()}.xlsx`, sectionsToExcelRows(sections))
        }
    }

    const handleAction = (action: string) => {
        if (action === 'Compare Months') {
            const nextCompare = !compare
            setCompare(nextCompare)
            const currentPeriod = periods[periods.length - 1]
            const message = nextCompare ? `Comparing ${previousPeriod(currentPeriod).label} with ${currentPeriod.label}.` : `Showing ${currentPeriod.label} only.`
            setStatusMessage(message)
            triggerAppToast('Compare Months', message)
            return
        }
        if (action === 'Schedule Report') {
            const nextRun = nextReportRun('monthly')
            window.localStorage.setItem(scheduleKey, nextRun)
            setScheduledFor(nextRun)
            const message = `Monthly report scheduled. The next run is ${nextRun}.`
            setStatusMessage(message)
            triggerAppToast('Schedule Report', message)
            return
        }
        const message = `${action.replace('+ ', '')} completed for ${periodLabel}.`
        setStatusMessage(message)
        triggerAppToast(action, message)
        if (action === 'Export PDF' || action === 'Export Excel') exportCurrentReport(action)
    }

    return (
        <AppLayout>
            <div className="report-shell">
                <div className="page-header report-header">
                    <div>
                        <div className="pg-title">Monthly Reports</div>
                        <div className="pg-subtitle">Analyze monthly financial performance, operations, sales, expenses, and business trends.</div>
                    </div>
                    <div className="page-actions">
                        <button className="action-btn primary" onClick={() => handleAction('+ Generate Report')}>+ Generate Report</button>
                        <button className="action-btn secondary" aria-pressed={compare} onClick={() => handleAction('Compare Months')}>{compare ? 'Hide comparison' : 'Compare Months'}</button>
                        <button className="action-btn secondary allow-readonly" onClick={() => handleAction('Export PDF')}>Export PDF</button>
                        <button className="action-btn secondary allow-readonly" onClick={() => handleAction('Export Excel')}>Export Excel</button>
                        <button className="action-btn secondary" onClick={() => handleAction('Schedule Report')}>Schedule Report</button>
                        <label><input type="checkbox" checked={includeVAT} onChange={(event) => setIncludeVAT(event.target.checked)} /> Calculate VAT on export</label>
                    </div>
                </div>

                <div className="management-controls">
                    <label>Range
                        <select aria-label="Report range" value={activeRange} onChange={(event) => setActiveRange(event.target.value as ReportRange)}>
                            <option>Daily</option>
                            <option>Weekly</option>
                            <option>Monthly</option>
                        </select>
                    </label>
                    {activeRange === 'Monthly' ? (
                        <label>Month<input aria-label="Report month" type="month" value={month} onChange={(event) => setMonth(event.target.value || today.slice(0, 7))} /></label>
                    ) : (
                        <label>Date<input aria-label="Report date" type="date" value={anchorDate} onChange={(event) => setAnchorDate(event.target.value || today)} /></label>
                    )}
                </div>

                <div className="report-card">
                    <div className="card-hd">
                        <div>
                            <div className="card-title">PDF Report Statements</div>
                            <div className="section-subtitle">{periodLabel}. {statusMessage}{scheduledFor ? ` Next scheduled run: ${scheduledFor}.` : ''}</div>
                        </div>
                    </div>
                    <FinancialReportSections sections={sections} />
                </div>
            </div>
        </AppLayout>
    )
}
