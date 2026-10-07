import { NextResponse } from 'next/server'
import { loadCompanySubscription } from '@/lib/current-subscription'

export async function GET(request: Request) {
    try {
        const companyId = new URL(request.url).searchParams.get('companyId')
        if (!companyId) return NextResponse.json({ error: 'Company is required.' }, { status: 400 })

        const { subscription, error } = await loadCompanySubscription(companyId)
        if (error) return NextResponse.json({ error }, { status: 500 })
        return NextResponse.json({ subscription })
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load subscription.' }, { status: 500 })
    }
}
