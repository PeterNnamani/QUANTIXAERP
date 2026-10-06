'use client'
import {useState, type ChangeEvent} from 'react'
import {FileUp} from 'lucide-react'
import {useAccounting} from '@/lib/context'
import {getSupabaseClient} from '@/lib/supabase.browser'
import {parseSpreadsheetFile} from '@/lib/import-utils'
import {mergeInventoryItems, prepareInventoryRows, saveInventoryRows} from '@/lib/inventory-workflows'
import {formatCurrency, formatNumber, triggerAppToast} from '@/lib/utils'
import Modal from '@/components/ui/modal'

export default function InventoryImport({label = 'Bulk upload', buttonClassName = 'btn btn-secondary'}: {label?: string; buttonClassName?: string}) {
    const {state, user, updateState, addAuditLog, reloadInventory} = useAccounting()
    const [open, setOpen] = useState(false)
    const [rows, setRows] = useState<Record<string, unknown>[]>([])
    const [preview, setPreview] = useState<any[]>([])
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')
    const [busy, setBusy] = useState(false)
    const [fileName, setFileName] = useState('')
    const close = () => {
        if (busy) return
        setOpen(false)
        setRows([])
        setPreview([])
        setError('')
        setMessage('')
        setFileName('')
    }
    const read = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        setRows([])
        setPreview([])
        setError('')
        setMessage('')
        setBusy(true)
        setFileName(file.name)
        try {
            const parsed = await parseSpreadsheetFile(file)
            if (!parsed.length) throw new Error('No rows found. Put column headings on the first row of every sheet.')
            const items = prepareInventoryRows(parsed, state.inventory)
            setRows(parsed)
            setPreview(items)
        } catch (readError) {
            setError(readError instanceof Error ? readError.message : 'Unable to read file.')
        } finally {
            setBusy(false)
        }
    }
    const save = async () => {
        setBusy(true)
        setError('')
        setMessage('')
        try {
            const items = prepareInventoryRows(rows, state.inventory)
            await saveInventoryRows(getSupabaseClient(), user?.companyId || '', items)
            try {
                const saved = await reloadInventory()
                if (saved.length < items.length) {
                    updateState({inventory: mergeInventoryItems(saved, items)}, {persist: false})
                }
            } catch {
                updateState({inventory: mergeInventoryItems(state.inventory, items)}, {persist: false})
            }
            addAuditLog('IMPORT', 'INVENTORY', fileName, `${items.length} inventory rows saved.`)
            triggerAppToast('Inventory imported', `${items.length} product${items.length === 1 ? '' : 's'} saved and shown in the list.`)
            setMessage(`${items.length} of ${preview.length} rows saved to the database.`)
            setRows([])
            setPreview([])
            setOpen(false)
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Save failed. Please retry.')
        } finally {
            setBusy(false)
        }
    }
    return <>
        <button type="button" className={buttonClassName} onClick={() => {setOpen(true); setRows([]); setPreview([]); setError(''); setMessage(''); setFileName('')}}>
            <FileUp size={15} /> {label}
        </button>
        <Modal open={open} title="Import inventory" onClose={close} className="inventory-import-modal">
            <div className="inventory-import-copy">
                <p>Upload CSV or Excel. Every product in the file is validated, saved, then shown in the inventory list. Decimal quantities and prices are kept.</p>
                <p>Required: Product Name. Optional: SKU, Category, Opening Stock, Stock Qty, Purchased, Sold, Unit Cost, Selling Price, Brand, Pack Size, Branch, Reorder Level, Expiry Date (YYYY-MM-DD).</p>
            </div>
            <label className="bulk-import-dropzone">Choose Excel or CSV<input type="file" accept=".csv,.xls,.xlsx" disabled={busy} onChange={(event) => void read(event)} /></label>
            {fileName && <div className="metric-note">{fileName}{preview.length ? ` — ${preview.length} product${preview.length === 1 ? '' : 's'} ready to save` : ''}</div>}
            {preview.length > 0 && (
                <div className="inventory-import-preview">
                    <table className="inventory-table">
                        <thead>
                            <tr>
                                <th>SKU</th>
                                <th>Product Name</th>
                                <th>Category</th>
                                <th>Stock Qty</th>
                                <th>Unit Cost</th>
                                <th>Selling Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            {preview.map((item) => (
                                <tr key={item.sku}>
                                    <td>{item.sku}</td>
                                    <td>{item.product}</td>
                                    <td>{item.dept || '-'}</td>
                                    <td>{formatNumber(item.closing)}</td>
                                    <td>{formatCurrency(item.unitCost)}</td>
                                    <td>{formatCurrency(item.sellingPrice ?? item.unitCost)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {error && <div role="alert" className="staff-inline-notice error">{error}</div>}
            {message && <div role="status" className="staff-inline-notice success">{message}</div>}
            <div className="inventory-import-actions">
                <button type="button" className="btn btn-primary" disabled={busy || !preview.length} onClick={() => void save()}>{busy ? 'Working…' : `Save ${preview.length} row${preview.length === 1 ? '' : 's'}`}</button>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={close}>Close</button>
            </div>
        </Modal>
    </>
}
