import React from 'react'
import Modal from '@/components/ui/modal'

export default function TrialBalanceModal({ open, onClose, rows }: { open: boolean; onClose: () => void; rows: Array<any> }) {
    return (
        <Modal open={open} onClose={onClose} title="Trial Balance Preview" footer={<button type="button" onClick={onClose}>Close</button>}>
            <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left', padding: 8 }}>Account</th>
                            <th style={{ textAlign: 'right', padding: 8 }}>Debit</th>
                            <th style={{ textAlign: 'right', padding: 8 }}>Credit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r: any, i: number) => (
                            <tr key={i}>
                                <td style={{ padding: 8 }}>{r.account}</td>
                                <td style={{ padding: 8, textAlign: 'right' }}>{r.debit ?? '—'}</td>
                                <td style={{ padding: 8, textAlign: 'right' }}>{r.credit ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Modal>
    )
}
