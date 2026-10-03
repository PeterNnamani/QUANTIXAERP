import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareInventoryRows, inventoryNumber, inventoryToRow, loadAllInventory, saveInventoryRows} from '../lib/inventory-workflows.ts'
import {saveOpeningBalances} from '../lib/opening-balances.ts'
import {saveBankSettings} from '../lib/bank-settings.ts'

const existing = {product:'Rice', sku:'R-1', dept:'Food', openQty:10, purchased:2, sold:1, closing:11, unitCost:123.45, sellingPrice:150.75}
test('inventory file preserves decimals, zero values and product name ahead of description', () => {
 const [item] = prepareInventoryRows([{'Product Name':'Rice', Description:'Bag',SKU:'R-1','Opening Stock':0,'Stock Qty':0,'Unit Cost':'₦1,234.50','Selling Price':0,Purchased:0,Sold:0}], [existing])
 assert.equal(item.product,'Rice'); assert.equal(item.closing,0);assert.equal(item.openQty,0);assert.equal(item.sellingPrice,0);assert.equal(item.unitCost,1234.5)
 const [fraction] = prepareInventoryRows([{'Product Name':'Oil','Opening Stock':12.75,'Purchased':1.5,'Sold':0.25}])
 assert.equal(fraction.closing,14);assert.equal(inventoryToRow(fraction,'company').opening_qty,12.75)
})
test('all 1201 input rows remain in the inventory import', () => {
 const rows = Array.from({length:1201},(_,i)=>({'Product Name':`Item ${i}`,SKU:`S-${i}`,'Stock Qty':i+0.5}))
 const result=prepareInventoryRows(rows);assert.equal(result.length,1201);assert.equal(result.at(-1).closing,1200.5)
})
test('distinct SKUs with the same product name remain distinct', () => {
 assert.equal(prepareInventoryRows([{SKU:'A',Product:'Rice'},{SKU:'B',Product:'Rice'}]).length,2)
 assert.throws(()=>prepareInventoryRows([{SKU:'A',Product:'Rice'},{SKU:'a',Product:'Oil'}]), /duplicate SKU/)
})
test('bad input is reported rather than dropped or converted to zero', () => {
 assert.throws(()=>prepareInventoryRows([{SKU:'A','Unit Cost':2}]), /Product Name/)
 for(const value of ['abc','12,5',-1,Infinity]) assert.throws(()=>inventoryNumber(value,'Quantity'))
 assert.throws(()=>prepareInventoryRows([{Product:'Rice','Expiry Date':'2026-02-31'}]), /expiry/)
})
test('SKU allocation avoids existing products and repeat import updates the same SKU', () => {
 const first=prepareInventoryRows([{Product:'Rice',Quantity:2.5}],[existing]);assert.equal(first[0].sku,'R-1')
 const second=prepareInventoryRows([{Product:'Rice',Quantity:0}],first);assert.equal(second[0].sku,'R-1');assert.equal(second[0].closing,0)
})
test('paginated loading handles server caps smaller than requested pages', async () => {
 const source=Array.from({length:1201},(_,id)=>({id}));const offsets=[]
 const query={select(){return this},eq(){return this},is(){return this},order(){return this},async range(start){offsets.push(start);return {data:source.slice(start,start+200),error:null}}}
 const result=await loadAllInventory({from:()=>query},'company')
 assert.equal(result.data.length,1201);assert.deepEqual(offsets,[0,200,400,600,800,1000,1200,1201])
})
test('pagination failure does not return a partial inventory as success',async()=>{
 let n=0;const query={select(){return this},eq(){return this},is(){return this},order(){return this},async range(){return ++n===1?{data:[{id:1}],error:null}:{data:null,error:{message:'offline'}}}}
 const result=await loadAllInventory({from:()=>query},'company');assert.equal(result.data,null);assert.equal(result.error.message,'offline')
})
test('bulk save uses one statement and surfaces database rejection',async()=>{
 let calls=0;const client={from:()=>({async upsert(rows,options){calls++;assert.equal(rows.length,2);assert.equal(options.onConflict,'company_id,sku');return {error:{message:'permission denied'}}}})}
 await assert.rejects(saveInventoryRows(client,'company',[existing,{...existing,sku:'B'}]),/permission denied/);assert.equal(calls,1)
})
function accountsClient(error=null) {
 const result={written:null};const query={select(){return this},async eq(){return {data:[],error:null}},async upsert(rows){result.written=rows;return {error}}}
 return {...result,query,client:{from:()=>query},getWritten:()=>result.written}
}
const account={id:'acct-cash',code:'1000',name:'Cash',accountType:'ASSET',normalBalance:'DEBIT',openingBalance:1234.56,openingBalanceDate:'2026-10-03'}
test('opening balances persist temporary accounts as UUIDs and preserve cents and zero',async()=>{
 const mock=accountsClient();const result=await saveOpeningBalances(mock.client,'company',[account,{...account,id:'acct-other',code:'1005',name:'Other',openingBalance:0}])
 assert.match(result.accounts[0].id,/^[0-9a-f-]{36}$/);assert.equal(result.ids['acct-cash'],result.accounts[0].id)
 assert.equal(mock.getWritten()[0].opening_balance,1234.56);assert.equal(mock.getWritten()[1].opening_balance,0)
})
test('opening save failures are surfaced; duplicate account codes never write',async()=>{
 const mock=accountsClient({message:'database unavailable'});await assert.rejects(saveOpeningBalances(mock.client,'company',[account]),/database unavailable/)
 const clean=accountsClient();await assert.rejects(saveOpeningBalances(clean.client,'company',[account,{...account,id:'other',name:'Other'}]),/Duplicate account code/);assert.equal(clean.getWritten(),null)
})
test('bank opening balances preserve cents and report rejected writes',async()=>{
 let row;const client={from:()=>({async upsert(value){row=value;return {error:{message:'write failed'}}}})}
 await assert.rejects(saveBankSettings(client,'company',{id:'id',name:'Cash',openingBalance:125.75,balance:125.75,status:'active'}),/write failed/)
 assert.equal(row.opening_balance,125.75)
})
