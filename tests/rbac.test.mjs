import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { canAccessRoute, canEditPermission, explicitAccessLevels, findStaffMemberByLogin, getPermissionAccessLevel, getVisibleNavigationItems, hasExplicitMenuGrant, menuAccessFromLevels, roleHasPermission, savedMenuAccess } from '../lib/rbac.ts'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('super admin has provisioning/oversight permissions, not transactional', () => {
    const superAdmin = { role: 'super-admin' }
    assert.equal(roleHasPermission(superAdmin, 'dashboard'), true)
    assert.equal(roleHasPermission(superAdmin, 'settings'), true)
    assert.equal(canAccessRoute(superAdmin, '/backup'), true)
    assert.equal(canAccessRoute(superAdmin, '/banks'), true)
    assert.equal(canAccessRoute(superAdmin, '/bank-txn'), true)
    assert.equal(canAccessRoute(superAdmin, '/asset-schedule'), true)
    assert.ok(getVisibleNavigationItems(superAdmin).some((item) => item.href === '/asset-schedule'))
    assert.equal(canEditPermission(superAdmin, 'banks'), false)
    assert.equal(canEditPermission(superAdmin, 'bankTxn'), false)
    // Should NOT have transactional posting permissions
    assert.equal(canAccessRoute(superAdmin, '/sales'), false)
    assert.equal(canAccessRoute(superAdmin, '/ledger'), false)
})

test('cashier sees only sales and dashboard menus', () => {
    const cashier = { role: 'cashier' }
    const visible = getVisibleNavigationItems(cashier)
    const hrefs = visible.map((item) => item.href)

    assert.ok(hrefs.includes('/dashboard'))
    assert.ok(hrefs.includes('/sales'))
    assert.ok(!hrefs.includes('/settings'))
    assert.ok(!hrefs.includes('/ledger'))
})

test('professional Super Admin sees administration and default banking menus', () => {
    const businessOwner = {
        role: 'business-owner',
        subscriptionPlan: 'Professional Edition',
    }
    const visible = getVisibleNavigationItems(businessOwner)
    const hrefs = visible.map((item) => item.href)

    assert.ok(hrefs.includes('/dashboard'))
    assert.ok(hrefs.includes('/staff-management'))
    assert.ok(hrefs.includes('/role-management'))
    assert.ok(hrefs.includes('/settings'))
    assert.ok(hrefs.includes('/banks'))
    assert.ok(hrefs.includes('/bank-txn'))
    assert.equal(canEditPermission(businessOwner, 'banks'), false)
    assert.equal(canEditPermission(businessOwner, 'bankTxn'), false)
    assert.ok(!hrefs.includes('/sales'))
    assert.equal(canAccessRoute(businessOwner, '/staff-management'), true)
    assert.equal(canAccessRoute(businessOwner, '/sales'), false)
})

test('trial and Growth Super Admins see operational menus and staff management', () => {
    const trialOwner = { role: 'business-owner', subscriptionPlan: 'Professional Edition', subscriptionStatus: 'trial' }
    const growthOwner = { role: 'business-owner', subscriptionPlan: 'Growth Edition', subscriptionStatus: 'active' }

    for (const owner of [trialOwner, growthOwner]) {
        const hrefs = getVisibleNavigationItems(owner).map((item) => item.href)
        assert.ok(hrefs.includes('/sales'))
        assert.ok(hrefs.includes('/inventory'))
        assert.ok(hrefs.includes('/staff-management'))
        assert.equal(canAccessRoute(owner, '/sales'), true)
        assert.equal(canAccessRoute(owner, '/staff-management'), true)
    }
})

test('owner menu selections control visibility while banking remains view-only', () => {
    const owner = {
        role: 'business-owner',
        accessLevels: { dashboard: 'edit', admin: 'edit', settings: 'edit', banks: 'edit' },
    }
    const hrefs = getVisibleNavigationItems(owner).map((item) => item.href)

    assert.ok(hrefs.includes('/banks'))
    assert.ok(!hrefs.includes('/bank-txn'))
    assert.ok(!hrefs.includes('/sales'))
    assert.equal(canEditPermission(owner, 'banks'), false)
})

test('route access is denied when module permission is missing', () => {
    const accountant = { role: 'accountant' }
    assert.equal(canAccessRoute(accountant, '/settings'), false)
    assert.equal(canAccessRoute(accountant, '/ledger'), true)
})

test('staff login can be resolved by staff id and generated pin', () => {
    const staffMembers = [
        {
            id: 'staff-1',
            name: 'Ada Okafor',
            staffId: 'ADA-1001',
            pin: '4821',
            roleId: 'cashier',
            roleName: 'Cashier',
            permissions: ['dashboard', 'sales'],
            dataScope: 'own',
            status: 'active',
            createdAt: '2026-01-01T00:00:00.000Z',
        },
    ]

    const match = findStaffMemberByLogin(staffMembers, 'ADA-1001', '4821')
    assert.ok(match)
    assert.equal(match?.name, 'Ada Okafor')
})

test('custom staff access keeps view-only menus visible without edit access', () => {
    const staff = {
        role: 'custom-role',
        accessLevels: { dashboard: 'view', reports: 'view', sales: 'edit' },
    }

    assert.equal(canAccessRoute(staff, '/reports'), true)
    assert.equal(canEditPermission(staff, 'reports'), false)
    assert.equal(canEditPermission(staff, 'sales'), true)
    assert.ok(getVisibleNavigationItems(staff).some((item) => item.href === '/sales'))
})

test('explicit staff menu selections override role defaults', () => {
    const staff = {
        role: 'accountant',
        accessLevels: { dashboard: 'view', expenses: 'view' },
    }

    const hrefs = getVisibleNavigationItems(staff).map((item) => item.href)
    assert.ok(hrefs.includes('/dashboard'))
    assert.ok(hrefs.includes('/expenses'))
    assert.ok(!hrefs.includes('/sales'))
    assert.ok(!hrefs.includes('/ledger'))
    assert.equal(canAccessRoute(staff, '/expenses'), true)
    assert.equal(canAccessRoute(staff, '/sales'), false)
})

test('sign-in and the workspace use the typescript access module', () => {
    assert.equal(fs.existsSync(path.join(repoRoot, 'lib/rbac.ts')), true)
    assert.equal(fs.existsSync(path.join(repoRoot, 'lib/rbac.mjs')), false)
    assert.equal(typeof savedMenuAccess, 'function')
    assert.equal(typeof hasExplicitMenuGrant, 'function')
    assert.equal(typeof explicitAccessLevels, 'function')
    assert.equal(typeof menuAccessFromLevels, 'function')
    assert.equal(typeof getPermissionAccessLevel, 'function')
    const user = { accessLevels: { loans: 'view', sales: 'edit' } }
    assert.equal(hasExplicitMenuGrant(user, 'loans'), true)
    assert.equal(hasExplicitMenuGrant(user, 'sales'), true)
    assert.equal(hasExplicitMenuGrant(user, 'ledger'), false)
})

test('an explicitly empty access map grants no menus', () => {
    const staff = { role: 'accountant', accessLevels: {} }

    assert.deepEqual(getVisibleNavigationItems(staff), [])
    assert.equal(canAccessRoute(staff, '/dashboard'), false)
    assert.equal(canAccessRoute(staff, '/expenses'), false)
})
