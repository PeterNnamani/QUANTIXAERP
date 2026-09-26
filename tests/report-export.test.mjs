import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const managementAccounts = fs.readFileSync(path.join(repoRoot, 'lib/management-accounts.ts'), 'utf8')
const exportUtils = fs.readFileSync(path.join(repoRoot, 'lib/export-utils.ts'), 'utf8')
const reportsPage = fs.readFileSync(path.join(repoRoot, 'app/reports/page.tsx'), 'utf8')
const reportStyles = fs.readFileSync(path.join(repoRoot, 'app/dashboard-styles.css'), 'utf8')

test('management accounts use one authoritative bank source', () => {
    assert.match(managementAccounts, /input\.bankAccounts && input\.bankAccounts\.length > 0/)
    assert.match(managementAccounts, /: Object\.entries\(input\.banks \|\| \{\}\)/)
    assert.doesNotMatch(managementAccounts, /const cashRows = \[\.\.\.\(input\.bankAccounts \|\| \[\]\)/)
})

test('report categories and PPE export structure are protected', () => {
    assert.match(managementAccounts, /function linkedRevenue/)
    assert.match(managementAccounts, /const transactionCogs = periodValues/)
    assert.match(managementAccounts, /const revenue = linkedRevenue\(input, periods\)/)
    assert.match(managementAccounts, /const cogs = sum\(ledgerCogs\) > 0\.005 \? ledgerCogs : hasSales \? soldCogs : transactionCogs/)
    assert.match(managementAccounts, /row\.values\.some\(\(value\) => Math\.abs\(value\) > 0\.005\) \|\| \['Operations Cost', 'Bank Charges'\]/)
    assert.match(managementAccounts, /ACCUMULATED DEPRECIATION:/)
    assert.match(managementAccounts, /CARRYING AMOUNT/)
    assert.match(managementAccounts, /const totalAssets = ppeRows\[8\]\.total/)
    assert.match(managementAccounts, /label: 'CURRENT ASSETS:'/)
    assert.match(managementAccounts, /label: 'TOTAL ASSETS'/)
    assert.match(managementAccounts, /label: 'EQUITY:'/)
    assert.match(managementAccounts, /label: 'CURRENT LIABILITIES:'/)
    assert.match(managementAccounts, /label: 'TOTAL EQUITY & LIABILITIES'/)
    assert.match(exportUtils, /const statementRows = report\.sfp\.rows\.map/)
    assert.match(exportUtils, /row\.kind === 'section'/)
    assert.match(exportUtils, /row\[0\] === 'EXPENSES'/)
    assert.match(reportsPage, /label: 'EXPENSES'/)
    assert.match(reportStyles, /\.management-table \.report-section-row td/)
})

test('monthly and annual report exports use the requested sections', () => {
    assert.match(exportUtils, /managementAccountsToExportSections\(report: ManagementAccounts, includeTrialBalance = true\)/)
    assert.match(exportUtils, /if \(includeTrialBalance\) sections\.push\(\{ title: 'Trial Balance'/)
    assert.doesNotMatch(exportUtils, /newPage\('Notes and Basis'\)/)
    assert.match(fs.readFileSync(path.join(repoRoot, 'app/monthly-report/page.tsx'), 'utf8'), /label: 'Cash'/)
    assert.doesNotMatch(fs.readFileSync(path.join(repoRoot, 'app/monthly-report/page.tsx'), 'utf8'), /label: 'Cash movement'/)
    assert.match(fs.readFileSync(path.join(repoRoot, 'app/annual-report/page.tsx'), 'utf8'), /managementAccountsToExportSections\(exportReport, false\)/)
    assert.doesNotMatch(fs.readFileSync(path.join(repoRoot, 'app/annual-report/page.tsx'), 'utf8'), /'Trial Balance'/)
    assert.match(fs.readFileSync(path.join(repoRoot, 'app/annual-report/page.tsx'), 'utf8'), /label: 'Cash'/)
    assert.doesNotMatch(fs.readFileSync(path.join(repoRoot, 'app/annual-report/page.tsx'), 'utf8'), /label: 'Cash movement'/)
})

test('profit and loss exports always include finance cost and bank charges', () => {
    assert.match(managementAccounts, /const financeCostAccounts = accounts\.filter\(\(account\) => matches\(account, \['finance cost', 'interest'\]\)\)/)
    assert.match(managementAccounts, /const bankChargeAccounts = accounts\.filter\(\(account\) => matches\(account, \['bank charge'\]\)\)/)
    assert.match(managementAccounts, /financeExpenseValues = periodValues/)
    assert.match(managementAccounts, /bankChargeExpenseValues = periodValues/)
    assert.match(managementAccounts, /label: 'Finance Cost'|label: 'Bank Charges'/)
    assert.match(managementAccounts, /\['Operations Cost', 'Bank Charges'\]/)
    assert.match(exportUtils, /const alwaysKeepPnlRows = new Set\(\['Operations Cost', 'Bank Charges'\]\)/)
    assert.match(exportUtils, /row\.label !== 'Drawings'/)
})

test('report exports always use the current company name', () => {
    assert.match(exportUtils, /activeCompanyName = normalizedName \|\| null/)
    assert.match(exportUtils, /const resolvedCompanyName = companyName\?\.trim\(\) \|\| activeCompanyName \|\| 'Company'/)
    assert.match(exportUtils, /const companyName = options\.companyName\?\.trim\(\) \|\| activeCompanyName \|\| 'Company'/)
    assert.match(fs.readFileSync(path.join(repoRoot, 'app/monthly-report/page.tsx'), 'utf8'), /companyName: state\.companySettings\.companyName/)
    assert.match(fs.readFileSync(path.join(repoRoot, 'app/annual-report/page.tsx'), 'utf8'), /companyName: state\.companySettings\.companyName/)
})
