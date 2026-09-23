import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase.server'
import { getPlanUserLimit, normalizePlanName } from '@/lib/licensing'

type SupabaseWriteResult = { error: { message?: string } | null }

function missingSchemaColumn(error: unknown, values: Record<string, unknown>): string | null {
    const message = typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message)
        : String(error || '')
    const match = message.match(/['"]?([a-zA-Z_][a-zA-Z0-9_]*)['"]?\s+(?:column|field)\b/i)
        || message.match(/(?:column|field)(?:\s+of)?\s+['"]?([a-zA-Z_][a-zA-Z0-9_]*)['"]?/i)
    const column = match?.[1]
    return column && Object.prototype.hasOwnProperty.call(values, column) ? column : null
}

async function writeWithSchemaFallback(
    values: Record<string, unknown>,
    operation: (values: Record<string, unknown>) => Promise<SupabaseWriteResult>,
): Promise<SupabaseWriteResult> {
    const compatibleValues = { ...values }
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const result = await operation(compatibleValues)
        if (!result.error) return result
        const unsupportedColumn = missingSchemaColumn(result.error, compatibleValues)
        if (!unsupportedColumn) return result
        delete compatibleValues[unsupportedColumn]
    }
    return { error: { message: 'Unable to match the users table schema.' } }
}

export async function POST(request: Request) {
    try {
        const payload = await request.json()
        if (!supabaseAdmin) {
            return NextResponse.json({ success: false, error: 'Supabase admin client is not configured' }, { status: 500 })
        }

        const now = new Date().toISOString()
        const insertData: Record<string, unknown> = {
            company_id: payload.companyId,
            staff_id: payload.staffId,
            username: payload.username,
            pin: payload.pin,
            email: payload.email || `${payload.username}@local`,
            full_name: payload.fullName,
            role: payload.roleId,
            role_title: payload.roleTitle || null,
            access_levels: payload.accessLevels || null,
            phone: payload.phone || null,
            branch: payload.branch || null,
            department: payload.department || null,
            position: payload.position || null,
            employee_id: payload.employeeId || null,
            salary: payload.salary || null,
            employment_date: payload.employmentDate || null,
            status: payload.status || 'active',
            created_at: now,
            updated_at: now,
        }
        if (payload.userSettings && typeof payload.userSettings === 'object' && !Array.isArray(payload.userSettings)) {
            insertData.user_settings = payload.userSettings
        }

        const { data: subscription } = await supabaseAdmin.from('subscriptions').select('plan_name,status').eq('company_id', payload.companyId).in('status', ['trial', 'active']).order('created_at', { ascending: false }).limit(1).maybeSingle()
        const userLimit = subscription?.status === 'active' ? getPlanUserLimit(normalizePlanName(subscription.plan_name)) : 0
        const { count: currentUserCount } = await supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('company_id', payload.companyId)
        const { data: existingByUsername } = await supabaseAdmin.from('users').select('id').eq('company_id', payload.companyId).eq('username', payload.username).limit(1)
        const { data: existingByStaffId } = await supabaseAdmin.from('users').select('id').eq('company_id', payload.companyId).eq('staff_id', payload.staffId).limit(1)

        const isExistingUser = (existingByUsername && existingByUsername.length > 0) || (existingByStaffId && existingByStaffId.length > 0)
        if (!isExistingUser && (userLimit === 0 || (userLimit !== null && (currentUserCount || 0) >= userLimit))) {
            return NextResponse.json({ success: false, error: userLimit === 0 ? 'An active subscription is required to add users.' : `Your plan supports up to ${userLimit} users.` }, { status: 403 })
        }

        // If the user already exists by username or staff ID, update instead of relying on ON CONFLICT.
        let error = null
        if ((existingByUsername && existingByUsername.length > 0) || (existingByStaffId && existingByStaffId.length > 0)) {
            const matchId = (existingByUsername && existingByUsername.length > 0)
                ? existingByUsername[0].id
                : existingByStaffId![0].id
            const updateResult = await writeWithSchemaFallback(insertData, async (values) => supabaseAdmin!.from('users').update(values).eq('id', matchId))
            error = updateResult.error
        } else {
            const insertResult = await writeWithSchemaFallback(insertData, async (values) => supabaseAdmin!.from('users').insert(values))
            error = insertResult.error
        }

        if (error) {
            console.warn('Unable to write staff user to users table', error)
            return NextResponse.json({ success: false, error: error.message }, { status: 400 })
        }

        return NextResponse.json({ success: true })
    } catch (err) {
        return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    }
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url)
        const companyId = String(url.searchParams.get('companyId') || '').trim()
        const staffId = String(url.searchParams.get('staffId') || '').trim()
        const username = String(url.searchParams.get('username') || '').trim()

        if (!supabaseAdmin) return NextResponse.json({ success: false, error: 'Supabase admin client is not configured' }, { status: 500 })
        if (!companyId || (!staffId && !username)) return NextResponse.json({ success: false, error: 'A valid account is required.' }, { status: 400 })

        let query = supabaseAdmin.from('users').select('user_settings').eq('company_id', companyId)
        query = staffId ? query.eq('staff_id', staffId) : query.eq('username', username)
        const { data, error } = await query.limit(1).maybeSingle()
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
        if (!data) return NextResponse.json({ success: false, error: 'Account not found.' }, { status: 404 })
        return NextResponse.json({ success: true, userSettings: data.user_settings || {} })
    } catch (error) {
        return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
    }
}

export async function PATCH(request: Request) {
    try {
        const payload = await request.json()
        const companyId = String(payload.companyId || '').trim()
        const staffId = String(payload.staffId || '').trim()
        const username = String(payload.username || '').trim()
        const currentPin = String(payload.currentPin || '').trim()
        const newPin = String(payload.newPin || '').trim()
        const hasSettings = payload.userSettings && typeof payload.userSettings === 'object' && !Array.isArray(payload.userSettings)

        if (!supabaseAdmin) return NextResponse.json({ success: false, error: 'Supabase admin client is not configured' }, { status: 500 })
        if (!companyId || (!staffId && !username) || (!hasSettings && (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)))) {
            return NextResponse.json({ success: false, error: hasSettings ? 'A valid account and settings are required.' : 'A valid account and four-digit PINs are required.' }, { status: 400 })
        }

        let query = supabaseAdmin.from('users').select('id,pin,user_settings').eq('company_id', companyId)
        query = staffId ? query.eq('staff_id', staffId) : query.eq('username', username)
        const { data: matches, error: lookupError } = await query.limit(1)
        if (lookupError) return NextResponse.json({ success: false, error: lookupError.message }, { status: 400 })
        if (!matches?.[0]?.id) return NextResponse.json({ success: false, error: 'Current PIN is incorrect.' }, { status: 403 })

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (hasSettings) {
            const mergedUserSettings = { ...(matches[0].user_settings || {}), ...payload.userSettings }
            if (mergedUserSettings.notifications && typeof mergedUserSettings.notifications === 'object' && !Array.isArray(mergedUserSettings.notifications)) {
                delete (mergedUserSettings.notifications as Record<string, unknown>).sms
            }
            updates.user_settings = mergedUserSettings
        }
        if (currentPin || newPin) {
            if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) return NextResponse.json({ success: false, error: 'PINs must be exactly four digits.' }, { status: 400 })
            if (currentPin !== String(matches[0].pin || '').trim()) return NextResponse.json({ success: false, error: 'Current PIN is incorrect.' }, { status: 403 })
            if (currentPin === newPin) return NextResponse.json({ success: false, error: 'New PIN must be different from the current PIN.' }, { status: 400 })
            updates.pin = newPin
        }

        const { error } = await supabaseAdmin.from('users').update(updates).eq('id', matches[0].id)
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
        return NextResponse.json({ success: true, userSettings: updates.user_settings || matches[0].user_settings || {} })
    } catch (error) {
        return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
    }
}
