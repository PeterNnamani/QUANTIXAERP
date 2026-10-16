import { NextResponse } from 'next/server'
import { fulfillPaystackCharge } from '@/lib/paystack-fulfillment'
import { isValidPaystackSignature } from '@/lib/paystack-subscription'

export async function POST(request: Request) {
    const secret = process.env.PAYSTACK_SECRET_KEY
    if (!secret) return NextResponse.json({ error: 'Payment service is not configured.' }, { status: 500 })

    const rawBody = await request.text()
    if (!isValidPaystackSignature(rawBody, request.headers.get('x-paystack-signature'), secret)) {
        return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 })
    }

    let event: { event?: string; data?: { reference?: string } }
    try {
        event = JSON.parse(rawBody)
    } catch {
        return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 })
    }

    if (event.event !== 'charge.success' || !event.data?.reference) return NextResponse.json({ ok: true })

    const result = await fulfillPaystackCharge(event.data.reference)
    if (result.status >= 500) return NextResponse.json(result.body, { status: result.status })
    return NextResponse.json({ ok: true })
}
