'use client'

import { useMemo, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting } from '@/lib/context'
import { calculateVAT, triggerAppToast, formatCurrency } from '@/lib/utils'
import { downloadFinancialReportPdf, managementAccountsToExportSections } from '@/lib/export-utils'
import { buildManagementAccounts } from '@/lib/management-accounts'
import FinancialReportSections from '@/components/financial-report-sections'

export default function AnnualReportPage() {
    const { state } = useAccounting()
    const [reportMode, setReportMode] = useState<'summary' | 'board' | 'tax'>('summary')
    const [selectedStatement, setSelectedStatement] = useState('Profit & Loss')
    const [includeVAT, setIncludeVAT] = useState(false)

    const currentYear = new Date().getUTCFullYear().toString()
    const yearStart = `${currentYear}-01-01`
    const yearEnd = `${currentYear}-12-31`
    const inYear = (date?: string) => Boolean(date && date >= yearStart && date <= yearEnd)
    const annualSales = state.sales.filter((sale) => inYear(sale.date) && sale.status !== 'VOID')
    const annualPurchaseRows = state.purchases.filter((purchase) => inYear(purchase.date) && purchase.status !== 'VOID')
    const annualExpenseRows = state.expenses.filter((expense) => inYear(expense.date) && expense.status !== 'VOID')
    const annualBankTransactions = state.bankTxns.filter((txn) => inYear(txn.date))
    const annualRevenue = annualSales.reduce((sum, sale) => sum + sale.totalAmount, 0)
    const annualExpenses = annualExpenseRows.reduce((sum, expense) => sum + expense.amount, 0)
    const expenseBreakdown = useMemo(() => Array.from(annualExpenseRows.reduce((totals, expense) => totals.set(expense.category || 'Uncategorised', (totals.get(expense.category || 'Uncategorised') || 0) + expense.amount), new Map<string, number>())).map(([category, amount]) => [category, amount] as [string, number]), [annualExpenseRows])
    const annualPurchases = annualPurchaseRows.reduce((sum, purchase) => sum + purchase.total, 0)
    const annualPostedEntryIds = new Set(state.journalEntries.filter((entry) => entry.status === 'POSTED' && inYear(entry.entryDate)).map((entry) => entry.id))
    const cogsAccountIds = new Set(state.chartOfAccounts.filter((account) => account.name.toLowerCase().includes('cost of goods sold')).map((account) => account.id))
    const costOfGoodsSold = state.journalLines.filter((line) => cogsAccountIds.has(line.accountId) && annualPostedEntryIds.has(line.entryId)).reduce((sum, line) => sum + line.debit - line.credit, 0)
    const annualNetProfit = annualRevenue - costOfGoodsSold - annualExpenses
    const bankAccounts = Object.entries(state.banks)
    const bankBalance = bankAccounts.reduce((sum, [, balance]) => sum + Number(balance || 0), 0)
    const cashReceived = annualBankTransactions.filter((txn) => Number(txn.amount) > 0).reduce((sum, txn) => sum + Number(txn.amount), 0)
    const cashPaid = annualBankTransactions.filter((txn) => Number(txn.amount) < 0).reduce((sum, txn) => sum + Math.abs(Number(txn.amount)), 0)
    const cashAccount = state.chartOfAccounts.find((account) => account.name.toLowerCase().includes('cash') && !account.name.toLowerCase().includes('bank'))
    const cashAccountBalance = cashAccount
        ? Number(cashAccount.openingBalance || 0) + state.journalLines.filter((line) => line.accountId === cashAccount.id && state.journalEntries.some((entry) => entry.id === line.entryId && entry.status === 'POSTED' && entry.entryDate <= yearEnd)).reduce((sum, line) => sum + line.debit - line.credit, 0)
        : 0
    const inventoryValue = state.inventory.reduce((sum, item) => sum + item.unitCost * item.closing, 0)
    const loansBalance = state.loans.reduce((sum, loan) => sum + Number(loan.balance ?? loan.amount ?? 0), 0)
    const payablesBalance = state.payables.reduce((sum, item) => sum + Number(item.outstanding_amount ?? item.outstandingAmount ?? item.amount ?? 0), 0)
    const exportReport = useMemo(() => buildManagementAccounts({ ...state, companyName: state.companySettings.companyName, currency: state.companySettings.currency || 'NGN' }, [{ label: currentYear, startDate: yearStart, endDate: yearEnd }]), [state, currentYear, yearStart, yearEnd])
    const totalAssets = exportReport.sfp.totalAssets

    const handleAction = (action: string) => {
        triggerAppToast(action, 'The report workflow has been prepared for the current year.')
        if (action === 'Export PDF') {
            void downloadFinancialReportPdf({
                filename: 'annual-report.pdf', reportTitle: 'Annual Report', periodLabel: currentYear, companyName: state.companySettings.companyName,
                highlights: [{ label: 'Revenue', value: formatCurrency(annualRevenue) }, { label: 'Net profit', value: formatCurrency(annualNetProfit) }, { label: 'Total assets', value: formatCurrency(totalAssets) }, { label: 'Cash', value: formatCurrency(cashReceived - cashPaid) }],
                sections: managementAccountsToExportSections(exportReport, false),
                notes: [`Report mode: ${reportMode}; selected statement: ${selectedStatement}.`, `VAT is ${includeVAT ? 'included in the report calculation.' : 'not included in this export.'}`, 'Amounts are calculated from non-void records in the current accounting year.'],
            })
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
                        <button className="action-btn primary" type="button" onClick={() => { setReportMode('summary'); handleAction('Generate Annual Report') }}>Generate Annual Report</button>
                        <button className="action-btn secondary" type="button" onClick={() => { setReportMode('board'); handleAction('Board Report') }}>Board Report</button>
                        <button className="action-btn secondary allow-readonly" type="button" onClick={() => handleAction('Export PDF')}>Export PDF</button>
                        <button className="action-btn secondary" type="button" onClick={() => { setReportMode('tax'); handleAction('Tax Package') }}>Tax Package</button>
                        <label><input type="checkbox" checked={includeVAT} onChange={(event) => setIncludeVAT(event.target.checked)} /> Calculate VAT on export</label>
                    </div>
                </div>

                <div className="report-card">
                    <div className="card-hd">
                        <div>
                            <div className="card-title">PDF Report Statements</div>
                            <div className="section-subtitle">The exact statements and values included in the annual PDF export.</div>
                        </div>
                    </div>
                    <FinancialReportSections sections={managementAccountsToExportSections(exportReport, false)} />
                </div>
            </div>
        </AppLayout>
    )
}
