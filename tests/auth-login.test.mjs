import test from 'node:test'
import assert from 'node:assert/strict'
import { pickLoginAccount } from '../lib/auth-login.ts'

const owner = {
    id: 'user-1',
    company_id: 'company-1',
    company_name: 'Northwind',
    staff_id: 'ADA-1001',
    username: 'ada',
    pin: '4821',
    full_name: 'Ada Okafor',
    role: 'business-owner',
    status: 'active',
}

test('login matches staff id or username without caring about letter case', () => {
    assert.equal(pickLoginAccount([owner], 'ada-1001', '4821').ok, true)
    assert.equal(pickLoginAccount([owner], 'ADA', '4821').account.full_name, 'Ada Okafor')
    assert.equal(pickLoginAccount([owner], 'ada-1001', '0000').ok, false)
    assert.equal(pickLoginAccount([owner], 'someone-else', '4821').reason, 'invalid')
})

test('a disabled account cannot sign in', () => {
    const result = pickLoginAccount([{ ...owner, status: 'disabled' }], 'ADA-1001', '4821')
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'disabled')
})

test('an account without a company cannot sign in', () => {
    const result = pickLoginAccount([{ ...owner, company_id: null }], 'ADA-1001', '4821')
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'invalid')
})
