'use client'

import { formatFinancialReportValue, type FinancialReportSection } from '@/lib/export-utils'

export default function FinancialReportSections({ sections }: { sections: FinancialReportSection[] }) {
    return (
        <div className="report-grid two-col">
            {sections.map((section) => (
                <div className="report-card" key={section.title}>
                    <div className="card-hd">
                        <div className="card-title">{section.title}</div>
                    </div>
                    <div className="management-table-wrap">
                        <table className="management-table">
                            <thead>
                                <tr>
                                    {section.columns.map((column) => <th key={column} className={column === section.columns[0] ? '' : 'amount'}>{column}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {section.rows.map((row, rowIndex) => {
                                    const isSection = row[0] === 'EXPENSES'
                                    return (
                                        <tr key={`${section.title}-${String(row[0])}-${rowIndex}`} className={isSection ? 'report-section-row' : ''}>
                                            {section.columns.map((column, columnIndex) => (
                                                <td key={`${column}-${columnIndex}`} className={columnIndex === 0 ? '' : 'amount'}>
                                                    {isSection && columnIndex === 0 ? 'EXPENSES' : isSection ? '' : formatFinancialReportValue(row[columnIndex] ?? '', column)}
                                                </td>
                                            ))}
                                        </tr>
                                    )
                                })}
                                {section.total && (
                                    <tr className="emphasis">
                                        {section.total.map((value, index) => <td key={`total-${index}`} className={index === 0 ? '' : 'amount'}>{formatFinancialReportValue(value, section.columns[index] || '')}</td>)}
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}
        </div>
    )
}
