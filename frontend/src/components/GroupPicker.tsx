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
  idea: string | null
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
  // When student_choice is on, the founder of a new group can put an
  // idea in here so other students pick the group by topic. Any
  // member can later edit it from the "you're in a group" view.
  const [newGroupIdea, setNewGroupIdea] = useState('')
  const [editingIdea, setEditingIdea] = useState(false)
  const [ideaDraft, setIdeaDraft] = useState('')
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)

  const queryString = (() => {
    const params: string[] = [`classroom_id=${classroomId}`]
    if (assignmentId) params.push(`assignment_id=${assignmentId}`)
    if (curriculumAssignmentId) params.push(`curriculum_assignment_id=${curriculumAssignmentId}`)
    return params.join('&')
  })()

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      // Sequential rather than Promise.all so we know exactly which
      // call failed when something does. /groups/config is also the
      // gate — if collab isn't enabled, we skip the rest entirely.
      let cfg: ResolvedCollabConfig
      try {
        cfg = await api.get<ResolvedCollabConfig>(`/groups/config?${queryString}`)
      } catch (e: any) {
        console.warn('[collab] /groups/config failed', e)
        throw e
      }
      setConfig(cfg)
      if (!cfg.enabled) {
        setLoading(false)
        return
      }

      try {
        const mine = await api.get<Group | null>(`/groups/my-group?${queryString}`)
        setMyGroup(mine)
        if (mine && onJoined) onJoined(mine)
        if (onGroupChange) onGroupChange(mine)
      } catch (e) {
        console.warn('[collab] /groups/my-group failed (continuing)', e)
      }
      try {
        const all = await api.get<Group[]>(`/groups?${queryString}`)
        console.log('[collab] groups for this assignment:', all, 'group_size cap:', cfg.group_size)
        setGroups(all || [])
      } catch (e: any) {
        console.warn('[collab] /groups/ list failed', e)
        // Surface this — losing the list silently is what makes the
        // modal look like "you have to create a new group" when
        // there's actually one already there.
        setError(`Couldn't load existing groups: ${e?.message || 'unknown error'}`)
      }

      // First-open modal: show if collab is on AND we haven't shown
      // it before for this assignment. Persist dismiss across reloads.
      if (cfg.enabled && typeof window !== 'undefined') {
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
      await api.post(`/groups`, {
        classroom_id: classroomId,
        assignment_id: assignmentId,
        curriculum_assignment_id: curriculumAssignmentId,
        name: newGroupName.trim() || null,
        idea: newGroupIdea.trim() || null,
      })
      setNewGroupName('')
      setNewGroupIdea('')
      await refresh()
    } catch (err: any) {
      setError(err?.message || 'Could not create group.')
    } finally {
      setBusy(false)
    }
  }

  const saveIdea = async () => {
    if (!myGroup) return
    setBusy(true)
    setError('')
    try {
      await api.patch(`/groups/${myGroup.id}`, { idea: ideaDraft })
      setEditingIdea(false)
      await refresh()
    } catch (err: any) {
      setError(err?.message || 'Could not update idea.')
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
    const isNetworkError = /failed to fetch|networkerror|load failed/i.test(error)
    return (
      <div style={{ padding: '12px 14px', background: '#FEE2E2', borderRadius: '8px', fontSize: '12px', color: '#991B1B', fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>couldn&apos;t load collab info: {error}</div>
            {isNetworkError && (
              <div style={{ fontSize: '11px', color: '#7F1D1D', lineHeight: 1.5 }}>
                The request didn&apos;t reach the backend. Usually one of:
                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                  <li>the API server is restarting / down</li>
                  <li>migration <strong>021_collab_groups.sql</strong> hasn&apos;t been applied (the <code>/groups/*</code> routes need it)</li>
                  <li>backend hasn&apos;t been deployed with the new <code>routers/groups.py</code> yet</li>
                </ul>
              </div>
            )}
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            style={{ padding: '5px 12px', borderRadius: '6px', border: '1.5px solid #991B1B', background: 'white', color: '#991B1B', fontSize: '11px', fontWeight: 600, cursor: loading ? 'wait' : 'pointer', whiteSpace: 'nowrap', fontFamily: "'DM Sans', sans-serif" }}
          >
            {loading ? '...' : 'retry'}
          </button>
        </div>
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
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0E2D6E' }}>
                {myGroup.name || 'Your group'} · {myGroup.members.length} / {config.group_size}
              </span>
              <span style={{ fontSize: '11px', color: myGroup.idea ? '#0C447C' : '#888780', fontStyle: myGroup.idea ? 'normal' : 'italic' }}>
                idea: {myGroup.idea || 'not sure yet'}
              </span>
            </div>
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

            {/* Idea — any member can set / edit. Empty shows "not
                sure yet" so the slot is always visible. */}
            <div style={{ marginBottom: '10px', padding: '8px 10px', background: 'white', borderRadius: '8px', border: '1px solid rgba(14,45,110,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: editingIdea ? '6px' : 0 }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.05em' }}>group idea</span>
                {!editingIdea && (
                  <button
                    onClick={() => { setIdeaDraft(myGroup.idea || ''); setEditingIdea(true) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1A56DB', fontSize: '11px', fontWeight: 600, padding: 0, fontFamily: "'DM Sans', sans-serif" }}
                  >
                    {myGroup.idea ? 'edit' : '+ add'}
                  </button>
                )}
              </div>
              {editingIdea ? (
                <>
                  <textarea
                    value={ideaDraft}
                    onChange={e => setIdeaDraft(e.target.value)}
                    rows={2}
                    placeholder="what's your group thinking? (anyone in the group can edit)"
                    autoFocus
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '12px', background: '#FAFAF8', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.55, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                  />
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '6px' }}>
                    <button onClick={() => setEditingIdea(false)} disabled={busy} style={{ padding: '4px 10px', borderRadius: '6px', border: '1.5px solid rgba(14,45,110,0.15)', background: 'transparent', color: '#5F5E5A', fontSize: '11px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>cancel</button>
                    <button onClick={saveIdea} disabled={busy} style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', background: '#1A56DB', color: 'white', fontSize: '11px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>save</button>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '13px', color: myGroup.idea ? '#0E2D6E' : '#888780', fontStyle: myGroup.idea ? 'normal' : 'italic', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {myGroup.idea || 'not sure yet'}
                </div>
              )}
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
                {/* Always render the "groups in your class" section so
                    the student can see existing groups (and know the
                    feature is working) even when they're all full.
                    Empty list gets an explicit message. */}
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#888780', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '8px' }}>
                  groups in your class · {groups.length}
                </div>
                {groups.length === 0 ? (
                  <div style={{ padding: '12px 14px', background: '#FAFAF8', borderRadius: '8px', fontSize: '12px', color: '#888780', marginBottom: '14px', fontStyle: 'italic' }}>
                    no groups yet — you can start the first one below.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                    {groups.map(g => {
                      const full = g.members.length >= config.group_size
                      return (
                        <div key={g.id} style={{ padding: '10px 12px', background: '#FAFAF8', borderRadius: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: '#0E2D6E' }}>{g.name || 'Unnamed group'}</span>
                              <span style={{ fontSize: '11px', color: full ? '#991B1B' : '#888780', fontWeight: full ? 700 : 400 }}>{g.members.length} / {config.group_size}{full ? ' · full' : ''}</span>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                {g.members.map(m => (
                                  <div key={m.student_id} title={m.display_name || ''}>{avatar(m.display_name, m.avatar_url, 22)}</div>
                                ))}
                              </div>
                            </div>
                            {full ? (
                              <span style={{ padding: '6px 10px', borderRadius: '8px', background: '#FEE2E2', color: '#991B1B', fontSize: '11px', fontWeight: 700 }}>full</span>
                            ) : (
                              <button onClick={() => joinGroup(g.id)} disabled={busy} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: '#1A56DB', color: 'white', fontSize: '12px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>join</button>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: g.idea ? '#0E2D6E' : '#888780', fontStyle: g.idea ? 'normal' : 'italic', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                            <span style={{ color: '#888780', fontWeight: 600, marginRight: '6px' }}>idea:</span>
                            {g.idea || 'not sure yet'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                <div style={{ padding: '12px', background: '#FAFAF8', borderRadius: '10px', marginBottom: '14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#888780', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '8px' }}>or start your own</div>
                  <input
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    placeholder="optional group name (e.g. 'team alpha')"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '13px', background: 'white', fontFamily: "'DM Sans', sans-serif", outline: 'none', boxSizing: 'border-box', marginBottom: '6px' }}
                  />
                  <textarea
                    value={newGroupIdea}
                    onChange={e => setNewGroupIdea(e.target.value)}
                    placeholder="what's your idea? other students see this when they pick a group — leave blank if you're not sure yet"
                    rows={2}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '13px', background: 'white', fontFamily: "'DM Sans', sans-serif", outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.55, marginBottom: '8px' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={createGroup} disabled={busy} style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: '#1A56DB', color: 'white', fontSize: '12px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>+ create group</button>
                  </div>
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
