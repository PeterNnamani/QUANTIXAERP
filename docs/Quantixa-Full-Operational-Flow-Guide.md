# Quantixa — Full Operational Flow Guide (Purchase → Inventory → Sales → Records → Closing)

This document is intended as a hand-off spec for the AI builder. It describes the operational flow, status transitions, table writes, and journal posting expectations for the core purchasing and sales cycles, inventory valuation, and closing processes.

---

## PART 1 — The two cycles that run your business

Everything in Quantixa is one of two cycles, both of which pass through Inventory and both of which end up in the General Ledger:

- `PURCHASE-TO-PAY (P2P): Requisition → Purchase Order → Goods Receipt → Supplier Bill → Payment`
- `ORDER-TO-CASH (O2C): Quotation → Sales Order → Delivery/Fulfillment → Sales Invoice → Receipt`

Inventory sits in the middle — P2P increases stock, O2C decreases it. Both cycles ultimately post to the same ledger, which is why Daily Closing, the Balance Sheet, and the P&L are downstream of correctly-built P2P and O2C flows, not separate work.

---

## PART 2 — Purchase-to-Pay, step by step

### Step 1: Purchase Requisition (optional internal control step)

- What happens: Staff member requests something be bought (e.g. "we need 500 units of Product X").
- Status flow: `PENDING_APPROVAL → APPROVED → REJECTED → CONVERTED_TO_PO`
- Tables: `purchase_requisitions`, `purchase_requisition_lines`
- GL impact: None. This is an internal control document, not a financial transaction.
- Why it matters: This is where segregation of duties starts — the requester and the approver should never be the same person for amounts above a threshold you configure.

### Step 2: Purchase Order (the commitment to a supplier)

- What happens: An approved requisition (or a direct request) becomes a formal order sent to a supplier, with quantities, agreed prices, and delivery terms.
- Status flow: `DRAFT → SENT → PARTIALLY_RECEIVED → FULLY_RECEIVED → CLOSED` (or `CANCELLED` at any point before receipt)
- Tables:

```
CREATE TABLE purchase_orders (
    po_id SERIAL PRIMARY KEY,
    supplier_id INT REFERENCES suppliers(supplier_id),
    po_date DATE, expected_delivery_date DATE,
    status VARCHAR(20) DEFAULT 'DRAFT',
    subtotal NUMERIC(18,2), tax_amount NUMERIC(18,2), total_amount NUMERIC(18,2),
    created_by INT REFERENCES users(user_id), approved_by INT REFERENCES users(user_id)
);
CREATE TABLE purchase_order_lines (
    line_id SERIAL PRIMARY KEY,
    po_id INT REFERENCES purchase_orders(po_id),
    product_id INT REFERENCES products(product_id),
    quantity_ordered NUMERIC(18,2), unit_price NUMERIC(18,2),
    quantity_received NUMERIC(18,2) DEFAULT 0
);
```

- GL impact: None yet. A PO is a commitment, not a transaction — no asset or liability exists until goods or an invoice actually arrive. (Optional: some systems track "committed spend" in a memo report for budget control — this is not a GL posting.)

### Step 3: Goods Receipt Note (GRN) — goods physically arrive

- What happens: The warehouse confirms physical receipt of goods against the PO. This is the moment inventory increases — often before the supplier's invoice has even arrived.
- Status flow: `PENDING → RECEIVED → INSPECTED → ACCEPTED / REJECTED`
- Tables:

```
CREATE TABLE goods_receipt_notes (
    grn_id SERIAL PRIMARY KEY,
    po_id INT REFERENCES purchase_orders(po_id),
    receipt_date DATE,
    received_by INT REFERENCES users(user_id),
    journal_entry_id INT REFERENCES journal_entries(entry_id)
);
CREATE TABLE grn_lines (
    line_id SERIAL PRIMARY KEY,
    grn_id INT REFERENCES goods_receipt_notes(grn_id),
    po_line_id INT REFERENCES purchase_order_lines(line_id),
    quantity_received NUMERIC(18,2), unit_cost NUMERIC(18,2)
);
```

- GL impact — this is the step people forget:

```
Dr Inventory (at PO unit cost)
    Cr GRN Clearing / Accrued Purchases
```

Why not straight to Payables? Because you have goods and a cost, but no invoice yet to formally record as a payable. The "GRN Clearing" account holds the liability until the actual bill arrives, at which point it's matched off. This is what makes inventory and cost of goods sold accurate in real time, even if supplier invoices lag by days or weeks.

- Also updates: `inventory_transactions` (`txn_type = 'PURCHASE'`), incrementing stock on hand, and `purchase_order_lines.quantity_received`.

### Step 4: Supplier Invoice / Bill — the 3-way match

- What happens: The supplier's invoice arrives. The system (or the accounts clerk) matches it against the PO (what was ordered) and the GRN (what was actually received) — this is the classic 3-way match: PO quantity/price vs GRN quantity vs Invoice quantity/price.
- Status flow: `PENDING_MATCH → MATCHED → VARIANCE_FLAGGED → APPROVED → UNPAID → PARTIALLY_PAID → PAID`
- Tables:

```
CREATE TABLE supplier_bills (
    bill_id SERIAL PRIMARY KEY,
    supplier_id INT REFERENCES suppliers(supplier_id),
    po_id INT REFERENCES purchase_orders(po_id),
    bill_date DATE, due_date DATE,
    subtotal NUMERIC(18,2), tax_amount NUMERIC(18,2), total_amount NUMERIC(18,2),
    match_status VARCHAR(15) DEFAULT 'PENDING_MATCH',
    status VARCHAR(15) DEFAULT 'UNPAID',
    journal_entry_id INT REFERENCES journal_entries(entry_id)
);
```

- GL impact (if matched cleanly):

```
Dr GRN Clearing / Accrued Purchases
    Cr Accounts Payable
```

- If there's a price/quantity variance (invoice says ₦52 when PO/GRN said ₦50): the difference posts to a Purchase Price Variance account so it's visible, not silently absorbed into inventory cost.
- This is also where Supplier Rebates hook in: if the supplier grants a volume rebate, it typically reduces either the Cost of Inventory (if not yet sold) or Cost of Sales (if already sold) — never dumped straight into "other income," because it's a cost reduction, not revenue.

### Step 5: Payment

- What happens: The bill is paid, fully or partially, via the Bank module.
- Status flow: bill → `PARTIALLY_PAID` or `PAID`; a `payments` record is created.
- GL impact:

```
Dr Accounts Payable
    Cr Bank
```

- This is also where early-payment discounts get handled: if you pay early for a 2% discount, that discount is a small credit to a "Purchase Discounts" account, not just a smaller cash outflow with no trace.

---

## PART 3 — Order-to-Cash, step by step

### Step 1: Quotation (optional)

- What happens: Customer requests pricing before committing.
- Status flow: `DRAFT → SENT → ACCEPTED → EXPIRED → CONVERTED_TO_SO`
- GL impact: None.

### Step 2: Sales Order

- What happens: Customer confirms they want to buy. Optionally reserves stock so it's not double-sold to someone else.
- Status flow: `DRAFT → CONFIRMED → PARTIALLY_FULFILLED → FULFILLED → CANCELLED`
- Tables:

```
CREATE TABLE sales_orders (
    so_id SERIAL PRIMARY KEY,
    customer_id INT REFERENCES customers(customer_id),
    order_date DATE, status VARCHAR(20) DEFAULT 'DRAFT',
    subtotal NUMERIC(18,2), tax_amount NUMERIC(18,2), total_amount NUMERIC(18,2)
);
CREATE TABLE sales_order_lines (
    line_id SERIAL PRIMARY KEY,
    so_id INT REFERENCES sales_orders(so_id),
    product_id INT REFERENCES products(product_id),
    quantity_ordered NUMERIC(18,2), unit_price NUMERIC(18,2),
    quantity_fulfilled NUMERIC(18,2) DEFAULT 0
);
```

- GL impact: None yet — same logic as a Purchase Order. A confirmed sale isn't revenue until you've actually delivered (or, per your policy, invoiced).
- Inventory impact: Optionally decrements an "available to sell" quantity (a soft reservation), without touching actual stock-on-hand or the GL.

### Step 3: Delivery / Fulfillment

- What happens: Goods physically leave the warehouse to the customer.
- Status flow: `PENDING → PICKED → PACKED → SHIPPED → DELIVERED`
- GL impact — cost side only, at this point:

```
Dr Cost of Goods Sold
    Cr Inventory
```

- Also updates: `inventory_transactions` (`txn_type = 'SALE'`), decrementing stock on hand.
- Note: Depending on your accounting policy, you may combine this with Step 4 (invoice) into a single event if delivery and invoicing always happen simultaneously in your business. Keep them separate in the schema even if you fire both journal entries at once — it gives you room later if delivery and invoicing ever diverge (e.g. consignment sales).

### Step 4: Sales Invoice

- What happens: Formal bill sent to customer — this is what actually recognises revenue.
- Status flow: `DRAFT → UNPAID → PARTIALLY_PAID → PAID → OVERDUE → VOID`
- GL impact — revenue side:

```
Dr Trade Receivables
    Cr Revenue
    Cr Output VAT/Tax payable (if applicable)
```

- This is the single most important control point: an invoice should generally only be raised against a fulfilled (or at least confirmed) Sales Order — this is what prevents "phantom revenue" from being recorded for goods never actually delivered.

### Step 5: Receipt

- What happens: Customer pays, fully or partially.
- GL impact:

```
Dr Bank
    Cr Trade Receivables
```

- Partial payments allocate against specific invoices via `receipt_allocations` — this is what lets your Receivables report show exactly which invoices are still outstanding, and for how long.

### Returns & Credit Notes (both cycles)

- Sales return: `Dr Revenue / Cr Receivables` (reverse the sale) and `Dr Inventory / Cr COGS` (goods physically come back), both via a Credit Note document — never just delete the original invoice.
- Purchase return: mirror image — `Dr Accounts Payable / Cr Inventory`.

---

## PART 4 — Inventory valuation logic (runs underneath both cycles)

Every `inventory_transactions` row needs a costed unit cost, not just a quantity, because that's what makes Step 3 above (COGS posting) correct. Two common approaches:

### FIFO (First-In-First-Out)

Maintain inventory as cost layers — each GRN creates a new layer with its own quantity and unit cost. When goods are sold, consume the oldest layer(s) first.

```
CREATE TABLE inventory_cost_layers (
    layer_id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(product_id),
    grn_line_id INT REFERENCES grn_lines(line_id),
    quantity_remaining NUMERIC(18,2),
    unit_cost NUMERIC(18,2),
    received_date DATE
);
```

A sale of 60 units pulls from the oldest layer(s) with remaining quantity until 60 units are accounted for — the COGS entry uses the weighted cost of whatever layers were consumed.

### Weighted Average

Simpler — maintain one running `average_cost` per product, recalculated on every purchase:

```
New Average Cost = (Existing Qty × Existing Avg Cost + New Qty × New Purchase Cost) / (Existing Qty + New Qty)
```

Every sale uses the current average cost at the moment of sale.

Pick one per product category and stick with it — switching methods mid-year distorts your P&L and is itself a disclosable accounting policy change.

### Stock adjustments / stocktakes

If physical count is LOWER than system:

```
Dr Inventory Shrinkage/Write-off (Expense)
    Cr Inventory
```

If physical count is HIGHER than system:

```
Dr Inventory
    Cr Inventory Gain
```

Never just overwrite the stock quantity field — always route through an adjustment transaction so there's a record of what changed and why.

---

## PART 5 — Daily Closing

This is an operational discipline, not just a report. Each day (or each shift, for cash-heavy businesses):

1. Reconcile physical cash / POS terminal totals against what the system recorded as cash sales — flag variances immediately, don't let them accumulate.
2. Check for unposted/draft transactions — anything left in DRAFT status at day-end should be reviewed: was it forgotten, or intentionally pending?
3. Run the day's bank feed import (if using open banking / statement import) so `bank_transactions` stays current for reconciliation.
4. Generate a Daily Summary — total sales, total purchases, cash position, top-line snapshot. This is a read-only report, not a posting.
5. Soft-lock the day — optionally flag the day as "reviewed" so accidental backdated entries get a warning (not necessarily a hard block — that's what period-end closing is for).

Daily Closing does not post any journal entries of its own — it's a checkpoint and a report, not a financial event.

---

## PART 6 — Month-End Closing Checklist

Run in this order — each step depends on the one before it:

1. Ensure all Sales Invoices and Supplier Bills for the month are posted (no drafts left behind).
2. Complete Bank Reconciliation for every bank account for the month.
3. Run the Depreciation Schedule job for all active fixed assets.
4. Post Prepayment amortisation (portion of prepaid expenses consumed this month).
5. Review and update Provisions (e.g. bad debt provision, warranty provision) based on current facts.
6. Review Inventory — run a cycle count or full stocktake if due; post any adjustments.
7. Calculate and post accrued expenses (costs incurred but not yet billed — e.g. utilities used but no invoice yet).
8. Generate draft Trial Balance, Balance Sheet, and P&L — review for anything that looks obviously wrong (negative inventory, unexplained variances).
9. Get sign-off (even if it's just you, at a small scale) before locking.
10. Lock the period (`accounting_periods.status = 'CLOSED'`).

---

## PART 7 — Year-End Closing (in addition to the above)

1. Everything in Month-End Closing for the final period.
2. Run the closing journal entry: zero out all Income and Expense accounts, net Profit/Loss → Retained Earnings.
3. Record any dividend declarations: `Dr Retained Earnings / Cr Dividends Payable`, then `Dr Dividends Payable / Cr Bank` on payment.
4. Roll forward opening balances into the new fiscal year's `accounting_periods`.
5. Generate the full annual statement set — P&L, OCI, Balance Sheet, Statement of Changes in Equity, Notes — exactly the documents your accountant showed you as the target output.

---

## PART 8 — Worked example, start to finish

**Scenario:** You buy 100 units of Product X at ₦500 each. You later sell 60 units at ₦900 each on credit.

| Step | Event | Journal Entry | Running Inventory |
|------|-------|---------------|-------------------|
| 1 | GRN: 100 units received @ ₦500 | Dr Inventory 50,000 / Cr GRN Clearing 50,000 | 100 units, ₦50,000 |
| 2 | Supplier bill matched | Dr GRN Clearing 50,000 / Cr Accounts Payable 50,000 | — |
| 3 | Bill paid | Dr Accounts Payable 50,000 / Cr Bank 50,000 | — |
| 4 | Delivery: 60 units shipped to customer | Dr COGS 30,000 / Cr Inventory 30,000 | 40 units, ₦20,000 |
| 5 | Invoice raised: 60 units @ ₦900 | Dr Receivables 54,000 / Cr Revenue 54,000 | — |
| 6 | Customer pays | Dr Bank 54,000 / Cr Receivables 54,000 | — |

**Resulting P&L impact:** Revenue 54,000 − COGS 30,000 = **Gross Profit 24,000**.

**Resulting Balance Sheet impact:** Inventory 20,000 (40 units remaining), Cash net effect +4,000 (54,000 in − 50,000 out), no outstanding Receivables or Payables since both were settled.

If your system produces exactly this when you feed it the same scenario, your posting engine is working correctly. This is the test case to give your AI builder as an acceptance test.

---

## PART 9 — Document status state machines (summary reference)

```
Purchase Requisition:  PENDING_APPROVAL → APPROVED → CONVERTED_TO_PO
                                        → REJECTED

Purchase Order:        DRAFT → SENT → PARTIALLY_RECEIVED → FULLY_RECEIVED → CLOSED
                                    → CANCELLED

Goods Receipt Note:     PENDING → RECEIVED → INSPECTED → ACCEPTED
                                            → REJECTED

Supplier Bill:          PENDING_MATCH → MATCHED → UNPAID → PARTIALLY_PAID → PAID
                                       → VARIANCE_FLAGGED

Sales Order:            DRAFT → CONFIRMED → PARTIALLY_FULFILLED → FULFILLED
                                          → CANCELLED

Sales Invoice:          DRAFT → UNPAID → PARTIALLY_PAID → PAID
                                       → OVERDUE
                                       → VOID (only via credit note, never deleted)

Bank Reconciliation:    IN_PROGRESS → COMPLETED

Accounting Period:      OPEN → CLOSED (→ REOPENED, exceptional, logged, re-approved)
```

Give your AI builder this state machine list directly — it removes almost all ambiguity about what "done" means for each document type.

---

## PART 10 — The one instruction to give your AI builder above all else

> Every module writes to `journal_entries`/`journal_lines` through one shared posting function. No module (Sales, Purchases, Bank, Payroll, Assets) is allowed to update a balance directly. If a feature can't cleanly express itself as a balanced debit/credit journal entry, stop and figure out the correct accounting treatment before writing code — don't approximate it.
