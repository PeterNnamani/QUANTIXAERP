const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')
const schemaPath = path.join(repoRoot, 'migrations', 'initial_schema.sql')
const searchExtensions = ['.js', '.ts', '.mjs', '.tsx', '.jsx', '.md']

function readSchemaTables(schemaFile) {
    const sql = fs.readFileSync(schemaFile, 'utf8')
    const tableRegex = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z0-9_]+)/gi
    const tables = []
    let m
    while ((m = tableRegex.exec(sql)) !== null) {
        tables.push(m[1])
    }
    return tables
}

function walk(dir, filelist = []) {
    const files = fs.readdirSync(dir)
    files.forEach((file) => {
        const fp = path.join(dir, file)
        const stat = fs.statSync(fp)
        if (stat.isDirectory()) {
            if (['node_modules', '.git', 'migrations'].includes(file)) return
            walk(fp, filelist)
        } else if (searchExtensions.includes(path.extname(file))) {
            filelist.push(fp)
        }
    })
    return filelist
}

function findReferences(tables, files) {
    const results = {}
    const contentMap = files.reduce((acc, file) => {
        try {
            acc[file] = fs.readFileSync(file, 'utf8')
        } catch (e) {
            acc[file] = ''
        }
        return acc
    }, {})

    tables.forEach((table) => {
        const regex = new RegExp("\\b" + table + "\\b", 'i')
        results[table] = []
        for (const [file, content] of Object.entries(contentMap)) {
            if (regex.test(content)) results[table].push(path.relative(repoRoot, file))
        }
    })
    return results
}

function main() {
    if (!fs.existsSync(schemaPath)) {
        console.error('Schema file not found:', schemaPath)
        process.exit(1)
    }
    const tables = readSchemaTables(schemaPath)
    const files = walk(repoRoot)
    const refs = findReferences(tables, files)

    console.log('Schema tables found:', tables.length)
    let unmapped = []
    for (const [table, files] of Object.entries(refs)) {
        if (files.length === 0) unmapped.push(table)
    }

    console.log('Tables with no code references:', unmapped.length ? unmapped.join(', ') : '(none)')
    // Print a summary for first 20 tables
    for (const [table, files] of Object.entries(refs)) {
        console.log(`- ${table}: ${files.length} refs`)
    }
}

main()
