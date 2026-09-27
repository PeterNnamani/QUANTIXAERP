'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting } from '@/lib/context'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { downloadExcel } from '@/lib/export-utils'
import type { CosCostSource, CosLine, CosProductSummary, CosSummary } from '@/lib/cost-of-sales'

type Period = 'this-month' | 'last-month' | 'this-quarter' | 'this-year' | 'custom'
type View = 'products' | 'lines'

type ReportResponse = {
    success: boolean
    error?: string
    generatedAt?: string
    costTracking?: 'enabled' | 'not-installed'
    summary?: CosSummary
    byProduct?: CosProductSummary[]
    lines?: CosLine[]
}

const periodOptions: Array<{ value: Period; label: string }> = [
    { value: 'this-month', label: 'This month' },
    { value: 'last-month', label: 'Last month' },
    { value: 'this-quarter', label: 'This quarter' },
    { value: 'this-year', label: 'This year' },
    { value: 'custom', label: 'Custom range' },
]

const costSourceLabels: Record<CosCostSource, string> = {
    locked: 'Cost at sale',
    estimated: 'Estimated',
    current: 'Current cost',
    missing: 'No cost',
}

const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function periodRange(period: Exclude<Period, 'custom'>, today = new Date()) {
    const year = today.getFullYear()
    const month = today.getMonth()
    if (period === 'last-month') return { from: isoDate(new Date(year, month - 1, 1)), to: isoDate(new Date(year, month, 0)) }
    if (period === 'this-quarter') {
        const quarterStart = Math.floor(month / 3) * 3
        return { from: isoDate(new Date(year, quarterStart, 1)), to: isoDate(new Date(year, quarterStart + 3, 0)) }
    }
    if (period === 'this-year') return { from: `${year}-01-01`, to: `${year}-12-31` }
    return { from: isoDate(new Date(year, month, 1)), to: isoDate(new Date(year, month + 1, 0)) }
}

const formatMargin = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value.toFixed(1)}%`)
const formatUnitCost = (value: number) => `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

export default function CostOfSalesPage() {
    const { user } = useAccounting()
    const initialRange = periodRange('this-month')
    const [period, setPeriod] = useState<Period>('this-month')
    const [from, setFrom] = useState(initialRange.from)
    const [to, setTo] = useState(initialRange.to)
    const [view, setView] = useState<View>('products')
    const [search, setSearch] = useState('')
    const [report, setReport] = useState<ReportResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const requestId = useRef(0)

    const companyId = user?.companyId
    const staffId = user?.staffId
    const username = user?.username

    const loadReport = useCallback(async () => {
        if (!companyId || (!staffId && !username)) return
        if (!from || !to || from > to) {
            setError('Choose a start date on or before the end date.')
            return
        }
        const current = ++requestId.current
        setLoading(true)
        setError('')
        try {
            const params = new URLSearchParams({ companyId, from, to })
            if (staffId) params.set('staffId', staffId)
            else if (username) params.set('username', username)
            const response = await fetch(`/api/cost-of-sales?${params.toString()}`, { cache: 'no-store' })
            const result: ReportResponse = await response.json()
            if (current !== requestId.current) return
            if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load cost of sales.')
            setReport(result)
        } catch (loadError) {
            if (current !== requestId.current) return
            setError(loadError instanceof Error ? loadError.message : 'Unable to load cost of sales.')
        } finally {
            if (current === requestId.current) setLoading(false)
        }
    }, [companyId, staffId, username, from, to])

    useEffect(() => {
        void loadReport()
    }, [loadReport])

    useEffect(() => {
        const onFocus = () => { void loadReport() }
        window.addEventListener('focus', onFocus)
        return () => window.removeEventListener('focus', onFocus)
    }, [loadReport])

    const changePeriod = (next: Period) => {
        setPeriod(next)
        if (next === 'custom') return
        const range = periodRange(next)
        setFrom(range.from)
        setTo(range.to)
    }

    const query = search.trim().toLowerCase()
    const productRows = useMemo(() => (report?.byProduct || []).filter((row) => !query || [row.product, row.sku, row.category].join(' ').toLowerCase().includes(query)), [report, query])
    const lineRows = useMemo(() => (report?.lines || []).filter((row) => !query || [row.product, row.sku, row.category, row.saleReference, row.customer, row.salesRep].join(' ').toLowerCase().includes(query)), [report, query])

    const summary = report?.summary
    const summaryCards = [
        { label: 'Sales Revenue', value: formatCurrency(summary?.revenue || 0), note: `${formatNumber(summary?.salesCount || 0)} sales · ${formatNumber(summary?.lineCount || 0)} lines`, tone: 'info' },
        { label: 'Cost of Sales', value: formatCurrency(summary?.costOfSales || 0), note: 'Units sold × cost price', tone: 'info' },
        { label: 'Gross Profit', value: formatCurrency(summary?.grossProfit || 0), note: 'Revenue − cost of sales', tone: (summary?.grossProfit || 0) < 0 ? 'critical' : 'info' },
        { label: 'Gross Margin', value: formatMargin(summary?.grossMarginPct), note: 'Gross profit ÷ revenue', tone: (summary?.grossMarginPct ?? 0) < 0 ? 'critical' : 'info' },
        { label: 'Units Sold', value: formatNumber(summary?.unitsSold || 0), note: `${formatNumber(report?.byProduct?.length || 0)} products`, tone: 'info' },
        { label: 'Lines Without Cost', value: formatNumber(summary?.missingCostLines || 0), note: summary?.missingCostLines ? `${formatCurrency(summary.missingCostRevenue)} of revenue` : 'All sold items have a cost', tone: summary?.missingCostLines ? 'warning' : 'info' },
    ]

    const exportReport = () => {
        if (!report) return
        const rows = view === 'products'
            ? productRows.map((row) => ({
                Product: row.product, SKU: row.sku, Category: row.category, 'Units sold': row.qty,
                'Average selling price': row.averageSellingPrice, 'Average unit cost': row.averageUnitCost,
                Revenue: row.revenue, 'Cost of sales': row.cost, 'Gross profit': row.grossProfit,
                'Gross margin %': row.marginPct ?? '', 'Lines without cost': row.missingCostLines,
            }))
            : lineRows.map((row) => ({
                Date: row.date, 'Sale reference': row.saleReference, Customer: row.customer, 'Sales rep': row.salesRep,
                Product: row.product, SKU: row.sku, Qty: row.qty, 'Selling price': row.unitPrice, Revenue: row.revenue,
                'Unit cost': row.unitCost, 'Cost of sales': row.cost, 'Gross profit': row.grossProfit,
                'Gross margin %': row.marginPct ?? '', 'Cost source': costSourceLabels[row.costSource],
            }))
        downloadExcel(`cost-of-sales-${from}-to-${to}-${view}.xlsx`, rows)
    }

    return (
        <AppLayout>
            <div className="inventory-page cos-page">
                <div className="inventory-header">
                    <div>
                        <div className="pg-title">Cost of Sales</div>
                        <div className="pg-subtitle">Every item sold, matched to its cost price, with revenue, cost of sales, and gross profit for the period.</div>
                    </div>
                    <div className="inventory-actions">
                        <button className="inventory-btn secondary allow-readonly" type="button" disabled={loading} onClick={() => void loadReport()}>{loading ? 'Refreshing…' : 'Refresh'}</button>
                        <button className="inventory-btn primary allow-readonly" type="button" disabled={!report || loading} onClick={exportReport}>Export Excel</button>
                    </div>
                </div>

                <div className="inventory-card cos-controls">
                    <label>
                        <span>Period</span>
                        <select className="allow-readonly" value={period} onChange={(event) => changePeriod(event.target.value as Period)}>
                            {periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                    </label>
                    <label>
                        <span>From</span>
                        <input className="allow-readonly" type="date" value={from} max={to} onChange={(event) => { setPeriod('custom'); setFrom(event.target.value) }} />
                    </label>
                    <label>
                        <span>To</span>
                        <input className="allow-readonly" type="date" value={to} min={from} onChange={(event) => { setPeriod('custom'); setTo(event.target.value) }} />
                    </label>
                    <label className="cos-search">
                        <span>Search</span>
                        <input className="allow-readonly" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Product, SKU, sale reference, customer…" />
                    </label>
                </div>

                <div className="inventory-summary-grid">
                    {summaryCards.map((card) => (
                        <div className={`inventory-summary-card ${card.tone}`} key={card.label}>
                            <div className="inventory-summary-label">{card.label}</div>
                            <div className="inventory-summary-value">{loading && !report ? '…' : card.value}</div>
                            <div className="cos-card-note">{card.note}</div>
                        </div>
                    ))}
                </div>

                {error && <div className="cos-notice error">{error}</div>}
                {report?.costTracking === 'not-installed' && (
                    <div className="cos-notice warning">Cost tracking is not installed in the database yet, so every line uses today&apos;s product cost. Run <code>migrations/030_cost_of_sales.sql</code> so that each sale keeps the cost price from the day it was sold.</div>
                )}
                {summary && summary.missingCostLines > 0 && (
                    <div className="cos-notice warning">{formatNumber(summary.missingCostLines)} sold line{summary.missingCostLines === 1 ? '' : 's'} have no matching product or no cost price, so they add revenue without cost. Set the cost price in Product Manager and refresh.</div>
                )}
                {summary && summary.estimatedLines > 0 && (
                    <div className="cos-notice info">{formatNumber(summary.estimatedLines)} line{summary.estimatedLines === 1 ? ' was' : 's were'} sold before cost tracking started and use the cost on record at that time.</div>
                )}

                <div className="inventory-sheet-card">
                    <div className="section-head inventory-sheet-head">
                        <div>
                            <div className="card-title">{view === 'products' ? 'Cost of sales by product' : 'Sold items'}</div>
                            <div className="section-subtitle">
                                {report?.generatedAt ? `From the database at ${new Date(report.generatedAt).toLocaleTimeString()} · ` : ''}
                                {view === 'products' ? `${formatNumber(productRows.length)} products` : `${formatNumber(lineRows.length)} lines`} · {from} to {to}
                            </div>
                        </div>
                        <div className="cos-view-toggle" role="tablist">
                            <button type="button" role="tab" aria-selected={view === 'products'} className={`allow-readonly ${view === 'products' ? 'active' : ''}`} onClick={() => setView('products')}>By product</button>
                            <button type="button" role="tab" aria-selected={view === 'lines'} className={`allow-readonly ${view === 'lines' ? 'active' : ''}`} onClick={() => setView('lines')}>Sold items</button>
                        </div>
                    </div>
                    <div className="inventory-table-wrap">
                        {view === 'products' ? (
                            <table className="inventory-table">
                                <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th className="cos-num">Units sold</th><th className="cos-num">Avg. selling price</th><th className="cos-num">Avg. unit cost</th><th className="cos-num">Revenue</th><th className="cos-num">Cost of sales</th><th className="cos-num">Gross profit</th><th className="cos-num">Margin</th></tr></thead>
                                <tbody>
                                    {productRows.map((row) => (
                                        <tr key={row.productKey}>
                                            <td>{row.product}{row.missingCostLines > 0 && <span className="inventory-pill warning cos-inline-pill">No cost</span>}</td>
                                            <td>{row.sku || '-'}</td>
                                            <td>{row.category || '-'}</td>
                                            <td className="cos-num">{formatNumber(row.qty)}</td>
                                            <td className="cos-num">{formatUnitCost(row.averageSellingPrice)}</td>
                                            <td className="cos-num">{formatUnitCost(row.averageUnitCost)}</td>
                                            <td className="cos-num">{formatCurrency(row.revenue)}</td>
                                            <td className="cos-num">{formatCurrency(row.cost)}</td>
                                            <td className={`cos-num ${row.grossProfit < 0 ? 'cos-negative' : ''}`}>{formatCurrency(row.grossProfit)}</td>
                                            <td className={`cos-num ${(row.marginPct ?? 0) < 0 ? 'cos-negative' : ''}`}>{formatMargin(row.marginPct)}</td>
                                        </tr>
                                    ))}
                                    {productRows.length > 0 && summary && !query && (
                                        <tr className="cos-total-row">
                                            <td colSpan={3}>Total</td>
                                            <td className="cos-num">{formatNumber(summary.unitsSold)}</td>
                                            <td />
                                            <td />
                                            <td className="cos-num">{formatCurrency(summary.revenue)}</td>
                                            <td className="cos-num">{formatCurrency(summary.costOfSales)}</td>
                                            <td className="cos-num">{formatCurrency(summary.grossProfit)}</td>
                                            <td className="cos-num">{formatMargin(summary.grossMarginPct)}</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        ) : (
                            <table className="inventory-table">
                                <thead><tr><th>Date</th><th>Sale ref.</th><th>Customer</th><th>Product</th><th>SKU</th><th className="cos-num">Qty</th><th className="cos-num">Selling price</th><th className="cos-num">Revenue</th><th className="cos-num">Unit cost</th><th className="cos-num">Cost of sales</th><th className="cos-num">Gross profit</th><th>Cost source</th></tr></thead>
                                <tbody>
                                    {lineRows.map((row, index) => (
                                        <tr key={`${row.saleId}-${row.productKey}-${index}`}>
                                            <td>{row.date}</td>
                                            <td>{row.saleReference}</td>
                                            <td>{row.customer}</td>
                                            <td>{row.product}</td>
                                            <td>{row.sku || '-'}</td>
                                            <td className="cos-num">{formatNumber(row.qty)}</td>
                                            <td className="cos-num">{formatUnitCost(row.unitPrice)}</td>
                                            <td className="cos-num">{formatCurrency(row.revenue)}</td>
                                            <td className="cos-num">{formatUnitCost(row.unitCost)}</td>
                                            <td className="cos-num">{formatCurrency(row.cost)}</td>
                                            <td className={`cos-num ${row.grossProfit < 0 ? 'cos-negative' : ''}`}>{formatCurrency(row.grossProfit)}</td>
                                            <td><span className={`inventory-pill ${row.costSource === 'locked' ? 'success' : row.costSource === 'missing' ? 'danger' : 'warning'}`}>{costSourceLabels[row.costSource]}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        {!loading && report && (view === 'products' ? productRows.length === 0 : lineRows.length === 0) && (
                            <div className="cos-empty">{query ? 'No results match your search.' : 'No sales saved to the database in this period.'}</div>
                        )}
                    </div>
                </div>
            </div>
        </AppLayout>
    )
}
