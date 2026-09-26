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

export function mergeLoadedBankAccounts(localAccounts, remoteAccounts) {
  const remoteIds = new Set((remoteAccounts || []).map((account) => account.id).filter(Boolean))
  const remoteNames = new Set((remoteAccounts || []).map((account) => recordKey(account.name)).filter(Boolean))
  const localById = new Map((localAccounts || []).filter((account) => account.id).map((account) => [account.id, account]))
  const localByName = new Map()
  for (const account of localAccounts || []) {
    const key = recordKey(account.name)
    if (key && !localByName.has(key)) localByName.set(key, account)
  }
  const localOnly = (localAccounts || []).filter((account) => (
    account.id && !remoteIds.has(account.id) && !remoteNames.has(recordKey(account.name))
  ))
  const remoteWithLocalBalance = (remoteAccounts || []).map((account) => {
    const local = localById.get(account.id) || localByName.get(recordKey(account.name))
    if (!local) return account
    return { ...account, balance: Number(local.balance ?? account.balance) }
  })
  return dedupeBankAccounts([...localOnly, ...remoteWithLocalBalance])
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
      openingBalance,
      openingBalanceDate: explicitEdit ? draft.openingBalanceDate || editing.openingBalanceDate : editing.openingBalanceDate,
      balance: explicitEdit && untouched ? openingBalance : Number(editing.balance || 0),
      status: editing.status || draft.status || 'active',
    }
    : {
      ...draft,
      id: draft.id || globalThis.crypto?.randomUUID?.() || `bank-${Date.now()}`,
      name,
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

export function replaceInventoryItem(inventory, next, identity) {
  const matchesIdentity = (item) => {
    if (!identity) return false
    if (identity.sku && recordKey(item.sku) === recordKey(identity.sku)) return true
    if (identity.product && recordKey(item.product) === recordKey(identity.product)) return true
    return false
  }
  const matchesNext = (item) => {
    if (next.sku && recordKey(item.sku) === recordKey(next.sku)) return true
    if (next.product && recordKey(item.product) === recordKey(next.product)) return true
    return false
  }
  const index = (inventory || []).findIndex((item) => matchesIdentity(item) || (!identity && matchesNext(item)) || matchesNext(item))
  if (index < 0) return { inventory: [...(inventory || []), next], updated: false }
  const previous = inventory[index]
  const hasMovement = Number(previous.purchased || 0) !== 0 || Number(previous.sold || 0) !== 0
  const merged = {
    ...previous,
    ...next,
    sku: next.sku || previous.sku,
    product: next.product || previous.product,
    purchased: previous.purchased,
    sold: previous.sold,
    openQty: hasMovement ? previous.openQty : next.openQty ?? next.closing ?? previous.openQty,
    closing: next.closing ?? previous.closing,
  }
  const kept = inventory.flatMap((item, itemIndex) => {
    if (itemIndex === index) return [merged]
    if (matchesIdentity(item) || matchesNext(item)) return []
    return [item]
  })
  return { inventory: kept, updated: true }
}

export function planProductWrites(existingRows, items) {
  const bySku = new Map()
  const byName = new Map()
  for (const row of existingRows || []) {
    const skuKey = recordKey(row?.sku)
    const nameKey = recordKey(row?.name)
    if (skuKey && !bySku.has(skuKey)) bySku.set(skuKey, row)
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, row)
  }
  const claimedIds = new Set()
  const claimedNames = new Set()
  const claimedSkus = new Set()
  const writes = []
  for (const item of items || []) {
    const nameKey = recordKey(item?.product || item?.name)
    const skuKey = recordKey(item?.sku)
    if ((nameKey && claimedNames.has(nameKey)) || (skuKey && claimedSkus.has(skuKey))) continue
    const skuMatch = skuKey ? bySku.get(skuKey) : null
    const nameMatch = nameKey ? byName.get(nameKey) : null
    const target = skuMatch && !claimedIds.has(skuMatch.id)
      ? skuMatch
      : nameMatch && !claimedIds.has(nameMatch.id)
        ? nameMatch
        : null
    if (target?.id) claimedIds.add(target.id)
    if (nameKey) claimedNames.add(nameKey)
    if (skuKey) claimedSkus.add(skuKey)
    writes.push({
      item,
      renameFromId: target && skuKey && recordKey(target.sku) !== skuKey ? target.id : '',
    })
  }
  return writes
}

export function replaceRole(roles, next) {
  const idKey = recordKey(next?.id)
  const nameKey = recordKey(next?.name)
  const index = (roles || []).findIndex((role) => recordKey(role.id) === idKey || recordKey(role.name) === nameKey)
  if (index < 0) return { roles: [...(roles || []), next], updated: false }
  const existing = roles[index]
  const saved = { ...existing, ...next, id: existing.id }
  const nextRoles = roles.map((role, roleIndex) => (roleIndex === index ? saved : role))
    .filter((role, roleIndex, list) => list.findIndex((other) => other.id === role.id) === roleIndex)
  return { roles: nextRoles, updated: true }
}
