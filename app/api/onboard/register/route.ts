import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase.server'
import { buildSeedChartOfAccounts } from '@/lib/accounting/chart-of-accounts'
import { buildSeedAccountingPeriods } from '@/lib/accounting/periods'
import { getTrialEndDate, TRIAL_PLAN } from '@/lib/licensing'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { companyName, adminFullName, adminEmail, staffId, username, pin } = body || {}

        if (!supabaseAdmin) {
            return NextResponse.json({ ok: false, error: 'Supabase admin client is not configured' }, { status: 500 })
        }

        // Allow onboarding for multiple companies. Multiple super-admins are permitted in this multi-company app.
        const now = new Date().toISOString()

        // Generate a staff ID if not provided
        const generatedStaffId = staffId && String(staffId).trim().length > 0 ? String(staffId).trim() : `STF-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 9000 + 1000)}`

        const { data: company, error: companyErr } = await supabaseAdmin
            .from('companies')
            .insert({ name: String(companyName).trim(), created_at: now, updated_at: now })
            .select('id,name')
            .single()

        if (companyErr || !company) {
            return NextResponse.json({ ok: false, error: companyErr?.message || 'Unable to create company' }, { status: 500 })
        }

        // Insert the super-admin user
        const { error: userErr } = await supabaseAdmin.from('users').insert({
            company_id: company.id,
            staff_id: generatedStaffId,
            username: username,
            pin: pin,
            email: adminEmail ?? `${username}@local`,
            full_name: adminFullName,
            role: 'business-owner',
            status: 'active',
            created_at: now,
            updated_at: now,
        })

        if (userErr) {
            return NextResponse.json({ ok: false, error: userErr.message }, { status: 500 })
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

        // Seed basic chart of accounts
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
            // non-fatal; continue
            console.warn('Unable to seed chart of accounts', e)
        }

        // Seed initial accounting period
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

        // Optionally create a bank_accounts placeholder
        try {
            await supabaseAdmin.from('bank_accounts').insert([{ company_id: company.id, name: `${companyName} - Cash`, institution: companyName ?? 'Company', balance: 0, currency: 'NGN', status: 'active', created_at: now, updated_at: now }])
        } catch (e) {
            console.warn('Unable to create default bank account', e)
        }

        return NextResponse.json({ ok: true, message: 'Onboarding completed' })
    } catch (err) {
        return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    }
}
