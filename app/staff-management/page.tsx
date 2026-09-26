'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { Eye, EyeOff, Pencil, Lock, Unlock, Trash2, Search, Users, ThumbsUp, ChevronDown } from 'lucide-react'
import AppLayout from '@/components/layout/app-layout'
import BulkImport from '@/components/bulk-import'
import { useAccounting } from '@/lib/context'
import { generatePin, generateStaffId, savedMenuAccess, saveRoles, type AccessLevels, type PermissionKey, type RoleDefinition, type StaffMemberRecord } from '@/lib/rbac'
import { replaceRole } from '@/lib/record-upsert'
import { saveUserToDatabase } from '@/lib/user-db'
import { getSupabaseClient } from '@/lib/supabase.browser'
import { seatLimitForSubscription } from '@/lib/licensing'

const branchOptions = ['Enugu', 'Onitsha', 'Lagos', 'Abuja']
const genderOptions = ['Female', 'Male', 'Other']
const departmentOptions = ['Sales', 'Inventory', 'Accounting', 'HR', 'Operations']
const positionOptions = ['Sales Manager', 'Cashier', 'Store Officer', 'Accountant', 'HR Officer']
const permissionOptions: { key: PermissionKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'sales', label: 'Sales' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'productManager', label: 'Product Manager' },
  { key: 'expenses', label: 'Expenses & Approval' },
  { key: 'bankTxn', label: 'Bank Transactions' },
  { key: 'banks', label: 'Bank Balances' },
  { key: 'dailyClose', label: 'Daily Closing' },
  { key: 'ledger', label: 'General Ledger' },
  { key: 'receivables', label: 'Receivables' },
  { key: 'payables', label: 'Payables' },
  { key: 'prepayments', label: 'Prepayments' },
  { key: 'supplierRebates', label: 'Supplier Rebates' },
  { key: 'loans', label: 'Loans' },
  { key: 'tax', label: 'Tax' },
  { key: 'customers', label: 'Customer Management' },
  { key: 'suppliers', label: 'Supplier Management' },
  { key: 'supplierBalances', label: 'Supplier Balances' },
  { key: 'accounting', label: 'Accounting & Ledger' },
  { key: 'reports', label: 'Reports & Analytics' },
  { key: 'monthlyReport', label: 'Monthly Report' },
  { key: 'annualReport', label: 'Annual Report' },
  { key: 'assetSchedule', label: 'Asset Schedule' },
  { key: 'admin', label: 'Admin Tools' },
  { key: 'settings', label: 'Settings & Security' },
]

const getRoleAccessLevels = (role: RoleDefinition | undefined): AccessLevels => {
  if (!role) return { dashboard: 'edit' }
  const accessLevels: AccessLevels = {}
  role.visibleMenus?.forEach((permission) => { accessLevels[permission] = 'view' })
  role.permissions.forEach((permission) => { accessLevels[permission] = 'edit' })
  return accessLevels
}

export default function StaffManagementPage() {
  const { state, updateState, user, addAuditLog } = useAccounting()
  const [staffMembers, setStaffMembers] = useState<StaffMemberRecord[]>(state.staffMembers)
  const [roles, setRoles] = useState<RoleDefinition[]>(state.roles)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [gender, setGender] = useState(genderOptions[0])
  const [passportPhoto, setPassportPhoto] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [department, setDepartment] = useState(departmentOptions[0])
  const [position, setPosition] = useState(positionOptions[0])
  const [employmentDate, setEmploymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [salary, setSalary] = useState('')
  const [branch, setBranch] = useState(branchOptions[0])
  const [username, setUsername] = useState('')
  const [roleId, setRoleId] = useState(state.roles[0]?.id || 'cashier')
  const [roleTitle, setRoleTitle] = useState('')
  const [accessLevels, setAccessLevels] = useState<AccessLevels>({})
  const [menuAccessOpen, setMenuAccessOpen] = useState(false)
  const [openAccessMenu, setOpenAccessMenu] = useState<PermissionKey | null>(null)
  const [status, setStatus] = useState<StaffMemberRecord['status']>('active')

  const [roleName, setRoleName] = useState('New Role')
  const [roleDescription, setRoleDescription] = useState('Custom role for staff access')
  const [roleTemplate, setRoleTemplate] = useState('Custom')
  const [rolePermissions, setRolePermissions] = useState<PermissionKey[]>(['dashboard'])
  const [roleDataScope, setRoleDataScope] = useState<RoleDefinition['dataScope']>('team')
  const [selectedRoleId, setSelectedRoleId] = useState<string>(state.roles[0]?.id || 'cashier')
  const [drawerMode, setDrawerMode] = useState<'add' | 'view' | 'edit'>('add')
  const [activeStaff, setActiveStaff] = useState<StaffMemberRecord | null>(null)
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const [revealedPins, setRevealedPins] = useState<Record<string, boolean>>({})
  const [saveConfirmation, setSaveConfirmation] = useState<{ name: string; staffId: string; pin: string; saved: boolean } | null>(null)
  const [inlineNotice, setInlineNotice] = useState<{ message: string; tone: 'error' | 'success' } | null>(null)
  const selectedRole = useMemo(() => roles.find((role) => role.id === selectedRoleId) || roles[0], [roles, selectedRoleId])

  const filteredStaff = useMemo(
    () => staffMembers.filter((member) => {
      const query = search.trim().toLowerCase()
      if (!query) return true
      return [member.name, member.roleName, member.branch, member.status, member.staffId]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query))
    }),
    [search, staffMembers]
  )

  const toggleRolePermission = (permission: PermissionKey) => {
    setRolePermissions((current) =>
      current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]
    )
  }

  const handleStaffRoleChange = (nextRoleId: string) => {
    const nextRole = roles.find((role) => role.id === nextRoleId)
    setRoleId(nextRoleId)
    setRoleTitle(nextRole?.name || '')
    setAccessLevels(getRoleAccessLevels(nextRole))
  }

  const handleCreateRole = () => {
    const id = roleName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (!id) {
      setInlineNotice({ message: 'Enter a valid role name.', tone: 'error' })
      return
    }

    const newRole: RoleDefinition = {
      id,
      name: roleName,
      description: roleDescription,
      permissions: rolePermissions,
      visibleMenus: rolePermissions,
      dataScope: roleDataScope,
      template: roleTemplate,
    }

    const saved = replaceRole(roles, newRole)
    setRoles(saved.roles)
    updateState({ roles: saved.roles })
    saveRoles(saved.roles)
    setSelectedRoleId(saved.roles.find((role: RoleDefinition) => role.name === roleName)?.id || newRole.id)
    setRoleName('New Role')
    setRoleDescription('Custom role for staff access')
    setRoleTemplate('Custom')
    setRolePermissions(['dashboard'])
    setRoleDataScope('team')
    setInlineNotice({ message: saved.updated ? `Updated role ${roleName}` : `Created role ${roleName}`, tone: 'success' })
  }

  const resetForm = () => {
    const defaultRoleId = roles[0]?.id || 'cashier'
    setFirstName('')
    setLastName('')
    setPhone('')
    setEmail('')
    setDateOfBirth('')
    setGender(genderOptions[0])
    setPassportPhoto('')
    setEmployeeId('')
    setDepartment(departmentOptions[0])
    setPosition(positionOptions[0])
    setEmploymentDate(new Date().toISOString().slice(0, 10))
    setSalary('')
    setBranch(branchOptions[0])
    setUsername('')
    setRoleId(defaultRoleId)
    setRoleTitle('')
    setAccessLevels(getRoleAccessLevels(roles.find((role) => role.id === defaultRoleId)))
    setMenuAccessOpen(false)
    setOpenAccessMenu(null)
    setStatus('active')
    setActiveStaff(null)
    setDrawerMode('add')
  }

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus()
    }
  }, [searchOpen])

  useEffect(() => {
    if (!saveConfirmation) return
    const timeoutId = window.setTimeout(() => setSaveConfirmation(null), 3000)
    return () => window.clearTimeout(timeoutId)
  }, [saveConfirmation])

  useEffect(() => {
    setStaffMembers(state.staffMembers)
  }, [state.staffMembers])

  useEffect(() => {
    // Fetch staff list from DB for the current company and merge into state
    const loadFromDb = async () => {
      try {
        if (!user?.companyId) return
        const supabase = getSupabaseClient()
        if (!supabase) return

        const { data, error } = await supabase.from('users').select('*').eq('company_id', user.companyId).order('created_at', { ascending: false })
        if (error) {
          console.warn('Unable to fetch staff from DB', error)
          return
        }

        const nextStaff: StaffMemberRecord[] = (data || []).map((row: any) => {
          const roleDef = roles.find((r) => r.id === String(row.role)) || roles[0]
          const storedAccessLevels = row.access_levels && typeof row.access_levels === 'object'
            ? row.access_levels as AccessLevels
            : getRoleAccessLevels(roleDef)
          const staffId = String(row.staff_id || '')
          const id = String(row.id || `${staffId}-${Date.parse(String(row.created_at || Date.now()))}`)

          return {
            id,
            name: String(row.full_name || row.username || staffId || 'Staff User'),
            staffId,
            pin: String(row.pin || ''),
            roleId: roleDef?.id || String(row.role || 'cashier'),
            roleName: String(row.role_title || roleDef?.name || String(row.role || 'Custom Role')),
            permissions: Object.entries(storedAccessLevels).filter(([, level]) => level === 'edit').map(([key]) => key as PermissionKey),
            visibleMenus: Object.keys(storedAccessLevels) as PermissionKey[],
            accessLevels: storedAccessLevels,
            dataScope: roleDef?.dataScope || 'team',
            status: (row.status === 'disabled' ? 'disabled' : 'active') as StaffMemberRecord['status'],
            createdAt: String(row.created_at || new Date().toISOString()),
            branch: row.branch || undefined,
            department: row.department || undefined,
            position: row.position || undefined,
            phone: row.phone || undefined,
            email: row.email || undefined,
            employeeId: row.employee_id || undefined,
            username: row.username || undefined,
            salary: row.salary || undefined,
            employmentDate: row.employment_date || undefined,
            lastLogin: row.last_login || undefined,
          }
        })

        if (nextStaff.length > 0) {
          setStaffMembers(nextStaff)
          updateState({ staffMembers: nextStaff })
        }
      } catch (err) {
        console.warn('Error loading staff from DB', err)
      }
    }

    loadFromDb()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.companyId, roles])

  const handleSearchDismiss = (event: React.FocusEvent<HTMLFormElement>) => {
    const nextTarget = event.relatedTarget as HTMLElement | null
    if (!event.currentTarget.contains(nextTarget) && !search) {
      setSearchOpen(false)
    }
  }

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    searchInputRef.current?.blur()
  }

  const loadStaffToForm = (staff: StaffMemberRecord, mode: 'view' | 'edit') => {
    setActiveStaff(staff)
    setDrawerMode(mode)
    setFirstName(staff.name.split(' ')[0] ?? '')
    setLastName(staff.name.split(' ').slice(1).join(' ') ?? '')
    setPhone(staff.phone || '')
    setEmail(staff.email || '')
    setDateOfBirth(staff.dateOfBirth || '')
    setGender(staff.gender || genderOptions[0])
    setPassportPhoto(staff.passportPhoto || '')
    setEmployeeId(staff.employeeId || '')
    setDepartment(staff.department || departmentOptions[0])
    setPosition(staff.position || positionOptions[0])
    setEmploymentDate(staff.employmentDate || new Date().toISOString().slice(0, 10))
    setSalary(staff.salary || '')
    setBranch(staff.branch || branchOptions[0])
    setUsername(staff.username || '')
    setRoleId(staff.roleId)
    setRoleTitle(staff.roleName)
    setAccessLevels(savedMenuAccess({ ...staff, role: staff.roleId })?.accessLevels || getRoleAccessLevels(roles.find((role) => role.id === staff.roleId)))
    setStatus(staff.status)
    setDrawerOpen(true)
  }

  const handleAddStaff = () => {
    const userLimit = seatLimitForSubscription(user?.subscriptionPlan, user?.subscriptionStatus)
    const currentUserCount = staffMembers.length + 1
    if (userLimit !== null && (userLimit === 0 || currentUserCount > userLimit)) {
      setUpgradeModalOpen(true)
      return
    }
    setDrawerMode('add')
    setAccessLevels(getRoleAccessLevels(roles.find((role) => role.id === roleId)))
    setDrawerOpen(true)
  }

  const saveStaff = async () => {
    const fullName = `${firstName} ${lastName}`.trim()
    if (!fullName) {
      setInlineNotice({ message: 'Enter a valid first and last name for the staff member.', tone: 'error' })
      return
    }

    const selectedRoleDefinition = roles.find((role) => role.id === roleId)
    const permissions = Object.entries(accessLevels).filter(([, level]) => level === 'edit').map(([key]) => key as PermissionKey)
    const visibleMenus = Object.keys(accessLevels) as PermissionKey[]
    const effectiveRoleTitle = selectedRoleDefinition?.name || roleTitle.trim() || 'Custom Role'
    const generatedPin = (drawerMode === 'edit' && activeStaff?.pin) ? activeStaff.pin : generatePin()
    const generatedStaffId = employeeId || (drawerMode === 'edit' && activeStaff?.staffId ? activeStaff.staffId : generateStaffId(fullName))

    if (drawerMode === 'add') {
      const userLimit = seatLimitForSubscription(user?.subscriptionPlan, user?.subscriptionStatus)
      const currentUserCount = staffMembers.length + 1
      if (userLimit !== null && (userLimit === 0 || currentUserCount > userLimit)) {
        setUpgradeModalOpen(true)
        return
      }
    }

    if (drawerMode === 'edit' && activeStaff) {
      const updatedStaff: StaffMemberRecord = {
        ...activeStaff,
        name: fullName,
        staffId: activeStaff.staffId || generatedStaffId,
        pin: activeStaff.pin || generatedPin,
        roleId,
        roleName: effectiveRoleTitle,
        permissions,
        visibleMenus,
        accessLevels,
        dataScope: selectedRoleDefinition?.dataScope || 'team',
        status,
        branch,
        department,
        position,
        phone,
        email,
        dateOfBirth,
        gender,
        passportPhoto,
        employeeId,
        username: username || generatedStaffId,
        salary,
        employmentDate,
      }

      const nextStaff = staffMembers.map((member) => (member.id === activeStaff.id ? updatedStaff : member))
      setStaffMembers(nextStaff)
      updateState({ staffMembers: nextStaff })
      setDrawerOpen(false)
      resetForm()

      const saveResult = await saveUserToDatabase({
        companyId: user?.companyId || '',
        staffId: activeStaff.staffId || generatedStaffId,
        username: username || generatedStaffId,
        pin: generatedPin,
        fullName,
        roleId,
        roleTitle: effectiveRoleTitle,
        accessLevels,
        email,
        phone,
        branch,
        department,
        position,
        employeeId,
        salary,
        employmentDate,
        status,
      })

      if (saveResult.success) {
        setSaveConfirmation({ name: updatedStaff.name, staffId: updatedStaff.staffId, pin: updatedStaff.pin, saved: true })
      } else {
        setSaveConfirmation({ name: updatedStaff.name, staffId: updatedStaff.staffId, pin: updatedStaff.pin, saved: false })
      }
      return
    }

    const newStaff: StaffMemberRecord = {
      id: `${generatedStaffId}-${Date.now()}`,
      name: fullName,
      staffId: generatedStaffId,
      pin: generatedPin,
      roleId,
      roleName: effectiveRoleTitle,
      permissions,
      visibleMenus,
      accessLevels,
      dataScope: selectedRoleDefinition?.dataScope || 'team',
      status,
      createdAt: new Date().toISOString(),
      branch,
      department,
      position,
      phone,
      email,
      dateOfBirth,
      gender,
      passportPhoto,
      employeeId,
      username: username || generatedStaffId,
      salary,
      employmentDate,
      lastLogin: 'Never',
    }

    const nextStaff = [newStaff, ...staffMembers]
    setStaffMembers(nextStaff)
    updateState({ staffMembers: nextStaff })
    setDrawerOpen(false)
    resetForm()

    const saveResult = await saveUserToDatabase({
      companyId: user?.companyId || '',
      staffId: generatedStaffId,
      username: username || generatedStaffId,
      pin: generatedPin,
      fullName,
      roleId,
      roleTitle: effectiveRoleTitle,
      accessLevels,
      email,
      phone,
      branch,
      department,
      position,
      employeeId,
      salary,
      employmentDate,
      status,
    })

    if (saveResult.success) {
      setSaveConfirmation({ name: fullName, staffId: generatedStaffId, pin: generatedPin, saved: true })
      addAuditLog('CREATE', 'STAFF', generatedStaffId, `Staff member created: ${fullName} | Role: ${effectiveRoleTitle}`)
    } else {
      setSaveConfirmation({ name: fullName, staffId: generatedStaffId, pin: generatedPin, saved: false })
    }
  }

  const toggleStatus = (id: string) => {
    const nextStaff = staffMembers.map((member) =>
      member.id === id ? { ...member, status: (member.status === 'active' ? 'disabled' : 'active') as StaffMemberRecord['status'] } : member
    )
    setStaffMembers(nextStaff)
    updateState({ staffMembers: nextStaff })
  }

  const removeStaff = (staffId: string) => {
    const nextStaff = staffMembers.filter((member) => member.id !== staffId)
    setStaffMembers(nextStaff)
    updateState({ staffMembers: nextStaff })
  }

  const togglePinVisibility = (staffId: string) => {
    setRevealedPins((current) => ({ ...current, [staffId]: !current[staffId] }))
  }

  return (
    <AppLayout>
      <div className="page-shell">
        <div className="page-hero">
          <div>
            <div className="eyebrow">Human Resources</div>
            <h1 className="page-title">Staff Management</h1>
            <p className="page-subtitle">Manage people, branches, roles, and access from a single polished workspace.</p>
          </div>
          <div className="page-actions">
            <BulkImport label="Bulk upload" tableColumns={['Name', 'Staff ID', 'PIN', 'Role', 'Branch', 'Status', 'Last Login', 'Action']} />
            <button className="action-btn primary allow-readonly" onClick={handleAddStaff}>Add Staff</button>
          </div>
        </div>

        {inlineNotice && <div className={`staff-inline-notice ${inlineNotice.tone}`} role="status">{inlineNotice.message}</div>}

        <div className="panel-card">
          <div className="panel-head">
            <div>
              <div className="panel-title"><Users size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} /> Staff Management</div>
              <div className="page-subtitle">Search, review active staff, and manage account status across your business.</div>
            </div>
            {searchOpen ? (
              <form
                className="search-field"
                style={{ maxWidth: 360 }}
                onSubmit={handleSearchSubmit}
                onBlur={handleSearchDismiss}
                role="search"
                aria-label="Search staff"
              >
                <input
                  ref={searchInputRef}
                  className="allow-readonly"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search staff by name, role, or branch..."
                  aria-label="Search staff"
                />
                <button type="submit" className="search-toggle" aria-label="Search staff">
                  <Search size={18} />
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="staff-search-toggle allow-readonly"
                onClick={() => setSearchOpen(true)}
                aria-label="Open staff search"
              >
                <Search size={18} />
              </button>
            )}
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Staff ID</th>
                  <th>PIN</th>
                  <th>Role</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 20 }}>
                      No staff match your search.
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map((member) => (
                    <tr key={member.id}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{member.name}</div>
                        <div className="metric-note">{member.email || `ID: ${member.staffId}`}</div>
                      </td>
                      <td>{member.staffId || '—'}</td>
                      <td>
                        <div className="inline-actions" style={{ justifyContent: 'flex-start', gap: 8 }}>
                          <span>{revealedPins[member.id] ? member.pin : '••••'}</span>
                          <button
                            className="action-btn"
                            type="button"
                            title={revealedPins[member.id] ? 'Hide PIN' : 'Show PIN'}
                            onClick={() => togglePinVisibility(member.id)}
                          >
                            {revealedPins[member.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </td>
                      <td>{member.roleName}</td>
                      <td>{member.branch || '—'}</td>
                      <td>
                        <span className={`badge ${member.status === 'active' ? 'b-green' : 'b-red'}`}>
                          {member.status === 'active' ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td>
                        {member.lastLogin
                          ? new Date(member.lastLogin).toLocaleString()
                          : 'Never'}
                      </td>
                      <td>
                        <div className="inline-actions" style={{ justifyContent: 'flex-start' }}>
                          <button
                            className="action-btn allow-readonly"
                            type="button"
                            title={revealedPins[member.id] ? 'Hide PIN' : 'Show PIN'}
                            onClick={() => togglePinVisibility(member.id)}
                          >
                            {revealedPins[member.id] ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                          <button className="action-btn allow-readonly" type="button" title="Edit staff account" onClick={() => loadStaffToForm(member, 'edit')}>
                            <Pencil size={18} />
                          </button>
                          <button
                            className="action-btn allow-readonly"
                            type="button"
                            title={member.status === 'active' ? 'Suspend staff' : 'Activate staff'}
                            onClick={() => toggleStatus(member.id)}
                          >
                            {member.status === 'active' ? <Lock size={18} /> : <Unlock size={18} />}
                          </button>
                          {user?.role === 'super-admin' && (
                            <button className="action-btn" type="button" title="Remove staff" onClick={() => removeStaff(member.id)}>
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="txn-pagination" style={{ justifyContent: 'space-between', marginTop: 16 }}>
            <div className="page-info">Showing {filteredStaff.length} staff member{filteredStaff.length === 1 ? '' : 's'}</div>
            <div className="page-controls">
              <button className="action-btn" type="button">←</button>
              <button className="action-btn" type="button">→</button>
            </div>
          </div>
        </div>
      </div>

      {drawerOpen && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDrawerOpen(false)
              resetForm()
            }
          }}
          style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15, 23, 42, 0.18)' }}
        >
          <div
            onMouseDown={(event) => event.stopPropagation()}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              height: '100%',
              width: '460px',
              maxWidth: '100%',
              background: 'var(--bg)',
              borderLeft: '1px solid var(--border)',
              boxShadow: '-12px 0 38px rgba(15, 23, 42, 0.14)',
              padding: 24,
              overflowY: 'auto',
            }}
          >
            <div className="panel-head" style={{ marginBottom: 20 }}>
              <div>
                <div className="panel-title">
                  {drawerMode === 'view' ? 'View staff details' : drawerMode === 'edit' ? 'Edit staff' : 'Add New Staff'}
                </div>
                <div className="page-subtitle">
                  {drawerMode === 'view'
                    ? 'Review the staff profile and assigned access.'
                    : drawerMode === 'edit'
                      ? 'Update role assignments and personal details.'
                      : 'Collect personal, employment, and access details in one flow.'}
                </div>
              </div>
              <button className="action-btn" type="button" onClick={() => {
                setDrawerOpen(false)
                resetForm()
              }}>
                Close
              </button>
            </div>

            <div className="panel-card">
              <div className="panel-title">Personal Information</div>
              <div className="form-grid two-up">
                <div className="fg"><label>First Name</label><input className="allow-readonly" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
                <div className="fg"><label>Last Name</label><input className="allow-readonly" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
                <div className="fg"><label>Phone</label><input className="allow-readonly" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
                <div className="fg"><label>Email</label><input className="allow-readonly" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div className="fg"><label>Date of Birth</label><input className="allow-readonly" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} /></div>
                <div className="fg"><label>Gender</label><select className="allow-readonly" value={gender} onChange={(e) => setGender(e.target.value)}>{genderOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                <div className="fg"><label>Passport Photo</label><input className="allow-readonly" value={passportPhoto} onChange={(e) => setPassportPhoto(e.target.value)} placeholder="Image URL" /></div>
              </div>
            </div>

            <div className="panel-card" style={{ marginTop: 18 }}>
              <div className="panel-title">Employment</div>
              <div className="form-grid two-up">
                <div className="fg"><label>Employee ID</label><input className="allow-readonly" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="Auto-generated if blank" /></div>
                <div className="fg"><label>Department</label><select className="allow-readonly" value={department} onChange={(e) => setDepartment(e.target.value)}>{departmentOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                <div className="fg"><label>Position</label><select className="allow-readonly" value={position} onChange={(e) => setPosition(e.target.value)}>{positionOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                <div className="fg"><label>Employment Date</label><input className="allow-readonly" type="date" value={employmentDate} onChange={(e) => setEmploymentDate(e.target.value)} /></div>
                <div className="fg"><label>Salary</label><input className="allow-readonly" value={salary} onChange={(e) => setSalary(e.target.value)} /></div>
                <div className="fg"><label>Branch</label><select className="allow-readonly" value={branch} onChange={(e) => setBranch(e.target.value)}>{branchOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
              </div>
            </div>

            <div className="panel-card" style={{ marginTop: 18 }}>
              <div className="panel-title">Role Assignment</div>
              <div className="form-grid two-up">
                <div className="fg">
                  <label>Role</label>
                  <select className="allow-readonly" value={roleId} onChange={(e) => handleStaffRoleChange(e.target.value)}>
                    {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                  </select>
                  <div className="metric-note" style={{ marginTop: 6 }}>This role controls the staff account and table display.</div>
                </div>
                <div className="fg"><label>Status</label><select className="allow-readonly" value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'disabled')}><option value="active">Active</option><option value="disabled">Inactive</option></select></div>
              </div>
              <div style={{ marginTop: 18 }}>
                <button
                  type="button"
                  className="staff-menu-access-toggle allow-readonly"
                  onClick={() => setMenuAccessOpen((current) => !current)}
                  aria-expanded={menuAccessOpen}
                  aria-controls="staff-menu-access-list"
                >
                  <span>
                    <span className="panel-title">Menu access</span>
                    <span className="metric-note">{Object.keys(accessLevels).length} menus configured</span>
                  </span>
                  <ChevronDown size={18} className={menuAccessOpen ? 'staff-menu-access-chevron open' : 'staff-menu-access-chevron'} aria-hidden="true" />
                </button>
                {menuAccessOpen && (
                  <div id="staff-menu-access-list" className="staff-menu-access-list">
                    <div className="metric-note" style={{ marginBottom: 12 }}>Choose whether this staff member cannot access, can view, or can edit each menu.</div>
                    <div className="permission-grid">
                      {permissionOptions.map((permission) => (
                        <div key={permission.key} className="permission-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <span>{permission.label}</span>
                          <div className="staff-access-picker">
                            <button
                              type="button"
                              className={`staff-access-trigger ${accessLevels[permission.key] ? 'has-value' : ''} allow-readonly`}
                              onClick={() => setOpenAccessMenu((current) => current === permission.key ? null : permission.key)}
                              aria-expanded={openAccessMenu === permission.key}
                              aria-haspopup="listbox"
                            >
                              {accessLevels[permission.key] === 'view' ? 'View only' : accessLevels[permission.key] === 'edit' ? 'Edit' : 'Select access'}
                              <span className="staff-access-chevron" aria-hidden="true">⌄</span>
                            </button>
                            {openAccessMenu === permission.key && (
                              <div className="staff-access-options" role="listbox" aria-label={`${permission.label} access`}>
                                {[
                                  { value: 'none', label: 'No access' },
                                  { value: 'view', label: 'View only' },
                                  { value: 'edit', label: 'Edit' },
                                ].map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    className={`staff-access-option ${(!accessLevels[permission.key] && option.value === 'none') || accessLevels[permission.key] === option.value ? 'selected' : ''}`}
                                    onClick={() => {
                                      setAccessLevels((current) => {
                                        const next = { ...current }
                                        if (option.value === 'none') delete next[permission.key]
                                        else next[permission.key] = option.value as 'view' | 'edit'
                                        return next
                                      })
                                      setOpenAccessMenu(null)
                                    }}
                                    role="option"
                                    aria-selected={(!accessLevels[permission.key] && option.value === 'none') || accessLevels[permission.key] === option.value}
                                  >
                                    <span>{option.label}</span>
                                    {((!accessLevels[permission.key] && option.value === 'none') || accessLevels[permission.key] === option.value) && <span aria-hidden="true">✓</span>}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="panel-card" style={{ marginTop: 18 }}>
              <div className="panel-title">Login Credentials</div>
              <div className="form-grid two-up">
                <div className="fg"><label>Login ID</label><input className="allow-readonly" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Auto-generated if blank" /></div>
                <div className="fg">
                  <label>Auto-generated PIN</label>
                  <input className="allow-readonly" value={drawerMode === 'edit' && activeStaff?.pin ? activeStaff.pin : 'Generated on save'} readOnly />
                  <div className="metric-note" style={{ marginTop: 6 }}>The system creates a 4-digit PIN automatically for sign-in.</div>
                </div>
              </div>
            </div>

            <div className="inline-actions" style={{ marginTop: 24, justifyContent: 'space-between' }}>
              <button className="action-btn allow-readonly" type="button" onClick={() => {
                setDrawerOpen(false)
                resetForm()
              }}>
                Cancel
              </button>
              <button className="action-btn primary allow-readonly" type="button" onClick={saveStaff}>
                {drawerMode === 'edit' ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {saveConfirmation && (
        <div className="staff-save-confirmation" role="status" aria-live="polite">
          <div className="staff-save-icon"><ThumbsUp size={22} /></div>
          <strong>{saveConfirmation.saved ? 'Staff created successfully' : 'Staff saved locally'}</strong>
          <span>{saveConfirmation.name}</span>
          <div className="staff-credential-preview">
            <span>Staff ID <b>{saveConfirmation.staffId}</b></span>
            <span>PIN <b>{saveConfirmation.pin}</b></span>
          </div>
        </div>
      )}

      {upgradeModalOpen && (
        <div className="staff-upgrade-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setUpgradeModalOpen(false)
        }}>
          <div className="staff-upgrade-modal" role="dialog" aria-modal="true" aria-labelledby="staff-upgrade-title">
            <div className="staff-upgrade-icon"><Lock size={20} /></div>
            <strong id="staff-upgrade-title">User limit reached</strong>
            <p>Your Professional plan allows up to 5 users. Upgrade to add more staff.</p>
            <div className="staff-upgrade-actions">
              <button className="action-btn" type="button" onClick={() => setUpgradeModalOpen(false)}>Cancel</button>
              <button className="action-btn primary" type="button" onClick={() => { window.location.href = '/subscription-and-licensing' }}>Upgrade</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
