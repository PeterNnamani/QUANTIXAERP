# QUANTIXA inventory and opening-balance fixes

Prepared for Stephen's Lab — 3 October 2026.
Based on the QUANTIXAERP.zip snapshot supplied for review. These are source changes, not a live deployment. The earlier authentication/security findings remain unresolved.

## Apply before the onboarding

1. Preserve your current work in Git and back up the database. Export any inventory that currently exists only in a browser: the old application could report a local save despite a database failure. The new loader treats successfully loaded database inventory as authoritative.
2. Use a separate branch. The ZIP contains complete updated source and `ONBOARDING_FIXES.patch`. From your existing checkout, run `git apply --check /path/to/ONBOARDING_FIXES.patch`, then `git apply /path/to/ONBOARDING_FIXES.patch`. If the check fails, your checkout differs from the reviewed snapshot; merge the changes instead of forcing them. The patch includes the new migration and tests. The complete source is an alternative, not an additional step. Preserve your own environment files and Git history.
3. Apply `migrations/030_inventory_onboarding_reliability.sql` using the Supabase SQL editor or your migration process. It expects the existing schema through migration 029. For a fresh database, apply `initial_schema.sql` first, then the numbered migrations in order. Migration 030 runs in a transaction, preserves existing quantities, and may be rerun. It does not install authentication or RLS policies.
4. Use Node.js 24 for the supplied verification commands. Run:

   npm ci
   npm run test:inventory
   npm run test:inventory-db
   npm run build

   The database test uses an isolated, in-memory PostgreSQL engine and does not connect to Supabase. The build must run with your existing deployment environment variables. It may need network access for the configured Google font.
5. Deploy the source/build using your normal hosting workflow. No remote repository, hosting service, or live database was changed by this work.
6. Complete the short acceptance check below against your actual configuration before the session.

## Short acceptance check

- Sign in to the correct test company.
- From Inventory or Product Manager, use Bulk upload. Import a small file containing a quantity such as 12.75, a price such as 1250.50, and an explicit zero-stock row. Confirm the database-confirmed row count, then refresh and compare quantities and prices.
- Import a file with more than 200 rows. Confirm the full product count after refresh. Files exceeding 1,000 rows were also covered by local parser/pagination tests.
- Try a duplicated SKU and an invalid numeric cell. Both should identify the problem without silently dropping the row or claiming success.
- Use Add Product with fractional stock and prices. Refresh and verify the values.
- Select one product for Receive Stock, Stock Adjustment, or Stock Count. Check the resulting quantity, movement history, and refresh persistence. A zero physical count is permitted; receiving zero and withdrawing more than available stock are rejected.
- Save fractional opening balances and dates under Settings > Opening Balances. Refresh and verify. Test opening capital and bank opening balances separately if using those screens.
- Confirm that an unavailable database or denied write shows an error instead of a success notice. Database permissions in your deployment must allow the existing browser client to perform the required operations; these fixes do not bypass them.

## Inventory import format

Use CSV, XLS or XLSX, with headings on the first row of every data sheet. Each row must contain Product Name (Product, Item or Name is also recognized). Use text SKUs where leading zeros matter.

Example headings and row:

SKU,Product Name,Category,Opening Stock,Stock Qty,Unit Cost,Selling Price,Branch
RICE-001,Rice,Food,12.75,12.75,1250.50,1500.75,Main Warehouse

Optional fields include Purchased, Sold, Brand, Pack Size, Supplier, Reorder Level, Reorder Quantity and Expiry Date. Use YYYY-MM-DD for text dates; Excel date cells are supported. A period is the decimal separator; comma thousands separators are supported. In CSV, quote values containing commas.

All worksheets are read. All rows are validated before one database upsert. Invalid rows and duplicate SKUs are reported; they are not silently deduplicated. Imported quantities replace the matching product's quantities, rather than adding them. Supplied zeros are preserved. Blank optional values preserve existing values where applicable. Stock quantities use six decimal places in the database; monetary columns retain the existing two-decimal scale.

A supplied SKU identifies a product. If SKU is omitted and exactly one existing product has that name, its SKU is reused; otherwise a new SKU is generated. Ambiguous existing names require explicit SKUs. Different SKUs with identical names remain separate products. For today's inventory loading, use the dedicated Inventory/Product Manager importer; the older generic Settings importer is outside this fix.

## What changed

- Removed the 200-product reload cap and added complete, ordered pagination.
- Replaced the inventory auto-classifier with a dedicated validated inventory importer on both inventory screens.
- Preserved fractional quantities, prices, explicit zeros, multiple sheets, CSV leading-zero SKUs and expiry dates.
- Replaced simulated import progress with a real saved-row confirmation.
- Converted inventory quantity columns from integers to numeric values. Added persistent opening, purchased and sold quantities.
- Scoped product SKUs and account codes to each company and updated inventory upsert targets.
- Changed Add Product and inventory import to await database writes and report failure.
- Replaced hard-coded stock mutations with explicit product/quantity/reason forms and a transactional database function that locks the selected product and writes its audit event.
- Added stock-action history and recorded physical-count details. Connected inventory location/category/status filters and product brand/supplier/stock filters to displayed records.
- Added visible Stock Qty to the product master table. Decimal values are no longer rounded to whole units for display.
- Saved temporary opening-balance accounts with real UUIDs, remapped local account references and cleared drafts only after a successful database write.
- Made opening-capital and bank settings saves await database confirmation. Changing a bank opening balance adjusts the draft available balance by the same difference, preserving its existing movement difference.
- Gave the seeded Payables account code 2005 to avoid its collision with Accounts Payable (2000).

## Scope limits

Relocate Stock moves a product's WHOLE balance to one location without changing quantity. Partial transfers between separate warehouse balances are not implemented. Stock actions update physical inventory and audit history; they do not create supplier invoices or financial journal adjustments. Record the corresponding financial transaction where required, and do not record the same receipt twice through different workflows.

These changes do not resolve the previously documented authentication, authorization, PIN handling, sales transaction consistency, or broader accounting/reporting problems. Browser access still depends on the project's existing Supabase permissions. Financial opening-balance persistence is fixed here; accounting sign-off and report reconciliation still require review.

## Verification

- 15 focused tests passed: 11 inventory/opening-balance tests and 4 real spreadsheet tests. These include a 1,201-row normalization test and a 1,202-product Excel workbook across two sheets.
- The full SQL migration sequence applied successfully in an isolated PostgreSQL engine. Decimal stock, identical SKUs/codes in separate companies, receive/decrease/count/relocate actions, invalid-action rollback, opening-balance cents and migration reruns passed.
- Production build passed using the repository's existing configuration. That configuration still ignores TypeScript build errors.
- Comparing a strict TypeScript check against the untouched snapshot found no new diagnostic signatures. Existing project-wide errors remain.
- Full test-file run: 15 passed, 1 failed. The existing tests/dummy-data.test.mjs dashboard source-text assertion also failed before these changes.
- Live Supabase permissions, live persistence, deployment and a browser end-to-end session have not been verified. The acceptance check above is required on your configuration.
