// Shared timestamp of the last user interaction. It lives in localStorage so
// that every open tab reports into the same clock instead of each tab running
// an independent idle timer and signing the user out from under the others.
export const ACTIVITY_KEY = 'hw_last_activity'

export const DEFAULT_SESSION_TIMEOUT_MINUTES = 20
export const MIN_SESSION_TIMEOUT_MINUTES = 5
export const MAX_SESSION_TIMEOUT_MINUTES = 240

// Re-check on an interval rather than arming one long timer: browsers throttle
// timers in hidden tabs, so a single pending timeout fires at an unpredictable
// moment after the tab is backgrounded.
export const ACTIVITY_POLL_MS = 15 * 1000
export const ACTIVITY_WRITE_THROTTLE_MS = 5 * 1000

export function clampSessionTimeoutMinutes(value: unknown): number | null {
    const minutes = Number(value)
    if (!Number.isFinite(minutes) || minutes <= 0) return null
    return Math.min(MAX_SESSION_TIMEOUT_MINUTES, Math.max(MIN_SESSION_TIMEOUT_MINUTES, minutes))
}

// The company security policy sets the longest a session may sit idle. A user
// may shorten it for themselves in Preferences but never extend it past the
// company limit.
export function resolveSessionTimeoutMs(companyMinutes: unknown, userMinutes: unknown): number {
    const companyLimit = clampSessionTimeoutMinutes(companyMinutes) ?? DEFAULT_SESSION_TIMEOUT_MINUTES
    const userPreference = clampSessionTimeoutMinutes(userMinutes)
    const minutes = userPreference ? Math.min(userPreference, companyLimit) : companyLimit
    return minutes * 60 * 1000
}

export function isSessionExpired(lastActivityAt: number, now: number, timeoutMs: number): boolean {
    if (!Number.isFinite(lastActivityAt) || lastActivityAt <= 0) return false
    // A clock change or a timestamp written by a tab running slightly ahead can
    // put the last activity in the future; treat that as recent, not expired.
    if (lastActivityAt > now) return false
    return now - lastActivityAt >= timeoutMs
}
