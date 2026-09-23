import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const { auditSchemaCoverage } = await import('../scripts/verify-schema-coverage.js')

test('schema auditor finds missing tables and columns', async () => {
    const report = await auditSchemaCoverage(repoRoot)

    assert.ok(report.tables.length > 0, 'expected schema tables to be parsed')
    assert.ok(Array.isArray(report.missingTables), 'expected missing table list')
    assert.ok(Array.isArray(report.missingColumns), 'expected missing column list')
    assert.ok(Array.isArray(report.dbReferences), 'expected db reference summary')
    assert.ok(!report.missingColumns.some((item) => item.table === 'prepayments'), 'expected prepayments columns to be present')
    assert.ok(!report.missingColumns.some((item) => item.table === 'prepayment_schedules'), 'expected prepayment_schedules columns to be present')
})
