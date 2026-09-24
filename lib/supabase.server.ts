import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

let adminClient: SupabaseClient | null = null

export function getSupabaseAdminClient() {
    if (adminClient) return adminClient
    if (!supabaseUrl || !supabaseSecretKey) return null

    adminClient = createClient(supabaseUrl, supabaseSecretKey, {
        auth: {
            persistSession: false,
        },
    })

    return adminClient
}

export const supabaseAdmin = getSupabaseAdminClient()
