import { NextResponse } from 'next/server'
import { getSupabaseAdminClient, writeWithSchemaFallback } from '@/lib/supabase.server'
import { getSupabaseConfigStatus } from '@/lib/env.server'
import { hashPin, isValidPin } from '@/lib/pin'

type SignupBody = {
  companyName?: string
  fullName?: string
  email?: string
  pin?: string
  username?: string
  role?: string
  roleTitle?: string
}

function generateStaffId(): string {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase()
  return `STF-${Date.now().toString().slice(-8)}-${rand.slice(0, 4)}`
}

export async function POST(req: Request) {
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

  let body: SignupBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const companyName = (body.companyName || '').trim()
  const fullName = (body.fullName || '').trim()
  const email = (body.email || '').trim().toLowerCase()
  const pin = (body.pin || '').trim()
  const username = (body.username || '').trim().toLowerCase()
  const role = (body.role || 'business-owner').trim()
  const roleTitle = (body.roleTitle || 'Business Owner').trim()

  if (!companyName || !fullName || !email || !pin || !username) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!isValidPin(pin)) {
    return NextResponse.json({ error: 'PIN must be exactly 6 digits' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return NextResponse.json(
      { error: 'Username must be 3-32 chars: letters, digits, dot, underscore, dash' },
      { status: 400 },
    )
  }

  let authUserId: string | null = null
  try {
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
    })
    if (authData?.user?.id) {
      authUserId = authData.user.id
    } else if (authErr) {
      console.warn('[register] optional auth user skipped:', authErr.message)
    }
  } catch (error) {
    console.warn('[register] optional auth user skipped:', error)
  }

  let pinHash: string | null = null
  try {
    pinHash = await hashPin(pin)
  } catch (err) {
    if (authUserId) await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {})
    return NextResponse.json(
      {
        error: 'Failed to secure PIN',
        detail: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 },
    )
  }

  const { data: company, error: companyErr } = await supabaseAdmin
    .from('companies')
    .insert({ name: companyName })
    .select('id, name')
    .single()

  if (companyErr || !company) {
    if (authUserId) await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {})
    return NextResponse.json(
      { error: 'Failed to create company', detail: companyErr?.message },
      { status: 500 },
    )
  }

  const staffId = generateStaffId()
  const insertData: Record<string, unknown> = {
    company_id: company.id,
    email,
    full_name: fullName,
    role,
    role_title: roleTitle,
    staff_id: staffId,
    username,
    pin,
    pin_hash: pinHash,
    status: 'active',
  }
  if (authUserId) insertData.auth_user_id = authUserId

  const { data: inserted, error: userErr } = await writeWithSchemaFallback(insertData, async (values) =>
    supabaseAdmin.from('users').insert(values).select('id').single(),
  )

  if (userErr || !inserted) {
    await supabaseAdmin.from('companies').delete().eq('id', company.id)
    if (authUserId) await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {})
    return NextResponse.json(
      { error: 'Failed to create user profile', detail: userErr?.message },
      { status: 500 },
    )
  }

  return NextResponse.json({
    user: {
      id: inserted.id,
      company_id: company.id,
      email,
      full_name: fullName,
      role,
      role_title: roleTitle,
      staff_id: staffId,
      username,
      status: 'active',
      access_levels: null,
      branch: null,
      department: null,
      position: null,
    },
    company: { id: company.id, name: company.name },
  })
}
