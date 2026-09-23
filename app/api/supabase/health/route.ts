import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase.server'

export async function GET() {
    try {
        const { error } = await supabaseAdmin.from('bank_accounts').select('id').limit(1)

        if (error) {
            return NextResponse.json(
                {
                    ok: false,
                    error: error.message,
                    hint: 'Confirm that your Supabase URL, service role key, and initial schema migration are configured.',
                },
                { status: 500 }
            )
        }

        return NextResponse.json({
            ok: true,
            message: 'Supabase connection is healthy. The database is reachable.',
        })
    } catch (error) {
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
                hint: 'A server-side issue occurred while validating the Supabase connection.',
            },
            { status: 500 }
        )
    }
}
