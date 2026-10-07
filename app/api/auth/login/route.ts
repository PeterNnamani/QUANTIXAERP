import { NextResponse } from 'next/server'
import {
  getSupabaseAdminClient,
  getSupabaseAuthClient,
  isMissingColumnError,
} from '@/lib/supabase.server'
import { getSupabaseConfigStatus } from '@/lib/env.server'
import { verifyPin } from '@/lib/pin'
import { loadCompanySubscription } from '@/lib/current-subscription'
import { resolveVisibleSubscription } from '@/lib/licensing'

type LoginBody = {
  username?: string
  pin?: string
}

type UserLookupRow = {
  id: string
  email?: string | null
  status?: string | null
  auth_user_id?: string | null
  pin?: string | null
  pin_hash?: string | null
  username?: string | null
  staff_id?: string | null
}

const LOOKUP_COLUMN_SETS = [
  'id, auth_user_id, email, status, pin_hash, pin, username, staff_id',
  'id, email, status, pin_hash, pin, username, staff_id',
  'id, email, status, pin, username, staff_id',
  'id, status, pin, username, staff_id',
]

const PROFILE_COLUMN_SETS = [
  'id, company_id, email, full_name, role, role_title, access_levels, staff_id, username, branch, department, position, status',
  'id, company_id, email, full_name, role, role_title, staff_id, username, branch, department, position, status',
  'id, company_id, email, full_name, role, staff_id, username, status',
  'id, company_id, full_name, role, staff_id, username, status',
]

function escapePostgrestValue(value: string) {
  return value.replace(/[,()"]/g, '')
}

function identifierMatches(row: UserLookupRow, needle: string) {
  return (
    String(row.username || '').trim().toLowerCase() === needle ||
    String(row.staff_id || '').trim().toLowerCase() === needle
  )
}

async function selectWithColumnFallback(
  table: string,
  columnSets: string[],
  apply: (query: any) => Promise<{
    data: unknown
    error: { code?: string; message?: string } | null
  }>,
) {
  const supabaseAdmin = getSupabaseAdminClient()
  if (!supabaseAdmin) {
    return { data: null as unknown, error: { message: 'Supabase admin client is not configured' } }
  }

  let lastError: { code?: string; message?: string } | null = null
  for (const columns of columnSets) {
    const result = await apply(supabaseAdmin.from(table).select(columns))
    if (!result.error) return result
    lastError = result.error
    if (!isMissingColumnError(result.error)) return result
  }
  return { data: null, error: lastError }
}

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdminClient()
    if (!supabaseAdmin) {
      const config = getSupabaseConfigStatus()
      return NextResponse.json(
        {
          error: 'Server misconfigured',
          detail: `Supabase env is incomplete (url=${config.hasUrl}, secret=${config.hasSecretKey}).`,
        },
        { status: 500 },
      )
    }

    let body: LoginBody
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const raw = (body.username || '').trim()
    const pin = (body.pin || '').trim()
    if (!raw || !pin) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
    }

    const lookupValue = escapePostgrestValue(raw)
    const needle = raw.toLowerCase()

    const lookup = await selectWithColumnFallback('users', LOOKUP_COLUMN_SETS, (query) =>
      query.or(`username.ilike."${lookupValue}",staff_id.ilike."${lookupValue}"`).limit(50),
    )

    if (lookup.error) {
      console.error('[login] lookup failed:', JSON.stringify(lookup.error, null, 2))
      return NextResponse.json(
        { error: 'Lookup failed', detail: lookup.error.message },
        { status: 500 },
      )
    }

    const rows = (Array.isArray(lookup.data) ? lookup.data : lookup.data ? [lookup.data] : []) as UserLookupRow[]
    const candidates = rows.filter((row) => identifierMatches(row, needle))

    const matches: UserLookupRow[] = []
    for (const row of candidates) {
      const pinMatches = row.pin_hash
        ? await verifyPin(pin, row.pin_hash)
        : typeof row.pin === 'string' && row.pin === pin
      if (pinMatches) matches.push(row)
    }

    if (matches.length === 0) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    const staffIdMatches = matches.filter(
      (row) => String(row.staff_id || '').trim().toLowerCase() === needle,
    )
    const userRow = staffIdMatches.length === 1 ? staffIdMatches[0] : matches.length === 1 ? matches[0] : null

    if (!userRow) {
      return NextResponse.json(
        { error: 'Multiple accounts match this username. Sign in with your staff ID.' },
        { status: 409 },
      )
    }

    if (userRow.status && userRow.status !== 'active') {
      return NextResponse.json({ error: 'Account is not active' }, { status: 403 })
    }

    if (userRow.email) {
      try {
        const supabaseAuth = await getSupabaseAuthClient()
        if (supabaseAuth) {
          await supabaseAuth.auth.signInWithPassword({
            email: userRow.email,
            password: pin,
          })
        }
      } catch (error) {
        console.warn('[login] optional auth session skipped:', error)
      }
    }

    const profileResult = await selectWithColumnFallback('users', PROFILE_COLUMN_SETS, (query) =>
      query.eq('id', userRow.id).limit(1),
    )
    const profileRows = (
      Array.isArray(profileResult.data) ? profileResult.data : profileResult.data ? [profileResult.data] : []
    ) as Record<string, unknown>[]
    const profile = profileRows[0]

    if (profileResult.error || !profile) {
      console.error('[login] profile fetch failed:', profileResult.error?.message)
      return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
    }

    void supabaseAdmin
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', userRow.id)

    const companyId = typeof profile.company_id === 'string' ? profile.company_id : ''
    const { subscription } = companyId ? await loadCompanySubscription(companyId) : { subscription: null }
    const visible = resolveVisibleSubscription(subscription)

    return NextResponse.json({
      user: {
        ...profile,
        subscription_plan: visible?.planName || null,
        subscription_status: visible?.status || null,
        trial_ends_at: visible?.trialEndsAt || null,
      },
    })
  } catch (error) {
    console.error('[login] unhandled error:', error)
    return NextResponse.json(
      {
        error: 'Unable to sign in',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
