import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx'
import type { ManagementAccounts } from '@/lib/management-accounts'

let activeCompanyName: string | null = null

export function setExportCompanyName(companyName: string | undefined): void {
    const normalizedName = companyName?.trim()
    activeCompanyName = normalizedName || null
}

export function downloadExcel(filename: string, data: unknown): void {
    const workbook = XLSX.utils.book_new()
    const rows = Array.isArray(data) ? data : [data]
    const worksheet = XLSX.utils.aoa_to_sheet([
        [activeCompanyName],
        [],
    ])
    XLSX.utils.sheet_add_json(worksheet, rows, { origin: 'A3' })
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
}

export function downloadPdf(filename: string, title: string, data: Array<Record<string, unknown>>, companyName?: string): void {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 40
    const contentWidth = pageWidth - margin * 2
    const sectionSpacing = 20
    const resolvedCompanyName = companyName?.trim() || activeCompanyName || 'Company'
    let y = margin

    const drawWatermark = () => {
        const watermarkText = resolvedCompanyName
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(72)
        doc.setTextColor(220, 220, 220)
        doc.text(watermarkText, pageWidth / 2, 420, {
            align: 'center',
            angle: 45,
        })
        doc.setTextColor(0, 0, 0)
    }

    const addPageHeader = () => {
        drawWatermark()
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(18)
        doc.text(resolvedCompanyName, pageWidth / 2, y, { align: 'center' })
        y += 24

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(12)
        doc.text(title, pageWidth / 2, y, { align: 'center' })
        y += 16

        const now = new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })
        doc.setFontSize(10)
        doc.text(`Generated on ${now}`, pageWidth / 2, y, { align: 'center' })
        y += sectionSpacing

        doc.setDrawColor(180, 180, 180)
        doc.setLineWidth(0.5)
        doc.line(margin, y - 10, pageWidth - margin, y - 10)
        y += 10
    }

    const renderTable = (items: Array<Record<string, unknown>>) => {
        if (items.length === 0) return

        const headers = Object.keys(items[0])
        const colWidth = contentWidth / headers.length
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)

        headers.forEach((header, index) => {
            const x = margin + index * colWidth
            doc.text(String(header).replace(/([A-Z])/g, ' $1').trim(), x + 4, y)
        })
        y += 18

        doc.setFont('helvetica', 'normal')
        items.forEach((row) => {
            if (y > doc.internal.pageSize.getHeight() - margin - 40) {
                doc.addPage()
                y = margin
                addPageHeader()
            }

            headers.forEach((header, index) => {
                const x = margin + index * colWidth
                const value = row[header]
                const text = value === null || value === undefined ? '' : String(value)
                doc.text(text, x + 4, y, { maxWidth: colWidth - 8 })
            })
            y += 16
        })
    }

    addPageHeader()
    renderTable(data)

    doc.save(filename)
}

export type FinancialReportSection = {
    title: string
    columns: string[]
    rows: Array<Array<string | number>>
    total?: Array<string | number>
}

export type FinancialReportOptions = {
    filename: string
    reportTitle: string
    periodLabel: string
    sections: FinancialReportSection[]
    highlights: Array<{ label: string; value: string }>
    notes?: string[]
    companyName?: string
}

export function managementAccountsToExportSections(report: ManagementAccounts, includeTrialBalance = true): FinancialReportSection[] {
    const values = (row: { values: number[]; total: number; kind?: string }, columnCount: number) => row.kind === 'section' ? Array(columnCount + 1).fill('') : [...Array.from({ length: columnCount }, (_, index) => row.values[index] ?? 0), row.total]
    const statementRows = report.sfp.rows.map((row) => [row.label, row.kind === 'section' ? '' : row.total] as Array<string | number>)
    const pnlRowsForExport = report.pnl.rows.filter((row) => row.label !== 'Drawings')
    const alwaysKeepPnlRows = new Set(['Operations Cost', 'Bank Charges'])
    const expenseStart = pnlRowsForExport.findIndex((row) => row.kind === 'expense')
    const pnlRows = pnlRowsForExport.flatMap((row, index) => {
        const rows: Array<Array<string | number>> = []
        if (index === expenseStart) rows.push(['EXPENSES', ...Array(report.periods.length + 1).fill('')])
        if (row.kind === 'expense' && row.total === 0 && !alwaysKeepPnlRows.has(row.label)) return rows
        rows.push([row.label, ...values(row, report.periods.length)])
        return rows
    })
    const ppeRows = report.ppe.rows.map((row) => [row.label, ...values(row, report.ppe.classes.length)] as Array<string | number>)
    const debitLabels = new Set(['Property, Plant & Equipment', 'Cash and Bank Balance', 'Inventory', 'Prepayments', 'Receivables', 'Retained Earnings', 'Drawings'])
    const trialBalanceRows = report.sfp.rows
        .filter((row) => !row.label.toUpperCase().includes('TOTAL'))
        .map((row) => {
            const amount = Math.abs(row.total)
            return [row.label, debitLabels.has(row.label) ? amount : 0, debitLabels.has(row.label) ? 0 : amount] as Array<string | number>
        })
    const debit = trialBalanceRows.reduce((total, row) => total + Number(row[1] || 0), 0)
    const credit = trialBalanceRows.reduce((total, row) => total + Number(row[2] || 0), 0)
    const sections: FinancialReportSection[] = [
        { title: 'Statement of Profit or Loss', columns: ['Description', ...report.periods.map((period) => period.label), 'Total'], rows: pnlRows },
        { title: 'Statement of Financial Position', columns: ['Description', 'Amount'], rows: statementRows },
        { title: 'Property, Plant & Equipment', columns: ['Description', ...report.ppe.classes, 'Total'], rows: ppeRows },
    ]
    if (includeTrialBalance) sections.push({ title: 'Trial Balance', columns: ['ITEM', 'DEBIT (₦)', 'CREDIT (₦)'], rows: trialBalanceRows, total: ['TOTAL', debit, credit] })
    return sections
}

export const formatFinancialReportValue = (value: string | number, column?: string): string => {
    if (typeof value === 'string') return value
    if (column === 'Count') return value.toLocaleString('en-NG')
    const absoluteValue = Math.abs(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return value < 0 ? `(₦${absoluteValue})` : `₦${absoluteValue}`
}

export async function downloadFinancialReportPdf(options: FinancialReportOptions): Promise<void> {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 44
    const companyName = options.companyName?.trim() || activeCompanyName || 'Company'
    let pageNumber = 0

    const footer = () => {
        doc.setDrawColor(210, 220, 238)
        doc.setLineWidth(0.5)
        doc.line(margin, pageHeight - 38, pageWidth - margin, pageHeight - 38)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(79, 101, 137)
        doc.text(`${companyName} | Confidential management accounts`, margin, pageHeight - 22)
        doc.text(`Page ${pageNumber}`, pageWidth - margin, pageHeight - 22, { align: 'right' })
        doc.setTextColor(30, 35, 32)
    }

    const newPage = (heading?: string) => {
        doc.addPage()
        pageNumber += 1
        doc.setFillColor(26, 58, 124)
        doc.rect(0, 0, pageWidth, 7, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(26, 58, 124)
        doc.text(companyName.toUpperCase(), margin, 30)
        doc.setTextColor(30, 35, 32)
        if (heading) {
            doc.setFontSize(17)
            doc.text(heading, margin, 68)
        }
        footer()
        return heading ? 94 : 48
    }

    const drawTable = (section: FinancialReportSection, startY: number) => {
        const usableWidth = pageWidth - margin * 2
        const labelWidth = usableWidth * 0.52
        const valueWidth = (usableWidth - labelWidth) / Math.max(1, section.columns.length - 1)
        let y = startY
        doc.setFillColor(26, 58, 124)
        doc.rect(margin, y - 14, usableWidth, 25, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(255, 255, 255)
        section.columns.forEach((column, index) => {
            const x = index === 0 ? margin + 8 : margin + labelWidth + (index - 1) * valueWidth + valueWidth - 8
            doc.text(column, x, y + 2, { align: index === 0 ? 'left' : 'right' })
        })
        y += 30
        doc.setTextColor(30, 35, 32)
        doc.setFont('helvetica', 'normal')
        section.rows.forEach((row) => {
            if (y > pageHeight - 70) {
                y = newPage(section.title)
                doc.setFont('helvetica', 'normal')
                doc.setFontSize(9)
            }
            const isExpenseHeading = row[0] === 'EXPENSES'
            if (isExpenseHeading) {
                y += 8
                doc.setFillColor(26, 58, 124)
                doc.rect(margin, y - 14, usableWidth, 25, 'F')
                doc.setTextColor(255, 255, 255)
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(10)
            }
            row.forEach((value, index) => {
                const x = index === 0 ? margin + 8 : margin + labelWidth + (index - 1) * valueWidth + valueWidth - 8
                const text = formatFinancialReportValue(value, section.columns[index])
                doc.text(text, x, y, { align: index === 0 ? 'left' : 'right', maxWidth: index === 0 ? labelWidth - 16 : valueWidth - 12 })
            })
            doc.setTextColor(30, 35, 32)
            doc.setDrawColor(220, 226, 238)
            doc.line(margin, y + 7, pageWidth - margin, y + 7)
            y += 21
            if (isExpenseHeading) y += 5
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(9)
        })
        if (section.total) {
            doc.setFillColor(26, 58, 124)
            doc.rect(margin, y - 7, usableWidth, 25, 'F')
            doc.setTextColor(255, 255, 255)
            doc.setFont('helvetica', 'bold')
            section.total.forEach((value, index) => {
                const x = index === 0 ? margin + 8 : margin + labelWidth + (index - 1) * valueWidth + valueWidth - 8
                const text = formatFinancialReportValue(value, section.columns[index])
                doc.text(text, x, y + 9, { align: index === 0 ? 'left' : 'right' })
            })
            doc.setTextColor(30, 35, 32)
            y += 35
        }
        return y
    }

    doc.setFillColor(247, 249, 255)
    doc.rect(0, 0, pageWidth, pageHeight, 'F')
    doc.setFillColor(26, 58, 124)
    doc.rect(0, 0, pageWidth, 14, 'F')
    doc.setDrawColor(26, 58, 124)
    doc.setLineWidth(5)
    doc.circle(pageWidth / 2, 232, 52)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.setTextColor(26, 58, 124)
    doc.text(companyName.slice(0, 3).toUpperCase(), pageWidth / 2, 240, { align: 'center' })
    doc.setTextColor(26, 58, 124)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(30)
    doc.text(companyName, pageWidth / 2, 330, { align: 'center' })
    doc.setTextColor(30, 35, 32)
    doc.setFontSize(22)
    doc.text(options.reportTitle, pageWidth / 2, 380, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(12)
    doc.setTextColor(79, 101, 137)
    doc.text('Management Accounts', pageWidth / 2, 408, { align: 'center' })
    doc.text(options.periodLabel, pageWidth / 2, 445, { align: 'center' })
    doc.setFontSize(9)
    doc.text(`Prepared on ${new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}`, pageWidth / 2, 490, { align: 'center' })
    pageNumber = 1
    footer()

    let y = newPage('Contents')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    options.sections.forEach((section, index) => {
        doc.text(`${String(index + 1).padStart(2, '0')}   ${section.title}`, margin + 8, y)
        y += 28
    })
    y = newPage('Executive Summary')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text('Key results for the reporting period', margin, y)
    y += 28
    options.highlights.forEach((highlight) => {
        doc.setFillColor(247, 249, 255)
        doc.setDrawColor(210, 220, 238)
        doc.roundedRect(margin, y - 16, pageWidth - margin * 2, 32, 3, 3, 'FD')
        doc.setFont('helvetica', 'normal')
        doc.text(highlight.label, margin + 12, y + 4)
        doc.setFont('helvetica', 'bold')
        doc.text(highlight.value, pageWidth - margin - 12, y + 4, { align: 'right' })
        y += 43
    })
    for (const section of options.sections) {
        y = newPage(section.title)
        y = drawTable(section, y)
    }
    doc.save(options.filename)
}
