import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
    if (specifier === 'xlsx') return next('xlsx/xlsx.mjs', context)
    try {
        return await next(specifier, context)
    } catch (error) {
        if (specifier.startsWith('.') && !/\\.[a-z]+$/.test(specifier)) return next(specifier + '.ts', context)
        throw error
    }
}`))

const XLSX = await import('xlsx')
const {
    findImportedInventoryIndex,
    mergeImportedInventoryItem,
    mergeImportedStaff,
    mergeUniqueNames,
    parseSpreadsheetFile,
    prepareGenericImportPayload,
} = await import('../lib/import-utils.ts')

function spreadsheet(name, rows) {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Sheet1')
    const bookType = name.split('.').pop().toLowerCase() === 'csv' ? 'csv' : 'xlsx'
    return new File([XLSX.write(workbook, { type: 'array', bookType })], name)
}

async function importFile(name, rows) {
    return prepareGenericImportPayload(await parseSpreadsheetFile(spreadsheet(name, rows)))
}

const casings = {
    title: (heading) => heading,
    upper: (heading) => heading.toUpperCase(),
    lower: (heading) => heading.toLowerCase(),
}

for (const [casing, format] of Object.entries(casings)) {
    test(`inventory import reads ${casing} case headings`, async () => {
        const headings = ['SKU', 'Product Name', 'Brand', 'Category', 'Pack Size', 'Unit Cost', 'Selling Price', 'Reorder Level', 'Stock']
        const { payload, summary } = await importFile('STOCK.XLSX', [headings.map(format), ['MIL-001', 'Milk', 'Peak', 'Dairy', '1L', 500, 800, 5, 12]])
        assert.equal(summary.products, 1)
        assert.equal(summary.unknown, 0)
        assert.deepEqual(
            { sku: payload.products[0].sku, name: payload.products[0].name, category: payload.products[0].category, cost: payload.products[0].unit_cost, price: payload.products[0].unit_price, stock: payload.products[0].stock_qty, reorder: payload.products[0].reorder_level },
            { sku: 'MIL-001', name: 'Milk', category: 'Dairy', cost: 500, price: 800, stock: 12, reorder: 5 },
        )
    })

    test(`staff import reads ${casing} case headings`, async () => {
        const headings = ['Name', 'Staff ID', 'PIN', 'Role', 'Branch', 'Status', 'Last Login']
        const { payload, summary } = await importFile('staff.csv', [headings.map(format), ['Ada Obi', 'STF-1', '1234', 'Cashier', 'Lagos', 'DISABLED', '']])
        assert.equal(summary.staff, 1)
        assert.equal(summary.products, 0)
        assert.equal(payload.staff[0].staffId, 'STF-1')
        assert.equal(payload.staff[0].roleId, 'cashier')
        assert.equal(payload.staff[0].status, 'disabled')
    })

    test(`sales import reads ${casing} case headings`, async () => {
        const headings = ['Invoice', 'Customer', 'Date', 'Items', 'Total', 'Paid', 'Balance', 'Status']
        const { payload, summary } = await importFile('sales.xlsx', [headings.map(format), ['INV-1', 'John', '2026-09-01', 'Milk', 1000, 400, 600, 'part-payment']])
        assert.equal(summary.sales, 1)
        assert.deepEqual(
            { reference: payload.sales[0].reference, customer: payload.sales[0].customer, date: payload.sales[0].date, product: payload.sales[0].items[0].product, total: payload.sales[0].totalAmount, paid: payload.sales[0].amountPaid, balance: payload.sales[0].balance, status: payload.sales[0].paymentStatus },
            { reference: 'INV-1', customer: 'John', date: '2026-09-01', product: 'Milk', total: 1000, paid: 400, balance: 600, status: 'PART PAYMENT' },
        )
    })

    test(`expense import reads ${casing} case headings`, async () => {
        const headings = ['Date', 'Expense #', 'Description', 'Category', 'Vendor', 'Amount', 'Status']
        const { payload, summary } = await importFile('expenses.xlsx', [headings.map(format), ['2026-09-01', 'EXP-7', 'Fuel', 'Transport', 'Total', 100, 'approved']])
        assert.equal(summary.expenses, 1)
        assert.equal(payload.expenses[0].reference, 'EXP-7')
        assert.equal(payload.expenses[0].category, 'Transport')
        assert.equal(payload.expenses[0].status, 'Approved')
    })

    test(`purchase import reads ${casing} case headings`, async () => {
        const headings = ['Purchase ID', 'Supplier', 'Invoice Number', 'Product', 'Qty', 'Unit Price', 'Total', 'Payment Status']
        const { payload, summary } = await importFile('purchases.xlsx', [headings.map(format), ['PUR-1', 'Acme', 'I-9', 'Milk', 10, 50, 500, 'Outstanding']])
        assert.equal(summary.purchases, 1)
        assert.equal(payload.purchases[0].supplier, 'Acme')
        assert.equal(payload.purchases[0].paymentStatus, 'CREDIT')
        assert.equal(payload.purchases[0].amountPaid, 0)
        assert.equal(payload.purchases[0].balance, 500)
    })

    test(`contact import reads ${casing} case headings`, async () => {
        const headings = ['Type', 'Name', 'Email', 'Phone', 'Address']
        const { payload, summary } = await importFile('contacts.xlsx', [headings.map(format), ['SUPPLIER', 'Acme', 'a@acme.test', '080', 'Lagos'], ['customer', 'Bob', '', '', '']])
        assert.equal(summary.contacts, 2)
        assert.deepEqual(payload.contacts.map((contact) => [contact.type, contact.name]), [['supplier', 'Acme'], ['customer', 'Bob']])
    })
}

test('rows that differ only by letter case are imported once', async () => {
    const products = await importFile('stock.xlsx', [['SKU', 'Product'], ['abc-1', 'Milk'], ['ABC-1', 'MILK']])
    assert.equal(products.summary.products, 1)
    assert.equal(products.summary.unknown, 0)

    const sales = await importFile('sales.xlsx', [['Invoice', 'Customer', 'Total'], ['INV-1', 'John Doe', 100], ['INV-2', 'JOHN DOE', 200]])
    assert.equal(sales.summary.sales, 2)
    assert.equal(sales.summary.contacts, 1)
})

test('an explicit zero paid amount is not treated as fully paid', async () => {
    const { payload } = await importFile('sales.xlsx', [['Invoice', 'Customer', 'Total', 'Paid', 'Status'], ['INV-9', 'Mary', 1000, 0, 'credit']])
    assert.equal(payload.sales[0].amountPaid, 0)
    assert.equal(payload.sales[0].balance, 1000)
    assert.equal(payload.sales[0].paymentStatus, 'CREDIT')
})

test('inventory matching ignores letter case and auto-generated SKUs', () => {
    const inventory = [{ product: 'Milk', sku: 'MIL-001' }, { product: 'Bread', sku: 'BRE-001' }]
    assert.equal(findImportedInventoryIndex(inventory, { sku: 'mil-001' }), 0)
    assert.equal(findImportedInventoryIndex(inventory, { name: '  BREAD ' }), 1)
    assert.equal(findImportedInventoryIndex(inventory, { name: 'Breeze', sku: 'BRE-001', skuGenerated: true }), -1)
    assert.equal(findImportedInventoryIndex(inventory, { name: 'MILK', sku: 'MIL-999' }), -1)
})

test('re-importing a stock sheet only updates the columns it contains', async () => {
    const { payload } = await importFile('movement.xlsx', [['Date', 'Reference No.', 'SKU', 'Product Name', 'Transaction Type', 'Quantity In', 'Quantity Out', 'Location'], ['2026-09-01', 'R1', 'mil-001', 'Milk', 'IN', 5, 0, 'Lagos']])
    const existing = { product: 'Milk', sku: 'MIL-001', dept: 'Dairy', openQty: 12, purchased: 0, sold: 0, unitCost: 500, sellingPrice: 800, closing: 12 }
    const product = payload.products[0]
    const merged = mergeImportedInventoryItem(existing, { product: product.name, sku: product.sku, branch: product.branch, dept: product.category, openQty: product.stock_qty, closing: product.stock_qty, unitCost: product.unit_cost, sellingPrice: product.unit_price }, product)
    assert.deepEqual(merged, { ...existing, branch: 'Lagos' })
})

test('customer, supplier, and staff merges ignore letter case', () => {
    assert.deepEqual(mergeUniqueNames(['John Doe', 'Acme'], ['JOHN DOE', 'acme ', 'New Co']), ['John Doe', 'Acme', 'New Co'])

    const existing = [{ id: 'u1', staffId: 'STF-1', name: 'Ada', pin: '4321', roleId: 'admin', roleName: 'Admin', status: 'disabled', permissions: ['all'] }]
    const merged = mergeImportedStaff(existing, [
        { id: 'new-1', staffId: 'stf-1', name: 'Ada Obi', pin: '', roleId: '', roleName: '', status: '', permissions: ['dashboard'] },
        { id: 'new-2', staffId: 'STF-2', name: 'Tunde', pin: '', roleId: '', roleName: '', status: '', permissions: ['dashboard'] },
    ])
    assert.equal(merged.length, 2)
    assert.deepEqual(merged[0], { ...existing[0], name: 'Ada Obi' })
    assert.deepEqual({ pin: merged[1].pin, roleId: merged[1].roleId, status: merged[1].status }, { pin: '0000', roleId: 'staff', status: 'active' })
})
