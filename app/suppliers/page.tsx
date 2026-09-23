'use client'

import { useEffect, useMemo, useState } from 'react'
import AppLayout from '@/components/layout/app-layout'
import { downloadExcel } from '@/lib/export-utils'
import { triggerAppToast } from '@/lib/utils'
import { useAccounting } from '@/lib/context'
import { getSupabaseClient } from '@/lib/supabase.browser'
import { Pencil, Plus, X } from 'lucide-react'

type SupplierRow = { id: string; name: string; email: string; phone: string; address: string; creditLimit: number; openingBalance: number; category: string; balance: string; status: string; rating: string; terms: string }
type SupplierForm = Pick<SupplierRow, 'name' | 'email' | 'phone' | 'address' | 'creditLimit' | 'openingBalance' | 'status'>
const emptyForm: SupplierForm = { name: '', email: '', phone: '', address: '', creditLimit: 0, openingBalance: 0, status: 'active' }

function mapSupplier(contact: any): SupplierRow {
    return { id: contact.id, name: contact.name || '', email: contact.email || '', phone: contact.phone || '', address: contact.address || '', creditLimit: Number(contact.credit_limit || 0), openingBalance: Number(contact.opening_balance || 0), category: 'Supplier', balance: `₦${Number(contact.opening_balance || 0).toLocaleString()}`, status: contact.status === 'active' ? 'Active' : 'Suspended', rating: '—', terms: 'Not set' }
}

export default function SuppliersPage() {
    const { state, updateState, user } = useAccounting()
    const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
    const [selectedSupplier, setSelectedSupplier] = useState<SupplierRow | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [showFilters, setShowFilters] = useState(false)
    const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
    const [form, setForm] = useState<SupplierForm>(emptyForm)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        let mounted = true
        async function loadSuppliers() {
            if (!user?.companyId) return
            const supabase = getSupabaseClient()
            if (!supabase) return
            const { data, error } = await supabase.from('contacts').select('id,name,email,phone,address,credit_limit,opening_balance,status').eq('company_id', user.companyId).eq('type', 'supplier').order('name')
            if (error) { triggerAppToast('Suppliers', error.message); return }
            if (!mounted) return
            const loaded = (data || []).map(mapSupplier)
            setSuppliers(loaded)
            setSelectedSupplier((current) => loaded.find((supplier) => supplier.id === current?.id) || loaded[0] || null)
        }
        void loadSuppliers()
        return () => { mounted = false }
    }, [user?.companyId])

    const filteredSuppliers = useMemo(() => {
        const query = searchTerm.toLowerCase()
        return suppliers.filter((supplier) => !query || [supplier.name, supplier.email, supplier.phone, supplier.category, supplier.status].join(' ').toLowerCase().includes(query))
    }, [searchTerm, suppliers])
    const activeSupplier = selectedSupplier || filteredSuppliers[0] || suppliers[0] || { id: '', name: 'No suppliers yet', category: '—', balance: '₦0', status: '—', rating: '—', terms: '—' }
    const summaryCards = [
        { label: 'Total Suppliers', value: String(suppliers.length), tone: 'royal' },
        { label: 'Active Suppliers', value: String(suppliers.filter((supplier) => supplier.status === 'Active').length), tone: 'green' },
        { label: 'Outstanding Balance', value: `₦${suppliers.reduce((total, supplier) => total + supplier.openingBalance, 0).toLocaleString()}`, tone: 'amber' },
        { label: 'Avg. Payment Time', value: '—', tone: 'blue' },
        { label: 'Avg. Rating', value: '—', tone: 'green' },
        { label: 'Suspended', value: String(suppliers.filter((supplier) => supplier.status !== 'Active').length), tone: 'amber' },
    ]

    const openCreate = () => { setForm(emptyForm); setFormMode('create') }
    const openEdit = (supplier: SupplierRow) => {
        setSelectedSupplier(supplier)
        setForm({ name: supplier.name, email: supplier.email, phone: supplier.phone, address: supplier.address, creditLimit: supplier.creditLimit, openingBalance: supplier.openingBalance, status: supplier.status === 'Active' ? 'active' : 'suspended' })
        setFormMode('edit')
    }

    const handleAction = (action: string) => {
        triggerAppToast(action, 'The supplier workflow has been activated.')
        if (action === 'Export') {
            downloadExcel('suppliers-export.xlsx', filteredSuppliers)
        }
    }

    const saveSupplier = async () => {
        const name = form.name.trim()
        if (!name || !user?.companyId) return
        const supabase = getSupabaseClient()
        if (!supabase) {
            triggerAppToast('Supplier', 'Supabase is not configured.')
            return
        }
        setSaving(true)
        const values = { name, email: form.email.trim() || null, phone: form.phone.trim() || null, address: form.address.trim() || null, credit_limit: Number(form.creditLimit) || 0, opening_balance: Number(form.openingBalance) || 0, status: form.status }
        let data: any = null
        let error: any = null
        if (formMode === 'edit' && selectedSupplier) {
            const result = await supabase.from('contacts').update(values).eq('id', selectedSupplier.id).eq('company_id', user.companyId).eq('type', 'supplier').select('id,name,email,phone,address,credit_limit,opening_balance,status').single()
            data = result.data; error = result.error
        } else {
            const existing = await supabase.from('contacts').select('id').eq('company_id', user.companyId).eq('type', 'supplier').ilike('name', name).maybeSingle()
            if (existing.data) { setSaving(false); triggerAppToast('Supplier', 'A supplier with this name already exists.'); return }
            const result = await supabase.from('contacts').insert({ company_id: user.companyId, type: 'supplier', ...values }).select('id,name,email,phone,address,credit_limit,opening_balance,status').single()
            data = result.data; error = result.error
        }
        setSaving(false)
        if (error) {
            triggerAppToast('Supplier', error.code === '23505' ? 'A supplier with this name already exists.' : error.message)
            return
        }
        const saved = mapSupplier(data)
        setSuppliers((current) => formMode === 'edit' ? current.map((supplier) => supplier.id === saved.id ? saved : supplier) : [...current, saved].sort((a, b) => a.name.localeCompare(b.name)))
        setSelectedSupplier(saved)
        updateState({ supplierList: Array.from(new Set([...state.supplierList.filter((supplier) => supplier !== selectedSupplier?.name), saved.name])) })
        setFormMode(null)
        setForm(emptyForm)
        triggerAppToast(formMode === 'edit' ? 'Supplier updated' : 'Supplier created', `${saved.name} has been saved.`)
    }

    return (
        <AppLayout>
            <div className="page-shell">
                <div className="page-hero">
                    <div>
                        <div className="eyebrow">Supplier Management Center</div>
                        <h1 className="page-title">Suppliers</h1>
                        <p className="page-subtitle">Manage supplier relationships, purchase history, balances, and supply performance in one calm workspace.</p>
                    </div>
                    <div className="page-actions">
                        <button className="action-btn primary supplier-create-btn" type="button" onClick={openCreate}><Plus size={17} strokeWidth={2.5} /> <span>Create supplier</span></button>
                        <button className="action-btn" type="button" onClick={() => handleAction('Import')}>Import</button>
                        <button className="action-btn" type="button" onClick={() => handleAction('Export')}>Export</button>
                    </div>
                </div>

                <div className="ai-insight">
                    <div>
                        <span className="ai-badge">AURA AI Insight</span>
                        <h3>Three suppliers account for 62% of your monthly purchases. Consider diversifying to reduce supply risk.</h3>
                    </div>
                    <div className="ai-pill">Supply Risk</div>
                </div>

                <div className="metric-grid">
                    {summaryCards.map((card) => (
                        <div className={`metric-card ${card.tone}`} key={card.label}>
                            <div className="metric-label">{card.label}</div>
                            <div className="metric-value">{card.value}</div>
                        </div>
                    ))}
                </div>

                <div className="panel-card">
                    <div className="panel-head">
                        <div>
                            <div className="panel-title">Supplier directory</div>
                            <div className="panel-subtitle">Search and filter by region, status, category, or credit posture.</div>
                        </div>
                        <button className="btn btn-secondary" type="button" onClick={() => setShowFilters((prev) => !prev)}>{showFilters ? 'Hide Filters' : 'Show Filters'}</button>
                    </div>

                    {showFilters && (
                        <div className="filter-row">
                            <input className="search-box" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="🔍 Search supplier name, category, or status..." />
                            <div className="filter-pills">
                                <span className="pill">Category</span>
                                <span className="pill">Branch</span>
                                <span className="pill">Payment Terms</span>
                                <span className="pill">Status</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="content-grid">
                    <div className="panel-card">
                        <div className="table-wrap">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Supplier</th>
                                        <th>Category</th>
                                        <th>Balance</th>
                                        <th>Status</th>
                                        <th>Rating</th>
                                        <th>Terms</th>
                                        <th aria-label="Actions"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSuppliers.map((supplier) => (
                                        <tr key={supplier.id} onClick={() => setSelectedSupplier(supplier)} style={{ cursor: 'pointer' }}>
                                            <td>
                                                <div className="table-strong">{supplier.name}</div>
                                                <div className="table-muted">{supplier.category}</div>
                                            </td>
                                            <td>{supplier.category}</td>
                                            <td>{supplier.balance}</td>
                                            <td><span className={`status-pill ${supplier.status === 'Active' ? 'active' : ''}`}>{supplier.status}</span></td>
                                            <td>{supplier.rating} ★</td>
                                            <td>{supplier.terms}</td>
                                            <td>
                                                <button className="icon-button" type="button" title={`Edit ${supplier.name}`} aria-label={`Edit ${supplier.name}`} onClick={(event) => { event.stopPropagation(); openEdit(supplier) }}>
                                                    <Pencil size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="side-panel">
                        <div className="profile-card">
                            <div className="profile-header">
                                <div>
                                    <div className="eyebrow">Supplier Profile</div>
                                    <h3>{activeSupplier.name}</h3>
                                </div>
                                <span className={`status-pill ${activeSupplier.status === 'Active' ? 'active' : ''}`}>{activeSupplier.status}</span>
                            </div>
                            <div className="profile-body">
                                <div className="profile-row"><span className="profile-label">Supplier ID</span><span>{activeSupplier.id || '—'}</span></div>
                                <div className="profile-row"><span className="profile-label">Category</span><span>{activeSupplier.category}</span></div>
                                <div className="profile-row"><span className="profile-label">Outstanding</span><span>{activeSupplier.balance}</span></div>
                                <div className="profile-row"><span className="profile-label">Email</span><span>{activeSupplier.email || '—'}</span></div>
                                <div className="profile-row"><span className="profile-label">Phone</span><span>{activeSupplier.phone || '—'}</span></div>
                                <div className="profile-row"><span className="profile-label">Credit limit</span><span>₦{Number(activeSupplier.creditLimit || 0).toLocaleString()}</span></div>
                                <div className="profile-row"><span className="profile-label">Terms</span><span>{activeSupplier.terms}</span></div>
                                <div className="profile-row"><span className="profile-label">Rating</span><span>{activeSupplier.rating}</span></div>
                            </div>
                            {selectedSupplier && <button className="btn btn-secondary" type="button" onClick={() => openEdit(selectedSupplier)}><Pencil size={15} /> Edit supplier</button>}
                        </div>
                        <div className="mini-card">
                            <div className="mini-label">Key note</div>
                            <div className="mini-value">On-time delivery performance is holding at 96% this quarter.</div>
                        </div>
                    </div>
                </div>

                <div className="panel-card">
                    <div className="panel-head">
                        <div>
                            <div className="panel-title">Performance analytics</div>
                            <div className="panel-subtitle">A lighter view of supplier concentration and quality trends.</div>
                        </div>
                    </div>
                    <div className="analytics-grid">
                        <div className="mini-chart">
                            <div className="bar-stack">
                                <div className="bar-col"><div className="bar-fill tall"></div><span>Jan</span></div>
                                <div className="bar-col"><div className="bar-fill"></div><span>Feb</span></div>
                                <div className="bar-col"><div className="bar-fill tall"></div><span>Mar</span></div>
                                <div className="bar-col"><div className="bar-fill mid"></div><span>Apr</span></div>
                                <div className="bar-col"><div className="bar-fill tall"></div><span>May</span></div>
                            </div>
                        </div>
                        <div className="mini-card">
                            <div className="mini-label">Top suppliers</div>
                            <div className="mini-value">{suppliers.slice(0, 3).map((supplier) => supplier.name).join(' • ') || 'No suppliers created yet'}</div>
                        </div>
                    </div>
                </div>

                {formMode && (
                    <div className="expense-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setFormMode(null)}>
                        <section className="expense-modal" role="dialog" aria-modal="true" aria-labelledby="supplier-form-title">
                            <div className="modal-header">
                                <div>
                                    <h2 id="supplier-form-title">{formMode === 'edit' ? 'Edit supplier' : 'Create supplier'}</h2>
                                    <p className="section-subtitle">Keep supplier contact and credit details current.</p>
                                </div>
                                <button className="icon-button" type="button" aria-label="Close" onClick={() => setFormMode(null)}><X size={18} /></button>
                            </div>
                            <div className="expense-form-grid">
                                <label>Supplier name<input className="search-box" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} autoFocus /></label>
                                <label>Email<input className="search-box" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
                                <label>Phone<input className="search-box" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></label>
                                <label>Status<select className="search-box" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
                                <label>Credit limit<input className="search-box" type="number" min="0" value={form.creditLimit} onChange={(event) => setForm((current) => ({ ...current, creditLimit: Number(event.target.value) }))} /></label>
                                <label>Opening balance<input className="search-box" type="number" min="0" value={form.openingBalance} onChange={(event) => setForm((current) => ({ ...current, openingBalance: Number(event.target.value) }))} /></label>
                                <label style={{ gridColumn: '1 / -1' }}>Address<textarea className="search-box" value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} rows={3} /></label>
                            </div>
                            <div className="modal-actions">
                                <button className="btn btn-secondary" type="button" onClick={() => setFormMode(null)}>Cancel</button>
                                <button className="btn btn-primary" type="button" disabled={saving || !form.name.trim()} onClick={saveSupplier}>{saving ? 'Saving...' : formMode === 'edit' ? 'Save changes' : 'Create supplier'}</button>
                            </div>
                        </section>
                    </div>
                )}
            </div>
        </AppLayout>
    )
}
