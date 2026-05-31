'use client'
// ============================================================
// COMMIT PLATFORM — GroupPicker
// ============================================================
// Student-facing entry into a collab assignment. Two render modes:
//
//   1. Modal popup that takes over the screen on first open of a
//      collab assignment. Forces the student to acknowledge / pick
//      before falling through to the editor. Persisted dismiss via
//      localStorage so a page refresh doesn't reshow it.
//   2. Sticky banner above the editor after dismiss showing the
//      group + members + a "live" indicator forwarded from the
//      parent so we can tell at a glance if realtime is connected.
//
// We deliberately render *something* in every state — including
// errors — so that a missed migration or a permissions bug doesn't
// silently make the whole feature look turned off.
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
  // Forwarded from the parent so the banner can flash "live" /
  // "offline" — gives the student (and us, while debugging) a visible
  // signal that the realtime channel is actually attached.
  collabReady?: boolean
  collabMemberCount?: number
}

const STRATEGY_LABELS: Record<ResolvedCollabConfig['strategy'], string> = {
  random: 'random',
  similar_grade: 'grade-matched',
  opposite_grade: 'grade-mixed',
  manual: 'teacher-picked',
  student_choice: 'student-picked',
}

function dismissKey(assignmentId?: string, curriculumAssignmentId?: string) {
  return `commit_collab_seen_${assignmentId || curriculumAssignmentId || 'unknown'}`
}

export default function GroupPicker({
  classroomId, assignmentId, curriculumAssignmentId,
  onJoined, onGroupChange, collabReady, collabMemberCount,
}: Props) {
  const [config, setConfig] = useState<ResolvedCollabConfig | null>(null)
  const [myGroup, setMyGroup] = useState<Group | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)

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
      // First-open modal: show if collab is on AND we haven't shown
      // it before for this assignment. Persist dismiss across reloads.
      if (cfg?.enabled && typeof window !== 'undefined') {
        const seen = localStorage.getItem(dismissKey(assignmentId, curriculumAssignmentId))
        if (!seen) setShowModal(true)
      }
    } catch (err: any) {
      setError(err?.message || 'Could not load collab info.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [classroomId, assignmentId, curriculumAssignmentId])

  const dismissModal = () => {
    setShowModal(false)
    if (typeof window !== 'undefined') {
      localStorage.setItem(dismissKey(assignmentId, curriculumAssignmentId), '1')
    }
  }

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
      setError(err?.message || 'Could not create group.')
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
      setError(err?.message || 'Could not join group.')
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
      if (typeof window !== 'undefined') {
        localStorage.removeItem(dismissKey(assignmentId, curriculumAssignmentId))
      }
      await refresh()
    } catch (err: any) {
      setError(err?.message || 'Could not leave group.')
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
      setError(err?.message || 'Could not start solo.')
    } finally {
      setBusy(false)
    }
  }

  // ── Visible error banner if config / my-group failed to load. ──
  // Previously we returned null on error, which made it look like
  // collab was just off. Showing the message inline lets the
  // teacher / student see what's actually wrong (e.g. a missed
  // migration).
  if (error && !config) {
    return (
      <div style={{ padding: '10px 14px', background: '#FEE2E2', borderRadius: '8px', fontSize: '12px', color: '#991B1B', fontFamily: "'DM Sans', sans-serif" }}>
        couldn&apos;t load collab info: {error}
      </div>
    )
  }

  if (loading || !config || !config.enabled) {
    return null
  }

  const avatar = (name: string | null, url: string | null, size = 28) => {
    if (url) return <img src={url} alt="" style={{ width: `${size}px`, height: `${size}px`, borderRadius: '50%', objectFit: 'cover' }} />
    const initial = (name || '?').trim().charAt(0).toUpperCase()
    return (
      <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: '50%', background: '#EBF1FD', color: '#0E2D6E', fontSize: `${Math.round(size * 0.42)}px`, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initial}</div>
    )
  }

  const teacherDriven = config.strategy === 'random' || config.strategy === 'similar_grade' || config.strategy === 'opposite_grade' || config.strategy === 'manual'
  const openGroups = groups.filter(g => g.members.length < config.group_size)

  // ── Render the persistent banner that lives above the editor. ──
  const banner = (
    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '0.85rem 1rem', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: '#FEF3C7', color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>collab</span>
        {myGroup ? (
          <>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#0E2D6E' }}>
              {myGroup.name || 'Your group'} · {myGroup.members.length} / {config.group_size}
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {myGroup.members.map(m => (
                <div key={m.student_id} title={m.display_name || ''} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {avatar(m.display_name, m.avatar_url, 22)}
                  <span style={{ fontSize: '11px', color: '#5F5E5A' }}>{m.display_name || 'Student'}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <span style={{ fontSize: '13px', color: '#5F5E5A' }}>
            {teacherDriven && !config.allow_student_choice
              ? 'waiting on your teacher to assign you a group'
              : 'pick a group or work solo'}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Live indicator — green dot when realtime is connected,
              grey when it hasn't subscribed yet. Helps confirm at a
              glance that mouse + caret sync is actually wired up. */}
          {myGroup && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: collabReady ? '#22C55E' : '#D3D1C7', boxShadow: collabReady ? '0 0 0 3px rgba(34,197,94,0.15)' : 'none' }} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: collabReady ? '#166534' : '#888780' }}>
                {collabReady ? `live · ${collabMemberCount ?? myGroup.members.length}` : 'connecting...'}
              </span>
            </div>
          )}
          <button onClick={() => setShowModal(true)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1.5px solid rgba(14,45,110,0.15)', background: 'transparent', color: '#5F5E5A', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            {myGroup ? 'group details' : 'set up group'}
          </button>
        </div>
      </div>
      {error && <div style={{ marginTop: '8px', fontSize: '12px', color: '#B91C1C' }}>{error}</div>}
    </div>
  )

  // ── Modal popup content — pops on first open + when reopened ──
  const modal = (
    <div
      onClick={e => { if (e.target === e.currentTarget) dismissModal() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(14,45,110,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div style={{ background: 'white', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: '480px', fontFamily: "'DM Sans', sans-serif", boxShadow: '0 24px 64px rgba(14,45,110,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '99px', background: '#FEF3C7', color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>collab assignment</span>
          <button onClick={dismissModal} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#888780', lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <h2 style={{ margin: '4px 0 8px', fontSize: '17px', fontWeight: 700, color: '#0E2D6E' }}>
          {myGroup ? 'you\'re in a group!' : 'this is a group assignment'}
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#5F5E5A', lineHeight: 1.55 }}>
          Groups are <strong>{STRATEGY_LABELS[config.strategy]}</strong> · up to {config.group_size} students each. Everyone in the group edits the same code together; carets, mouse cursors, and changes sync live.
        </p>

        {myGroup ? (
          <div style={{ padding: '12px 14px', background: '#F8F7F5', borderRadius: '10px', marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#0E2D6E', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              {myGroup.name || 'Your group'} · {myGroup.members.length} / {config.group_size}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {myGroup.members.map(m => (
                <div key={m.student_id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {avatar(m.display_name, m.avatar_url, 32)}
                  <span style={{ fontSize: '13px', color: '#0E2D6E', fontWeight: 600 }}>{m.display_name || 'Student'}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {teacherDriven && !config.allow_student_choice && (
              <div style={{ padding: '14px', background: '#FEF9C3', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', color: '#854D0E', lineHeight: 1.55 }}>
                Your teacher is using a <strong>{STRATEGY_LABELS[config.strategy]}</strong> setup. Check back soon — once they assign you, your group will appear here.
              </div>
            )}

            {config.allow_student_choice && (
              <>
                {openGroups.length > 0 && (
                  <>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#888780', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '8px' }}>join an open group</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                      {openGroups.map(g => (
                        <div key={g.id} style={{ padding: '8px 12px', background: '#FAFAF8', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#0E2D6E' }}>{g.name || 'Unnamed group'}</span>
                            <span style={{ fontSize: '11px', color: '#888780' }}>{g.members.length} / {config.group_size}</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {g.members.map(m => (
                                <div key={m.student_id} title={m.display_name || ''}>{avatar(m.display_name, m.avatar_url, 22)}</div>
                              ))}
                            </div>
                          </div>
                          <button onClick={() => joinGroup(g.id)} disabled={busy} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: '#1A56DB', color: 'white', fontSize: '12px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>join</button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
                  <input
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    placeholder="optional name"
                    style={{ flex: 1, minWidth: '180px', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '13px', background: '#FAFAF8', fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
                  />
                  <button onClick={createGroup} disabled={busy} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#1A56DB', color: 'white', fontSize: '13px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>+ start a new group</button>
                </div>
              </>
            )}

            {config.allow_solo && (
              <div style={{ paddingTop: '12px', borderTop: '1px solid rgba(14,45,110,0.05)', marginBottom: '14px' }}>
                <button onClick={goSolo} disabled={busy} style={{ padding: '8px 14px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.15)', background: 'transparent', color: '#5F5E5A', fontSize: '13px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>○ work solo on this one</button>
              </div>
            )}
          </>
        )}

        {error && <div style={{ padding: '10px 14px', background: '#FEE2E2', borderRadius: '8px', fontSize: '12px', color: '#991B1B', marginBottom: '14px' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          {myGroup && (
            <button onClick={leaveGroup} disabled={busy} style={{ padding: '6px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.15)', background: 'transparent', color: '#5F5E5A', fontSize: '12px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              leave group
            </button>
          )}
          <button onClick={dismissModal} style={{ marginLeft: 'auto', padding: '9px 20px', borderRadius: '8px', border: 'none', background: '#1A56DB', color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            {myGroup ? 'start coding →' : 'got it'}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {banner}
      {showModal && modal}
    </>
  )
}
