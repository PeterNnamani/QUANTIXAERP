import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

let adminClient: SupabaseClient | null = null

export function getSupabaseAdminClient() {
    if (adminClient) return adminClient
    if (!supabaseUrl || !supabaseServiceRoleKey) return null

    adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            persistSession: false,
        },
    })

    return adminClient
}

export const supabaseAdmin = getSupabaseAdminClient()
