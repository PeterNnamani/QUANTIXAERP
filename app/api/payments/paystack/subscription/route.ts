import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase.server'

export async function GET(request: Request) {
    try {
        const companyId = new URL(request.url).searchParams.get('companyId')
        if (!companyId) return NextResponse.json({ error: 'Company is required.' }, { status: 400 })
        if (!supabaseAdmin) return NextResponse.json({ error: 'Payment service is not configured.' }, { status: 500 })

        const { data: subscription, error } = await supabaseAdmin
            .from('subscriptions')
            .select('plan_name,status,starts_at,amount,currency')
            .eq('company_id', companyId)
            .in('status', ['trial', 'active'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ subscription: subscription || null })
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load subscription.' }, { status: 500 })
    }
}
