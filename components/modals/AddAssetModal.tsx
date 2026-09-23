import { useMemo, useState } from 'react'
import Modal from '@/components/ui/modal'
import { makeID, getCurrentDate } from '@/lib/utils'

type AssetInput = {
    id: string
    date: string
    dept: string
    product: string
    qty: number
    unitPrice: number
    transCost: number
    discount: number
    total: number
    supplier: string
    bank: string
    paymentStatus: string
    dueDate: string
    notes: string
    status: string
    enteredBy: string
    category: string
    paymentMethod: string
    amountPaid: number
    balance: number
}

export default function AddAssetModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (asset: AssetInput) => void }) {
    const [name, setName] = useState('')
    const [category, setCategory] = useState('Assets')
    const [supplier, setSupplier] = useState('')
    const [cost, setCost] = useState(0)
    const [date, setDate] = useState(getCurrentDate())
    const [paymentMethod, setPaymentMethod] = useState('Cash')
    const [residualValue, setResidualValue] = useState(0)

    const bookValue = useMemo(() => Math.max(0, Number(cost) || 0) - Math.max(0, Number(residualValue) || 0), [cost, residualValue])
    const canCreate = Boolean(name.trim() && date && Number(cost) > 0 && Number(residualValue) >= 0 && Number(residualValue) <= Number(cost))

    const handleCreate = () => {
        if (!canCreate) return
        const total = Math.max(0, Number(cost) || 0)
        onCreate({
            id: makeID('AST'), date, dept: category, product: name.trim(), qty: 1, unitPrice: total,
            transCost: 0, discount: 0, total, supplier: supplier.trim() || 'Asset Supplier', bank: paymentMethod,
            paymentStatus: 'PAID', dueDate: date, notes: 'Fixed asset addition', status: 'Completed', enteredBy: 'System',
            category, paymentMethod, amountPaid: total, balance: 0,
        })
        setName('')
        setSupplier('')
        setCost(0)
        setResidualValue(0)
        onClose()
    }

    return (
        <Modal open={open} onClose={onClose} title="Add fixed asset" className="asset-entry-modal" footer={<>
            <button type="button" onClick={onClose} className="btn">Cancel</button>
            <button type="button" onClick={handleCreate} className="btn btn-primary" disabled={!canCreate}>Add asset</button>
        </>}>
            <div className="asset-entry-form">
                <div className="asset-entry-intro">
                    <div>
                        <span className="asset-entry-kicker">Asset register</span>
                        <h3>Capture the acquisition details</h3>
                        <p>These details are saved to the asset register and linked to the purchase record.</p>
                    </div>
                    <div className="asset-entry-total"><span>Book value</span><strong>{bookValue.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</strong></div>
                </div>
                <div className="asset-entry-grid">
                    <label className="asset-entry-field asset-entry-wide">Asset name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Dell Latitude 7440" /></label>
                    <label className="asset-entry-field">Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Assets</option><option>Furniture</option><option>Electronics</option></select></label>
                    <label className="asset-entry-field">Supplier<input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Optional" /></label>
                    <label className="asset-entry-field">Purchase date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
                    <label className="asset-entry-field">Cost<input type="number" min="0" step="0.01" value={cost} onChange={(event) => setCost(Number(event.target.value))} /></label>
                    <label className="asset-entry-field">Residual value<input type="number" min="0" step="0.01" value={residualValue} onChange={(event) => setResidualValue(Number(event.target.value))} /></label>
                    <label className="asset-entry-field">Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option>Cash</option><option>Bank Transfer</option><option>Card</option><option>Credit</option></select></label>
                </div>
                {Number(residualValue) > Number(cost) && <p className="asset-entry-error">Residual value cannot be greater than the asset cost.</p>}
            </div>
        </Modal>
    )
}