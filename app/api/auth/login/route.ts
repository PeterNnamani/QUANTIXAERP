import { NextResponse } from 'next/server'
import { findMatchingUser, mapDatabaseUser, normalizeLoginIdentifier, normalizeLoginPin, type DatabaseUserRecord } from '@/lib/auth-user'
import { getDefaultRoles } from '@/lib/rbac'
import { supabaseAdmin } from '@/lib/supabase.server'

async function loadCompanyName(companyId: string) {
    const { data } = await supabaseAdmin!.from('companies').select('name').eq('id', companyId).maybeSingle()
    return data?.name ? String(data.name) : null
}

async function loadSubscription(companyId: string) {
    const { data } = await supabaseAdmin!
        .from('subscriptions')
        .select('plan_name,status,expires_at')
        .eq('company_id', companyId)
        .in('status', ['trial', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    return data || null
}

async function findUserRows(identifier: string, pin: string): Promise<DatabaseUserRecord[]> {
    const { data: byPin, error: pinError } = await supabaseAdmin!
        .from('users')
        .select('*')
        .eq('pin', pin)

    if (!pinError && Array.isArray(byPin) && byPin.length > 0) {
        return byPin as DatabaseUserRecord[]
    }

    const [{ data: byUsername }, { data: byStaffId }] = await Promise.all([
        supabaseAdmin!.from('users').select('*').ilike('username', identifier),
        supabaseAdmin!.from('users').select('*').ilike('staff_id', identifier),
    ])

    return [...(byUsername || []), ...(byStaffId || [])] as DatabaseUserRecord[]
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null)
        const identifier = normalizeLoginIdentifier(body?.username ?? body?.staffId)
        const pin = normalizeLoginPin(body?.pin ?? body?.password)

        if (!identifier || !pin) {
            return NextResponse.json({ ok: false, error: 'Staff ID and PIN are required.' }, { status: 400 })
        }

        if (!supabaseAdmin) {
            return NextResponse.json({ ok: false, error: 'Sign-in service is not configured.' }, { status: 500 })
        }

        const rows = await findUserRows(identifier, pin)
        const match = findMatchingUser(rows, identifier, pin)
        if (!match) {
            return NextResponse.json({ ok: false, error: 'Invalid username or password' }, { status: 401 })
        }

        const [companyName, subscription] = await Promise.all([
            loadCompanyName(String(match.company_id)),
            loadSubscription(String(match.company_id)),
        ])

        const user = mapDatabaseUser(match, {
            companyName,
            roles: getDefaultRoles(),
            subscription,
        })

        if (!user) {
            return NextResponse.json({ ok: false, error: 'Invalid username or password' }, { status: 401 })
        }

        return NextResponse.json({ ok: true, user })
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Unable to sign in.',
        }, { status: 500 })
    }
}
