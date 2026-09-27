import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase.server'
import {
    buildCostOfSalesReport,
    isCountableSale,
    type CosCostSnapshot,
    type CosProduct,
    type CosSale,
    type CosSaleItem,
} from '@/lib/cost-of-sales'

const PAGE_SIZE = 1000
const ID_CHUNK = 150
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

type PageResult = { data: any[] | null; error: any }

async function fetchAllPages(fetchPage: (from: number, to: number) => PromiseLike<PageResult>): Promise<any[]> {
    const rows: any[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1)
        if (error) throw error
        rows.push(...(data || []))
        if (!data || data.length < PAGE_SIZE) return rows
    }
}

function chunk<T>(values: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size))
    return chunks
}

function isMissingTable(error: any): boolean {
    return error?.code === 'PGRST205' || error?.code === '42P01'
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message)
    return String(error || 'Unknown server error')
}

export async function GET(request: Request) {
    try {
        if (!supabaseAdmin) return NextResponse.json({ success: false, error: 'Supabase admin client is not configured' }, { status: 500 })
        const db = supabaseAdmin
        const url = new URL(request.url)
        const companyId = String(url.searchParams.get('companyId') || '').trim()
        const staffId = String(url.searchParams.get('staffId') || '').trim()
        const username = String(url.searchParams.get('username') || '').trim()
        const from = String(url.searchParams.get('from') || '').trim()
        const to = String(url.searchParams.get('to') || '').trim()

        if (!companyId || (!staffId && !username)) return NextResponse.json({ success: false, error: 'A valid account is required.' }, { status: 400 })
        if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) return NextResponse.json({ success: false, error: 'Choose a valid date range.' }, { status: 400 })

        let accountQuery = db.from('users').select('id,status').eq('company_id', companyId)
        accountQuery = staffId ? accountQuery.eq('staff_id', staffId) : accountQuery.eq('username', username)
        const { data: account, error: accountError } = await accountQuery.limit(1).maybeSingle()
        if (accountError) throw accountError
        if (!account || String(account.status || 'active').toLowerCase() === 'disabled') {
            return NextResponse.json({ success: false, error: 'This account cannot view cost of sales for the company.' }, { status: 403 })
        }

        const salesRows = await fetchAllPages((start, end) => db
            .from('sales')
            .select('*, contacts(name)')
            .eq('company_id', companyId)
            .gte('sale_date', from)
            .lte('sale_date', to)
            .order('sale_date', { ascending: false })
            .order('id', { ascending: true })
            .range(start, end))
        const sales: CosSale[] = salesRows.map((row) => ({
            id: row.id,
            reference: row.reference || row.id,
            date: String(row.sale_date || '').slice(0, 10),
            customer: row.contacts?.name || 'Walk-in Customer',
            branch: row.branch || '',
            salesRep: row.sales_rep || '',
            status: row.status || '',
            deletedAt: row.deleted_at || null,
        }))
        const saleIds = sales.filter(isCountableSale).map((sale) => sale.id)

        const itemRows: any[] = []
        const snapshotRows: any[] = []
        let snapshotsAvailable = true
        for (const ids of chunk(saleIds, ID_CHUNK)) {
            itemRows.push(...await fetchAllPages((start, end) => db
                .from('sale_items')
                .select('id,sale_id,product_id,product_name,department,qty,unit_price,total')
                .in('sale_id', ids)
                .order('id', { ascending: true })
                .range(start, end)))
            if (!snapshotsAvailable) continue
            try {
                snapshotRows.push(...await fetchAllPages((start, end) => db
                    .from('sale_item_costs')
                    .select('sale_id,product_key,product_id,sku,unit_cost,captured_via')
                    .in('sale_id', ids)
                    .order('id', { ascending: true })
                    .range(start, end)))
            } catch (error) {
                if (!isMissingTable(error)) throw error
                snapshotsAvailable = false
            }
        }

        const productRows = await fetchAllPages((start, end) => db
            .from('products')
            .select('id,name,sku,category,unit_cost,average_cost,deleted_at,updated_at')
            .eq('company_id', companyId)
            .order('id', { ascending: true })
            .range(start, end))

        const items: CosSaleItem[] = itemRows.map((row) => ({
            saleId: row.sale_id,
            productId: row.product_id || null,
            productName: row.product_name || '',
            department: row.department || '',
            qty: Number(row.qty || 0),
            unitPrice: Number(row.unit_price || 0),
            total: Number(row.total || 0),
        }))
        const products: CosProduct[] = productRows.map((row) => ({
            id: row.id,
            name: row.name || '',
            sku: row.sku || '',
            category: row.category || '',
            unitCost: Number(row.unit_cost || 0),
            averageCost: Number(row.average_cost || 0),
            deletedAt: row.deleted_at || null,
            updatedAt: row.updated_at || '',
        }))
        const snapshots: CosCostSnapshot[] = snapshotRows.map((row) => ({
            saleId: row.sale_id,
            productKey: row.product_key,
            productId: row.product_id || null,
            sku: row.sku || '',
            unitCost: Number(row.unit_cost || 0),
            capturedVia: row.captured_via === 'backfill' ? 'backfill' : row.captured_via === 'report' ? 'report' : 'sale',
        }))

        let report = buildCostOfSalesReport({ sales, items, products, snapshots })

        // Lines sold before their cost was captured are locked now, so later cost changes cannot rewrite them.
        if (snapshotsAvailable && report.pendingSnapshots.length > 0) {
            const rows = report.pendingSnapshots.map((pending) => ({
                company_id: companyId,
                sale_id: pending.saleId,
                product_key: pending.productKey,
                product_id: pending.productId,
                sku: pending.sku || null,
                unit_cost: pending.unitCost,
                cost_basis: pending.costBasis,
                captured_via: 'report',
            }))
            const locked: CosCostSnapshot[] = []
            for (const batch of chunk(rows, 500)) {
                const { error } = await db.from('sale_item_costs').upsert(batch, { onConflict: 'sale_id,product_key', ignoreDuplicates: true })
                if (error) {
                    console.error('Unable to lock cost of sales snapshots', error)
                    break
                }
                locked.push(...batch.map((row) => ({ saleId: row.sale_id, productKey: row.product_key, productId: row.product_id, sku: row.sku || '', unitCost: row.unit_cost, capturedVia: 'report' as const })))
            }
            if (locked.length > 0) report = buildCostOfSalesReport({ sales, items, products, snapshots: [...snapshots, ...locked] })
        }

        return NextResponse.json({
            success: true,
            range: { from, to },
            generatedAt: new Date().toISOString(),
            costTracking: snapshotsAvailable ? 'enabled' : 'not-installed',
            summary: report.summary,
            byProduct: report.byProduct,
            lines: report.lines,
        })
    } catch (error) {
        return NextResponse.json({ success: false, error: errorMessage(error) }, { status: 500 })
    }
}
