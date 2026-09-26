'use client'

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Mic, Send } from 'lucide-react'
import { useAccounting } from '@/lib/context'
import { usePathname, useRouter } from 'next/navigation'
import { answerCompanyQuestion, companyBrief, type AssistantBooks } from '@/lib/assistant'
import { canAccessRoute, canEditPermission, getRoutePermission } from '@/lib/rbac'
import { planCanAccessRoute } from '@/lib/licensing'
import Navigation from './navigation'
import Topbar from './topbar'
import WorkspaceLoader from './workspace-loader'

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

function formatBusinessMemory(log: any) {
  const action = String(log.action || log.type || 'ACTIVITY').toUpperCase()
  const module = String(log.module || log.entity || log.type || 'Accounting')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
  const record = log.metadata?.new || log.metadata?.old || {}
  const recordName = record.name || record.full_name || record.product || record.username || record.email
  const reference = String(log.reference || '')
  const details = String(log.details || '')
    .replace(reference ? new RegExp(reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') : /$^/, '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([|,.:;)])/g, '$1')
    .trim()

  if (recordName && /^(INSERT|CREATE|ADD)\b/i.test(action)) return `${recordName} added`
  if (recordName && /^(UPDATE|EDIT)\b/i.test(action)) return `${recordName} updated`
  if (recordName && /^(DELETE|REMOVE)\b/i.test(action)) return `${recordName} deleted`
  if (details && !/^(INSERT|UPDATE|DELETE)\s+.+\s+record\s*$/i.test(details)) return details
  if (action === 'INSERT' || action === 'CREATE' || action === 'ADD') return `${module} added`
  if (action === 'UPDATE' || action === 'EDIT') return `${module} updated`
  if (action === 'DELETE' || action === 'REMOVE') return `${module} deleted`
  return `${module}: ${action.toLowerCase()}`
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, subscriptionLoaded, logout, state } = useAccounting()
  const router = useRouter()
  const pathname = usePathname()
  const [isQUANTIXAOpen, setIsQUANTIXAOpen] = useState(false)
  const [orbHovered, setOrbHovered] = useState(false)
  const [voiceActive, setVoiceActive] = useState(false)
  const [queryText, setQueryText] = useState('')
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([])
  const [voiceMessage, setVoiceMessage] = useState('')
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)
  const suggestions = ['Profit today', 'Who owes us?', 'Low stock', 'How do I record a sale?']

  const [sidebarOpen, setSidebarOpen] = useState(false)

  const books = useMemo<AssistantBooks>(() => ({
    companyName: state.companySettings.companyName,
    userName: user?.name,
    plan: user?.subscriptionPlan,
    subscriptionStatus: user?.subscriptionStatus,
    pathname: pathname || undefined,
    sales: state.sales,
    expenses: state.expenses,
    purchases: state.purchases,
    inventory: state.inventory,
    bankAccounts: state.bankAccounts,
    banks: state.banks,
    receivables: state.receivables,
    payables: state.payables,
    loans: state.loans,
    loanRepayments: state.loanRepayments,
    staffMembers: state.staffMembers,
    customerList: state.customerList,
    supplierList: state.supplierList,
    auditLogs: state.auditLogs,
    prepayments: state.prepayments,
  }), [pathname, state, user?.name, user?.subscriptionPlan, user?.subscriptionStatus])
  const brief = useMemo(() => companyBrief(books), [books])

  const ask = (question: string) => {
    const text = question.trim()
    if (!text) return
    setMessages((current) => [...current, { role: 'user', text }, { role: 'assistant', text: answerCompanyQuestion(books, text) }])
    setQueryText('')
    recognitionRef.current?.stop()
  }

  useEffect(() => {
    return () => recognitionRef.current?.stop()
  }, [])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [messages])

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
    return <WorkspaceLoader phase={user ? 'company' : 'session'} />
  }

  const hasRoleAccess = canAccessRoute(user, pathname || '/dashboard')
  const hasPlanAccess = pathname?.startsWith('/subscription-and-licensing') || planCanAccessRoute(user.subscriptionPlan, pathname || '/dashboard', user.subscriptionStatus)

  if (!hasRoleAccess) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div className="panel-card" style={{ maxWidth: '420px', textAlign: 'center' }}>
          <div className="eyebrow">Access restricted</div>
          <h2 className="page-title" style={{ fontSize: '24px', marginBottom: '8px' }}>This area is not available for your role.</h2>
          <p className="page-subtitle">Ask a Super Admin to grant access to this module.</p>
        </div>
      </div>
    )
  }

  if (!hasPlanAccess) {
    return <WorkspaceLoader phase="dashboard" />
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
              <div className="quantixa-report">
                <div className="quantixa-section-title">Company report</div>
                <p>{brief.narrative}</p>
                <div className="quantixa-highlights">
                  <div className="quantixa-highlight-card"><span>Sales</span><strong>{brief.revenue}</strong></div>
                  <div className="quantixa-highlight-card"><span>Costs</span><strong>{brief.expenses}</strong></div>
                  <div className="quantixa-highlight-card"><span>Profit</span><strong>{brief.profit}</strong></div>
                  <div className="quantixa-highlight-card"><span>Cash</span><strong>{brief.cash}</strong></div>
                </div>
              </div>
              <div className="quantixa-memory-list">
                {state.auditLogs.slice(0, 2).map((log) => (
                  <div className="quantixa-memory-item" key={log.id || log.timestamp}>
                    <span>{new Date(log.timestamp).toLocaleDateString('en-NG')}</span>
                    <p>{formatBusinessMemory(log)}</p>
                  </div>
                ))}
              </div>
              <div className="quantixa-thread" ref={threadRef} aria-live="polite">
                {messages.length === 0 && <p className="quantixa-thread-empty">Ask anything about this company. Answers use the records already in the workspace.</p>}
                {messages.map((message, index) => (
                  <p key={`${message.role}-${index}`} className={`quantixa-message ${message.role}`}>{message.text}</p>
                ))}
              </div>
              <div className="quantixa-suggestions">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} type="button" className="quantixa-chip" onClick={() => ask(suggestion)}>{suggestion}</button>
                ))}
              </div>
              <form className="quantixa-command-card" onSubmit={(event) => { event.preventDefault(); ask(queryText) }}>
                <div className="quantixa-input-row">
                  <input
                    className="quantixa-input"
                    value={queryText}
                    onChange={(event) => setQueryText(event.target.value)}
                    placeholder="Ask about cash, stock, a customer, tax, or any page"
                    enterKeyHint="send"
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
                  <button type="submit" className="quantixa-input-button" aria-label="Send question" title="Send question">
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
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
