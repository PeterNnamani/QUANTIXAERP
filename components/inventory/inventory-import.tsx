'use client'
import {useState, type ChangeEvent} from 'react'
import {useAccounting} from '@/lib/context'
import {getSupabaseClient} from '@/lib/supabase.browser'
import {parseSpreadsheetFile} from '@/lib/import-utils'
import {prepareInventoryRows, saveInventoryRows} from '@/lib/inventory-workflows'
import Modal from '@/components/ui/modal'

export default function InventoryImport({label = 'Bulk upload'}: {label?: string}) {
    const {state, user, updateState, addAuditLog} = useAccounting()
    const [open,setOpen] = useState(false)
    const [rows,setRows] = useState<Record<string,unknown>[]>([])
    const [error,setError] = useState('')
    const [message,setMessage] = useState('')
    const [busy,setBusy] = useState(false)
    const [fileName,setFileName] = useState('')
    const read = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]; if (!file) return
        setRows([]); setError(''); setMessage(''); setBusy(true); setFileName(file.name)
        try {
            const parsed = await parseSpreadsheetFile(file)
            if (!parsed.length) throw new Error('No rows found. Put column headings on the first row.')
            prepareInventoryRows(parsed, state.inventory)
            setRows(parsed)
        } catch(error) {setError(error instanceof Error ? error.message : 'Unable to read file.')}
        finally {setBusy(false)}
    }
    const save = async () => {
        setBusy(true); setError(''); setMessage('')
        try {
            const items = prepareInventoryRows(rows, state.inventory)
            await saveInventoryRows(getSupabaseClient(), user?.companyId || '', items)
            const imported = new Map(items.map(item => [item.sku, item]))
            const merged = state.inventory.map(item => imported.get(item.sku) || item)
            const existing = new Set(state.inventory.map(item => item.sku))
            merged.push(...items.filter(item => !existing.has(item.sku)))
            updateState({inventory: merged}, {persist: false})
            addAuditLog('IMPORT','INVENTORY',fileName,`${items.length} inventory rows saved.`)
            setMessage(`${items.length} of ${rows.length} rows saved to the database.`)
            setRows([])
        } catch(error) {setError(error instanceof Error ? error.message : 'Save failed. Please retry.')}
        finally {setBusy(false)}
    }
    return <>
        <button type="button" className="btn btn-secondary" onClick={() => {setOpen(true);setRows([]);setError('');setMessage('');setFileName('')}}>{label}</button>
        <Modal open={open} title="Import inventory" onClose={() => !busy && setOpen(false)}>
            <p>Upload CSV or Excel. Each row must have Product Name. Use a unique SKU to update an existing product. Decimal quantities and prices are supported.</p>
            <p>Supported columns: SKU, Product Name, Category, Opening Stock, Stock Qty, Purchased, Sold, Unit Cost, Selling Price, Brand, Pack Size, Branch, Reorder Level, Expiry Date (YYYY-MM-DD).</p>
            <p>All rows are validated before saving. Duplicate SKUs and invalid values are reported; they are not silently skipped. Imported quantities replace existing quantities.</p>
            <input type="file" accept=".csv,.xls,.xlsx" disabled={busy} onChange={read}/>
            <p>{fileName}{rows.length ? ` — ${rows.length} valid rows ready` : ''}</p>
            {error && <div role="alert" className="staff-inline-notice error">{error}</div>}
            {message && <div role="status" className="staff-inline-notice success">{message}</div>}
            <button type="button" className="btn btn-primary" disabled={busy || !rows.length} onClick={() => void save()}>{busy ? 'Working…' : `Save ${rows.length} rows`}</button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setOpen(false)}>Close</button>
        </Modal>
    </>
}
