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

export default function AdminCurriculumPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()

  const [units, setUnits] = useState<Unit[]>([])
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [unitsLoading, setUnitsLoading] = useState(true)
  const [lessonsLoading, setLessonsLoading] = useState(false)

  const [newUnitTitle, setNewUnitTitle] = useState('')
  const [newUnitOrder, setNewUnitOrder] = useState('')
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
    const orderStr = prompt('Order number?', String((projects[projects.length - 1]?.order_index || 0) + 1))
    if (!orderStr) return
    try {
      const created = await api.post<Project>(`/admin/curriculum/units/${selectedUnit.id}/projects`, {
        title,
        order_index: parseInt(orderStr, 10),
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

  const createUnit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUnitTitle.trim() || !newUnitOrder) return
    setCreatingUnit(true)
    try {
      const created = await api.post<Unit>('/admin/curriculum/units', {
        title: newUnitTitle,
        order_index: parseInt(newUnitOrder, 10),
        description: '',
        is_published: false,
      })
      setUnits(u => [...u, created].sort((a, b) => a.order_index - b.order_index))
      setNewUnitTitle('')
      setNewUnitOrder('')
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
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>{profile.email}</span>
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
            <div style={{ display: 'flex', gap: '6px' }}>
              <input type="number" value={newUnitOrder} onChange={e => setNewUnitOrder(e.target.value)} placeholder="#" required style={{ ...inputStyle, width: '60px' }} />
              <input value={newUnitTitle} onChange={e => setNewUnitTitle(e.target.value)} placeholder="new unit title" required style={{ ...inputStyle, flex: 1 }} />
            </div>
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
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#888780' }}>{lessons.length} lesson(s) · {projects.length} project(s) · order {selectedUnit.order_index}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => togglePublish(selectedUnit)} style={btn(false)}>
                    {selectedUnit.is_published ? 'unpublish' : 'publish'}
                  </button>
                  <button onClick={() => deleteUnit(selectedUnit)} style={{ ...btn(false), borderColor: 'rgba(239,68,68,0.3)', color: '#991B1B' }}>delete</button>
                  <button onClick={createProject} style={btn(false)}>+ new project</button>
                  <Link href={`/admin/curriculum/lessons/new?unit=${selectedUnit.id}`} style={{ ...btn(true), textDecoration: 'none' }}>+ new lesson</Link>
                </div>
              </div>

              {/* PROJECTS SECTION */}
              {projects.length > 0 && (
                <div style={{ background: '#FAFAF8', padding: '0.5rem 0' }}>
                  <div style={{ padding: '6px 1.25rem', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888780' }}>
                    projects
                  </div>
                  {projects.map(p => (
                    <div key={p.id} style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid rgba(14,45,110,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0E2D6E', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: "'DM Mono', monospace", color: '#888780' }}>{p.order_index}</span>
                          {p.title}
                          <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#FEF3C7', color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>project</span>
                          <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C' }}>{p.project_steps?.length || 0} step(s)</span>
                          <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: p.is_published ? '#DCFCE7' : '#FEF9C3', color: p.is_published ? '#166534' : '#854D0E' }}>{p.is_published ? 'live' : 'draft'}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => toggleProjectPublish(p)} style={{ ...btn(false), padding: '5px 10px', fontSize: '12px' }}>{p.is_published ? 'unpublish' : 'publish'}</button>
                        <Link href={`/admin/curriculum/projects/${p.id}`} style={{ ...btn(false), padding: '5px 10px', fontSize: '12px', textDecoration: 'none' }}>edit</Link>
                        <button onClick={() => deleteProject(p)} style={{ ...btn(false), padding: '5px 10px', fontSize: '12px', borderColor: 'rgba(239,68,68,0.3)', color: '#991B1B' }}>delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {lessonsLoading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#888780', fontSize: '13px' }}>loading...</div>
              ) : lessons.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#888780', fontSize: '13px' }}>no lessons yet — click "+ new lesson" to add one</div>
              ) : (
                lessons.map(l => (
                  <div key={l.id} style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid rgba(14,45,110,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0E2D6E', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", color: '#888780' }}>{l.order_index}</span>
                        {l.title}
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{lessonType(l)}</span>
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: l.is_published ? '#DCFCE7' : '#FEF9C3', color: l.is_published ? '#166534' : '#854D0E' }}>{l.is_published ? 'live' : 'draft'}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => toggleLessonPublish(l)} style={{ ...btn(false), padding: '5px 10px', fontSize: '12px' }}>{l.is_published ? 'unpublish' : 'publish'}</button>
                      <Link href={`/admin/curriculum/lessons/${l.id}`} style={{ ...btn(false), padding: '5px 10px', fontSize: '12px', textDecoration: 'none' }}>edit</Link>
                      <button onClick={() => deleteLesson(l)} style={{ ...btn(false), padding: '5px 10px', fontSize: '12px', borderColor: 'rgba(239,68,68,0.3)', color: '#991B1B' }}>delete</button>
                    </div>
                  </div>
                ))
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
