'use client'
// ============================================================
// COMMIT PLATFORM — DemoButton
// ============================================================
// "Try a live demo" call-to-action for the marketing + login
// pages. Opens a small modal asking whether the visitor wants the
// teacher or student side, then POSTs /demo/start and drops them
// straight into the corresponding page with a fully-seeded demo
// classroom.
//
// The created session is sandboxed via the is_demo flag — see
// DemoBanner for the in-app callout, and migration 026 for the
// data model.
// ============================================================

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, saveSession } from '@/lib/api'

type Role = 'teacher' | 'student'

interface Props {
  /** Inline button label. Defaults to "Try a live demo →". */
  label?: string
  variant?: 'primary' | 'ghost'
}

export default function DemoButton({ label = 'Try a live demo →', variant = 'primary' }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<Role | null>(null)
  const [error, setError] = useState('')

  const start = async (role: Role) => {
    setBusy(role)
    setError('')
    try {
      const res = await api.post<{
        access_token: string
        refresh_token: string
        redirect_to: string
      }>(`/demo/start`, { role })
      saveSession(res.access_token, res.refresh_token)
      // Hard navigate so the AuthProvider re-fetches /auth/me with
      // the new tokens and the demo banner mounts.
      window.location.href = res.redirect_to
    } catch (err: any) {
      setError(err?.message || 'Could not start the demo. Try again in a moment.')
      setBusy(null)
    }
  }

  const buttonStyle: React.CSSProperties = variant === 'primary'
    ? {
        padding: '10px 22px', borderRadius: '8px', border: 'none',
        background: '#1A56DB', color: 'white',
        fontSize: '14px', fontWeight: 700, cursor: 'pointer',
        fontFamily: "'DM Sans', sans-serif",
      }
    : {
        padding: '8px 16px', borderRadius: '8px',
        border: '1.5px solid rgba(14,45,110,0.15)',
        background: 'transparent', color: '#0E2D6E',
        fontSize: '13px', fontWeight: 600, cursor: 'pointer',
        fontFamily: "'DM Sans', sans-serif",
      }

  return (
    <>
      <button onClick={() => { setError(''); setOpen(true) }} style={buttonStyle}>
        {label}
      </button>

      {open && (
        <div
          onClick={e => { if (e.target === e.currentTarget && !busy) setOpen(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(14,45,110,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div style={{ background: 'white', borderRadius: '16px', padding: '1.75rem', maxWidth: '460px', width: '100%', fontFamily: "'DM Sans', sans-serif", boxShadow: '0 24px 64px rgba(14,45,110,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C', textTransform: 'uppercase', letterSpacing: '0.06em' }}>live demo</span>
              <button onClick={() => !busy && setOpen(false)} disabled={!!busy} style={{ background: 'none', border: 'none', cursor: busy ? 'wait' : 'pointer', fontSize: '20px', color: '#888780', lineHeight: 1, padding: 0 }}>×</button>
            </div>
            <h2 style={{ margin: '6px 0 8px', fontSize: '18px', fontWeight: 700, color: '#0E2D6E' }}>which side do you want to see?</h2>
            <p style={{ margin: '0 0 18px', fontSize: '13px', color: '#5F5E5A', lineHeight: 1.55 }}>
              We&apos;ll spin up a fresh sandbox classroom seeded with a fake roster and one unit of curriculum. Poke around — nothing you do affects real data.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                onClick={() => start('teacher')}
                disabled={!!busy}
                style={{
                  padding: '18px 14px', borderRadius: '12px',
                  border: '2px solid #1A56DB', background: '#EBF1FD',
                  color: '#0C447C', cursor: busy ? 'wait' : 'pointer',
                  fontFamily: "'DM Sans', sans-serif", textAlign: 'left',
                }}
              >
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>👩‍🏫</div>
                <div style={{ fontSize: '14px', fontWeight: 700 }}>Teacher view</div>
                <div style={{ fontSize: '11px', color: '#5F5E5A', marginTop: '4px', lineHeight: 1.5 }}>
                  Roster, gradebook, grading queue, classroom controls.
                </div>
                {busy === 'teacher' && <div style={{ marginTop: '8px', fontSize: '11px', fontWeight: 600 }}>setting up...</div>}
              </button>
              <button
                onClick={() => start('student')}
                disabled={!!busy}
                style={{
                  padding: '18px 14px', borderRadius: '12px',
                  border: '2px solid #166534', background: '#DCFCE7',
                  color: '#166534', cursor: busy ? 'wait' : 'pointer',
                  fontFamily: "'DM Sans', sans-serif", textAlign: 'left',
                }}
              >
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>🧑‍💻</div>
                <div style={{ fontSize: '14px', fontWeight: 700 }}>Student view</div>
                <div style={{ fontSize: '11px', color: '#5F5E5A', marginTop: '4px', lineHeight: 1.5 }}>
                  Kanban, lessons, the coding editor with hints.
                </div>
                {busy === 'student' && <div style={{ marginTop: '8px', fontSize: '11px', fontWeight: 600 }}>setting up...</div>}
              </button>
            </div>

            {error && (
              <div style={{ marginTop: '14px', padding: '10px 14px', background: '#FEE2E2', borderRadius: '8px', fontSize: '12px', color: '#991B1B' }}>{error}</div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
