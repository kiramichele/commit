'use client'
// ============================================================
// COMMIT PLATFORM — GroupPicker
// ============================================================
// Student-facing picker that decides what shows up when the student
// first opens a collab assignment. Branches by resolved config:
//
//   - already in a group → show "you're in <Group X>" + members
//   - no group yet, student_choice on → list open groups + create btn
//   - no group yet, manual/random/grade → "waiting on your teacher"
//   - solo allowed → additional "work solo" button at the bottom
//
// Realtime editing comes in a future PR; for now this picker just
// reports the group and the assignment renderer can render the
// editor for any member.
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

export interface ResolvedCollabConfig {
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
  onJoined?: (group: Group) => void
  onGroupChange?: (group: Group | null) => void
}

export default function GroupPicker({ classroomId, assignmentId, curriculumAssignmentId, onJoined, onGroupChange }: Props) {
  const [config, setConfig] = useState<ResolvedCollabConfig | null>(null)
  const [myGroup, setMyGroup] = useState<Group | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [error, setError] = useState('')

  const queryString = (() => {
    const params: string[] = [`classroom_id=${classroomId}`]
    if (assignmentId) params.push(`assignment_id=${assignmentId}`)
    if (curriculumAssignmentId) params.push(`curriculum_assignment_id=${curriculumAssignmentId}`)
    return params.join('&')
  })()

  const refresh = async () => {
    try {
      const [cfg, mine, all] = await Promise.all([
        api.get<ResolvedCollabConfig>(`/groups/config?${queryString}`),
        api.get<Group | null>(`/groups/my-group?${queryString}`),
        api.get<Group[]>(`/groups/?${queryString}`),
      ])
      setConfig(cfg)
      setMyGroup(mine)
      setGroups(all || [])
      if (mine && onJoined) onJoined(mine)
      if (onGroupChange) onGroupChange(mine)
    } catch (err: any) {
      setError(err.message || 'Could not load groups.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [classroomId, assignmentId, curriculumAssignmentId])

  const createGroup = async () => {
    setBusy(true)
    setError('')
    try {
      await api.post(`/groups/`, {
        classroom_id: classroomId,
        assignment_id: assignmentId,
        curriculum_assignment_id: curriculumAssignmentId,
        name: newGroupName.trim() || null,
      })
      setNewGroupName('')
      await refresh()
    } catch (err: any) {
      setError(err.message || 'Could not create group.')
    } finally {
      setBusy(false)
    }
  }

  const joinGroup = async (groupId: string) => {
    setBusy(true)
    setError('')
    try {
      await api.post(`/groups/${groupId}/join`, {})
      await refresh()
    } catch (err: any) {
      setError(err.message || 'Could not join group.')
    } finally {
      setBusy(false)
    }
  }

  const leaveGroup = async () => {
    if (!myGroup) return
    if (!confirm('Leave this group?')) return
    setBusy(true)
    try {
      await api.post(`/groups/${myGroup.id}/leave`, {})
      setMyGroup(null)
      await refresh()
    } catch (err: any) {
      setError(err.message || 'Could not leave group.')
    } finally {
      setBusy(false)
    }
  }

  const goSolo = async () => {
    setBusy(true)
    setError('')
    try {
      await api.post(`/groups/solo`, {
        classroom_id: classroomId,
        assignment_id: assignmentId,
        curriculum_assignment_id: curriculumAssignmentId,
      })
      await refresh()
    } catch (err: any) {
      setError(err.message || 'Could not start solo.')
    } finally {
      setBusy(false)
    }
  }

  // Stay invisible until we know what to render. Most assignments
  // don't have collab on, so a flash of "loading groups..." would
  // look weird on the typical case.
  if (loading || !config || !config.enabled) {
    return null
  }

  const cardStyle: React.CSSProperties = { background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1rem 1.25rem' }
  const btnPrimary: React.CSSProperties = { padding: '7px 14px', borderRadius: '8px', border: 'none', background: '#1A56DB', color: 'white', fontSize: '13px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: "'DM Sans', sans-serif" }
  const btnGhost: React.CSSProperties = { padding: '6px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.15)', background: 'transparent', color: '#5F5E5A', fontSize: '12px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: "'DM Sans', sans-serif" }

  const avatar = (name: string | null, url: string | null) => {
    if (url) return <img src={url} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} />
    const initial = (name || '?').trim().charAt(0).toUpperCase()
    return (
      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#EBF1FD', color: '#0E2D6E', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initial}</div>
    )
  }

  // ── Already in a group ─────────────────────────────────────
  if (myGroup) {
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '8px' }}>group</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>{myGroup.name || 'Unnamed group'}</span>
            <span style={{ marginLeft: '8px', fontSize: '12px', color: '#888780' }}>{myGroup.members.length} / {config.group_size}</span>
          </div>
          <button onClick={leaveGroup} disabled={busy} style={btnGhost}>leave group</button>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {myGroup.members.map(m => (
            <div key={m.student_id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {avatar(m.display_name, m.avatar_url)}
              <span style={{ fontSize: '12px', color: '#0E2D6E', fontWeight: 500 }}>{m.display_name || 'Student'}</span>
            </div>
          ))}
        </div>
        {error && <div style={{ marginTop: '10px', fontSize: '12px', color: '#B91C1C' }}>{error}</div>}
      </div>
    )
  }

  // ── Not in a group yet ─────────────────────────────────────
  const teacherDriven = config.strategy === 'random' || config.strategy === 'similar_grade' || config.strategy === 'opposite_grade' || config.strategy === 'manual'
  const openGroups = groups.filter(g => g.members.length < config.group_size)

  return (
    <div style={cardStyle}>
      <div style={{ marginBottom: '10px' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: '#FEF3C7', color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>collab</span>
        <span style={{ marginLeft: '8px', fontSize: '13px', color: '#0E2D6E', fontWeight: 600 }}>
          this assignment is collaborative · groups of up to {config.group_size}
        </span>
      </div>

      {teacherDriven && !config.allow_student_choice && (
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#5F5E5A', lineHeight: 1.55 }}>
          Your teacher will assign you to a group. Check back in a bit, or message your teacher if you don&apos;t see one soon.
        </p>
      )}

      {config.allow_student_choice && (
        <>
          {openGroups.length > 0 && (
            <>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#888780', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '8px' }}>open groups</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                {openGroups.map(g => (
                  <div key={g.id} style={{ padding: '8px 12px', background: '#FAFAF8', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#0E2D6E' }}>{g.name || 'Unnamed group'}</span>
                      <span style={{ fontSize: '11px', color: '#888780' }}>{g.members.length} / {config.group_size}</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {g.members.map(m => (
                          <div key={m.student_id} title={m.display_name || ''}>
                            {avatar(m.display_name, m.avatar_url)}
                          </div>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => joinGroup(g.id)} disabled={busy} style={btnPrimary}>join</button>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              placeholder="optional name (e.g. 'team alpha')"
              style={{ flex: 1, minWidth: '180px', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '13px', background: '#FAFAF8', fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
            />
            <button onClick={createGroup} disabled={busy} style={btnPrimary}>+ create new group</button>
          </div>
        </>
      )}

      {config.allow_solo && (
        <div style={{ marginTop: config.allow_student_choice ? '12px' : 0, paddingTop: config.allow_student_choice ? '12px' : 0, borderTop: config.allow_student_choice ? '1px solid rgba(14,45,110,0.05)' : 'none' }}>
          <button onClick={goSolo} disabled={busy} style={{ ...btnGhost, padding: '8px 14px', fontSize: '13px' }}>○ work solo on this one</button>
        </div>
      )}

      {error && <div style={{ marginTop: '10px', fontSize: '12px', color: '#B91C1C' }}>{error}</div>}
    </div>
  )
}
