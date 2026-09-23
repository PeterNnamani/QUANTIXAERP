'use client'

import AppLayout from '@/components/layout/app-layout'
import { useEffect, useMemo, useState } from 'react'
import { useAccounting } from '@/lib/context'
import { getSupabaseClient } from '@/lib/supabase.browser'
import { formatCurrency, triggerAppToast } from '@/lib/utils'
import { downloadExcel } from '@/lib/export-utils'

type Agreement = {
    id: string
    supplier: string
    title: string
    period: string
    target: number
    current: number
    progress: number
    rebate: number
    rate: number
    status: string
    tone: string
    supplierId: string,
}

const defaultAgreement: Agreement = { id: '', supplier: 'No supplier selected', title: 'No agreement selected', period: '—', target: 0, current: 0, progress: 0, rebate: 0, rate: 0, status: 'Inactive', tone: 'info', supplierId: '' }

export default function SupplierRebatesPage() {
    const { user } = useAccounting()
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedAgreement, setSelectedAgreement] = useState(defaultAgreement)
    const [agreements, setAgreements] = useState<Agreement[]>([])
    const [supplierIds, setSupplierIds] = useState<Record<string, string>>({})
    const [showCreate, setShowCreate] = useState(false)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState({ supplierId: '', title: '', periodStart: '', periodEnd: '', target: '', rate: '' })

    useEffect(() => {
        if (!user?.companyId) return
        const supabase = getSupabaseClient()
        if (!supabase) return
        let mounted = true
        const loadAgreements = async () => {
            const [{ data: contacts }, { data: rows, error }] = await Promise.all([
                supabase.from('contacts').select('id,name').eq('company_id', user.companyId).eq('type', 'supplier').order('name'),
                supabase.from('supplier_rebate_agreements').select('*').eq('company_id', user.companyId).order('period_end', { ascending: true }),
            ])
            if (error) {
                if (error.code !== 'PGRST205') console.error('Unable to load supplier rebate agreements', error)
                return
            }
            if (!mounted) return
            const names = Object.fromEntries((contacts || []).map((contact) => [contact.id, contact.name]))
            setSupplierIds(names)
            setAgreements((rows || []).map((row) => {
                const current = Number(row.current_purchase || 0)
                const target = Number(row.target || 0)
                return { id: row.id, supplierId: row.supplier_id, supplier: names[row.supplier_id] || 'Unknown supplier', title: row.title, period: `${row.period_start} to ${row.period_end}`, target, current, progress: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0, rebate: current * Number(row.rebate_rate || 0) / 100, rate: Number(row.rebate_rate || 0), status: row.status || 'Active', tone: row.status === 'Active' ? 'success' : 'warning' }
            }))
        }
        void loadAgreements()
        return () => { mounted = false }
    }, [user?.companyId])

    const filteredAgreements = useMemo(() => {
        const query = searchTerm.toLowerCase()
        return agreements.filter((row) => {
            return (
                !query || [row.supplier, row.title, row.period, row.status].join(' ').toLowerCase().includes(query)
            )
        })
    }, [agreements, searchTerm])

    const rebateSummary = [
        { label: 'Total Rebates Earned', value: formatCurrency(agreements.reduce((sum, row) => sum + row.rebate, 0)), subtitle: 'Projected', tone: 'info' },
        { label: 'Pending Rebates', value: formatCurrency(agreements.filter((row) => row.status === 'Active').reduce((sum, row) => sum + row.rebate, 0)), subtitle: 'Awaiting Settlement', tone: 'warning' },
        { label: 'Received Rebates', value: formatCurrency(agreements.filter((row) => row.status !== 'Active').reduce((sum, row) => sum + row.rebate, 0)), subtitle: 'Completed', tone: 'success' },
        { label: 'Active Agreements', value: String(agreements.filter((row) => row.status === 'Active').length), subtitle: 'Agreements', tone: 'purple' },
        { label: 'Expiring Soon', value: String(agreements.filter((row) => row.period.includes(new Date().getFullYear().toString())).length), subtitle: 'Agreements', tone: 'amber' },
        { label: 'Average Rebate Rate', value: `${agreements.length ? (agreements.reduce((sum, row) => sum + row.rate, 0) / agreements.length).toFixed(2) : '0'}%`, subtitle: '', tone: 'info' },
    ]
    const agreementCards = filteredAgreements
    const rebateTypes = Array.from(new Set(agreements.map((agreement) => agreement.rate))).map((rate) => ({ title: `${rate}% volume rebate`, description: 'Applied to the purchases recorded against this agreement.' }))
    const timelineEntries = agreements.length > 0
        ? agreements.slice(0, 5).map((agreement) => ({ date: agreement.period.split(' to ')[0], note: `${agreement.supplier}: ${agreement.title}`, amount: formatCurrency(agreement.rebate) }))
        : [{ date: 'Pending', note: 'Rebate activity will appear here once records are available.', amount: '' }]

    const handleAction = (action: string) => {
        if (action === '+ Create Rebate Agreement') {
            setShowCreate(true)
            return
        }
        triggerAppToast(action, 'The rebate workflow has been prepared for the current cycle.')
        if (action === 'Export') {
            downloadExcel('supplier-rebates-export.xlsx', filteredAgreements)
        }
    }

    const createAgreement = async () => {
        if (!user?.companyId || !form.supplierId || !form.title.trim() || !form.periodStart || !form.periodEnd) return
        if (form.periodEnd < form.periodStart) {
            triggerAppToast('Agreement', 'The agreement end date must be on or after the start date.')
            return
        }
        const supabase = getSupabaseClient()
        if (!supabase) return triggerAppToast('Agreement', 'Supabase is not configured.')
        setSaving(true)
        const { data, error } = await supabase.from('supplier_rebate_agreements').insert({ company_id: user.companyId, supplier_id: form.supplierId, title: form.title.trim(), period_start: form.periodStart, period_end: form.periodEnd, target: Number(form.target || 0), rebate_rate: Number(form.rate || 0), status: 'Active' }).select('*').single()
        setSaving(false)
        if (error) {
            triggerAppToast('Agreement', error.message)
            return
        }
        const supplier = supplierIds[form.supplierId] || 'Unknown supplier'
        const target = Number(data.target || 0)
        const agreement: Agreement = { id: data.id, supplierId: data.supplier_id, supplier, title: data.title, period: `${data.period_start} to ${data.period_end}`, target, current: Number(data.current_purchase || 0), progress: 0, rebate: 0, rate: Number(data.rebate_rate || 0), status: data.status, tone: 'success' }
        setAgreements((current) => [agreement, ...current])
        setSelectedAgreement(agreement)
        setForm({ supplierId: '', title: '', periodStart: '', periodEnd: '', target: '', rate: '' })
        setShowCreate(false)
        triggerAppToast('Agreement created', `${supplier} is now linked to this rebate agreement.`)
    }

    return (
        <AppLayout>
            <div className="supplier-rebates-shell">
                <div className="supplier-rebates-header">
                    <div>
                        <div className="pg-title">Supplier Rebates</div>
                        <div className="pg-subtitle">Manage supplier incentives, volume discounts, promotional rewards, and rebate settlements.</div>
                    </div>
                    <div className="supplier-rebates-actions">
                        <button type="button" className="page-btn primary" onClick={() => handleAction('+ Create Rebate Agreement')}>+ Create Rebate Agreement</button>
                        <button type="button" className="page-btn secondary" onClick={() => handleAction('+ Record Rebate Claim')}>+ Record Rebate Claim</button>
                        <button type="button" className="page-btn secondary" onClick={() => handleAction('Calculate Rebates')}>Calculate Rebates</button>
                        <button type="button" className="page-btn secondary" onClick={() => handleAction('Export')}>Export</button>
                        <button type="button" className="page-btn secondary" onClick={() => handleAction('Reports')}>Reports</button>
                    </div>
                </div>

                {showCreate && (
                    <div className="card" style={{ marginBottom: '18px' }}>
                        <div className="card-hd"><div><div className="card-title">Create rebate agreement</div><div className="section-subtitle">Link the agreement to a supplier already created in Supplier Management.</div></div></div>
                        <div className="filter-row">
                            <select className="search-box" value={form.supplierId} onChange={(event) => setForm((current) => ({ ...current, supplierId: event.target.value }))}>
                                <option value="">Select supplier</option>
                                {Object.entries(supplierIds).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                            </select>
                            <input className="search-box" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Agreement title" />
                            <input className="search-box" type="date" value={form.periodStart} onChange={(event) => setForm((current) => ({ ...current, periodStart: event.target.value }))} />
                            <input className="search-box" type="date" value={form.periodEnd} onChange={(event) => setForm((current) => ({ ...current, periodEnd: event.target.value }))} />
                            <input className="search-box" type="number" min="0" value={form.target} onChange={(event) => setForm((current) => ({ ...current, target: event.target.value }))} placeholder="Purchase target" />
                            <input className="search-box" type="number" min="0" step="0.01" value={form.rate} onChange={(event) => setForm((current) => ({ ...current, rate: event.target.value }))} placeholder="Rebate rate %" />
                            <button className="page-btn primary" type="button" disabled={saving || !form.supplierId || !form.title.trim() || !form.periodStart || !form.periodEnd} onClick={createAgreement}>{saving ? 'Saving...' : 'Create Agreement'}</button>
                            <button className="page-btn secondary" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
                        </div>
                    </div>
                )}
                <div className="supplier-rebates-summary-grid">
                    {rebateSummary.map((card) => (
                        <div key={card.label} className={`summary-card ${card.tone}`}>
                            <div className="summary-label">{card.label}</div>
                            <div className="summary-value">{card.value}</div>
                            {card.subtitle && <div className="summary-subtitle">{card.subtitle}</div>}
                        </div>
                    ))}
                </div>

                <div className="supplier-rebates-main-grid">
                    <div className="supplier-rebates-left">
                        <div className="card">
                            <div className="card-hd">
                                <div>
                                    <div className="card-title">Active Rebate Agreements</div>
                                    <div className="section-subtitle">Track performance, progress, and expected rebate outcomes.</div>
                                </div>
                            </div>
                            <div className="agreement-card-grid">
                                {agreementCards.length > 0 ? agreementCards.map((agreement) => (
                                    <div key={agreement.supplier} className="agreement-card" onClick={() => setSelectedAgreement(agreement)} style={{ cursor: 'pointer' }}>
                                        <div className="agreement-card-top">
                                            <strong>{agreement.supplier}</strong>
                                            <span className={`status-pill ${agreement.tone}`}>{agreement.status}</span>
                                        </div>
                                        <div className="agreement-title">{agreement.title}</div>
                                        <div className="agreement-row"><span>Period</span><strong>{agreement.period}</strong></div>
                                        <div className="agreement-row"><span>Target</span><strong>{formatCurrency(agreement.target)}</strong></div>
                                        <div className="agreement-row"><span>Current Purchase</span><strong>{formatCurrency(agreement.current)}</strong></div>
                                        <div className="agreement-progress-bar">
                                            <div className="agreement-progress-fill" style={{ width: `${agreement.progress}%` }} />
                                        </div>
                                        <div className="agreement-footer">
                                            <span>{agreement.progress}%</span>
                                            <strong>{formatCurrency(agreement.rebate)}</strong>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="agreement-card" style={{ padding: '24px', textAlign: 'center' }}>
                                        <div className="agreement-title">No active rebate agreements</div>
                                        <p style={{ marginTop: '10px', color: 'var(--text2)' }}>Create a rebate agreement to start tracking supplier incentives here.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="card">
                            <div className="card-hd">
                                <div>
                                    <div className="card-title">Rebate Types</div>
                                    <div className="section-subtitle">Create and manage different rebate rule structures.</div>
                                </div>
                            </div>
                            <div className="rebate-types-grid">
                                {rebateTypes.length > 0 ? rebateTypes.map((item) => (
                                    <div key={item.title} className="rebate-type-card">
                                        <strong>{item.title}</strong>
                                        <p>{item.description}</p>
                                    </div>
                                )) : (
                                    <div className="agreement-card" style={{ padding: '24px', textAlign: 'center' }}>
                                        <div className="agreement-title">No rebate types available</div>
                                        <p style={{ marginTop: '10px', color: 'var(--text2)' }}>Add rebate rules to define incentive programs.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="card">
                            <div className="card-hd">
                                <div>
                                    <div className="card-title">Rebate Tracking Table</div>
                                    <div className="section-subtitle">Supplier agreements, targets, achievements, and status.</div>
                                </div>
                            </div>
                            <div className="tbl-wrap">
                                <table className="rebate-table">
                                    <thead>
                                        <tr>
                                            <th>Supplier</th>
                                            <th>Agreement</th>
                                            <th>Period</th>
                                            <th>Target</th>
                                            <th>Achieved</th>
                                            <th>Rebate</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredAgreements.length > 0 ? filteredAgreements.map((row) => (
                                            <tr key={`${row.supplier}-${row.title}`}>
                                                <td>{row.supplier}</td>
                                                <td>{row.title}</td>
                                                <td>{row.period}</td>
                                                <td>{formatCurrency(row.target)}</td>
                                                <td>{formatCurrency(row.current)}</td>
                                                <td>{formatCurrency(row.rebate)}</td>
                                                <td>{row.status}</td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={7} style={{ padding: '22px 14px', color: 'var(--text2)', textAlign: 'center' }}>
                                                    No rebate agreement records available.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div className="supplier-rebates-right">
                        <div className="card">
                            <div className="card-hd">
                                <div>
                                    <div className="card-title">Supplier Rebate Details</div>
                                    <div className="section-subtitle">Selected agreement performance and remaining targets.</div>
                                </div>
                            </div>
                            <div className="detail-panel">
                                <div className="detail-row"><span>{selectedAgreement.supplier}</span><strong>{formatCurrency(selectedAgreement.rebate)}</strong></div>
                                <div className="detail-row"><span>Purchase Achievement</span><strong>{selectedAgreement.progress}%</strong></div>
                                <div className="detail-row"><span>Target</span><strong>{formatCurrency(selectedAgreement.target)}</strong></div>
                                <div className="detail-row"><span>Current</span><strong>{formatCurrency(selectedAgreement.current)}</strong></div>
                            </div>
                        </div>

                        <div className="card">
                            <div className="card-hd">
                                <div>
                                    <div className="card-title">Rebate Timeline</div>
                                    <div className="section-subtitle">Recent milestones and settlement updates.</div>
                                </div>
                            </div>
                            <div className="timeline-list">
                                {timelineEntries.map((entry) => (
                                    <div key={entry.date} className="timeline-entry">
                                        <strong>{entry.date}</strong>
                                        <p>{entry.note}</p>
                                        {entry.amount && <span>{entry.amount}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="card">
                            <div className="card-hd">
                                <div>
                                    <div className="card-title">QUANTIXA Rebate Intelligence</div>
                                    <div className="section-subtitle">QUANTIXA recommendations for rebate performance.</div>
                                </div>
                            </div>
                            <div className="ai-insight">
                                <p>Rebate insights will appear once supplier agreement records and claim activity are available.</p>
                            </div>
                            <div className="ai-insight warning">
                                <p>No rebate performance data is currently available to display.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    )
}
