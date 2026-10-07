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
import type { InventoryItem } from '@/lib/context'

type StockAction = 'increase' | 'decrease' | 'receive' | 'count' | 'relocate'

const actionCopy: Record<StockAction, { title: string; kicker: string; heading: string; help: string }> = {
  increase: {
    title: 'Stock Adjustment',
    kicker: 'Quantity correction',
    heading: 'Increase or decrease on-hand stock',
    help: 'Use this when stock is found, damaged, expired, or written off. It updates the selected product in the database.',
  },
  decrease: {
    title: 'Stock Adjustment',
    kicker: 'Quantity correction',
    heading: 'Increase or decrease on-hand stock',
    help: 'Use this when stock is found, damaged, expired, or written off. It updates the selected product in the database.',
  },
  receive: {
    title: 'Receive Stock',
    kicker: 'Inbound stock',
    heading: 'Record incoming quantity',
    help: 'Adds the received quantity to on-hand stock and purchased quantity. Record the supplier invoice separately if money is involved.',
  },
  count: {
    title: 'Stock Count',
    kicker: 'Physical count',
    heading: 'Set stock to the counted quantity',
    help: 'Replaces book stock with the physical count. Zero is allowed. Variance is saved with the product.',
  },
  relocate: {
    title: 'Stock Transfer',
    kicker: 'Warehouse move',
    heading: 'Move this product to another location',
    help: 'Moves the product\'s entire on-hand balance to the destination warehouse. Quantity stays the same.',
  },
}

export default function InventoryPage() {
  const { state, user, updateState, deleteInventoryItems, addAuditLog, reloadInventory } = useAccounting()
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

  const selectedItem = state.inventory.find((item) => item.sku === actionSku || item.product === actionSku)
  const locations = Array.from(new Set([
    ...state.inventory.map((item) => String(item.branch || '').trim()).filter(Boolean),
    'Main Warehouse',
    'Warehouse A',
    'Warehouse B',
    'Store Front',
    'Production',
  ]))

  const openStockAction = (nextAction: StockAction) => {
    setAction(nextAction)
    setActionSku('')
    setQuantity('')
    setReason('')
    setDestination('')
    setActionError('')
  }

  const applyRemoteItem = (selected: InventoryItem, remote?: Record<string, unknown> | null): InventoryItem => {
    if (!remote) return selected
    return {
      ...selected,
      closing: Number(remote.stock_qty ?? selected.closing),
      purchased: Number(remote.purchased_qty ?? selected.purchased),
      sold: Number(remote.sold_qty ?? selected.sold),
      branch: String(remote.branch ?? selected.branch ?? ''),
      lastCountQty: remote.last_count_qty == null ? selected.lastCountQty : Number(remote.last_count_qty),
      lastCountVariance: remote.last_count_variance == null ? selected.lastCountVariance : Number(remote.last_count_variance),
      lastCountAt: remote.last_count_at == null ? selected.lastCountAt : String(remote.last_count_at),
      lastCountReason: remote.last_count_reason == null ? selected.lastCountReason : String(remote.last_count_reason),
    }
  }

  const persistStockAction = async (selected: InventoryItem, nextItem: InventoryItem, amount: number) => {
    const client = getSupabaseClient()
    const companyId = user?.companyId || ''
    if (!client || !companyId) throw new Error('Sign in to a connected company before saving.')
    if (!selected.sku) throw new Error('This product has no SKU, so it cannot be updated in the database.')

    const { data, error } = await client.rpc('apply_inventory_action', {
      p_company_id: companyId,
      p_sku: selected.sku,
      p_action: action,
      p_quantity: action === 'relocate' ? 0 : amount,
      p_reason: reason.trim(),
      p_location: destination.trim() || null,
    })
    const rpcUnavailable = /could not find the function|schema cache|does not exist|not authorized|permission denied|current_company_id/i.test(String(error?.message || ''))
    if (!error) {
      const remote = (typeof data === 'string' ? JSON.parse(data) : data) as Record<string, unknown> | null
      if (remote?.sku) return applyRemoteItem(nextItem, remote)
    } else if (!rpcUnavailable) {
      throw new Error(error.message)
    }

    await saveInventoryRows(client, companyId, [nextItem])
    if (action === 'count') {
      const { error: countError } = await client.from('products').update({
        last_count_qty: nextItem.lastCountQty,
        last_count_variance: nextItem.lastCountVariance,
        last_count_at: nextItem.lastCountAt,
        last_count_reason: nextItem.lastCountReason,
        updated_at: new Date().toISOString(),
      }).eq('company_id', companyId).eq('sku', selected.sku)
      if (countError && !/column|schema cache/i.test(countError.message || '')) {
        throw new Error(countError.message)
      }
    }
    void client.from('audit_logs').insert({
      company_id: companyId,
      action: String(action).toUpperCase(),
      entity: 'INVENTORY',
      module: 'INVENTORY',
      event_type: String(action).toUpperCase(),
      reference: selected.sku,
      details: reason.trim(),
      status: 'SUCCESS',
      metadata: {
        previous_quantity: Number(selected.closing || 0),
        quantity: nextItem.closing,
        location: nextItem.branch || '',
        user_name: user?.name || 'System',
      },
    })
    return nextItem
  }

  const submitStockAction = async () => {
    setActionError('')
    if (!action) return
    const selected = selectedItem
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
    if (action === 'relocate' && destination.trim() === String(selected.branch || '').trim()) {
      setActionError('Choose a different destination from the current location.')
      return
    }
    if (action === 'decrease' && amount > Number(selected.closing || 0)) {
      setActionError(`Only ${selected.closing} unit(s) are available.`)
      return
    }

    const nextItem: InventoryItem = {
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
      const savedItem = await persistStockAction(selected, nextItem, amount)
      try {
        await reloadInventory()
      } catch {
        updateState({
          inventory: state.inventory.map((item) => (selected.sku ? item.sku === selected.sku : item.product === selected.product) ? savedItem : item),
        }, { persist: false })
      }
      updateState({
        auditLogs: [{
          id: `AUD-${new Date().toISOString()}`,
          timestamp: new Date().toISOString(),
          action: action.toUpperCase(),
          type: 'INVENTORY',
          reference: selected.sku || selected.product,
          details: reason.trim(),
          user: user?.name || 'System',
          module: 'INVENTORY',
          status: 'SUCCESS',
          metadata: {
            previous_quantity: Number(selected.closing || 0),
            quantity: savedItem.closing,
            location: savedItem.branch || '',
          },
        }, ...state.auditLogs],
      }, { persist: false })
      triggerAppToast('Inventory saved', `${selected.product} was updated in the database.`)
      setAction('')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to save this stock change.')
    } finally {
      setBusy(false)
    }
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
            <button type="button" className="inventory-btn secondary" onClick={() => openStockAction('increase')}>+ Stock Adjustment</button>
            <button type="button" className="inventory-btn secondary" onClick={() => openStockAction('relocate')}>+ Stock Transfer</button>
            <button type="button" className="inventory-btn secondary" onClick={() => openStockAction('receive')}>+ Receive Stock</button>
            <button type="button" className="inventory-btn secondary" onClick={() => openStockAction('count')}>+ Stock Count</button>
            <button type="button" className="inventory-btn secondary" onClick={() => setShowFilters((prev) => !prev)}>{showFilters ? 'Hide Filters' : 'Show Filters'}</button>
            <button type="button" className="inventory-btn primary allow-readonly" onClick={() => {
              downloadExcel('inventory-export.xlsx', filteredRows)
              addAuditLog('EXPORT', 'INVENTORY', 'ALL', 'Inventory exported to Excel.')
            }}>Export Excel</button>
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

        <Modal
          open={Boolean(action)}
          title={action ? actionCopy[action].title : 'Update inventory'}
          className="workflow-modal"
          onClose={() => { if (!busy) setAction('') }}
          footer={
            <>
              <button type="button" className="btn" disabled={busy} onClick={() => setAction('')}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submitStockAction()}>
                {busy ? 'Saving…' : action === 'receive' ? 'Receive stock' : action === 'count' ? 'Post count' : action === 'relocate' ? 'Transfer stock' : 'Save adjustment'}
              </button>
            </>
          }
        >
          {action && (
            <div className="workflow-form">
              <div className="workflow-intro">
                <span className="workflow-kicker">{actionCopy[action].kicker}</span>
                <h3>{actionCopy[action].heading}</h3>
                <p>{actionCopy[action].help}</p>
              </div>
              <label className="workflow-field">
                Product
                <select value={actionSku} disabled={busy} onChange={(event) => setActionSku(event.target.value)}>
                  <option value="">Select product</option>
                  {state.inventory.map((item) => (
                    <option key={item.sku || item.product} value={item.sku || item.product}>
                      {item.product}{item.sku ? ` (${item.sku})` : ''} — {formatNumber(item.closing)} available
                    </option>
                  ))}
                </select>
              </label>
              {selectedItem && (
                <div className="workflow-summary">
                  <span>{action === 'count' ? 'Book stock' : action === 'relocate' ? 'Current location' : 'On-hand quantity'}</span>
                  <strong>{action === 'relocate' ? (selectedItem.branch || 'Unassigned') : formatNumber(selectedItem.closing)}</strong>
                </div>
              )}
              {(action === 'increase' || action === 'decrease') && (
                <label className="workflow-field">
                  Adjustment type
                  <select value={action} disabled={busy} onChange={(event) => setAction(event.target.value as StockAction)}>
                    <option value="increase">Increase stock</option>
                    <option value="decrease">Decrease stock</option>
                  </select>
                </label>
              )}
              {action === 'relocate' ? (
                <label className="workflow-field">
                  Destination warehouse
                  <input list="inventory-transfer-locations" value={destination} disabled={busy} onChange={(event) => setDestination(event.target.value)} placeholder="Warehouse or branch" />
                  <datalist id="inventory-transfer-locations">
                    {locations.map((location) => <option key={location} value={location} />)}
                  </datalist>
                </label>
              ) : (
                <label className="workflow-field">
                  {action === 'count' ? 'Physical count' : action === 'receive' ? 'Quantity received' : 'Quantity'}
                  <input type="number" min="0" step="any" value={quantity} disabled={busy} onChange={(event) => setQuantity(event.target.value)} />
                </label>
              )}
              {action === 'count' && selectedItem && quantity.trim() !== '' && Number.isFinite(Number(quantity)) && (
                <div className="workflow-summary">
                  <span>Variance</span>
                  <strong>{formatNumber(Number(quantity) - Number(selectedItem.closing || 0))}</strong>
                </div>
              )}
              <label className="workflow-field">
                Reason / reference
                <input value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} placeholder={action === 'receive' ? 'GRN, PO, or delivery note' : action === 'relocate' ? 'Transfer note' : action === 'count' ? 'Count sheet or variance reason' : 'Damage, shrinkage, or found stock'} />
              </label>
              {actionError && <p role="alert" className="staff-inline-notice error">{actionError}</p>}
            </div>
          )}
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
