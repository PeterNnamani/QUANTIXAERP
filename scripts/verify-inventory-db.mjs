import {PGlite} from '@electric-sql/pglite'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const db=new PGlite()
const dir=path.join(root,'migrations')
const files=['initial_schema.sql',...fs.readdirSync(dir).filter(f=>/^\d.*\.sql$/.test(f)).sort()]
for(const file of files){try{await db.exec(fs.readFileSync(path.join(dir,file),'utf8'));console.log('Applied',file)}catch(e){console.error('FAILED',file,e.message);process.exit(1)}}
const companyA='11111111-1111-4111-8111-111111111111',companyB='22222222-2222-4222-8222-222222222222'
await db.query('INSERT INTO companies(id,name) VALUES($1,\'A\'),($2,\'B\')',[companyA,companyB])
await db.query("INSERT INTO products(company_id,sku,name,stock_qty,opening_qty,unit_cost) VALUES($1,'RICE','Rice',10.75,10.75,123.45),($2,'RICE','Rice',7.25,7.25,123.45)",[companyA,companyB])
const action=async(type,qty,reason='Test',location=null)=> (await db.query('SELECT apply_inventory_action($1,$2,$3,$4,$5,$6) AS item',[companyA,'RICE',type,qty,reason,location])).rows[0].item
assert.equal(Number((await action('receive',1.25)).stock_qty),12)
assert.equal(Number((await action('decrease',0.5)).stock_qty),11.5)
await assert.rejects(action('decrease',100),/exceeds/)
assert.equal(Number((await action('count',0)).stock_qty),0)
const counted=await action('count',4.75);assert.equal(Number(counted.last_count_variance),4.75)
const relocated=await action('relocate',0,'Move','Store Front');assert.equal(Number(relocated.stock_qty),4.75);assert.equal(relocated.branch,'Store Front')
assert.equal(Number((await db.query("SELECT stock_qty FROM products WHERE company_id=$1",[companyB])).rows[0].stock_qty),7.25)
await assert.rejects(action('increase',1,''),/reason/)
await db.query("INSERT INTO chart_of_accounts(company_id,code,name,account_type,normal_balance,opening_balance) VALUES($1,'1000','Cash','ASSET','DEBIT',1234.56),($2,'1000','Cash','ASSET','DEBIT',0)",[companyA,companyB])
assert.equal(Number((await db.query('SELECT opening_balance FROM chart_of_accounts WHERE company_id=$1',[companyA])).rows[0].opening_balance),1234.56)
await db.exec(fs.readFileSync(path.join(dir,'030_inventory_onboarding_reliability.sql'),'utf8'))
assert.equal(Number((await db.query("SELECT opening_qty FROM products WHERE company_id=$1",[companyA])).rows[0].opening_qty),10.75)
console.log('PASS: decimal stock, company-scoped SKUs/codes, receive/decrease/count/relocate, invalid-action rollback, opening balances and migration re-run.')
await db.close()
