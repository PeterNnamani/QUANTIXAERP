'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { AuditLog, InventoryItem, Purchase, Sale } from '@/lib/context'

export type InventorySheet = 'product-master' | 'stock-movement' | 'stock-count' | 'inventory-dashboard'

export const inventorySheetHeaders: Record<InventorySheet, string[]> = {
    'product-master': ['SKU', 'Product Name', 'Brand', 'Category', 'Pack Size', 'Unit Cost', 'Selling Price', 'Reorder Level', 'Reorder Quantity', 'Stock Status'],
    'stock-movement': ['Date', 'Reference No.', 'SKU', 'Product Name', 'Transaction Type', 'Quantity In', 'Quantity Out', 'Location', 'Staff/Rep', 'Remarks'],
    'stock-count': ['Date', 'SKU', 'Product Name', 'Book Stock', 'Physical Stock', 'Variance', 'Unit Cost', 'Variance Value', 'Reason', 'Verified By'],
    'inventory-dashboard': ['Metric', 'Value'],
}

type InventorySheetTableProps = {
    sheet: InventorySheet
    onSheetChange: (sheet: InventorySheet) => void
    inventory: InventoryItem[]
    purchases: Purchase[]
    sales: Sale[]
    auditLogs: AuditLog[]
    supplierList: string[]
    search?: string
    onDeleteInventoryItems?: (skus: string[]) => Promise<void>
}

const sheetOptions: Array<{ value: InventorySheet; label: string }> = [
    { value: 'product-master', label: 'Sheet 1 - Product Master' },
    { value: 'stock-movement', label: 'Sheet 2 - Stock Movement' },
    { value: 'stock-count', label: 'Sheet 3 - Stock Count' },
    { value: 'inventory-dashboard', label: 'Sheet 4 - Inventory Dashboard' },
]

const displayValue = (value: string | number | undefined | null) => value === '' || value === undefined || value === null ? '-' : value

export default function InventorySheetTable({ sheet, onSheetChange, inventory, purchases, sales, auditLogs, supplierList, search = '', onDeleteInventoryItems }: InventorySheetTableProps) {
    const [selectedSkus, setSelectedSkus] = useState<string[]>([])
    const query = search.trim().toLowerCase()
    const matches = (values: Array<string | number | undefined>) => !query || values.join(' ').toLowerCase().includes(query)
    const products = inventory.map((item, index) => ({
        ...item,
        rowId: item.sku || `SKU-${index + 1}`,
        brand: item.brand || '-',
        packSize: item.packSize || '-',
        reorderLevel: item.reorderLevel ?? Math.max(5, Math.floor((item.closing || 0) * 0.2)),
        reorderQuantity: item.reorderQuantity ?? Math.max(0, (item.reorderLevel ?? 5) - item.closing),
        active: item.active ?? true,
    }))

    const getStockStatus = (item: (typeof products)[number]) => {
        if (item.closing <= 0) return 'Out of Stock'
        if ((item.damagedExpired || 0) > 0) return 'Damaged/Expired'
        if (item.maximumStockLevel && item.closing > item.maximumStockLevel) return 'Overstock'
        if (item.closing <= item.reorderLevel) return 'Low Stock'
        return 'In Stock'
    }

    if (sheet === 'product-master') {
        const rows = products.filter((item) => matches([item.rowId, item.product, item.brand, item.dept, getStockStatus(item)]))
        const visibleSkus = rows.map((item) => item.rowId)
        const selectedVisibleCount = visibleSkus.filter((sku) => selectedSkus.includes(sku)).length
        const allVisibleSelected = visibleSkus.length > 0 && selectedVisibleCount === visibleSkus.length
        const deleteRows = async (skus: string[]) => {
            if (!onDeleteInventoryItems || skus.length === 0 || !window.confirm(`Delete ${skus.length} inventory item${skus.length === 1 ? '' : 's'}?`)) return
            await onDeleteInventoryItems(skus)
            setSelectedSkus((current) => current.filter((sku) => !skus.includes(sku)))
        }
        return <SheetFrame title="Product Master" count={rows.length} sheet={sheet} onSheetChange={onSheetChange} headers={inventorySheetHeaders['product-master']} actions={onDeleteInventoryItems ? <div className="inventory-selection-actions"><label><input type="checkbox" checked={allVisibleSelected} onChange={(event) => setSelectedSkus(event.target.checked ? Array.from(new Set([...selectedSkus, ...visibleSkus])) : selectedSkus.filter((sku) => !visibleSkus.includes(sku)))} /> Select all</label><button type="button" className="inventory-btn secondary" disabled={selectedVisibleCount === 0} onClick={() => deleteRows(visibleSkus.filter((sku) => selectedSkus.includes(sku)))}>Delete selected</button><button type="button" className="inventory-btn danger" disabled={products.length === 0} onClick={() => deleteRows(products.map((item) => item.rowId))}>Delete all</button></div> : undefined}>
            {rows.map((item) => <tr key={item.rowId}><td><input type="checkbox" aria-label={`Select ${item.product}`} checked={selectedSkus.includes(item.rowId)} onChange={(event) => setSelectedSkus((current) => event.target.checked ? [...current, item.rowId] : current.filter((sku) => sku !== item.rowId))} /> {item.rowId}</td><td>{item.product}</td><td>{item.brand}</td><td>{item.dept || '-'}</td><td>{item.packSize}</td><td>{formatCurrency(item.unitCost)}</td><td>{formatCurrency(item.sellingPrice ?? item.unitCost * 1.35)}</td><td>{item.reorderLevel}</td><td>{item.reorderQuantity}</td><td><StockStatus value={getStockStatus(item)} /></td></tr>)}
        </SheetFrame>
    }

    if (sheet === 'stock-movement') {
        const purchaseRows = purchases.map((purchase) => ({ date: purchase.date, reference: purchase.invoiceNumber || purchase.id, sku: purchase.items?.[0]?.sku || '-', product: purchase.product, type: 'Purchase', in: purchase.qty, out: 0, location: purchase.branch || purchase.warehouse || '-', staff: purchase.enteredBy, remarks: purchase.notes }))
        const saleRows = sales.flatMap((sale) => sale.items.map((item) => ({ date: sale.date, reference: sale.id, sku: '-', product: item.product, type: 'Sale', in: 0, out: item.qty, location: '-', staff: sale.enteredBy, remarks: sale.notes })))
        const rows = [...purchaseRows, ...saleRows].filter((row) => matches([row.reference, row.sku, row.product, row.type, row.location, row.staff, row.remarks])).sort((a, b) => b.date.localeCompare(a.date))
        return <SheetFrame title="Stock Movement" count={rows.length} sheet={sheet} onSheetChange={onSheetChange} headers={inventorySheetHeaders['stock-movement']}>
            {rows.map((row, index) => <tr key={`${row.reference}-${index}`}><td>{displayValue(row.date)}</td><td>{row.reference}</td><td>{row.sku}</td><td>{row.product}</td><td><Status value={row.type} /></td><td>{row.in}</td><td>{row.out}</td><td>{row.location}</td><td>{row.staff}</td><td>{row.remarks || '-'}</td></tr>)}
        </SheetFrame>
    }

    if (sheet === 'stock-count') {
        const rows = products.filter((item) => matches([item.rowId, item.product, item.dept])).map((item) => ({ ...item, date: new Date().toISOString().slice(0, 10), physical: item.closing, variance: 0, reason: 'Pending physical count', verifiedBy: auditLogs.find((log) => log.type === 'INVENTORY')?.user || '-' }))
        return <SheetFrame title="Stock Count" count={rows.length} sheet={sheet} onSheetChange={onSheetChange} headers={inventorySheetHeaders['stock-count']}>
            {rows.map((row) => <tr key={row.rowId}><td>{row.date}</td><td>{row.rowId}</td><td>{row.product}</td><td>{row.closing}</td><td>{row.physical}</td><td>{row.variance}</td><td>{formatCurrency(row.unitCost)}</td><td>{formatCurrency(row.variance * row.unitCost)}</td><td>{row.reason}</td><td>{row.verifiedBy}</td></tr>)}
        </SheetFrame>
    }

    const totalStockValue = products.reduce((sum, item) => sum + item.closing * item.unitCost, 0)
    const lowStock = products.filter((item) => item.closing > 0 && item.closing <= item.reorderLevel).length
    const outOfStock = products.filter((item) => item.closing <= 0).length
    const damaged = products.reduce((sum, item) => sum + (item.damagedExpired || 0), 0)
    const dashboardRows = [
        ['Total SKUs', formatNumber(products.length)], ['Total Stock Value', formatCurrency(totalStockValue)], ['Low Stock Items', formatNumber(lowStock)], ['Out-of-Stock Items', formatNumber(outOfStock)], ['Overstock Items', '0'], ['Damaged/Expired Stock', formatNumber(damaged)], ['Stock Variance', formatCurrency(0)], ['Fast-Moving Products', formatNumber(products.filter((item) => item.sold > 0).length)], ['Slow-Moving Products', formatNumber(products.filter((item) => item.sold > 0 && item.sold <= 5).length)], ['Dead Stock', formatNumber(products.filter((item) => item.closing > 0 && item.sold === 0).length)],
    ]
    return <SheetFrame title="Inventory Dashboard" count={dashboardRows.length} sheet={sheet} onSheetChange={onSheetChange} headers={inventorySheetHeaders['inventory-dashboard']}>
        {dashboardRows.filter((row) => matches(row)).map(([label, value]) => <tr key={label}><td>{label}</td><td><strong>{value}</strong></td></tr>)}
    </SheetFrame>
}

function SheetFrame({ title, count, sheet, onSheetChange, headers, children, actions }: { title: string; count: number; sheet: InventorySheet; onSheetChange: (sheet: InventorySheet) => void; headers: string[]; children: ReactNode; actions?: ReactNode }) {
    return <div className="inventory-sheet-card"><div className="section-head inventory-sheet-head"><div><div className="card-title">{title}</div><div className="section-subtitle">Showing {count} records. Select a sheet to change the table without leaving this page.</div></div><div className="inventory-sheet-controls">{actions}<label className="inventory-sheet-selector"><span>Inventory sheet</span><select value={sheet} onChange={(event) => onSheetChange(event.target.value as InventorySheet)}>{sheetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div></div><div className="inventory-table-wrap"><table className="inventory-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div></div>
}

function Status({ value }: { value: string }) {
    return <span className={`inventory-pill ${value === 'Active' || value === 'Purchase' ? 'success' : value === 'Inactive' ? 'danger' : 'warning'}`}>{value}</span>
}

function StockStatus({ value }: { value: string }) {
    const tone = value === 'In Stock' ? 'success' : value === 'Low Stock' || value === 'Overstock' ? 'warning' : 'danger'
    return <span className={`inventory-pill ${tone}`}>{value}</span>
}