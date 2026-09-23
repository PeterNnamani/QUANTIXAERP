'use client'

import { useEffect, useMemo, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting, type Purchase } from '@/lib/context'
import { formatCurrency, formatCurrencyOrZero, formatNumber, triggerAppToast } from '@/lib/utils'
import { downloadExcel } from '@/lib/export-utils'
import AddAssetModal from '@/components/modals/AddAssetModal'
import AssetLifecycleModal from '@/components/modals/AssetLifecycleModal'

const fixedAssetCategories = ['Assets', 'Furniture', 'Electronics']

type AssetRow = {
    id: string
    name: string
    category: string
    purchaseDate: string
    cost: string
    depreciation: string
    bookValue: string
    status: string
    supplier: string
    branch: string
    paymentMethod: string
}

function getRecordedDepreciation(purchase: Purchase) {
    const match = purchase.notes?.match(/ASSET_DEPRECIATION:\s*(\d+(?:\.\d+)?)/)
    return match ? Number(match[1]) : 0
}

export default function AssetSchedulePage() {
    const { state, updateState, addAuditLog, user } = useAccounting()
    const [showAddAsset, setShowAddAsset] = useState(false)
    const [lifecycleAction, setLifecycleAction] = useState<'transfer' | 'dispose' | 'depreciation' | null>(null)
    const assetPurchases = useMemo(
        () => state.purchases.filter((purchase) => fixedAssetCategories.includes(purchase.category || '')),
        [state.purchases]
    )

    const maintenanceCount = useMemo(
        () => state.purchases.filter((purchase) => purchase.category === 'Maintenance' && purchase.status !== 'VOID').length,
        [state.purchases]
    )

    const disposedCount = useMemo(
        () => assetPurchases.filter((purchase) => purchase.status === 'Returned' || purchase.status === 'VOID').length,
        [assetPurchases]
    )

    const activeAssetsCount = useMemo(
        () => assetPurchases.filter((purchase) => purchase.status !== 'Returned' && purchase.status !== 'VOID').length,
        [assetPurchases]
    )

    const totalAssetValue = useMemo(
        () => assetPurchases.reduce((sum, purchase) => sum + (purchase.total || 0), 0),
        [assetPurchases]
    )

    const accumulatedDepreciation = useMemo(
        () => assetPurchases.reduce((sum, purchase) => sum + getRecordedDepreciation(purchase), 0),
        [assetPurchases]
    )
    const currentBookValue = Math.max(0, totalAssetValue - accumulatedDepreciation)

    const assetCategoryCounts = useMemo(
        () => {
            const counts = assetPurchases.reduce<Record<string, number>>((acc, purchase) => {
                const category = purchase.category || 'Assets'
                acc[category] = (acc[category] || 0) + 1
                return acc
            }, {})

            return fixedAssetCategories.map((name) => ({ name, count: counts[name] ?? 0 }))
        },
        [assetPurchases]
    )

    const assetRows = useMemo<AssetRow[]>(
        () =>
            assetPurchases.map((purchase) => ({
                id: purchase.id,
                name: purchase.product,
                category: purchase.category || 'Assets',
                purchaseDate: purchase.date,
                cost: formatCurrency(purchase.total || 0),
                depreciation: formatCurrencyOrZero(getRecordedDepreciation(purchase)),
                bookValue: formatCurrencyOrZero(Math.max(0, (purchase.total || 0) - getRecordedDepreciation(purchase))),
                status: purchase.status || 'Unknown',
                supplier: purchase.supplier,
                branch: purchase.branch || 'Head Office',
                paymentMethod: purchase.paymentMethod || 'Cash',
            }))
        ,
        [assetPurchases]
    )

    const [selectedAssetId, setSelectedAssetId] = useState<string | null>(assetRows[0]?.id ?? null)
    const [assetMode, setAssetMode] = useState<'view' | 'add' | 'transfer' | 'dispose' | 'depreciation'>('view')

    useEffect(() => {
        if (!selectedAssetId && assetRows.length > 0) {
            setSelectedAssetId(assetRows[0].id)
        }
    }, [assetRows, selectedAssetId])

    const selectedAsset = assetRows.find((asset) => asset.id === selectedAssetId) || assetRows[0] || null

    const detailRows = useMemo(
        () =>
            selectedAsset
                ? [
                    { label: 'Asset ID', value: selectedAsset.id },
                    { label: 'Category', value: selectedAsset.category },
                    { label: 'Purchase Date', value: selectedAsset.purchaseDate },
                    { label: 'Purchase Cost', value: selectedAsset.cost },
                    { label: 'Current Value', value: selectedAsset.bookValue },
                    { label: 'Assigned Branch', value: selectedAsset.branch },
                    { label: 'Supplier', value: selectedAsset.supplier },
                    { label: 'Payment Method', value: selectedAsset.paymentMethod },
                ]
                : [],
        [selectedAsset]
    )

    const assetCards = [
        { label: 'Total Asset Value', value: formatCurrency(totalAssetValue) },
        { label: 'Current Book Value', value: formatCurrency(currentBookValue) },
        { label: 'Accumulated Depreciation', value: formatCurrency(accumulatedDepreciation) },
        { label: 'Active Assets', value: formatNumber(activeAssetsCount) },
        { label: 'Assets Due Maintenance', value: formatNumber(maintenanceCount) },
        { label: 'Disposed Assets', value: formatNumber(disposedCount) },
    ]

    const handleCreateAsset = (asset: Purchase) => {
        const nextSupplierList = state.supplierList.includes(asset.supplier) ? state.supplierList : [...state.supplierList, asset.supplier]
        updateState({ purchases: [...state.purchases, { ...asset, enteredBy: user?.name || 'System' }], supplierList: nextSupplierList })
        addAuditLog('CREATE', 'ASSET', asset.id, `Fixed asset added: ${asset.product}`)
        triggerAppToast('Asset Added', `${asset.product} was added to the asset register.`)
    }

    const handleAction = (action: string) => {
        if (action === 'Export Register') {
            downloadExcel('asset-schedule-register.xlsx', assetRows.map((asset) => ({ action, ...asset })))
            triggerAppToast(action, 'The asset register was exported.')
        }
    }

    const handleLifecycleAction = (values: { branch?: string; reason?: string; date?: string; method?: string; rate?: number }) => {
        if (!selectedAsset) {
            triggerAppToast('Select an asset', 'Choose an asset before running this workflow.')
            return
        }
        const selectedPurchase = assetPurchases.find((purchase) => purchase.id === selectedAsset.id)
        if (!selectedPurchase || !lifecycleAction) return
        const nextPurchases = state.purchases.map((purchase) => {
            if (purchase.id !== selectedPurchase.id) return purchase
            if (lifecycleAction === 'transfer') return { ...purchase, branch: values.branch || purchase.branch, notes: `${purchase.notes || ''}\nTransferred: ${values.reason || 'Branch transfer'}`.trim() }
            if (lifecycleAction === 'dispose') return { ...purchase, status: 'Returned', notes: `${purchase.notes || ''}\nDisposed on ${values.date}: ${values.reason}`.trim() }
            const depreciationAmount = Math.min(purchase.total || 0, (purchase.total || 0) * (values.rate || 0) / 100)
            return { ...purchase, notes: `${purchase.notes || ''}\nASSET_DEPRECIATION: ${depreciationAmount.toFixed(2)} (${values.method}, ${values.date})`.trim() }
        })
        updateState({ purchases: nextPurchases })
        const actionLabel = lifecycleAction === 'transfer' ? 'TRANSFER' : lifecycleAction === 'dispose' ? 'DISPOSE' : 'DEPRECIATION'
        addAuditLog(actionLabel, 'ASSET', selectedPurchase.id, `${actionLabel} workflow completed for ${selectedPurchase.product}`)
        triggerAppToast(`${actionLabel} completed`, `${selectedPurchase.product} was updated and saved.`)
        setLifecycleAction(null)
    }

    return (
        <AppLayout>
            <div className="report-shell">
                <div className="page-header report-header">
                    <div>
                        <div className="pg-title">Asset Schedule</div>
                        <div className="pg-subtitle">Manage fixed assets, depreciation, maintenance, and asset lifecycle.</div>
                    </div>
                    <div className="page-actions">
                        <button className="action-btn primary" type="button" onClick={() => { setAssetMode('add'); setShowAddAsset(true) }}>+ Add Asset</button>
                        <button className="action-btn secondary" type="button" onClick={() => { setAssetMode('transfer'); setLifecycleAction('transfer') }}>Transfer Asset</button>
                        <button className="action-btn secondary" type="button" onClick={() => { setAssetMode('dispose'); setLifecycleAction('dispose') }}>Dispose Asset</button>
                        <button className="action-btn secondary" type="button" onClick={() => { setAssetMode('depreciation'); setLifecycleAction('depreciation') }}>Run Depreciation</button>
                        <button className="action-btn secondary" type="button" onClick={() => handleAction('Export Register')}>Export Register</button>
                    </div>
                    <div className="asset-mode-banner">Current workflow mode: {assetMode}</div>
                </div>

                <AddAssetModal open={showAddAsset} onClose={() => setShowAddAsset(false)} onCreate={handleCreateAsset} />
                <AssetLifecycleModal
                    open={Boolean(lifecycleAction)}
                    action={lifecycleAction || 'transfer'}
                    assetName={selectedAsset?.name}
                    currentBranch={selectedAsset?.branch}
                    currentValue={selectedAsset ? Number(selectedAsset.bookValue.replace(/[^0-9.-]+/g, '')) : 0}
                    onClose={() => setLifecycleAction(null)}
                    onConfirm={handleLifecycleAction}
                />

                <div className="report-grid report-summary-grid">
                    {assetCards.map((card) => (
                        <div key={card.label} className="metric-card report-card">
                            <div className="metric-label">{card.label}</div>
                            <div className="metric-value">{card.value}</div>
                        </div>
                    ))}
                </div>

                <div className="report-grid two-col">
                    <div className="report-card">
                        <div className="card-hd">
                            <div>
                                <div className="card-title">Asset Categories</div>
                                <div className="section-subtitle">Current fixed asset mix</div>
                            </div>
                        </div>
                        <div className="asset-category-grid">
                            {assetCategoryCounts.map((item) => (
                                <div key={item.name} className="asset-category-card">
                                    <div className="asset-category-name">{item.name}</div>
                                    <div className="asset-category-count">{item.count}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="report-card">
                        <div className="card-hd">
                            <div>
                                <div className="card-title">Asset Detail Panel</div>
                                <div className="section-subtitle">{selectedAsset ? selectedAsset.name : 'No asset selected'}</div>
                            </div>
                        </div>
                        <div className="statement-block compact">
                            {detailRows.map((row) => (
                                <div key={row.label} className="statement-row">
                                    <span>{row.label}</span>
                                    <strong>{row.value}</strong>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="report-card">
                    <div className="card-hd">
                        <div>
                            <div className="card-title">Asset Table</div>
                            <div className="section-subtitle">Main fixed asset register</div>
                        </div>
                    </div>
                    <div className="table-wrap">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Asset ID</th>
                                    <th>Name</th>
                                    <th>Category</th>
                                    <th>Purchase Date</th>
                                    <th>Cost</th>
                                    <th>Depreciation</th>
                                    <th>Book Value</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {assetRows.map((asset) => (
                                    <tr key={asset.id} onClick={() => setSelectedAssetId(asset.id)} style={{ cursor: 'pointer' }}>
                                        <td>{asset.id}</td>
                                        <td>{asset.name}</td>
                                        <td>{asset.category}</td>
                                        <td>{asset.purchaseDate}</td>
                                        <td>{asset.cost}</td>
                                        <td>{asset.depreciation}</td>
                                        <td>{asset.bookValue}</td>
                                        <td>{asset.status}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="report-grid two-col">
                    <div className="report-card">
                        <div className="card-hd">
                            <div>
                                <div className="card-title">Depreciation Schedule</div>
                                <div className="section-subtitle">Accounting control over asset value</div>
                            </div>
                        </div>
                        <div className="statement-block compact">
                            <div className="statement-row"><span>Recorded schedules</span><strong>None</strong></div>
                            <div className="statement-row net-row"><span>Accumulated Depreciation</span><strong>{formatCurrency(accumulatedDepreciation)}</strong></div>
                        </div>
                    </div>

                    <div className="report-card">
                        <div className="card-hd">
                            <div>
                                <div className="card-title">Asset Maintenance</div>
                                <div className="section-subtitle">Upcoming service and repairs</div>
                            </div>
                        </div>
                        <div className="statement-block compact">
                            <div className="statement-row"><span>Maintenance records</span><strong>{maintenanceCount}</strong></div>
                        </div>
                    </div>
                </div>

                <div className="report-grid two-col">
                    <div className="report-card">
                        <div className="card-hd">
                            <div>
                                <div className="card-title">Asset Disposal</div>
                                <div className="section-subtitle">Manage sold or damaged assets</div>
                            </div>
                        </div>
                        <div className="statement-block compact">
                            <div className="statement-row"><span>Disposed assets</span><strong>{disposedCount}</strong></div>
                        </div>
                    </div>

                    <div className="report-card ai-card">
                        <div className="card-hd">
                            <div>
                                <div className="card-title">QUANTIXA Asset Intelligence</div>
                                <div className="section-subtitle">Asset lifecycle insight</div>
                            </div>
                        </div>
                        <div className="ai-panel">
                            <p>No asset intelligence is available from the current register.</p>
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    )
}
