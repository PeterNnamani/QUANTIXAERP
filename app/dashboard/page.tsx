'use client'

import { useMemo, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting } from '@/lib/context'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { roleHasPermission } from '@/lib/rbac'

export default function DashboardPage() {
  const { state, user } = useAccounting()
  const [selectedRange, setSelectedRange] = useState<'7D' | '30D' | '90D' | '1Y'>('30D')

  const now = new Date()
  const greeting = 'Welcome'
  const currentDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const currentTime = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  const totalSales = state.sales.filter((sale) => sale.status !== 'VOID').reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0)
  const totalPurchases = state.purchases.filter((purchase) => purchase.status !== 'VOID').reduce((sum, purchase) => sum + Number(purchase.total || 0), 0)
  const totalExpenses = state.expenses.filter((expense) => expense.status !== 'VOID').reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  const profit = totalSales - totalPurchases - totalExpenses
  const cashAvailable = state.bankAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0)

  const dateKeyFromDate = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const todayKey = dateKeyFromDate(now)
  const yesterdayKey = dateKeyFromDate(new Date(now.getTime() - 86400000))

  const getDateKey = (value: string | Date) => {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : dateKeyFromDate(date)
  }

  const sumByDate = (records: any[], dateField: string, amountField: string, targetDate: string) =>
    records.reduce((sum, record) => {
      return getDateKey(record[dateField]) === targetDate ? sum + Number(record[amountField] || 0) : sum
    }, 0)

  const revenueToday = sumByDate(state.sales, 'date', 'totalAmount', todayKey)
  const revenueYesterday = sumByDate(state.sales, 'date', 'totalAmount', yesterdayKey)
  const expensesToday = sumByDate(state.expenses, 'date', 'amount', todayKey)
  const expensesYesterday = sumByDate(state.expenses, 'date', 'amount', yesterdayKey)
  const netProfitToday = revenueToday - expensesToday
  const netProfitYesterday = revenueYesterday - expensesYesterday

  const totalUnpaid = state.receivables.reduce((sum, item) => sum + Number(item.balance ?? item.balanceDue ?? item.outstanding_amount ?? 0), 0)
  const totalOverdue = state.receivables
    .filter((item) => String(item.status || '').toUpperCase() === 'OVERDUE')
    .reduce((sum, item) => sum + Number(item.balance ?? item.balanceDue ?? item.outstanding_amount ?? 0), 0)
  const totalProducts = state.inventory.length
  const lowStock = state.inventory.filter((item) => item.closing > 0 && item.closing <= 10).length
  const outOfStock = state.inventory.filter((item) => item.closing <= 0).length
  const expiring = state.inventory.filter((item) => item.closing > 0 && item.closing <= 5).length
  const receivablesYesterday = state.sales
    .filter((sale) => getDateKey(sale.date) === yesterdayKey && sale.status !== 'VOID' && sale.paymentStatus?.toUpperCase() !== 'PAID')
    .reduce((sum, sale) => sum + sale.totalAmount, 0)

  const totalPayables = state.payables.reduce((sum, item) => sum + Number(item.balance ?? item.balanceDue ?? item.balance_due ?? item.outstanding_amount ?? 0), 0)
  const payablesYesterday = state.purchases
    .filter((purchase) => getDateKey(purchase.date) === yesterdayKey && purchase.status !== 'VOID')
    .reduce((sum, purchase) => sum + purchase.total, 0)

  const bankNetToday = state.bankTxns.reduce((sum, txn) => {
    return getDateKey(txn.date) === todayKey ? sum + (txn.amount || 0) : sum
  }, 0)
  const cashPrevious = cashAvailable - bankNetToday

  const healthScore = Math.min(98, Math.max(72, Math.round(80 + (netProfitToday / Math.max(cashAvailable, 1)) * 8)))
  const healthLabel = healthScore >= 90 ? 'Excellent' : healthScore >= 78 ? 'Strong' : 'Stable'

  const getPercentChange = (current: number, previous: number) => {
    if (previous === 0) return current === 0 ? '0%' : '+100%'
    const change = Math.round(((current - previous) / previous) * 100)
    return `${change >= 0 ? '+' : ''}${change}%`
  }

  const normalizeSpark = (values: number[]) => {
    const max = Math.max(...values, 1)
    return values.map((value) => Math.max(12, Math.round((value / max) * 100)))
  }

  const last7Dates = useMemo(() => {
    const dates: string[] = []
    const base = new Date(`${todayKey}T00:00:00`)
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(base)
      date.setDate(base.getDate() - i)
      dates.push(getDateKey(date))
    }
    return dates
  }, [todayKey])

  const last7Revenue = useMemo(
    () => last7Dates.map((date) => sumByDate(state.sales, 'date', 'totalAmount', date)),
    [last7Dates, state.sales]
  )

  const last7Expenses = useMemo(
    () => last7Dates.map((date) => sumByDate(state.expenses, 'date', 'amount', date)),
    [last7Dates, state.expenses]
  )

  const last7Profit = useMemo(
    () => last7Revenue.map((value, index) => value - last7Expenses[index]),
    [last7Revenue, last7Expenses]
  )

  const revenueTrend = getPercentChange(revenueToday, revenueYesterday)
  const expensesTrend = getPercentChange(expensesToday, expensesYesterday)
  const profitTrend = getPercentChange(netProfitToday, netProfitYesterday)
  const cashTrend = getPercentChange(cashAvailable, cashPrevious)
  const receivablesTrend = getPercentChange(totalUnpaid, receivablesYesterday)
  const payablesTrend = getPercentChange(totalPayables, payablesYesterday)

  const rangeDaysMap = { '7D': 7, '30D': 30, '90D': 90, '1Y': 365 } as const
  const rangeDays = rangeDaysMap[selectedRange]

  const chartBuckets = useMemo(() => {
    const endDate = new Date(`${todayKey}T00:00:00`)
    const startDate = new Date(endDate)
    startDate.setDate(endDate.getDate() - rangeDays + 1)
    return Array.from({ length: 7 }, (_, index) => {
      const bucketStart = new Date(startDate)
      bucketStart.setDate(startDate.getDate() + Math.floor((index * rangeDays) / 7))
      const bucketEnd = new Date(bucketStart)
      bucketEnd.setDate(startDate.getDate() + Math.floor(((index + 1) * rangeDays) / 7) - 1)
      return { start: bucketStart, end: bucketEnd }
    })
  }, [selectedRange, todayKey, rangeDays])

  const chartData = useMemo(() => {
    const inRange = (date: string, start: Date, end: Date) => {
      const dateKey = getDateKey(date)
      return dateKey >= getDateKey(start) && dateKey <= getDateKey(end)
    }

    return chartBuckets.map(({ start, end }) => {
      const revenue = state.sales.reduce((sum, sale) => inRange(sale.date, start, end) && sale.status?.toUpperCase() !== 'VOID' ? sum + Number(sale.totalAmount || 0) : sum, 0)
      const expenses = state.expenses.reduce((sum, expense) => inRange(expense.date, start, end) && expense.status?.toUpperCase() !== 'VOID' ? sum + Number(expense.amount || 0) : sum, 0)
      const purchases = state.purchases.reduce((sum, purchase) => inRange(purchase.date, start, end) && purchase.status?.toUpperCase() !== 'VOID' ? sum + Number(purchase.total || 0) : sum, 0)
      return { revenue, expenses: expenses + purchases, profit: revenue - expenses - purchases }
    })
  }, [chartBuckets, state.sales, state.expenses, state.purchases])

  const chartValues = chartData.flatMap((bucket) => [bucket.revenue, bucket.expenses, bucket.profit])
  const chartRange = useMemo(() => ({
    start: getDateKey(chartBuckets[0]?.start),
    end: getDateKey(chartBuckets[chartBuckets.length - 1]?.end),
  }), [chartBuckets])

  const chartSummary = useMemo(() => {
    const inRange = (date: string) => {
      const dateKey = getDateKey(date)
      return dateKey >= chartRange.start && dateKey <= chartRange.end
    }
    const revenue = state.sales.reduce((sum, sale) => inRange(sale.date) && sale.status?.toUpperCase() !== 'VOID' ? sum + Number(sale.totalAmount || 0) : sum, 0)
    const expenses = state.expenses.reduce((sum, expense) => inRange(expense.date) && expense.status?.toUpperCase() !== 'VOID' ? sum + Number(expense.amount || 0) : sum, 0)
    const purchases = state.purchases.reduce((sum, purchase) => inRange(purchase.date) && purchase.status?.toUpperCase() !== 'VOID' ? sum + Number(purchase.total || 0) : sum, 0)
    return { revenue, expenses: expenses + purchases, profit: revenue - expenses - purchases }
  }, [chartRange, state.sales, state.expenses, state.purchases])

  const cashflowSummary = useMemo(() => {
    const rangeStart = chartRange.start
    const rangeEnd = chartRange.end
    const transactions = state.bankTxns.filter((txn) => {
      const dateKey = getDateKey(txn.date)
      const isTransfer = String(txn.type || '').toUpperCase() === 'TRANSFER'
        || String(txn.activity || '').toLowerCase().includes('inter-bank transfer')
      return dateKey && dateKey >= rangeStart && dateKey <= rangeEnd && txn.status?.toUpperCase() !== 'VOID' && !isTransfer
    })
    const totals = transactions.reduce(
      (result, txn) => {
        const amount = Number(txn.amount || 0)
        if (amount > 0) result.moneyIn += amount
        if (amount < 0) result.moneyOut += Math.abs(amount)
        return result
      },
      { moneyIn: 0, moneyOut: 0 }
    )

    const transactionText = transactions.map((txn) => `${txn.name || ''} ${txn.activity || ''} ${txn.description || ''}`.toLowerCase()).join(' ')
    state.sales.forEach((sale) => {
      const dateKey = getDateKey(sale.date)
      const saleId = String(sale.id || '').toLowerCase()
      if (dateKey >= rangeStart && dateKey <= rangeEnd && sale.status?.toUpperCase() !== 'VOID' && sale.paymentStatus?.toUpperCase() === 'PAID' && saleId && !transactionText.includes(saleId)) {
        totals.moneyIn += Number(sale.totalAmount || 0)
      }
    })
    return totals
  }, [chartRange, state.bankTxns, state.sales])

  const chartLabels = useMemo(
    () =>
      chartBuckets.map(({ start }, index) => {
        if (selectedRange === '7D') return start.toLocaleDateString('en-US', { weekday: 'short' })
        if (selectedRange === '30D') return `Wk ${index + 1}`
        if (selectedRange === '90D') return `P${index + 1}`
        return start.toLocaleDateString('en-US', { month: 'short' })
      }),
    [chartBuckets, selectedRange]
  )

  const chartMax = Math.max(...chartValues.map((value) => Math.abs(value)), 1)

  const kpiCards = [
    {
      label: 'Revenue Today',
      value: formatCurrency(revenueToday),
      trend: revenueTrend,
      trendLabel: 'Since yesterday',
      variant: 'revenue',
      spark: normalizeSpark(last7Revenue),
    },
    {
      label: 'Expenses Today',
      value: formatCurrency(expensesToday),
      trend: expensesTrend,
      trendLabel: 'Since yesterday',
      variant: 'expenses',
      spark: normalizeSpark(last7Expenses),
    },
    {
      label: 'Net Profit',
      value: formatCurrency(netProfitToday),
      trend: profitTrend,
      trendLabel: 'Since yesterday',
      variant: 'profit',
      spark: normalizeSpark(last7Profit),
    },
    {
      label: 'Cash Available',
      value: formatCurrency(cashAvailable),
      trend: cashTrend,
      trendLabel: 'Since yesterday',
      variant: 'cash',
      spark: normalizeSpark(last7Revenue.map((value) => value * 0.5)),
    },
    {
      label: 'Receivables',
      value: formatCurrency(totalUnpaid),
      trend: receivablesTrend,
      trendLabel: 'Since yesterday',
      variant: 'receivables',
      spark: normalizeSpark(last7Revenue.map((value) => value * 0.4)),
    },
    {
      label: 'Payables',
      value: formatCurrency(totalPayables),
      trend: payablesTrend,
      trendLabel: 'Since yesterday',
      variant: 'payables',
      spark: normalizeSpark(last7Expenses.map((value) => value * 0.5)),
    },
  ]

  const bankCards = Object.entries(state.banks).map(([name, balance], index) => ({
    name,
    balance,
    brand: ['GTBank', 'UBA', 'First Bank', 'Access'][index] ?? 'Core Bank',
    gradient: index % 2 === 0 ? 'linear-gradient(135deg, #0f172a, #2563eb)' : 'linear-gradient(135deg, #064e3b, #10b981)',
  }))

  const topSellingProducts = Object.entries(
    state.sales
      .flatMap((sale) => sale.items ?? [])
      .reduce<Record<string, number>>((acc, item) => {
        acc[item.product] = (acc[item.product] || 0) + item.qty
        return acc
      }, {})
  )
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([product, qty]) => ({ product, qty }))

  const recentTransactions = state.sales
    .slice()
    .reverse()
    .slice(0, 6)
    .map((sale) => ({
      time: sale.date,
      type: 'Sale',
      party: sale.customer,
      amount: sale.totalAmount,
      status: sale.paymentStatus || 'Pending',
    }))

  const topCustomers = Object.entries(
    state.sales.reduce<Record<string, number>>((acc, sale) => {
      acc[sale.customer] = (acc[sale.customer] || 0) + sale.totalAmount
      return acc
    }, {})
  )
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([customer, amount]) => ({ customer, amount }))

  const topSuppliers = Array.from(new Set(state.purchases.map((purchase) => purchase.supplier))).slice(0, 4)
  const salesOrders = state.sales.filter((sale) => sale.status !== 'VOID').length
  const paidInvoices = state.sales.filter((sale) => sale.paymentStatus?.toUpperCase() === 'PAID').length
  const returnsCount = state.sales.filter((sale) => ['RETURN', 'RETURNED', 'VOID'].includes(sale.status?.toUpperCase())).length
  const approvalCounts = {
    expenses: state.expenses.filter((expense) => expense.status?.toLowerCase() === 'pending').length || 5,
    purchases: state.purchases.filter((purchase) => purchase.status?.toLowerCase() === 'pending').length || 3,
    payments: 2,
    journal: 1,
    leave: 4,
  }

  const notifications = [
    'Low stock on 24 products',
    'Supplier payment overdue',
    'Bank reconciliation pending',
    'Inventory variance detected',
    'License expires soon',
    'Backup completed',
  ]

  const topSellingProductsDisplay = topSellingProducts.length
    ? topSellingProducts
    : []

  const recentTransactionsDisplay = recentTransactions.length
    ? recentTransactions
    : []

  const quickActions = [
    { label: 'New Sale', permission: 'sales' as const },
    { label: 'Expense', permission: 'expenses' as const },
    { label: 'Customer', permission: 'customers' as const },
    { label: 'Supplier', permission: 'suppliers' as const },
    { label: 'Product', permission: 'productManager' as const },
    { label: 'Payment', permission: 'bankTxn' as const },
  ].filter((action) => roleHasPermission(user, action.permission))
  const [isQUANTIXAOpen, setIsQUANTIXAOpen] = useState(false)
  const [orbHovered, setOrbHovered] = useState(false)
  const [voiceActive, setVoiceActive] = useState(false)

  const quantixaHighlights = [
    { label: 'Revenue', value: '↑ 18%', detail: 'Compared to yesterday' },
    { label: 'Expenses', value: '↓ 6%', detail: 'Cash efficiency improved' },
    { label: 'Cash', value: '₦15.4M', detail: 'Healthy liquidity position' },
  ]

  const quantixaMemory = [
    { date: 'July 29', text: 'Revenue spike detected.' },
    { date: 'July 22', text: 'Marketing campaign increased sales.' },
    { date: 'June 14', text: 'Inventory shortage happened.' },
  ]

  const quantixaPrediction = {
    headline: 'Your cash balance may reduce below ₦5M in 18 days.',
    reason: ['High supplier payments', 'Increased expenses'],
    recommendation: 'Delay non-essential purchases.',
  }

  const quantixaCommand = {
    audience: 'ABC Ltd',
    product: 'HP Laptop',
    quantity: 20,
    price: '₦350,000',
    total: '₦7,000,000',
  }

  const cashIn = cashflowSummary.moneyIn
  const cashOut = cashflowSummary.moneyOut
  const cashNet = cashIn - cashOut

  const healthChecks = [
    { label: 'Cash Flow', ok: true },
    { label: 'Inventory', ok: totalProducts > 0 },
    { label: 'Debt', ok: true },
    { label: 'Growth', ok: true },
  ]

  return (
    <AppLayout>
      <div className="dashboard-shell">
        <section className="dashboard-header">
          <div>
            <p className="dashboard-eyebrow">{greeting}, {user?.name}</p>
            <h1>Here&apos;s your business overview for today.</h1>
            <p className="dashboard-subtitle">{currentDate}</p>
          </div>
        </section>

        <section className="dashboard-kpi-grid">
          {kpiCards.map((card) => (
            <article key={card.label} className={`kpi-card kpi-card-${card.variant}`}>
              <div className="kpi-card-top">
                <span className="kpi-card-label">{card.label}</span>
                <span className={`kpi-card-trend ${card.trend.startsWith('-') ? 'negative' : 'positive'}`}>{card.trend}</span>
              </div>
              <div className="kpi-card-value">{card.value}</div>
              <div className="kpi-card-chart">
                {card.spark.map((point, index) => (
                  <span key={index} style={{ height: `${point}%` }} />
                ))}
              </div>
              <div className="kpi-card-footnote">{card.trendLabel}</div>
            </article>
          ))}
        </section>

        <section className="dashboard-main-grid">
          <article className="card financial-performance-card">
            <div className="card-hd">
              <div className="card-title">Financial Performance</div>
              <div className="chart-toolbar">
                {(['7D', '30D', '90D', '1Y'] as const).map((range) => (
                  <button
                    key={range}
                    type="button"
                    className={`chart-range ${selectedRange === range ? 'active' : ''}`}
                    onClick={() => setSelectedRange(range)}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
            <div className="financial-performance-body">
              <div className="financial-performance-summary">
                <div className="financial-performance-row">
                  <span>Revenue</span>
                    <strong>{formatCurrency(chartSummary.revenue)}</strong>
                </div>
                <div className="financial-performance-row">
                  <span>Expenses</span>
                  <strong>{formatCurrency(chartSummary.expenses)}</strong>
                </div>
                <div className="financial-performance-row">
                  <span>Profit</span>
                    <strong>{formatCurrency(chartSummary.profit)}</strong>
                </div>
              </div>
              <div className="financial-performance-visual">
                <div className="financial-performance-chart">
                  {chartData.map((bucket, index) => (
                    <div
                      key={index}
                      className="financial-performance-bar"
                      title={`${getDateKey(chartBuckets[index].start)} to ${getDateKey(chartBuckets[index].end)}: Revenue ${formatCurrency(bucket.revenue)}, Expenses ${formatCurrency(bucket.expenses)}, Profit ${formatCurrency(bucket.profit)}`}
                      aria-label={`${chartLabels[index] ?? ''}: Revenue ${formatCurrency(bucket.revenue)}, Expenses ${formatCurrency(bucket.expenses)}, Profit ${formatCurrency(bucket.profit)}`}
                    >
                      <div className="financial-performance-bar-group">
                        {[
                          { value: bucket.revenue, className: 'revenue' },
                          { value: bucket.expenses, className: 'expenses' },
                          { value: bucket.profit, className: 'profit' },
                        ].map((bar) => (
                          <div
                            key={bar.className}
                            className={`financial-performance-bar-fill ${bar.className}`}
                            style={{ height: `${bar.value === 0 ? 0 : Math.max((Math.abs(bar.value) / chartMax) * 100, 1)}%` }}
                            title={`${bar.className}: ${formatCurrency(bar.value)}`}
                          />
                        ))}
                      </div>
                      <span>{chartLabels[index] ?? ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>
          <article className="card cashflow-card compact">
            <div className="card-title">Cash Flow</div>
            <div className="cashflow-values">
              <div>
                <span>Money In</span>
                <strong>{formatCurrency(cashIn)}</strong>
              </div>
              <div>
                <span>Money Out</span>
                <strong>{formatCurrency(cashOut)}</strong>
              </div>
              <div>
                <span>Net</span>
                <strong>{formatCurrency(cashNet)}</strong>
              </div>
            </div>
          </article>
        </section>

        <section className="dashboard-split-grid">
          <article className="card health-card wide">
            <div className="card-title">Business Health</div>
            <div className="health-panel">
              <div className="health-score-ring">
                <strong>{healthScore}%</strong>
              </div>
              <div className="health-detail">
                <p className="health-summary">{healthLabel}</p>
                <div className="health-checks">
                  {healthChecks.map((item) => (
                    <div key={item.label} className="health-check">
                      <span>✓</span>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>

          <article className="card bank-cards-panel wide">
            <div className="card-hd">
              <div className="card-title">Bank Accounts</div>
              <button className="btn btn-sm">View all</button>
            </div>
            <div className="bank-cards-grid">
              {bankCards.slice(0, 2).map((bank) => (
                <div key={bank.name} className="bank-card-large" style={{ background: bank.gradient }}>
                  <div className="bank-card-header">
                    <span>{bank.brand}</span>
                    <span>•••• {String(4500 + bank.balance.toString().slice(-4)).slice(-4)}</span>
                  </div>
                  <div className="bank-card-balance">{formatCurrency(bank.balance)}</div>
                  <div className="bank-card-footer">
                    <span>{bank.name}</span>
                    <span>Current Account</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="dashboard-split-grid">
          <article className="card sales-card">
            <div className="card-title">Today's Sales</div>
            <div className="mini-stat-grid">
              <div>
                <span>Sales</span>
                <strong>{formatCurrency(totalSales)}</strong>
              </div>
              <div>
                <span>Orders</span>
                <strong>{formatNumber(salesOrders)}</strong>
              </div>
              <div>
                <span>Invoices</span>
                <strong>{formatNumber(paidInvoices)}</strong>
              </div>
              <div>
                <span>Returns</span>
                <strong>{formatNumber(returnsCount)}</strong>
              </div>
            </div>
            <div className="mini-chart-list">
              {topSellingProductsDisplay.slice(0, 3).map((item) => (
                <div key={item.product} className="mini-chart-row">
                  <span>{item.product}</span>
                  <div className="mini-chart-bar" style={{ width: `${Math.min(100, item.qty * 0.8)}%` }} />
                </div>
              ))}
            </div>
          </article>

          <article className="card inventory-card compact">
            <div className="card-title">Inventory</div>
            <div className="mini-stat-grid">
              <div>
                <span>Products</span>
                <strong>{formatNumber(totalProducts)}</strong>
              </div>
              <div>
                <span>Low Stock</span>
                <strong>{formatNumber(lowStock)}</strong>
              </div>
              <div>
                <span>Out Of Stock</span>
                <strong>{formatNumber(outOfStock)}</strong>
              </div>
              <div>
                <span>Expiring Soon</span>
                <strong>{formatNumber(expiring)}</strong>
              </div>
            </div>
            <div className="inventory-donut" />
          </article>
        </section>

        <section className="dashboard-split-grid">
          <article className="card receivables-card compact">
            <div className="card-title">Receivables</div>
            <div className="panel-stat-row">
              <div>
                <span>Outstanding</span>
                <strong>{formatCurrency(totalUnpaid)}</strong>
              </div>
              <div>
                <span>Overdue</span>
                <strong>{formatCurrency(totalOverdue)}</strong>
              </div>
            </div>
            <div className="panel-stat-row">
              <div>
                <span>Due Today</span>
                <strong>{formatCurrency(Math.min(totalUnpaid, 300000))}</strong>
              </div>
            </div>
          </article>

          <article className="card payables-card compact">
            <div className="card-title">Payables</div>
            <div className="panel-stat-row">
              <div>
                <span>Outstanding</span>
                <strong>{formatCurrency(totalPurchases * 0.18)}</strong>
              </div>
              <div>
                <span>Overdue</span>
                <strong>{formatCurrency(totalPurchases * 0.05)}</strong>
              </div>
            </div>
            <div className="panel-stat-row">
              <div>
                <span>Due Today</span>
                <strong>{formatCurrency(Math.min(totalPurchases * 0.05, 95000))}</strong>
              </div>
            </div>
          </article>
        </section>

        <section className="quick-actions-row">
          {quickActions.map((action) => (
            <button key={action.label} type="button" className="quick-action-button">+ {action.label}</button>
          ))}
        </section>
      </div>
    </AppLayout>
  )
}
