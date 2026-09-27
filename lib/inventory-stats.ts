import type { InventoryItem } from '@/lib/context'

export const DEFAULT_REORDER_LEVEL = 5
export const EXPIRY_WARNING_DAYS = 30

export type StockStatus = 'Out of Stock' | 'Expired' | 'Damaged' | 'Overstock' | 'Low Stock' | 'In Stock'

const DAY_MS = 24 * 60 * 60 * 1000

export function reorderThreshold(item: InventoryItem) {
  const level = Number(item.reorderLevel || 0)
  return level > 0 ? level : DEFAULT_REORDER_LEVEL
}

export function stockOnHand(item: InventoryItem) {
  return Math.max(0, Number(item.closing || 0))
}

// Weighted average cost is what the ledger values stock at; unit cost is the fallback for items never costed.
export function valuationCost(item: InventoryItem) {
  const average = Number(item.averageCost || 0)
  return average > 0 ? average : Number(item.unitCost || 0)
}

export function daysUntilExpiry(item: InventoryItem, today: Date = new Date()) {
  if (!item.expiryDate) return null
  const expiry = new Date(`${String(item.expiryDate).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(expiry.getTime())) return null
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((expiry.getTime() - start.getTime()) / DAY_MS)
}

export function getStockStatus(item: InventoryItem, today: Date = new Date()): StockStatus {
  const onHand = stockOnHand(item)
  if (onHand <= 0) return 'Out of Stock'
  const days = daysUntilExpiry(item, today)
  if (days !== null && days < 0) return 'Expired'
  if (Number(item.damagedExpired || 0) > 0) return 'Damaged'
  if (item.maximumStockLevel && onHand > item.maximumStockLevel) return 'Overstock'
  if (onHand <= reorderThreshold(item)) return 'Low Stock'
  return 'In Stock'
}

export function computeInventoryStats(items: InventoryItem[], today: Date = new Date()) {
  const active = items.filter((item) => item.active !== false)
  let unitsInStock = 0
  let inventoryValue = 0
  let lowStock = 0
  let outOfStock = 0
  let overstock = 0
  let expiringSoon = 0
  let expired = 0
  let damagedUnits = 0

  for (const item of active) {
    const onHand = stockOnHand(item)
    unitsInStock += onHand
    inventoryValue += onHand * valuationCost(item)
    damagedUnits += Number(item.damagedExpired || 0)
    if (onHand <= 0) outOfStock += 1
    else if (onHand <= reorderThreshold(item)) lowStock += 1
    if (item.maximumStockLevel && onHand > item.maximumStockLevel) overstock += 1
    const days = daysUntilExpiry(item, today)
    if (days !== null && onHand > 0) {
      if (days < 0) expired += 1
      else if (days <= EXPIRY_WARNING_DAYS) expiringSoon += 1
    }
  }

  return {
    totalProducts: active.length,
    unitsInStock,
    inventoryValue: Math.round(inventoryValue * 100) / 100,
    lowStock,
    outOfStock,
    overstock,
    expiringSoon,
    expired,
    damagedUnits,
  }
}
