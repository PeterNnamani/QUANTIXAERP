import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase.server'

export async function POST(request: Request) {
    try {
        const payload = await request.json()
        const companyId = String(payload.companyId || '').trim()
        const staffId = String(payload.staffId || '').trim()
        const username = String(payload.username || '').trim()

        if (!supabaseAdmin) return NextResponse.json({ success: false, error: 'Supabase admin client is not configured' }, { status: 500 })
        if (!companyId || (!staffId && !username)) {
            return NextResponse.json({ success: false, error: 'A valid account is required.' }, { status: 400 })
        }

        let query = supabaseAdmin.from('users').select('id').eq('company_id', companyId)
        query = staffId ? query.eq('staff_id', staffId) : query.eq('username', username)
        const { data: matches, error: lookupError } = await query.limit(1)
        if (lookupError) return NextResponse.json({ success: false, error: lookupError.message }, { status: 400 })
        if (!matches?.[0]?.id) return NextResponse.json({ success: false, error: 'Account not found.' }, { status: 404 })

        const { error } = await supabaseAdmin
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', matches[0].id)

        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
        return NextResponse.json({ success: true })
    } catch (error) {
        return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
    }
}
