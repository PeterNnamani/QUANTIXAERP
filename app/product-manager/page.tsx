'use client'

import { useMemo, useState, type ChangeEvent } from 'react'
import AppLayout from '@/components/layout/app-layout'
import BulkImport from '@/components/bulk-import'
import { useAccounting } from '@/lib/context'
import { formatCurrency, formatNumber, parseNumeric } from '@/lib/utils'
import { downloadExcel } from '@/lib/export-utils'
import { parseExcelFile } from '@/lib/import-utils'
import { generateSku } from '@/lib/sku'
import InventorySheetTable, { inventorySheetHeaders, type InventorySheet } from '@/components/inventory/inventory-sheet-table'

export default function ProductManagerPage() {
    const { state, updateState, addAuditLog } = useAccounting()
    const [search, setSearch] = useState('')
    const [selectedCategory, setSelectedCategory] = useState('All Categories')
    const [selectedStatus, setSelectedStatus] = useState('Active')
    const [selectedRow, setSelectedRow] = useState(0)
    const [selectedSheet, setSelectedSheet] = useState<InventorySheet>('product-master')
    const [showFilters, setShowFilters] = useState(false)
    const [showProductForm, setShowProductForm] = useState(false)
    const [showImportModal, setShowImportModal] = useState(false)
    const [importRows, setImportRows] = useState<Record<string, unknown>[]>([])
    const [importFileName, setImportFileName] = useState('')
    const [importError, setImportError] = useState('')
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
                brand: '—',
                costPrice: item.unitCost,
                sellingPrice: item.sellingPrice ?? item.unitCost,
                stockStatus: item.closing <= 0 ? 'Out of Stock' : item.closing <= 10 ? 'Low Stock' : 'In Stock',
                status: 'Active',
                supplier: '—',
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
            return matchesQuery && matchesCategory && matchesStatus
        })
    }, [products, search, selectedCategory, selectedStatus])

    const selectedProduct = filteredProducts[selectedRow] || filteredProducts[0]

    const summaryCards = [
        { label: 'Total Products', value: formatNumber(products.length), tone: 'info' },
        { label: 'Active Products', value: formatNumber(products.filter((product) => product.status === 'Active').length), tone: 'info' },
        { label: 'Inactive Products', value: formatNumber(products.filter((product) => product.status === 'Inactive').length), tone: 'warning' },
        { label: 'Categories', value: formatNumber(new Set(products.map((product) => product.category)).size), tone: 'info' },
        { label: 'Brands', value: formatNumber(new Set(products.map((product) => product.category)).size), tone: 'info' },
        { label: 'Variants', value: formatNumber(products.length), tone: 'info' },
    ]

    const handleSaveProduct = () => {
        if (!productFormData.name) {
            alert('Product name is required.')
            return
        }

        const sku = productFormData.sku.trim() || generateSku(productFormData.name, state.inventory.map((item) => item.sku || ''))

        const newInventoryItem = {
            product: productFormData.name,
            sku,
            description: productFormData.description,
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

        updateState({ inventory: [...state.inventory, newInventoryItem] })
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

    const handleImportProducts = () => {
        setShowImportModal(true)
        setImportRows([])
        setImportFileName('')
        setImportError('')
    }

    const handleProductFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) {
            return
        }

        if (!file.name.match(/\.xls(x)?$/i)) {
            setImportError('Please upload an Excel file with .xlsx or .xls extension.')
            setImportRows([])
            setImportFileName('')
            return
        }

        try {
            const rows = await parseExcelFile(file)
            if (rows.length === 0) {
                setImportError('The selected file contains no rows.')
                setImportRows([])
                setImportFileName(file.name)
                return
            }
            setImportRows(rows)
            setImportFileName(file.name)
            setImportError('')
        } catch (error) {
            setImportError('Unable to parse the Excel file. Please verify the file format.')
            setImportRows([])
            setImportFileName(file.name)
        }
    }

    const processProductImport = () => {
        const normalizedProducts = importRows
            .map((row, index) => {
                const product = String(row['product'] || row['name'] || row['item'] || row['product name'] || '').trim()
                if (!product) {
                    return null
                }
                const dept = String(row['category'] || row['dept'] || row['department'] || 'Uncategorized').trim() || 'Uncategorized'
                const unitCost = parseNumeric(row['cost price'] || row['unit cost'] || row['unitcost'] || row['cost'] || 0)
                const sellingPrice = parseNumeric(row['selling price'] || row['sellingprice'] || row['unit price'] || row['price'] || 0)
                const closing = parseNumeric(row['items in stock'] || row['closing'] || row['stock'] || row['quantity'] || row['qty'] || 0)
                const openQty = parseNumeric(row['openqty'] || row['opening qty'] || row['openingquantity'] || row['opening stock'] || closing)
                const purchased = parseNumeric(row['purchased'] || row['purchase qty'] || 0)
                const sold = parseNumeric(row['sold'] || row['sold qty'] || 0)
                const expiryDate = String(row['expiry date'] || row['expirydate'] || row['expiry'] || '').trim()
                const damagedExpired = parseNumeric(row['damaged/expired'] || row['damaged expired'] || row['damagedexpired'] || 0)
                const sku = String(row['sku'] || row['product code'] || row['item code'] || '').trim()
                const description = String(row['description'] || row['product description'] || '').trim()
                const branch = String(row['branch'] || '').trim()

                return {
                    product,
                    sku,
                    description,
                    branch,
                    dept,
                    openQty,
                    purchased,
                    sold,
                    unitCost,
                    sellingPrice,
                    closing,
                    expiryDate,
                    damagedExpired,
                }
            })
            .filter((item): item is { product: string; sku: string; description: string; branch: string; dept: string; openQty: number; purchased: number; sold: number; unitCost: number; sellingPrice: number; closing: number; expiryDate: string; damagedExpired: number } => item !== null)

        if (normalizedProducts.length === 0) {
            setImportError('No valid product rows were found in the file.')
            return
        }

        const mergedInventory = [...state.inventory]

        normalizedProducts.forEach((productItem) => {
            const existingIndex = mergedInventory.findIndex(
                (inventory) => inventory.product?.toLowerCase() === productItem.product.toLowerCase()
            )
            if (existingIndex >= 0) {
                const existing = mergedInventory[existingIndex]
                mergedInventory[existingIndex] = {
                    ...existing,
                    sku: productItem.sku || existing.sku || generateSku(productItem.product, mergedInventory.map((item) => item.sku || '')),
                    description: productItem.description || existing.description,
                    branch: productItem.branch || existing.branch,
                    dept: productItem.dept || existing.dept,
                    openQty: productItem.openQty || existing.openQty,
                    purchased: (existing.purchased || 0) + productItem.purchased,
                    sold: (existing.sold || 0) + productItem.sold,
                    unitCost: productItem.unitCost || existing.unitCost,
                    sellingPrice: productItem.sellingPrice || existing.sellingPrice || productItem.unitCost || existing.unitCost,
                    closing: productItem.closing || existing.closing,
                    expiryDate: productItem.expiryDate || existing.expiryDate,
                    damagedExpired: productItem.damagedExpired || existing.damagedExpired,
                }
            } else {
                mergedInventory.push({
                    product: productItem.product,
                    sku: productItem.sku || generateSku(productItem.product, mergedInventory.map((item) => item.sku || '')),
                    description: productItem.description,
                    branch: productItem.branch,
                    dept: productItem.dept,
                    openQty: productItem.openQty,
                    purchased: productItem.purchased,
                    sold: productItem.sold,
                    unitCost: productItem.unitCost,
                    sellingPrice: productItem.sellingPrice || productItem.unitCost,
                    closing: productItem.closing,
                    expiryDate: productItem.expiryDate,
                    damagedExpired: productItem.damagedExpired,
                })
            }
        })

        updateState({ inventory: mergedInventory })
        addAuditLog('IMPORT', 'PRODUCT', 'BULK', `Imported ${normalizedProducts.length} products from ${importFileName}`)
        setShowImportModal(false)
        setImportRows([])
        setImportFileName('')
        setImportError('')
    }

    const handleExportProducts = () => {
        downloadExcel('products.xlsx', filteredProducts)
        addAuditLog('EXPORT', 'PRODUCT', 'ALL', 'Exported products catalog.')
    }

    const handleBulkUpdate = () => {
        addAuditLog('BULK_UPDATE', 'PRODUCT', 'ALL', 'Bulk product update applied.')
        alert('Bulk update has been scheduled for the current product selection.')
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
                        <BulkImport label="Bulk upload" tableColumns={inventorySheetHeaders[selectedSheet]} />
                        <button className="product-manager-btn secondary" type="button" onClick={() => setShowProductForm(true)}>+ Add Product</button>
                        <button className="product-manager-btn secondary" type="button" onClick={handleImportProducts}>Import Products</button>
                        <button className="product-manager-btn secondary allow-readonly" type="button" onClick={handleExportProducts}>Export Products</button>
                        <button className="product-manager-btn secondary" type="button" onClick={() => setShowFilters((prev) => !prev)}>{showFilters ? 'Hide Filters' : 'Show Filters'}</button>
                        <button className="product-manager-btn primary" type="button" onClick={handleBulkUpdate}>Bulk Update</button>
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
                                <input type="number" min={0} value={productFormData.costPrice} onChange={(e) => setProductFormData({ ...productFormData, costPrice: parseFloat(e.target.value) || 0 })} />
                            </div>
                            <div className="fg">
                                <label>Selling Price</label>
                                <input type="number" min={0} value={productFormData.sellingPrice} onChange={(e) => setProductFormData({ ...productFormData, sellingPrice: parseFloat(e.target.value) || 0 })} />
                            </div>
                            <div className="fg">
                                <label>Stock</label>
                                <input type="number" min={0} value={productFormData.stock} onChange={(e) => setProductFormData({ ...productFormData, stock: parseInt(e.target.value, 10) || 0 })} />
                            </div>
                            <div className="fg">
                                <label>Expiry Date</label>
                                <input type="date" value={productFormData.expiryDate} onChange={(e) => setProductFormData({ ...productFormData, expiryDate: e.target.value })} />
                            </div>
                            <div className="fg">
                                <label>Damaged/Expired</label>
                                <input type="number" min={0} value={productFormData.damagedExpired} onChange={(e) => setProductFormData({ ...productFormData, damagedExpired: parseInt(e.target.value, 10) || 0 })} />
                            </div>
                        </div>
                        <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary" type="button" onClick={handleSaveProduct}>Save Product</button>
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
                                <select defaultValue="All Brands">
                                    <option>All Brands</option>
                                    {Array.from(new Set(products.map((product) => product.brand).filter(Boolean))).map((option) => <option key={option} value={option}>{option}</option>)}
                                </select>
                            </label>
                            <label>
                                <span>Supplier</span>
                                <select defaultValue="All Suppliers">
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
                                <span>Tax Class</span>
                                <select defaultValue="All">
                                    <option>All</option><option>VAT</option><option>Exempt</option>
                                </select>
                            </label>
                            <label>
                                <span>Stock Status</span>
                                <select defaultValue="All">
                                    <option>All</option><option>In Stock</option><option>Low Stock</option><option>Out of Stock</option>
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
            {showImportModal && (
                <div className="modal-overlay">
                    <div className="modal-card">
                        <div className="card-hd">
                            <div>
                                <div className="card-title">Import Products</div>
                                <div className="section-subtitle">Upload an Excel file to seed your product catalog and inventory.</div>
                            </div>
                            <button className="btn btn-secondary btn-sm" type="button" onClick={() => setShowImportModal(false)}>Close</button>
                        </div>
                        <div className="form-grid" style={{ gap: '16px' }}>
                            <div className="fg">
                                <label>Excel file</label>
                                <input type="file" accept=".xlsx,.xls" onChange={handleProductFileChange} />
                            </div>
                            {importFileName && <div className="import-summary">Selected file: {importFileName}</div>}
                            {importError && <div className="error-text">{importError}</div>}
                            {importRows.length > 0 && (
                                <div className="import-summary">
                                    {importRows.length} rows ready to import.
                                </div>
                            )}
                        </div>
                        <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary" type="button" disabled={importRows.length === 0} onClick={processProductImport}>Import {importRows.length} rows</button>
                            <button className="btn btn-secondary" type="button" onClick={() => setShowImportModal(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </AppLayout>
    )
}
