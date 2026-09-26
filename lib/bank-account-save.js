const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function recordKey(value) {
  return String(value ?? '').trim().toLowerCase()
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || '').trim())
}

export function dedupeBankAccounts(accounts) {
  const order = []
  const byKey = new Map()
  for (const account of accounts || []) {
    const key = recordKey(account?.name) || String(account?.id || '')
    if (!key) continue
    const previous = byKey.get(key)
    if (!previous) {
      order.push(key)
      byKey.set(key, account)
      continue
    }
    byKey.set(key, {
      ...previous,
      ...account,
      id: previous.id || account.id,
      name: previous.name || account.name,
    })
  }
  return order.map((key) => byKey.get(key))
}

export function planBankWrites(existingRows, accounts) {
  const byId = new Map()
  const byName = new Map()
  for (const row of existingRows || []) {
    if (row?.id) byId.set(row.id, row)
    const key = recordKey(row?.name)
    if (key && !byName.has(key)) byName.set(key, row)
  }
  const claimed = new Set()
  const idMap = {}
  const planned = []
  for (const account of dedupeBankAccounts(accounts)) {
    const idHit = account.id ? byId.get(account.id) : null
    const nameHit = byName.get(recordKey(account.name))
    let id = account.id
    if (idHit && !claimed.has(idHit.id)) {
      id = idHit.id
    } else if (nameHit && !claimed.has(nameHit.id)) {
      id = nameHit.id
      if (account.id && account.id !== id) idMap[account.id] = id
    } else if (!isUuid(id)) {
      id = globalThis.crypto?.randomUUID?.() || id
      if (account.id && account.id !== id) idMap[account.id] = id
    }
    if (id) claimed.add(id)
    planned.push({ ...account, id })
  }
  return { accounts: planned, idMap }
}

function rewriteField(records, field, from, to) {
  if (!from || from === to) return records || []
  return (records || []).map((record) => (record?.[field] === from ? { ...record, [field]: to } : record))
}

export function applyBankAccountSave(books, draft) {
  const accounts = books.bankAccounts || []
  const name = String(draft.name || '').trim()
  const nameKey = recordKey(name)
  const editing = accounts.find((account) => draft.editingId && account.id === draft.editingId)
    || accounts.find((account) => recordKey(account.name) === nameKey)
  const conflict = accounts.find((account) => recordKey(account.name) === nameKey && account.id !== editing?.id)
  if (!name || conflict) {
    return { conflict: true, updated: false, account: null, bankAccounts: accounts, banks: books.banks || {}, bankTxns: books.bankTxns || [], expenses: books.expenses || [], sales: books.sales || [] }
  }

  const explicitEdit = Boolean(draft.editingId && editing?.id === draft.editingId)
  const openingBalance = explicitEdit || !editing ? Number(draft.openingBalance || 0) : Number(editing.openingBalance || 0)
  const untouched = editing ? Math.abs(Number(editing.balance || 0) - Number(editing.openingBalance || 0)) < 0.005 : true
  const next = editing
    ? {
      ...editing,
      ...draft,
      id: editing.id,
      name,
      institution: draft.institution || editing.institution,
      accountNumber: draft.accountNumber ?? editing.accountNumber,
      accountType: explicitEdit ? draft.accountType || editing.accountType : editing.accountType,
      currency: explicitEdit ? draft.currency || editing.currency : editing.currency,
      branch: draft.branch ?? editing.branch ?? '',
      openingBalance,
      openingBalanceDate: explicitEdit ? draft.openingBalanceDate || editing.openingBalanceDate : editing.openingBalanceDate,
      balance: explicitEdit && untouched ? openingBalance : Number(editing.balance || 0),
      status: editing.status || draft.status || 'active',
    }
    : {
      ...draft,
      id: draft.id || globalThis.crypto?.randomUUID?.() || `bank-${Date.now()}`,
      name,
      branch: draft.branch || '',
      openingBalance,
      balance: openingBalance,
      status: draft.status || 'active',
    }
  delete next.editingId

  const banks = { ...(books.banks || {}) }
  if (editing && editing.name !== name) delete banks[editing.name]
  banks[name] = Number(next.balance || 0)
  const bankAccounts = dedupeBankAccounts(editing
    ? accounts.map((account) => (account.id === editing.id ? next : account))
    : [...accounts, next])

  return {
    conflict: false,
    updated: Boolean(editing),
    account: next,
    bankAccounts,
    banks,
    bankTxns: rewriteField(books.bankTxns, 'bank', editing?.name, name),
    expenses: rewriteField(books.expenses, 'bank', editing?.name, name),
    sales: rewriteField(books.sales, 'paymentAccount', editing?.name, name),
  }
}
