'use client'

import { useMemo, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting } from '@/lib/context'
import {
  formatCurrency,
  formatNumber,
  calculatePIT,
  calculateVAT,
  calculateCIT,
  calculateWHT,
  calculateEducationTax,
  calculateNDL,
  calculateTaxComplianceScore,
  triggerAppToast,
} from '@/lib/utils'
import { downloadPdf } from '@/lib/export-utils'

const businessTypes = ['Company Limited (Ltd)', 'Sole Proprietorship', 'Partnership', 'NGO', 'Individual']
const industries = ['Retail', 'Manufacturing', 'Technology', 'Construction', 'Services']
const states = ['Enugu', 'Lagos', 'Abuja', 'Others']
const whtPaymentTypes = ['Professional Service', 'Contract', 'Rent', 'Dividend', 'Technical Service']

const taxRules = {
  citRate: 0.2,
  vatRate: 0.075,
  whtRate: 0.05,
  educationTaxRate: 0.03,
  ndlRate: 0.04,
}

const employees = [
  { name: 'David', gross: 6000000, allowances: 1000000 },
  { name: 'Rita', gross: 4200000, allowances: 800000 },
  { name: 'Chima', gross: 5500000, allowances: 900000 },
]

const complianceEvents = [
  { date: 'Aug 21', label: 'VAT Filing', status: 'Upcoming' },
  { date: 'Aug 31', label: 'PAYE Remittance', status: 'Upcoming' },
  { date: 'Sep 14', label: 'WHT Submission', status: 'Upcoming' },
]

const documentItems = [
  'Tax Identification Number',
  'VAT Certificates',
  'CIT Returns',
  'PAYE Records',
  'WHT Certificates',
  'Audit Documents',
]

const reports = [
  'Tax Liability Report',
  'VAT Report',
  'CIT Computation',
  'PAYE Report',
  'WHT Report',
  'Tax Payment History',
  'Tax Audit Report',
  'Tax Forecast Report',
]

export default function TaxPage() {
  const { state } = useAccounting()
  const companyName = state.companySettings.companyName || 'Company'
  const [businessType, setBusinessType] = useState('Company Limited (Ltd)')
  const [industry, setIndustry] = useState('Retail')
  const [companyState, setCompanyState] = useState('Enugu')
  const [annualTurnover, setAnnualTurnover] = useState(250000000)
  const [activeModules, setActiveModules] = useState({ cit: true, vat: true, paye: true, wht: true, edu: true, ndl: true })
  const [scenarioGrowth, setScenarioGrowth] = useState(30)
  const [whtType, setWhtType] = useState('Professional Service')
  const [whtInvoiceValue, setWhtInvoiceValue] = useState(10000000)

  const totalSales = state.sales.filter((s) => s.status !== 'VOID').reduce((sum, s) => sum + s.totalAmount, 0)
  const totalPurchases = state.purchases.reduce((sum, item) => sum + (item.total || 0), 0)
  const totalExpenses = state.expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const invoicesTaxableValue = totalSales
  const inputVAT = Math.round(totalPurchases * 0.075 * 0.36)
  const vatOutput = calculateVAT(invoicesTaxableValue, taxRules.vatRate)
  const vatPayable = Math.max(0, vatOutput - inputVAT)
  const taxableProfit = Math.max(0, annualTurnover - totalExpenses - 50000000)
  const cit = calculateCIT(taxableProfit, taxRules.citRate)
  const payeAnnual = employees.reduce((sum, employee) => {
    const taxable = Math.max(0, employee.gross - employee.allowances)
    return sum + calculatePIT(taxable)
  }, 0)
  const payeMonthly = Math.round(payeAnnual / 12)
  const whtAmount = calculateWHT(whtInvoiceValue, taxRules.whtRate)
  const supplierReceives = whtInvoiceValue - whtAmount
  const educationTax = calculateEducationTax(taxableProfit, taxRules.educationTaxRate)
  const ndlAmount = calculateNDL(annualTurnover, taxRules.ndlRate)
  const estimatedTaxLiability = cit + vatPayable + payeAnnual + whtAmount + educationTax + ndlAmount
  const complianceScore = calculateTaxComplianceScore({ filings: 8, onTime: 7, docs: 6, checks: 5 })
  const projectedRevenue = Math.round(annualTurnover * (1 + scenarioGrowth / 100))
  const projectedVat = calculateVAT(projectedRevenue, taxRules.vatRate)
  const projectedProfit = Math.max(0, projectedRevenue - totalExpenses - 50000000)
  const projectedCit = calculateCIT(projectedProfit, taxRules.citRate)
  const handleTaxAction = (action: string) => {
    triggerAppToast(action, 'The tax workflow has been queued for compliance review.')
    if (action === 'Export PDF') {
      downloadPdf('tax-report.pdf', 'Tax Report', [{ estimatedTaxLiability, vatPayable, cit, whtAmount, payeAnnual }], companyName)
    }
  }

  const projectedImpact = {
    revenue: projectedRevenue - annualTurnover,
    vat: projectedVat - vatOutput,
    cit: projectedCit - cit,
    profit: projectedProfit - Math.max(0, annualTurnover - totalExpenses - 50000000),
  }

  const taxBreakdown = [
    { label: 'VAT', value: vatPayable },
    { label: 'CIT', value: cit },
    { label: 'PAYE', value: payeAnnual },
    { label: 'WHT', value: whtAmount },
    { label: 'Other', value: educationTax + ndlAmount },
  ]

  return (
    <AppLayout>
      <div className="tax-shell">
        <div className="page-header tax-header">
          <div>
            <div className="pg-title">Tax Calculator</div>
            <div className="pg-subtitle">Calculate, monitor, and forecast Nigerian business taxes automatically. Stay compliant with FIRS regulations and generate tax reports.</div>
          </div>
          <div className="page-actions tax-actions">
            <button className="action-btn primary" onClick={() => handleTaxAction('+ New Tax Calculation')}>+ New Tax Calculation</button>
            <button className="action-btn secondary" onClick={() => handleTaxAction('Generate Tax Report')}>Generate Tax Report</button>
            <button className="action-btn secondary" onClick={() => handleTaxAction('Tax Settings')}>Tax Settings</button>
            <button className="action-btn secondary allow-readonly" onClick={() => handleTaxAction('Export PDF')}>Export PDF</button>
            <button className="action-btn secondary" onClick={() => handleTaxAction('Compliance Calendar')}>Compliance Calendar</button>
          </div>
        </div>

        <div className="tax-summary-grid">
          {[
            { label: 'Estimated Tax Liability', value: formatCurrency(estimatedTaxLiability), subtitle: 'Current Period' },
            { label: 'VAT Payable', value: formatCurrency(vatPayable), subtitle: 'Next Filing' },
            { label: 'Company Income Tax', value: formatCurrency(cit), subtitle: 'Estimated' },
            { label: 'Withholding Tax', value: formatCurrency(whtAmount), subtitle: 'Collected' },
            { label: 'PAYE Liability', value: formatCurrency(payeAnnual), subtitle: 'Employees' },
            { label: 'Tax Compliance Score', value: `${complianceScore}%`, subtitle: 'Excellent' },
          ].map((card) => (
            <div key={card.label} className="summary-card tax-summary-card">
              <div className="summary-label">{card.label}</div>
              <div className="summary-value">{card.value}</div>
              <div className="summary-subtitle">{card.subtitle}</div>
            </div>
          ))}
        </div>

        <div className="tax-profile-grid">
          <div className="card profile-card">
            <div className="card-hd">
              <div>
                <div className="card-title">Business Tax Profile</div>
                <div className="section-subtitle">Tell QUANTIXA about your business type, industry, and turnover.</div>
              </div>
            </div>
            <div className="profile-fields">
              <label>
                Business Type
                <select value={businessType} onChange={(event) => setBusinessType(event.target.value)}>
                  {businessTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label>
                Industry
                <select value={industry} onChange={(event) => setIndustry(event.target.value)}>
                  {industries.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Annual Turnover
                <input
                  type="number"
                  value={annualTurnover}
                  onChange={(event) => setAnnualTurnover(Number(event.target.value))}
                />
              </label>
              <label>
                State
                <select value={companyState} onChange={(event) => setCompanyState(event.target.value)}>
                  {states.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="card tax-modules-card">
            <div className="card-hd">
              <div>
                <div className="card-title">Tax Modules</div>
                <div className="section-subtitle">Activate the tax modules that apply to your business.</div>
              </div>
            </div>
            <div className="tax-modules-grid">
              {Object.entries(activeModules).map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  className={`module-tile ${value ? 'active' : ''}`}
                  onClick={() => setActiveModules((prev) => ({ ...prev, [key]: !prev[key] }))}
                >
                  <strong>{key.toUpperCase()}</strong>
                  <span>{value ? 'Enabled' : 'Disabled'}</span>
                </button>
              ))}
            </div>
            <div className="tax-rules-row">
              <div className="tax-rule-card">
                <span>CIT Rate</span>
                <strong>{formatNumber(taxRules.citRate * 100)}%</strong>
              </div>
              <div className="tax-rule-card">
                <span>VAT Rate</span>
                <strong>{formatNumber(taxRules.vatRate * 100)}%</strong>
              </div>
              <div className="tax-rule-card">
                <span>WHT Rate</span>
                <strong>{formatNumber(taxRules.whtRate * 100)}%</strong>
              </div>
              <div className="tax-rule-card">
                <span>Education Tax</span>
                <strong>{formatNumber(taxRules.educationTaxRate * 100)}%</strong>
              </div>
              <div className="tax-rule-card">
                <span>NDL Rate</span>
                <strong>{formatNumber(taxRules.ndlRate * 100)}%</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="tax-main-grid">
          <div className="tax-left">
            <div className="card chart-card">
              <div className="card-hd">
                <div>
                  <div className="card-title">Tax Breakdown</div>
                  <div className="section-subtitle">Split of estimated tax obligations by category.</div>
                </div>
              </div>
              <div className="tax-chart-placeholder">
                <div className="tax-chart-label">Donut chart placeholder</div>
                <div className="tax-chart-list">
                  {taxBreakdown.map((segment) => (
                    <div key={segment.label} className="tax-chart-row">
                      <span>{segment.label}</span>
                      <strong>{formatCurrency(segment.value)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card calendar-card">
              <div className="card-hd">
                <div>
                  <div className="card-title">Compliance Calendar</div>
                  <div className="section-subtitle">Upcoming tax filing and remittance dates.</div>
                </div>
              </div>
              <div className="calendar-list">
                {complianceEvents.map((event) => (
                  <div key={event.date} className="calendar-item">
                    <span>{event.date}</span>
                    <div>
                      <strong>{event.label}</strong>
                      <small>{event.status}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card filing-card">
              <div className="card-hd">
                <div>
                  <div className="card-title">Tax Filing Status</div>
                  <div className="section-subtitle">Latest preparation state for key tax filings.</div>
                </div>
              </div>
              <div className="filing-status-panel">
                <div className="filing-row">
                  <div>
                    <strong>VAT July</strong>
                    <span>Status: 🟢 Prepared</span>
                  </div>
                  <div>
                    <span>Documents:</span>
                    <ul>
                      <li>✓ Sales Report</li>
                      <li>✓ Purchase Report</li>
                      <li>✓ VAT Summary</li>
                    </ul>
                  </div>
                </div>
                <div className="filing-ready">Ready For Filing</div>
              </div>
            </div>
          </div>

          <div className="tax-right">
            <div className="card scenario-card">
              <div className="card-hd">
                <div>
                  <div className="card-title">Tax Scenario Simulator</div>
                  <div className="section-subtitle">Project the tax impact of revenue changes.</div>
                </div>
              </div>
              <div className="scenario-input-row">
                <label>
                  Increase revenue by
                  <input
                    type="number"
                    value={scenarioGrowth}
                    onChange={(event) => setScenarioGrowth(Number(event.target.value))}
                  />
                  %
                </label>
              </div>
              <div className="scenario-output-grid">
                <div>
                  <span>Current Revenue</span>
                  <strong>{formatCurrency(annualTurnover)}</strong>
                </div>
                <div>
                  <span>Projected Revenue</span>
                  <strong>{formatCurrency(projectedRevenue)}</strong>
                </div>
                <div>
                  <span>VAT Impact</span>
                  <strong>{formatCurrency(projectedImpact.vat)}</strong>
                </div>
                <div>
                  <span>CIT Impact</span>
                  <strong>{formatCurrency(projectedImpact.cit)}</strong>
                </div>
                <div>
                  <span>Profit Change</span>
                  <strong>{formatCurrency(projectedImpact.profit)}</strong>
                </div>
              </div>
            </div>

            <div className="card optimization-card">
              <div className="card-hd">
                <div>
                  <div className="card-title">QUANTIXA Tax Advisor</div>
                  <div className="section-subtitle">Insights and optimizations for Nigerian compliance.</div>
                </div>
              </div>
              <div className="optimization-list">
                <div className="optimization-item">Your company spent ₦12M on expenses without proper invoices. These may not qualify as allowable deductions.</div>
                <div className="optimization-item">Your VAT input claims dropped by 35% this quarter. Review supplier invoices.</div>
                <div className="optimization-item">Your tax liability increased because your profit margin improved. Consider approved capital investments before year end.</div>
              </div>
            </div>

            <div className="card docs-card">
              <div className="card-hd">
                <div>
                  <div className="card-title">Tax Document Vault</div>
                  <div className="section-subtitle">Store tax certificates, returns, and audit documents.</div>
                </div>
              </div>
              <div className="documents-list">
                {documentItems.map((document) => (
                  <div key={document} className="document-row">📄 {document}</div>
                ))}
              </div>
            </div>

            <div className="card audit-card">
              <div className="card-hd">
                <div>
                  <div className="card-title">Audit Preparation Mode</div>
                  <div className="section-subtitle">Generate a complete tax audit package in one click.</div>
                </div>
              </div>
              <div className="audit-list">
                {['Revenue Report', 'Expense Report', 'VAT Summary', 'Payroll Summary', 'Asset Register', 'Tax Calculations', 'Supporting Documents'].map((item) => (
                  <div key={item} className="audit-row">✓ {item}</div>
                ))}
              </div>
              <button type="button" className="btn btn-primary" onClick={() => handleTaxAction('Prepare Tax Audit Package')}>Prepare Tax Audit Package</button>
            </div>

            <div className="card reports-card">
              <div className="card-hd">
                <div>
                  <div className="card-title">Reports</div>
                  <div className="section-subtitle">Generate professional tax reports for filing and audit.</div>
                </div>
              </div>
              <div className="reports-list">
                {reports.map((report) => (
                  <button key={report} type="button" className="report-button">{report}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
