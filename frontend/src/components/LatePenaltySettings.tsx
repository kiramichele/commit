'use client'
import { useState } from 'react'
import { api } from '@/lib/api'

interface LatePenaltySettings {
  late_submissions_allowed: boolean
  late_penalty_per_day: number
  late_penalty_max: number
}

interface Props {
  classroomId: string
  initial: LatePenaltySettings
}

export default function LatePenaltySettings({ classroomId, initial }: Props) {
  const [settings, setSettings] = useState<LatePenaltySettings>(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await api.patch(`/classrooms/${classroomId}/settings`, {
        late_submissions_allowed: settings.late_submissions_allowed,
        late_penalty_per_day: settings.late_penalty_per_day,
        late_penalty_max: settings.late_penalty_max,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: '8px',
    border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '14px',
    outline: 'none', boxSizing: 'border-box' as const,
    fontFamily: "'DM Sans', sans-serif", background: 'white',
  }

  const labelStyle = {
    display: 'block' as const, fontSize: '12px',
    fontWeight: 500 as const, color: '#0E2D6E', marginBottom: '5px',
  }

  // Preview calculation
  const previewPenalty = settings.late_penalty_per_day > 0
    ? Math.min(
        settings.late_penalty_per_day * 3,
        settings.late_penalty_max > 0 ? settings.late_penalty_max : Infinity
      )
    : 0

  return (
    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <h3 style={{ margin: '0 0 2px', fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>late submission policy</h3>
          <p style={{ margin: 0, fontSize: '12px', color: '#888780' }}>applies to all assignments unless overridden per assignment</p>
        </div>
      </div>

      {/* ALLOW LATE TOGGLE */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(14,45,110,0.08)', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#0E2D6E', marginBottom: '2px' }}>allow late submissions</div>
          <div style={{ fontSize: '12px', color: '#888780' }}>if off, students cannot submit after the due date</div>
        </div>
        <div
          onClick={() => setSettings(s => ({ ...s, late_submissions_allowed: !s.late_submissions_allowed }))}
          style={{ width: '40px', height: '22px', borderRadius: '99px', background: settings.late_submissions_allowed ? '#1A56DB' : '#D3D1C7', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s' }}
        >
          <div style={{ position: 'absolute', top: '3px', left: settings.late_submissions_allowed ? '21px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
        </div>
      </div>

      {/* PENALTY SETTINGS — only show if late is allowed */}
      {settings.late_submissions_allowed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>points off per day late</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={settings.late_penalty_per_day}
                onChange={e => setSettings(s => ({ ...s, late_penalty_per_day: parseFloat(e.target.value) || 0 }))}
                style={inputStyle}
              />
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#888780' }}>
                0 = no penalty
              </p>
            </div>
            <div>
              <label style={labelStyle}>maximum points off (cap)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={settings.late_penalty_max}
                onChange={e => setSettings(s => ({ ...s, late_penalty_max: parseFloat(e.target.value) || 0 }))}
                style={inputStyle}
                disabled={settings.late_penalty_per_day === 0}
              />
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#888780' }}>
                0 = no cap
              </p>
            </div>
          </div>

          {/* PREVIEW */}
          {settings.late_penalty_per_day > 0 && (
            <div style={{ padding: '10px 14px', background: '#F8F7F5', borderRadius: '8px', fontSize: '13px', color: '#5F5E5A', lineHeight: 1.7 }}>
              <strong style={{ color: '#0E2D6E' }}>example: </strong>
              student scores 85 and submits 3 days late →
              <strong style={{ color: '#991B1B' }}> -{previewPenalty} points</strong>
              {' '}= final grade of{' '}
              <strong style={{ color: '#0E2D6E' }}>{Math.max(0, 85 - previewPenalty)}</strong>
              {settings.late_penalty_max > 0 && previewPenalty >= settings.late_penalty_max && (
                <span style={{ color: '#888780' }}> (capped at -{settings.late_penalty_max})</span>
              )}
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        style={{ marginTop: '1.25rem', padding: '9px 20px', background: saved ? '#22C55E' : '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'background 0.2s' }}
      >
        {saving ? 'saving...' : saved ? '✓ saved!' : 'save policy'}
      </button>
    </div>
  )
}