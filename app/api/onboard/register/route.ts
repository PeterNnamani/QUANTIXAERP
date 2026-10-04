import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hashPin, isValidPin } from '@/lib/pin'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

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
  // --- Guard: environment ---
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  // --- Parse ---
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

  // --- Validate ---
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
      { status: 400 }
    )
  }

  // --- 1. Create auth user ---
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,
  })

  if (authErr || !authData?.user) {
    const msg = authErr?.message || 'Failed to create auth user'
    const status = /already|exists|registered/i.test(msg) ? 409 : 500
    return NextResponse.json({ error: msg }, { status })
  }

  const authUserId = authData.user.id

  // --- 2. Hash the PIN before we write anything else. If this fails, we
  //        delete the auth user and return, so no orphan rows are left. ---
  let pinHash: string
  try {
    pinHash = await hashPin(pin)
  } catch (err) {
    await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {})
    return NextResponse.json(
      {
        error: 'Failed to secure PIN',
        detail: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 }
    )
  }

  // --- 3. Create company ---
  const { data: company, error: companyErr } = await supabaseAdmin
    .from('companies')
    .insert({ name: companyName })
    .select('id, name')
    .single()

  if (companyErr || !company) {
    await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {})
    return NextResponse.json(
      { error: 'Failed to create company', detail: companyErr?.message },
      { status: 500 }
    )
  }

  // --- 4. Create public.users row ---
  const staffId = generateStaffId()
  const { data: user, error: userErr } = await supabaseAdmin
    .from('users')
    .insert({
      company_id: company.id,
      auth_user_id: authUserId,
      email,
      full_name: fullName,
      role,
      role_title: roleTitle,
      staff_id: staffId,
      username,
      pin: null,          // no plaintext going forward
      pin_hash: pinHash,  // bcrypt hash
      status: 'active',
    })
    .select(
      'id, company_id, email, full_name, role, role_title, staff_id, username, status, access_levels, branch, department, position'
    )
    .single()

  if (userErr || !user) {
    // Compensating cleanup: drop the company and the auth user.
    await supabaseAdmin.from('companies').delete().eq('id', company.id)
    await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {})
    return NextResponse.json(
      { error: 'Failed to create user profile', detail: userErr?.message },
      { status: 500 }
    )
  }

  // --- Success ---
  return NextResponse.json({
    user,
    company: { id: company.id, name: company.name },
  })
}