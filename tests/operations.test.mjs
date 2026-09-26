import test from 'node:test'
import assert from 'node:assert/strict'

const { appendVatSection, monthPeriod, nextReportRun, outputVat, previousPeriod, reportPeriod, selectAnnualSections, taxPackageSection, yearPeriod } = await import('../lib/report-controls.ts')
const { resolvePayrollStaff, validateKpiScore } = await import('../lib/payroll.ts')
const { isPayrollActivity, pendingAuditActivity } = await import('../lib/notifications.ts')

test('report ranges use real calendar bounds', () => {
    assert.deepEqual(monthPeriod('2026-09'), { label: '2026-09', startDate: '2026-09-01', endDate: '2026-09-30' })
    assert.deepEqual(reportPeriod('Daily', '2026-09-26'), { label: '2026-09-26', startDate: '2026-09-26', endDate: '2026-09-26' })
    assert.deepEqual(reportPeriod('Weekly', '2026-09-26'), { label: '2026-09-21 to 2026-09-27', startDate: '2026-09-21', endDate: '2026-09-27' })
    assert.deepEqual(previousPeriod(monthPeriod('2026-09')), { label: '2026-08', startDate: '2026-08-01', endDate: '2026-08-31' })
    assert.deepEqual(previousPeriod(reportPeriod('Daily', '2026-09-01')), { label: '2026-08-31', startDate: '2026-08-31', endDate: '2026-08-31' })
    assert.deepEqual(yearPeriod(2026), { label: '2026', startDate: '2026-01-01', endDate: '2026-12-31' })
    assert.equal(nextReportRun('monthly', new Date('2026-09-26T12:00:00Z')), '2026-10-01')
    assert.equal(nextReportRun('annual', new Date('2026-09-26T12:00:00Z')), '2027-01-01')
})

test('VAT and annual report modes change the exported figures', () => {
    assert.equal(outputVat(1075, 0.075, true), 75)
    assert.equal(outputVat(1000, 0.075, false), 75)
    const withVat = appendVatSection([{ title: 'Statement of Profit or Loss', columns: ['Description', '2026-09', 'Total'], rows: [['Revenue', 1075, 1075]] }], [1075], ['2026-09'], 0.075, true)
    assert.equal(withVat.at(-1)?.rows[0]?.[1], 75)
    const tax = taxPackageSection(1075, 1000, 0.075, true)
    assert.deepEqual(tax.rows.map((row) => row[0]), ['Output VAT', 'Company income tax', 'Education tax', 'Estimated tax'])
    assert.equal(tax.rows[1][1], 200)
    assert.equal(tax.rows[2][1], 30)
    const sections = [
        { title: 'Statement of Profit or Loss', columns: ['Description'], rows: [] },
        { title: 'Statement of Financial Position', columns: ['Description'], rows: [] },
        { title: 'Property, Plant & Equipment', columns: ['Description'], rows: [] },
    ]
    assert.deepEqual(selectAnnualSections(sections, 'board', 'All statements').map((section) => section.title), ['Statement of Profit or Loss', 'Statement of Financial Position'])
    assert.deepEqual(selectAnnualSections(sections, 'summary', 'Property, Plant & Equipment').map((section) => section.title), ['Property, Plant & Equipment'])
})

test('payroll keeps the staff code after the payment row stores the user id', () => {
    const staff = [{ id: '8b6d6c3e-6e3a-4a1e-9c1a-0d4e6f8a9b21', staffId: 'STF-014', name: 'Ada Okonkwo' }]
    assert.deepEqual(resolvePayrollStaff(staff[0].id, staff), { staffId: 'STF-014', staffName: 'Ada Okonkwo' })
    assert.deepEqual(resolvePayrollStaff('STF-014', staff), { staffId: 'STF-014', staffName: 'Ada Okonkwo' })
    assert.equal(validateKpiScore(''), null)
    assert.equal(validateKpiScore('100'), null)
    assert.equal(validateKpiScore('101'), 'KPI score must be between 0 and 100.')
})

test('notifications baseline history and skip a second payroll alert', () => {
    const logs = [
        { id: 'old', event_time: '2026-09-01T10:00:00Z' },
        { id: 'new', event_time: '2026-09-26T10:00:00Z' },
    ]
    const seeded = pendingAuditActivity(logs, '')
    assert.deepEqual(seeded.pending.map((log) => log.id), ['old', 'new'])
    assert.equal(seeded.nextCursor, String(new Date('2026-09-26T10:00:00Z').getTime()))
    const pending = pendingAuditActivity(logs, String(new Date('2026-09-01T10:00:00Z').getTime()))
    assert.deepEqual(pending.pending.map((log) => log.id), ['new'])
    assert.equal(isPayrollActivity({ desc: 'Payroll payment - Ada', category: 'Salary' }), true)
    assert.equal(isPayrollActivity({ activity: 'Payroll', description: 'Payroll payment - Ada' }), true)
    assert.equal(isPayrollActivity({ desc: 'Office rent', category: 'Admin / Overhead' }), false)
})
