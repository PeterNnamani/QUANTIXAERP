'use client'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(req: Request) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  let body: { username?: string; pin?: string }
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

  // PostgREST .or() supports ilike for case-insensitive matching.
  // Match either the username or the staff_id, ignoring case.
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, company_id, full_name, role, role_title, access_levels, staff_id, username, branch, department, position, status')
    .or(`username.ilike.${raw},staff_id.ilike.${raw}`)
    .eq('pin', pin)
    .maybeSingle()

  if (error) {
    console.error('[login] lookup failed:', JSON.stringify(error, null, 2))
    return NextResponse.json(
      { error: 'Lookup failed', detail: error.message },
      { status: 500 }
    )
  }

  if (!data) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
  }

  if (data.status && data.status !== 'active') {
    return NextResponse.json({ error: 'Account is not active' }, { status: 403 })
  }

  return NextResponse.json({ user: data })
}