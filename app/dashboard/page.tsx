'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting } from '@/lib/context'
import { businessHealth, dateKey, dueOn, overdueAmount, outstanding, percentChange, performanceSeries, seriesForDays, sumOnDate } from '@/lib/dashboard-metrics'
import { planCanAccessRoute } from '@/lib/licensing'
import { roleHasPermission } from '@/lib/rbac'
import { formatCurrency, formatNumber } from '@/lib/utils'

const ranges = { '7D': 7, '30D': 30, '90D': 90, '1Y': 365 } as const

function Sparkline({ values }: { values: number[] }) {
    const max = Math.max(...values, 1)
    const width = 140
    const height = 42
    const points = values.map((value, index) => {
        const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width
        const y = height - (Math.max(value, 0) / max) * (height - 4)
        return `${x},${y}`
    }).join(' ')
    return (
        <svg className="kpi-card-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Seven day trend">
            <polyline fill="none" stroke="currentColor" strokeWidth="2.5" points={points} />
        </svg>
    )
}

export default function DashboardPage() {
    const { state, user } = useAccounting()
    const [selectedRange, setSelectedRange] = useState<keyof typeof ranges>('30D')
    const today = dateKey(new Date())
    const yesterday = dateKey(new Date(Date.now() - 86400000))
    const activeSales = state.sales.filter((sale) => sale.status?.toUpperCase() !== 'VOID')
    const activeExpenses = state.expenses.filter((expense) => expense.status?.toUpperCase() !== 'VOID')
    const activePurchases = state.purchases.filter((purchase) => purchase.status?.toUpperCase() !== 'VOID')
    const salesSeries = activeSales.map((sale) => ({ date: sale.date, amount: Number(sale.totalAmount || 0), status: sale.status }))
    const expenseSeries = activeExpenses.map((expense) => ({ date: expense.date, amount: Number(expense.amount || 0), status: expense.status }))
    const purchaseSeries = activePurchases.map((purchase) => ({ date: purchase.date, amount: Number(purchase.total || 0), status: purchase.status }))

    const revenueToday = sumOnDate(salesSeries, today)
    const revenueYesterday = sumOnDate(salesSeries, yesterday)
    const expensesToday = sumOnDate(expenseSeries, today) + sumOnDate(purchaseSeries, today)
    const expensesYesterday = sumOnDate(expenseSeries, yesterday) + sumOnDate(purchaseSeries, yesterday)
    const profitToday = revenueToday - expensesToday
    const profitYesterday = revenueYesterday - expensesYesterday
    const cashAvailable = state.bankAccounts.length > 0
        ? state.bankAccounts.filter((account) => String(account.status || 'active').toLowerCase() === 'active').reduce((sum, account) => sum + Number(account.balance || 0), 0)
        : Object.values(state.banks).reduce((sum, balance) => sum + Number(balance || 0), 0)
    const receivablesBalance = state.receivables.reduce((sum, item) => sum + outstanding(item), 0)
    const payablesBalance = state.payables.reduce((sum, item) => sum + outstanding(item), 0)
    const receivablesOverdue = overdueAmount(state.receivables, today)
    const payablesOverdue = overdueAmount(state.payables, today)
    const receivablesDue = dueOn(state.receivables, today)
    const payablesDue = dueOn(state.payables, today)
    const lowStock = state.inventory.filter((item) => item.closing > 0 && item.closing <= (item.reorderLevel ?? 10)).length
    const outOfStock = state.inventory.filter((item) => item.closing <= 0).length
    const inStock = Math.max(0, state.inventory.length - lowStock - outOfStock)
    const stockTotal = Math.max(state.inventory.length, 1)
    const health = businessHealth({ cash: cashAvailable, profit: profitToday, overdue: receivablesOverdue, outOfStock, lowStock })

    const chart = useMemo(() => performanceSeries({
        sales: salesSeries,
        expenses: expenseSeries,
        purchases: purchaseSeries,
        endDay: today,
        days: ranges[selectedRange],
    }), [salesSeries, expenseSeries, purchaseSeries, today, selectedRange])
    const chartSummary = chart.reduce((total, point) => ({
        revenue: total.revenue + point.revenue,
        expenses: total.expenses + point.expenses,
        profit: total.profit + point.profit,
    }), { revenue: 0, expenses: 0, profit: 0 })
    const chartMax = Math.max(...chart.flatMap((point) => [point.revenue, point.expenses, Math.abs(point.profit)]), 1)
    const hasChartActivity = chart.some((point) => point.revenue || point.expenses || point.profit)

    const cashflow = useMemo(() => {
        const start = chart[0]?.start || today
        const end = chart[chart.length - 1]?.end || today
        return state.bankTxns.reduce((total, txn) => {
            const day = String(txn.date || '').slice(0, 10)
            const transfer = String(txn.type || '').toUpperCase() === 'TRANSFER' || String(txn.activity || '').toLowerCase().includes('inter-bank transfer')
            if (!day || day < start || day > end || String(txn.status || '').toUpperCase() === 'VOID' || transfer) return total
            const amount = Number(txn.amount || 0)
            if (amount > 0) total.in += amount
            if (amount < 0) total.out += Math.abs(amount)
            return total
        }, { in: 0, out: 0 })
    }, [chart, state.bankTxns, today])

    const topProducts = Object.entries(activeSales.flatMap((sale) => sale.items || []).reduce<Record<string, number>>((totals, item) => {
        const name = item.product || 'Product'
        totals[name] = (totals[name] || 0) + Number(item.qty || 0)
        return totals
    }, {})).sort((left, right) => right[1] - left[1]).slice(0, 4)
    const maxProductQty = Math.max(...topProducts.map(([, qty]) => qty), 1)
    const recentSales = [...activeSales].sort((left, right) => String(right.date).localeCompare(String(left.date))).slice(0, 5)
    const todayOrders = activeSales.filter((sale) => String(sale.date || '').slice(0, 10) === today)
    const banks = state.bankAccounts.length > 0
        ? state.bankAccounts.map((account) => ({ name: account.name, balance: Number(account.balance || 0), detail: account.institution || account.accountType || 'Bank account', last4: String(account.accountNumber || '').slice(-4) }))
        : Object.entries(state.banks).map(([name, balance]) => ({ name, balance: Number(balance || 0), detail: 'Bank account', last4: '' }))

    const quickActions = [
        { label: 'New Sale', href: '/sales', permission: 'sales' as const },
        { label: 'Expense', href: '/expenses', permission: 'expenses' as const },
        { label: 'Customer', href: '/customers', permission: 'customers' as const },
        { label: 'Supplier', href: '/suppliers', permission: 'suppliers' as const },
        { label: 'Product', href: '/product-manager', permission: 'productManager' as const },
        { label: 'Payment', href: '/bank-txn', permission: 'bankTxn' as const },
    ].filter((action) => roleHasPermission(user, action.permission) && planCanAccessRoute(user?.subscriptionPlan, action.href, user?.subscriptionStatus))

    const revenueSpark = seriesForDays(salesSeries, today, 7)
    const expenseSpark = seriesForDays([...expenseSeries, ...purchaseSeries], today, 7)
    const profitSpark = revenueSpark.map((value, index) => value - expenseSpark[index])

    return (
        <AppLayout>
            <div className="dashboard-shell">
                <section className="dashboard-header">
                    <div>
                        <p className="dashboard-eyebrow">Welcome, {user?.name}</p>
                        <h1>{state.companySettings.companyName || 'Your business'} today</h1>
                        <p className="dashboard-subtitle">{new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                        {user?.subscriptionStatus === 'trial' && user.trialEndsAt && <p className="dashboard-trial">14-day full access until {new Date(user.trialEndsAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}.</p>}
                    </div>
                </section>

                <section className="dashboard-kpi-grid">
                    {[
                        { label: 'Revenue today', value: revenueToday, trend: percentChange(revenueToday, revenueYesterday), spark: revenueSpark, note: 'Compared with yesterday' },
                        { label: 'Expenses today', value: expensesToday, trend: percentChange(expensesToday, expensesYesterday), spark: expenseSpark, note: 'Purchases and expenses versus yesterday' },
                        { label: 'Profit today', value: profitToday, trend: percentChange(profitToday, profitYesterday), spark: profitSpark, note: 'Revenue minus today’s costs' },
                        { label: 'Cash available', value: cashAvailable, trend: cashAvailable >= 0 ? 'Live' : 'Overdrawn', spark: null, note: 'Sum of active bank balances' },
                        { label: 'Receivables', value: receivablesBalance, trend: receivablesOverdue > 0 ? `${formatCurrency(receivablesOverdue)} overdue` : 'None overdue', spark: null, note: 'Open customer balances' },
                        { label: 'Payables', value: payablesBalance, trend: payablesOverdue > 0 ? `${formatCurrency(payablesOverdue)} overdue` : 'None overdue', spark: null, note: 'Open supplier balances' },
                    ].map((card) => (
                        <article key={card.label} className="kpi-card">
                            <div className="kpi-card-top">
                                <span className="kpi-card-label">{card.label}</span>
                                <span className={`kpi-card-trend ${String(card.trend).startsWith('-') ? 'negative' : 'positive'}`}>{card.trend}</span>
                            </div>
                            <div className="kpi-card-value">{formatCurrency(card.value)}</div>
                            {card.spark ? <Sparkline values={card.spark} /> : <div className="kpi-card-chart" aria-hidden="true" />}
                            <div className="kpi-card-footnote">{card.note}</div>
                        </article>
                    ))}
                </section>

                <section className="dashboard-main-grid">
                    <article className="card financial-performance-card">
                        <div className="card-hd">
                            <div className="card-title">Financial performance</div>
                            <div className="chart-toolbar">
                                {(Object.keys(ranges) as Array<keyof typeof ranges>).map((range) => (
                                    <button key={range} type="button" className={`chart-range ${selectedRange === range ? 'active' : ''}`} onClick={() => setSelectedRange(range)}>{range}</button>
                                ))}
                            </div>
                        </div>
                        <div className="financial-performance-body">
                            <div className="financial-performance-summary">
                                <div className="financial-performance-row"><span>Revenue</span><strong>{formatCurrency(chartSummary.revenue)}</strong></div>
                                <div className="financial-performance-row"><span>Expenses</span><strong>{formatCurrency(chartSummary.expenses)}</strong></div>
                                <div className="financial-performance-row"><span>Profit</span><strong>{formatCurrency(chartSummary.profit)}</strong></div>
                            </div>
                            {hasChartActivity ? (
                                <div className="financial-performance-visual">
                                    <div className="financial-performance-chart">
                                        {chart.map((point) => (
                                            <div key={`${point.start}-${point.label}`} className="financial-performance-bar" title={`${point.start} to ${point.end}`}>
                                                <div className="financial-performance-bar-group">
                                                    <div className="financial-performance-bar-fill revenue" style={{ height: `${point.revenue === 0 ? 0 : Math.max((point.revenue / chartMax) * 100, 2)}%` }} />
                                                    <div className="financial-performance-bar-fill expenses" style={{ height: `${point.expenses === 0 ? 0 : Math.max((point.expenses / chartMax) * 100, 2)}%` }} />
                                                    <div className="financial-performance-bar-fill profit" style={{ height: `${point.profit === 0 ? 0 : Math.max((Math.abs(point.profit) / chartMax) * 100, 2)}%` }} />
                                                </div>
                                                <span>{point.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="chart-legend"><span><i /> Revenue</span><span><i className="expenses" /> Expenses</span><span><i className="profit" /> Profit</span></div>
                                </div>
                            ) : <div className="chart-empty">No sales, purchases, or expenses in this range.</div>}
                        </div>
                    </article>
                    <article className="card cashflow-card compact">
                        <div className="card-title">Cash flow</div>
                        <div className="cashflow-values">
                            <div><span>Money in</span><strong>{formatCurrency(cashflow.in)}</strong></div>
                            <div><span>Money out</span><strong>{formatCurrency(cashflow.out)}</strong></div>
                            <div><span>Net</span><strong>{formatCurrency(cashflow.in - cashflow.out)}</strong></div>
                        </div>
                        <p className="kpi-card-footnote">Bank movements in the selected range, excluding transfers between your own accounts.</p>
                    </article>
                </section>

                <section className="dashboard-split-grid">
                    <article className="card health-card wide">
                        <div className="card-title">Business health</div>
                        <div className="health-panel">
                            <div className="health-score-ring"><strong>{health.score}%</strong></div>
                            <div className="health-detail">
                                <p className="health-summary">{health.label}</p>
                                <div className="health-checks">
                                    {health.checks.map((check) => (
                                        <div key={check.label} className="health-check"><span>{check.ok ? '✓' : '!'}</span><span>{check.label}</span></div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </article>
                    <article className="card bank-cards-panel wide">
                        <div className="card-hd"><div className="card-title">Bank accounts</div><Link className="btn btn-sm" href="/banks">View all</Link></div>
                        <div className="bank-cards-grid">
                            {banks.length === 0 && <div className="chart-empty">No bank accounts yet.</div>}
                            {banks.slice(0, 2).map((bank, index) => (
                                <div key={bank.name} className="bank-card-large" style={{ background: index % 2 === 0 ? 'linear-gradient(135deg, #0f172a, #2563eb)' : 'linear-gradient(135deg, #064e3b, #10b981)' }}>
                                    <div className="bank-card-header"><span>{bank.detail}</span><span>{bank.last4 ? `•••• ${bank.last4}` : bank.name}</span></div>
                                    <div className="bank-card-balance">{formatCurrency(bank.balance)}</div>
                                    <div className="bank-card-footer"><span>{bank.name}</span><span>Live balance</span></div>
                                </div>
                            ))}
                        </div>
                    </article>
                </section>

                <section className="dashboard-split-grid">
                    <article className="card sales-card">
                        <div className="card-title">Today&apos;s sales</div>
                        <div className="mini-stat-grid">
                            <div><span>Sales</span><strong>{formatCurrency(revenueToday)}</strong></div>
                            <div><span>Orders</span><strong>{formatNumber(todayOrders.length)}</strong></div>
                            <div><span>Paid</span><strong>{formatNumber(todayOrders.filter((sale) => String(sale.paymentStatus || '').toUpperCase() === 'PAID').length)}</strong></div>
                            <div><span>Returns</span><strong>{formatNumber(state.sales.filter((sale) => String(sale.date || '').slice(0, 10) === today && ['RETURN', 'RETURNED', 'VOID'].includes(String(sale.status || '').toUpperCase())).length)}</strong></div>
                        </div>
                        <div className="mini-chart-list">
                            {topProducts.length === 0 && <div className="chart-empty">No products sold yet.</div>}
                            {topProducts.map(([product, qty]) => (
                                <div key={product} className="mini-chart-row"><span>{product}</span><div className="mini-chart-bar" style={{ width: `${Math.max(8, (qty / maxProductQty) * 100)}%` }} /></div>
                            ))}
                        </div>
                    </article>
                    <article className="card inventory-card compact">
                        <div className="card-title">Inventory</div>
                        <div className="mini-stat-grid">
                            <div><span>Products</span><strong>{formatNumber(state.inventory.length)}</strong></div>
                            <div><span>In stock</span><strong>{formatNumber(inStock)}</strong></div>
                            <div><span>Low stock</span><strong>{formatNumber(lowStock)}</strong></div>
                            <div><span>Out of stock</span><strong>{formatNumber(outOfStock)}</strong></div>
                        </div>
                        {state.inventory.length > 0 && (
                            <>
                                <div className="inventory-donut" style={{ ['--stock' as string]: `${(inStock / stockTotal) * 100}%`, ['--low' as string]: `${((inStock + lowStock) / stockTotal) * 100}%` }} />
                                <div className="inventory-donut-caption"><span>In stock</span><span>Low</span><span>Out</span></div>
                            </>
                        )}
                    </article>
                </section>

                <section className="dashboard-split-grid">
                    <article className="card receivables-card compact">
                        <div className="card-title">Receivables</div>
                        <div className="panel-stat-row"><div><span>Outstanding</span><strong>{formatCurrency(receivablesBalance)}</strong></div><div><span>Overdue</span><strong>{formatCurrency(receivablesOverdue)}</strong></div></div>
                        <div className="panel-stat-row"><div><span>Due today</span><strong>{formatCurrency(receivablesDue)}</strong></div></div>
                    </article>
                    <article className="card payables-card compact">
                        <div className="card-title">Payables</div>
                        <div className="panel-stat-row"><div><span>Outstanding</span><strong>{formatCurrency(payablesBalance)}</strong></div><div><span>Overdue</span><strong>{formatCurrency(payablesOverdue)}</strong></div></div>
                        <div className="panel-stat-row"><div><span>Due today</span><strong>{formatCurrency(payablesDue)}</strong></div></div>
                    </article>
                </section>

                <section className="dashboard-split-grid">
                    <article className="card sales-card">
                        <div className="card-title">Recent sales</div>
                        {recentSales.length === 0 && <div className="chart-empty">Sales you record will appear here.</div>}
                        {recentSales.map((sale) => (
                            <div key={sale.id} className="financial-performance-row"><span>{sale.customer || 'Customer'} · {String(sale.date || '').slice(0, 10)}</span><strong>{formatCurrency(Number(sale.totalAmount || 0))}</strong></div>
                        ))}
                    </article>
                    <div className="quick-actions-row">
                        {quickActions.map((action) => <Link key={action.href} className="quick-action-button" href={action.href}>+ {action.label}</Link>)}
                    </div>
                </section>
            </div>
        </AppLayout>
    )
}
