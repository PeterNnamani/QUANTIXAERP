import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

type LoginBody = {
  username?: string
  pin?: string
}

export async function POST(req: Request) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'Public Supabase env missing' }, { status: 500 })
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

  // Admin client for privileged DB reads (service_role).
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY!}` },
      },
    }
  )

  // SSR client — writes auth cookies in the format createBrowserClient reads.
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )

  // 1. Resolve username/staff_id → public.users row
  const { data: userRow, error: lookupErr } = await supabaseAdmin
    .from('users')
    .select('id, auth_user_id, email, status')
    .or(`username.ilike.${raw},staff_id.ilike.${raw}`)
    .maybeSingle()

  if (lookupErr) {
    console.error('[login] lookup failed:', JSON.stringify(lookupErr, null, 2))
    return NextResponse.json(
      { error: 'Lookup failed', detail: lookupErr.message },
      { status: 500 }
    )
  }

  if (!userRow || !userRow.email) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
  }

  if (userRow.status && userRow.status !== 'active') {
    return NextResponse.json({ error: 'Account is not active' }, { status: 403 })
  }

  if (!userRow.auth_user_id) {
    return NextResponse.json(
      { error: 'Account has not been migrated. Contact your administrator.' },
      { status: 409 }
    )
  }

  // 2. Authenticate. Cookies are set by the SSR client automatically.
  const { data: authData, error: authErr } = await supabaseAuth.auth.signInWithPassword({
    email: userRow.email,
    password: pin,
  })

  if (authErr || !authData?.user) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
  }

  // 3. Fetch the sanitized profile (admin client, service_role).
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('users')
    .select(
      'id, company_id, email, full_name, role, role_title, access_levels, staff_id, username, branch, department, position, status'
    )
    .eq('id', userRow.id)
    .single()

  if (profileErr || !profile) {
    console.error('[login] profile fetch failed:', profileErr?.message)
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
  }

  // 4. Fire-and-forget last_login update.
  void supabaseAdmin
    .from('users')
    .update({ last_login: new Date().toISOString() })
    .eq('id', userRow.id)

  return NextResponse.json({ user: profile })
}