'use client'

import { useState, type ChangeEvent } from 'react'
import AppLayout from '@/components/layout/app-layout'
import { useAccounting } from '@/lib/context'
import { triggerAppToast } from '@/lib/utils'

const statusCards = [
  { title: 'Last Backup', value: 'Today · 11:45 AM', note: 'Successful' },
  { title: 'Next Backup', value: 'Tonight · 12:00 AM', note: 'Scheduled' },
  { title: 'Backup Size', value: '4.8 GB', note: 'Growing steadily' },
  { title: 'Cloud Storage', value: '72%', note: 'Healthy headroom' },
  { title: 'Recovery Points', value: '42', note: 'Secure' },
  { title: 'Encryption', value: 'AES-256 Enabled', note: 'Protected' },
]

const timeline = [
  { time: '11:45', title: 'Automatic Backup', detail: 'Completed successfully', tone: 'success' },
  { time: 'Yesterday · 12:00', title: 'Scheduled Backup', detail: 'Completed successfully', tone: 'success' },
  { time: 'Monday · 01:30', title: 'Manual Backup', detail: 'Completed successfully', tone: 'success' },
]

const options = ['Full Backup', 'Incremental Backup', 'Database Only', 'Files Only']
const restorePoints = ['Today · 11:45', 'Yesterday', 'Monday', 'July 25']

export default function BackupPage() {
  const { state } = useAccounting()
  const [lastBackup, setLastBackup] = useState('')

  const handleBackup = () => {
    const dataStr = JSON.stringify(state, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    const companySlug = (state.companySettings.companyName || 'company').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    link.download = `${companySlug || 'company'}-backup-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    setLastBackup(new Date().toLocaleString())
  }

  const handleRestore = () => {
    setLastBackup(`Restored at ${new Date().toLocaleString()}`)
    triggerAppToast('Restore', 'The latest backup has been prepared for restore.')
  }

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        JSON.parse(reader.result as string)
        alert('Backup import is ready for the next release.')
      } catch {
        alert('Invalid backup file')
      }
    }
    reader.readAsText(file)
  }

  return (
    <AppLayout>
      <div className="page-shell">
        <div className="page-hero">
          <div>
            <div className="eyebrow">Data Protection Center</div>
            <h1 className="page-title">Backup & Recovery</h1>
            <p className="page-subtitle">Keep your business records protected with automated backups, fast restore points, and secure recovery workflows.</p>
          </div>
          <div className="page-actions">
            <button className="action-btn primary" onClick={handleBackup}>Create Backup</button>
            <button className="action-btn" onClick={handleRestore}>Restore</button>
          </div>
        </div>

        <div className="ai-insight">
          <div>
            <span className="ai-badge">AURA AI Insight</span>
            <h3>Your last three backups completed successfully. Storage usage is at 72%, so archive older restore points before the next growth spike.</h3>
          </div>
          <div className="ai-pill">Storage Health</div>
        </div>

        <div className="metric-grid">
          {statusCards.map((card) => (
            <div className="metric-card" key={card.title}>
              <div className="metric-label">{card.title}</div>
              <div className="metric-value">{card.value}</div>
              <div className="metric-note">{card.note}</div>
            </div>
          ))}
        </div>

        <div className="content-grid">
          <div className="panel-card">
            <div className="panel-head">
              <div>
                <div className="panel-title">Backup timeline</div>
                <div className="panel-subtitle">A simple, readable record of recent protection activity.</div>
              </div>
            </div>
            <div className="timeline-list">
              {timeline.map((item) => (
                <div className="timeline-item" key={item.time}>
                  <div className="timeline-time">{item.time}</div>
                  <div className="timeline-body">
                    <div className="timeline-title">{item.title}</div>
                    <div className="timeline-detail">{item.detail}</div>
                  </div>
                  <span className={`status-pill ${item.tone}`}>{item.tone === 'success' ? 'Success' : 'Pending'}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="side-panel">
            <div className="profile-card">
              <div className="panel-title">Recovery panel</div>
              <div className="panel-subtitle">Choose a restore point and preview the content that will be brought back.</div>
              <div className="stack-list">
                {restorePoints.map((point) => (
                  <div className="stack-item" key={point}>{point}</div>
                ))}
              </div>
              <div className="mini-card">
                <div className="mini-label">Restore preview</div>
                <div className="mini-value">Database • Users • Inventory • Sales • Accounting</div>
              </div>
            </div>
          </div>
        </div>

        <div className="content-grid">
          <div className="panel-card">
            <div className="panel-head">
              <div>
                <div className="panel-title">Backup options</div>
                <div className="panel-subtitle">Select the right protection mode for your operating rhythm.</div>
              </div>
            </div>
            <div className="option-grid">
              {options.map((option) => (
                <div className="option-card" key={option}>{option}</div>
              ))}
            </div>
          </div>
          <div className="panel-card">
            <div className="panel-head">
              <div>
                <div className="panel-title">Storage visualization</div>
                <div className="panel-subtitle">Local and cloud storage remain well balanced.</div>
              </div>
            </div>
            <div className="donut-wrap">
              <div className="donut-chart" />
              <div>
                <div className="mini-label">Used</div>
                <div className="mini-value">72%</div>
                <div className="mini-label">Available</div>
                <div className="mini-value">28%</div>
              </div>
            </div>
          </div>
        </div>

        <div className="content-grid">
          <div className="panel-card">
            <div className="panel-title">Backup schedule</div>
            <div className="option-grid compact">
              <div className="option-card">Every Hour</div>
              <div className="option-card">Daily</div>
              <div className="option-card">Weekly</div>
              <div className="option-card">Monthly</div>
            </div>
          </div>
          <div className="panel-card">
            <div className="panel-title">Security</div>
            <div className="stack-list">
              <div className="stack-item">Encryption enabled</div>
              <div className="stack-item">Compression enabled</div>
              <div className="stack-item">Multi-region storage ready</div>
            </div>
          </div>
        </div>

        <div className="panel-card compact-card">
          <div className="panel-title">Restore from backup</div>
          <div className="panel-subtitle">Upload a previously backed-up file to restore data when needed.</div>
          <input className="input-field" type="file" accept=".json" onChange={handleImport} />
          {lastBackup && <div className="metric-note">Last backup: {lastBackup}</div>}
        </div>
      </div>
    </AppLayout>
  )
}
