import { NextResponse } from 'next/server'
import { mapDatabaseUser, normalizeLoginPin, type DatabaseUserRecord } from '@/lib/auth-user'
import { buildSeedChartOfAccounts } from '@/lib/accounting/chart-of-accounts'
import { buildSeedAccountingPeriods } from '@/lib/accounting/periods'
import { getTrialEndDate, TRIAL_PLAN } from '@/lib/licensing'
import { getDefaultRoles } from '@/lib/rbac'
import { supabaseAdmin } from '@/lib/supabase.server'

type SupabaseWriteResult<T = unknown> = { data?: T | null; error: { message?: string } | null }

function missingSchemaColumn(error: unknown, values: Record<string, unknown>): string | null {
    const message = typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message)
        : String(error || '')
    const match = message.match(/['"]?([a-zA-Z_][a-zA-Z0-9_]*)['"]?\s+(?:column|field)\b/i)
        || message.match(/(?:column|field)(?:\s+of)?\s+['"]?([a-zA-Z_][a-zA-Z0-9_]*)['"]?/i)
    const column = match?.[1]
    return column && Object.prototype.hasOwnProperty.call(values, column) ? column : null
}

async function writeWithSchemaFallback<T>(
    values: Record<string, unknown>,
    operation: (values: Record<string, unknown>) => Promise<SupabaseWriteResult<T>>,
): Promise<SupabaseWriteResult<T>> {
    const compatibleValues = { ...values }
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const result = await operation(compatibleValues)
        if (!result.error) return result
        const unsupportedColumn = missingSchemaColumn(result.error, compatibleValues)
        if (!unsupportedColumn) return result
        delete compatibleValues[unsupportedColumn]
    }
    return { data: null, error: { message: 'Unable to match the users table schema.' } }
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null)
        const companyName = String(body?.companyName || '').trim()
        const adminFullName = String(body?.adminFullName || '').trim()
        const adminEmail = String(body?.adminEmail || '').trim()
        const staffId = String(body?.staffId || '').trim()
        const username = String(body?.username || '').trim()
        const pin = normalizeLoginPin(body?.pin)

        if (!companyName || !adminFullName || !username || !pin) {
            return NextResponse.json({ ok: false, error: 'Company name, admin name, username, and PIN are required.' }, { status: 400 })
        }

        if (pin.length < 4 || pin.length > 6) {
            return NextResponse.json({ ok: false, error: 'PIN must be 4 to 6 characters.' }, { status: 400 })
        }

        if (!supabaseAdmin) {
            return NextResponse.json({ ok: false, error: 'Supabase admin client is not configured' }, { status: 500 })
        }

        const now = new Date().toISOString()
        const generatedStaffId = staffId || `STF-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 9000 + 1000)}`
        const email = adminEmail || `${username.replace(/\s+/g, '.').toLowerCase()}@local`

        const { data: company, error: companyErr } = await supabaseAdmin
            .from('companies')
            .insert({ name: companyName, created_at: now, updated_at: now })
            .select('id,name')
            .single()

        if (companyErr || !company) {
            return NextResponse.json({ ok: false, error: companyErr?.message || 'Unable to create company' }, { status: 500 })
        }

        const userInsert = await writeWithSchemaFallback<DatabaseUserRecord>(
            {
                company_id: company.id,
                staff_id: generatedStaffId,
                username,
                pin,
                email,
                full_name: adminFullName,
                role: 'business-owner',
                role_title: 'Super Admin',
                status: 'active',
                created_at: now,
                updated_at: now,
            },
            async (values) => supabaseAdmin!.from('users').insert(values).select('*').single(),
        )

        if (userInsert.error || !userInsert.data) {
            return NextResponse.json({ ok: false, error: userInsert.error?.message || 'Unable to create admin user' }, { status: 500 })
        }

        const trialEndsAt = getTrialEndDate(now)
        const { error: trialErr } = await supabaseAdmin.from('subscriptions').insert({
            company_id: company.id,
            plan_name: TRIAL_PLAN,
            status: 'trial',
            amount: 0,
            starts_at: now,
            expires_at: trialEndsAt?.toISOString() || null,
            created_at: now,
            updated_at: now,
        })

        if (trialErr) {
            return NextResponse.json({ ok: false, error: trialErr.message }, { status: 500 })
        }

        try {
            const chart = buildSeedChartOfAccounts().map((a) => ({
                code: a.code,
                name: a.name,
                account_type: a.accountType || a.account_type,
                account_subtype: a.accountSubType || a.account_subtype || null,
                normal_balance: a.normalBalance || a.normal_balance || 'DEBIT',
                is_control_account: Boolean(a.isControlAccount),
                is_active: a.isActive !== false,
                currency: a.currency || 'NGN',
                company_id: company.id,
                created_at: now,
                updated_at: now,
            }))

            await supabaseAdmin.from('chart_of_accounts').insert(chart)
        } catch (e) {
            console.warn('Unable to seed chart of accounts', e)
        }

        try {
            const periods = buildSeedAccountingPeriods().map((p) => ({
                fiscal_year: p.fiscalYear || p.fiscal_year,
                period_number: p.periodNumber || p.period_number,
                start_date: p.startDate || p.start_date,
                end_date: p.endDate || p.end_date,
                status: p.status || 'OPEN',
                company_id: company.id,
                created_at: now,
                updated_at: now,
            }))

            await supabaseAdmin.from('accounting_periods').insert(periods)
        } catch (e) {
            console.warn('Unable to seed accounting periods', e)
        }

        try {
            await supabaseAdmin.from('bank_accounts').insert([{
                company_id: company.id,
                name: `${companyName} - Cash`,
                institution: companyName,
                balance: 0,
                currency: 'NGN',
                status: 'active',
                created_at: now,
                updated_at: now,
            }])
        } catch (e) {
            console.warn('Unable to create default bank account', e)
        }

        const user = mapDatabaseUser(userInsert.data, {
            companyName: company.name,
            roles: getDefaultRoles(),
            subscription: {
                plan_name: TRIAL_PLAN,
                status: 'trial',
                expires_at: trialEndsAt?.toISOString() || null,
            },
        })

        return NextResponse.json({
            ok: true,
            success: true,
            message: 'Onboarding completed',
            staffId: generatedStaffId,
            user,
        })
    } catch (err) {
        return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    }
}
