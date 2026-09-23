function skuPrefix(productName: string): string {
    const words = productName
        .trim()
        .toUpperCase()
        .split(/[^A-Z0-9]+/)
        .filter(Boolean)

    if (words.length <= 1) {
        return (words[0] || 'PRD').slice(0, 3).padEnd(3, 'X')
    }

    return words.map((word) => word[0]).join('')
}

export function generateSku(productName: string, existingSkus: string[] = []): string {
    const prefix = skuPrefix(productName)
    const usedNumbers = existingSkus.reduce((numbers, sku) => {
        const match = String(sku).trim().toUpperCase().match(new RegExp(`^${prefix}-(\\d+)$`))
        if (match) numbers.push(Number(match[1]))
        return numbers
    }, [] as number[])
    const nextNumber = Math.max(0, ...usedNumbers) + 1

    return `${prefix}-${String(nextNumber).padStart(3, '0')}`
}
