export const DEPRECIATION_METHODS = {
    STRAIGHT_LINE: 'STRAIGHT_LINE',
    REDUCING_BALANCE: 'REDUCING_BALANCE',
    UNITS_OF_PRODUCTION: 'UNITS_OF_PRODUCTION',
}

export function calculateStraightLineDepreciation(cost, residualValue, usefulLifeYears) {
    if (!usefulLifeYears || usefulLifeYears <= 0) return 0
    return Number(((cost - residualValue) / usefulLifeYears).toFixed(2))
}

export function calculateReducingBalanceDepreciation(openingNbv, ratePercent) {
    if (!ratePercent || ratePercent <= 0) return 0
    return Number((openingNbv * (ratePercent / 100)).toFixed(2))
}

export function calculateUnitsOfProductionDepreciation(cost, residualValue, totalEstimatedUnits, unitsProduced) {
    if (!totalEstimatedUnits || totalEstimatedUnits <= 0) return 0
    const perUnit = (cost - residualValue) / totalEstimatedUnits
    return Number((perUnit * unitsProduced).toFixed(2))
}

export function prorateDepreciation(amount, daysHeld, daysInPeriod) {
    if (!daysInPeriod || daysInPeriod <= 0) return 0
    return Number((amount * (daysHeld / daysInPeriod)).toFixed(2))
}

export function buildFixedAsset(data) {
    return {
        id: data.id || `AST-${Date.now()}`,
        assetTag: data.assetTag || null,
        name: data.name || 'Unnamed Asset',
        category: data.category || 'General',
        acquisitionDate: data.acquisitionDate || new Date().toISOString().slice(0, 10),
        cost: data.cost || 0,
        residualValue: data.residualValue || 0,
        usefulLifeYears: data.usefulLifeYears || 0,
        depreciationMethod: data.depreciationMethod || DEPRECIATION_METHODS.STRAIGHT_LINE,
        depreciationRate: data.depreciationRate || 0,
        totalEstimatedUnits: data.totalEstimatedUnits || 0,
        assetAccountId: data.assetAccountId || null,
        accumDepreciationAccountId: data.accumDepreciationAccountId || null,
        depreciationExpenseAccountId: data.depreciationExpenseAccountId || null,
        status: data.status || 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    }
}
