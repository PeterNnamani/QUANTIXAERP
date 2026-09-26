import test from 'node:test'
import assert from 'node:assert/strict'
import { answerCompanyQuestion, companyBrief } from '../lib/assistant.ts'

const books = {
  companyName: 'Hollandia Stores',
  userName: 'Ada',
  plan: 'Growth Edition',
  subscriptionStatus: 'active',
  sales: [{ date: '2026-09-26', customer: 'Chidi', totalAmount: 1075, status: 'POSTED', items: [{ product: 'Hollandia Milk', qty: 4 }] }],
  expenses: [{ date: '2026-09-26', amount: 75, desc: 'Fuel', category: 'Transport', status: 'POSTED' }],
  purchases: [],
  inventory: [{ product: 'Hollandia Milk', sku: 'MILK', closing: 2, reorderLevel: 5 }, { product: 'Salt', sku: 'SALT', closing: 0, reorderLevel: 2 }],
  bankAccounts: [{ name: 'Globus', institution: 'Globus Bank', balance: 250000, status: 'active' }],
  receivables: [{ customer: 'Chidi', balance: 250, dueDate: '2026-09-20', status: 'OPEN' }],
  payables: [{ supplier: 'Dangote', balance: 80, dueDate: '2026-09-26' }],
  staffMembers: [{ name: 'Ada Okonkwo', status: 'active' }],
}

const now = new Date('2026-09-26T12:00:00')

test('company report uses recorded sales, costs, cash, and stock', () => {
  const brief = companyBrief(books, now)
  assert.equal(brief.revenue, '₦1,075')
  assert.equal(brief.cash, '₦250,000')
  assert.match(brief.narrative, /profit on the books is ₦1,000/)
  assert.match(brief.narrative, /₦250 of receivables are overdue/)
  assert.match(brief.narrative, /1 product\(s\) are out of stock and 1 are low/)
})

test('assistant answers profit, a named product, and an unrelated question from the books', () => {
  assert.match(answerCompanyQuestion(books, 'what is profit today', now), /Today, profit is ₦1,000/)
  assert.match(answerCompanyQuestion(books, 'how much Hollandia Milk is left', now), /2 on hand/)
  const general = answerCompanyQuestion(books, 'what is the weather in Lagos', now)
  assert.match(general, /Hollandia Stores/)
  assert.match(general, /₦250,000/)
})

test('assistant explains where a task is done', () => {
  assert.match(answerCompanyQuestion(books, 'where do I record a sale', now), /Sales/)
})
