'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting } from '@/lib/context'
import { getDefaultRoles, saveRoles, type PermissionKey, type RoleDefinition } from '@/lib/rbac'
import { replaceRole } from '@/lib/record-upsert'

const availablePermissions: { key: PermissionKey; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'sales', label: 'Sales' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'customers', label: 'Customer Management' },
    { key: 'suppliers', label: 'Supplier Management' },
    { key: 'accounting', label: 'Accounting & Ledger' },
    { key: 'reports', label: 'Reports & Analytics' },
    { key: 'admin', label: 'Admin Tools' },
    { key: 'settings', label: 'Settings & Security' },
]

export default function RoleManagementPage() {
    const { state, updateState } = useAccounting()
    const [roles, setRoles] = useState<RoleDefinition[]>(state.roles || getDefaultRoles())
    const [selectedRoleId, setSelectedRoleId] = useState<string>(roles[0]?.id || 'super-admin')
    const [roleName, setRoleName] = useState('New Role')
    const [roleDescription, setRoleDescription] = useState('Custom role for specialized users')
    const [roleTemplate, setRoleTemplate] = useState('Custom')
    const [rolePermissions, setRolePermissions] = useState<PermissionKey[]>(['dashboard'])
    const [roleDataScope, setRoleDataScope] = useState<RoleDefinition['dataScope']>('team')
    const [editingRoleId, setEditingRoleId] = useState('')

    const selectedRole = useMemo(
        () => roles.find((role) => role.id === selectedRoleId) || roles[0],
        [roles, selectedRoleId]
    )

    const handleTogglePermission = (permission: PermissionKey) => {
        setRolePermissions((current) =>
            current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]
        )
    }

    const loadRoleForEdit = (role: RoleDefinition) => {
        setEditingRoleId(role.id)
        setRoleName(role.name)
        setRoleDescription(role.description)
        setRoleTemplate(role.template || 'Custom')
        setRolePermissions(role.permissions)
        setRoleDataScope(role.dataScope)
    }

    const handleCreateRole = () => {
        const id = editingRoleId || roleName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        if (!id) {
            alert('Enter a valid role name.')
            return
        }

        const nextRole: RoleDefinition = {
            id,
            name: roleName,
            description: roleDescription,
            permissions: rolePermissions,
            visibleMenus: rolePermissions,
            dataScope: roleDataScope,
            template: roleTemplate,
        }

        const saved = replaceRole(roles, nextRole)
        setRoles(saved.roles)
        updateState({ roles: saved.roles })
        saveRoles(saved.roles)
        setSelectedRoleId(saved.roles.find((role: RoleDefinition) => role.name === roleName)?.id || nextRole.id)
        setEditingRoleId('')
        alert(saved.updated ? `Updated role ${roleName}` : `Created role ${roleName}`)
    }

    return (
        <AppLayout>
            <div className="page-shell">
                <div className="page-hero">
                    <div>
                        <div className="eyebrow">Admin Control</div>
                        <h1 className="page-title">Role Management</h1>
                        <p className="page-subtitle">Create custom roles, assign permissions, and preview exactly what your staff can access.</p>
                    </div>
                    <div className="page-actions">
                        <Link href="/staff-management" className="action-btn">Open Staff Management</Link>
                    </div>
                </div>

                <div className="panel-card" style={{ marginBottom: 20 }}>
                    <div className="panel-head">
                        <div>
                            <div className="panel-title">Role library</div>
                            <div className="page-subtitle">Manage all active roles and keep permissions in sync with enterprise policies.</div>
                        </div>
                    </div>

                    <div className="role-grid">
                        {roles.map((role) => (
                            <button
                                key={role.id}
                                type="button"
                                className={`role-card ${selectedRoleId === role.id ? 'active' : ''}`}
                                onClick={() => setSelectedRoleId(role.id)}
                            >
                                <div className="role-label">{role.name}</div>
                                <div className="metric-note">{role.description}</div>
                                <div className="badge small">{role.permissions.length} permissions</div>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="settings-layout">
                    <div className="settings-content">
                        <div className="panel-card">
                            <div className="panel-title">Role preview</div>
                            <div className="page-subtitle">Review effective permissions, visible menu access, and data scope before assigning to staff.</div>

                            <div className="form-grid two-up" style={{ marginTop: 18 }}>
                                <div className="fg"><label>Role</label><input value={selectedRole.name} readOnly /></div>
                                <div className="fg"><label>Description</label><input value={selectedRole.description} readOnly /></div>
                                <div className="fg"><label>Data scope</label><input value={selectedRole.dataScope} readOnly /></div>
                                <div className="fg"><label>Template</label><input value={selectedRole.template || 'Custom'} readOnly /></div>
                            </div>

                            <div style={{ marginTop: 22 }}>
                                <div className="panel-title" style={{ marginBottom: 12 }}>Effective permissions</div>
                                <div className="permission-grid">
                                    {availablePermissions.map((permission) => (
                                        <div key={permission.key} className="permission-chip">
                                            <span>{permission.label}</span>
                                            <span className={`status-pill ${selectedRole.permissions.includes(permission.key) ? 'active' : ''}`}>
                                                {selectedRole.permissions.includes(permission.key) ? 'Enabled' : 'Disabled'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="panel-card">
                            <div className="panel-title">{editingRoleId ? 'Edit role' : 'Create a new role'}</div>
                            <div className="page-subtitle">{editingRoleId ? 'Saving updates this role.' : 'Build reusable role templates for branches, departments, and compliance groups.'}</div>

                            <div className="form-grid two-up" style={{ marginTop: 18 }}>
                                <div className="fg"><label>Role name</label><input value={roleName} onChange={(e) => setRoleName(e.target.value)} /></div>
                                <div className="fg"><label>Template</label><input value={roleTemplate} onChange={(e) => setRoleTemplate(e.target.value)} /></div>
                                <div className="fg"><label>Description</label><input value={roleDescription} onChange={(e) => setRoleDescription(e.target.value)} /></div>
                                <div className="fg"><label>Data scope</label>
                                    <select value={roleDataScope} onChange={(e) => setRoleDataScope(e.target.value as RoleDefinition['dataScope'])}>
                                        <option value="own">Own</option>
                                        <option value="team">Team</option>
                                        <option value="branch">Branch</option>
                                        <option value="all">All</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginTop: 22 }}>
                                <div className="panel-title" style={{ marginBottom: 12 }}>Permissions</div>
                                <div className="permission-grid">
                                    {availablePermissions.map((permission) => (
                                        <button
                                            key={permission.key}
                                            type="button"
                                            className={`permission-card ${rolePermissions.includes(permission.key) ? 'active' : ''}`}
                                            onClick={() => handleTogglePermission(permission.key)}
                                        >
                                            <div>{permission.label}</div>
                                            <div>{rolePermissions.includes(permission.key) ? 'Enabled' : 'Disabled'}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="inline-actions" style={{ justifyContent: 'space-between', marginTop: 24 }}>
                                {selectedRole && <button className="action-btn" type="button" onClick={() => loadRoleForEdit(selectedRole)}>Edit selected role</button>}
                                <button className="action-btn" type="button" onClick={() => {
                                    setEditingRoleId('')
                                    setRoleName('New Role')
                                    setRoleDescription('Custom role for specialized users')
                                    setRoleTemplate('Custom')
                                    setRolePermissions(['dashboard'])
                                    setRoleDataScope('team')
                                }}>
                                    Reset
                                </button>
                                <button className="action-btn primary" type="button" onClick={handleCreateRole}>{editingRoleId ? 'Update role' : 'Save role'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    )
}
