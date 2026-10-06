function firstEnv(...names: string[]): string {
  for (const name of names) {
    const raw = process.env[name]
    if (typeof raw !== 'string') continue
    const value = raw.trim().replace(/^["']|["']$/g, '')
    if (value) return value
  }
  return ''
}

export function getSupabaseUrl() {
  return firstEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')
}

export function getSupabaseSecretKey() {
  return firstEnv('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY')
}

export function getSupabasePublicKey() {
  return firstEnv(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
  )
}

export function getSupabaseConfigStatus() {
  return {
    hasUrl: Boolean(getSupabaseUrl()),
    hasSecretKey: Boolean(getSupabaseSecretKey()),
    hasPublicKey: Boolean(getSupabasePublicKey()),
  }
}
