export type AssistantBooks = {
  companyName?: string
  userName?: string
  plan?: string
  subscriptionStatus?: string
  pathname?: string
  sales?: Array<{ date?: string; customer?: string; totalAmount?: number; status?: string; paymentStatus?: string; items?: Array<{ product?: string; qty?: number }> }>
  expenses?: Array<{ date?: string; desc?: string; category?: string; amount?: number; status?: string }>
  purchases?: Array<{ date?: string; supplier?: string; product?: string; total?: number; status?: string }>
  inventory?: Array<{ product?: string; sku?: string; closing?: number; reorderLevel?: number }>
  bankAccounts?: Array<{ name?: string; institution?: string; balance?: number; status?: string }>
  banks?: Record<string, number>
  receivables?: Array<{ customer?: string; name?: string; balance?: number; balanceDue?: number; outstanding_amount?: number; dueDate?: string; due?: string; status?: string }>
  payables?: Array<{ supplier?: string; name?: string; balance?: number; outstanding_amount?: number; outstandingAmount?: number; dueDate?: string; due?: string; status?: string }>
  loans?: Array<{ lender?: string; name?: string; balance?: number }>
  loanRepayments?: Array<{ amount?: number }>
  staffMembers?: Array<{ name?: string; roleName?: string; status?: string }>
  customerList?: string[]
  supplierList?: string[]
  auditLogs?: Array<{ timestamp?: string; action?: string; details?: string; module?: string }>
  prepayments?: Array<{ supplier?: string; type?: string; remainingAmount?: number }>
}

const guides: Array<{ test: RegExp; answer: string }> = [
  { test: /sale|invoice|customer order/, answer: 'Record a sale on Sales. The total, customer, and payment status then show on the dashboard, receivables, and reports.' },
  { test: /expense|spend/, answer: 'Record costs on Expenses. They reduce today’s profit and appear in the monthly and annual reports.' },
  { test: /purchase|supplier bill|stock in/, answer: 'Record supplier bills on Purchases. They increase stock and payables when a balance remains.' },
  { test: /stock|inventory|product/, answer: 'Stock lives on Inventory. Product details, prices, and reorder levels are on Product Manager when your plan includes it.' },
  { test: /bank|cash|transfer/, answer: 'Bank balances are on Bank Balances. Movements are on Bank Transactions. Transfers between your own accounts are excluded from cash flow.' },
  { test: /payroll|salary|staff/, answer: 'Staff records are on Staff Management. Pay runs are on Payroll. Both open on Professional and during the 14-day trial.' },
  { test: /tax|vat|cit/, answer: 'Use Tax for estimates, and the monthly or annual report when you need VAT and the tax package from recorded sales.' },
  { test: /report|profit and loss|balance sheet/, answer: 'Monthly Report covers the month you select. Annual Report covers the year. The ledger holds the posted journals behind those figures.' },
  { test: /loan|debt/, answer: 'Loans and repayments are on Loans. Outstanding balances are included in the assistant report.' },
  { test: /receivable|who owes|customer owe/, answer: 'Open customer balances are on Receivables. Record a receipt there or against the sale.' },
  { test: /payable|we owe|supplier owe/, answer: 'Open supplier balances are on Payables. Record a payment there when you settle a bill.' },
  { test: /subscription|plan|trial|licence|license/, answer: 'Subscription & Licensing shows Growth, Professional, and Enterprise. The 14-day trial opens every module. After payment, the purchased plan replaces the trial in the same session.' },
  { test: /audit|who changed|activity/, answer: 'Audit Trail lists recorded activity. The assistant also keeps the latest events in Business memory.' },
  { test: /password|sign in|login|pin/, answer: 'Sign in with your staff ID and PIN. Change the PIN from Change Password after you are in the workspace.' },
]

function money(value: number): string {
  return `₦${Math.round(value).toLocaleString('en-NG')}`
}

function dayKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isVoid(status?: string): boolean {
  return ['VOID', 'CANCELLED', 'REVERSED'].includes(String(status || '').toUpperCase())
}

function onDay<T extends { date?: string }>(rows: T[] | undefined, day: string): T[] {
  return (rows || []).filter((row) => String(row.date || '').slice(0, 10) === day && !isVoid((row as { status?: string }).status))
}

function active<T extends { status?: string }>(rows: T[] | undefined): T[] {
  return (rows || []).filter((row) => !isVoid(row.status))
}

function total(rows: Array<{ amount?: number; total?: number; totalAmount?: number }> | undefined, field: 'amount' | 'total' | 'totalAmount'): number {
  return (rows || []).reduce((sum, row) => sum + Number(row[field] || 0), 0)
}

function outstanding(row: { balance?: number; balanceDue?: number; outstanding_amount?: number; outstandingAmount?: number; amount?: number }): number {
  return Number(row.balance ?? row.balanceDue ?? row.outstanding_amount ?? row.outstandingAmount ?? row.amount ?? 0)
}

function cashOf(books: AssistantBooks): number {
  const accounts = (books.bankAccounts || []).filter((account) => String(account.status || 'active').toLowerCase() === 'active')
  if (accounts.length > 0) return accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0)
  return Object.values(books.banks || {}).reduce((sum, balance) => sum + Number(balance || 0), 0)
}

export function companyBrief(books: AssistantBooks, now = new Date()): { revenue: string; expenses: string; profit: string; cash: string; narrative: string } {
  const today = dayKey(now)
  const sales = active(books.sales)
  const expenses = active(books.expenses)
  const purchases = active(books.purchases)
  const revenue = total(sales, 'totalAmount')
  const cost = total(expenses, 'amount') + total(purchases, 'total')
  const todayRevenue = total(onDay(sales, today), 'totalAmount')
  const todayCost = total(onDay(expenses, today), 'amount') + total(onDay(purchases, today), 'total')
  const cash = cashOf(books)
  const overdue = (books.receivables || []).reduce((sum, row) => {
    const balance = outstanding(row)
    const due = String(row.dueDate || row.due || '').slice(0, 10)
    return balance > 0 && (String(row.status || '').toUpperCase() === 'OVERDUE' || (due && due < today)) ? sum + balance : sum
  }, 0)
  const low = (books.inventory || []).filter((item) => Number(item.closing || 0) > 0 && Number(item.closing || 0) <= Number(item.reorderLevel ?? 10)).length
  const out = (books.inventory || []).filter((item) => Number(item.closing || 0) <= 0).length
  const name = books.companyName || 'Your company'
  return {
    revenue: money(revenue),
    expenses: money(cost),
    profit: money(revenue - cost),
    cash: money(cash),
    narrative: `${name} has recorded ${money(revenue)} of sales and ${money(cost)} of costs, so profit on the books is ${money(revenue - cost)}. Today is ${money(todayRevenue)} in and ${money(todayCost)} out. Cash is ${money(cash)}. ${overdue > 0 ? `${money(overdue)} of receivables are overdue.` : 'No receivables are overdue.'} ${out + low > 0 ? `${out} product(s) are out of stock and ${low} are low.` : 'Stock is above reorder levels.'}`,
  }
}

function namedHit(question: string, label?: string): boolean {
  const name = String(label || '').trim().toLowerCase()
  return name.length > 2 && question.includes(name)
}

export function answerCompanyQuestion(books: AssistantBooks, question: string, now = new Date()): string {
  const asked = question.trim()
  const normalized = asked.toLowerCase()
  if (!normalized) return 'Ask about cash, profit, a customer, a product, stock, tax, payroll, or how to use any page.'
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(normalized)) {
    return `Hello${books.userName ? ` ${books.userName}` : ''}. ${companyBrief(books, now).narrative}`
  }
  if (/what can you|help me|who are you|what do you do/.test(normalized)) {
    return `I answer from ${books.companyName || 'this company'}’s live records: sales, costs, cash, stock, customers, suppliers, loans, staff, tax, and how each page works. ${companyBrief(books, now).narrative}`
  }

  const today = dayKey(now)
  const month = today.slice(0, 7)
  const period = /\btoday\b/.test(normalized) ? 'today' : /this month|monthly/.test(normalized) ? 'month' : 'all'
  const inPeriod = (date?: string) => {
    const day = String(date || '').slice(0, 10)
    if (period === 'today') return day === today
    if (period === 'month') return day.startsWith(month)
    return true
  }
  const sales = active(books.sales).filter((sale) => inPeriod(sale.date))
  const expenses = active(books.expenses).filter((expense) => inPeriod(expense.date))
  const purchases = active(books.purchases).filter((purchase) => inPeriod(purchase.date))
  const periodLabel = period === 'today' ? 'Today' : period === 'month' ? 'This month' : 'On the books'

  const sections: string[] = []
  if (/cash|bank|liquid/.test(normalized)) {
    const accounts = (books.bankAccounts || []).filter((account) => String(account.status || 'active').toLowerCase() === 'active')
    const lines = accounts.length > 0
      ? accounts.map((account) => `${account.name || 'Account'}: ${money(Number(account.balance || 0))}`)
      : Object.entries(books.banks || {}).map(([name, balance]) => `${name}: ${money(Number(balance || 0))}`)
    sections.push(`Cash is ${money(cashOf(books))}.${lines.length ? ` ${lines.join('. ')}.` : ' No bank accounts are recorded yet.'}`)
  }
  if (/profit|margin|bottom line/.test(normalized)) {
    const revenue = total(sales, 'totalAmount')
    const cost = total(expenses, 'amount') + total(purchases, 'total')
    sections.push(`${periodLabel}, profit is ${money(revenue - cost)} (${money(revenue)} sales minus ${money(cost)} costs).`)
  }
  if (/revenue|sales|income|turnover/.test(normalized) && !/how (do|to)|where/.test(normalized)) {
    const customers = [...sales].sort((left, right) => String(right.date).localeCompare(String(left.date))).slice(0, 3)
    sections.push(`${periodLabel}, sales are ${money(total(sales, 'totalAmount'))} across ${sales.length} order(s).${customers.length ? ` Latest: ${customers.map((sale) => `${sale.customer || 'Customer'} ${money(Number(sale.totalAmount || 0))}`).join('; ')}.` : ''}`)
  }
  if (/expense|spend|cost/.test(normalized) && !/how (do|to)|where/.test(normalized)) {
    sections.push(`${periodLabel}, expenses are ${money(total(expenses, 'amount'))} across ${expenses.length} record(s).`)
  }
  if (/purchase|supplier bill/.test(normalized) && !/how (do|to)|where/.test(normalized)) {
    sections.push(`${periodLabel}, purchases are ${money(total(purchases, 'total'))} across ${purchases.length} bill(s).`)
  }
  if (/receivable|customer owe|owed to us|who owes/.test(normalized)) {
    const open = (books.receivables || []).filter((row) => outstanding(row) > 0)
    sections.push(`Receivables are ${money(open.reduce((sum, row) => sum + outstanding(row), 0))} across ${open.length} open balance(s).${open.slice(0, 3).map((row) => ` ${row.customer || row.name || 'Customer'} ${money(outstanding(row))}`).join('')}`)
  }
  if (/payable|we owe|supplier owe/.test(normalized)) {
    const open = (books.payables || []).filter((row) => outstanding(row) > 0)
    sections.push(`Payables are ${money(open.reduce((sum, row) => sum + outstanding(row), 0))} across ${open.length} open balance(s).${open.slice(0, 3).map((row) => ` ${row.supplier || row.name || 'Supplier'} ${money(outstanding(row))}`).join('')}`)
  }
  if (/stock|inventory|low stock|out of stock|reorder/.test(normalized)) {
    const items = books.inventory || []
    const low = items.filter((item) => Number(item.closing || 0) > 0 && Number(item.closing || 0) <= Number(item.reorderLevel ?? 10))
    const out = items.filter((item) => Number(item.closing || 0) <= 0)
    sections.push(`Inventory has ${items.length} product(s). ${low.length} are low and ${out.length} are out.${[...low, ...out].slice(0, 4).map((item) => ` ${item.product || item.sku}: ${item.closing ?? 0}`).join('')}`)
  }
  if (/loan|debt|repay/.test(normalized)) {
    const debt = (books.loans || []).reduce((sum, loan) => sum + Number(loan.balance || 0), 0)
    const paid = (books.loanRepayments || []).reduce((sum, repayment) => sum + Number(repayment.amount || 0), 0)
    sections.push(`Loans outstanding are ${money(debt)} across ${(books.loans || []).length} facility(ies). Recorded repayments are ${money(paid)}.`)
  }
  if (/staff|payroll|employee|salary/.test(normalized) && !/how (do|to)|where/.test(normalized)) {
    const people = (books.staffMembers || []).filter((member) => String(member.status || 'active').toLowerCase() !== 'disabled')
    sections.push(`${people.length} active staff${people.length ? `: ${people.slice(0, 5).map((member) => member.name).filter(Boolean).join(', ')}` : ''}. Pay them from Payroll.`)
  }
  if (/tax|vat/.test(normalized)) {
    const revenue = total(active(books.sales), 'totalAmount')
    const vat = revenue * 0.075 / 1.075
    sections.push(`Using 7.5% VAT included in recorded sales of ${money(revenue)}, output VAT is about ${money(vat)}. Open Tax or the annual report for the full package.`)
  }
  if (/subscription|plan|trial|licence|license/.test(normalized)) {
    sections.push(books.subscriptionStatus === 'trial'
      ? `The 14-day trial is active${books.plan ? ` on ${books.plan}` : ''}, so every module is open.`
      : `The current licence is ${books.plan || 'not set'} (${books.subscriptionStatus || 'unknown'}).`)
  }
  if (/audit|recent activity|what happened|latest/.test(normalized)) {
    const latest = books.auditLogs?.[0]
    sections.push(latest
      ? `Latest activity: ${latest.action || 'Update'} ${latest.details || latest.module || ''} on ${latest.timestamp ? new Date(latest.timestamp).toLocaleDateString('en-NG') : 'record'}.`
      : 'No audit events are recorded yet.')
  }

  const customer = [...(books.customerList || []), ...(books.sales || []).map((sale) => sale.customer || '')].find((name) => namedHit(normalized, name))
  if (customer) {
    const matched = active(books.sales).filter((sale) => String(sale.customer || '').toLowerCase() === customer.toLowerCase())
    sections.push(`${customer} has ${matched.length} sale(s) totalling ${money(total(matched, 'totalAmount'))}.`)
  }
  const product = (books.inventory || []).find((item) => namedHit(normalized, item.product) || namedHit(normalized, item.sku))
  if (product) {
    const sold = active(books.sales).flatMap((sale) => sale.items || []).filter((item) => String(item.product || '').toLowerCase() === String(product.product || '').toLowerCase())
    const qty = sold.reduce((sum, item) => sum + Number(item.qty || 0), 0)
    sections.push(`${product.product || product.sku} has ${product.closing ?? 0} on hand. Recorded sales quantity is ${qty}.`)
  }
  const bank = (books.bankAccounts || []).find((account) => namedHit(normalized, account.name) || namedHit(normalized, account.institution))
  if (bank && !sections.some((section) => section.startsWith('Cash is'))) {
    sections.push(`${bank.name} at ${bank.institution || 'the bank'} has ${money(Number(bank.balance || 0))}.`)
  }

  const guide = /how|where|which page|can i/.test(normalized) ? guides.find((item) => item.test.test(normalized)) : undefined
  if (guide) sections.push(guide.answer)

  if (sections.length > 0) return [...new Set(sections)].join(' ')

  const words = normalized.split(/[^a-z0-9]+/).filter((word) => word.length > 3)
  const haystack = [
    ...(books.customerList || []),
    ...(books.supplierList || []),
    ...(books.sales || []).map((sale) => `${sale.customer || ''} ${(sale.items || []).map((item) => item.product).join(' ')}`),
    ...(books.expenses || []).map((expense) => `${expense.desc || ''} ${expense.category || ''}`),
    ...(books.inventory || []).map((item) => `${item.product || ''} ${item.sku || ''}`),
    ...(books.auditLogs || []).map((log) => `${log.details || ''} ${log.module || ''}`),
  ].filter((line) => words.some((word) => line.toLowerCase().includes(word)))
  if (haystack.length > 0) return `I found ${haystack.length} matching record(s). ${haystack.slice(0, 3).join(' | ')}.`
  return `${companyBrief(books, now).narrative} I could not find “${asked}” as its own record, so that is the current company report.`
}
