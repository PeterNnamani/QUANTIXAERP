'use client'

import { useMemo, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import InventoryImport from '@/components/inventory/inventory-import'
import {saveInventoryRows} from '@/lib/inventory-workflows'
import {getSupabaseClient} from '@/lib/supabase.browser'
import { useAccounting } from '@/lib/context'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { downloadExcel } from '@/lib/export-utils'
import { generateSku } from '@/lib/sku'
import InventorySheetTable, { inventorySheetHeaders, type InventorySheet } from '@/components/inventory/inventory-sheet-table'

export default function ProductManagerPage() {
    const { state, user, updateState, addAuditLog } = useAccounting()
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [search, setSearch] = useState('')
    const [selectedCategory, setSelectedCategory] = useState('All Categories')
    const [selectedBrand, setSelectedBrand] = useState('All Brands')
    const [selectedSupplier, setSelectedSupplier] = useState('All Suppliers')
    const [selectedStock, setSelectedStock] = useState('All')
    const [selectedStatus, setSelectedStatus] = useState('Active')
    const [selectedRow, setSelectedRow] = useState(0)
    const [selectedSheet, setSelectedSheet] = useState<InventorySheet>('product-master')
    const [showFilters, setShowFilters] = useState(false)
    const [showProductForm, setShowProductForm] = useState(false)
    const [productFormData, setProductFormData] = useState({
        name: '',
        sku: '',
        description: '',
        branch: '',
        category: '',
        brand: '',
        costPrice: 0,
        sellingPrice: 0,
        stock: 0,
        expiryDate: '',
        damagedExpired: 0,
    })

    const products = useMemo(() => {
        const usedSkus = state.inventory.map((item) => item.sku).filter((sku): sku is string => Boolean(sku))
        return state.inventory.map((item, index) => {
            const sku = item.sku || generateSku(item.product, usedSkus)
            if (!item.sku) usedSkus.push(sku)

            return {
                id: `PRD-${index + 1}`,
                name: item.product,
                sku,
                description: item.description || '',
                branch: item.branch || '',
                category: item.dept || 'Uncategorized',
                brand: item.brand || '—',
                costPrice: item.unitCost,
                sellingPrice: item.sellingPrice ?? item.unitCost,
                stockStatus: item.closing <= 0 ? 'Out of Stock' : item.closing <= (item.reorderLevel ?? 5) ? 'Low Stock' : 'In Stock',
                status: item.active === false ? 'Inactive' : 'Active',
                supplier: item.supplier || '—',
                stock: item.closing,
                expiryDate: item.expiryDate || '',
                damagedExpired: item.damagedExpired || 0,
            }
        })
    }, [state.inventory])

    const filteredProducts = useMemo(() => {
        const query = search.toLowerCase()
        return products.filter((product) => {
            const matchesQuery = !query || [product.name, product.sku, product.category, product.brand, product.supplier].join(' ').toLowerCase().includes(query)
            const matchesCategory = selectedCategory === 'All Categories' || product.category === selectedCategory
            const matchesStatus = selectedStatus === 'All Status' || product.status === selectedStatus
            return matchesQuery && matchesCategory && matchesStatus && (selectedBrand === 'All Brands' || product.brand === selectedBrand) && (selectedSupplier === 'All Suppliers' || product.supplier === selectedSupplier) && (selectedStock === 'All' || product.stockStatus === selectedStock)
        })
    }, [products, search, selectedCategory, selectedStatus, selectedBrand, selectedSupplier, selectedStock])

    const selectedProduct = filteredProducts[selectedRow] || filteredProducts[0]

    const summaryCards = [
        { label: 'Total Products', value: formatNumber(products.length), tone: 'info' },
        { label: 'Active Products', value: formatNumber(products.filter((product) => product.status === 'Active').length), tone: 'info' },
        { label: 'Inactive Products', value: formatNumber(products.filter((product) => product.status === 'Inactive').length), tone: 'warning' },
        { label: 'Categories', value: formatNumber(new Set(products.map((product) => product.category)).size), tone: 'info' },
        { label: 'Brands', value: formatNumber(new Set(products.map((product) => product.brand).filter(brand => brand !== '—')).size), tone: 'info' },
        { label: 'Variants', value: formatNumber(products.length), tone: 'info' },
    ]

    const handleSaveProduct = async () => {
        setSaveError('')
        if (!productFormData.name) {
            alert('Product name is required.')
            return
        }

        const sku = productFormData.sku.trim() || generateSku(productFormData.name, state.inventory.map((item) => item.sku || ''))

        if (state.inventory.some(item => item.sku?.toLowerCase() === sku.toLowerCase())) {setSaveError('This SKU already exists. Use bulk update by SKU.'); return}
        const newInventoryItem = {
            product: productFormData.name,
            sku,
            description: productFormData.description,
            brand: productFormData.brand,
            branch: productFormData.branch,
            dept: productFormData.category || 'Uncategorized',
            openQty: productFormData.stock,
            purchased: 0,
            sold: 0,
            unitCost: productFormData.costPrice,
            sellingPrice: productFormData.sellingPrice,
            closing: productFormData.stock,
            expiryDate: productFormData.expiryDate,
            damagedExpired: productFormData.damagedExpired,
        }

        setSaving(true)
        try {
          await saveInventoryRows(getSupabaseClient(), user?.companyId || '', [newInventoryItem])
        } catch(error) {
          setSaveError(error instanceof Error ? error.message : 'Unable to save product.'); return
        } finally {setSaving(false)}
        updateState({ inventory: [...state.inventory, newInventoryItem] }, {persist: false})
        addAuditLog('CREATE', 'PRODUCT', sku, `Product ${productFormData.name} added to catalog.`)
        setShowProductForm(false)
        setProductFormData({
            name: '',
            sku: '',
            description: '',
            branch: '',
            category: '',
            brand: '',
            costPrice: 0,
            sellingPrice: 0,
            stock: 0,
            expiryDate: '',
            damagedExpired: 0,
        })
    }

    const handleExportProducts = () => {
        downloadExcel('products.xlsx', filteredProducts)
        addAuditLog('EXPORT', 'PRODUCT', 'ALL', 'Exported products catalog.')
    }

    return (
        <AppLayout>
            <div className="product-manager-shell">
                <div className="product-manager-header">
                    <div>
                        <div className="pg-title">Product Manager</div>
                        <div className="pg-subtitle">Manage products, pricing, categories, variants, suppliers, and product settings.</div>
                    </div>
                    <div className="product-manager-actions">
                        <InventoryImport />
                        <button className="product-manager-btn secondary" type="button" onClick={() => setShowProductForm(true)}>+ Add Product</button>
                        
                        <button className="product-manager-btn secondary allow-readonly" type="button" onClick={handleExportProducts}>Export Products</button>
                        <button className="product-manager-btn secondary" type="button" onClick={() => setShowFilters((prev) => !prev)}>{showFilters ? 'Hide Filters' : 'Show Filters'}</button>
                        <InventoryImport label="Bulk update by SKU" />
                    </div>
                </div>

                <div className="product-manager-summary-grid">
                    {summaryCards.map((card) => (
                        <div className={`product-manager-summary-card ${card.tone}`} key={card.label}>
                            <div className="product-manager-summary-label">{card.label}</div>
                            <div className="product-manager-summary-value">{card.value}</div>
                        </div>
                    ))}
                </div>

                {showProductForm && (
                    <div className="product-manager-card">
                        <div className="section-head">
                            <div>
                                <div className="card-title">Add New Product</div>
                                <div className="section-subtitle">Create a new item and add it to inventory.</div>
                            </div>
                            <button className="btn btn-secondary btn-sm" type="button" onClick={() => setShowProductForm(false)}>Close</button>
                        </div>
                        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
                            <div className="fg">
                                <label>Product Name</label>
                                <input value={productFormData.name} onChange={(e) => setProductFormData({ ...productFormData, name: e.target.value })} placeholder="Product name" />
                            </div>
                            <div className="fg">
                                <label>Description</label>
                                <input value={productFormData.description} onChange={(e) => setProductFormData({ ...productFormData, description: e.target.value })} placeholder="Product description" />
                            </div>
                            <div className="fg">
                                <label>SKU</label>
                                <input value={productFormData.sku} onChange={(e) => setProductFormData({ ...productFormData, sku: e.target.value })} placeholder="SKU code" />
                            </div>
                            <div className="fg">
                                <label>Category</label>
                                <input value={productFormData.category} onChange={(e) => setProductFormData({ ...productFormData, category: e.target.value })} placeholder="Product category" />
                            </div>
                            <div className="fg">
                                <label>Branch</label>
                                <input value={productFormData.branch} onChange={(e) => setProductFormData({ ...productFormData, branch: e.target.value })} placeholder="Product branch" />
                            </div>
                            <div className="fg">
                                <label>Brand</label>
                                <input value={productFormData.brand} onChange={(e) => setProductFormData({ ...productFormData, brand: e.target.value })} placeholder="Brand" />
                            </div>
                            <div className="fg">
                                <label>Cost Price</label>
                                <input type="number" min={0} step="any" value={productFormData.costPrice} onChange={(e) => setProductFormData({ ...productFormData, costPrice: parseFloat(e.target.value) || 0 })} />
                            </div>
                            <div className="fg">
                                <label>Selling Price</label>
                                <input type="number" min={0} step="any" value={productFormData.sellingPrice} onChange={(e) => setProductFormData({ ...productFormData, sellingPrice: parseFloat(e.target.value) || 0 })} />
                            </div>
                            <div className="fg">
                                <label>Stock</label>
                                <input type="number" min={0} step="any" value={productFormData.stock} onChange={(e) => setProductFormData({ ...productFormData, stock: parseFloat(e.target.value) || 0 })} />
                            </div>
                            <div className="fg">
                                <label>Expiry Date</label>
                                <input type="date" value={productFormData.expiryDate} onChange={(e) => setProductFormData({ ...productFormData, expiryDate: e.target.value })} />
                            </div>
                            <div className="fg">
                                <label>Damaged/Expired</label>
                                <input type="number" min={0} step="any" value={productFormData.damagedExpired} onChange={(e) => setProductFormData({ ...productFormData, damagedExpired: parseFloat(e.target.value) || 0 })} />
                            </div>
                        </div>
                        <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void handleSaveProduct()}>{saving ? 'Saving…' : 'Save Product'}</button>{saveError && <p role="alert">{saveError}</p>}
                            <button className="btn btn-secondary" type="button" onClick={() => setShowProductForm(false)}>Cancel</button>
                        </div>
                    </div>
                )}
                {showFilters && (
                    <div className="product-manager-card">
                        <div className="section-head">
                            <div>
                                <div className="card-title">Search & Filters</div>
                                <div className="section-subtitle">Filter products by catalog, supplier, and availability.</div>
                            </div>
                        </div>
                        <div className="product-manager-search-row">
                            <div className="product-manager-search-field">
                                <span>🔎</span>
                                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by product name, SKU, or brand..." />
                            </div>
                            <div className="product-manager-chip-row">
                                <span className="product-manager-chip success">Catalog ready</span>
                                <span className="product-manager-chip">Price updates</span>
                            </div>
                        </div>
                        <div className="product-manager-filters-grid">
                            <label>
                                <span>Category</span>
                                <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                                    <option>All Categories</option>
                                    {Array.from(new Set(products.map((product) => product.category))).map((option) => <option key={option} value={option}>{option}</option>)}
                                </select>
                            </label>
                            <label>
                                <span>Brand</span>
                                <select value={selectedBrand} onChange={event => setSelectedBrand(event.target.value)}>
                                    <option>All Brands</option>
                                    {Array.from(new Set(products.map((product) => product.brand).filter(Boolean))).map((option) => <option key={option} value={option}>{option}</option>)}
                                </select>
                            </label>
                            <label>
                                <span>Supplier</span>
                                <select value={selectedSupplier} onChange={event => setSelectedSupplier(event.target.value)}>
                                    <option>All Suppliers</option>
                                    {Array.from(new Set(products.map((product) => product.supplier).filter(Boolean))).map((option) => <option key={option} value={option}>{option}</option>)}
                                </select>
                            </label>
                            <label>
                                <span>Status</span>
                                <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
                                    <option>All Status</option><option>Active</option><option>Inactive</option>
                                </select>
                            </label>
                            <label>
                                <span>Stock Status</span>
                                <select value={selectedStock} onChange={event => setSelectedStock(event.target.value)}>
                                    <option>All</option><option>In Stock</option><option>Low Stock</option><option>Out of Stock</option>
                                </select>
                            </label>
                        </div>
                    </div>
                )}

                <InventorySheetTable
                    sheet={selectedSheet}
                    onSheetChange={setSelectedSheet}
                    inventory={state.inventory.filter(item => filteredProducts.some(product => product.sku === item.sku))}
                    purchases={state.purchases}
                    sales={state.sales}
                    auditLogs={state.auditLogs}
                    supplierList={state.supplierList}
                    search={search}
                />

                <div className="product-manager-content-grid">
                    <div className="product-manager-card">
                        <div className="section-head">
                            <div>
                                <div className="card-title">Product Table</div>
                                <div className="section-subtitle">Showing {filteredProducts.length} products.</div>
                            </div>
                        </div>
                        <div className="product-manager-table-wrap">
                            <table className="product-manager-table">
                                <thead>
                                    <tr>
                                        <th>SKU</th>
                                        <th>Product</th>
                                        <th>Description</th>
                                        <th>Category</th>
                                        <th>Branch</th>
                                        <th>Brand</th>
                                        <th>Cost Price</th>
                                        <th>Selling Price</th>
                                        <th>Stock</th>
                                        <th>Expiry Date</th>
                                        <th>Damaged/Expired</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredProducts.map((product, index) => (
                                        <tr key={product.id} onClick={() => setSelectedRow(index)} className={selectedProduct?.id === product.id ? 'selected' : ''}>
                                            <td>{product.sku}</td>
                                            <td>{product.name}</td>
                                            <td>{product.description || '—'}</td>
                                            <td>{product.category}</td>
                                            <td>{product.branch || '—'}</td>
                                            <td>{product.brand}</td>
                                            <td>{formatCurrency(product.costPrice)}</td>
                                            <td>{formatCurrency(product.sellingPrice)}</td>
                                            <td>{product.stock}</td>
                                            <td>{product.expiryDate || '—'}</td>
                                            <td>{product.damagedExpired}</td>
                                            <td><span className={`product-manager-pill ${product.stockStatus === 'Out of Stock' ? 'danger' : product.stockStatus === 'Low Stock' ? 'warning' : 'success'}`}>{product.stockStatus}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="product-manager-side-stack">
                        <div className="product-manager-card">
                            <div className="section-head">
                                <div>
                                    <div className="card-title">Product Details</div>
                                    <div className="section-subtitle">Catalog information for the selected item.</div>
                                </div>
                            </div>
                            <div className="product-manager-detail-panel">
                                <div className="product-manager-detail-row"><span>Product Name</span><strong>{selectedProduct?.name || 'Not selected'}</strong></div>
                                <div className="product-manager-detail-row"><span>Description</span><strong>{selectedProduct?.description || '—'}</strong></div>
                                <div className="product-manager-detail-row"><span>SKU</span><strong>{selectedProduct?.sku || '—'}</strong></div>
                                <div className="product-manager-detail-row"><span>Category</span><strong>{selectedProduct?.category || '—'}</strong></div>
                                <div className="product-manager-detail-row"><span>Branch</span><strong>{selectedProduct?.branch || '—'}</strong></div>
                                <div className="product-manager-detail-row"><span>Brand</span><strong>—</strong></div>
                                <div className="product-manager-detail-row"><span>Cost Price</span><strong>{selectedProduct?.costPrice ? formatCurrency(selectedProduct.costPrice) : formatCurrency(0)}</strong></div>
                                <div className="product-manager-detail-row"><span>Selling Price</span><strong>{selectedProduct?.sellingPrice ? formatCurrency(selectedProduct.sellingPrice) : formatCurrency(0)}</strong></div>
                            </div>
                        </div>

                        <div className="product-manager-card">
                            <div className="section-head">
                                <div>
                                    <div className="card-title">Inventory Settings</div>
                                    <div className="section-subtitle">Operational controls tied to stock.</div>
                                </div>
                            </div>
                            <div className="product-manager-detail-panel">
                                <div className="product-manager-detail-row"><span>Track Inventory</span><strong>—</strong></div>
                                <div className="product-manager-detail-row"><span>Minimum Stock</span><strong>—</strong></div>
                                <div className="product-manager-detail-row"><span>Reorder Level</span><strong>—</strong></div>
                                <div className="product-manager-detail-row"><span>Branch</span><strong>{selectedProduct?.branch || '—'}</strong></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    )
}
