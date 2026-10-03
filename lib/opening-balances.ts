const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function saveOpeningBalances(client: any, companyId: string, accounts: any[]) {
    if (!client || !companyId) throw new Error('Sign in to a connected company before saving.')
    const {data: existing, error: lookupError} = await client.from('chart_of_accounts').select('id,name,code').eq('company_id', companyId)
    if (lookupError) throw new Error(lookupError.message)
    const ids: Record<string, string> = {}
    const codes = new Set<string>()
    const saved = accounts.map(account => {
        const sameName = (existing || []).filter((row: any) => row.name.trim().toLowerCase() === account.name.trim().toLowerCase())
        if (sameName.length > 1) throw new Error(`Duplicate account ${account.name}; reconcile it before saving.`)
        const id = uuid.test(account.id) ? account.id : sameName[0]?.id || crypto.randomUUID()
        ids[account.id] = id
        const code = sameName[0]?.code || (account.name === 'Payables' && account.code === '2000' ? '2005' : account.code)
        if (codes.has(code)) throw new Error(`Duplicate account code ${code}; no balances have been saved.`)
        codes.add(code)
        const balance = Number(account.openingBalance ?? 0)
        if (!Number.isFinite(balance) || balance < 0) throw new Error(`Invalid opening balance for ${account.name}.`)
        const date = account.openingBalanceDate || null
        if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)) throw new Error(`Invalid opening date for ${account.name}.`)
        return {...account, id, code, openingBalance: balance, openingBalanceDate: date}
    })
    const {error} = await client.from('chart_of_accounts').upsert(saved.map(account => ({
        id: account.id, company_id: companyId, code: account.code, name: account.name,
        account_type: account.accountType, account_subtype: account.accountSubType || null,
        normal_balance: account.normalBalance, is_control_account: account.isControlAccount || false,
        is_active: account.isActive !== false, currency: account.currency || 'NGN',
        opening_balance: account.openingBalance, opening_balance_date: account.openingBalanceDate,
    })), {onConflict: 'id'})
    if (error) throw new Error(`Opening balances were not confirmed saved: ${error.message}. Confirm migration 030 has been applied.`)
    return {accounts: saved, ids}
}
