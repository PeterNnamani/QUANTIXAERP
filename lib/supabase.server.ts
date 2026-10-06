import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getSupabasePublicKey, getSupabaseSecretKey, getSupabaseUrl } from '@/lib/env.server'

let adminClient: SupabaseClient | null = null

export function getSupabaseAdminClient() {
  if (adminClient) return adminClient

  const supabaseUrl = getSupabaseUrl()
  const supabaseSecretKey = getSupabaseSecretKey()
  if (!supabaseUrl || !supabaseSecretKey) return null

  adminClient = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  return adminClient
}

export async function getSupabaseAuthClient() {
  const supabaseUrl = getSupabaseUrl()
  const supabasePublicKey = getSupabasePublicKey()
  if (!supabaseUrl || !supabasePublicKey) return null

  const cookieStore = await cookies()
  return createServerClient(supabaseUrl, supabasePublicKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Cookie writes are only allowed in Route Handlers and Server Actions.
        }
      },
    },
  })
}

export function isMissingColumnError(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === '42703' || /column .* does not exist/i.test(error?.message || '')
}

function missingSchemaColumn(error: unknown, values: Record<string, unknown>): string | null {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : String(error || '')
  const match =
    message.match(/['"]?([a-zA-Z_][a-zA-Z0-9_]*)['"]?\s+(?:column|field)\b/i) ||
    message.match(/(?:column|field)(?:\s+of)?\s+['"]?([a-zA-Z_][a-zA-Z0-9_]*)['"]?/i)
  const column = match?.[1]
  return column && Object.prototype.hasOwnProperty.call(values, column) ? column : null
}

export async function writeWithSchemaFallback<T>(
  values: Record<string, unknown>,
  operation: (
    values: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: { code?: string; message?: string } | null }>,
) {
  const compatibleValues = { ...values }
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const result = await operation(compatibleValues)
    if (!result.error) return result
    const unsupportedColumn = missingSchemaColumn(result.error, compatibleValues)
    if (!unsupportedColumn) return result
    delete compatibleValues[unsupportedColumn]
  }
  return { data: null, error: { message: 'Unable to match the table schema.' } }
}

export const supabaseAdmin = getSupabaseAdminClient()
