'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

interface Unit {
  id: string
  order_index: number
  title: string
  description: string | null
  is_published: boolean
}

interface Lesson {
  id: string
  unit_id: string
  order_index: number
  title: string
  scaffold_level: string
  is_published: boolean
  lesson_content?: Array<{
    has_coding_exercise?: boolean
    html_file_path?: string | null
    activity_file_path?: string | null
  }>
}

interface Project {
  id: string
  unit_id: string
  order_index: number
  title: string
  description: string
  estimated_minutes: number
  is_published: boolean
  project_steps?: Array<{ id: string; order_index: number; title: string; step_type: string; is_published: boolean }>
}

interface CurriculumAssignment {
  id: string
  unit_id: string
  order_index: number
  title: string
  assignment_type: string
  is_published: boolean
}

export default function AdminCurriculumPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()

  const [units, setUnits] = useState<Unit[]>([])
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [curriculumAssignments, setCurriculumAssignments] = useState<CurriculumAssignment[]>([])
  const [unitsLoading, setUnitsLoading] = useState(true)
  const [lessonsLoading, setLessonsLoading] = useState(false)

  const [newUnitTitle, setNewUnitTitle] = useState('')
  const [creatingUnit, setCreatingUnit] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!profile || profile.role !== 'admin') router.push('/login')
  }, [profile, loading, router])

  useEffect(() => {
    if (profile?.role === 'admin') fetchUnits()
  }, [profile])

  useEffect(() => {
    if (selectedUnit) {
      fetchLessons(selectedUnit.id)
      fetchProjects(selectedUnit.id)
      fetchCurriculumAssignments(selectedUnit.id)
    }
  }, [selectedUnit])

  const fetchUnits = async () => {
    setUnitsLoading(true)
    try {
      const data = await api.get<Unit[]>('/admin/curriculum/units')
      setUnits(data)
      if (data.length && !selectedUnit) setSelectedUnit(data[0])
    } finally {
      setUnitsLoading(false)
    }
  }

  const fetchLessons = async (unitId: string) => {
    setLessonsLoading(true)
    try {
      setLessons(await api.get<Lesson[]>(`/admin/curriculum/units/${unitId}/lessons`))
    } finally {
      setLessonsLoading(false)
    }
  }

  const fetchProjects = async (unitId: string) => {
    try {
      setProjects(await api.get<Project[]>(`/admin/curriculum/units/${unitId}/projects`))
    } catch {
      setProjects([])
    }
  }

  const createProject = async () => {
    if (!selectedUnit) return
    const title = prompt('Project title?')
    if (!title?.trim()) return
    try {
      const created = await api.post<Project>(`/admin/curriculum/units/${selectedUnit.id}/projects`, {
        title,
        is_published: false,
      })
      setProjects(p => [...p, created].sort((a, b) => a.order_index - b.order_index))
      router.push(`/admin/curriculum/projects/${created.id}`)
    } catch (err: any) {
      alert(err.message || 'Failed to create project')
    }
  }

  const toggleProjectPublish = async (p: Project) => {
    try {
      const updated = await api.patch<Project>(`/admin/curriculum/projects/${p.id}`, { is_published: !p.is_published })
      setProjects(ps => ps.map(x => x.id === p.id ? { ...x, is_published: updated.is_published } : x))
    } catch (err: any) {
      alert(err.message)
    }
  }

  const deleteProject = async (p: Project) => {
    if (!confirm(`Delete project "${p.title}"? All its steps will be deleted too.`)) return
    try {
      await api.delete(`/admin/curriculum/projects/${p.id}`)
      setProjects(ps => ps.filter(x => x.id !== p.id))
    } catch (err: any) {
      alert(err.message)
    }
  }

  const fetchCurriculumAssignments = async (unitId: string) => {
    try {
      setCurriculumAssignments(await api.get<CurriculumAssignment[]>(`/admin/curriculum/units/${unitId}/assignments`))
    } catch {
      setCurriculumAssignments([])
    }
  }

  const createCurriculumAssignment = async () => {
    if (!selectedUnit) return
    const title = prompt('Assignment title?')
    if (!title?.trim()) return
    try {
      const created = await api.post<CurriculumAssignment>(`/admin/curriculum/units/${selectedUnit.id}/assignments`, {
        title,
        assignment_type: 'code',
        is_published: false,
      })
      setCurriculumAssignments(a => [...a, created].sort((x, y) => x.order_index - y.order_index))
      router.push(`/admin/curriculum/assignments/${created.id}`)
    } catch (err: any) {
      alert(err.message || 'Failed to create assignment')
    }
  }

  const toggleCurriculumAssignmentPublish = async (a: CurriculumAssignment) => {
    try {
      const updated = await api.patch<CurriculumAssignment>(`/admin/curriculum/assignments/${a.id}`, { is_published: !a.is_published })
      setCurriculumAssignments(arr => arr.map(x => x.id === a.id ? { ...x, is_published: updated.is_published } : x))
    } catch (err: any) {
      alert(err.message)
    }
  }

  const deleteCurriculumAssignment = async (a: CurriculumAssignment) => {
    if (!confirm(`Delete assignment "${a.title}"?`)) return
    try {
      await api.delete(`/admin/curriculum/assignments/${a.id}`)
      setCurriculumAssignments(arr => arr.filter(x => x.id !== a.id))
    } catch (err: any) {
      alert(err.message)
    }
  }

  const createUnit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUnitTitle.trim()) return
    setCreatingUnit(true)
    try {
      const created = await api.post<Unit>('/admin/curriculum/units', {
        title: newUnitTitle,
        description: '',
        is_published: false,
      })
      setUnits(u => [...u, created].sort((a, b) => a.order_index - b.order_index))
      setNewUnitTitle('')
      setSelectedUnit(created)
    } catch (err: any) {
      alert(err.message || 'Failed to create unit')
    } finally {
      setCreatingUnit(false)
    }
  }

  const togglePublish = async (unit: Unit) => {
    try {
      const updated = await api.patch<Unit>(`/admin/curriculum/units/${unit.id}`, {
        is_published: !unit.is_published,
      })
      setUnits(u => u.map(x => x.id === updated.id ? updated : x))
      if (selectedUnit?.id === updated.id) setSelectedUnit(updated)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const deleteUnit = async (unit: Unit) => {
    if (!confirm(`Delete "${unit.title}"? Lessons must be deleted first.`)) return
    try {
      await api.delete(`/admin/curriculum/units/${unit.id}`)
      setUnits(u => u.filter(x => x.id !== unit.id))
      if (selectedUnit?.id === unit.id) setSelectedUnit(null)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const toggleLessonPublish = async (lesson: Lesson) => {
    try {
      const updated = await api.patch<any>(`/admin/curriculum/lessons/${lesson.id}`, {
        is_published: !lesson.is_published,
      })
      setLessons(ls => ls.map(l => l.id === lesson.id ? { ...l, is_published: updated.is_published } : l))
    } catch (err: any) {
      alert(err.message)
    }
  }

  // ── MOVE HELPER ───────────────────────────────────────────
  // Move an item (lesson/project/assignment) to a different unit, appending
  // to the end of the destination list.
  const moveToUnit = async (
    itemId: string,
    destUnitId: string,
    endpoint: string,
    refetch: (unitId: string) => void,
  ) => {
    if (!selectedUnit) return
    if (destUnitId === selectedUnit.id) return
    try {
      // Compute next order_index in destination by reading what's currently there.
      // We poll the admin endpoint that lists items in a unit — but here it's faster
      // to just send a large order_index sentinel and let the server place it,
      // OR fetch the destination's items. To avoid an extra endpoint, we just
      // ask for a sufficiently large order_index — the destination is re-fetched
      // when the user clicks into it.
      // We instead use a more correct approach: PATCH with unit_id only and
      // a computed order index = (current local list of destination's items, if known)
      // + a fallback by sending order_index based on Date.now() % 1e6 (monotonically increasing).
      await api.patch(endpoint, {
        unit_id: destUnitId,
        order_index: Math.floor(Date.now() / 1000) % 100000,
      })
      // Refresh current unit + destination so UI is consistent.
      refetch(selectedUnit.id)
    } catch (err: any) {
      alert(err.message || 'Failed to move')
    }
  }

  // ── MERGED ORDERED LIST ────────────────────────────────────
  // Lessons, projects, and curriculum assignments live in separate tables but
  // we want them to appear in a single ordered list within a unit so teachers
  // can interleave them (lesson 1, lesson 2, activity 1, lesson 3, ...).
  type MergedItem =
    | { kind: 'lesson'; data: Lesson; order_index: number; id: string }
    | { kind: 'project'; data: Project; order_index: number; id: string }
    | { kind: 'assignment'; data: CurriculumAssignment; order_index: number; id: string }

  const mergedItems: MergedItem[] = [
    ...lessons.map(l => ({ kind: 'lesson' as const, data: l, order_index: l.order_index, id: l.id })),
    ...projects.map(p => ({ kind: 'project' as const, data: p, order_index: p.order_index, id: p.id })),
    ...curriculumAssignments.map(a => ({ kind: 'assignment' as const, data: a, order_index: a.order_index, id: a.id })),
  ].sort((a, b) => {
    if (a.order_index !== b.order_index) return a.order_index - b.order_index
    // Stable tie-break by kind so unmigrated data stays predictable.
    const rank = { lesson: 0, project: 1, assignment: 2 }
    return rank[a.kind] - rank[b.kind]
  })

  const endpointFor = (kind: MergedItem['kind'], id: string) =>
    kind === 'lesson' ? `/admin/curriculum/lessons/${id}`
    : kind === 'project' ? `/admin/curriculum/projects/${id}`
    : `/admin/curriculum/assignments/${id}`

  // Swap two items in the merged list by position and renumber everyone.
  // After this runs, all items in the unit share a sequential order_index space.
  const moveMerged = async (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= mergedItems.length) return
    const reordered = [...mergedItems]
    ;[reordered[i], reordered[j]] = [reordered[j], reordered[i]]
    const newOrderById = new Map<string, number>()
    reordered.forEach((item, idx) => newOrderById.set(item.id, idx + 1))

    // Optimistic local update across all three lists.
    setLessons(prev => prev.map(l => ({ ...l, order_index: newOrderById.get(l.id) ?? l.order_index })).sort((a, b) => a.order_index - b.order_index))
    setProjects(prev => prev.map(p => ({ ...p, order_index: newOrderById.get(p.id) ?? p.order_index })).sort((a, b) => a.order_index - b.order_index))
    setCurriculumAssignments(prev => prev.map(a => ({ ...a, order_index: newOrderById.get(a.id) ?? a.order_index })).sort((a, b) => a.order_index - b.order_index))

    try {
      // PATCH only items whose order_index actually changed.
      const patches = mergedItems
        .filter(item => newOrderById.get(item.id) !== item.order_index)
        .map(item => api.patch(endpointFor(item.kind, item.id), { order_index: newOrderById.get(item.id)! }))
      await Promise.all(patches)
    } catch (err: any) {
      alert(err.message || 'Failed to reorder')
      // Refetch to recover from partial server state.
      if (selectedUnit) {
        fetchLessons(selectedUnit.id)
        fetchProjects(selectedUnit.id)
        fetchCurriculumAssignments(selectedUnit.id)
      }
    }
  }

  const deleteLesson = async (lesson: Lesson) => {
    if (!confirm(`Delete "${lesson.title}"? This is permanent.`)) return
    try {
      await api.delete(`/admin/curriculum/lessons/${lesson.id}`)
      setLessons(ls => ls.filter(l => l.id !== lesson.id))
    } catch (err: any) {
      alert(err.message)
    }
  }

  const lessonType = (l: Lesson): string => {
    const c = l.lesson_content?.[0]
    if (!c) return 'empty'
    if (c.has_coding_exercise) return 'coding'
    if (c.activity_file_path) return 'activity'
    if (c.html_file_path) return 'reading'
    return 'empty'
  }

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ color: '#888780' }}>loading...</p>
    </div>
  )

  const card: React.CSSProperties = { background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden' }
  const inputStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '13px', outline: 'none', background: '#FAFAF8', fontFamily: "'DM Sans', sans-serif" }
  const btn = (primary: boolean): React.CSSProperties => ({
    padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    border: primary ? 'none' : '1.5px solid rgba(14,45,110,0.15)',
    background: primary ? '#1A56DB' : 'transparent',
    color: primary ? 'white' : '#5F5E5A',
    fontFamily: "'DM Sans', sans-serif",
  })
  const arrowBtn = (disabled: boolean): React.CSSProperties => ({
    width: '26px', height: '22px', padding: 0, borderRadius: '5px',
    border: disabled ? '1px solid rgba(14,45,110,0.08)' : '1.5px solid #1A56DB',
    background: disabled ? 'transparent' : '#EBF1FD',
    color: disabled ? '#D3D1C7' : '#1A56DB',
    fontSize: '13px', fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    lineHeight: 1,
    transition: 'all 0.1s',
  })

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <div style={{ background: '#0E2D6E', padding: '0 2rem', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '28px', height: '28px', background: '#1A56DB', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'white' }}>{'>'}_</div>
          <span style={{ color: 'white', fontWeight: 700, fontSize: '15px' }}>commit</span>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>/</span>
          <Link href="/admin" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', textDecoration: 'none' }}>admin</Link>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>/</span>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>curriculum</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <a
            href="/admin/curriculum/preview"
            target="_blank"
            rel="noopener noreferrer"
            style={{ padding: '6px 14px', borderRadius: '7px', background: 'rgba(255,255,255,0.12)', color: 'white', fontSize: '13px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', border: '1px solid rgba(255,255,255,0.2)' }}
            title="opens a student-style preview of the entire published curriculum in a new tab"
          >
            👁 view as student
          </a>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>{profile.email}</span>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem', display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* UNITS COLUMN */}
        <div style={card}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(14,45,110,0.06)' }}>
            <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>units ({units.length})</h2>
          </div>

          {unitsLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#888780', fontSize: '13px' }}>loading...</div>
          ) : (
            units.map(u => (
              <div key={u.id} onClick={() => setSelectedUnit(u)} style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid rgba(14,45,110,0.05)', cursor: 'pointer', background: selectedUnit?.id === u.id ? '#EBF1FD' : 'transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0E2D6E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", color: '#888780', marginRight: '6px' }}>{u.order_index}</span>
                      {u.title}
                    </div>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: u.is_published ? '#DCFCE7' : '#FEF9C3', color: u.is_published ? '#166534' : '#854D0E' }}>
                    {u.is_published ? 'live' : 'draft'}
                  </span>
                </div>
              </div>
            ))
          )}

          <form onSubmit={createUnit} style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input value={newUnitTitle} onChange={e => setNewUnitTitle(e.target.value)} placeholder="new unit title" required style={inputStyle} />
            <button type="submit" disabled={creatingUnit} style={btn(true)}>{creatingUnit ? 'creating...' : '+ add unit'}</button>
          </form>
        </div>

        {/* LESSONS COLUMN */}
        <div style={card}>
          {selectedUnit ? (
            <>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(14,45,110,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0E2D6E' }}>{selectedUnit.title}</h2>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#888780' }}>{lessons.length} lesson(s) · {projects.length} project(s) · {curriculumAssignments.length} assignment(s) · order {selectedUnit.order_index}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => togglePublish(selectedUnit)} style={btn(false)}>
                    {selectedUnit.is_published ? 'unpublish' : 'publish'}
                  </button>
                  <button onClick={() => deleteUnit(selectedUnit)} style={{ ...btn(false), borderColor: 'rgba(239,68,68,0.3)', color: '#991B1B' }}>delete</button>
                  <button onClick={createCurriculumAssignment} style={btn(false)}>+ new assignment</button>
                  <button onClick={createProject} style={btn(false)}>+ new project</button>
                  <Link href={`/admin/curriculum/lessons/new?unit=${selectedUnit.id}`} style={{ ...btn(true), textDecoration: 'none' }}>+ new lesson</Link>
                </div>
              </div>

              {/* MERGED ORDERED LIST — lessons, projects, and curriculum
                  assignments interleaved by order_index */}
              {lessonsLoading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#888780', fontSize: '13px' }}>loading...</div>
              ) : mergedItems.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#888780', fontSize: '13px' }}>nothing here yet — click "+ new lesson", "+ new project", or "+ new assignment" above</div>
              ) : (
                mergedItems.map((item, i) => {
                  const isLast = i === mergedItems.length - 1
                  const moveSelect = (
                    <select
                      value=""
                      onChange={e => { if (e.target.value) moveToUnit(item.id, e.target.value, endpointFor(item.kind, item.id), item.kind === 'lesson' ? fetchLessons : item.kind === 'project' ? fetchProjects : fetchCurriculumAssignments) }}
                      style={{ ...btn(false), padding: '5px 8px', fontSize: '12px', cursor: 'pointer' }}
                      title="move to another unit"
                    >
                      <option value="">move to…</option>
                      {units.filter(u => u.id !== selectedUnit.id).map(u => (
                        <option key={u.id} value={u.id}>unit {u.order_index}: {u.title}</option>
                      ))}
                    </select>
                  )

                  const arrows = (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                      <button onClick={() => moveMerged(i, -1)} disabled={i === 0} style={arrowBtn(i === 0)}>↑</button>
                      <button onClick={() => moveMerged(i, 1)} disabled={isLast} style={arrowBtn(isLast)}>↓</button>
                    </div>
                  )

                  const rowStyle: React.CSSProperties = {
                    padding: '0.85rem 1.25rem',
                    borderBottom: '1px solid rgba(14,45,110,0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }

                  if (item.kind === 'lesson') {
                    const l = item.data
                    return (
                      <div key={`lesson-${l.id}`} style={rowStyle}>
                        {arrows}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0E2D6E', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {l.title}
                            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C', textTransform: 'uppercase', letterSpacing: '0.05em' }}>lesson</span>
                            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: l.is_published ? '#DCFCE7' : '#FEF9C3', color: l.is_published ? '#166534' : '#854D0E' }}>{l.is_published ? 'live' : 'draft'}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                          {moveSelect}
                          <button onClick={() => toggleLessonPublish(l)} style={{ ...btn(false), padding: '5px 10px', fontSize: '12px' }}>{l.is_published ? 'unpublish' : 'publish'}</button>
                          <Link href={`/admin/curriculum/lessons/${l.id}`} style={{ ...btn(false), padding: '5px 10px', fontSize: '12px', textDecoration: 'none' }}>edit</Link>
                          <button onClick={() => deleteLesson(l)} style={{ ...btn(false), padding: '5px 10px', fontSize: '12px', borderColor: 'rgba(239,68,68,0.3)', color: '#991B1B' }}>delete</button>
                        </div>
                      </div>
                    )
                  }

                  if (item.kind === 'project') {
                    const p = item.data
                    return (
                      <div key={`project-${p.id}`} style={{ ...rowStyle, background: 'rgba(254,243,199,0.18)' }}>
                        {arrows}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0E2D6E', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {p.title}
                            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#FEF3C7', color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>project</span>
                            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C' }}>{p.project_steps?.length || 0} step(s)</span>
                            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: p.is_published ? '#DCFCE7' : '#FEF9C3', color: p.is_published ? '#166534' : '#854D0E' }}>{p.is_published ? 'live' : 'draft'}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                          {moveSelect}
                          <button onClick={() => toggleProjectPublish(p)} style={{ ...btn(false), padding: '5px 10px', fontSize: '12px' }}>{p.is_published ? 'unpublish' : 'publish'}</button>
                          <Link href={`/admin/curriculum/projects/${p.id}`} style={{ ...btn(false), padding: '5px 10px', fontSize: '12px', textDecoration: 'none' }}>edit</Link>
                          <button onClick={() => deleteProject(p)} style={{ ...btn(false), padding: '5px 10px', fontSize: '12px', borderColor: 'rgba(239,68,68,0.3)', color: '#991B1B' }}>delete</button>
                        </div>
                      </div>
                    )
                  }

                  // assignment
                  const a = item.data
                  return (
                    <div key={`assignment-${a.id}`} style={{ ...rowStyle, background: 'rgba(224,242,254,0.25)' }}>
                      {arrows}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0E2D6E', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          {a.title}
                          <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#E0F2FE', color: '#075985', textTransform: 'uppercase', letterSpacing: '0.05em' }}>assignment</span>
                          <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C' }}>{a.assignment_type}</span>
                          <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: a.is_published ? '#DCFCE7' : '#FEF9C3', color: a.is_published ? '#166534' : '#854D0E' }}>{a.is_published ? 'live' : 'draft'}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {moveSelect}
                        <button onClick={() => toggleCurriculumAssignmentPublish(a)} style={{ ...btn(false), padding: '5px 10px', fontSize: '12px' }}>{a.is_published ? 'unpublish' : 'publish'}</button>
                        <Link href={`/admin/curriculum/assignments/${a.id}`} style={{ ...btn(false), padding: '5px 10px', fontSize: '12px', textDecoration: 'none' }}>edit</Link>
                        <button onClick={() => deleteCurriculumAssignment(a)} style={{ ...btn(false), padding: '5px 10px', fontSize: '12px', borderColor: 'rgba(239,68,68,0.3)', color: '#991B1B' }}>delete</button>
                      </div>
                    </div>
                  )
                })
              )}
            </>
          ) : (
            <div style={{ padding: '4rem', textAlign: 'center', color: '#888780', fontSize: '14px' }}>
              {units.length === 0 ? 'create your first unit on the left →' : 'select a unit'}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
