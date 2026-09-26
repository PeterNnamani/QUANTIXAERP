import test from 'node:test'
import assert from 'node:assert/strict'
import {
    clampSessionTimeoutMinutes,
    DEFAULT_SESSION_TIMEOUT_MINUTES,
    isSessionExpired,
    MAX_SESSION_TIMEOUT_MINUTES,
    MIN_SESSION_TIMEOUT_MINUTES,
    resolveSessionTimeoutMs,
} from '../lib/session.ts'

const minutes = (value) => value * 60 * 1000

test('an idle session lasts the configured company timeout, not two minutes', () => {
    assert.equal(resolveSessionTimeoutMs(20, undefined), minutes(20))
    assert.equal(resolveSessionTimeoutMs(45, undefined), minutes(45))
    // The old hardcoded behaviour signed everyone out after two minutes.
    assert.notEqual(resolveSessionTimeoutMs(20, undefined), minutes(2))
})

test('a missing or unusable company setting falls back to the documented default', () => {
    assert.equal(resolveSessionTimeoutMs(undefined, undefined), minutes(DEFAULT_SESSION_TIMEOUT_MINUTES))
    assert.equal(resolveSessionTimeoutMs(null, undefined), minutes(DEFAULT_SESSION_TIMEOUT_MINUTES))
    assert.equal(resolveSessionTimeoutMs(0, undefined), minutes(DEFAULT_SESSION_TIMEOUT_MINUTES))
    assert.equal(resolveSessionTimeoutMs('not a number', undefined), minutes(DEFAULT_SESSION_TIMEOUT_MINUTES))
    assert.equal(resolveSessionTimeoutMs(Number.NaN, undefined), minutes(DEFAULT_SESSION_TIMEOUT_MINUTES))
})

test('timeouts stay inside the range the settings form allows', () => {
    assert.equal(clampSessionTimeoutMinutes(1), MIN_SESSION_TIMEOUT_MINUTES)
    assert.equal(clampSessionTimeoutMinutes(10_000), MAX_SESSION_TIMEOUT_MINUTES)
    assert.equal(clampSessionTimeoutMinutes(30), 30)
    assert.equal(clampSessionTimeoutMinutes(-5), null)
    assert.equal(resolveSessionTimeoutMs(10_000, undefined), minutes(MAX_SESSION_TIMEOUT_MINUTES))
})

test('a user may tighten their own timeout but never exceed company policy', () => {
    assert.equal(resolveSessionTimeoutMs(60, 15), minutes(15))
    assert.equal(resolveSessionTimeoutMs(30, 120), minutes(30))
    assert.equal(resolveSessionTimeoutMs(30, undefined), minutes(30))
    // Numeric strings arrive from the settings inputs.
    assert.equal(resolveSessionTimeoutMs('60', '15'), minutes(15))
})

test('a session expires only once it has been idle past the timeout', () => {
    const now = 1_700_000_000_000
    const timeout = minutes(20)
    assert.equal(isSessionExpired(now - minutes(19), now, timeout), false)
    assert.equal(isSessionExpired(now - minutes(20), now, timeout), true)
    assert.equal(isSessionExpired(now - minutes(21), now, timeout), true)
    assert.equal(isSessionExpired(now, now, timeout), false)
})

test('activity recorded in another tab keeps this tab signed in', () => {
    const now = 1_700_000_000_000
    const timeout = minutes(20)
    const thisTabLastSawActivity = now - minutes(30)
    const otherTabLastSawActivity = now - minutes(1)
    const shared = Math.max(thisTabLastSawActivity, otherTabLastSawActivity)
    assert.equal(isSessionExpired(shared, now, timeout), false)
    // Without the shared clock the idle tab would have signed the user out.
    assert.equal(isSessionExpired(thisTabLastSawActivity, now, timeout), true)
})

test('an unreadable or future-dated activity stamp never forces a sign-out', () => {
    const now = 1_700_000_000_000
    const timeout = minutes(20)
    assert.equal(isSessionExpired(0, now, timeout), false)
    assert.equal(isSessionExpired(Number.NaN, now, timeout), false)
    assert.equal(isSessionExpired(now + minutes(5), now, timeout), false)
})
