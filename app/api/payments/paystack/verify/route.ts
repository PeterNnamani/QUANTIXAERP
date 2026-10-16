import { NextResponse } from 'next/server'
import { fulfillPaystackCharge } from '@/lib/paystack-fulfillment'

export async function POST(request: Request) {
    try {
        const { reference, companyId, planName } = await request.json()
        const result = await fulfillPaystackCharge(String(reference || ''), {
            companyId: companyId ? String(companyId) : undefined,
            planName: planName ? String(planName) : undefined,
        })
        return NextResponse.json(result.body, { status: result.status })
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to verify payment.' }, { status: 500 })
    }
}
