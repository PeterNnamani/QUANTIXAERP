#!/usr/bin/env node
// Applies SQL files in migrations/ directly to the Supabase Postgres database.
//
//   npm run db:status                 list applied / pending migrations
//   npm run db:migrate                apply every pending migration
//   npm run db:migrate -- --dry-run   show what would be applied
//   npm run db:baseline -- --through 029
//                                     record migrations up to 029 as applied
//                                     without running them (for a database
//                                     that was migrated by hand)
//   npm run db:new -- add_invoice_notes
//                                     create the next numbered migration file
//
// Connection string comes from SUPABASE_DB_URL (or DATABASE_URL), read from the
// environment, .env.local or .env.

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(repoRoot, 'migrations')
const INITIAL = 'initial_schema.sql'
const TRACKING_SCHEMA = 'app_migrations'
const TRACKING_TABLE = `${TRACKING_SCHEMA}.applied`
const LOCK_KEY = 727_001

for (const file of ['.env.local', '.env']) {
    const envPath = path.join(repoRoot, file)
    if (existsSync(envPath)) process.loadEnvFile(envPath)
}

function fail(message) {
    console.error(`\n${message}\n`)
    process.exit(1)
}

function parseArgs(argv) {
    const [command = 'status', ...rest] = argv
    const flags = { positional: [] }
    for (let i = 0; i < rest.length; i++) {
        const arg = rest[i]
        if (arg === '--dry-run') flags.dryRun = true
        else if (arg === '--through') flags.through = rest[++i]
        else if (arg.startsWith('--through=')) flags.through = arg.slice('--through='.length)
        else flags.positional.push(arg)
    }
    return { command, flags }
}

function migrationOrder(name) {
    if (name === INITIAL) return -1
    const match = /^(\d+)_/.exec(name)
    return match ? Number(match[1]) : Number.POSITIVE_INFINITY
}

function listMigrations() {
    return readdirSync(migrationsDir)
        .filter((name) => name.endsWith('.sql'))
        .sort((a, b) => migrationOrder(a) - migrationOrder(b) || a.localeCompare(b))
        .map((name) => {
            const sql = readFileSync(path.join(migrationsDir, name), 'utf8')
            return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') }
        })
}

function connectionConfig() {
    const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
    if (!connectionString) {
        fail(
            'SUPABASE_DB_URL is not set.\n' +
                'Copy the connection string from Supabase Dashboard > Connect > Direct connection\n' +
                '(or Session pooler if your network has no IPv6) and add it to .env.local:\n\n' +
                '  SUPABASE_DB_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres',
        )
    }
    const url = new URL(connectionString)
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    if (url.port === '6543') {
        console.warn('Warning: port 6543 is the transaction pooler; use the direct connection or session pooler (5432) for migrations.')
    }
    // Supabase serves a certificate signed by its own CA, which is not in Node's default trust store.
    return {
        connectionString: connectionString.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, ''),
        ssl: isLocal || process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
        application_name: 'quantixa-migrate',
    }
}

async function ensureTrackingTable(client) {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${TRACKING_SCHEMA}`)
    await client.query(`
        CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
            name text PRIMARY KEY,
            checksum text NOT NULL,
            applied_at timestamptz NOT NULL DEFAULT now(),
            baselined boolean NOT NULL DEFAULT false
        )
    `)
}

async function loadApplied(client) {
    const { rows } = await client.query(`SELECT name, checksum, applied_at, baselined FROM ${TRACKING_TABLE}`)
    return new Map(rows.map((row) => [row.name, row]))
}

function describeTarget(config) {
    const url = new URL(config.connectionString)
    return `${url.username}@${url.hostname}:${url.port || 5432}${url.pathname}`
}

function printStatus(migrations, applied) {
    let pending = 0
    for (const migration of migrations) {
        const row = applied.get(migration.name)
        if (!row) {
            pending++
            console.log(`  [pending]   ${migration.name}`)
            continue
        }
        const tag = row.baselined ? 'baselined' : 'applied'
        const drift = row.checksum !== migration.checksum ? '  (file changed since it was applied)' : ''
        console.log(`  [${tag}]${' '.repeat(10 - tag.length)}${migration.name}${drift}`)
    }
    for (const name of applied.keys()) {
        if (!migrations.some((m) => m.name === name)) console.log(`  [missing]   ${name}  (recorded in database, file not found)`)
    }
    console.log(`\n${pending} pending migration(s).`)
    return pending
}

async function applyPending(client, migrations, applied, { dryRun }) {
    const pending = migrations.filter((m) => !applied.has(m.name))
    if (pending.length === 0) {
        console.log('Database is up to date.')
        return
    }
    if (dryRun) {
        console.log('Would apply:')
        for (const m of pending) console.log(`  ${m.name}`)
        return
    }
    for (const migration of pending) {
        process.stdout.write(`Applying ${migration.name} ... `)
        try {
            await client.query('BEGIN')
            await client.query(migration.sql)
            await client.query(`INSERT INTO ${TRACKING_TABLE} (name, checksum) VALUES ($1, $2)`, [
                migration.name,
                migration.checksum,
            ])
            await client.query('COMMIT')
            console.log('done')
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {})
            console.log('FAILED')
            const position = error.position ? ` (at character ${error.position})` : ''
            fail(`${migration.name} was rolled back: ${error.message}${position}\nNo later migrations were applied.`)
        }
    }
    console.log(`\nApplied ${pending.length} migration(s).`)
}

async function baseline(client, migrations, applied, { through }) {
    if (!through) fail('Pass --through <number> (e.g. --through 029) to choose the last migration already in the database.')
    const limit = Number(through)
    if (!Number.isFinite(limit)) fail(`--through must be a migration number, got "${through}".`)
    const targets = migrations.filter((m) => migrationOrder(m.name) <= limit && !applied.has(m.name))
    for (const m of targets) {
        await client.query(
            `INSERT INTO ${TRACKING_TABLE} (name, checksum, baselined) VALUES ($1, $2, true) ON CONFLICT (name) DO NOTHING`,
            [m.name, m.checksum],
        )
        console.log(`  baselined ${m.name}`)
    }
    console.log(`\nRecorded ${targets.length} migration(s) as already applied.`)
}

function createMigration(migrations, positional) {
    const slug = positional.join('_').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    if (!slug) fail('Usage: npm run db:new -- <description>')
    const last = Math.max(0, ...migrations.map((m) => migrationOrder(m.name)).filter(Number.isFinite))
    const name = `${String(last + 1).padStart(3, '0')}_${slug}.sql`
    writeFileSync(path.join(migrationsDir, name), `-- ${slug.replace(/_/g, ' ')}\n\n`)
    console.log(`Created migrations/${name}`)
}

async function main() {
    const { command, flags } = parseArgs(process.argv.slice(2))
    const migrations = listMigrations()

    if (command === 'new') return createMigration(migrations, flags.positional)
    if (!['status', 'up', 'baseline'].includes(command)) fail(`Unknown command "${command}". Use status, up, baseline or new.`)

    const config = connectionConfig()
    const client = new pg.Client(config)
    console.log(`Connecting to ${describeTarget(config)} ...`)
    try {
        await client.connect()
    } catch (error) {
        const hint =
            error.code === 'ENETUNREACH' || error.code === 'ENOTFOUND'
                ? '\nThe direct connection host is IPv6-only. If this network has no IPv6, use the Session pooler string from Supabase Dashboard > Connect.'
                : ''
        fail(`Could not connect: ${error.message}${hint}`)
    }

    try {
        await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY])
        await ensureTrackingTable(client)
        const applied = await loadApplied(client)

        if (command === 'status') printStatus(migrations, applied)
        else if (command === 'up') await applyPending(client, migrations, applied, flags)
        else if (command === 'baseline') await baseline(client, migrations, applied, flags)
    } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {})
        await client.end()
    }
}

main().catch((error) => fail(error.stack || error.message))
