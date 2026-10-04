import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 12

/**
 * bcrypt hash of a PIN, for at-rest storage in public.users.pin_hash.
 * Deliberately slow (~250ms at 12 rounds). Do not call in loops or bulk
 * operations — hash once per write.
 */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS)
}

/**
 * Compare a candidate PIN against a stored hash.
 * Returns false (never throws) for missing or invalid input.
 */
export async function verifyPin(
  pin: string,
  hash: string | null | undefined
): Promise<boolean> {
  if (!pin || !hash) return false
  try {
    return await bcrypt.compare(pin, hash)
  } catch {
    return false
  }
}

/**
 * Input validation shared by signup and PIN-change flows.
 * Six digits, matching the Supabase Auth password minimum.
 */
export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin)
}