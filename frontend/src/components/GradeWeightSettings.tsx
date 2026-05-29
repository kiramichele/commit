'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Weights {
  code: number
  activity: number
  checkin: number
  quiz: number
  project: number
  discussion: number
}

const TYPE_LABELS: Array<{ key: keyof Weights; label: string; desc: string }> = [
  { key: 'code',       label: 'Coding',                desc: 'Code assignments — write, run, submit' },
  { key: 'project',    label: 'Projects',              desc: 'Multi-step projects from the curriculum' },
  { key: 'quiz',       label: 'Quizzes',               desc: 'Short auto-graded knowledge checks' },
  { key: 'activity',   label: 'Interactive activities', desc: 'HTML activities with student responses' },
  { key: 'checkin',    label: 'Check-ins',             desc: 'Reflections, exit tickets, surveys' },
  { key: 'discussion', label: 'Discussion boards',     desc: 'Threaded posts and comments with peers' },
]

const DEFAULT_WEIGHTS: Weights = { code: 35, project: 35, quiz: 15, activity: 10, checkin: 5, discussion: 0 }

interface Props {
  classroomId: string
}

export default function GradeWeightSettings({ classroomId }: Props) {
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Weights>(`/classrooms/${classroomId}/grade-weights`)
      .then(w => setWeights({ ...DEFAULT_WEIGHTS, ...w }))
      .catch(() => setWeights(DEFAULT_WEIGHTS))
      .finally(() => setLoading(false))
  }, [classroomId])

  const total = weights.code + weights.activity + weights.checkin + weights.quiz + weights.project + weights.discussion
  const ok = total === 100

  const handleSave = async () => {
    if (!ok) {
      setError(`weights must add up to 100 (current total: ${total})`)
      return
    }
    setError('')
    setSaving(true)
    setSaved(false)
    try {
      await api.patch(`/classrooms/${classroomId}/grade-weights`, weights)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      setError(e.message || 'failed to save')
    } finally {
      setSaving(false)
    }
  }

  const resetDefaults = () => setWeights(DEFAULT_WEIGHTS)

  if (loading) return (
    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.5rem', color: '#888780', fontSize: '13px' }}>
      loading grade weights...
    </div>
  )

  return (
    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h3 style={{ margin: '0 0 2px', fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>grade weights</h3>
          <p style={{ margin: 0, fontSize: '12px', color: '#888780' }}>how much each assignment type counts toward the final grade. must sum to 100%.</p>
        </div>
        <button
          type="button"
          onClick={resetDefaults}
          style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(14,45,110,0.15)', background: 'transparent', fontSize: '12px', fontWeight: 600, color: '#5F5E5A', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
        >
          ↺ defaults
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1rem' }}>
        {TYPE_LABELS.map(({ key, label, desc }) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '8px', border: '1px solid rgba(14,45,110,0.08)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#0E2D6E' }}>{label}</div>
              <div style={{ fontSize: '12px', color: '#888780' }}>{desc}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <input
                type="number"
                min={0}
                max={100}
                value={weights[key]}
                onChange={e => setWeights(w => ({ ...w, [key]: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) }))}
                style={{ width: '64px', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '14px', textAlign: 'right', outline: 'none', boxSizing: 'border-box', fontFamily: "'DM Sans', sans-serif", background: 'white' }}
              />
              <span style={{ fontSize: '13px', color: '#888780', minWidth: '14px' }}>%</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: ok ? '#DCFCE7' : '#FEE2E2', marginBottom: '1rem' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: ok ? '#166534' : '#991B1B' }}>
          total: {total}% {ok ? '✓' : `— ${total > 100 ? 'over' : 'under'} by ${Math.abs(100 - total)}%`}
        </span>
      </div>

      {error && (
        <div style={{ marginBottom: '1rem', padding: '10px 14px', background: '#FEE2E2', borderRadius: '8px', fontSize: '13px', color: '#991B1B' }}>{error}</div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !ok}
        style={{ padding: '9px 20px', background: !ok ? '#D3D1C7' : saved ? '#22C55E' : '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: ok && !saving ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans', sans-serif", transition: 'background 0.2s' }}
      >
        {saving ? 'saving...' : saved ? '✓ saved!' : 'save weights'}
      </button>
    </div>
  )
}
