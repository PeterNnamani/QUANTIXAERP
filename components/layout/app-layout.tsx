'use client'

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Mic, Send } from 'lucide-react'
import { useAccounting } from '@/lib/context'
import { usePathname, useRouter } from 'next/navigation'
import { formatCurrencyOrZero } from '@/lib/utils'
import { canAccessRoute, canEditPermission, getRoutePermission } from '@/lib/rbac'
import { planCanAccessRoute } from '@/lib/licensing'
import Navigation from './navigation'
import Topbar from './topbar'

type SpeechResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}

type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onstart: (() => void) | null
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, subscriptionLoaded, logout, state } = useAccounting()
  const router = useRouter()
  const pathname = usePathname()
  const [isQUANTIXAOpen, setIsQUANTIXAOpen] = useState(false)
  const [orbHovered, setOrbHovered] = useState(false)
  const [voiceActive, setVoiceActive] = useState(false)
  const [queryText, setQueryText] = useState('')
  const [assistantResponse, setAssistantResponse] = useState('Ask about cash, loans, or audit insights.')
  const [voiceMessage, setVoiceMessage] = useState('')
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  const [sidebarOpen, setSidebarOpen] = useState(false)

  const analytics = useMemo(() => {
    const total = (items: any[], getValue: (item: any) => unknown) => items.reduce((sum, item) => {
      const value = Number(getValue(item))
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)
    const revenue = total(state.sales, (sale) => sale.totalAmount)
    const expenses = total(state.expenses, (expense) => expense.amount)
    const cash = total(state.bankAccounts, (account) => account.balance)
    const debt = total(state.loans, (loan) => loan.balance)
    const repayments = total(state.loanRepayments, (repayment) => repayment.amount)
    const receivables = total(state.receivables, (item) => item.balance)
    const payables = total(state.payables, (item) => item.outstanding_amount ?? item.outstandingAmount ?? item.balance)
    const format = (value: number) => formatCurrencyOrZero(value)
    return {
      revenue: format(revenue), expenses: format(expenses), cash: format(cash), debt: format(debt),
      repayments: format(repayments), receivables: format(receivables), payables: format(payables),
      counts: { sales: state.sales.length, expenses: state.expenses.length, loans: state.loans.length },
      latestAudit: state.auditLogs[0],
    }
  }, [state])

  const answerQuestion = (question: string) => {
    const normalized = question.trim().toLowerCase()
    if (!normalized) return
    if (/(cash|bank|liquid)/.test(normalized)) {
      setAssistantResponse(`Live cash balance across ${state.bankAccounts.length} bank account(s): ${analytics.cash}.`)
    } else if (/(revenue|sales|income)/.test(normalized)) {
      setAssistantResponse(`Recorded revenue is ${analytics.revenue} across ${analytics.counts.sales} sale(s).`)
    } else if (/(expense|spend|cost)/.test(normalized)) {
      setAssistantResponse(`Recorded expenses are ${analytics.expenses} across ${analytics.counts.expenses} expense(s).`)
    } else if (/(loan|debt|repay)/.test(normalized)) {
      setAssistantResponse(`Loan data shows ${analytics.debt} outstanding and ${analytics.repayments} in recorded repayments across ${analytics.counts.loans} loan(s).`)
    } else if (/(receivable|customer owe|owed to us)/.test(normalized)) {
      setAssistantResponse(`Open receivables currently total ${analytics.receivables}.`)
    } else if (/(payable|supplier owe|we owe)/.test(normalized)) {
      setAssistantResponse(`Open payables currently total ${analytics.payables}.`)
    } else if (/(audit|activity|latest|recent)/.test(normalized)) {
      setAssistantResponse(analytics.latestAudit
        ? `Latest recorded activity: ${analytics.latestAudit.action} ${analytics.latestAudit.reference || ''} on ${new Date(analytics.latestAudit.timestamp).toLocaleDateString()}.`
        : 'There are no audit events recorded for this company yet.')
    } else {
      setAssistantResponse('I can answer questions about cash, revenue, expenses, loans, receivables, payables, and audit activity using the current company records.')
    }
  }

  useEffect(() => {
    return () => recognitionRef.current?.stop()
  }, [])

  const toggleVoiceInput = () => {
    if (voiceActive) {
      recognitionRef.current?.stop()
      return
    }

    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }
    const SpeechRecognitionAPI = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
    if (!SpeechRecognitionAPI) {
      setVoiceMessage('Voice input is not supported in this browser.')
      return
    }

    const recognition = new SpeechRecognitionAPI()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onstart = () => {
      setVoiceMessage('')
      setVoiceActive(true)
    }
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(' ')
      setQueryText(transcript)
    }
    recognition.onerror = () => {
      setVoiceMessage('Voice input could not be started.')
      setVoiceActive(false)
    }
    recognition.onend = () => setVoiceActive(false)
    recognitionRef.current = recognition
    recognition.start()
  }

  const pageConfig = useMemo(() => {
    if (pathname?.startsWith('/loans')) {
      return {
        copy: "I’m tracking company debt, repayment timing, interest, and cash impact for the Loans page.",
        highlights: [
          { label: 'Outstanding', value: formatCurrencyOrZero(0) },
          { label: 'Next payment', value: formatCurrencyOrZero(0) },
          { label: 'Health', value: '—' },
        ],
        prediction: `Upcoming ${formatCurrencyOrZero(0)} debt service is due in 30 days. Keep liquidity in view.`,
        bullets: ['Monitor cash flow before early settlement', 'Review lender exposures', 'Watch covenant or refinance triggers'],
        recommendation: 'Consider prioritizing GTBank and investor loan payments.',
        memory: [
          { date: 'Jul 29', text: 'Loan payment schedule updated.' },
          { date: 'Jul 15', text: 'New GTBank facility approved.' },
          { date: 'Jun 20', text: 'Debt ratio fell below 34%.' },
        ],
        inputHint: 'loan payment, lender risk, debt ratio',
        voiceHint: 'Ask QUANTIXA about loans, repayment, or cash impact.',
      }
    }

    if (pathname?.startsWith('/prepayments')) {
      return {
        copy: 'I’m surfacing prepaid expense recognition, delivery timing, and unused advance balances.',
        highlights: [
          { label: 'Prepaid cash', value: formatCurrencyOrZero(0) },
          { label: 'Remaining', value: formatCurrencyOrZero(0) },
          { label: 'Schedules', value: '0 active' },
        ],
        prediction: 'A large prepaid insurance renewal is nearing recognition in 45 days.',
        bullets: ['Track expiring prepayments', 'Confirm supplier deliveries', 'Adjust recognition schedules'],
        recommendation: 'Audit unused advances before month-end.',
        memory: [
          { date: 'Jul 05', text: 'Insurance prepayment posted.' },
          { date: 'Jun 22', text: 'Recognition schedule created for rent.' },
          { date: 'May 10', text: 'Supplier advance under review.' },
        ],
        inputHint: 'prepayment, schedule, recognition',
        voiceHint: 'Ask QUANTIXA about prepaid expenses or schedules.',
      }
    }

    if (pathname?.startsWith('/supplier-rebates')) {
      return {
        copy: 'I’m highlighting rebate programs, pending settlements, and supplier return performance.',
        highlights: [
          { label: 'Pending', value: formatCurrencyOrZero(0) },
          { label: 'Estimated', value: formatCurrencyOrZero(0) },
          { label: 'Claims', value: '0 open' },
        ],
        prediction: 'Several supplier claims are due for settlement this quarter.',
        bullets: ['Validate rebate contracts', 'Match invoices to claims', 'Anticipate cash receipts'],
        recommendation: 'Escalate rebates with highest maturity.',
        memory: [
          { date: 'Jul 20', text: 'New supplier rebate program added.' },
          { date: 'Jul 12', text: 'Rebate payment received from vendor.' },
          { date: 'Jun 28', text: 'Rebate eligibility review completed.' },
        ],
        inputHint: 'supplier rebate, claim status, payable impact',
        voiceHint: 'Ask QUANTIXA about rebate progress and cash recovery.',
      }
    }

    return {
      copy: 'I’m monitoring your business and surfacing the most relevant insights for the current page.',
      highlights: [
        { label: 'Cash', value: formatCurrencyOrZero(0) },
        { label: 'Revenue', value: '—' },
        { label: 'Expenses', value: '—' },
      ],
      prediction: 'Cash may tighten in 18 days if spend stays elevated.',
      bullets: ['Watch supplier payouts', 'Review month-end accruals', 'Check bank liquidity'],
      recommendation: 'Focus on cash flow and payables timing this week.',
      memory: [
        { date: 'Jul 29', text: 'Revenue spike detected.' },
        { date: 'Jul 22', text: 'Marketing campaign increased sales.' },
        { date: 'Jun 14', text: 'Inventory shortage happened.' },
      ],
      inputHint: 'cash, revenue, or expense health',
      voiceHint: 'Ask QUANTIXA about company financial health.',
    }
  }, [pathname])

  useEffect(() => {
    if (!user) {
      router.replace('/')
      return
    }

    if (subscriptionLoaded && !canAccessRoute(user, pathname || '/dashboard')) {
      router.replace('/dashboard')
      return
    }

    if (subscriptionLoaded && !pathname?.startsWith('/subscription-and-licensing') && !planCanAccessRoute(user.subscriptionPlan, pathname || '/dashboard', user.subscriptionStatus)) {
      router.replace('/subscription-and-licensing')
    }
  }, [router, user, pathname, subscriptionLoaded])



  if (!user || !subscriptionLoaded) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', color: '#0f172a' }}>
        <div style={{ textAlign: 'center', padding: '24px 32px', borderRadius: '16px', background: '#ffffff', boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)' }}>
          <div style={{ fontSize: '12px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#475569', marginBottom: '8px' }}>Quantixa</div>
          <div style={{ fontSize: '22px', fontWeight: 700 }}>Loading your workspace...</div>
        </div>
      </div>
    )
  }

  const hasRoleAccess = canAccessRoute(user, pathname || '/dashboard')
  const hasPlanAccess = pathname?.startsWith('/subscription-and-licensing') || planCanAccessRoute(user.subscriptionPlan, pathname || '/dashboard', user.subscriptionStatus)

  if (!hasRoleAccess || !hasPlanAccess) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div className="panel-card" style={{ maxWidth: '420px', textAlign: 'center' }}>
          <div className="eyebrow">Access restricted</div>
          <h2 className="page-title" style={{ fontSize: '24px', marginBottom: '8px' }}>{!hasRoleAccess ? 'This area is not available for your role.' : 'This feature is not included in your current plan.'}</h2>
          <p className="page-subtitle">{!hasRoleAccess ? 'Ask a Super Admin to grant access to this module.' : 'Open Subscription & Licensing to compare plans and upgrade your licence.'}</p>
        </div>
      </div>
    )
  }

  const routePermission = getRoutePermission(pathname || '/dashboard')
  const roleReadOnly = routePermission ? !canEditPermission(user, routePermission) : false

  return (
    <div style={{ minHeight: '100vh', overflow: 'visible' }}>
      <div className={`app ${roleReadOnly ? 'role-readonly' : ''}`}>
        <Topbar user={user} onLogout={logout} onToggleSidebar={() => setSidebarOpen((current) => !current)} isSidebarOpen={sidebarOpen} />
        <div className={`layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
          <Navigation userRole={user.role} isOpen={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
          <div className="main-area">
            {children}
          </div>
        </div>
        <div className={`mobile-sidebar-backdrop ${sidebarOpen ? 'active' : ''}`} onClick={() => setSidebarOpen(false)} />

        <div className="quantixa-root">
          <button
            type="button"
            className={`quantixa-orb ${orbHovered ? 'hovered' : ''} ${isQUANTIXAOpen ? 'active' : ''}`}
            onMouseEnter={() => setOrbHovered(true)}
            onMouseLeave={() => setOrbHovered(false)}
            onClick={() => setIsQUANTIXAOpen((prev) => !prev)}
            aria-label="Open QUANTIXA Intelligence Core"
          >
            <span className="quantixa-orb-energy" />
            <span className="quantixa-orb-core" aria-hidden="true">
              <img className="quantixa-logo" src="/quantixa.png" alt="QUANTIXA logo" />
            </span>
          </button>

          {isQUANTIXAOpen && (
            <div className="quantixa-panel">
              <div className="quantixa-panel-header">
                <div>
                  <span className="quantixa-panel-title">QUANTIXA</span>
                  <p className="quantixa-panel-subtitle">The Intelligence Core</p>
                </div>
                <button
                  type="button"
                  className="quantixa-close"
                  onClick={() => setIsQUANTIXAOpen(false)}
                  aria-label="Close QUANTIXA"
                >
                  ×
                </button>
              </div>
              <div className="quantixa-panel-copy">
                Good evening {user?.name}. I&apos;m monitoring your business and ready to assist across every page.
              </div>
              <div className="quantixa-highlights">
                <div className="quantixa-highlight-card">
                  <span>Revenue</span>
                  <strong>{analytics.revenue}</strong>
                  <small>{analytics.counts.sales} recorded sale(s)</small>
                </div>
                <div className="quantixa-highlight-card">
                  <span>Expenses</span>
                  <strong>{analytics.expenses}</strong>
                  <small>{analytics.counts.expenses} recorded expense(s)</small>
                </div>
                <div className="quantixa-highlight-card">
                  <span>Cash</span>
                  <strong>{analytics.cash}</strong>
                  <small>{state.bankAccounts.length} bank account(s)</small>
                </div>
              </div>
              <div className="quantixa-panel-grid">
                <section>
                  <div className="quantixa-section-title">Prediction</div>
                  <p className="quantixa-prediction-copy">Current cash is {analytics.cash}; future cash movement is not forecast without dated commitments.</p>
                  <div className="quantixa-bullet-list">
                    <div className="quantixa-bullet-item">• Open payables: {analytics.payables}</div>
                    <div className="quantixa-bullet-item">• Open receivables: {analytics.receivables}</div>
                  </div>
                  <div className="quantixa-recommendation">Use these live balances when reviewing payment timing.</div>
                </section>
                <section>
                  <div className="quantixa-section-title">Business Memory</div>
                  <div className="quantixa-memory-list">
                    {state.auditLogs.slice(0, 3).map((log) => (
                      <div className="quantixa-memory-item" key={log.id}>
                        <span>{new Date(log.timestamp).toLocaleDateString()}</span>
                        <p>{log.action} {log.reference || log.type}</p>
                      </div>
                    ))}
                    {state.auditLogs.length === 0 && <p>No business activity has been recorded yet.</p>}
                  </div>
                </section>
              </div>
              <div className="quantixa-command-card">
                <div className="quantixa-command-label">QUANTIXA Input</div>
                <div className="quantixa-input-row">
                  <input
                    className="quantixa-input"
                    value={queryText}
                    onChange={(event) => setQueryText(event.target.value)}
                    placeholder={`Type to QUANTIXA about ${pageConfig.inputHint}`}
                  />
                  <button
                    type="button"
                    className={`quantixa-input-icon-button ${voiceActive ? 'listening' : ''}`}
                    onClick={toggleVoiceInput}
                    aria-label={voiceActive ? 'Stop voice input' : 'Start voice input'}
                    title={voiceActive ? 'Stop voice input' : 'Start voice input'}
                  >
                    <Mic size={18} strokeWidth={2.2} />
                  </button>
                  <button
                    type="button"
                    className="quantixa-input-button"
                    onClick={() => answerQuestion(queryText)}
                    aria-label="Send question"
                    title="Send question"
                  >
                    <Send size={18} strokeWidth={2.2} />
                  </button>
                </div>
                {voiceActive && (
                  <div className="quantixa-listening-indicator" role="status" aria-live="polite">
                    <span className="quantixa-wave" aria-hidden="true">
                      <i /><i /><i /><i /><i />
                    </span>
                    <span>Listening...</span>
                  </div>
                )}
                {voiceMessage && !voiceActive && <div className="quantixa-voice-message" role="status">{voiceMessage}</div>}
                <div className="quantixa-answer" role="status" aria-live="polite">
                  <span>Answer</span>
                  <strong>{assistantResponse}</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
