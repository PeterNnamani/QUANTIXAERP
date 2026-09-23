'use client'

import { useMemo, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import BulkImport from '@/components/bulk-import'
import { useAccounting } from '@/lib/context'
import { formatCurrency, formatNumber, triggerAppToast } from '@/lib/utils'
import { downloadExcel } from '@/lib/export-utils'
import InventorySheetTable, { inventorySheetHeaders, type InventorySheet } from '@/components/inventory/inventory-sheet-table'

export default function InventoryPage() {
  const { state, updateState, deleteInventoryItems, addAuditLog } = useAccounting()
  const [search, setSearch] = useState('')
  const [selectedWarehouse, setSelectedWarehouse] = useState('Main Warehouse')
  const [selectedCategory, setSelectedCategory] = useState('All Categories')
  const [selectedStatus, setSelectedStatus] = useState('All Status')
  const [selectedSheet, setSelectedSheet] = useState<InventorySheet>('product-master')
  const [showFilters, setShowFilters] = useState(false)

  const inventoryRows = useMemo(() => {
    return state.inventory.map((item, index) => ({
      sku: item.sku || `SKU-${index + 1}`,
      product: item.product,
      brand: item.brand || '-',
      category: item.dept || 'Uncategorized',
      packSize: item.packSize || '-',
      unitCost: item.unitCost,
      sellingPrice: item.sellingPrice ?? item.unitCost * 1.35,
      available: item.closing,
      stockValue: item.closing * item.unitCost,
      expiryDate: item.expiryDate || '',
      damagedExpired: item.damagedExpired || 0,
      reorderLevel: Math.max(5, Math.floor((item.closing || 0) * 0.2)),
      reorderQuantity: Math.max(0, Math.floor(Math.max(5, Math.floor((item.closing || 0) * 0.2)) - (item.closing || 0))),
      status: item.closing <= 0 ? 'Out of Stock' : item.closing <= 10 ? 'Low Stock' : 'In Stock',
      warehouse: 'Main Warehouse',
    }))
  }, [state.inventory])

  const filteredRows = useMemo(() => {
    const query = search.toLowerCase()
    return inventoryRows.filter((row) => {
      const matchesQuery = !query || [row.product, row.category, row.sku].join(' ').toLowerCase().includes(query)
      const matchesWarehouse = selectedWarehouse === 'All Warehouses' || row.warehouse === selectedWarehouse
      const matchesCategory = selectedCategory === 'All Categories' || row.category === selectedCategory
      const matchesStatus = selectedStatus === 'All Status' || row.status === selectedStatus
      return matchesQuery && matchesWarehouse && matchesCategory && matchesStatus
    })
  }, [inventoryRows, search, selectedCategory, selectedStatus, selectedWarehouse])

  const handleInventoryAction = (action: string) => {
    triggerAppToast(action, 'Inventory action queued and logged for the warehouse team.')
    if (action === 'Export Excel') {
      downloadExcel('inventory-export.xlsx', filteredRows)
      addAuditLog('EXPORT', 'INVENTORY', 'ALL', 'Inventory exported to Excel.')
      return
    }

    if (action === '+ Stock Adjustment') {
      const updatedInventory = state.inventory.map((item) => ({ ...item, closing: Math.max(0, item.closing - 1) }))
      updateState({ inventory: updatedInventory })
      addAuditLog('UPDATE', 'INVENTORY', 'INV-ADJ', 'Stock adjustment recorded for the selected warehouse.')
      return
    }

    if (action === '+ Stock Transfer') {
      const updatedInventory = state.inventory.map((item, index) =>
        index === 0
          ? { ...item, closing: Math.max(0, item.closing - 2), sold: item.sold + 2 }
          : item
      )
      updateState({ inventory: updatedInventory })
      addAuditLog('TRANSFER', 'INVENTORY', updatedInventory[0]?.product || 'INV-TRANSFER', 'Stock transfer processed for the selected item.')
      return
    }

    if (action === '+ Receive Stock') {
      const updatedInventory = state.inventory.map((item, index) =>
        index === 0
          ? { ...item, closing: item.closing + 5, purchased: item.purchased + 5 }
          : item
      )
      updateState({ inventory: updatedInventory })
      addAuditLog('RECEIVE', 'INVENTORY', updatedInventory[0]?.product || 'INV-RECEIVE', 'Stock received and inventory levels updated.')
      return
    }

    if (action === '+ Stock Count') {
      const updatedInventory = state.inventory.map((item) => ({
        ...item,
        closing: Math.max(0, item.openQty + item.purchased - item.sold),
      }))
      updateState({ inventory: updatedInventory })
      addAuditLog('COUNT', 'INVENTORY', 'STOCK-COUNT', 'Stock count reconciled for warehouse inventory.')
      return
    }
  }

  const summaryCards = [
    { label: 'Total Products', value: formatNumber(inventoryRows.length), tone: 'info' },
    { label: 'Items in Stock', value: formatNumber(inventoryRows.reduce((sum, row) => sum + row.available, 0)), tone: 'info' },
    { label: 'Inventory Value', value: formatCurrency(inventoryRows.reduce((sum, row) => sum + row.stockValue, 0)), tone: 'info' },
    { label: 'Low Stock Items', value: formatNumber(inventoryRows.filter((row) => row.status === 'Low Stock').length), tone: 'warning' },
    { label: 'Out of Stock', value: formatNumber(inventoryRows.filter((row) => row.status === 'Out of Stock').length), tone: 'critical' },
    { label: 'Expiring Soon', value: formatNumber(inventoryRows.filter((row) => row.status === 'Expired').length), tone: 'warning' },
  ]

  return (
    <AppLayout>
      <div className="inventory-page">
        <div className="inventory-header">
          <div>
            <div className="pg-title">Inventory</div>
            <div className="pg-subtitle">Monitor stock levels, warehouse activities, inventory movements, and stock valuation.</div>
          </div>
          <div className="inventory-actions">
            <BulkImport label="Bulk upload" tableColumns={inventorySheetHeaders[selectedSheet]} />
            <button className="inventory-btn secondary" onClick={() => handleInventoryAction('+ Stock Adjustment')}>+ Stock Adjustment</button>
            <button className="inventory-btn secondary" onClick={() => handleInventoryAction('+ Stock Transfer')}>+ Stock Transfer</button>
            <button className="inventory-btn secondary" onClick={() => handleInventoryAction('+ Receive Stock')}>+ Receive Stock</button>
            <button className="inventory-btn secondary" onClick={() => handleInventoryAction('+ Stock Count')}>+ Stock Count</button>
            <button className="inventory-btn secondary" onClick={() => setShowFilters((prev) => !prev)}>{showFilters ? 'Hide Filters' : 'Show Filters'}</button>
            <button className="inventory-btn primary allow-readonly" onClick={() => handleInventoryAction('Export Excel')}>Export Excel</button>
          </div>
        </div>

        <div className="inventory-summary-grid">
          {summaryCards.map((card) => (
            <div className={`inventory-summary-card ${card.tone}`} key={card.label}>
              <div className="inventory-summary-label">{card.label}</div>
              <div className="inventory-summary-value">{card.value}</div>
            </div>
          ))}
        </div>

        {showFilters && (
          <div className="inventory-card">
            <div className="section-head">
              <div>
                <div className="card-title">Search & Filters</div>
                <div className="section-subtitle">Search stock records by product, SKU, warehouse, category, or status.</div>
              </div>
            </div>
            <div className="inventory-search-row">
              <div className="inventory-search-field">
                <span>🔎</span>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by product, SKU, or category..." />
              </div>
              <div className="inventory-chip-row">
                <span className="inventory-chip success">Multi-warehouse</span>
                <span className="inventory-chip">Barcode ready</span>
              </div>
            </div>
            <div className="inventory-filters-grid">
              <label>
                <span>Warehouse</span>
                <select value={selectedWarehouse} onChange={(e) => setSelectedWarehouse(e.target.value)}>
                  <option>All Warehouses</option>
                  <option>Main Warehouse</option>
                  <option>Warehouse A</option>
                  <option>Warehouse B</option>
                  <option>Store Front</option>
                  <option>Production</option>
                </select>
              </label>
              <label>
                <span>Category</span>
                <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                  <option>All Categories</option>
                  {Array.from(new Set(inventoryRows.map((row) => row.category))).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span>Stock Status</span>
                <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
                  <option>All Status</option>
                  <option>In Stock</option>
                  <option>Low Stock</option>
                  <option>Out of Stock</option>
                  <option>Expired</option>
                  <option>Damaged</option>
                  <option>Reserved</option>
                </select>
              </label>
              <label>
                <span>Supplier</span>
                <select defaultValue="All Suppliers">
                  <option>All Suppliers</option>
                  <option>Vinta Supplier</option>
                  <option>Local Vendor</option>
                </select>
              </label>
              <label>
                <span>Branch</span>
                <select defaultValue="All Branches">
                  <option>All Branches</option>
                  <option>Lagos</option>
                  <option>Abuja</option>
                  <option>Enugu</option>
                </select>
              </label>
            </div>
          </div>
        )}

        <InventorySheetTable
          sheet={selectedSheet}
          onSheetChange={setSelectedSheet}
          inventory={state.inventory}
          purchases={state.purchases}
          sales={state.sales}
          auditLogs={state.auditLogs}
          supplierList={state.supplierList}
          search={search}
          onDeleteInventoryItems={async (skus) => {
            try {
              await deleteInventoryItems(skus)
              triggerAppToast('Inventory deleted', `${skus.length} inventory item${skus.length === 1 ? '' : 's'} deleted.`)
              addAuditLog('DELETE', 'INVENTORY', skus.join(', '), `${skus.length} inventory item${skus.length === 1 ? '' : 's'} deleted.`)
            } catch (error) {
              console.error('Unable to delete inventory items', error)
              triggerAppToast('Delete failed', 'Inventory could not be deleted from the database.')
            }
          }}
        />
      </div>
    </AppLayout>
  )
}
