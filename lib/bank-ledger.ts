export type LedgerBankAccount = {
  id: string
  name: string
  institution: string
  accountNumber: string
  accountType: string
  currency: string
  branch: string
  openingBalance: number
  openingBalanceDate: string
  balance: number
  status: string
}

export type BankMovement = { name: string; delta: number }

export function maskAccountNumber(value: string): string {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return 'Not provided'
  if (digits.length <= 4) return digits
  return `•••• ${digits.slice(-4)}`
}

export function displayBankAccounts(banks: Record<string, number>, accounts: LedgerBankAccount[]): LedgerBankAccount[] {
  const named = accounts.map((account) => ({
    ...account,
    institution: account.institution || account.name,
    balance: banks[account.name] ?? account.balance ?? 0,
    status: account.status || 'active',
  }))
  const legacy = Object.entries(banks)
    .filter(([name]) => !accounts.some((account) => account.name === name))
    .map(([name, balance]) => ({
      id: name,
      name,
      institution: name,
      accountNumber: '',
      accountType: 'Current',
      currency: 'NGN',
      branch: '',
      openingBalance: balance,
      openingBalanceDate: '',
      balance,
      status: 'active',
    }))
  return [...named, ...legacy]
}

export function applyBankMovements<T extends { banks: Record<string, number>; bankAccounts: LedgerBankAccount[] }>(
  state: T,
  movements: BankMovement[],
): Pick<T, 'banks' | 'bankAccounts'> {
  const banks = { ...state.banks }
  movements.forEach((movement) => {
    const current = Number(banks[movement.name] ?? state.bankAccounts.find((account) => account.name === movement.name)?.balance ?? 0)
    banks[movement.name] = Math.max(0, current + movement.delta)
  })
  const bankAccounts = state.bankAccounts.map((account) => (
    banks[account.name] === undefined ? account : { ...account, balance: banks[account.name] }
  ))
  return { banks, bankAccounts }
}

export type StatementRow = { date: string; description: string; amount: number }

function parseAmount(value: string): number {
  const cleaned = value.replace(/[₦$,\s]/g, '').replace(/^\((.*)\)$/, '-$1')
  const amount = Number(cleaned)
  return Number.isFinite(amount) ? amount : NaN
}

function parseDate(value: string): string {
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const slash = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!slash) return ''
  const day = slash[1].padStart(2, '0')
  const month = slash[2].padStart(2, '0')
  return `${slash[3]}-${month}-${day}`
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (char === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

export function parseBankStatement(text: string): StatementRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const header = splitCsvLine(lines[0]).map((cell) => cell.toLowerCase())
  const dateIndex = header.findIndex((cell) => cell.includes('date'))
  const descriptionIndex = header.findIndex((cell) => /desc|narr|detail|particular/.test(cell))
  const amountIndex = header.findIndex((cell) => cell === 'amount' || cell.includes('amount'))
  const debitIndex = header.findIndex((cell) => cell.includes('debit') || cell.includes('withdrawal'))
  const creditIndex = header.findIndex((cell) => cell.includes('credit') || cell.includes('deposit'))
  const hasHeader = dateIndex >= 0
  const body = hasHeader ? lines.slice(1) : lines

  return body.flatMap((line) => {
    const cells = splitCsvLine(line)
    const date = parseDate(hasHeader ? cells[dateIndex] || '' : cells[0] || '')
    const description = (hasHeader ? cells[descriptionIndex] : cells[1]) || 'Bank statement line'
    let amount = NaN
    if (hasHeader && amountIndex >= 0) amount = parseAmount(cells[amountIndex] || '')
    else if (hasHeader && (debitIndex >= 0 || creditIndex >= 0)) {
      const debit = debitIndex >= 0 ? parseAmount(cells[debitIndex] || '') : 0
      const credit = creditIndex >= 0 ? parseAmount(cells[creditIndex] || '') : 0
      amount = (Number.isFinite(credit) ? credit : 0) - (Number.isFinite(debit) ? debit : 0)
    } else {
      amount = parseAmount(cells[2] || '')
    }
    if (!date || !Number.isFinite(amount) || amount === 0) return []
    return [{ date, description, amount }]
  })
}

export function runningBalanceById(
  transactions: Array<{ id: string; date?: string; bank?: string; amount?: number }>,
  openingByBank: Record<string, number>,
): Record<string, number> {
  const ordered = [...transactions].sort((left, right) => {
    const dateOrder = String(left.date || '').localeCompare(String(right.date || ''))
    return dateOrder || String(left.id).localeCompare(String(right.id))
  })
  const running = { ...openingByBank }
  const balances: Record<string, number> = {}
  ordered.forEach((transaction) => {
    const bank = transaction.bank || ''
    const next = Number(running[bank] ?? 0) + Number(transaction.amount || 0)
    running[bank] = next
    balances[transaction.id] = next
  })
  return balances
}
