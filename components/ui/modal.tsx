import React from 'react'

export default function Modal({ open, title, children, onClose, footer, className = '' }: { open: boolean; title?: string; children: React.ReactNode; onClose: () => void; footer?: React.ReactNode; className?: string }) {
    if (!open) return null

    return (
        <div className="hw-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
            <div className={`hw-modal ${className}`.trim()} style={{ width: '720px', maxWidth: '95%', background: 'var(--card-bg, #fff)', borderRadius: 8, boxShadow: '0 8px 30px rgba(0,0,0,0.2)', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--muted-border, #eee)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{title}</strong>
                    <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>✕</button>
                </div>
                <div style={{ padding: 18 }}>{children}</div>
                {footer && <div style={{ padding: 12, borderTop: '1px solid var(--muted-border, #eee)', textAlign: 'right' }}>{footer}</div>}
            </div>
        </div>
    )
}
