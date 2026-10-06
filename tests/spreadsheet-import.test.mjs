import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs'
import {prepareInventoryRows} from '../lib/inventory-workflows.ts'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const previous = require.extensions['.ts']
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText, filename)
const {parseSpreadsheetFile} = require('../lib/import-utils.ts')
require.extensions['.ts'] = previous
const XLSX = require('xlsx')
test('real CSV retains quoted names and decimal quantities and prices',async()=>{
 const file = new File(['SKU,Product Name,Stock Qty,Unit Cost\nA,"Rice, premium",12.75,"1,250.50"\nB,Oil,0,0\n'],'products.csv')
 const rows=await parseSpreadsheetFile(file);const result=prepareInventoryRows(rows)
 assert.equal(result.length,2);assert.equal(result[0].product,'Rice, premium');assert.equal(result[0].closing,12.75);assert.equal(result[0].unitCost,1250.5);assert.equal(result[1].closing,0)
})
test('real Excel workbook imports all sheets and over 1000 products',async()=>{
 const workbook=XLSX.utils.book_new()
 for(const sheet of ['Food','Drinks']) XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(Array.from({length:601},(_,i)=>({'Product Name':`${sheet} ${i}`,SKU:`${sheet}-${i}`,'Stock Qty':i+0.125,'Unit Cost':99.75}))),sheet)
 const file=new File([XLSX.write(workbook,{type:'buffer',bookType:'xlsx'})],'products.xlsx')
 const result=prepareInventoryRows(await parseSpreadsheetFile(file))
 assert.equal(result.length,1202);assert.equal(result.at(-1).closing,600.125);assert.equal(result[0].dept,'Food');assert.equal(result.at(-1).dept,'Drinks')
})

test('Excel date cells become ISO expiry dates',async()=>{
 const workbook=XLSX.utils.book_new()
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet([{'Product Name':'Rice',SKU:'R','Expiry Date':new Date(2027, 0, 31)}]),'Food')
 const file=new File([XLSX.write(workbook,{type:'buffer',bookType:'xlsx'})],'dates.xlsx')
 assert.equal(prepareInventoryRows(await parseSpreadsheetFile(file))[0].expiryDate,'2027-01-31')
})

test('empty worksheet rows do not block decimal inventory import',async()=>{
 const workbook=XLSX.utils.book_new()
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet([
  {'Product Name':'Oil',SKU:'O-1','Stock Qty':12.75,'Unit Cost':99.5,'Selling Price':120.25},
  {'Product Name':'','SKU':'','Stock Qty':'','Unit Cost':''},
 ]),'Food')
 const file=new File([XLSX.write(workbook,{type:'buffer',bookType:'xlsx'})],'empty-rows.xlsx')
 const result=prepareInventoryRows(await parseSpreadsheetFile(file))
 assert.equal(result.length,1)
 assert.equal(result[0].closing,12.75)
 assert.equal(result[0].unitCost,99.5)
 assert.equal(result[0].sellingPrice,120.25)
})
test('CSV preserves leading-zero SKUs and literal dates',async()=>{
 const file=new File(['SKU,Product Name,Expiry Date,Stock Qty\n001,Rice,2027-01-31,1.5\n'],'dates.csv')
 const [item]=prepareInventoryRows(await parseSpreadsheetFile(file))
 assert.equal(item.sku,'001');assert.equal(item.expiryDate,'2027-01-31');assert.equal(item.closing,1.5)
})
