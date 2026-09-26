import { NextResponse } from 'next/server'
import { COMPANY_BOOK_TABLES, isSuperAdminRole } from '@/lib/company-lifecycle'
import { supabaseAdmin } from '@/lib/supabase.server'

const COMPANY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isMissingRpc(error: { code?: string; message?: string } | null): boolean {
  const message = String(error?.message || '')
  return error?.code === 'PGRST202' || /could not find the function|schema cache/i.test(message)
}

function isMissingTable(error: { message?: string } | null): boolean {
  return /does not exist|schema cache|could not find the table/i.test(String(error?.message || ''))
}

async function wipeBooks(companyId: string, closeAccount: boolean) {
  const rpc = await supabaseAdmin!.rpc('wipe_company_books', {
    p_company_id: companyId,
    p_close: closeAccount,
  })
  if (!rpc.error) return { database: 'cleared' as const }
  if (!isMissingRpc(rpc.error)) {
    const posted = /cannot delete posted journal|cannot modify posted journal/i.test(rpc.error.message || '')
    return {
      database: 'failed' as const,
      status: posted ? 409 : 400,
      error: posted
        ? 'Apply migration 029_company_lifecycle.sql in Supabase, then try again. Company data was not removed.'
        : rpc.error.message,
    }
  }

  for (const table of COMPANY_BOOK_TABLES) {
    const { error } = await supabaseAdmin!.from(table).delete().eq('company_id', companyId)
    if (error && !isMissingTable(error)) {
      const posted = /cannot delete posted journal|cannot modify posted journal/i.test(error.message || '')
      return {
        database: 'failed' as const,
        status: posted ? 409 : 400,
        error: posted
          ? 'Apply migration 029_company_lifecycle.sql in Supabase, then try again. Company data was not removed.'
          : error.message,
      }
    }
  }

  if (closeAccount) {
    await supabaseAdmin!.from('subscription_payments').delete().eq('company_id', companyId)
    await supabaseAdmin!.from('subscriptions').delete().eq('company_id', companyId)
    const users = await supabaseAdmin!.from('users').delete().eq('company_id', companyId)
    if (users.error) return { database: 'failed' as const, status: 400, error: users.error.message }
    const company = await supabaseAdmin!.from('companies').delete().eq('id', companyId)
    if (company.error) return { database: 'failed' as const, status: 400, error: company.error.message }
  }

  return { database: 'cleared' as const }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    const action = payload.action === 'close' ? 'close' : payload.action === 'wipe' ? 'wipe' : ''
    const companyId = String(payload.companyId || '').trim()
    const staffId = String(payload.staffId || '').trim()
    const username = String(payload.username || '').trim()

    if (!action) return NextResponse.json({ success: false, error: 'Choose delete company data or close account.' }, { status: 400 })
    if (!COMPANY_ID.test(companyId)) return NextResponse.json({ success: false, error: 'A valid company is required.' }, { status: 400 })
    if (!staffId && !username) return NextResponse.json({ success: false, error: 'A signed-in Super Admin is required.' }, { status: 400 })

    if (!supabaseAdmin) {
      return NextResponse.json({ success: true, database: 'skipped' })
    }

    let query = supabaseAdmin.from('users').select('role').eq('company_id', companyId)
    query = staffId ? query.eq('staff_id', staffId) : query.eq('username', username)
    const { data: actor, error: actorError } = await query.limit(1).maybeSingle()
    if (actorError) return NextResponse.json({ success: false, error: actorError.message }, { status: 400 })
    if (!actor || !isSuperAdminRole(actor.role)) {
      return NextResponse.json({ success: false, error: 'Only a Super Admin can delete company data or close the account.' }, { status: 403 })
    }

    const result = await wipeBooks(companyId, action === 'close')
    if (result.database === 'failed') {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json({ success: true, database: result.database, action })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
