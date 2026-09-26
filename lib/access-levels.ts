export type AccessLevel = 'view' | 'edit'
export type AccessLevels = Record<string, AccessLevel | undefined>

export function explicitAccessLevels(accessLevels: AccessLevels | null | undefined): AccessLevels | null {
    if (!accessLevels || typeof accessLevels !== 'object' || Array.isArray(accessLevels)) return null

    const explicit: AccessLevels = {}
    Object.entries(accessLevels).forEach(([key, level]) => {
        if (level === 'view' || level === 'edit') explicit[key] = level
    })
    return Object.keys(explicit).length > 0 ? explicit : null
}

export function menuAccessFromLevels(accessLevels: AccessLevels) {
    const visibleMenus = Object.keys(accessLevels)
    return {
        accessLevels,
        visibleMenus,
        permissions: visibleMenus.filter((key) => accessLevels[key] === 'edit'),
    }
}
