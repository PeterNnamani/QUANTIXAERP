'use client'

import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/ui/modal'

type AssetAction = 'transfer' | 'dispose' | 'depreciation'

type AssetLifecycleModalProps = {
    open: boolean
    action: AssetAction
    assetName?: string
    currentBranch?: string
    currentValue?: number
    onClose: () => void
    onConfirm: (values: { branch?: string; reason?: string; date?: string; method?: string; rate?: number }) => void
}

const actionCopy: Record<AssetAction, { title: string; eyebrow: string; description: string; confirm: string }> = {
    transfer: { title: 'Transfer asset', eyebrow: 'Asset movement', description: 'Move this asset to another branch while keeping its register history intact.', confirm: 'Transfer asset' },
    dispose: { title: 'Dispose asset', eyebrow: 'Asset retirement', description: 'Record why this asset left service. It will remain in the register as a disposed asset.', confirm: 'Dispose asset' },
    depreciation: { title: 'Run depreciation', eyebrow: 'Accounting control', description: 'Apply a depreciation estimate to the selected asset and save the calculation in its register history.', confirm: 'Run depreciation' },
}

export default function AssetLifecycleModal({ open, action, assetName, currentBranch, currentValue = 0, onClose, onConfirm }: AssetLifecycleModalProps) {
    const [branch, setBranch] = useState(currentBranch || 'Head Office')
    const [reason, setReason] = useState('')
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
    const [method, setMethod] = useState('Straight-line')
    const [rate, setRate] = useState(20)
    const copy = actionCopy[action]

    useEffect(() => {
        if (!open) return
        setBranch(currentBranch || 'Head Office')
        setReason('')
        setDate(new Date().toISOString().slice(0, 10))
        setMethod('Straight-line')
        setRate(20)
    }, [open, currentBranch, action])

    const estimatedDepreciation = useMemo(() => Math.min(currentValue, Math.max(0, currentValue * (Number(rate) || 0) / 100)), [currentValue, rate])
    const valid = action === 'transfer'
        ? Boolean(branch.trim())
        : action === 'dispose'
            ? Boolean(reason.trim() && date)
            : Boolean(date && Number(rate) > 0 && Number(rate) <= 100)

    return (
        <Modal open={open} onClose={onClose} title={copy.title} className="workflow-modal" footer={<>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={!valid} onClick={() => onConfirm({ branch: branch.trim(), reason: reason.trim(), date, method, rate: Number(rate) })}>{copy.confirm}</button>
        </>}>
            <div className="workflow-form">
                <div className="workflow-intro">
                    <span className="workflow-kicker">{copy.eyebrow}</span>
                    <h3>{assetName || 'Select an asset'}</h3>
                    <p>{copy.description}</p>
                </div>
                {action === 'transfer' && <>
                    <label className="workflow-field">New branch<input autoFocus value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="e.g. Ikeja Branch" /></label>
                    <label className="workflow-field">Transfer note<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional handover details" rows={3} /></label>
                </>}
                {action === 'dispose' && <>
                    <label className="workflow-field">Disposal date<input autoFocus type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
                    <label className="workflow-field">Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Sold, damaged beyond repair" rows={3} /></label>
                </>}
                {action === 'depreciation' && <>
                    <div className="workflow-summary"><span>Current book value</span><strong>{currentValue.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</strong></div>
                    <div className="workflow-fields-row">
                        <label className="workflow-field">Method<select value={method} onChange={(event) => setMethod(event.target.value)}><option>Straight-line</option><option>Reducing balance</option></select></label>
                        <label className="workflow-field">Annual rate (%)<input autoFocus type="number" min="0.01" max="100" step="0.01" value={rate} onChange={(event) => setRate(Number(event.target.value))} /></label>
                    </div>
                    <label className="workflow-field">Posting date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
                    <div className="workflow-summary accent"><span>Estimated depreciation</span><strong>{estimatedDepreciation.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</strong></div>
                </>}
            </div>
        </Modal>
    )
}
