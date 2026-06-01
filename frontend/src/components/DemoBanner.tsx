'use client'
// ============================================================
// COMMIT PLATFORM — DemoBanner
// ============================================================
// Yellow strip across the top of every page when the active
// profile has is_demo=true. Reminds the visitor they're in a
// sandbox and gives them a quick exit + "sign up for real" CTA.
// Mounted globally in the root layout via FeedbackButton's
// neighbor slot so we don't need to thread it into every page.
// ============================================================

import { useAuth } from '@/lib/auth-context'

export default function DemoBanner() {
  const { profile, logout } = useAuth()
  if (!profile?.is_demo) return null

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 998,
      background: 'linear-gradient(90deg, #FEF3C7 0%, #FDE68A 100%)',
      borderBottom: '1px solid rgba(245,158,11,0.4)',
      padding: '6px 14px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px',
      fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: '#854D0E',
      flexWrap: 'wrap',
    }}>
      <span style={{ fontWeight: 700 }}>🎬 you&apos;re in a demo sandbox</span>
      <span style={{ opacity: 0.8 }}>explore freely — nothing here is permanent</span>
      <button
        onClick={() => { logout(); window.location.href = '/' }}
        style={{
          padding: '4px 12px', borderRadius: '6px', border: '1px solid #854D0E',
          background: 'transparent', color: '#854D0E',
          fontSize: '11px', fontWeight: 700, cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        exit demo
      </button>
    </div>
  )
}
