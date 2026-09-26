import { NextResponse } from 'next/server'
import { pickLoginAccount, type LoginAccountRow } from '@/lib/auth-login'
import { supabaseAdmin } from '@/lib/supabase.server'

function signInFailure(message: string, status: number) {
    return NextResponse.json({ success: false, error: message }, { status })
}

function exactIlike(value: string) {
    return value.replace(/[\\%_*]/g, (character) => `\\${character}`)
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}))
        const staffIdOrUsername = String(body.staffIdOrUsername || '').trim()
        const pin = String(body.pin || '').trim()
        if (!staffIdOrUsername || !pin) {
            return signInFailure('Invalid username or password', 401)
        }

        if (!supabaseAdmin) {
            return signInFailure('Sign-in is unavailable right now.', 503)
        }

        const normalizedId = staffIdOrUsername.toUpperCase()
        const accountPattern = exactIlike(normalizedId)
        const [staffResult, usernameResult] = await Promise.all([
            supabaseAdmin.from('users').select('*').eq('pin', pin).ilike('staff_id', accountPattern).limit(20),
            supabaseAdmin.from('users').select('*').eq('pin', pin).ilike('username', accountPattern).limit(20),
        ])

        if (staffResult.error && usernameResult.error) {
            console.error('Unable to look up a user for sign-in', staffResult.error.message)
            return signInFailure('Sign-in is unavailable right now.', 503)
        }

        const rows = [...(staffResult.data || []), ...(usernameResult.data || [])] as LoginAccountRow[]
        const match = pickLoginAccount(rows, normalizedId, pin)
        if (!match.ok) {
            const message = match.reason === 'disabled' ? 'This account is disabled.' : 'Invalid username or password'
            return signInFailure(message, match.reason === 'disabled' ? 403 : 401)
        }

        const account = match.account
        let companyName: string | null = null
        if (account.company_id) {
            const { data: company } = await supabaseAdmin.from('companies').select('name').eq('id', account.company_id).maybeSingle()
            companyName = company?.name ? String(company.name) : null
        }

        if (account.id) {
            const { error: loginStampError } = await supabaseAdmin
                .from('users')
                .update({ last_login: new Date().toISOString() })
                .eq('id', account.id)
            if (loginStampError) console.warn('Unable to record last login', loginStampError.message)
        }

        return NextResponse.json({
            success: true,
            user: {
                company_id: account.company_id,
                company_name: companyName,
                staff_id: account.staff_id,
                username: account.username,
                pin: account.pin,
                email: (account as { email?: string | null }).email ?? null,
                full_name: (account as { full_name?: string | null }).full_name ?? null,
                role: (account as { role?: string | null }).role ?? null,
                role_title: (account as { role_title?: string | null }).role_title ?? null,
                access_levels: (account as { access_levels?: unknown }).access_levels ?? null,
                phone: (account as { phone?: string | null }).phone ?? null,
                status: account.status ?? 'active',
                user_settings: (account as { user_settings?: unknown }).user_settings ?? null,
            },
        })
    } catch (error) {
        console.error('Sign-in failed', error instanceof Error ? error.message : error)
        return signInFailure('Sign-in is unavailable right now.', 503)
    }
}
