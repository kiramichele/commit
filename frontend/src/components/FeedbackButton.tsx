'use client'
// ============================================================
// COMMIT PLATFORM — FeedbackButton
// ============================================================
// Floating action button in the bottom-right corner of every page
// that opens a small modal. Posts to /feedback/ — the backend
// auto-attaches profile id if Authorization is present, and emails
// the owner via Resend.
// ============================================================

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'

type Kind = 'bug' | 'feature' | 'general'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8888'

const KIND_OPTIONS: Array<{ value: Kind; label: string; emoji: string }> = [
  { value: 'bug',     label: 'bug report',     emoji: '🐛' },
  { value: 'feature', label: 'feature request', emoji: '✨' },
  { value: 'general', label: 'general',        emoji: '💬' },
]

export default function FeedbackButton() {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<Kind>('general')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [page, setPage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  // Auto-fill email from the logged-in profile every time the modal
  // opens (so it picks up the latest if they edited it).
  useEffect(() => {
    if (open) {
      if (profile?.email) setEmail(profile.email)
      if (typeof window !== 'undefined') setPage(window.location.pathname + window.location.search)
      setError('')
      setSent(false)
    }
  }, [open, profile?.email])

  const submit = async () => {
    const trimmed = message.trim()
    if (!trimmed) {
      setError('Message can\'t be empty.')
      return
    }
    setSending(true)
    setError('')
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('commit_access_token') : null
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`${API_URL}/feedback/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          kind,
          page,
          message: trimmed,
          email: email.trim() || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: 'Submit failed' }))
        throw new Error(body.detail || `Submit failed: ${res.status}`)
      }
      setSent(true)
      setMessage('')
      // Auto-close after a short delay so the success state is visible.
      setTimeout(() => setOpen(false), 1400)
    } catch (e: any) {
      setError(e?.message || 'Could not send feedback.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* FLOATING BUTTON */}
      <button
        onClick={() => setOpen(true)}
        aria-label="send feedback"
        title="send feedback"
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          background: '#1A56DB',
          color: 'white',
          border: 'none',
          boxShadow: '0 6px 20px rgba(14,45,110,0.25)',
          cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 28px rgba(14,45,110,0.3)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(14,45,110,0.25)' }}
      >
        💬
      </button>

      {/* MODAL */}
      {open && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(14,45,110,0.4)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: '20px' }}
        >
          <div
            style={{
              background: 'white', borderRadius: '14px', padding: '1.5rem',
              width: '100%', maxWidth: '380px',
              fontFamily: "'DM Sans', sans-serif",
              boxShadow: '0 20px 60px rgba(14,45,110,0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0E2D6E' }}>send feedback</h3>
              <button
                onClick={() => setOpen(false)}
                aria-label="close"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#888780', lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </div>

            {sent ? (
              <div style={{ padding: '24px 8px', textAlign: 'center', color: '#166534' }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>✓</div>
                <div style={{ fontWeight: 600 }}>thanks — sent!</div>
              </div>
            ) : (
              <>
                {/* TYPE */}
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#0E2D6E', marginBottom: '6px', letterSpacing: '0.02em' }}>type</label>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                  {KIND_OPTIONS.map(o => {
                    const active = kind === o.value
                    return (
                      <button
                        key={o.value}
                        onClick={() => setKind(o.value)}
                        style={{
                          flex: 1, padding: '8px 6px', borderRadius: '8px',
                          border: active ? '2px solid #1A56DB' : '1.5px solid rgba(14,45,110,0.12)',
                          background: active ? '#EBF1FD' : '#FAFAF8',
                          color: active ? '#0C447C' : '#5F5E5A',
                          cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                          fontSize: '11px', fontWeight: 600, lineHeight: 1.4,
                        }}
                      >
                        <div style={{ fontSize: '16px' }}>{o.emoji}</div>
                        {o.label}
                      </button>
                    )
                  })}
                </div>

                {/* PAGE (auto-filled, editable in case they want to redact) */}
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#0E2D6E', marginBottom: '6px' }}>page</label>
                <input
                  value={page}
                  onChange={e => setPage(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '12px', background: '#FAFAF8', color: '#5F5E5A', fontFamily: "'DM Mono', monospace", marginBottom: '12px', boxSizing: 'border-box', outline: 'none' }}
                />

                {/* MESSAGE */}
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#0E2D6E', marginBottom: '6px' }}>message</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={5}
                  placeholder={
                    kind === 'bug' ? 'What went wrong? What were you trying to do?'
                      : kind === 'feature' ? 'What would you love to see added?'
                      : 'What\'s on your mind?'
                  }
                  autoFocus
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '13px', background: '#FAFAF8', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.55, resize: 'vertical', boxSizing: 'border-box', outline: 'none', marginBottom: '12px' }}
                />

                {/* EMAIL */}
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#0E2D6E', marginBottom: '6px' }}>email <span style={{ fontWeight: 400, color: '#888780' }}>(optional)</span></label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="so we can reply"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '13px', background: '#FAFAF8', fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none', marginBottom: '12px' }}
                />

                {error && (
                  <div style={{ marginBottom: '10px', padding: '8px 12px', background: '#FEE2E2', borderRadius: '8px', fontSize: '12px', color: '#991B1B' }}>{error}</div>
                )}

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setOpen(false)}
                    style={{ padding: '8px 14px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.15)', background: 'transparent', color: '#5F5E5A', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                  >
                    cancel
                  </button>
                  <button
                    onClick={submit}
                    disabled={sending || !message.trim()}
                    style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: sending || !message.trim() ? '#93C5FD' : '#1A56DB', color: 'white', fontSize: '13px', fontWeight: 700, cursor: sending || !message.trim() ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                  >
                    {sending ? 'sending...' : 'send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
