'use client'

import { useMemo, useState, type ChangeEvent } from 'react'
import AppLayout from '@/components/layout/app-layout'
import BulkImport from '@/components/bulk-import'
import { useAccounting } from '@/lib/context'
import { Sale } from '@/lib/context'
import { buildReceivableFromSale, mergeReceivablesFromSales } from '@/lib/receivables'
import { formatCurrency, makeID, getCurrentDate, PAYMENT_TERMS, canEdit, parseNumeric, triggerAppToast } from '@/lib/utils'
import { downloadExcel } from '@/lib/export-utils'
import { parseExcelFile, parseImportDate } from '@/lib/import-utils'

const branchOptions = ['All Branches', 'Head Office', 'Retail Outlet', 'Warehouse 01', 'Warehouse 02']
const paymentMethods = ['All Payment Methods', 'Cash', 'Transfer', 'Cheque', 'Mobile Money', 'POS', 'Credit']
const orderStatuses = ['All Order Status', 'Completed', 'Pending', 'Returned', 'Cancelled']
const categories = ['All Categories', 'Retail', 'Wholesale', 'Services', 'General']

export default function SalesPage() {
  const { state, updateState, user, addAuditLog } = useAccounting()
  const [showForm, setShowForm] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importRows, setImportRows] = useState<Record<string, unknown>[]>([])
  const [importFileName, setImportFileName] = useState('')
  const [importError, setImportError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('All')
  const [selectedBranch, setSelectedBranch] = useState('All Branches')
  const [selectedCustomer, setSelectedCustomer] = useState('All Customers')
  const [selectedSalesRep, setSelectedSalesRep] = useState('All Sales Reps')
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('All Payment Methods')
  const [selectedOrderStatus, setSelectedOrderStatus] = useState('All Order Status')
  const [selectedCategory, setSelectedCategory] = useState('All Categories')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedSaleId, setSelectedSaleId] = useState(state.sales[0]?.id ?? '')
  const [showFilters, setShowFilters] = useState(false)
  const itemsPerPage = 10
  const [showMoreMenu, setShowMoreMenu] = useState(false)

  const sales = useMemo(() => state.sales.filter((sale) => sale.status !== 'VOID'), [state.sales])

  const salesWithMetadata = useMemo(() => {
    return sales.map((sale) => {
      const branch = (sale as any).branch || 'Head Office'
      const salesRep = sale.enteredBy || 'System'
      const category = (sale.items?.[0]?.dept as string) || 'Retail'
      const paymentMethod = sale.paymentMethod || 'Transfer'
      const orderStatus = (sale as any).orderStatus || (sale.paymentStatus === 'PAID' ? 'Completed' : 'Pending')
      const paidAmount = (sale as any).amountPaid ?? (sale.paymentStatus === 'PAID' ? sale.totalAmount : 0)
      const balance = Math.max(0, sale.totalAmount - paidAmount)
      const itemCount = sale.items?.length ?? 0
      return {
        ...sale,
        branch,
        salesRep,
        category,
        paymentMethod,
        orderStatus,
        paidAmount,
        balance,
        itemCount,
      }
    })
  }, [sales])

  const uniqueCustomers = useMemo(() => ['All Customers', ...Array.from(new Set(sales.map((sale) => sale.customer)))], [sales])
  const uniqueSalesReps = useMemo(() => ['All Sales Reps', ...Array.from(new Set(sales.map((sale) => sale.enteredBy || 'System')))], [sales])
  const uniqueCategories = useMemo(() => ['All Categories', ...Array.from(new Set(salesWithMetadata.map((sale) => sale.category)))], [salesWithMetadata])

  const filteredSales = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return salesWithMetadata.filter((sale) => {
      const matchesSearch =
        !term ||
        [sale.id, sale.customer, sale.paymentMethod, sale.enteredBy, sale.notes, sale.items?.map((item) => item.product).join(' ')].join(' ').toLowerCase().includes(term)

      const matchesStatus = selectedStatus === 'All' || sale.paymentStatus === selectedStatus.toUpperCase()
      const matchesBranch = selectedBranch === 'All Branches' || sale.branch === selectedBranch
      const matchesCustomer = selectedCustomer === 'All Customers' || sale.customer === selectedCustomer
      const matchesSalesRep = selectedSalesRep === 'All Sales Reps' || sale.salesRep === selectedSalesRep
      const matchesPaymentMethod = selectedPaymentMethod === 'All Payment Methods' || sale.paymentMethod === selectedPaymentMethod
      const matchesOrderStatus = selectedOrderStatus === 'All Order Status' || sale.orderStatus === selectedOrderStatus
      const matchesCategory = selectedCategory === 'All Categories' || sale.category === selectedCategory

      return matchesSearch && matchesStatus && matchesBranch && matchesCustomer && matchesSalesRep && matchesPaymentMethod && matchesOrderStatus && matchesCategory
    })
  }, [searchTerm, selectedStatus, selectedBranch, selectedCustomer, selectedSalesRep, selectedPaymentMethod, selectedOrderStatus, selectedCategory, salesWithMetadata])

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / itemsPerPage))
  const activePage = Math.min(currentPage, totalPages)
  const paginatedSales = filteredSales.slice((activePage - 1) * itemsPerPage, activePage * itemsPerPage)

  const selectedSale = salesWithMetadata.find((sale) => sale.id === selectedSaleId) || paginatedSales[0] || salesWithMetadata[0]

  const selectedSaleSubtotal = selectedSale?.items?.reduce((sum, item) => sum + (item.total || 0), 0) ?? 0
  const selectedSalePaid = selectedSale?.paidAmount ?? (selectedSale?.paymentStatus === 'PAID' ? selectedSale?.totalAmount ?? 0 : 0)
  const selectedSaleChange = Math.max(0, selectedSalePaid - (selectedSale?.totalAmount ?? 0))
  const selectedSaleDate = selectedSale ? new Date(selectedSale.date) : null
  const receiptDate = selectedSaleDate && !Number.isNaN(selectedSaleDate.getTime())
    ? selectedSaleDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '-'
  const receiptTime = selectedSaleDate && !Number.isNaN(selectedSaleDate.getTime())
    ? selectedSaleDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : '-'

  const today = getCurrentDate()
  const todaySales = salesWithMetadata.filter((sale) => sale.date === today)
  const monthlySales = salesWithMetadata.filter((sale) => {
    const saleDate = new Date(sale.date)
    const now = new Date()
    return saleDate.getMonth() === now.getMonth() && saleDate.getFullYear() === now.getFullYear()
  })

  const metrics = {
    todaysSales: todaySales.reduce((sum, sale) => sum + sale.totalAmount, 0),
    monthlySales: monthlySales.reduce((sum, sale) => sum + sale.totalAmount, 0),
    invoices: salesWithMetadata.length,
    pendingOrders: salesWithMetadata.filter((sale) => sale.orderStatus !== 'Completed').length,
    creditSales: salesWithMetadata.filter((sale) => sale.paymentStatus === 'CREDIT').reduce((sum, sale) => sum + sale.totalAmount, 0),
    profitToday: todaySales.reduce((sum, sale) => sum + sale.totalAmount * 0.18, 0),
  }

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { product: '', dept: '', qty: 1, unitPrice: 0, total: 0 }],
    })
  }

  const [formData, setFormData] = useState({
    date: getCurrentDate(),
    customer: '',
    items: [{ product: '', dept: '', qty: 1, unitPrice: 0, total: 0 }],
    paymentMethod: 'Transfer',
    paymentAccount: '',
    paymentStatus: 'PAID',
    amountPaid: 0,
    notes: '',
  })

  const accountOptions = useMemo(() => {
    const configuredAccounts = state.bankAccounts.map((account) => account.name)
    return configuredAccounts.length > 0 ? configuredAccounts : Object.keys(state.banks)
  }, [state.bankAccounts, state.banks])
  const selectedPaymentAccount = formData.paymentAccount || (accountOptions.length === 1 ? accountOptions[0] : '')
  const isCashPayment = formData.paymentMethod === 'Cash'
  const isPaidSale = formData.paymentStatus === 'PAID'
  const isCreditSale = formData.paymentStatus === 'CREDIT'
  const isPartPayment = formData.paymentStatus === 'PART PAYMENT'
  const requiresPaymentDestination = (isPaidSale || isPartPayment) && !isCashPayment

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...formData.items]
    newItems[index] = { ...newItems[index], [field]: value }

    if (field === 'product') {
      const inventoryItem = state.inventory.find((item) => item.product.toLowerCase() === String(value).toLowerCase())
      newItems[index] = {
        ...newItems[index],
        dept: inventoryItem?.dept || '',
        unitPrice: inventoryItem?.sellingPrice ?? inventoryItem?.unitCost ?? 0,
      }
    }

    if (field === 'dept') {
      newItems[index] = { ...newItems[index], product: '', unitPrice: 0, total: 0 }
    }

    if (field !== 'dept') {
      const qty = parseFloat(newItems[index].qty as any) || 0
      const unitPrice = parseFloat(newItems[index].unitPrice as any) || 0
      newItems[index].total = qty * unitPrice
    }

    setFormData({ ...formData, items: newItems })
  }

  const handleRemoveItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    })
  }

  const handleSaveSale = async () => {
    if (formData.items.some((i) => !i.product || !i.qty || !i.unitPrice)) {
      alert('Please fill in all fields')
      return
    }
    if (requiresPaymentDestination && !selectedPaymentAccount) {
      alert('Select the account receiving this payment.')
      return
    }

    const inventoryUpdates = [...state.inventory]
    for (const item of formData.items) {
      const inventoryIndex = inventoryUpdates.findIndex((inventoryItem) => inventoryItem.product.toLowerCase() === item.product.toLowerCase())
      if (inventoryIndex < 0) {
        alert(`Product ${item.product} is not available in inventory.`)
        return
      }
      const inventoryItem = inventoryUpdates[inventoryIndex]
      if (item.qty > inventoryItem.closing) {
        alert(`Only ${inventoryItem.closing} unit(s) of ${inventoryItem.product} are available.`)
        return
      }
      inventoryUpdates[inventoryIndex] = {
        ...inventoryItem,
        sold: inventoryItem.sold + item.qty,
        closing: inventoryItem.closing - item.qty,
        lastSaleDate: formData.date,
      }
    }

    const totalAmount = formData.items.reduce((sum, item) => sum + item.total, 0)
    const amountPaid = isPaidSale ? totalAmount : isPartPayment ? Math.min(Math.max(Number(formData.amountPaid) || 0, 0), totalAmount) : 0
    if (isPartPayment && amountPaid <= 0) {
      alert('Enter a paid amount greater than zero for a part payment.')
      return
    }
    if (isPartPayment && amountPaid >= totalAmount) {
      alert('Part payment must be less than the sale total.')
      return
    }
    const deviceUsed: Sale['deviceUsed'] = /android|iphone|ipad|mobile/i.test(navigator.userAgent) ? 'Phone' : 'PC'
    const sale: Sale = {
      id: makeID('INV'),
      date: formData.date,
      customer: formData.customer,
      items: formData.items,
      totalAmount,
      paymentMethod: formData.paymentMethod,
      paymentAccount: requiresPaymentDestination ? selectedPaymentAccount : '',
      paymentStatus: formData.paymentStatus,
      amountPaid,
      balance: Math.max(0, totalAmount - amountPaid),
      notes: formData.notes,
      status: 'ACTIVE',
      enteredBy: user?.name || 'System',
      deviceUsed,
    }

    const updatedBanks = { ...state.banks }
    const destination = isCashPayment
      ? accountOptions.find((account) => account.toLowerCase().includes('cash')) || accountOptions[0] || ''
      : sale.paymentAccount
    const updatedBankAccounts = state.bankAccounts.map((account) => {
      if (!(isPaidSale || isPartPayment) || account.name !== destination) return account
      const balance = account.balance + amountPaid
      updatedBanks[account.name] = balance
      return { ...account, balance }
    })
    if ((isPaidSale || isPartPayment) && destination && updatedBankAccounts.every((account) => account.name !== destination)) {
      updatedBanks[destination] = (updatedBanks[destination] ?? 0) + amountPaid
    }
    const paymentTxn = isPaidSale || isPartPayment ? [{
      id: `TXN-${sale.id}`,
      date: sale.date,
      name: sale.customer,
      activity: `Payment received for ${sale.id}`,
      method: sale.paymentMethod,
      amount: amountPaid,
      status: 'Completed',
      description: `Payment received for sale ${sale.id}`,
      attachments: 0,
      type: 'Deposit',
      bank: destination,
    }] : []

    const nextReceivables = formData.paymentStatus === 'PAID'
      ? state.receivables
      : mergeReceivablesFromSales([sale], state.receivables)

    updateState({
      sales: [sale, ...state.sales],
      inventory: inventoryUpdates,
      banks: updatedBanks,
      bankAccounts: updatedBankAccounts,
      bankTxns: [...paymentTxn, ...state.bankTxns],
      receivables: nextReceivables,
    })
    setSelectedSaleId(sale.id)
    setCurrentPage(1)
    addAuditLog('CREATE', 'SALE', sale.id, `Sale created for ${sale.customer}: ${formatCurrency(totalAmount)}`)

    try {
      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: user?.companyId, sale }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        triggerAppToast('Sale saved', result.error || 'The sale is in the register on this device.')
      } else {
        const postedJournals = Array.isArray(result.journalEntries) ? result.journalEntries : []
        const postedLines = Array.isArray(result.journalLines) ? result.journalLines : []
        if (postedJournals.length > 0 || postedLines.length > 0) {
          updateState({
            journalEntries: [...postedJournals, ...state.journalEntries],
            journalLines: [...postedLines, ...state.journalLines],
          })
        }
      }
    } catch {
      triggerAppToast('Sale saved', 'The sale is in the register on this device.')
    }
    setShowForm(false)
    setFormData({
      date: getCurrentDate(),
      customer: '',
      items: [{ product: '', dept: '', qty: 1, unitPrice: 0, total: 0 }],
      paymentMethod: 'Transfer',
      paymentAccount: '',
      paymentStatus: 'PAID',
      amountPaid: 0,
      notes: '',
    })
  }

  const handleNewInvoice = () => {
    setShowForm(true)
    setShowMoreMenu(false)
    setFormData((prev) => ({
      ...prev,
      paymentMethod: 'Transfer',
      paymentStatus: 'CREDIT',
      notes: 'Invoice created from sales dashboard',
    }))
  }

  const handlePosSale = () => {
    setShowForm(true)
    setShowMoreMenu(false)
    setFormData((prev) => ({
      ...prev,
      paymentMethod: 'POS',
      paymentStatus: 'PAID',
      notes: 'POS sale transaction',
    }))
  }

  const handleSaleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.match(/\.xls(x)?$/i)) {
      setImportError('Please upload a valid Excel file (.xls or .xlsx).')
      setImportRows([])
      setImportFileName('')
      return
    }

    try {
      const rows = await parseExcelFile(file)
      if (rows.length === 0) {
        setImportError('The Excel file contains no rows.')
        setImportRows([])
        setImportFileName(file.name)
        return
      }
      setImportRows(rows)
      setImportFileName(file.name)
      setImportError('')
    } catch (error) {
      setImportError('Unable to parse the Excel file. Verify the format and try again.')
      setImportRows([])
      setImportFileName(file.name)
    }
  }

  const processSaleImport = () => {
    if (importRows.length === 0) {
      setImportError('No rows are ready for import.')
      return
    }

    const importedSales: Sale[] = []
    const inventoryUpdates = [...state.inventory]
    const importErrors: string[] = []

    importRows.forEach((row) => {
      const customer = String(row['customer'] || row['client'] || row['customer name'] || 'Walk-in Customer').trim()
      const paymentMethod = String(row['payment method'] || row['paymentmethod'] || row['method'] || 'Transfer').trim() || 'Transfer'
      const paymentStatus = String(row['payment status'] || row['paymentstatus'] || row['status'] || 'PAID').trim().toUpperCase() as 'PAID' | 'CREDIT' | 'PART PAYMENT' | 'OVERDUE'
      const date = parseImportDate(row['sale date'] || row['date'])
      const notes = String(row['notes'] || row['memo'] || row['description'] || '').trim()
      const branch = String(row['branch'] || row['location'] || 'Head Office').trim() || 'Head Office'
      const salesRep = String(row['sales rep'] || row['salesrep'] || row['entered by'] || user?.name || 'System').trim()
      const deviceUsed: Sale['deviceUsed'] = /android|iphone|ipad|mobile/i.test(navigator.userAgent) ? 'Phone' : 'PC'

      const itemProduct = String(row['product'] || row['item'] || row['description'] || '').trim()
      const requestedDept = String(row['category'] || row['dept'] || row['department'] || '').trim()
      const qty = Math.max(0, parseNumeric(row['quantity'] || row['qty'] || row['units'] || 1))
      const inventoryIndex = inventoryUpdates.findIndex((item) => item.product?.toLowerCase() === itemProduct.toLowerCase())
      const inventoryItem = inventoryIndex >= 0 ? inventoryUpdates[inventoryIndex] : undefined
      if (!inventoryItem) {
        importErrors.push(`${itemProduct || 'Blank product'} is not in inventory`)
        return
      }
      if (qty > inventoryItem.closing) {
        importErrors.push(`${inventoryItem.product} has only ${inventoryItem.closing} unit(s) available`)
        return
      }
      const itemDept = inventoryItem.dept || requestedDept || 'General'
      const importedUnitPrice = parseNumeric(row['unit price'] || row['unitprice'] || row['price'] || 0)
      const unitPrice = Math.max(0, importedUnitPrice || inventoryItem.sellingPrice || inventoryItem.unitCost || 0)
      const subtotal = qty * unitPrice
      const totalAmount = subtotal
      const sale: Sale = {
        id: makeID('INV'),
        date,
        customer,
        items: [{ product: itemProduct, dept: itemDept, qty, unitPrice, total: subtotal }],
        totalAmount,
        paymentMethod,
        paymentStatus,
        notes,
        status: paymentStatus === 'CREDIT' || paymentStatus === 'OVERDUE' ? 'PENDING' : 'ACTIVE',
        enteredBy: salesRep,
        deviceUsed,
      }

      importedSales.push(sale)

      inventoryUpdates[inventoryIndex] = {
        ...inventoryItem,
        sold: inventoryItem.sold + qty,
        closing: inventoryItem.closing - qty,
        lastSaleDate: date,
      }
    })

    if (importErrors.length > 0) {
      setImportError(importErrors.join('. '))
      return
    }

    const receivablesFromImports = mergeReceivablesFromSales(importedSales, state.receivables)
    updateState({
      sales: [...state.sales, ...importedSales],
      inventory: inventoryUpdates,
      receivables: receivablesFromImports,
    })
    addAuditLog('IMPORT', 'SALE', 'BULK', `Imported ${importedSales.length} sales rows from ${importFileName}`)
    setShowImportModal(false)
    setImportRows([])
    setImportFileName('')
    setImportError('')
  }

  const handleExportSales = () => {
    downloadExcel('sales-report.xlsx', salesWithMetadata)
    addAuditLog('EXPORT', 'SALE', 'ALL', 'Sales report exported.')
  }

  const handlePrintSales = () => {
    if (typeof window !== 'undefined') {
      addAuditLog('PRINT', 'SALE', 'ALL', 'Sales report printed.')
      window.print()
    }
  }

  const handlePrintInvoice = () => {
    if (typeof window !== 'undefined' && selectedSale) {
      addAuditLog('PRINT', 'SALE', selectedSale.id, `Invoice printed for ${selectedSale.customer}`)
      window.print()
    }
  }

  const handleViewSale = (saleId: string) => {
    setSelectedSaleId(saleId)
    setShowForm(false)
    setShowMoreMenu(false)
  }

  const handleMoreSaleAction = () => {
    setShowMoreMenu(false)
    alert('More sales actions are available in future releases.')
  }

  const handleVoidSale = (saleId: string) => {
    if (!window.confirm(`Delete sale ${saleId}? It will remain recoverable for 30 days.`)) return
    const purgeAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const updatedSales = state.sales.map((sale) => (sale.id === saleId ? { ...sale, status: 'VOID', deletedAt: new Date().toISOString(), purgeAfter } : sale))
    updateState({ sales: updatedSales })
    addAuditLog('DELETE', 'SALE', saleId, `Sale ${saleId} was deleted and retained until ${purgeAfter}.`)
  }

  return (
    <AppLayout>
      <div className="module-shell">
        {showImportModal && (
          <div className="modal-overlay">
            <div className="modal-card">
              <div className="card-hd">
                <div>
                  <div className="card-title">Import Sales</div>
                  <div className="section-subtitle">Upload an Excel file to import historic sales data.</div>
                </div>
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => setShowImportModal(false)}>Close</button>
              </div>
              <div className="form-grid" style={{ gap: '16px' }}>
                <div className="fg">
                  <label>Excel file</label>
                  <input type="file" accept=".xlsx,.xls" onChange={handleSaleFileChange} />
                </div>
                {importFileName && <div className="import-summary">Selected file: {importFileName}</div>}
                {importError && <div className="error-text">{importError}</div>}
                {importRows.length > 0 && <div className="import-summary">{importRows.length} sales rows ready to import.</div>}
              </div>
              <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" type="button" disabled={importRows.length === 0} onClick={processSaleImport}>Import {importRows.length} rows</button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowImportModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {showForm && (
          <div className="card" style={{ position: 'relative', zIndex: 2 }}>
            <div className="card-hd">
              <div className="card-title">Record New Sale</div>
            </div>
            <div className="form-grid">
              <div className="fg">
                <label>Date *</label>
                <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} placeholder="Select date" />
              </div>
              <div className="fg">
                <label>Customer</label>
                <input type="text" value={formData.customer} onChange={(e) => setFormData({ ...formData, customer: e.target.value })} placeholder="Enter customer name (optional)" />
              </div>
              {!isCreditSale && (
                <div className="fg">
                  <label>Payment Method *</label>
                  <select value={formData.paymentMethod} onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}>
                    <option value="" disabled>Select payment method</option>
                    {PAYMENT_TERMS.map((term) => (
                      <option key={term} value={term}>{term}</option>
                    ))}
                  </select>
                </div>
              )}
              {requiresPaymentDestination && (
                <div className="fg">
                  <label>Payment Destination *</label>
                  {accountOptions.length === 0 ? (
                    <div className="field-hint">Create a bank account in Settings before recording this payment.</div>
                  ) : (
                    <select value={selectedPaymentAccount} onChange={(e) => setFormData({ ...formData, paymentAccount: e.target.value })} disabled={accountOptions.length === 1}>
                      <option value="" disabled>Select receiving account</option>
                      {accountOptions.map((account) => <option key={account} value={account}>{account}</option>)}
                    </select>
                  )}
                </div>
              )}
              <div className="fg">
                <label>Payment Status *</label>
                <select value={formData.paymentStatus} onChange={(e) => setFormData({ ...formData, paymentStatus: e.target.value })}>
                  <option value="" disabled>Select payment status</option>
                  <option value="PAID">PAID</option>
                  <option value="PART PAYMENT">PART PAYMENT</option>
                  <option value="CREDIT">CREDIT</option>
                </select>
              </div>
              {isPartPayment && (
                <>
                  <div className="fg">
                    <label>Paid Amount *</label>
                    <input type="number" min={0} max={formData.items.reduce((sum, item) => sum + item.total, 0)} value={formData.amountPaid} onChange={(e) => setFormData({ ...formData, amountPaid: parseFloat(e.target.value) || 0 })} placeholder="Enter paid amount" />
                  </div>
                  <div className="fg">
                    <label>Balance</label>
                    <input type="number" readOnly value={Math.max(0, formData.items.reduce((sum, item) => sum + item.total, 0) - (Number(formData.amountPaid) || 0))} aria-label="Balance" />
                  </div>
                </>
              )}
            </div>

            <div className="form-grid" style={{ gridTemplateColumns: '1fr', marginTop: 8 }}>
              <div className="fg">
                <label>Items</label>
                {formData.items.map((item, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '8px', marginBottom: '10px' }}>
                    <select value={item.dept} onChange={(e) => handleItemChange(idx, 'dept', e.target.value)}>
                      <option value="">Select category</option>
                      {Array.from(new Set(state.inventory.map((inventoryItem) => inventoryItem.dept))).map((dept) => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                    <select value={item.product} onChange={(e) => handleItemChange(idx, 'product', e.target.value)}>
                      <option value="">Select product</option>
                      {state.inventory.filter((inventoryItem) => !item.dept || inventoryItem.dept === item.dept).map((inventoryItem) => (
                        <option key={inventoryItem.sku || inventoryItem.product} value={inventoryItem.product} disabled={inventoryItem.closing <= 0}>{inventoryItem.product} ({inventoryItem.closing} available)</option>
                      ))}
                    </select>
                    <input type="number" min={1} value={item.qty} onChange={(e) => handleItemChange(idx, 'qty', parseInt(e.target.value, 10) || 0)} placeholder="Qty" />
                    <input type="number" min={0} value={item.unitPrice} onChange={(e) => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)} placeholder="Selling price" aria-label="Selling price" />
                    <button className="btn btn-sm btn-danger" type="button" onClick={() => handleRemoveItem(idx)}>?</button>
                  </div>
                ))}
                <button className="btn btn-sm" type="button" onClick={handleAddItem}>+ Add Item</button>
              </div>
            </div>

            <div className="fg">
              <label>Notes</label>
              <input type="text" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Add notes (optional)" />
            </div>

            <div className="btn-group">
              <button className="btn btn-primary" type="button" onClick={handleSaveSale}>Save Sale</button>
              <button className="btn btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="module-header">
          <div>
            <div className="module-title">Sales</div>
            <div className="module-subtitle">Create invoices, manage customer orders, monitor revenue, and track sales performance.</div>
          </div>
          <div className="module-actions">
            <BulkImport label="Bulk upload" tableColumns={['Invoice', 'Customer', 'Date', 'Items', 'Total', 'Paid', 'Balance', 'Status', 'Order', 'Sales Rep', 'Actions']} />
            <button className="btn btn-primary" type="button" onClick={() => setShowForm((prev) => !prev)}>{showForm ? 'Close' : '+ New Sale'}</button>
            <button className="btn btn-secondary" type="button" onClick={() => setShowImportModal(true)}>Import</button>
            <button className="btn btn-secondary" type="button" onClick={handleNewInvoice}>+ New Invoice</button>
            <button className="btn btn-secondary" type="button" onClick={handlePosSale}>+ POS Sale</button>
            <button className="btn btn-secondary allow-readonly" type="button" onClick={handleExportSales}>Export</button>
            <button className="btn btn-secondary" type="button" onClick={handlePrintSales}>Print</button>
            <button className="btn btn-secondary" type="button" onClick={handleMoreSaleAction}>More ▾</button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              aria-label={showFilters ? 'Hide filters' : 'Show filters'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <span aria-hidden="true">🔍</span>
              <span>{showFilters ? 'Hide Filters' : 'Filters'}</span>
            </button>
          </div>
        </div>

        <div className="dashboard-card-grid">
          <div className="dashboard-card">
            <div className="metric-label">Today's Sales</div>
            <div className="metric-value">{formatCurrency(metrics.todaysSales)}</div>
          </div>
          <div className="dashboard-card">
            <div className="metric-label">Monthly Sales</div>
            <div className="metric-value">{formatCurrency(metrics.monthlySales)}</div>
          </div>
          <div className="dashboard-card">
            <div className="metric-label">Invoices</div>
            <div className="metric-value">{metrics.invoices}</div>
          </div>
          <div className="dashboard-card">
            <div className="metric-label">Pending Orders</div>
            <div className="metric-value">{metrics.pendingOrders}</div>
          </div>
          <div className="dashboard-card">
            <div className="metric-label">Credit Sales</div>
            <div className="metric-value">{formatCurrency(metrics.creditSales)}</div>
          </div>
          <div className="dashboard-card">
            <div className="metric-label">Profit Today</div>
            <div className="metric-value">{formatCurrency(metrics.profitToday)}</div>
          </div>
        </div>

        {showFilters && (
          <div className="filter-panel">
            <div className="section-head">
              <div>
                <div className="card-title">Search & Filters</div>
                <div className="section-subtitle">Search invoices, customers, products, receipts, and sales reps.</div>
              </div>
            </div>
            <div className="filter-row">
              <label>
                Search
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setCurrentPage(1)
                  }}
                  placeholder="Invoice, customer, product, sales rep, receipt..."
                />
              </label>
              <label>
                Status
                <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
                  <option>All</option>
                  <option>Paid</option>
                  <option>Credit</option>
                </select>
              </label>
              <label>
                Branch
                <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
                  {branchOptions.map((branch) => (<option key={branch}>{branch}</option>))}
                </select>
              </label>
              <label>
                Customer
                <select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)}>
                  {uniqueCustomers.map((customer) => (<option key={customer}>{customer}</option>))}
                </select>
              </label>
              <label>
                Salesperson
                <select value={selectedSalesRep} onChange={(e) => setSelectedSalesRep(e.target.value)}>
                  {uniqueSalesReps.map((rep) => (<option key={rep}>{rep}</option>))}
                </select>
              </label>
              <label>
                Payment Method
                <select value={selectedPaymentMethod} onChange={(e) => setSelectedPaymentMethod(e.target.value)}>
                  {paymentMethods.map((payment) => (<option key={payment}>{payment}</option>))}
                </select>
              </label>
              <label>
                Order Status
                <select value={selectedOrderStatus} onChange={(e) => setSelectedOrderStatus(e.target.value)}>
                  {orderStatuses.map((status) => (<option key={status}>{status}</option>))}
                </select>
              </label>
              <label>
                Category
                <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                  {uniqueCategories.map((category) => (<option key={category}>{category}</option>))}
                </select>
              </label>
            </div>
          </div>
        )}

        <div className="module-content-grid">
          <div>
            <div className="card">
              <div className="card-hd">
                <div className="card-title">Sales Ledger</div>
                <div className="table-summary">Showing {filteredSales.length} invoice{filteredSales.length === 1 ? '' : 's'}</div>
              </div>
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Customer</th>
                      <th>Date</th>
                      <th>Items</th>
                      <th>Total</th>
                      <th>Paid</th>
                      <th>Balance</th>
                      <th>Status</th>
                      <th>Order</th>
                      <th>Sales Rep</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedSales.length === 0 ? (
                      <tr>
                        <td colSpan={11} style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
                          No sales match your filters.
                        </td>
                      </tr>
                    ) : (
                      paginatedSales.map((sale) => (
                        <tr key={sale.id} onClick={() => setSelectedSaleId(sale.id)} className={selectedSaleId === sale.id ? 'selected' : ''}>
                          <td>{sale.id}</td>
                          <td>{sale.customer}</td>
                          <td>{sale.date}</td>
                          <td>{sale.itemCount}</td>
                          <td>{formatCurrency(sale.totalAmount)}</td>
                          <td>{formatCurrency(sale.paidAmount)}</td>
                          <td>{formatCurrency(sale.balance)}</td>
                          <td><span className={`badge ${sale.paymentStatus === 'PAID' ? 'b-green' : 'b-amber'}`}>{sale.paymentStatus}</span></td>
                          <td>{sale.orderStatus}</td>
                          <td>{sale.salesRep}</td>
                          <td><button className="btn btn-sm btn-secondary" type="button" onClick={(event) => { event.stopPropagation(); handleViewSale(sale.id) }}>View</button><button className="btn btn-sm btn-danger" type="button" onClick={(event) => { event.stopPropagation(); handleVoidSale(sale.id) }}>Delete</button></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="txn-footer" style={{ justifyContent: 'center' }}>
                  <button className="btn btn-sm btn-secondary" type="button" onClick={() => setCurrentPage(Math.max(1, activePage - 1))} disabled={activePage === 1}>‹</button>
                  <span className="page-info">Page {activePage} of {totalPages}</span>
                  <button className="btn btn-sm btn-secondary" type="button" onClick={() => setCurrentPage(Math.min(totalPages, activePage + 1))} disabled={activePage === totalPages}>›</button>
                </div>
              )}
            </div>
          </div>

          <div className="detail-panel invoice-document">
            <button className="btn btn-primary invoice-print-button" type="button" onClick={handlePrintInvoice}>Print invoice</button>
            <div className="receipt-header">
              <strong>{state.companySettings.companyName || 'COMPANY NAME'}</strong>
              <span>{state.companySettings.country}{state.companySettings.registrationNumber ? ` | RC ${state.companySettings.registrationNumber}` : ''}</span>
              <span>{state.companySettings.tin ? `TIN: ${state.companySettings.tin}` : 'Official sales receipt'}</span>
              <span>Email: {user?.email || ''}</span>
            </div>
            <div className="receipt-rule" />
            <h2>SALES RECEIPT</h2>
            <div className="receipt-rule" />
            <div className="receipt-meta">
              <div><span>Receipt No:</span><strong>{selectedSale?.id || '-'}</strong></div>
              <div><span>Date:</span><strong>{receiptDate} {receiptTime}</strong></div>
              <div><span>Sales Rep:</span><strong>{selectedSale?.salesRep || '-'}</strong></div>
              <div><span>Customer:</span><strong>{selectedSale?.customer || 'Walk-in Customer'}</strong></div>
            </div>
            <div className="receipt-rule" />
            <table className="receipt-items">
              <thead><tr><th>ITEM</th><th>QTY</th><th>PRICE</th><th>TOTAL</th></tr></thead>
              <tbody>{selectedSale?.items?.map((item, idx) => <tr key={`${selectedSale.id}-item-${idx}`}><td>{item.product || '-'}</td><td>{item.qty}</td><td>{formatCurrency(item.unitPrice)}</td><td>{formatCurrency(item.total)}</td></tr>)}</tbody>
            </table>
            <div className="receipt-rule" />
            <div className="receipt-totals">
              <div><span>SUBTOTAL</span><strong>{formatCurrency(selectedSaleSubtotal)}</strong></div>
              <div><span>DISCOUNT</span><strong>{formatCurrency(0)}</strong></div>
              <div><span>VAT</span><strong>{formatCurrency(0)}</strong></div>
              <div><span>TOTAL</span><strong>{formatCurrency(selectedSale?.totalAmount ?? 0)}</strong></div>
            </div>
            <div className="receipt-payment">
              <div><span>PAYMENT METHOD:</span><strong>{selectedSale?.paymentMethod || '-'}</strong></div>
              <div><span>AMOUNT PAID:</span><strong>{formatCurrency(selectedSalePaid)}</strong></div>
              <div><span>CHANGE:</span><strong>{formatCurrency(selectedSaleChange)}</strong></div>
            </div>
            <div className="receipt-rule" />
            <div className="receipt-thanks"><strong>THANK YOU FOR YOUR<br />PURCHASE!</strong><span>Please keep this receipt for<br />returns/exchanges.</span></div>
            <div className="receipt-rule" />
            <div className="receipt-footer">{state.companySettings.companyName || ''}</div>
          </div>
        </div>

        <div className="dashboard-card-grid">
          <div className="chart-card">
            <div className="chart-card-title">Daily Sales Trend</div>
            <div className="chart-placeholder">Chart placeholder</div>
          </div>
          <div className="chart-card">
            <div className="chart-card-title">Monthly Revenue</div>
            <div className="chart-placeholder">Chart placeholder</div>
          </div>
          <div className="chart-card">
            <div className="chart-card-title">Sales by Category</div>
            <div className="chart-placeholder">Chart placeholder</div>
          </div>
          <div className="chart-card">
            <div className="chart-card-title">Top Selling Products</div>
            <div className="chart-placeholder">Chart placeholder</div>
          </div>
        </div>

        <div className="reports-row">
          <button className="btn btn-secondary">Sales Summary</button>
          <button className="btn btn-secondary">Sales by Customer</button>
          <button className="btn btn-secondary">Sales by Product</button>
          <button className="btn btn-secondary">Sales by Branch</button>
          <button className="btn btn-secondary">Profit Report</button>
          <button className="btn btn-secondary">Tax Report</button>
          <button className="btn btn-secondary">POS Report</button>
        </div>
      </div>
    </AppLayout>
  )
}
