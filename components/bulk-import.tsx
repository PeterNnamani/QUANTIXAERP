'use client'

import { useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { FileUp, ListOrdered, X } from 'lucide-react'
import { useAccounting } from '@/lib/context'
import { parseSpreadsheetFile, prepareGenericImportPayload, type ImportSummary } from '@/lib/import-utils'

export default function BulkImport({ label = 'Bulk upload', tableColumns, onImportComplete }: { label?: string; tableColumns: string[]; onImportComplete?: () => void }) {
    const { state, updateState, user, addAuditLog } = useAccounting()
    const [open, setOpen] = useState(false)
    const [fileName, setFileName] = useState('')
    const [rows, setRows] = useState<Record<string, unknown>[]>([])
    const [error, setError] = useState('')
    const [summary, setSummary] = useState<ImportSummary | null>(null)
    const [busy, setBusy] = useState(false)
    const [progress, setProgress] = useState<number | null>(null)
    const [savedCount, setSavedCount] = useState(0)
    const progressTimer = useRef<number | null>(null)

    const close = () => {
        if (busy) return
        setOpen(false)
        setRows([])
        setFileName('')
        setError('')
        setSummary(null)
        setProgress(null)
        setSavedCount(0)
    }

    const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return
        setError('')
        setFileName(file.name)
        if (!/\.(csv|xls|xlsx|docx)$/i.test(file.name)) {
            setError('Use a CSV, Excel, or Word document (.docx).')
            setRows([])
            return
        }
        try {
            const parsedRows = await parseSpreadsheetFile(file)
            if (!parsedRows.length) throw new Error('No tabular rows were found. Put column headings on the first row.')
            setRows(parsedRows)
        } catch (parseError) {
            setRows([])
            setError(parseError instanceof Error ? parseError.message : 'Unable to read this file.')
        }
    }

    const upload = async () => {
        if (!rows.length || !user?.companyId) {
            setError('Select a file and sign in to a company before uploading.')
            return
        }
        setBusy(true)
        setError('')
        setProgress(0)
        setSavedCount(0)
        try {
            const progressStartedAt = Date.now()
            const prepared = prepareGenericImportPayload(rows)
            setSummary(prepared.summary)
            const totalRecords = prepared.summary.sales + prepared.summary.purchases + prepared.summary.expenses + prepared.summary.products + prepared.summary.staff + prepared.summary.contacts
            let simulatedSavedCount = 0
            progressTimer.current = window.setInterval(() => {
                simulatedSavedCount = Math.min(Math.max(0, totalRecords - 1), simulatedSavedCount + 1)
                setSavedCount(simulatedSavedCount)
                setProgress(totalRecords > 0 ? Math.round((simulatedSavedCount / totalRecords) * 100) : 0)
            }, 180)
            const result = await new Promise<any>((resolve, reject) => {
                const request = new XMLHttpRequest()
                request.open('POST', '/api/import')
                request.setRequestHeader('Content-Type', 'application/json')
                request.upload.onprogress = (event) => {
                    if (event.lengthComputable) setProgress((current) => Math.max(current || 0, Math.min(70, Math.round((event.loaded / event.total) * 70))))
                }
                request.onload = () => {
                    if (request.status < 200 || request.status >= 300) {
                        reject(new Error(request.responseText || `Upload failed with status ${request.status}`))
                        return
                    }
                    try {
                        resolve(JSON.parse(request.responseText))
                    } catch {
                        reject(new Error('Invalid server response'))
                    }
                }
                request.onerror = () => reject(new Error('Network error during upload.'))
                request.send(JSON.stringify({ ...prepared.payload, companyId: user.companyId, staffId: user.staffId }))
            })
            if (!result.success) throw new Error(result.error || 'The database rejected this import.')
            const remainingDisplayTime = Math.max(0, 2200 - (Date.now() - progressStartedAt))
            if (remainingDisplayTime > 0) await new Promise((resolve) => window.setTimeout(resolve, remainingDisplayTime))

            const importedExpenses = prepared.payload.expenses.map((expense: any) => ({
                id: String(expense.id), date: String(expense.date), desc: String(expense.description), category: String(expense.category), amount: Number(expense.amount || 0), bank: String(expense.bank || ''), status: String(expense.status || 'Pending Approval'), enteredBy: user.name, notes: String(expense.notes || ''),
            }))
            const importedStaff = prepared.payload.staff.map((staff: any) => ({
                id: String(staff.id), name: String(staff.name), staffId: String(staff.staffId || ''), pin: String(staff.pin || ''), roleId: String(staff.roleId || 'staff'), roleName: String(staff.roleName || 'Staff'), permissions: staff.permissions || ['dashboard'], dataScope: 'team' as const, status: staff.status === 'disabled' ? 'disabled' as const : 'active' as const, createdAt: String(staff.createdAt), username: String(staff.username || ''), email: String(staff.email || ''), phone: String(staff.phone || ''), branch: String(staff.branch || ''), department: String(staff.department || ''), position: String(staff.position || ''),
            }))
            const nextInventory = [...state.inventory]
            const findInventoryIndex = (product: any) => {
                const sku = String(product.sku || '').trim().toLowerCase()
                const name = String(product.name || product.product || product.item || '').trim().toLowerCase()
                return nextInventory.findIndex((item) => (sku && item.sku?.toLowerCase() === sku) || (name && item.product.toLowerCase() === name))
            }

            prepared.payload.products.forEach((product: any) => {
                const productIndex = findInventoryIndex(product)
                const inventoryProduct = { product: String(product.name || product.product), sku: String(product.sku || ''), description: String(product.description || ''), branch: String(product.branch || ''), dept: String(product.category || 'General'), openQty: Number(product.stock_qty ?? product.openQty ?? 0), purchased: Number(product.purchased || 0), sold: Number(product.sold || 0), unitCost: Number(product.unit_cost ?? product.unitCost ?? 0), sellingPrice: Number(product.unit_price ?? product.sellingPrice ?? 0), closing: Number(product.stock_qty ?? product.openQty ?? product.closing ?? 0) }
                if (productIndex >= 0) {
                    nextInventory[productIndex] = { ...nextInventory[productIndex], ...inventoryProduct }
                } else {
                    nextInventory.push(inventoryProduct)
                }
            })

            const applyStockMovement = (transactions: any[], movement: 'purchased' | 'sold') => {
                transactions.forEach((transaction) => {
                    const item = transaction.items?.[0]
                    if (!item) return
                    const productIndex = findInventoryIndex({ name: item.product, sku: item.sku })
                    if (productIndex < 0) return
                    const quantity = Math.max(0, Number(item.qty || item.quantity || 0))
                    const current = nextInventory[productIndex]
                    nextInventory[productIndex] = {
                        ...current,
                        [movement]: (current[movement] || 0) + quantity,
                        closing: Math.max(0, (current.closing || 0) + (movement === 'purchased' ? quantity : -quantity)),
                    }
                })
            }

            applyStockMovement(prepared.payload.purchases, 'purchased')
            applyStockMovement(prepared.payload.sales, 'sold')
            const importedCustomers = prepared.payload.contacts.filter((contact: any) => contact.type === 'customer').map((contact: any) => String(contact.name))
            const importedSuppliers = prepared.payload.contacts.filter((contact: any) => contact.type === 'supplier' || contact.type === 'vendor').map((contact: any) => String(contact.name))
            const updates: Record<string, unknown> = { inventory: nextInventory }
            if (prepared.payload.sales.length > 0) updates.sales = [...state.sales, ...prepared.payload.sales]
            if (prepared.payload.purchases.length > 0) updates.purchases = [...state.purchases, ...prepared.payload.purchases]
            if (importedExpenses.length > 0) updates.expenses = [...state.expenses, ...importedExpenses]
            if (importedStaff.length > 0) updates.staffMembers = [...state.staffMembers, ...importedStaff]
            if (importedCustomers.length > 0) updates.customerList = Array.from(new Set([...state.customerList, ...importedCustomers]))
            if (importedSuppliers.length > 0) updates.supplierList = Array.from(new Set([...state.supplierList, ...importedSuppliers]))
            updateState(updates, { persist: false })
            addAuditLog('IMPORT', 'BULK', fileName, `Imported ${prepared.summary.sales} sales, ${prepared.summary.purchases} purchases, ${prepared.summary.expenses} expenses, ${prepared.summary.products} products, ${prepared.summary.staff} staff, and ${prepared.summary.contacts} contacts.`)
            if (progressTimer.current !== null) window.clearInterval(progressTimer.current)
            progressTimer.current = null
            setSavedCount(Number(result.counts?.total || totalRecords))
            setProgress(100)
            onImportComplete?.()
            window.setTimeout(() => {
                setProgress(null)
                setOpen(false)
                setRows([])
                setFileName('')
                setSummary(null)
                setSavedCount(0)
            }, 450)
        } catch (uploadError) {
            if (progressTimer.current !== null) window.clearInterval(progressTimer.current)
            progressTimer.current = null
            setError(uploadError instanceof Error ? uploadError.message : 'Import failed.')
            setProgress(null)
        } finally {
            if (progressTimer.current !== null) window.clearInterval(progressTimer.current)
            progressTimer.current = null
            setBusy(false)
        }
    }

    return <>
        <button className="btn btn-secondary" type="button" onClick={() => setOpen(true)}><FileUp size={15} /> {label}</button>
        {open && progress === null && <div className="bulk-import-backdrop" role="dialog" aria-modal="true" aria-label="Bulk upload">
            <section className="bulk-import-modal">
                <div className="card-hd"><div><div className="card-title">Intelligent bulk upload</div><div className="section-subtitle">Upload a file with headings. QUANTIXA identifies sales, expenses, staff, inventory, purchases, and contacts, then saves each row to the matching database table.</div></div><button className="icon-button" type="button" onClick={close} aria-label="Close"><X size={18} /></button></div>
                <div className="bulk-import-guide" role="note">
                    <div className="bulk-import-guide-heading"><ListOrdered size={16} /><strong>Table column order</strong><span>Match the page table</span></div>
                    <ol className="bulk-import-order">
                        {tableColumns.map((column) => <li key={column}>{column}</li>)}
                    </ol>
                    <p>Use the page table column headings in this order and place them in the first row.</p>
                </div>
                <label className="bulk-import-dropzone">Choose Excel, CSV, or Word table<input type="file" accept=".csv,.xls,.xlsx,.docx" onChange={handleFile} /></label>
                {fileName && <div className="metric-note">{fileName} · {rows.length} row{rows.length === 1 ? '' : 's'} detected</div>}
                {error && <div className="staff-inline-notice error">{error}</div>}
                {summary && !error && <div className="bulk-import-summary">Detected: {summary.sales} sales · {summary.purchases} purchases · {summary.expenses} expenses · {summary.products} products · {summary.staff} staff · {summary.contacts} contacts</div>}
                <div className="btn-group"><button className="btn btn-secondary" type="button" onClick={close} disabled={busy}>Cancel</button><button className="btn btn-primary" type="button" disabled={!rows.length || busy} onClick={() => void upload()}>{busy ? 'Saving...' : 'Analyze and save'}</button></div>
            </section>
        </div>}
        {open && progress !== null && <div className="bulk-import-progress-overlay" role="status" aria-live="polite" aria-label={`Import progress ${progress}%`}>
            <div className="bulk-import-progress">
                <div className="bulk-import-progress-ring" style={{ '--progress': `${progress}%` } as CSSProperties}><span>{progress}%</span></div>
                <strong>{progress === 100 ? 'Import complete' : 'Saving imported records'}</strong>
                <span>{savedCount} of {summary ? summary.sales + summary.purchases + summary.expenses + summary.products + summary.staff + summary.contacts : 0} records saved</span>
                <span>{fileName}</span>
            </div>
        </div>}
    </>
}
