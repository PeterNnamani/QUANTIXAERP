'use client'

import { useState } from 'react'
import AppLayout from '@/components/layout/app-layout'

const categories = ['Finance', 'Inventory', 'Sales', 'Customers', 'Suppliers', 'Reports', 'AI Assistant']
const tutorials = [
    { title: 'Bank Reconciliation', type: 'Video', detail: 'Learn the fastest workflow for matching incoming payments.' },
    { title: 'Create a Journal Entry', type: 'Step-by-step', detail: 'Follow the guided checklist for a clean close process.' },
    { title: 'Tax Simulation', type: 'Interactive demo', detail: 'Test scenarios before filing and avoid surprises.' },
]
const faqs = [
    { question: 'How do I reverse a payment?', answer: 'Open the transaction from the ledger, choose reverse, and confirm the reason code.' },
    { question: 'How can I print a report?', answer: 'Open any report, select Print, and use the export preview to share or save it.' },
]

export default function UserGuidePage() {
    const [activeFaq, setActiveFaq] = useState<number | null>(0)

    return (
        <AppLayout>
            <div className="page-shell">
                <div className="page-hero">
                    <div>
                        <div className="eyebrow">Interactive Learning Center</div>
                        <h1 className="page-title">User Guide</h1>
                        <p className="page-subtitle">Learn every feature of the ERP platform with guided content, practical demos, and searchable help.</p>
                    </div>
                </div>

                <div className="ai-insight">
                    <div>
                        <span className="ai-badge">AURA AI Insight</span>
                        <h3>Your finance team has not explored the Bank Reconciliation tutorial yet. A short lesson could save hours during month-end.</h3>
                    </div>
                    <div className="ai-pill">Team Learning</div>
                </div>

                <div className="panel-card">
                    <div className="search-box">🔍 Search help articles...</div>
                    <div className="option-grid compact">
                        {categories.map((category) => (
                            <div className="option-card" key={category}>{category}</div>
                        ))}
                    </div>
                </div>

                <div className="panel-card">
                    <div className="panel-head">
                        <div>
                            <div className="panel-title">Featured tutorials</div>
                            <div className="panel-subtitle">A curated trail for new users and seasoned finance teams.</div>
                        </div>
                    </div>
                    <div className="option-grid">
                        {tutorials.map((tutorial) => (
                            <div className="option-card tutorial-card" key={tutorial.title}>
                                <div className="mini-label">{tutorial.type}</div>
                                <div className="mini-value">{tutorial.title}</div>
                                <div className="panel-subtitle">{tutorial.detail}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="content-grid">
                    <div className="panel-card">
                        <div className="panel-title">Frequently asked questions</div>
                        <div className="faq-list">
                            {faqs.map((faq, index) => (
                                <div className="faq-item" key={faq.question}>
                                    <button className="faq-question" onClick={() => setActiveFaq(activeFaq === index ? null : index)}>
                                        {faq.question}
                                    </button>
                                    {activeFaq === index && <div className="faq-answer">{faq.answer}</div>}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="side-panel">
                        <div className="profile-card">
                            <div className="panel-title">Keyboard shortcuts</div>
                            <div className="stack-list">
                                <div className="stack-item">Ctrl + N · New Sale</div>
                                <div className="stack-item">Ctrl + P · Print</div>
                                <div className="stack-item">Ctrl + F · Search</div>
                            </div>
                        </div>
                        <div className="mini-card">
                            <div className="mini-label">Contact support</div>
                            <div className="mini-value">Live Chat • WhatsApp • Email</div>
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    )
}
