import test from 'node:test'
import assert from 'node:assert/strict'

import { buildReceivableFromSale, mergeReceivablesFromSales } from '../lib/receivables.js'

test('credit sales become receivables with outstanding balance', () => {
    const sale = {
        id: 'INV-1001',
        date: '2026-09-19',
        customer: 'Jane Doe',
        totalAmount: 250000,
        paymentStatus: 'CREDIT',
        enteredBy: 'Ada',
    }

    const receivable = buildReceivableFromSale(sale)

    assert.equal(receivable.customer, 'Jane Doe')
    assert.equal(receivable.invoice, 'INV-1001')
    assert.equal(receivable.balance, 250000)
    assert.equal(receivable.status, 'Unpaid')
})

test('credit sales are merged into existing receivables without duplicating paid sales', () => {
    const sales = [
        { id: 'INV-2001', date: '2026-09-19', customer: 'Sam', totalAmount: 40000, paymentStatus: 'CREDIT', enteredBy: 'Ada' },
        { id: 'INV-2002', date: '2026-09-19', customer: 'Mary', totalAmount: 15000, paymentStatus: 'PAID', enteredBy: 'Ada' },
    ]

    const merged = mergeReceivablesFromSales(sales, [
        { id: 'INV-2001', name: 'Old Sam', customer: 'Old Sam', invoice: 'INV-2001', amount: 30000, balanceDue: 30000, status: 'Unpaid' },
    ])

    assert.equal(merged.filter((item) => item.invoice === 'INV-2001').length, 1)
    assert.equal(merged.some((item) => item.invoice === 'INV-2002'), false)
    assert.equal(merged.find((item) => item.invoice === 'INV-2001')?.balance, 40000)
})
