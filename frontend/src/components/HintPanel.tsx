'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'

interface Props {
  submissionId: string
  runCount: number
  hasEditedSinceRun: boolean
  hint1UnlockedAt: string | null
  hint2UnlockedAt: string | null
  onHintUsed?: () => void
}

interface HintResponse {
  hint: string
  level: number
  source: 'teacher' | 'ai'
}

export default function HintPanel({
  submissionId,
  runCount,
  hasEditedSinceRun,
  hint1UnlockedAt,
  hint2UnlockedAt,
  onHintUsed,
}: Props) {
  const [hint1, setHint1] = useState<string | null>(null)
  const [hint2, setHint2] = useState<string | null>(null)
  const [loading, setLoading] = useState<1 | 2 | null>(null)
  const [expanded, setExpanded] = useState(false)

  // Hint 1 available: 2+ runs AND edited between runs
  const hint1Available = runCount >= 2 && hasEditedSinceRun
  const hint1Used = !!hint1UnlockedAt
  const hint2Available = hint1Used
  const hint2Used = !!hint2UnlockedAt

  const totalHintsUsed = (hint1Used ? 1 : 0) + (hint2Used ? 1 : 0)

  const getHint = async (level: 1 | 2) => {
    setLoading(level)
    try {
      const data = await api.post<HintResponse>(
        `/code/${submissionId}/hint/${level}`, {}
      )
      if (level === 1) setHint1(data.hint)
      if (level === 2) setHint2(data.hint)
      setExpanded(true)
      onHintUsed?.()
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoading(null)
    }
  }

  // If no hints available or used yet, show locked state
  if (!hint1Available && !hint1Used) {
    return (
      <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#F8F7F5', border: '1px solid rgba(14,45,110,0.08)' }}>
        <div style={{ fontSize: '12px', color: '#888780', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>🔒</span>
          <span>hints unlock after running, editing, and running again</span>
        </div>
        {runCount > 0 && !hasEditedSinceRun && (
          <div style={{ fontSize: '11px', color: '#F59E0B', marginTop: '4px', fontWeight: 500 }}>
            ↑ edit your code then run again to unlock hints
          </div>
        )}
        {runCount === 0 && (
          <div style={{ fontSize: '11px', color: '#888780', marginTop: '4px' }}>
            run your code first
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ borderRadius: '8px', border: '1px solid rgba(245,158,11,0.3)', overflow: 'hidden', background: 'white' }}>

      {/* HEADER */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '10px 14px', background: '#FEF9C3', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: expanded ? '1px solid rgba(245,158,11,0.2)' : 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>💡</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#854D0E' }}>
            hints {totalHintsUsed > 0 ? `(${totalHintsUsed} used)` : '(unlocked)'}
          </span>
        </div>
        <span style={{ fontSize: '11px', color: '#854D0E' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* HINT 1 */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#854D0E', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              hint 1 — general nudge
            </div>
            {hint1 || hint1Used ? (
              hint1 ? (
                <div style={{ fontSize: '13px', color: '#5F5E5A', lineHeight: 1.7, padding: '10px 12px', background: '#FEF9C3', borderRadius: '6px', border: '1px solid rgba(245,158,11,0.2)' }}>
                  {hint1}
                </div>
              ) : (
                <button
                  onClick={() => getHint(1)}
                  disabled={loading === 1}
                  style={{ width: '100%', padding: '8px', background: '#FEF9C3', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: '#854D0E', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                >
                  {loading === 1 ? 'getting hint...' : 'show hint 1 (already used)'}
                </button>
              )
            ) : (
              <button
                onClick={() => getHint(1)}
                disabled={loading === 1 || !hint1Available}
                style={{ width: '100%', padding: '8px', background: hint1Available ? '#F59E0B' : '#F1EFE8', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: hint1Available ? 'white' : '#888780', cursor: hint1Available ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans', sans-serif" }}
              >
                {loading === 1 ? '⏳ generating hint...' : '💡 get hint 1'}
              </button>
            )}
          </div>

          {/* HINT 2 — only show once hint 1 is used */}
          {hint1Used && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#854D0E', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                hint 2 — more specific
              </div>
              {hint2 || hint2Used ? (
                hint2 ? (
                  <div style={{ fontSize: '13px', color: '#5F5E5A', lineHeight: 1.7, padding: '10px 12px', background: '#FEF9C3', borderRadius: '6px', border: '1px solid rgba(245,158,11,0.2)' }}>
                    {hint2}
                  </div>
                ) : (
                  <button
                    onClick={() => getHint(2)}
                    disabled={loading === 2}
                    style={{ width: '100%', padding: '8px', background: '#FEF9C3', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: '#854D0E', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                  >
                    {loading === 2 ? 'getting hint...' : 'show hint 2 (already used)'}
                  </button>
                )
              ) : (
                <button
                  onClick={() => getHint(2)}
                  disabled={loading === 2}
                  style={{ width: '100%', padding: '8px', background: '#F59E0B', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: 'white', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                >
                  {loading === 2 ? '⏳ generating hint...' : '💡 get hint 2'}
                </button>
              )}
            </div>
          )}

          <p style={{ margin: 0, fontSize: '11px', color: '#888780', fontStyle: 'italic' }}>
            hint usage is visible to your teacher
          </p>
        </div>
      )}
    </div>
  )
}