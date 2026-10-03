export async function saveBankSettings(client: any, companyId: string, account: any) {
    if (!client || !companyId) throw new Error('Sign in to a connected company before saving.')
    for (const key of ['openingBalance','balance']) {
        if (!Number.isFinite(account[key]) || account[key] < 0) throw new Error('Bank balances must be non-negative numbers.')
    }
    const {error} = await client.from('bank_accounts').upsert({
        id: account.id, company_id: companyId, name: account.name, institution: account.institution,
        account_number: account.accountNumber || null, account_type: account.accountType,
        currency: account.currency, branch: account.branch || null, opening_balance: account.openingBalance,
        opening_balance_date: account.openingBalanceDate || null, balance: account.balance, status: account.status.toLowerCase(),
    }, {onConflict: 'id'})
    if (error) throw new Error(error.message)
}
