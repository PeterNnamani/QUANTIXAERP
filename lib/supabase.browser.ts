import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let browserClient: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient | null {
  if (browserClient) return browserClient
  if (!supabaseUrl || !supabaseAnonKey) return null

  // createBrowserClient from @supabase/ssr reads the auth cookie set by
  // the server-side login route, attaches the JWT to every request, and
  // refreshes it automatically. This is what makes `supabase.from(...)`
  // run as the authenticated user instead of as `anon`.
  browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey)

  return browserClient
}

export const supabase = getSupabaseClient()