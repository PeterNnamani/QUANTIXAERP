export type PayrollStaff = { id: string; staffId: string; name: string }

export function resolvePayrollStaff(paymentStaffId: string, staff: PayrollStaff[]): { staffId: string; staffName: string } {
    const member = staff.find((item) => item.id === paymentStaffId || item.staffId === paymentStaffId)
    return {
        staffId: member?.staffId || paymentStaffId,
        staffName: member?.name || 'Staff member',
    }
}

export function validateKpiScore(value: string): string | null {
    if (!value.trim()) return null
    const score = Number(value)
    if (!Number.isFinite(score) || score < 0 || score > 100) return 'KPI score must be between 0 and 100.'
    return null
}
