import { dedupeChartOfAccounts, requiredFinancialPositionAccounts } from './chart-of-accounts.js'
import { isUuid } from './sync.js'

const FINANCIAL_POSITION_TYPES = new Set(['ASSET', 'LIABILITY', 'EQUITY'])

export function normalizeOpeningDate(value) {
    const match = String(value ?? '').trim().match(/^(\d{4}-\d{2}-\d{2})/)
    return match ? match[1] : null
}

export function signedOpeningBalance(account, asOfDate) {
    const amount = Number(account?.openingBalance || 0)
    if (!Number.isFinite(amount) || amount === 0) return 0
    const openingDate = normalizeOpeningDate(account?.openingBalanceDate)
    const cutoff = normalizeOpeningDate(asOfDate)
    if (openingDate && cutoff && openingDate > cutoff) return 0
    return amount
}

export function capitalOpeningAmount(accounts = []) {
    const capital = accounts.find((account) => String(account?.name || '').trim().toLowerCase() === 'capital')
    return Number(capital?.openingBalance || 0)
}

export function reconcileCapitalOpening(accounts = [], openingCapital = 0) {
    const capital = Number(openingCapital) || 0
    if (!capital) return accounts
    return accounts.map((account) => {
        if (String(account?.name || '').trim().toLowerCase() !== 'capital') return account
        if (Number(account.openingBalance || 0) !== 0) return account
        return { ...account, openingBalance: capital }
    })
}

export function mergeOpeningBalances(chartOfAccounts = [], balanceDrafts = {}, dateDrafts = {}) {
    return dedupeChartOfAccounts([
        ...chartOfAccounts,
        ...requiredFinancialPositionAccounts.map((account) => ({ ...account, openingBalance: 0, openingBalanceDate: null })),
    ]).map((account) => {
        if (!FINANCIAL_POSITION_TYPES.has(account.accountType)) return account
        const openingBalance = balanceDrafts[account.id] ?? account.openingBalance ?? 0
        const openingBalanceDate = dateDrafts[account.id] ?? account.openingBalanceDate ?? null
        return {
            ...account,
            openingBalance: Number(openingBalance) || 0,
            openingBalanceDate: normalizeOpeningDate(openingBalanceDate),
        }
    })
}

function normalBalanceOf(account) {
    if (account.normalBalance === 'DEBIT' || account.normalBalance === 'CREDIT') return account.normalBalance
    return account.accountType === 'ASSET' || account.accountType === 'EXPENSE' ? 'DEBIT' : 'CREDIT'
}

function accountKey(value) {
    return String(value || '').trim().toLowerCase()
}

function persistFailure(error, accountName) {
    const message = String(error?.message || '').trim()
    if (error?.code === '23505') return `${accountName} could not be saved because that account code is already in use.`
    return message || `Unable to save the opening balance for ${accountName}.`
}

export async function persistChartOpeningBalances(supabase, companyId, accounts, createId = () => crypto.randomUUID()) {
    const { data: existing, error: loadError } = await supabase.from('chart_of_accounts').select('id,code,name').eq('company_id', companyId)
    if (loadError) throw new Error(loadError.message || 'Unable to read the chart of accounts.')

    const rows = existing || []
    const byId = new Map(rows.map((row) => [row.id, row]))
    const byName = new Map(rows.map((row) => [accountKey(row.name), row]))
    const byCode = new Map(rows.map((row) => [accountKey(row.code), row]))
    const saved = []

    for (const account of accounts) {
        if (!FINANCIAL_POSITION_TYPES.has(account.accountType)) {
            saved.push(account)
            continue
        }

        const openingBalance = Number(account.openingBalance) || 0
        const openingBalanceDate = normalizeOpeningDate(account.openingBalanceDate)
        const known = (isUuid(account.id) && byId.get(account.id))
            || byName.get(accountKey(account.name))
            || byCode.get(accountKey(account.code))
        const changes = {
            opening_balance: openingBalance,
            opening_balance_date: openingBalanceDate,
            updated_at: new Date().toISOString(),
        }

        if (known) {
            const { error } = await supabase.from('chart_of_accounts').update(changes).eq('id', known.id).eq('company_id', companyId)
            if (error) throw new Error(persistFailure(error, account.name))
            saved.push({
                ...account,
                id: known.id,
                code: known.code || account.code,
                name: known.name || account.name,
                openingBalance,
                openingBalanceDate,
            })
            continue
        }

        const id = isUuid(account.id) ? account.id : createId()
        const row = {
            id,
            company_id: companyId,
            code: account.code,
            name: account.name,
            account_type: account.accountType,
            account_subtype: account.accountSubType || null,
            normal_balance: normalBalanceOf(account),
            is_control_account: Boolean(account.isControlAccount),
            is_active: account.isActive !== false,
            currency: account.currency || 'NGN',
            ...changes,
        }
        const { error } = await supabase.from('chart_of_accounts').insert(row)
        if (error) throw new Error(persistFailure(error, account.name))
        byId.set(id, row)
        byName.set(accountKey(account.name), row)
        byCode.set(accountKey(account.code), row)
        saved.push({ ...account, id, openingBalance, openingBalanceDate })
    }

    return saved
}
