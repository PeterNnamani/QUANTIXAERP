export type ReportRange = 'Daily' | 'Weekly' | 'Monthly'
export type ReportMode = 'summary' | 'board' | 'tax'

export type DatedPeriod = { label: string; startDate: string; endDate: string }

export type ReportSection = {
    title: string
    columns: string[]
    rows: Array<Array<string | number>>
    total?: Array<string | number>
}

const STATEMENT_TITLES: Record<string, string> = {
    'Profit & Loss': 'Statement of Profit or Loss',
    'Financial Position': 'Statement of Financial Position',
    'Property, Plant & Equipment': 'Property, Plant & Equipment',
}

function utcDate(iso: string): Date {
    return new Date(`${iso.slice(0, 10)}T00:00:00Z`)
}

function formatUtc(date: Date): string {
    return date.toISOString().slice(0, 10)
}

export function monthPeriod(month: string): DatedPeriod {
    const [year, mon] = month.split('-').map(Number)
    const end = new Date(Date.UTC(year, mon, 0))
    return { label: month, startDate: `${month}-01`, endDate: formatUtc(end) }
}

export function reportPeriod(range: ReportRange, anchor: string): DatedPeriod {
    const day = anchor.slice(0, 10)
    if (range === 'Daily') return { label: day, startDate: day, endDate: day }
    if (range === 'Weekly') {
        const date = utcDate(day)
        const weekday = date.getUTCDay()
        const mondayOffset = weekday === 0 ? -6 : 1 - weekday
        const start = new Date(date)
        start.setUTCDate(date.getUTCDate() + mondayOffset)
        const end = new Date(start)
        end.setUTCDate(start.getUTCDate() + 6)
        const startDate = formatUtc(start)
        const endDate = formatUtc(end)
        return { label: `${startDate} to ${endDate}`, startDate, endDate }
    }
    return monthPeriod(day.slice(0, 7))
}

export function previousPeriod(period: DatedPeriod): DatedPeriod {
    if (period.startDate.endsWith('-01') && monthPeriod(period.startDate.slice(0, 7)).endDate === period.endDate) {
        const [year, mon] = period.startDate.split('-').map(Number)
        const previous = new Date(Date.UTC(year, mon - 2, 1))
        return monthPeriod(formatUtc(previous).slice(0, 7))
    }
    const start = utcDate(period.startDate)
    const end = utcDate(period.endDate)
    const length = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
    const prevEnd = new Date(start)
    prevEnd.setUTCDate(start.getUTCDate() - 1)
    const prevStart = new Date(prevEnd)
    prevStart.setUTCDate(prevEnd.getUTCDate() - (length - 1))
    const startDate = formatUtc(prevStart)
    const endDate = formatUtc(prevEnd)
    return { label: startDate === endDate ? startDate : `${startDate} to ${endDate}`, startDate, endDate }
}

export function yearPeriod(year: number): DatedPeriod {
    const label = String(year)
    return { label, startDate: `${label}-01-01`, endDate: `${label}-12-31` }
}

export function nextReportRun(kind: 'monthly' | 'annual', from = new Date()): string {
    if (kind === 'annual') return `${from.getUTCFullYear() + 1}-01-01`
    return formatUtc(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1)))
}

const vatOn = (amount: number, rate: number) => amount * rate
const incomeTaxOn = (profit: number, rate = 0.2) => Math.max(0, profit) * rate
const educationTaxOn = (profit: number, rate = 0.03) => Math.max(0, profit) * rate

export function outputVat(amount: number, rate = 0.075, taxInclusive = true): number {
    const base = Math.max(0, amount)
    if (taxInclusive) return vatOn(base / (1 + rate), rate)
    return vatOn(base, rate)
}

export function appendVatSection(sections: ReportSection[], revenues: number[], periodLabels: string[], rate = 0.075, taxInclusive = true): ReportSection[] {
    const values = revenues.map((amount) => outputVat(amount, rate, taxInclusive))
    const total = values.reduce((sum, value) => sum + value, 0)
    return [...sections, {
        title: 'Value Added Tax',
        columns: ['Description', ...periodLabels, 'Total'],
        rows: [[taxInclusive ? 'Output VAT included in revenue' : 'Output VAT on revenue', ...values, total]],
    }]
}

export function taxPackageSection(revenue: number, profit: number, rate = 0.075, taxInclusive = true): ReportSection {
    const vat = outputVat(revenue, rate, taxInclusive)
    const taxableProfit = Math.max(0, profit)
    const cit = incomeTaxOn(taxableProfit)
    const education = educationTaxOn(taxableProfit)
    return {
        title: 'Tax Package',
        columns: ['Description', 'Amount'],
        rows: [
            ['Output VAT', vat],
            ['Company income tax', cit],
            ['Education tax', education],
            ['Estimated tax', vat + cit + education],
        ],
    }
}

export function selectAnnualSections(sections: ReportSection[], mode: ReportMode, statement: string): ReportSection[] {
    if (mode === 'board') return sections.filter((section) => section.title === 'Statement of Profit or Loss' || section.title === 'Statement of Financial Position')
    if (mode === 'tax') return sections.filter((section) => section.title === 'Statement of Profit or Loss')
    if (statement === 'All statements') return sections
    const title = STATEMENT_TITLES[statement]
    return title ? sections.filter((section) => section.title === title) : sections
}

export function sectionsToExcelRows(sections: ReportSection[]): Array<Record<string, string | number>> {
    return sections.flatMap((section) => section.rows.map((row) => {
        const record: Record<string, string | number> = { Section: section.title }
        section.columns.forEach((column, index) => { record[column] = row[index] ?? '' })
        return record
    }))
}
