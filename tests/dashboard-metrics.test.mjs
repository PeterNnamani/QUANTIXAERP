import test from 'node:test'
import assert from 'node:assert/strict'

const { businessHealth, dueOn, overdueAmount, percentChange, performanceSeries, sumOnDate } = await import('../lib/dashboard-metrics.ts')

test('dashboard charts use the selected range of real activity', () => {
    const series = performanceSeries({
        sales: [{ date: '2026-09-26', amount: 1075 }, { date: '2026-08-01', amount: 9000 }],
        expenses: [{ date: '2026-09-26', amount: 75 }],
        purchases: [],
        endDay: '2026-09-26',
        days: 7,
        buckets: 7,
    })
    assert.equal(series.at(-1)?.revenue, 1075)
    assert.equal(series.at(-1)?.profit, 1000)
    assert.equal(series.slice(0, -1).every((point) => point.revenue === 0), true)
    assert.equal(sumOnDate([{ date: '2026-09-26', amount: 40, status: 'VOID' }, { date: '2026-09-26', amount: 10 }], '2026-09-26'), 10)
})

test('receivables and health come from balances and due dates', () => {
    const rows = [
        { dueDate: '2026-09-26', balance: 200 },
        { dueDate: '2026-09-01', balance: 50, status: 'OPEN' },
        { dueDate: '2026-10-01', outstanding_amount: 80 },
    ]
    assert.equal(dueOn(rows, '2026-09-26'), 200)
    assert.equal(overdueAmount(rows, '2026-09-26'), 50)
    assert.equal(percentChange(150, 100), '+50%')
    const health = businessHealth({ cash: 1000, profit: -20, overdue: 50, outOfStock: 0, lowStock: 0 })
    assert.equal(health.score, 50)
    assert.equal(health.checks.find((check) => check.label === 'Profit')?.ok, false)
})
