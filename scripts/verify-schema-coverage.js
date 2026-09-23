const fs = require('fs')
const path = require('path')

function readSchemaTables(schemaFile) {
    const sql = fs.readFileSync(schemaFile, 'utf8')
    const tableRegex = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z0-9_]+)/gi
    const tables = []
    let match
    while ((match = tableRegex.exec(sql)) !== null) {
        tables.push(match[1])
    }
    return tables
}

function readSchemaColumns(schemaFile) {
    const sql = fs.readFileSync(schemaFile, 'utf8')
    const columnsByTable = {}
    const tableRegex = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*;/gi
    let match
    while ((match = tableRegex.exec(sql)) !== null) {
        const tableName = match[1]
        const body = match[2]
        const columnRegex = /(^|\n)\s*([a-z0-9_]+)\s+/gi
        const columns = []
        let colMatch
        while ((colMatch = columnRegex.exec(body)) !== null) {
            const name = colMatch[2]
            if (!['create', 'alter', 'insert', 'update', 'delete', 'select', 'from', 'check', 'constraint', 'primary', 'foreign', 'unique', 'index'].includes(name)) {
                columns.push(name)
            }
        }
        columnsByTable[tableName] = Array.from(new Set(columns))
    }
    return columnsByTable
}

function walk(dir, filelist = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    entries.forEach((entry) => {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            if (['node_modules', '.git', '.next', 'migrations'].includes(entry.name)) return
            walk(fullPath, filelist)
        } else if (/\.(js|ts|mjs|tsx|jsx|md)$/.test(entry.name)) {
            filelist.push(fullPath)
        }
    })
    return filelist
}

function collectDbReferences(files) {
    const refs = []
    const patterns = [
        /from\(['"]([a-z0-9_]+)['"]\)/g,
        /\b(?:insert|update|delete|select)\s*\(\s*\{[^}]*?from\(['"]([a-z0-9_]+)['"]\)/g,
        /\b(?:from|into|update)\s+([a-z0-9_]+)/gi,
    ]

    files.forEach((file) => {
        const content = fs.readFileSync(file, 'utf8')
        patterns.forEach((pattern) => {
            let match
            while ((match = pattern.exec(content)) !== null) {
                refs.push({ file: path.relative(process.cwd(), file), table: match[1] })
            }
        })
    })

    return refs
}

function auditSchemaCoverage(repoRoot) {
    const schemaPath = path.join(repoRoot, 'migrations', 'initial_schema.sql')
    const tables = readSchemaTables(schemaPath)
    const columnsByTable = readSchemaColumns(schemaPath)
    const files = walk(repoRoot)
    const dbRefs = collectDbReferences(files)

    const tableSet = new Set(tables)
    const referencedTables = new Set(dbRefs.map((ref) => ref.table))
    const missingTables = tables.filter((table) => !referencedTables.has(table))

    const missingColumns = []
    const knownColumns = new Set(['id', 'created_at', 'updated_at'])
    tables.forEach((table) => {
        const tableColumns = columnsByTable[table] || []
        const expected = ['id', 'created_at', 'updated_at']
        if (table === 'sales') expected.push('sale_date', 'customer_id', 'total_amount', 'payment_status', 'status')
        if (table === 'purchases') expected.push('purchase_date', 'supplier_id', 'total', 'payment_status', 'status')
        if (table === 'expenses') expected.push('expense_date', 'description', 'amount', 'bank_account_id')
        if (table === 'products') expected.push('sku', 'name', 'description', 'stock_qty', 'unit_cost', 'unit_price', 'branch')
        if (table === 'contacts') expected.push('type', 'name', 'credit_limit', 'opening_balance', 'status')
        if (table === 'bank_accounts') expected.push('name', 'balance', 'institution')
        if (table === 'bank_transactions') expected.push('bank_account_id', 'txn_date', 'description', 'amount', 'is_reconciled')
        if (table === 'prepayments') expected.push('reference', 'prepayment_type', 'supplier', 'original_amount', 'used_amount', 'remaining_amount', 'start_date', 'end_date', 'payment_method', 'bank_account', 'reference_no', 'recorded_by', 'recognition_status', 'recognition_progress', 'status', 'notes')
        if (table === 'prepayment_schedules') expected.push('prepayment_id', 'period', 'amount', 'recognized', 'recognition_date')
        if (table === 'users') expected.push('staff_id', 'username', 'pin', 'role', 'full_name', 'status')
        if (table === 'chart_of_accounts') expected.push('code', 'name', 'account_type', 'normal_balance')
        if (table === 'journal_entries') expected.push('entry_date', 'reference', 'description', 'source_module', 'status')
        if (table === 'journal_lines') expected.push('entry_id', 'account_id', 'debit', 'credit')

        expected.forEach((column) => {
            if (!tableColumns.includes(column) && !knownColumns.has(column)) {
                missingColumns.push({ table, column })
            }
        })
    })

    return {
        tables,
        missingTables,
        missingColumns,
        dbReferences: dbRefs,
    }
}

module.exports = { auditSchemaCoverage }

if (require.main === module) {
    const repoRoot = process.cwd()
    const report = auditSchemaCoverage(repoRoot)
    console.log(JSON.stringify(report, null, 2))
}
