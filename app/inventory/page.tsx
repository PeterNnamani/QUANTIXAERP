'use client'

import { useMemo, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import InventoryImport from '@/components/inventory/inventory-import'
import Modal from '@/components/ui/modal'
import { useAccounting } from '@/lib/context'
import { getSupabaseClient } from '@/lib/supabase.browser'
import { saveInventoryRows } from '@/lib/inventory-workflows'
import { formatCurrency, formatNumber, triggerAppToast } from '@/lib/utils'
import { financialPositionOpenings } from '@/lib/opening-balances'
import { downloadExcel } from '@/lib/export-utils'
import InventorySheetTable, { type InventorySheet } from '@/components/inventory/inventory-sheet-table'

type StockAction = 'increase' | 'decrease' | 'receive' | 'count' | 'relocate'

const actionTitles: Record<StockAction, string> = {
  increase: 'Increase stock',
  decrease: 'Decrease stock',
  receive: 'Receive stock',
  count: 'Stock count',
  relocate: 'Move location',
}

export default function InventoryPage() {
  const { state, user, updateState, deleteInventoryItems, addAuditLog } = useAccounting()
  const [search, setSearch] = useState('')
  const [selectedWarehouse, setSelectedWarehouse] = useState('All Warehouses')
  const [selectedCategory, setSelectedCategory] = useState('All Categories')
  const [selectedStatus, setSelectedStatus] = useState('All Status')
  const [selectedSheet, setSelectedSheet] = useState<InventorySheet>('product-master')
  const [showFilters, setShowFilters] = useState(false)
  const [action, setAction] = useState<StockAction | ''>('')
  const [actionSku, setActionSku] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [destination, setDestination] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

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
      reorderLevel: item.reorderLevel ?? 5,
      reorderQuantity: item.reorderQuantity ?? Math.max(0, (item.reorderLevel ?? 5) - item.closing),
      status: item.expiryDate && item.expiryDate < new Date().toISOString().slice(0, 10) ? 'Expired' : item.closing <= 0 ? 'Out of Stock' : item.closing <= (item.reorderLevel ?? 5) ? 'Low Stock' : 'In Stock',
      warehouse: item.branch || 'Main Warehouse',
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

  const openStockAction = (nextAction: StockAction) => {
    setAction(nextAction)
    setActionSku(state.inventory.find((item) => item.sku === filteredRows[0]?.sku)?.sku || state.inventory[0]?.sku || state.inventory[0]?.product || '')
    setQuantity('')
    setReason('')
    setDestination('')
    setActionError('')
  }

  const submitStockAction = async () => {
    setActionError('')
    if (!action) return
    const selected = state.inventory.find((item) => item.sku === actionSku || item.product === actionSku)
    if (!selected) {
      setActionError('Select a product.')
      return
    }
    if (!reason.trim()) {
      setActionError('Enter a reason or reference.')
      return
    }
    const amount = Number(quantity)
    if (action !== 'relocate' && (quantity.trim() === '' || !Number.isFinite(amount) || amount < 0 || (amount === 0 && action !== 'count'))) {
      setActionError('Enter a valid quantity.')
      return
    }
    if (action === 'relocate' && !destination.trim()) {
      setActionError('Enter a destination location.')
      return
    }
    if (action === 'decrease' && amount > Number(selected.closing || 0)) {
      setActionError(`Only ${selected.closing} unit(s) are available.`)
      return
    }

    const nextItem = {
      ...selected,
      closing: action === 'count' ? amount
        : action === 'decrease' ? Number(selected.closing || 0) - amount
        : action === 'relocate' ? Number(selected.closing || 0)
        : Number(selected.closing || 0) + amount,
      purchased: action === 'receive' ? Number(selected.purchased || 0) + amount : Number(selected.purchased || 0),
      branch: action === 'relocate' ? destination.trim() : selected.branch,
      lastCountQty: action === 'count' ? amount : selected.lastCountQty,
      lastCountVariance: action === 'count' ? amount - Number(selected.closing || 0) : selected.lastCountVariance,
      lastCountAt: action === 'count' ? new Date().toISOString() : selected.lastCountAt,
      lastCountReason: action === 'count' ? reason.trim() : selected.lastCountReason,
    }

    setBusy(true)
    try {
      await saveInventoryRows(getSupabaseClient(), user?.companyId || '', [nextItem])
      updateState({
        inventory: state.inventory.map((item) => (selected.sku ? item.sku === selected.sku : item.product === selected.product) ? nextItem : item),
      }, { persist: false })
      addAuditLog(action.toUpperCase(), 'INVENTORY', selected.sku || selected.product, reason.trim())
      triggerAppToast('Inventory saved', `${selected.product} was updated.`)
      setAction('')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to save this stock change.')
    } finally {
      setBusy(false)
    }
  }

  const handleInventoryAction = (label: string) => {
    if (label === 'Export Excel') {
      downloadExcel('inventory-export.xlsx', filteredRows)
      addAuditLog('EXPORT', 'INVENTORY', 'ALL', 'Inventory exported to Excel.')
      return
    }
    if (label === '+ Stock Adjustment') return openStockAction('decrease')
    if (label === '+ Stock Transfer') return openStockAction('relocate')
    if (label === '+ Receive Stock') return openStockAction('receive')
    if (label === '+ Stock Count') return openStockAction('count')
  }

  const openings = financialPositionOpenings(state.chartOfAccounts)
  const stockValue = inventoryRows.reduce((sum, row) => sum + row.stockValue, 0)
  const summaryCards = [
    { label: 'Total Products', value: formatNumber(inventoryRows.length), tone: 'info' },
    { label: 'Items in Stock', value: formatNumber(inventoryRows.reduce((sum, row) => sum + row.available, 0)), tone: 'info' },
    { label: 'Inventory Value', value: formatCurrency(stockValue + openings.inventory), tone: 'info' },
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
            <InventoryImport label="Bulk upload" buttonClassName="inventory-btn secondary" />
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
        {openings.inventory > 0 && <p className="metric-note">Inventory value includes opening inventory of {formatCurrency(openings.inventory)} from Settings.</p>}

        <Modal open={Boolean(action)} title={action ? actionTitles[action] : 'Update inventory'} onClose={() => { if (!busy) setAction('') }}>
          <div className="fg">
            <label>Product</label>
            <select value={actionSku} disabled={busy} onChange={(event) => setActionSku(event.target.value)}>
              <option value="">Select product</option>
              {state.inventory.map((item) => (
                <option key={item.sku || item.product} value={item.sku || item.product}>
                  {item.product}{item.sku ? ` (${item.sku})` : ''} — {item.closing} available
                </option>
              ))}
            </select>
          </div>
          {(action === 'increase' || action === 'decrease') && (
            <div className="fg">
              <label>Adjustment</label>
              <select value={action} disabled={busy} onChange={(event) => setAction(event.target.value as StockAction)}>
                <option value="increase">Increase stock</option>
                <option value="decrease">Decrease stock</option>
              </select>
            </div>
          )}
          {action === 'relocate' ? (
            <div className="fg">
              <label>Destination</label>
              <input value={destination} disabled={busy} onChange={(event) => setDestination(event.target.value)} placeholder="Warehouse or branch" />
            </div>
          ) : (
            <div className="fg">
              <label>{action === 'count' ? 'Actual physical count' : 'Quantity'}</label>
              <input type="number" min="0" step="any" value={quantity} disabled={busy} onChange={(event) => setQuantity(event.target.value)} />
            </div>
          )}
          <div className="fg">
            <label>Reason / reference</label>
            <input value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} />
          </div>
          <p className="metric-note">This updates one product only. Record the related purchase or sale separately when money is involved.</p>
          {actionError && <p role="alert" className="staff-inline-notice error">{actionError}</p>}
          <div className="inventory-import-actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submitStockAction()}>{busy ? 'Saving…' : 'Save change'}</button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setAction('')}>Cancel</button>
          </div>
        </Modal>

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
