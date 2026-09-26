export type PlanName = 'Growth Edition' | 'Professional Edition' | 'Enterprise Edition'

export const TRIAL_DAYS = 14
export const TRIAL_PLAN: PlanName = 'Professional Edition'

export type SubscriptionReplacementStatus = 'cancelled' | 'superseded'

export function getSubscriptionReplacementStatus(currentStatus: unknown): SubscriptionReplacementStatus {
    return String(currentStatus).toLowerCase() === 'trial' ? 'cancelled' : 'superseded'
}

export function getTrialEndDate(startedAt: string | Date): Date | null {
    const startDate = new Date(startedAt)
    if (Number.isNaN(startDate.getTime())) return null
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + TRIAL_DAYS)
    return endDate
}

export function isTrialActive(startedAt: string | Date, now: string | Date = new Date()): boolean {
    const endDate = getTrialEndDate(startedAt)
    const currentDate = new Date(now)
    return Boolean(endDate && !Number.isNaN(currentDate.getTime()) && currentDate < endDate)
}

const PLAN_LEVELS: Record<PlanName, number> = {
    'Growth Edition': 1,
    'Professional Edition': 2,
    'Enterprise Edition': 3,
}

export const PLAN_FEATURES: Record<PlanName, string[]> = {
    'Growth Edition': [
        'sales-purchasing',
        'inventory-management',
        'product-management',
        'accounting',
        'banking',
        'customer-supplier-management',
        'reports-dashboard',
        'role-based-access',
        'single-user',
    ],
    'Professional Edition': [
        'multi-location',
        'advanced-inventory',
        'approval-workflows',
        'advanced-reporting',
        'five-users',
    ],
    'Enterprise Edition': [
        'unlimited-users',
        'advanced-accounting',
        'crm',
        'hr',
        'advanced-security',
        'business-intelligence',
        'custom-reports',
    ],
}

const ROUTE_MINIMUM_PLANS: Record<string, PlanName> = {
    '/product-manager': 'Professional Edition',
    '/reports': 'Professional Edition',
    '/annual-report': 'Professional Edition',
    '/asset-schedule': 'Professional Edition',
    '/prepayments': 'Professional Edition',
    '/supplier-rebates': 'Professional Edition',
    '/staff-management': 'Professional Edition',
    '/payroll': 'Professional Edition',
    '/role-management': 'Professional Edition',
    '/tax': 'Enterprise Edition',
    '/loans': 'Enterprise Edition',
    '/uba-overdraft': 'Enterprise Edition',
    '/audit': 'Enterprise Edition',
    '/backup': 'Enterprise Edition',
}

export function normalizePlanName(value: unknown): PlanName | null {
    if (value === 'Growth' || value === 'Growth Edition') return 'Growth Edition'
    if (value === 'Professional' || value === 'Professional Edition') return 'Professional Edition'
    if (value === 'Enterprise' || value === 'Enterprise Edition') return 'Enterprise Edition'
    return null
}

export function planHasFeature(plan: unknown, feature: string): boolean {
    const normalizedPlan = normalizePlanName(plan)
    if (!normalizedPlan) return false
    const level = PLAN_LEVELS[normalizedPlan]
    return Object.entries(PLAN_FEATURES).some(([planName, features]) => PLAN_LEVELS[planName as PlanName] <= level && features.includes(feature))
}

export function planCanAccessRoute(plan: unknown, pathname: string, subscriptionStatus?: string): boolean {
    if (subscriptionStatus?.toLowerCase() === 'trial') return true
    const normalizedPlan = normalizePlanName(plan)
    if (!normalizedPlan) return false
    const minimumPlan = Object.entries(ROUTE_MINIMUM_PLANS).find(([route]) => pathname.startsWith(route))?.[1]
    if (!minimumPlan) return true
    return PLAN_LEVELS[normalizedPlan] >= PLAN_LEVELS[minimumPlan]
}

export function getPlanUserLimit(plan: unknown): number | null {
    if (planHasFeature(plan, 'unlimited-users')) return null
    if (planHasFeature(plan, 'five-users')) return 5
    if (normalizePlanName(plan) === 'Growth Edition') return 1
    return 0
}

export function seatLimitForSubscription(plan: unknown, subscriptionStatus?: string): number | null {
    const status = subscriptionStatus?.toLowerCase()
    if (status === 'trial') return getPlanUserLimit(TRIAL_PLAN)
    if (status === 'expired' || status === 'cancelled') return 0
    return getPlanUserLimit(plan)
}