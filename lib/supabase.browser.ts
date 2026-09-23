import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let browserClient: SupabaseClient | null = null

export function getSupabaseClient() {
    if (browserClient) return browserClient
    if (!supabaseUrl || !supabaseAnonKey) return null

    browserClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: false,
            detectSessionInUrl: false,
        },
    })

    return browserClient
}

export const supabase = getSupabaseClient()
