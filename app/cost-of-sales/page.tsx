'use client'

import { useMemo, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting } from '@/lib/context'
import { formatCurrency, formatNumber } from '@/lib/utils'

const assetCategories = new Set(['Assets', 'Furniture', 'Electronics', 'Fixed Asset'])

function isActive(status?: string) {
  return String(status || '').toUpperCase() !== 'VOID'
}

export default function CostOfSalesPage() {
  const { state } = useAccounting()
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()

  const unitCosts = useMemo(
    () => new Map(state.inventory.map((item) => [item.product.trim().toLowerCase(), Number(item.unitCost) || 0])),
    [state.inventory],
  )

  const soldRows = useMemo(() => state.sales.filter((sale) => isActive(sale.status)).flatMap((sale) => (
    (sale.items || []).map((item) => {
      const qty = Number(item.qty) || 0
      const unitCost = unitCosts.get(String(item.product || '').trim().toLowerCase()) || 0
      return {
        id: `${sale.id}-${item.product}`,
        date: sale.date,
        reference: sale.id,
        detail: item.product || 'Unnamed product',
        party: sale.customer,
        qty,
        amount: qty * unitCost,
      }
    })
  )), [state.sales, unitCosts])

  const purchaseRows = useMemo(() => state.purchases.filter((purchase) => isActive(purchase.status) && !assetCategories.has(purchase.category || '')).map((purchase) => ({
    id: purchase.id,
    date: purchase.date,
    reference: purchase.invoiceNumber || purchase.id,
    detail: purchase.product || purchase.category || 'Purchase',
    party: purchase.supplier,
    qty: Number(purchase.qty) || 0,
    amount: Number(purchase.total) || 0,
  })), [state.purchases])

  const matches = (row: { date: string; reference: string; detail: string; party: string }) => !query || [row.date, row.reference, row.detail, row.party].join(' ').toLowerCase().includes(query)
  const visibleSold = soldRows.filter(matches)
  const visiblePurchases = purchaseRows.filter(matches)
  const soldTotal = visibleSold.reduce((sum, row) => sum + row.amount, 0)
  const purchaseTotal = visiblePurchases.reduce((sum, row) => sum + row.amount, 0)

  return (
    <AppLayout>
      <div className="report-shell">
        <div className="page-header report-header">
          <div>
            <div className="pg-title">Cost of Sales</div>
            <div className="pg-subtitle">Cost of goods from recorded sales, with related purchases listed separately.</div>
          </div>
        </div>

        <div className="management-controls">
          <label>Search
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Product, reference, customer, or supplier" />
          </label>
        </div>

        <div className="daily-close-summary-grid">
          <div className="daily-close-summary-card">
            <div className="metric-label">Cost of goods sold</div>
            <div className="metric-value">{formatCurrency(soldTotal)}</div>
          </div>
          <div className="daily-close-summary-card">
            <div className="metric-label">Sold lines</div>
            <div className="metric-value">{formatNumber(visibleSold.length)}</div>
          </div>
          <div className="daily-close-summary-card">
            <div className="metric-label">Purchases</div>
            <div className="metric-value">{formatCurrency(purchaseTotal)}</div>
          </div>
        </div>

        <div className="panel-card" style={{ marginTop: 18 }}>
          <div className="panel-title">Sold goods</div>
          <div className="metric-note">Quantity sold multiplied by the product unit cost already stored in inventory.</div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>Sale</th><th>Product</th><th>Customer</th><th>Qty</th><th>Cost</th></tr>
              </thead>
              <tbody>
                {visibleSold.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>{row.reference}</td>
                    <td>{row.detail}</td>
                    <td>{row.party}</td>
                    <td>{formatNumber(row.qty)}</td>
                    <td>{formatCurrency(row.amount)}</td>
                  </tr>
                ))}
                {visibleSold.length === 0 && <tr><td colSpan={6}>No cost of sales from recorded sales yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel-card" style={{ marginTop: 18 }}>
          <div className="panel-title">Purchases</div>
          <div className="metric-note">Goods purchases already on record. Fixed-asset purchases stay on the asset schedule.</div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>Reference</th><th>Item</th><th>Supplier</th><th>Qty</th><th>Amount</th></tr>
              </thead>
              <tbody>
                {visiblePurchases.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>{row.reference}</td>
                    <td>{row.detail}</td>
                    <td>{row.party}</td>
                    <td>{formatNumber(row.qty)}</td>
                    <td>{formatCurrency(row.amount)}</td>
                  </tr>
                ))}
                {visiblePurchases.length === 0 && <tr><td colSpan={6}>No goods purchases recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
