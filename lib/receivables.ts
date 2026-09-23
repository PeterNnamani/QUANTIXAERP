export interface ReceivableRecord {
    id: string
    customer: string
    name?: string
    invoice: string
    invoiceDate: string
    dueDate: string
    total: number
    paid: number
    balance: number
    balanceDue?: number
    amount?: number
    amountPaid?: number
    status: string
    daysOverdue: number
    rep?: string
    branch?: string
    sourceSaleId?: string
}

export function buildReceivableFromSale(sale: {
    id: string
    reference?: string
    date: string
    customer: string
    totalAmount: number
    paymentStatus?: string
    amountPaid?: number
    enteredBy?: string
    branch?: string
}): ReceivableRecord {
    const total = Number(sale.totalAmount || 0)
    const isCredit = ['CREDIT', 'PART PAYMENT'].includes(String(sale.paymentStatus || '').toUpperCase())
    const paid = isCredit ? Math.min(Math.max(Number(sale.amountPaid || 0), 0), total) : 0
    if (!isCredit) {
        return {
            id: `AR-${sale.id}`,
            customer: sale.customer || 'Unknown Customer',
            name: sale.customer || 'Unknown Customer',
            invoice: sale.reference || sale.id,
            invoiceDate: sale.date,
            dueDate: sale.date,
            total: 0,
            paid: 0,
            balance: 0,
            status: 'Paid',
            daysOverdue: 0,
            rep: sale.enteredBy || 'System',
            branch: sale.branch || 'Head Office',
            sourceSaleId: sale.id,
        }
    }

    return {
        id: `AR-${sale.id}`,
        customer: sale.customer || 'Unknown Customer',
        name: sale.customer || 'Unknown Customer',
        invoice: sale.reference || sale.id,
        invoiceDate: sale.date,
        dueDate: sale.date,
        total,
        paid,
        balance: Math.max(0, total - paid),
        balanceDue: Math.max(0, total - paid),
        amount: total,
        amountPaid: paid,
        status: paid > 0 ? 'Partially Paid' : 'Unpaid',
        daysOverdue: 0,
        rep: sale.enteredBy || 'System',
        branch: sale.branch || 'Head Office',
        sourceSaleId: sale.id,
    }
}

export function mergeReceivablesFromSales(
    sales: Array<{ id: string; reference?: string; date: string; customer: string; totalAmount: number; paymentStatus?: string; enteredBy?: string; branch?: string }>,
    existingReceivables: Array<any> = [],
): ReceivableRecord[] {
    const rows = existingReceivables.map((item) => {
        const id = item.id || `AR-${item.invoice || item.reference || item.sourceSaleId || Math.random()}`
        return {
            ...item,
            id,
            customer: item.customer || item.name || 'Unknown Customer',
            name: item.name || item.customer || 'Unknown Customer',
            invoice: item.invoice || item.reference || item.id || 'INV-UNKNOWN',
            invoiceDate: item.invoiceDate || item.date || new Date().toISOString().slice(0, 10),
            dueDate: item.dueDate || item.due || item.invoiceDate || new Date().toISOString().slice(0, 10),
            total: Number(item.total ?? item.amount ?? item.originalAmount ?? 0),
            paid: Number(item.paid ?? item.amountPaid ?? 0),
            balance: Number(item.balance ?? item.balanceDue ?? Math.max(Number(item.total ?? item.amount ?? item.originalAmount ?? 0) - Number(item.paid ?? item.amountPaid ?? 0), 0)),
            status: item.status || 'Unpaid',
            daysOverdue: Number(item.daysOverdue ?? 0),
            rep: item.rep || 'System',
            branch: item.branch || 'Head Office',
            sourceSaleId: item.sourceSaleId || item.saleId || item.invoice,
        }
    })

    const nextBySale = new Map<string, ReceivableRecord>()
    for (const sale of sales) {
        if (!['CREDIT', 'PART PAYMENT'].includes(String(sale.paymentStatus || '').toUpperCase())) continue
        nextBySale.set(sale.id, buildReceivableFromSale(sale))
    }

    const merged = rows.filter((row) => !nextBySale.has(row.sourceSaleId || row.invoice))
    for (const item of nextBySale.values()) {
        const existingIndex = merged.findIndex((row) => row.sourceSaleId === item.sourceSaleId || row.invoice === item.invoice)
        if (existingIndex >= 0) {
            merged[existingIndex] = { ...merged[existingIndex], ...item, balance: item.balance, total: item.total, amount: item.total, balanceDue: item.balance }
        } else {
            merged.unshift(item)
        }
    }

    return merged
}
