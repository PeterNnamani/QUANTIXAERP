import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSeedChartOfAccounts } from '../lib/accounting/chart-of-accounts.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const dashboardPath = path.join(repoRoot, 'app/dashboard/page.tsx')
const dashboardContent = fs.readFileSync(dashboardPath, 'utf8')

test('dashboard computes inventory counts from state.inventory', () => {
    assert.match(dashboardContent, /const lowStock = state\.inventory\.filter\(\(item\) => item\.closing > 0 && item\.closing <= 10\)\.length/)
    assert.match(dashboardContent, /const outOfStock = state\.inventory\.filter\(\(item\) => item\.closing <= 0\)\.length/)
    assert.match(dashboardContent, /const expiring = state\.inventory\.filter\(\(item\) => item\.closing > 0 && item\.closing <= 5\)\.length/)
})

test('dashboard uses derived sales and activity values instead of placeholders', () => {
    assert.equal(dashboardContent.includes('<strong>143</strong>'), false, 'dashboard still contains placeholder orders count')
    assert.equal(dashboardContent.includes('<strong>86</strong>'), false, 'dashboard still contains placeholder invoices count')
    assert.equal(dashboardContent.includes('Invoice INV-1034 created'), false, 'dashboard still contains placeholder recent activity message')
})

test('default expense categories exclude drawings and fixed asset entries', () => {
    const utilsContent = fs.readFileSync(path.join(repoRoot, 'lib/utils.ts'), 'utf8')
    assert.equal(/'Drawings'/.test(utilsContent), false, 'Drawings should not be in the default expense category list')
    assert.equal(/'Fixed Asset'/.test(utilsContent), false, 'Fixed Asset should not be in the default expense category list')
})

test('bank account persistence upserts on the company-scoped unique key', () => {
    const contextContent = fs.readFileSync(path.join(repoRoot, 'lib/context.tsx'), 'utf8')
    assert.match(contextContent, /onConflict:\s*'company_id,name'/, 'bank_accounts upsert must target the company-scoped unique key')
})

test('expense recording checks selected account balance before withdrawal', () => {
    const expensesPageContent = fs.readFileSync(path.join(repoRoot, 'app/expenses/page.tsx'), 'utf8')
    assert.match(expensesPageContent, /Insufficient funds|insufficient funds/i, 'expense save flow should reject withdrawals that exceed the selected account balance')
    assert.match(expensesPageContent, /selectedAccountBalance|accountBalance/i, 'expense save flow should compute the selected account balance before deduction')
})

test('seed chart of accounts includes every trial-balance opening-balance account once', () => {
    const seeds = buildSeedChartOfAccounts()
    const names = seeds.map((account) => account.name)
    const required = [
        'Property, Plant & Equipment',
        'Cash and Bank Balance',
        'Inventory',
        'Prepayments',
        'Receivables',
        'Capital',
        'Retained Earnings',
        'Drawings',
        'Loan',
        'Payables',
        'Accruals',
    ]

    for (const name of required) {
        assert.equal(names.filter((item) => item === name).length, 1, `${name} should be seeded once`)
    }
})

const filesToCheck = [
    'app/inventory/page.tsx',
    'app/product-manager/page.tsx',
    'app/daily-close/page.tsx',
    'app/annual-report/page.tsx',
    'app/supplier-rebates/page.tsx',
    'app/receivables/page.tsx',
    'app/payables/page.tsx',
]

const bannedPatterns = [
    { pattern: /value:\s*'19'/, description: 'inventory expiring-soon placeholder' },
    { pattern: /value:\s*formatNumber\(128\)/, description: 'product manager inactive placeholder' },
    { pattern: /value:\s*'53'/, description: 'product manager brands placeholder' },
    { pattern: /value:\s*'1,420'/, description: 'product manager variants placeholder' },
    { pattern: /const otherIncome = 15000/, description: 'daily close dummy other-income value' },
    { pattern: /const taxAmount = 22000/, description: 'daily close dummy tax value' },
    { pattern: /₦500M|₦700M|₦850M|19\.4%/, description: 'annual report dummy chart values' },
    { pattern: /value:\s*'\$4,850,000'|value:\s*'\$1,250,000'|value:\s*'\$3,600,000'|value:\s*'24'|value:\s*'5'|value:\s*'4\.8%'/, description: 'supplier rebate dummy summary values' },
    { pattern: /ABC Ltd|John Enterprises|Prime Stores|Elite Ventures|Tomorrow ·|This Week ·|Next Week ·|ap@dangotecement\.com/, description: 'receivables/payables demo content' },
]

for (const file of filesToCheck) {
    test(`does not contain dummy data in ${file}`, () => {
        const filePath = path.join(repoRoot, file)
        const content = fs.readFileSync(filePath, 'utf8')

        for (const { pattern, description } of bannedPatterns) {
            assert.equal(pattern.test(content), false, `${file} still contains ${description}`)
        }
    })
}
