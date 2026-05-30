'use client'
// ============================================================
// COMMIT PLATFORM — CollabOverrideCard
// ============================================================
// Shared "collab settings" form used inside the teacher's assignment
// editor and the admin curriculum-assignment editor. Each field is
// nullable — null = inherit the classroom default. We render the
// classroom default text inline as a placeholder hint so the author
// can see what the inherited value will be.
// ============================================================

import { useState } from 'react'

export type CollabStrategy =
  | 'random'
  | 'similar_grade'
  | 'opposite_grade'
  | 'manual'
  | 'student_choice'

export interface CollabOverrides {
  collab_enabled?: boolean | null
  collab_group_size?: number | null
  collab_strategy?: CollabStrategy | null
  collab_allow_student_choice?: boolean | null
  collab_allow_solo?: boolean | null
}

interface ClassroomDefaults {
  collab_default_group_size?: number
  collab_default_strategy?: CollabStrategy
  collab_allow_student_choice?: boolean
  collab_allow_solo?: boolean
}

interface Props {
  value: CollabOverrides
  onChange: (next: CollabOverrides) => void
  classroomDefaults?: ClassroomDefaults
}

const STRATEGY_LABELS: Record<CollabStrategy, string> = {
  random: 'Random',
  similar_grade: 'By grade (similar)',
  opposite_grade: 'By grade (opposite)',
  manual: 'Manual (teacher picks)',
  student_choice: 'Student choice',
}

export default function CollabOverrideCard({ value, onChange, classroomDefaults }: Props) {
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: '#0E2D6E', marginBottom: '4px' }
  const input: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '13px', background: '#FAFAF8', fontFamily: "'DM Sans', sans-serif", outline: 'none', boxSizing: 'border-box' }

  const enabled = !!value.collab_enabled

  const defaultGroupSize = classroomDefaults?.collab_default_group_size ?? 2
  const defaultStrategy = classroomDefaults?.collab_default_strategy ?? 'random'
  const defaultAllowChoice = classroomDefaults?.collab_allow_student_choice ?? true
  const defaultAllowSolo = classroomDefaults?.collab_allow_solo ?? false

  return (
    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div>
          <h3 style={{ margin: '0 0 2px', fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>collaboration</h3>
          <p style={{ margin: 0, fontSize: '12px', color: '#888780' }}>
            Let students work on this assignment in groups. Leave fields blank to inherit classroom defaults.
          </p>
        </div>
        <button
          onClick={() => onChange({ ...value, collab_enabled: !enabled })}
          style={{ padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer', background: enabled ? '#DCFCE7' : '#FEF9C3', color: enabled ? '#166534' : '#854D0E', fontFamily: "'DM Sans', sans-serif" }}
        >
          {enabled ? 'enabled' : 'disabled'}
        </button>
      </div>

      {enabled && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>group size <span style={{ fontWeight: 400, color: '#888780' }}>(blank = classroom default: {defaultGroupSize})</span></label>
              <input
                type="number"
                min={1}
                max={6}
                value={value.collab_group_size ?? ''}
                placeholder={String(defaultGroupSize)}
                onChange={e => {
                  const raw = e.target.value
                  const v = raw === '' ? null : Math.max(1, Math.min(6, parseInt(raw, 10) || 0))
                  onChange({ ...value, collab_group_size: v })
                }}
                style={input}
              />
            </div>
            <div>
              <label style={labelStyle}>grouping strategy <span style={{ fontWeight: 400, color: '#888780' }}>(blank = {STRATEGY_LABELS[defaultStrategy]})</span></label>
              <select
                value={value.collab_strategy ?? ''}
                onChange={e => onChange({ ...value, collab_strategy: e.target.value ? (e.target.value as CollabStrategy) : null })}
                style={{ ...input, cursor: 'pointer' }}
              >
                <option value="">— inherit ({STRATEGY_LABELS[defaultStrategy]}) —</option>
                {(Object.keys(STRATEGY_LABELS) as CollabStrategy[]).map(s => (
                  <option key={s} value={s}>{STRATEGY_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(['collab_allow_student_choice', 'collab_allow_solo'] as const).map(key => {
              const fieldVal = value[key]
              const inherited = fieldVal == null
              const inheritedValue = key === 'collab_allow_student_choice' ? defaultAllowChoice : defaultAllowSolo
              const effective = inherited ? inheritedValue : !!fieldVal
              const label = key === 'collab_allow_student_choice'
                ? 'Students form their own groups'
                : 'Students can choose solo'
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', background: '#FAFAF8' }}>
                  <span style={{ flex: 1, fontSize: '12px', color: '#0E2D6E', fontWeight: 600 }}>{label}</span>
                  <select
                    value={inherited ? '' : (effective ? 'true' : 'false')}
                    onChange={e => {
                      const v = e.target.value
                      const next: boolean | null = v === '' ? null : v === 'true'
                      onChange({ ...value, [key]: next })
                    }}
                    style={{ ...input, width: 'auto', cursor: 'pointer', padding: '6px 10px', fontSize: '12px' }}
                  >
                    <option value="">— inherit ({inheritedValue ? 'on' : 'off'}) —</option>
                    <option value="true">on</option>
                    <option value="false">off</option>
                  </select>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
