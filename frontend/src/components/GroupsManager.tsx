'use client'
// ============================================================
// COMMIT PLATFORM — GroupsManager (teacher-side)
// ============================================================
// Modal shown when the teacher clicks "⚏ groups" on a collab-enabled
// assignment. Lets them:
//   - see the resolved collab config for this assignment
//   - regenerate groups with a strategy + size
//   - delete groups
//   - manually remove a student from a group
//
// Manual group composition + drag/drop UI is intentionally out of
// scope for v1 — teachers can fall back to "manual" strategy, which
// just clears existing groups; students then form their own from the
// picker.
// ============================================================

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Member {
  student_id: string
  display_name: string | null
  avatar_url: string | null
  joined_at: string
}

interface Group {
  id: string
  name: string | null
  formed_at: string
  members: Member[]
}

interface ResolvedConfig {
  enabled: boolean
  group_size: number
  strategy: 'random' | 'similar_grade' | 'opposite_grade' | 'manual' | 'student_choice'
  allow_student_choice: boolean
  allow_solo: boolean
}

interface Props {
  classroomId: string
  assignmentId?: string
  curriculumAssignmentId?: string
  onClose: () => void
}

const STRATEGIES: Array<{ value: ResolvedConfig['strategy']; label: string; desc: string }> = [
  { value: 'random',          label: 'Random',                desc: 'Shuffle students, fill groups in order.' },
  { value: 'similar_grade',   label: 'By grade (similar)',    desc: 'Pair students with the closest scores.' },
  { value: 'opposite_grade',  label: 'By grade (opposite)',   desc: 'Mix top + bottom scorers — peer teaching.' },
  { value: 'manual',          label: 'Manual',                desc: 'Clear groups so you can hand-assign.' },
  { value: 'student_choice',  label: 'Student choice',        desc: 'Clear groups so students self-form from the picker.' },
]

export default function GroupsManager({
  classroomId, assignmentId, curriculumAssignmentId, onClose,
}: Props) {
  const [config, setConfig] = useState<ResolvedConfig | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [strategy, setStrategy] = useState<ResolvedConfig['strategy']>('random')
  const [groupSize, setGroupSize] = useState<number>(2)
  const [error, setError] = useState('')

  const qs = (() => {
    const params = [`classroom_id=${classroomId}`]
    if (assignmentId) params.push(`assignment_id=${assignmentId}`)
    if (curriculumAssignmentId) params.push(`curriculum_assignment_id=${curriculumAssignmentId}`)
    return params.join('&')
  })()

  const refresh = async () => {
    try {
      const [cfg, all] = await Promise.all([
        api.get<ResolvedConfig>(`/groups/config?${qs}`),
        api.get<Group[]>(`/groups?${qs}`),
      ])
      setConfig(cfg)
      setStrategy(cfg.strategy)
      setGroupSize(cfg.group_size)
      setGroups(all || [])
    } catch (err: any) {
      setError(err.message || 'Could not load groups.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [classroomId, assignmentId, curriculumAssignmentId])

  const generate = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await api.post<{ created: number; strategy: string }>(`/groups/generate`, {
        classroom_id: classroomId,
        assignment_id: assignmentId,
        curriculum_assignment_id: curriculumAssignmentId,
        strategy,
        group_size: groupSize,
      })
      alert(`Generated ${res.created} group(s) using "${res.strategy}".`)
      await refresh()
    } catch (err: any) {
      setError(err.message || 'Could not generate groups.')
    } finally {
      setBusy(false)
    }
  }

  const fillRemaining = async () => {
    if (!confirm('Randomly place every student who hasn\'t joined a group yet? Existing groups stay as they are.')) return
    setBusy(true)
    setError('')
    try {
      const res = await api.post<{ placed: number }>(`/groups/fill-remaining`, {
        classroom_id: classroomId,
        assignment_id: assignmentId,
        curriculum_assignment_id: curriculumAssignmentId,
        strategy: 'random',
        group_size: groupSize,
      })
      alert(res.placed === 0 ? 'Everyone is already in a group.' : `Placed ${res.placed} student(s).`)
      await refresh()
    } catch (err: any) {
      setError(err.message || 'Could not fill remaining.')
    } finally {
      setBusy(false)
    }
  }

  const deleteGroup = async (groupId: string) => {
    if (!confirm('Delete this group? Members will go back to the picker.')) return
    setBusy(true)
    try {
      await api.delete(`/groups/${groupId}`)
      await refresh()
    } catch (err: any) {
      alert(err.message || 'Could not delete group.')
    } finally {
      setBusy(false)
    }
  }

  const removeMember = async (groupId: string, studentId: string) => {
    setBusy(true)
    try {
      await api.delete(`/groups/${groupId}/members/${studentId}`)
      await refresh()
    } catch (err: any) {
      alert(err.message || 'Could not remove member.')
    } finally {
      setBusy(false)
    }
  }

  const avatar = (name: string | null, url: string | null) => {
    if (url) return <img src={url} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />
    const initial = (name || '?').trim().charAt(0).toUpperCase()
    return (
      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#EBF1FD', color: '#0E2D6E', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initial}</div>
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(14,45,110,0.4)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: '14px', padding: '1.75rem', width: '100%', maxWidth: '640px', margin: 'auto', fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0E2D6E' }}>collaboration groups</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#888780' }}>×</button>
        </div>

        {loading ? (
          <p style={{ color: '#888780', fontSize: '13px' }}>loading...</p>
        ) : !config?.enabled ? (
          <p style={{ color: '#B91C1C', fontSize: '13px' }}>Collab isn&apos;t enabled on this assignment. Enable it in the assignment editor first.</p>
        ) : (
          <>
            {/* GENERATOR */}
            <div style={{ padding: '14px', background: '#F8F7F5', borderRadius: '10px', marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0E2D6E', marginBottom: '10px' }}>generate / regenerate</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px auto', gap: '8px', alignItems: 'end' }}>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 600, color: '#0E2D6E', display: 'block', marginBottom: '4px' }}>strategy</label>
                  <select
                    value={strategy}
                    onChange={e => setStrategy(e.target.value as ResolvedConfig['strategy'])}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '12px', background: 'white', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                  >
                    {STRATEGIES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 600, color: '#0E2D6E', display: 'block', marginBottom: '4px' }}>group size</label>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={groupSize}
                    onChange={e => setGroupSize(Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 2)))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '12px', background: 'white', fontFamily: "'DM Sans', sans-serif" }}
                  />
                </div>
                <button onClick={generate} disabled={busy} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#1A56DB', color: 'white', fontSize: '12px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                  {busy ? '...' : 'generate'}
                </button>
              </div>
              <div style={{ fontSize: '11px', color: '#888780', marginTop: '6px' }}>
                {STRATEGIES.find(s => s.value === strategy)?.desc}
              </div>
            </div>

            {/* FILL REMAINING — only really useful for student_choice,
                but we always expose it: it's a no-op if everyone is
                already in a group. */}
            <div style={{ padding: '12px 14px', background: '#FAFAF8', borderRadius: '10px', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0E2D6E' }}>students still floating?</div>
                <div style={{ fontSize: '11px', color: '#888780', lineHeight: 1.5 }}>
                  Randomly drop anyone who hasn&apos;t joined a group yet into one. Existing groups stay as-is.
                </div>
              </div>
              <button
                onClick={fillRemaining}
                disabled={busy}
                style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: '#0E7C66', color: 'white', fontSize: '12px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap' }}
              >
                fill remaining
              </button>
            </div>

            {/* GROUPS LIST */}
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0E2D6E', marginBottom: '8px' }}>
              {groups.length} group{groups.length === 1 ? '' : 's'} formed
            </div>
            {groups.length === 0 ? (
              <p style={{ color: '#888780', fontSize: '13px', padding: '1rem', textAlign: 'center', background: '#FAFAF8', borderRadius: '8px' }}>
                no groups yet — pick a strategy above or let students self-form.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {groups.map(g => (
                  <div key={g.id} style={{ padding: '10px 14px', background: '#FAFAF8', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#0E2D6E' }}>{g.name || 'Unnamed group'}</span>
                        <span style={{ marginLeft: '8px', fontSize: '11px', color: '#888780' }}>{g.members.length} / {config.group_size}</span>
                      </div>
                      <button onClick={() => deleteGroup(g.id)} disabled={busy} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#991B1B', fontSize: '11px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                        delete
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {g.members.map(m => (
                        <div key={m.student_id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 8px 3px 4px', background: 'white', borderRadius: '99px' }}>
                          {avatar(m.display_name, m.avatar_url)}
                          <span style={{ fontSize: '11px', color: '#0E2D6E', fontWeight: 500 }}>{m.display_name || 'Student'}</span>
                          <button onClick={() => removeMember(g.id, m.student_id)} disabled={busy} title="remove from group" style={{ background: 'none', border: 'none', cursor: busy ? 'wait' : 'pointer', color: '#888780', fontSize: '13px', padding: 0, lineHeight: 1 }}>×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div style={{ marginTop: '12px', padding: '10px 14px', background: '#FEE2E2', borderRadius: '8px', fontSize: '12px', color: '#991B1B' }}>{error}</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
