import React, { useState } from 'react'
import Modal from '@/components/ui/modal'
import type { LedgerAccount } from '@/lib/context'

export default function ManualJournalModal({ open, onClose, onCreate, accounts }: { open: boolean; onClose: () => void; onCreate: (entry: any) => void; accounts: LedgerAccount[] }) {
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
    const [description, setDescription] = useState('')
    const [debitAccountId, setDebitAccountId] = useState(accounts[0]?.id || '')
    const [creditAccountId, setCreditAccountId] = useState(accounts[1]?.id || accounts[0]?.id || '')
    const [amount, setAmount] = useState('')
    const [error, setError] = useState('')

    const handleCreate = () => {
        const numericAmount = Number(amount)
        if (!date || !description.trim() || !debitAccountId || !creditAccountId || debitAccountId === creditAccountId || numericAmount <= 0) {
            setError('Enter a description, two different accounts, and an amount greater than zero.')
            return
        }
        const entry = { id: crypto.randomUUID(), entryDate: date, description: description.trim(), sourceModule: 'MANUAL', status: 'POSTED', lines: [{ accountId: debitAccountId, debit: numericAmount }, { accountId: creditAccountId, credit: numericAmount }] }
        onCreate(entry)
        onClose()
    }

    return (
        <Modal open={open} onClose={onClose} title="Create Manual Journal" footer={<>
            <button type="button" onClick={onClose} style={{ marginRight: 8 }}>Cancel</button>
            <button type="button" onClick={handleCreate} className="btn btn-primary">Create</button>
        </>}>
            <div style={{ display: 'grid', gap: 10 }}>
                <label>
                    Date
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label>
                    Debit account
                    <select value={debitAccountId} onChange={(e) => setDebitAccountId(e.target.value)}>
                        {accounts.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}
                    </select>
                </label>
                <label>
                    Credit account
                    <select value={creditAccountId} onChange={(e) => setCreditAccountId(e.target.value)}>
                        {accounts.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}
                    </select>
                </label>
                <label>
                    Amount
                    <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </label>
                <label>
                    Description
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
                </label>
                {error && <div role="alert" style={{ color: '#b42318' }}>{error}</div>}
            </div>
        </Modal>
    )
}
