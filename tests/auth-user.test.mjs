import test from 'node:test'
import assert from 'node:assert/strict'

const {
    credentialsMatch,
    findMatchingUser,
} = await import('../lib/auth-credentials.ts')

const ownerRow = {
    company_id: 'company-1',
    staff_id: 'STF-1001',
    username: 'OwnerAdmin',
    pin: '1234',
    status: 'active',
    updated_at: '2026-09-26T10:00:00.000Z',
}

test('login matches username or staff ID without caring about case', () => {
    assert.equal(credentialsMatch(ownerRow, 'owneradmin', '1234'), true)
    assert.equal(credentialsMatch(ownerRow, 'STF-1001', '1234'), true)
    assert.equal(credentialsMatch(ownerRow, 'owneradmin', '0000'), false)
    assert.equal(credentialsMatch({ ...ownerRow, status: 'disabled' }, 'owneradmin', '1234'), false)
})

test('the newest matching company account wins when credentials collide', () => {
    const older = { ...ownerRow, company_id: 'company-old', updated_at: '2026-01-01T00:00:00.000Z' }
    const newer = { ...ownerRow, company_id: 'company-new', updated_at: '2026-09-26T12:00:00.000Z' }
    const match = findMatchingUser([older, newer], 'OWNERADMIN', '1234')
    assert.equal(match?.company_id, 'company-new')
})
