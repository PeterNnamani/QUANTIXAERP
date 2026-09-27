import test from 'node:test'
import assert from 'node:assert/strict'

const { buildCostOfSalesReport, isCountableSale, productCost } = await import('../lib/cost-of-sales.ts')

const sale = (id, overrides = {}) => ({ id, reference: `SAL-${id}`, date: '2026-09-10', customer: 'Ada', branch: '', salesRep: 'Rep', status: 'ACTIVE', deletedAt: null, ...overrides })
const item = (saleId, productName, qty, unitPrice, total = qty * unitPrice) => ({ saleId, productId: null, productName, department: '', qty, unitPrice, total })
const product = (id, name, unitCost, averageCost = 0, overrides = {}) => ({ id, name, sku: `SKU-${id}`, category: 'Drinks', unitCost, averageCost, deletedAt: null, updatedAt: '2026-09-01', ...overrides })

test('cost of sales uses the cost locked at sale time over today\'s cost', () => {
    const report = buildCostOfSalesReport({
        sales: [sale('s1')],
        items: [item('s1', 'Malt', 10, 500)],
        products: [product('p1', 'Malt', 400)],
        snapshots: [{ saleId: 's1', productKey: 'malt', productId: 'p1', sku: 'SKU-p1', unitCost: 300, capturedVia: 'sale' }],
    })
    assert.equal(report.summary.revenue, 5000)
    assert.equal(report.summary.costOfSales, 3000)
    assert.equal(report.summary.grossProfit, 2000)
    assert.equal(report.summary.grossMarginPct, 40)
    assert.equal(report.lines[0].costSource, 'locked')
    assert.equal(report.pendingSnapshots.length, 0)
})

test('lines without a locked cost use average cost, then unit cost, and are queued for locking', () => {
    const report = buildCostOfSalesReport({
        sales: [sale('s1'), sale('s2')],
        items: [item('s1', ' malt ', 2, 600), item('s2', 'Water', 5, 100)],
        products: [product('p1', 'Malt', 400, 450), product('p2', 'water', 60)],
        snapshots: [],
    })
    const malt = report.byProduct.find((row) => row.product.trim() === 'malt')
    assert.equal(malt.cost, 900)
    assert.equal(report.byProduct.find((row) => row.product === 'Water').cost, 300)
    assert.equal(report.summary.costOfSales, 1200)
    assert.equal(report.summary.currentCostLines, 2)
    assert.deepEqual(report.pendingSnapshots.map((row) => [row.productKey, row.unitCost, row.costBasis]).sort(), [['malt', 450, 'average_cost'], ['water', 60, 'unit_cost']])
})

test('void, returned, and deleted sales are excluded', () => {
    const report = buildCostOfSalesReport({
        sales: [sale('s1'), sale('s2', { status: 'VOID' }), sale('s3', { status: 'Returned' }), sale('s4', { deletedAt: '2026-09-11' })],
        items: [item('s1', 'Malt', 1, 500), item('s2', 'Malt', 1, 500), item('s3', 'Malt', 1, 500), item('s4', 'Malt', 1, 500)],
        products: [product('p1', 'Malt', 300)],
        snapshots: [],
    })
    assert.equal(report.summary.salesCount, 1)
    assert.equal(report.summary.revenue, 500)
    assert.equal(isCountableSale({ status: 'cancelled', deletedAt: null }), false)
})

test('items with no product or zero cost are reported as missing cost, not hidden', () => {
    const report = buildCostOfSalesReport({
        sales: [sale('s1')],
        items: [item('s1', 'Mystery', 3, 200), item('s1', 'Free Sample', 1, 50)],
        products: [product('p1', 'Free Sample', 0)],
        snapshots: [],
    })
    assert.equal(report.summary.missingCostLines, 2)
    assert.equal(report.summary.missingCostRevenue, 650)
    assert.equal(report.summary.costOfSales, 0)
    assert.equal(report.pendingSnapshots.length, 0)
})

test('product totals and margins are aggregated across sales and rounded to kobo', () => {
    const report = buildCostOfSalesReport({
        sales: [sale('s1'), sale('s2', { date: '2026-09-12' })],
        items: [item('s1', 'Rice', 3, 333.33), item('s2', 'Rice', 2, 350)],
        products: [product('p1', 'Rice', 250.5)],
        snapshots: [{ saleId: 's1', productKey: 'rice', productId: 'p1', sku: 'SKU-p1', unitCost: 240.25, capturedVia: 'backfill' }],
    })
    const rice = report.byProduct[0]
    assert.equal(rice.qty, 5)
    assert.equal(rice.revenue, 1699.99)
    assert.equal(rice.cost, 1221.75)
    assert.equal(rice.grossProfit, 478.24)
    assert.equal(rice.marginPct, 28.13)
    assert.equal(report.lines[0].date, '2026-09-12')
    assert.equal(report.summary.estimatedLines, 1)
    assert.equal(productCost({ unitCost: 10, averageCost: 0 }), 10)
})
