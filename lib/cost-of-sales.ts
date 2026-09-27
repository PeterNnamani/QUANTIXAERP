export type CosSale = {
    id: string
    reference: string
    date: string
    customer: string
    branch: string
    salesRep: string
    status: string
    deletedAt: string | null
}

export type CosSaleItem = {
    saleId: string
    productId: string | null
    productName: string
    department: string
    qty: number
    unitPrice: number
    total: number
}

export type CosProduct = {
    id: string
    name: string
    sku: string
    category: string
    unitCost: number
    averageCost: number
    deletedAt: string | null
    updatedAt: string
}

export type CosCostSnapshot = {
    saleId: string
    productKey: string
    productId: string | null
    sku: string
    unitCost: number
    capturedVia: 'sale' | 'backfill' | 'report'
}

// locked: cost recorded when the item was sold (or first reported). estimated: locked from the cost on record when
// tracking started. current: product cost today, not yet locked. missing: no product or no cost on record.
export type CosCostSource = 'locked' | 'estimated' | 'current' | 'missing'

export type CosLine = {
    saleId: string
    saleReference: string
    date: string
    customer: string
    branch: string
    salesRep: string
    productKey: string
    product: string
    sku: string
    category: string
    qty: number
    unitPrice: number
    revenue: number
    unitCost: number
    cost: number
    grossProfit: number
    marginPct: number | null
    costSource: CosCostSource
}

export type CosProductSummary = {
    productKey: string
    product: string
    sku: string
    category: string
    qty: number
    revenue: number
    cost: number
    grossProfit: number
    marginPct: number | null
    averageSellingPrice: number
    averageUnitCost: number
    missingCostLines: number
}

export type CosSummary = {
    revenue: number
    costOfSales: number
    grossProfit: number
    grossMarginPct: number | null
    unitsSold: number
    salesCount: number
    lineCount: number
    missingCostLines: number
    missingCostRevenue: number
    estimatedLines: number
    currentCostLines: number
}

export type CosPendingSnapshot = {
    saleId: string
    productKey: string
    productId: string
    sku: string
    unitCost: number
    costBasis: 'average_cost' | 'unit_cost'
}

export type CostOfSalesReport = {
    summary: CosSummary
    lines: CosLine[]
    byProduct: CosProductSummary[]
    pendingSnapshots: CosPendingSnapshot[]
}

const EXCLUDED_SALE_STATUSES = new Set(['VOID', 'VOIDED', 'CANCELLED', 'CANCELED', 'RETURN', 'RETURNED', 'REFUNDED'])

export function productKey(name: string | null | undefined): string {
    return String(name || '').trim().toLowerCase()
}

export function roundMoney(value: number): number {
    return Math.round((Number(value) || 0) * 100) / 100
}

function roundCost(value: number): number {
    return Math.round((Number(value) || 0) * 10000) / 10000
}

function marginOf(profit: number, revenue: number): number | null {
    return revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : null
}

export function isCountableSale(sale: Pick<CosSale, 'status' | 'deletedAt'>): boolean {
    if (sale.deletedAt) return false
    return !EXCLUDED_SALE_STATUSES.has(String(sale.status || '').trim().toUpperCase())
}

export function productCost(product: Pick<CosProduct, 'unitCost' | 'averageCost'>): number {
    const average = Number(product.averageCost || 0)
    return average > 0 ? average : Math.max(0, Number(product.unitCost || 0))
}

function pickProduct(candidates: CosProduct[] | undefined): CosProduct | undefined {
    if (!candidates || candidates.length === 0) return undefined
    return [...candidates].sort((left, right) => {
        if (Boolean(left.deletedAt) !== Boolean(right.deletedAt)) return left.deletedAt ? 1 : -1
        return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''))
    })[0]
}

export function buildCostOfSalesReport(input: {
    sales: CosSale[]
    items: CosSaleItem[]
    products: CosProduct[]
    snapshots: CosCostSnapshot[]
}): CostOfSalesReport {
    const salesById = new Map(input.sales.filter(isCountableSale).map((sale) => [sale.id, sale]))
    const productsById = new Map(input.products.map((product) => [product.id, product]))
    const productsByKey = new Map<string, CosProduct[]>()
    input.products.forEach((product) => {
        const key = productKey(product.name)
        if (!key) return
        productsByKey.set(key, [...(productsByKey.get(key) || []), product])
    })
    const snapshotByLine = new Map(input.snapshots.map((snapshot) => [`${snapshot.saleId}|${snapshot.productKey}`, snapshot]))

    const lines: CosLine[] = []
    const pending = new Map<string, CosPendingSnapshot>()

    for (const item of input.items) {
        const sale = salesById.get(item.saleId)
        if (!sale) continue
        const qty = Number(item.qty || 0)
        if (qty === 0) continue
        const key = productKey(item.productName)
        const lineTotal = Number(item.total || 0)
        const revenue = roundMoney(lineTotal > 0 ? lineTotal : qty * Number(item.unitPrice || 0))
        const product = (item.productId ? productsById.get(item.productId) : undefined) || pickProduct(productsByKey.get(key))
        const snapshot = snapshotByLine.get(`${item.saleId}|${key}`)

        let unitCost = 0
        let costSource: CosCostSource = 'missing'
        if (snapshot && snapshot.unitCost > 0) {
            unitCost = snapshot.unitCost
            costSource = snapshot.capturedVia === 'backfill' ? 'estimated' : 'locked'
        } else if (product && productCost(product) > 0) {
            unitCost = productCost(product)
            costSource = 'current'
            const pendingKey = `${item.saleId}|${key}`
            if (key && !pending.has(pendingKey)) {
                pending.set(pendingKey, {
                    saleId: item.saleId, productKey: key, productId: product.id, sku: product.sku, unitCost: roundCost(unitCost),
                    costBasis: Number(product.averageCost || 0) > 0 ? 'average_cost' : 'unit_cost',
                })
            }
        }

        const cost = roundMoney(qty * unitCost)
        const grossProfit = roundMoney(revenue - cost)
        lines.push({
            saleId: sale.id,
            saleReference: sale.reference,
            date: sale.date,
            customer: sale.customer,
            branch: sale.branch,
            salesRep: sale.salesRep,
            productKey: key,
            product: String(item.productName || product?.name || 'Unnamed item').trim(),
            sku: product?.sku || snapshot?.sku || '',
            category: product?.category || item.department || '',
            qty,
            unitPrice: roundMoney(qty !== 0 ? revenue / qty : Number(item.unitPrice || 0)),
            revenue,
            unitCost: roundCost(unitCost),
            cost,
            grossProfit,
            marginPct: marginOf(grossProfit, revenue),
            costSource,
        })
    }

    lines.sort((left, right) => right.date.localeCompare(left.date) || left.saleReference.localeCompare(right.saleReference))

    const productTotals = new Map<string, CosProductSummary>()
    for (const line of lines) {
        const groupKey = line.productKey || line.product
        const current = productTotals.get(groupKey) || {
            productKey: groupKey, product: line.product, sku: line.sku, category: line.category,
            qty: 0, revenue: 0, cost: 0, grossProfit: 0, marginPct: null, averageSellingPrice: 0, averageUnitCost: 0, missingCostLines: 0,
        }
        current.qty += line.qty
        current.revenue = roundMoney(current.revenue + line.revenue)
        current.cost = roundMoney(current.cost + line.cost)
        current.grossProfit = roundMoney(current.revenue - current.cost)
        if (!current.sku && line.sku) current.sku = line.sku
        if (!current.category && line.category) current.category = line.category
        if (line.costSource === 'missing') current.missingCostLines += 1
        productTotals.set(groupKey, current)
    }
    const byProduct = Array.from(productTotals.values()).map((row) => ({
        ...row,
        marginPct: marginOf(row.grossProfit, row.revenue),
        averageSellingPrice: row.qty !== 0 ? roundMoney(row.revenue / row.qty) : 0,
        averageUnitCost: row.qty !== 0 ? roundCost(row.cost / row.qty) : 0,
    })).sort((left, right) => right.revenue - left.revenue)

    const revenue = roundMoney(lines.reduce((sum, line) => sum + line.revenue, 0))
    const costOfSales = roundMoney(lines.reduce((sum, line) => sum + line.cost, 0))
    const grossProfit = roundMoney(revenue - costOfSales)
    const missing = lines.filter((line) => line.costSource === 'missing')

    return {
        summary: {
            revenue,
            costOfSales,
            grossProfit,
            grossMarginPct: marginOf(grossProfit, revenue),
            unitsSold: lines.reduce((sum, line) => sum + line.qty, 0),
            salesCount: new Set(lines.map((line) => line.saleId)).size,
            lineCount: lines.length,
            missingCostLines: missing.length,
            missingCostRevenue: roundMoney(missing.reduce((sum, line) => sum + line.revenue, 0)),
            estimatedLines: lines.filter((line) => line.costSource === 'estimated').length,
            currentCostLines: lines.filter((line) => line.costSource === 'current').length,
        },
        lines,
        byProduct,
        pendingSnapshots: Array.from(pending.values()),
    }
}
