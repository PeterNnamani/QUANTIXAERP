import { NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase.server'
import { getSupabaseConfigStatus } from '@/lib/env.server'

export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdminClient()
    if (!supabaseAdmin) {
      const config = getSupabaseConfigStatus()
      return NextResponse.json(
        {
          ok: false,
          error: 'Supabase admin client is not configured',
          hint: 'Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SECRET_KEY in .env.',
          config,
        },
        { status: 500 },
      )
    }

    const { error } = await supabaseAdmin.from('bank_accounts').select('id').limit(1)

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          hint: 'Confirm that your Supabase URL, secret key, and schema are configured.',
          config: getSupabaseConfigStatus(),
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      message: 'Supabase connection is healthy. The database is reachable.',
      config: getSupabaseConfigStatus(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        hint: 'A server-side issue occurred while validating the Supabase connection.',
        config: getSupabaseConfigStatus(),
      },
      { status: 500 },
    )
  }
}
