'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import AppLayout from '@/components/layout/app-layout'
import BulkImport from '@/components/bulk-import'
import { useAccounting, type BankAccount, type CompanySettings, type UserSettings } from '@/lib/context'
import { formatCurrency } from '@/lib/utils'
import { canEditPermission, getDefaultRoles, saveRoles, type RoleDefinition, type PermissionKey } from '@/lib/rbac'
import { CLOSE_ACCOUNT_PHRASE, isSuperAdminRole, wipedCompanyBooks, wipeConfirmationPhrase } from '@/lib/company-lifecycle'
import { parseSpreadsheetFile, prepareGenericImportPayload, type ImportSummary } from '@/lib/import-utils'
import { dedupeChartOfAccounts, requiredFinancialPositionAccounts } from '@/lib/accounting/chart-of-accounts'

const sidebarSections = [
  { id: 'company', label: 'Company', description: 'Profile, branding, and legal details' },
  { id: 'business', label: 'Business', description: 'Defaults, dates, and workflow' },
  { id: 'opening-balances', label: 'Opening Balances', description: 'Opening position for assets, liabilities, and equity' },
  { id: 'notifications', label: 'Notifications', description: 'Email, push, and WhatsApp' },
  { id: 'security', label: 'Security', description: 'Auth, sessions, and policies' },
  { id: 'banks', label: 'Banks', description: 'Create and manage bank accounts' },
  { id: 'ai', label: 'AI Assistant', description: 'Automation and insights' },
  { id: 'account', label: 'Account', description: 'Delete company data or close the account', superAdmin: true },
]

export default function SettingsPage() {
  const { state, updateState, addAuditLog, user, logout } = useAccounting()
  const defaultUserSettings: UserSettings = {
    dateFormat: 'DD/MM/YYYY', timezone: 'Africa/Lagos',
    notifications: { email: true, push: true, whatsapp: true },
    sessionTimeout: 20, compactMode: false,
  }
  const [userSettings, setUserSettings] = useState<UserSettings>({ ...defaultUserSettings, ...(user?.userSettings || {}), notifications: { ...defaultUserSettings.notifications, ...(user?.userSettings?.notifications || {}) } })
  const [userSettingsStatus, setUserSettingsStatus] = useState<{ tone: 'error' | 'success'; message: string } | null>(null)
  const companySettings = state.companySettings
  const [openingCapital, setOpeningCapital] = useState(state.openingCapital)
  const [openingBalanceDrafts, setOpeningBalanceDrafts] = useState<Record<string, number>>({})
  const [openingDateDrafts, setOpeningDateDrafts] = useState<Record<string, string>>({})
  const [activeSection, setActiveSection] = useState('security')
  const [roles, setRoles] = useState<RoleDefinition[]>(state.roles || getDefaultRoles())
  const [roleName, setRoleName] = useState('Sales Supervisor')
  const [roleTemplate, setRoleTemplate] = useState('Custom')
  const [rolePermissions, setRolePermissions] = useState<PermissionKey[]>(['dashboard', 'sales'])
  const [previewRoleId, setPreviewRoleId] = useState<string>('cashier')
  const [showImportModal, setShowImportModal] = useState(false)
  const [importRows, setImportRows] = useState<Record<string, unknown>[]>([])
  const [importFileName, setImportFileName] = useState('')
  const [importError, setImportError] = useState('')
  const [importProgress, setImportProgress] = useState(0)
  const [importStatus, setImportStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinStatus, setPinStatus] = useState<{ tone: 'error' | 'success'; message: string } | null>(null)
  const [newBankName, setNewBankName] = useState('')
  const [newBankAccountName, setNewBankAccountName] = useState('')
  const [newBankAccountNumber, setNewBankAccountNumber] = useState('')
  const [newBankAccountType, setNewBankAccountType] = useState('Current')
  const [newBankCurrency, setNewBankCurrency] = useState('NGN')
  const [newBankOpeningBalance, setNewBankOpeningBalance] = useState(0)
  const [newBankOpeningDate, setNewBankOpeningDate] = useState(new Date().toISOString().slice(0, 10))
  const [bankCreationStatus, setBankCreationStatus] = useState('')
  const [settingsNotice, setSettingsNotice] = useState<{ tone: 'error' | 'success'; message: string } | null>(null)
  const [wipeConfirm, setWipeConfirm] = useState('')
  const [closeConfirm, setCloseConfirm] = useState('')
  const [lifecycleStatus, setLifecycleStatus] = useState<{ tone: 'error' | 'success'; message: string } | null>(null)
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const canManageCompanySettings = canEditPermission(user, 'settings')
  const isSuperAdmin = isSuperAdminRole(user?.role)
  const visibleSections = sidebarSections.filter((section) => !section.superAdmin || isSuperAdmin)
  const sectionChosen = useRef(false)

  useEffect(() => {
    setUserSettings({ ...defaultUserSettings, ...(user?.userSettings || {}), notifications: { ...defaultUserSettings.notifications, ...(user?.userSettings?.notifications || {}) } })
  }, [user?.userSettings])

  useEffect(() => {
    if (sectionChosen.current || !canManageCompanySettings) return
    sectionChosen.current = true
    setActiveSection('company')
  }, [canManageCompanySettings])

  const selectedRole = useMemo(() => roles.find((role) => role.id === previewRoleId) || roles[0], [previewRoleId, roles])

  const updateCompanySettings = (updates: Partial<CompanySettings>) => {
    updateState({ companySettings: { ...companySettings, ...updates } })
  }

  const updateNestedSetting = <K extends 'notifications' | 'security' | 'integrations' | 'ai'>(section: K, updates: Partial<CompanySettings[K]>) => {
    updateCompanySettings({ [section]: { ...companySettings[section], ...updates } } as Pick<CompanySettings, K>)
  }

  const handleSaveOpeningCapital = () => {
    const value = parseFloat(openingCapital as any) || 0
    updateState({ openingCapital: value, companySettings: { ...companySettings, openingCapital: value } })
    setSettingsNotice({ tone: 'success', message: 'Opening capital saved.' })
  }

  const financialPositionAccounts = useMemo(() => {
    const missingAccounts = requiredFinancialPositionAccounts.filter((required) => !state.chartOfAccounts.some((account) => account.name.toLowerCase() === required.name.toLowerCase()))
    return dedupeChartOfAccounts([...state.chartOfAccounts, ...missingAccounts]).filter((account) => ['ASSET', 'LIABILITY', 'EQUITY'].includes(account.accountType))
  }, [state.chartOfAccounts])

  const handleSaveOpeningBalances = () => {
    const mergedChartOfAccounts = dedupeChartOfAccounts([
      ...state.chartOfAccounts,
      ...requiredFinancialPositionAccounts.map((account) => ({ ...account, openingBalance: 0, openingBalanceDate: null })),
    ]).map((account) => {
      if (!['ASSET', 'LIABILITY', 'EQUITY'].includes(account.accountType)) return account
      return {
        ...account,
        openingBalance: openingBalanceDrafts[account.id] ?? account.openingBalance ?? 0,
        openingBalanceDate: openingDateDrafts[account.id] ?? account.openingBalanceDate ?? null,
      }
    })
    updateState({ chartOfAccounts: mergedChartOfAccounts })
    addAuditLog('UPDATE', 'ACCOUNTING', 'OPENING_BALANCES', 'Financial-position opening balances updated.')
    setSettingsNotice({ tone: 'success', message: 'Opening balances saved.' })
  }

  const openImportModal = () => {
    setShowImportModal(true)
    setImportRows([])
    setImportFileName('')
    setImportError('')
    setImportProgress(0)
    setImportStatus('idle')
    setImportSummary(null)
  }

  const closeImportModal = () => {
    setShowImportModal(false)
    setImportError('')
    setImportProgress(0)
    setImportStatus('idle')
    setImportSummary(null)
  }

  const handleSettingsFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setImportError('')
    setImportProgress(0)
    setImportStatus('idle')
    setImportSummary(null)

    if (!file.name.match(/\.(csv|xls|xlsx)$/i)) {
      setImportError('Please upload a CSV or Excel file (.csv, .xls, .xlsx).')
      setImportRows([])
      setImportFileName('')
      return
    }

    try {
      const rows = await parseSpreadsheetFile(file)
      if (rows.length === 0) {
        setImportError('No rows were found in the selected file.')
        setImportRows([])
        setImportFileName(file.name)
        return
      }
      setImportRows(rows)
      setImportFileName(file.name)
      setImportError('')
    } catch (error) {
      setImportError('Unable to parse the spreadsheet. Please verify the file format and try again.')
      setImportRows([])
      setImportFileName(file.name)
    }
  }

  const postJsonWithProgress = (url: string, body: unknown, onProgress: (percentage: number) => void) => {
    return new Promise<any>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', url)
      xhr.setRequestHeader('Content-Type', 'application/json')

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 80))
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText))
          } catch (error) {
            reject(new Error('Invalid server response'))
          }
        } else {
          reject(new Error(xhr.responseText || `Upload failed with status ${xhr.status}`))
        }
      }

      xhr.onerror = () => {
        reject(new Error('Network error during upload.'))
      }

      xhr.send(JSON.stringify(body))
    })
  }

  const handleImportUpload = async () => {
    if (importRows.length === 0) {
      setImportError('Please select a spreadsheet to import.')
      return
    }

    setImportError('')
    setImportStatus('uploading')
    setIsImporting(true)
    setImportProgress(8)

    try {
      const { payload, summary } = prepareGenericImportPayload(importRows)
      setImportSummary(summary)

      const result = await postJsonWithProgress('/api/import', { ...payload, companyId: user?.companyId, staffId: user?.staffId }, (percent) => {
        setImportProgress(percent)
      })

      if (!result?.success) {
        throw new Error(result?.error || 'Import failed')
      }

      setImportProgress(100)
      setImportStatus('success')
      setTimeout(() => setImportProgress(100), 200)

      const nextCustomerList = Array.from(
        new Set([
          ...state.customerList,
          ...(payload.contacts || []).filter((item: any) => item.type === 'customer').map((item: any) => String(item.name || '')),
        ])
      ).filter(Boolean)
      const nextSupplierList = Array.from(
        new Set([
          ...state.supplierList,
          ...(payload.contacts || []).filter((item: any) => item.type === 'supplier').map((item: any) => String(item.name || '')),
        ])
      ).filter(Boolean)

      const nextInventory = [
        ...state.inventory,
        ...(payload.products || []).map((product: any) => ({
          product: String(product.name || product.sku || 'Imported Item'),
          dept: String(product.category || product.dept || 'General'),
          openQty: Number(product.stock_qty || product.openQty || product.closing || 0),
          purchased: Number(product.purchased || 0),
          sold: Number(product.sold || 0),
          unitCost: Number(product.unit_cost || product.unitCost || 0),
          closing: Number(product.stock_qty || product.closing || 0),
        })),
      ]

      const nextStaff = [...state.staffMembers, ...(payload.staff || []).map((staff: any) => ({
        id: staff.id || '',
        name: String(staff.name || staff.fullName || staff.full_name || 'Imported Staff'),
        staffId: String(staff.staffId || staff.employeeId || staff.employee_id || ''),
        pin: String(staff.pin || ''),
        roleId: String(staff.roleId || staff.role_id || staff.role || 'staff'),
        roleName: String(staff.roleName || staff.role_name || staff.role || 'Staff'),
        permissions: staff.permissions || ['dashboard'],
        dataScope: staff.dataScope || 'team',
        status: staff.status || 'active',
        createdAt: String(staff.createdAt || staff.created_at || new Date().toISOString()),
        username: String(staff.username || ''),
        branch: String(staff.branch || ''),
        department: String(staff.department || ''),
        position: String(staff.position || ''),
        phone: String(staff.phone || ''),
        email: String(staff.email || ''),
      }))]

      updateState({
        sales: [...state.sales, ...((payload.sales || []) as any[])],
        purchases: [...state.purchases, ...((payload.purchases || []) as any[])],
        inventory: nextInventory,
        supplierList: nextSupplierList,
        customerList: nextCustomerList,
        staffMembers: nextStaff,
      }, { persist: false })

      addAuditLog(
        'IMPORT',
        'SETTINGS',
        'GENERIC_IMPORT',
        `Imported ${importFileName} with ${summary.sales} sales, ${summary.purchases} purchases, ${summary.products} inventory, ${summary.staff} staff, ${summary.contacts} contacts.`
      )
    } catch (error) {
      setImportStatus('error')
      setImportError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsImporting(false)
    }
  }

  const handleImportAction = () => {
    if (importStatus === 'success') {
      closeImportModal()
      return
    }

    void handleImportUpload()
  }

  const handleCreateRole = () => {
    const nextRole: RoleDefinition = {
      id: roleName.toLowerCase().replace(/\s+/g, '-'),
      name: roleName,
      description: `${roleName} role`,
      permissions: rolePermissions,
      dataScope: 'team',
      template: roleTemplate,
    }
    const nextRoles = [...roles, nextRole]
    setRoles(nextRoles)
    updateState({ roles: nextRoles, companySettings: { ...companySettings, roles: nextRoles } })
    saveRoles(nextRoles)
    setSettingsNotice({ tone: 'success', message: `Role ${roleName} created.` })
  }

  const clearCompanyStorage = () => {
    const companyId = user?.companyId
    if (companyId) {
      localStorage.removeItem(`hw_accounting_data:${companyId}`)
      sessionStorage.removeItem(`hw_accounting_data:${companyId}`)
    }
    localStorage.removeItem('hw_accounting_data')
    sessionStorage.removeItem('hw_accounting_data')
  }

  const runLifecycle = async (action: 'wipe' | 'close') => {
    const phrase = action === 'close' ? CLOSE_ACCOUNT_PHRASE : wipeConfirmationPhrase(companySettings.companyName)
    const typed = action === 'close' ? closeConfirm : wipeConfirm
    if (typed.trim() !== phrase) {
      setLifecycleStatus({ tone: 'error', message: action === 'close' ? 'Type CLOSE to confirm.' : `Type ${phrase} to confirm.` })
      return
    }
    setLifecycleBusy(true)
    setLifecycleStatus(null)
    try {
      let database = 'skipped'
      if (user?.companyId) {
        const response = await fetch('/api/company/lifecycle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, companyId: user.companyId, staffId: user.staffId, username: user.username }),
        })
        const result = await response.json()
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to update the company.')
        database = result.database || 'cleared'
      }
      if (action === 'close') {
        clearCompanyStorage()
        logout()
        return
      }
      clearCompanyStorage()
      updateState(wipedCompanyBooks(state))
      setOpeningCapital(0)
      setWipeConfirm('')
      setCloseConfirm('')
      const databaseNote = database === 'skipped' ? ' This browser was cleared. The database was not connected.' : ' The database was cleared as well.'
      setLifecycleStatus({ tone: 'success', message: `Company data was removed. The company and staff sign-in remain.${databaseNote}` })
    } catch (error) {
      setLifecycleStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to update the company.' })
    } finally {
      setLifecycleBusy(false)
    }
  }

  const handleCreateBank = () => {
    const institution = newBankName.trim()
    const accountName = newBankAccountName.trim()
    if (!institution || !accountName) {
      setBankCreationStatus('Enter both a bank name and account name.')
      return
    }
    const accountKey = `${institution} — ${accountName}`
    if (state.bankAccounts.some((account) => account.name === accountKey) || state.banks[accountKey] !== undefined) {
      setBankCreationStatus('This bank account already exists.')
      return
    }
    const account: BankAccount = {
      id: crypto.randomUUID(), name: accountKey, institution,
      accountNumber: newBankAccountNumber.trim(), accountType: newBankAccountType,
      currency: newBankCurrency, branch: '', openingBalance: newBankOpeningBalance,
      openingBalanceDate: newBankOpeningDate, balance: newBankOpeningBalance, status: 'active',
    }
    updateState({ banks: { ...state.banks, [account.name]: account.balance }, bankAccounts: [...state.bankAccounts, account] })
    addAuditLog('CREATE', 'BANK', accountKey, `Created ${newBankAccountType.toLowerCase()} bank account.`)
    setNewBankName(''); setNewBankAccountName(''); setNewBankAccountNumber(''); setNewBankAccountType('Current')
    setNewBankCurrency('NGN'); setNewBankOpeningBalance(0); setNewBankOpeningDate(new Date().toISOString().slice(0, 10))
    setBankCreationStatus(`${accountKey} was created and is now available in Bank Balances.`)
  }

  const togglePermission = (permission: PermissionKey) => {
    setRolePermissions((current) =>
      current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]
    )
  }

  const handlePinChange = async () => {
    setPinStatus(null)
    if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) {
      setPinStatus({ tone: 'error', message: 'PINs must be exactly four digits.' })
      return
    }
    if (newPin !== confirmPin) {
      setPinStatus({ tone: 'error', message: 'New PIN and confirmation do not match.' })
      return
    }

    try {
      const response = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: user?.companyId, staffId: user?.staffId, username: user?.username, currentPin, newPin }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to update PIN.')

      const storage = localStorage.getItem('hw_auth_user') ? localStorage : sessionStorage
      storage.setItem('hw_auth_user', JSON.stringify({ ...user, pin: newPin }))
      const nextStaff = state.staffMembers.map((member) => member.staffId === user?.staffId ? { ...member, pin: newPin } : member)
      updateState({ staffMembers: nextStaff })
      setCurrentPin('')
      setNewPin('')
      setConfirmPin('')
      setPinStatus({ tone: 'success', message: 'PIN updated. Staff Management now shows the new PIN.' })
      addAuditLog('UPDATE', 'USER', user?.staffId || user?.username || 'CURRENT_USER', 'Personal PIN updated.')
    } catch (error) {
      setPinStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to update PIN.' })
    }
  }

  const handleUserSettingsSave = async () => {
    setUserSettingsStatus(null)
    try {
      const response = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: user?.companyId, staffId: user?.staffId, username: user?.username, userSettings }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save account settings.')
      const storage = localStorage.getItem('hw_auth_user') ? localStorage : sessionStorage
      const nextUser = { ...user, userSettings: result.userSettings || userSettings }
      storage.setItem('hw_auth_user', JSON.stringify(nextUser))
      setUserSettings(result.userSettings || userSettings)
      window.dispatchEvent(new CustomEvent('quantixa:user-settings-updated', { detail: result.userSettings || userSettings }))
      setUserSettingsStatus({ tone: 'success', message: 'Your account settings were saved.' })
    } catch (error) {
      setUserSettingsStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to save account settings.' })
    }
  }

  return (
    <AppLayout>
      <div className="page-shell">
        <div className="page-hero">
          <div>
            <div className="eyebrow">Workspace</div>
            <h1 className="page-title">Settings</h1>
            <p className="page-subtitle">{companySettings.companyName || 'Your company'} · {companySettings.currency || 'NGN'} · {user?.name || 'Signed-in account'}</p>
          </div>
          <BulkImport label="Import data" tableColumns={['Sales', 'Purchases', 'Inventory', 'Staff', 'Contacts']} />
        </div>

        <div className={`settings-layout ${canManageCompanySettings ? '' : 'settings-layout-personal'}`}>
          {canManageCompanySettings && <aside className="settings-sidebar">
            {visibleSections.map((section) => (
              <button
                key={section.id}
                className={`sidebar-item ${section.id === 'account' ? 'account' : ''} ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                <span className="sidebar-title">{section.label}</span>
                <span className="sidebar-subtitle">{section.description}</span>
              </button>
            ))}
          </aside>}

          <div className="settings-content">
            {activeSection === 'company' && (
              <div className="panel-card">
                <div className="panel-title">Company profile</div>
                <div className="form-grid two-up">
                  <div className="fg"><label>Business name</label><input value={companySettings.companyName} onChange={(event) => updateCompanySettings({ companyName: event.target.value })} /></div>
                  <div className="fg"><label>RC Number</label><input value={companySettings.registrationNumber} onChange={(event) => updateCompanySettings({ registrationNumber: event.target.value })} /></div>
                  <div className="fg"><label>TIN</label><input value={companySettings.tin} onChange={(event) => updateCompanySettings({ tin: event.target.value })} /></div>
                  <div className="fg"><label>Country</label><input value={companySettings.country} onChange={(event) => updateCompanySettings({ country: event.target.value })} /></div>
                  <div className="fg"><label>Currency</label><input value={companySettings.currency} onChange={(event) => updateCompanySettings({ currency: event.target.value })} /></div>
                  <div className="fg"><label>Timezone</label><input value={companySettings.timezone} onChange={(event) => updateCompanySettings({ timezone: event.target.value })} /></div>
                </div>
              </div>
            )}

            {activeSection === 'business' && (
              <div className="panel-card">
                <div className="panel-title">Business preferences</div>
                <div className="form-grid two-up">
                  <div className="fg"><label>Decimal Places</label><input type="number" min={0} max={6} value={companySettings.decimalPlaces} onChange={(event) => updateCompanySettings({ decimalPlaces: Number(event.target.value) })} /></div>
                  <div className="fg"><label>Date Format</label><select value={companySettings.dateFormat} onChange={(event) => updateCompanySettings({ dateFormat: event.target.value })}><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></select></div>
                  <label className="toggle-row"><span>Tax Inclusive</span><input type="checkbox" checked={companySettings.taxInclusive} onChange={(event) => updateCompanySettings({ taxInclusive: event.target.checked })} /></label>
                  <div className="fg"><label>Default Branch</label><input value={companySettings.defaultBranch} onChange={(event) => updateCompanySettings({ defaultBranch: event.target.value })} /></div>
                </div>
                <div className="form-stack">
                  <div className="fg">
                    <label>Opening balance / capital</label>
                    <div className="inline-actions">
                      <input type="number" value={openingCapital} onChange={(e) => setOpeningCapital(parseFloat(e.target.value) || 0)} />
                      <button className="action-btn primary" onClick={handleSaveOpeningCapital}>Save</button>
                    </div>
                    <div className="metric-note">Current: {formatCurrency(state.openingCapital)}</div>
                  </div>
                </div>
                {settingsNotice && activeSection === 'business' && <div className={`staff-inline-notice ${settingsNotice.tone}`}>{settingsNotice.message}</div>}
              </div>
            )}

            {activeSection === 'opening-balances' && (
              <div className="panel-card">
                <div className="panel-head">
                  <div>
                    <div className="panel-title">Financial-position opening balances</div>
                    <div className="panel-subtitle">Enter the balances brought forward for every asset, liability, and equity account.</div>
                  </div>
                  <button className="action-btn primary" type="button" onClick={handleSaveOpeningBalances}>Save opening balances</button>
                </div>
                {settingsNotice && <div className={`staff-inline-notice ${settingsNotice.tone}`}>{settingsNotice.message}</div>}
                <div className="bank-account-register">
                  <div className="bank-register-row bank-register-head"><span>Account</span><span>Type</span><span>Opening balance</span><span>Balance date</span></div>
                  {financialPositionAccounts.map((account) => (
                    <div className="bank-register-row" key={account.id}>
                      <span><strong>{account.name}</strong><small>{account.accountSubType || 'Financial position'}</small></span>
                      <span>{account.accountType}</span>
                      <span><input type="number" min={0} step="0.01" value={openingBalanceDrafts[account.id] ?? account.openingBalance ?? 0} onChange={(event) => setOpeningBalanceDrafts((current) => ({ ...current, [account.id]: Number(event.target.value || 0) }))} /></span>
                      <span><input type="date" value={openingDateDrafts[account.id] ?? account.openingBalanceDate ?? ''} onChange={(event) => setOpeningDateDrafts((current) => ({ ...current, [account.id]: event.target.value }))} /></span>
                    </div>
                  ))}
                  {financialPositionAccounts.length === 0 && <div className="metric-note bank-empty-state">No financial-position accounts are available yet. Complete chart-of-accounts setup first.</div>}
                </div>
              </div>
            )}

            {activeSection === 'notifications' && (
              <div className="panel-card">
                <div className="panel-title">Notification settings</div>
                <div className="toggle-list">
                  {([['email', 'Email'], ['push', 'Push notifications'], ['whatsapp', 'WhatsApp']] as const).map(([key, label]) => <label className="toggle-row" key={key}><span>{label}</span><input type="checkbox" checked={companySettings.notifications[key]} onChange={(event) => updateNestedSetting('notifications', { [key]: event.target.checked })} /></label>)}
                </div>
                <p className="metric-note">In-app alerts follow the push setting. Email and WhatsApp preferences are saved on the account; this workspace does not send those messages.</p>
              </div>
            )}

            {activeSection === 'security' && (
              <div className="settings-security-stack">
                <div className="panel-card">
                  <div className="panel-title">My account preferences</div>
                  <div className="panel-subtitle">These preferences belong to {user?.name || 'your account'} only and do not change the Super Admin or company settings.</div>
                  <div className="form-grid two-up">
                    <div className="fg"><label>Date format</label><select value={userSettings.dateFormat} onChange={(event) => setUserSettings((current) => ({ ...current, dateFormat: event.target.value }))}><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></select></div>
                    <div className="fg"><label>Timezone</label><input value={userSettings.timezone} onChange={(event) => setUserSettings((current) => ({ ...current, timezone: event.target.value }))} /></div>
                    <div className="fg"><label>Session timeout (minutes)</label><input type="number" min={5} max={240} value={userSettings.sessionTimeout} onChange={(event) => setUserSettings((current) => ({ ...current, sessionTimeout: Number(event.target.value || 20) }))} /></div>
                  </div>
                  <div className="toggle-list">
                    {([['email', 'Email'], ['push', 'Push notifications'], ['whatsapp', 'WhatsApp']] as const).map(([key, label]) => <label className="toggle-row" key={key}><span>{label}</span><input type="checkbox" checked={userSettings.notifications[key]} onChange={(event) => setUserSettings((current) => ({ ...current, notifications: { ...current.notifications, [key]: event.target.checked } }))} /></label>)}
                    <label className="toggle-row"><span>Compact layout</span><input type="checkbox" checked={userSettings.compactMode} onChange={(event) => setUserSettings((current) => ({ ...current, compactMode: event.target.checked }))} /></label>
                    <p className="metric-note">Push controls the bell. Email and WhatsApp stay on your account until a sender is connected.</p>
                  </div>
                  {userSettingsStatus && <div className={`staff-inline-notice ${userSettingsStatus.tone}`}>{userSettingsStatus.message}</div>}
                  <button className="action-btn primary allow-readonly" type="button" onClick={() => void handleUserSettingsSave()}>Save my settings</button>
                </div>
                <div className="panel-card">
                  <div className="panel-title">Change personal PIN</div>
                  <div className="panel-subtitle">Update the four-digit PIN used to sign in. This change is written to your staff account.</div>
                  <div className="form-grid two-up pin-form">
                    <div className="fg"><label>Current PIN</label><input inputMode="numeric" maxLength={4} pattern="[0-9]*" type="password" value={currentPin} onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, '').slice(0, 4))} /></div>
                    <div className="fg"><label>New PIN</label><input inputMode="numeric" maxLength={4} pattern="[0-9]*" type="password" value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 4))} /></div>
                    <div className="fg"><label>Confirm new PIN</label><input inputMode="numeric" maxLength={4} pattern="[0-9]*" type="password" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 4))} /></div>
                  </div>
                  {pinStatus && <div className={`staff-inline-notice ${pinStatus.tone}`}>{pinStatus.message}</div>}
                  <button className="action-btn primary allow-readonly" type="button" onClick={() => void handlePinChange()}>Update PIN</button>
                </div>
                {canManageCompanySettings && <div className="panel-card">
                  <div className="panel-title">Security controls</div>
                  <div className="toggle-list">
                    <label className="toggle-row"><span>Two-factor authentication</span><input type="checkbox" checked={companySettings.security.twoFactor} onChange={(event) => updateNestedSetting('security', { twoFactor: event.target.checked })} /></label>
                    <label className="toggle-row"><span>Session timeout (minutes)</span><input type="number" min={5} max={240} value={companySettings.security.sessionTimeout} onChange={(event) => updateNestedSetting('security', { sessionTimeout: Number(event.target.value) })} /></label>
                    <label className="toggle-row"><span>Audit logs</span><input type="checkbox" checked={companySettings.security.auditLogs} onChange={(event) => updateNestedSetting('security', { auditLogs: event.target.checked })} /></label>
                    <label className="toggle-row"><span>IP restrictions</span><input type="checkbox" checked={companySettings.security.ipRestrictions} onChange={(event) => updateNestedSetting('security', { ipRestrictions: event.target.checked })} /></label>
                  </div>
                </div>}
              </div>
            )}

            {activeSection === 'banks' && (
              <div className="panel-card">
                <div className="panel-title">Create bank account</div>
                <div className="panel-subtitle">Add an account here and it will appear immediately on the Bank Balances page.</div>
                <div className="form-grid two-up">
                  <div className="fg"><label>Bank name</label><input value={newBankName} onChange={(event) => setNewBankName(event.target.value)} placeholder="e.g. Zenith Bank" /></div>
                  <div className="fg"><label>Account name</label><input value={newBankAccountName} onChange={(event) => setNewBankAccountName(event.target.value)} placeholder="Main Business Account" /></div>
                  <div className="fg"><label>Account number <small>(optional)</small></label><input value={newBankAccountNumber} onChange={(event) => setNewBankAccountNumber(event.target.value.replace(/\D/g, '').slice(0, 20))} inputMode="numeric" placeholder="0123456789" /></div>
                  <div className="fg"><label>Account type</label><select value={newBankAccountType} onChange={(event) => setNewBankAccountType(event.target.value)}><option>Current</option><option>Savings</option><option>Cash</option><option>Wallet</option><option>Other</option></select></div>
                  <div className="fg"><label>Currency</label><select value={newBankCurrency} onChange={(event) => setNewBankCurrency(event.target.value)}><option>NGN</option><option>USD</option><option>GBP</option></select></div>
                  <div className="fg"><label>Opening balance</label><input type="number" min={0} step="0.01" value={newBankOpeningBalance} onChange={(event) => setNewBankOpeningBalance(Number(event.target.value || 0))} /></div>
                  <div className="fg"><label>Opening balance date</label><input type="date" value={newBankOpeningDate} onChange={(event) => setNewBankOpeningDate(event.target.value)} /></div>
                </div>
                {bankCreationStatus && <div className="metric-note">{bankCreationStatus}</div>}
                <button className="action-btn primary" type="button" onClick={handleCreateBank}>Create bank account</button>
                <div className="bank-account-register settings-bank-register">
                  <div className="bank-register-row bank-register-head"><span>Account</span><span>Type</span><span>Opening balance</span><span>Status</span></div>
                  {state.bankAccounts.map((account) => <div className="bank-register-row" key={account.id}><span><strong>{account.name}</strong><small>{account.accountNumber || 'No account number'}</small></span><span>{account.accountType}</span><span>{formatCurrency(account.openingBalance)}</span><span>{account.status}</span></div>)}
                  {state.bankAccounts.length === 0 && <div className="metric-note bank-empty-state">No bank accounts have been created yet.</div>}
                </div>
              </div>
            )}

            {activeSection === 'account' && isSuperAdmin && (
              <div className="settings-account">
                <div className="panel-card">
                  <div className="panel-title">Company controls</div>
                  <p className="panel-subtitle">These actions are limited to the Super Admin. Staff with other roles cannot see or run them.</p>
                </div>
                <div className="settings-danger-card">
                  <div>
                    <div className="panel-title">Delete company data</div>
                    <p>Removes sales, expenses, stock, banks, journals, customers, suppliers, and balances from this workspace and the database. The company, its name, and staff sign-in stay.</p>
                  </div>
                  <label className="fg">
                    <span>Type {wipeConfirmationPhrase(companySettings.companyName)} to confirm</span>
                    <input value={wipeConfirm} onChange={(event) => setWipeConfirm(event.target.value)} autoComplete="off" />
                  </label>
                  <button className="action-btn danger" type="button" disabled={lifecycleBusy || wipeConfirm.trim() !== wipeConfirmationPhrase(companySettings.companyName)} onClick={() => void runLifecycle('wipe')}>{lifecycleBusy ? 'Working…' : 'Delete company data'}</button>
                </div>
                <div className="settings-danger-card severe">
                  <div>
                    <div className="panel-title">Close account</div>
                    <p>Deletes the company and every record, including staff, from this workspace and the database. You will be signed out.</p>
                  </div>
                  <label className="fg">
                    <span>Type {CLOSE_ACCOUNT_PHRASE} to confirm</span>
                    <input value={closeConfirm} onChange={(event) => setCloseConfirm(event.target.value)} autoComplete="off" />
                  </label>
                  <button className="action-btn danger" type="button" disabled={lifecycleBusy || closeConfirm.trim() !== CLOSE_ACCOUNT_PHRASE} onClick={() => void runLifecycle('close')}>{lifecycleBusy ? 'Working…' : 'Close account'}</button>
                </div>
                {lifecycleStatus && <div className={`staff-inline-notice ${lifecycleStatus.tone}`}>{lifecycleStatus.message}</div>}
              </div>
            )}

            {activeSection === 'ai' && (
              <div className="panel-card">
                <div className="panel-title">AI assistant settings</div>
                <div className="toggle-list">
                  <label className="toggle-row"><span>Enable AI</span><input type="checkbox" checked={companySettings.ai.enabled} onChange={(event) => updateNestedSetting('ai', { enabled: event.target.checked })} /></label>
                  <label className="toggle-row"><span>Voice assistant</span><input type="checkbox" checked={companySettings.ai.voice} onChange={(event) => updateNestedSetting('ai', { voice: event.target.checked })} /></label>
                  <label className="toggle-row"><span>Auto insights</span><input type="checkbox" checked={companySettings.ai.autoInsights} onChange={(event) => updateNestedSetting('ai', { autoInsights: event.target.checked })} /></label>
                  <label className="toggle-row"><span>Business memory</span><input type="checkbox" checked={companySettings.ai.businessMemory} onChange={(event) => updateNestedSetting('ai', { businessMemory: event.target.checked })} /></label>
                </div>
              </div>
            )}
          </div>

          {showImportModal && (
            <div className="import-modal-overlay">
              <div className="import-modal-card">
                <div className="modal-header">
                  <div>
                    <div className="card-title">Import data</div>
                    <div className="section-subtitle">Upload a spreadsheet and the system will route rows to sales, purchases, inventory, staff, or contact records automatically.</div>
                  </div>
                </div>

                <div className="import-modal-body">
                  <label className="file-upload-label">
                    Select spreadsheet file
                    <input type="file" accept=".csv,.xls,.xlsx" onChange={handleSettingsFileChange} />
                  </label>

                  {importFileName && <div className="import-file-name">Selected file: {importFileName}</div>}
                  {importError && <div className="import-error">{importError}</div>}

                  <div className="import-preview-info">
                    <div>Rows loaded: {importRows.length}</div>
                    <div>Status: {importStatus === 'success' ? 'Completed' : importStatus === 'uploading' ? 'Uploading' : importStatus === 'error' ? 'Failed' : 'Ready'}</div>
                  </div>

                  <div className="progress-bar import-progress-bar">
                    <div className="progress-fill import-progress-fill" style={{ width: `${importProgress}%` }} />
                  </div>
                  <div className="progress-label">{importProgress}%</div>

                  {importStatus === 'success' && importSummary && (
                    <div className="import-success-card">
                      <div className="check-circle">✓</div>
                      <div>
                        <div className="success-title">Import completed</div>
                        <div className="success-detail">Sales {importSummary.sales}, Purchases {importSummary.purchases}, Inventory {importSummary.products}, Staff {importSummary.staff}, Contacts {importSummary.contacts}.</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="btn-group">
                  <button className="btn btn-secondary" type="button" onClick={closeImportModal}>Cancel</button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={handleImportAction}
                    disabled={importStatus === 'success' ? false : importRows.length === 0 || isImporting}
                  >
                    {importStatus === 'uploading' ? 'Uploading…' : importStatus === 'success' ? 'Done' : 'Start import'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
