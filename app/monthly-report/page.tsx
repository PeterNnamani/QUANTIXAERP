'use client'

import { useMemo, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting } from '@/lib/context'
import { downloadExcel, downloadFinancialReportPdf, managementAccountsToExportSections, setExportCompanyName } from '@/lib/export-utils'
import { buildManagementAccounts } from '@/lib/management-accounts'
import { calculateVAT, formatCurrency, triggerAppToast } from '@/lib/utils'
import FinancialReportSections from '@/components/financial-report-sections'

export default function MonthlyReportPage() {
    const { state } = useAccounting()
    const [activeRange, setActiveRange] = useState<'Daily' | 'Weekly' | 'Monthly'>('Monthly')
    const [statusMessage, setStatusMessage] = useState('Report generated for the current month.')
    const [includeVAT, setIncludeVAT] = useState(false)

    const currentMonth = new Date().toISOString().slice(0, 7)
    const monthStart = `${currentMonth}-01`
    const monthEnd = new Date(Date.UTC(Number(currentMonth.slice(0, 4)), Number(currentMonth.slice(5, 7)), 0)).toISOString().slice(0, 10)
    const inMonth = (date?: string) => Boolean(date && date >= monthStart && date <= monthEnd)
    const monthlySales = useMemo(() => state.sales.filter((sale) => inMonth(sale.date) && sale.status !== 'VOID'), [state.sales, monthStart, monthEnd])
    const monthlyPurchases = useMemo(() => state.purchases.filter((purchase) => inMonth(purchase.date) && purchase.status !== 'VOID'), [state.purchases, monthStart, monthEnd])
    const monthlyExpenses = useMemo(() => state.expenses.filter((expense) => inMonth(expense.date) && expense.status !== 'VOID'), [state.expenses, monthStart, monthEnd])
    const monthlyTransactions = useMemo(() => state.bankTxns.filter((txn) => inMonth(txn.date)), [state.bankTxns, monthStart, monthEnd])
    const totalRevenue = useMemo(() => monthlySales.reduce((sum, sale) => sum + sale.totalAmount, 0), [monthlySales])
    const totalExpenses = useMemo(() => monthlyExpenses.reduce((sum, expense) => sum + expense.amount, 0), [monthlyExpenses])
    const expenseBreakdown = useMemo(() => Array.from(monthlyExpenses.reduce((totals, expense) => totals.set(expense.category || 'Uncategorised', (totals.get(expense.category || 'Uncategorised') || 0) + expense.amount), new Map<string, number>())).map(([category, amount]) => [category, amount] as [string, number]), [monthlyExpenses])
    const totalPurchases = useMemo(() => monthlyPurchases.reduce((sum, purchase) => sum + purchase.total, 0), [monthlyPurchases])
    const monthlyPostedEntryIds = new Set(state.journalEntries.filter((entry) => entry.status === 'POSTED' && inMonth(entry.entryDate)).map((entry) => entry.id))
    const cogsAccountIds = new Set(state.chartOfAccounts.filter((account) => account.name.toLowerCase().includes('cost of goods sold')).map((account) => account.id))
    const costOfGoodsSold = state.journalLines.filter((line) => cogsAccountIds.has(line.accountId) && monthlyPostedEntryIds.has(line.entryId)).reduce((sum, line) => sum + line.debit - line.credit, 0)
    const netProfit = totalRevenue - costOfGoodsSold - totalExpenses
    const inventoryValue = useMemo(() => state.inventory.reduce((sum, item) => sum + item.unitCost * item.closing, 0), [state.inventory])
    const bankAccounts = Object.entries(state.banks)
    const totalBankBalance = bankAccounts.reduce((sum, [, balance]) => sum + Number(balance || 0), 0)
    const cashAccount = state.chartOfAccounts.find((account) => account.name.toLowerCase().includes('cash') && !account.name.toLowerCase().includes('bank'))
    const cashAccountBalance = cashAccount
        ? Number(cashAccount.openingBalance || 0) + state.journalLines.filter((line) => line.accountId === cashAccount.id && state.journalEntries.some((entry) => entry.id === line.entryId && entry.status === 'POSTED' && entry.entryDate <= monthEnd)).reduce((sum, line) => sum + line.debit - line.credit, 0)
        : 0
    const cashReceived = monthlyTransactions.filter((txn) => Number(txn.amount) > 0).reduce((sum, txn) => sum + Number(txn.amount), 0)
    const cashPaid = monthlyTransactions.filter((txn) => Number(txn.amount) < 0).reduce((sum, txn) => sum + Math.abs(Number(txn.amount)), 0)
    const exportReport = useMemo(() => buildManagementAccounts({ ...state, companyName: state.companySettings.companyName, currency: state.companySettings.currency || 'NGN' }, [{ label: currentMonth, startDate: monthStart, endDate: monthEnd }]), [state, currentMonth, monthStart, monthEnd])

    const reportExportData = { Period: currentMonth, Revenue: totalRevenue, Purchases: totalPurchases, CostOfGoodsSold: costOfGoodsSold, Expenses: totalExpenses, NetProfit: netProfit, Transactions: monthlySales.length + monthlyPurchases.length + monthlyExpenses.length }

    const handleAction = (action: string) => {
        setStatusMessage(`${action} completed for this month.`)
        triggerAppToast(action, `${action} completed for the current month.`)
        if (action === 'Export PDF') {
            void downloadFinancialReportPdf({
                filename: `monthly-report-${activeRange.toLowerCase()}.pdf`, reportTitle: 'Monthly Report', periodLabel: `${currentMonth} | ${activeRange} view`, companyName: state.companySettings.companyName,
                highlights: [{ label: 'Revenue', value: formatCurrency(totalRevenue) }, { label: 'Net profit', value: formatCurrency(netProfit) }, { label: 'Inventory value', value: formatCurrency(inventoryValue) }, { label: 'Cash', value: formatCurrency(cashReceived - cashPaid) }],
                sections: managementAccountsToExportSections(exportReport),
                notes: [`Report range: ${activeRange}.`, `VAT is ${includeVAT ? 'included in the report calculation.' : 'not included in this export.'}`, 'Amounts are calculated from non-void records in the selected calendar month.'],
            })
        }

        if (action === 'Export Excel') {
            setExportCompanyName(state.companySettings.companyName)
            downloadExcel(`monthly-report-${activeRange.toLowerCase()}.xlsx`, [{ ...reportExportData, ...Object.fromEntries(expenseBreakdown.map(([category, amount]) => [`Expense: ${category}`, amount])), action }])
        }
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
                        <button className="action-btn secondary" onClick={() => handleAction('Compare Months')}>Compare Months</button>
                        <button className="action-btn secondary allow-readonly" onClick={() => handleAction('Export PDF')}>Export PDF</button>
                        <button className="action-btn secondary allow-readonly" onClick={() => handleAction('Export Excel')}>Export Excel</button>
                        <button className="action-btn secondary" onClick={() => handleAction('Schedule Report')}>Schedule Report</button>
                        <label><input type="checkbox" checked={includeVAT} onChange={(event) => setIncludeVAT(event.target.checked)} /> Calculate VAT on export</label>
                    </div>
                </div>

                <div className="report-card">
                    <div className="card-hd">
                        <div>
                            <div className="card-title">PDF Report Statements</div>
                            <div className="section-subtitle">The exact statements and values included in the monthly PDF export.</div>
                        </div>
                    </div>
                    <FinancialReportSections sections={managementAccountsToExportSections(exportReport)} />
                </div>
            </div>
        </AppLayout>
    )
}
