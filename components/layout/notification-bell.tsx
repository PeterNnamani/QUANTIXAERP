'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, Check, X } from 'lucide-react'
import { useAccounting, type User } from '@/lib/context'
import { supabase } from '@/lib/supabase.browser'

type NotificationItem = {
    id: string
    title: string
    message: string
    tone: 'info' | 'success' | 'warning' | 'error'
    createdAt: string
    read: boolean
}

type AppToastEvent = {
    title?: string
    description?: string
    tone?: NotificationItem['tone']
}

const getRecordId = (record: any, fallback: string) => String(record?.id || record?.reference || record?.sku || fallback)

const formatAuditActivity = (log: any, actor: string) => {
    const action = String(log.action || 'ACTIVITY').toUpperCase()
    const module = String(log.module || log.entity || log.type || 'Accounting').toUpperCase()
    const details = String(log.details || '')
        .replace(log.reference ? new RegExp(String(log.reference).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') : /$^/, '')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([|,.:;)])/g, '$1')
        .trim()
    const record = log.metadata?.new || log.metadata?.old || {}
    const recordName = record.name || record.full_name || record.product || record.username || record.email
    const recordRole = record.role || record.access_level || record.role_title
    const staffMatch = details.match(/^Staff member created:\s*(.+?)\s*\|\s*Role:\s*(.+)$/i)
    if (['CREATE', 'ADD', 'INSERT'].includes(action) && staffMatch) {
        return `${staffMatch[1].trim()} added as ${staffMatch[2].trim().toLowerCase()}`
    }
    if (log.metadata?.source === 'database_trigger' || /^(INSERT|UPDATE|DELETE)\s+.+\s+record(?:\s|$)/i.test(details)) {
        const subject = recordName || module.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter: string) => letter.toUpperCase())
        if (['INSERT', 'CREATE'].includes(action)) return recordRole && module === 'USERS' ? `${subject} added as ${String(recordRole).toLowerCase()}` : `${subject} added`
        if (['UPDATE', 'EDIT'].includes(action)) return `${subject} updated`
        if (['DELETE', 'REMOVE'].includes(action)) return `${subject} deleted`
    }
    const subjectMatch = details.match(/^(?:Manual\s+)?(?:staff|user)\s+(?:member\s+)?(?:created|added|updated|edited|deleted|removed)\s*[:\-]?\s*(.+)$/i)
    const subject = subjectMatch?.[1]?.replace(/[.]+$/, '').trim()
    if (['CREATE', 'ADD', 'INSERT'].includes(action) && ['SALE', 'SALES'].includes(module)) return `Sale made by ${actor}`
    if (['CREATE', 'ADD', 'INSERT'].includes(action)) return `${details || `Added ${subject || recordName || 'a record'}`} by ${actor}`
    if (['UPDATE', 'EDIT'].includes(action)) return `${subject ? `Updated ${subject}` : details || 'Updated a record'} by ${actor}`
    if (['DELETE', 'REMOVE'].includes(action)) return `${subject ? `Deleted ${subject}` : details || 'Deleted a record'} by ${actor}`
    return `${details || action} by ${actor}`
}

const getAuditMessage = (log: any) => formatAuditActivity(log, log.user || 'System')

const isSuperAdmin = (user: User) => ['super-admin', 'md', 'business-owner'].includes(String(user.role || '').toLowerCase())

export default function NotificationBell({ user }: { user: User }) {
    const { state, subscriptionLoaded } = useAccounting()
    const [notifications, setNotifications] = useState<NotificationItem[]>([])
    const [pushEnabled, setPushEnabled] = useState(user.userSettings?.notifications?.push !== false)
    const [isOpen, setIsOpen] = useState(false)
    const [preview, setPreview] = useState<NotificationItem | null>(null)
    const storageKey = `quantixa:notifications:${user.companyId || 'local'}:${user.staffId || user.username || user.name}`
    const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null)
    const initializedRef = useRef(false)
    const recentNotificationRef = useRef<Map<string, number>>(new Map())
    const snapshotsRef = useRef<Record<string, Set<string>>>({})
    const auditPollInFlightRef = useRef(false)
    const auditCursorKey = `quantixa:admin-audit-cursor:${user.companyId || 'local'}:${user.staffId || user.username || user.name}`
    const persistedCursor = user.userSettings?.notificationCursor

    const playSound = () => {
        const audio = new Audio('/notification.mp3')
        audio.volume = 0.65
        void audio.play().catch(() => undefined)
    }

    const publish = (title: string, message: string, tone: NotificationItem['tone'] = 'info', force = false) => {
        if (!pushEnabled) return
        const signature = `${title}\u0000${message}`
        const now = Date.now()
        const previous = recentNotificationRef.current.get(signature)
        if (previous && now - previous < 1000) return

        if (!force) {
            try {
                const stored = window.localStorage.getItem(storageKey)
                const existing = stored ? JSON.parse(stored) : []
                if (Array.isArray(existing) && existing.some((item) => item?.title === title && item?.message === message)) return
            } catch {
                // Continue publishing when notification history cannot be read.
            }
        }

        recentNotificationRef.current.set(signature, now)

        const item: NotificationItem = {
            id: `${now}-${Math.random().toString(36).slice(2)}`,
            title,
            message,
            tone,
            createdAt: new Date().toISOString(),
            read: false,
        }
        setNotifications((current) => [item, ...current])
        setPreview(item)
        playSound()
        window.setTimeout(() => setPreview((current) => current?.id === item.id ? null : current), 5000)
    }

    useEffect(() => {
        setHydratedStorageKey(null)
        initializedRef.current = false
        snapshotsRef.current = {}
        try {
            const stored = window.localStorage.getItem(storageKey)
            const parsed = stored ? JSON.parse(stored) : []
            setNotifications(Array.isArray(parsed) ? parsed : [])
        } catch {
            setNotifications([])
        } finally {
            setHydratedStorageKey(storageKey)
        }
    }, [storageKey])

    useEffect(() => {
        if (hydratedStorageKey !== storageKey) return
        window.localStorage.setItem(storageKey, JSON.stringify(notifications))
    }, [hydratedStorageKey, notifications, storageKey])

    useEffect(() => {
        setPushEnabled(user.userSettings?.notifications?.push !== false)
    }, [user.userSettings?.notifications?.push])

    useEffect(() => {
        const handleSettingsUpdate = (event: Event) => {
            const detail = (event as CustomEvent<{ notifications?: { push?: boolean } }>).detail
            setPushEnabled(detail?.notifications?.push !== false)
        }
        window.addEventListener('quantixa:user-settings-updated', handleSettingsUpdate)
        return () => window.removeEventListener('quantixa:user-settings-updated', handleSettingsUpdate)
    }, [])

    useEffect(() => {
        const handleToast = (event: Event) => {
            const detail = (event as CustomEvent<AppToastEvent>).detail || {}
            publish(detail.title || 'Notification', detail.description || 'A new action requires your attention.', detail.tone || 'info')
        }
        window.addEventListener('quantixa:notification', handleToast)
        return () => window.removeEventListener('quantixa:notification', handleToast)
    }, [pushEnabled])

    useEffect(() => {
        const client = supabase
        if (!subscriptionLoaded || !isSuperAdmin(user) || !client || !user.companyId) return

        let cancelled = false
        const pollAuditActivity = async () => {
            if (auditPollInFlightRef.current) return
            auditPollInFlightRef.current = true

            const { data, error } = await client
                .from('audit_logs')
                .select('id,event_time,action,entity,module,event_type,reference,details,status,metadata,users(full_name,username)')
                .eq('company_id', user.companyId)
                .order('event_time', { ascending: false })
                .limit(200)

            if (cancelled || error || !data) {
                auditPollInFlightRef.current = false
                return
            }

            const cursor = window.localStorage.getItem(auditCursorKey) || persistedCursor || ''
            const relevantLogs = data
                .filter((log: any) => log.metadata?.staff_id !== (user.staffId || null))
                .filter((log: any) => !['LOGIN', 'LOGOUT'].includes(String(log.action || '').toUpperCase()))
                .sort((left: any, right: any) => new Date(left.event_time).getTime() - new Date(right.event_time).getTime())
            const pendingLogs = cursor
                ? relevantLogs.filter((log: any) => new Date(log.event_time).getTime() > Number(cursor))
                : relevantLogs

            if (pendingLogs.length > 0) {
                pendingLogs.forEach((log: any, index: number) => {
                    const actor = log.metadata?.user_name || log.users?.full_name || log.users?.username || 'A staff member'
                    const failed = String(log.status || '').toUpperCase() === 'FAILED' || /fail|error/i.test(`${log.action} ${log.details}`)
                    window.setTimeout(() => {
                        if (!cancelled) publish('Staff activity', formatAuditActivity(log, actor), failed ? 'error' : 'info')
                    }, index * 450)
                })
            }

            const newestTimestamp = relevantLogs[relevantLogs.length - 1]?.event_time
            if (newestTimestamp) {
                const nextCursor = String(new Date(newestTimestamp).getTime())
                window.localStorage.setItem(auditCursorKey, nextCursor)
                if (nextCursor !== persistedCursor) {
                    void fetch('/api/users', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            companyId: user.companyId,
                            staffId: user.staffId,
                            username: user.username,
                            userSettings: { notificationCursor: nextCursor },
                        }),
                    })
                }
            }
            auditPollInFlightRef.current = false
        }

        void pollAuditActivity()
        const intervalId = window.setInterval(() => { void pollAuditActivity() }, 8000)
        return () => {
            cancelled = true
            window.clearInterval(intervalId)
        }
    }, [auditCursorKey, persistedCursor, pushEnabled, subscriptionLoaded, user.companyId, user.role, user.staffId, user.username, user.name])

    useEffect(() => {
        if (user.companyId && !user.companyName) return

        const identity = `${user.companyId || 'local'}:${user.staffId || user.username || user.name}`
        const loginToken = window.localStorage.getItem('quantixa_login_notification')
        const consumedTokenKey = `quantixa:login-notification-consumed:${identity}`
        if (!loginToken || window.localStorage.getItem(consumedTokenKey) === loginToken) return

        const roleName = user.roleName || user.role || 'user'
        const companyName = user.companyName || 'your QUANTIXA workspace'
        publish('Welcome back', `Welcome back ${user.name}, you are signed in as the ${roleName.toLowerCase()} of ${companyName}.`, 'success', true)
        window.localStorage.setItem(consumedTokenKey, loginToken)
    }, [pushEnabled, user.companyId, user.companyName, user.name, user.role, user.roleName, user.staffId, user.username])

    useEffect(() => {
        const collections: Array<{ key: string; records: any[]; title: string; message: (record: any) => string; tone?: NotificationItem['tone'] }> = [
            { key: 'sales', records: state.sales, title: 'New sale recorded', message: (record) => `${record.customer || 'A customer'} sale for ${record.totalAmount || 0} was recorded.`, tone: 'success' },
            { key: 'expenses', records: state.expenses, title: 'New expense recorded', message: (record) => `${record.category || 'An expense'} entry for ${record.amount || 0} was recorded.` },
            { key: 'bankTxns', records: state.bankTxns, title: 'Bank transaction completed', message: (record) => `${record.activity || record.description || 'A bank transaction'} was completed.`, tone: 'success' },
            { key: 'staff', records: state.staffMembers, title: 'New staff member', message: (record) => `${record.name || 'A staff member'} was added to the workspace.`, tone: 'success' },
        ]

        if (!initializedRef.current) {
            collections.forEach(({ key, records }) => { snapshotsRef.current[key] = new Set(records.map((record) => getRecordId(record, key))) })
            snapshotsRef.current.inventory = new Set(state.inventory.filter((item) => item.closing <= (item.reorderLevel ?? 10)).map((item) => getRecordId(item, item.product)))
            snapshotsRef.current.auditLogs = new Set(state.auditLogs.map((log) => getRecordId(log, log.timestamp)))
            initializedRef.current = true
            return
        }

        collections.forEach(({ key, records, title, message, tone }) => {
            const previous = snapshotsRef.current[key] || new Set<string>()
            const added = records.filter((record) => !previous.has(getRecordId(record, key)))
            added.slice(-3).forEach((record) => publish(title, message(record), tone))
            snapshotsRef.current[key] = new Set(records.map((record) => getRecordId(record, key)))
        })

        const previousLowStock = snapshotsRef.current.inventory || new Set<string>()
        const currentLowStock = state.inventory.filter((item) => item.closing <= (item.reorderLevel ?? 10))
        currentLowStock.filter((item) => !previousLowStock.has(getRecordId(item, item.product))).forEach((item) => {
            publish('Low stock alert', `${item.product} has ${item.closing} unit${item.closing === 1 ? '' : 's'} remaining.`, 'warning')
        })
        snapshotsRef.current.inventory = new Set(currentLowStock.map((item) => getRecordId(item, item.product)))

        const previousAuditLogs = snapshotsRef.current.auditLogs || new Set<string>()
        if (!isSuperAdmin(user)) {
            const addedAuditLogs = state.auditLogs.filter((log) => !previousAuditLogs.has(getRecordId(log, log.timestamp)))
            addedAuditLogs.slice(-3).forEach((log) => {
                const failed = String(log.status || '').toUpperCase() === 'FAILED' || /fail|error/i.test(`${log.action} ${log.details}`)
                publish(failed ? 'Action failed' : 'New audit activity', getAuditMessage(log), failed ? 'error' : 'info')
            })
        }
        snapshotsRef.current.auditLogs = new Set(state.auditLogs.map((log) => getRecordId(log, log.timestamp)))
    }, [pushEnabled, state.auditLogs, state.bankTxns, state.expenses, state.inventory, state.sales, state.staffMembers, user])

    const unreadCount = notifications.filter((item) => !item.read).length

    const markAllRead = () => {
        setNotifications((current) => current.map((item) => ({ ...item, read: true })))
    }

    return (
        <div className="notification-wrap">
            <button
                type="button"
                className={`notification-trigger ${unreadCount > 0 ? 'has-unread' : ''}`}
                onClick={() => setIsOpen((current) => !current)}
                aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
                aria-expanded={isOpen}
            >
                <Bell size={18} />
                {unreadCount > 0 && <span className="notification-count">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>

            {preview && !isOpen && (
                <div className={`notification-preview ${preview.tone}`} role="status">
                    <div className="notification-preview-icon"><Bell size={15} /></div>
                    <div><strong>{preview.title}</strong><span>{preview.message}</span></div>
                    <button type="button" onClick={() => setPreview(null)} aria-label="Dismiss notification"><X size={14} /></button>
                </div>
            )}

            {isOpen && (
                <div className="notification-panel">
                    <div className="notification-panel-head"><strong>Notifications</strong><button type="button" onClick={markAllRead}><Check size={14} /> Mark all as read</button></div>
                    <div className="notification-list">
                        {notifications.length === 0 ? <div className="notification-empty">No notifications yet.</div> : notifications.map((item) => (
                            <div className={`notification-item ${item.read ? 'read' : ''}`} key={item.id}>
                                <span className={`notification-dot ${item.tone}`} />
                                <div><strong>{item.title}</strong><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}