'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import AssignLessonModal from '@/components/AssignLessonModal'

interface Lesson {
  id: string
  title: string
  order_index: number
  scaffold_level: string
  lesson_content: {
    estimated_minutes: number
    has_coding_exercise: boolean
    activity_file_path: string | null
  } | null
}

interface Unit {
  id: string
  title: string
  order_index: number
  description: string
  lessons: Lesson[]
}

interface Classroom {
  id: string
  name: string
}

interface UnlockedLesson {
  lesson_id: string
}

const SCAFFOLD_LABELS: Record<string, string> = {
  block_pseudo: 'Block pseudocode',
  typed_pseudo: 'Typed pseudocode',
  block_python: 'Block Python',
  typed_python: 'Typed Python',
}

export default function CurriculumPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()

  const [units, setUnits] = useState<Unit[]>([])
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [selectedClassroom, setSelectedClassroom] = useState<string>('')
  const [unlockedLessons, setUnlockedLessons] = useState<Set<string>>(new Set())
  const [dataLoading, setDataLoading] = useState(true)
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null)
  const [assigningLesson, setAssigningLesson] = useState<Lesson | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    if (loading) return
    if (!profile) router.push('/login')
    if (profile?.role === 'student') router.push('/learn')
  }, [profile, loading])

  useEffect(() => {
    if (!profile) return
    fetchData()
  }, [profile])

  useEffect(() => {
    if (!selectedClassroom) return
    fetchUnlocked()
  }, [selectedClassroom])

  const fetchData = async () => {
    setDataLoading(true)
    try {
      const [unitsData, classroomsData] = await Promise.all([
        api.get<Unit[]>('/curriculum/units'),
        api.get<Classroom[]>('/classrooms/'),
      ])
      setUnits(unitsData || [])
      setClassrooms(classroomsData || [])
      if (classroomsData?.length > 0) setSelectedClassroom(classroomsData[0].id)
      if (unitsData?.length > 0) setExpandedUnit(unitsData[0].id)
    } catch (e) {
      console.error(e)
    } finally {
      setDataLoading(false)
    }
  }

  const fetchUnlocked = async () => {
    if (!selectedClassroom) return
    try {
      const data = await api.get<UnlockedLesson[]>(
        `/curriculum/classroom/${selectedClassroom}/unlocked`
      )
      setUnlockedLessons(new Set((data || []).map(u => u.lesson_id)))
    } catch (e) {
      console.error(e)
    }
  }

  const unlockLesson = async (lessonId: string) => {
    if (!selectedClassroom) return
    setActionLoading(lessonId)
    try {
      await api.post(`/curriculum/classroom/${selectedClassroom}/unlock/${lessonId}`, {})
      setUnlockedLessons(prev => new Set([...prev, lessonId]))
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(null)
    }
  }

  const lockLesson = async (lessonId: string) => {
    if (!selectedClassroom) return
    setActionLoading(lessonId)
    try {
      await api.delete(`/curriculum/classroom/${selectedClassroom}/unlock/${lessonId}`)
      setUnlockedLessons(prev => {
        const next = new Set(prev)
        next.delete(lessonId)
        return next
      })
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(null)
    }
  }

  const unlockUnit = async (unit: Unit) => {
    if (!selectedClassroom) return
    setActionLoading(`unit-${unit.id}`)
    try {
      await Promise.all(
        unit.lessons
          .filter(l => !unlockedLessons.has(l.id))
          .map(l => api.post(`/curriculum/classroom/${selectedClassroom}/unlock/${l.id}`, {}))
      )
      setUnlockedLessons(prev => new Set([...prev, ...unit.lessons.map(l => l.id)]))
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(null)
    }
  }

  const lockUnit = async (unit: Unit) => {
    if (!selectedClassroom) return
    setActionLoading(`unit-${unit.id}`)
    try {
      await Promise.all(
        unit.lessons
          .filter(l => unlockedLessons.has(l.id))
          .map(l => api.delete(`/curriculum/classroom/${selectedClassroom}/unlock/${l.id}`))
      )
      setUnlockedLessons(prev => {
        const next = new Set(prev)
        unit.lessons.forEach(l => next.delete(l.id))
        return next
      })
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(null)
    }
  }

  const unitUnlockStatus = (unit: Unit) => {
    const total = unit.lessons.length
    const unlocked = unit.lessons.filter(l => unlockedLessons.has(l.id)).length
    if (unlocked === 0) return 'none'
    if (unlocked === total) return 'all'
    return 'partial'
  }

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <p style={{ color: '#888780' }}>loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* NAV */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 2rem', height: '56px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <div style={{ width: '28px', height: '28px', background: '#1A56DB', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'white' }}>{'>'}_</div>
          <span style={{ fontWeight: 700, fontSize: '15px', color: '#0E2D6E', letterSpacing: '-0.02em' }}>commit</span>
        </Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        <span style={{ fontSize: '14px', color: '#5F5E5A', fontWeight: 500 }}>AP CSP curriculum</span>

        {/* CLASSROOM SELECTOR */}
        {classrooms.length > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#888780' }}>assigning to:</span>
            <select
              value={selectedClassroom}
              onChange={e => setSelectedClassroom(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '13px', fontWeight: 600, color: '#0E2D6E', background: 'white', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
            >
              {classrooms.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
      </nav>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2.5rem 2rem' }}>

        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ margin: '0 0 6px', fontSize: '1.5rem', fontWeight: 700, color: '#0E2D6E', letterSpacing: '-0.03em' }}>AP CSP curriculum</h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#888780' }}>
            {units.length} unit{units.length !== 1 ? 's' : ''} · {units.reduce((n, u) => n + u.lessons.length, 0)} lessons
            {selectedClassroom && classrooms.length > 0 && (
              <span> · {unlockedLessons.size} unlocked for {classrooms.find(c => c.id === selectedClassroom)?.name}</span>
            )}
          </p>
        </div>

        {dataLoading ? (
          <p style={{ color: '#888780', fontSize: '14px' }}>loading curriculum...</p>
        ) : units.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem', opacity: 0.4 }}>◎</div>
            <h3 style={{ margin: '0 0 0.5rem', color: '#0E2D6E', fontWeight: 600 }}>no curriculum yet</h3>
            <p style={{ margin: '0 0 1rem', color: '#888780', fontSize: '14px' }}>run the import script to add your lessons</p>
            <code style={{ fontSize: '13px', background: '#F1EFE8', padding: '6px 12px', borderRadius: '6px', color: '#0E2D6E' }}>
              python import_curriculum.py
            </code>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {units.map(unit => {
              const status = unitUnlockStatus(unit)
              const isExpanded = expandedUnit === unit.id
              const isUnitLoading = actionLoading === `unit-${unit.id}`

              return (
                <div key={unit.id} style={{ background: 'white', borderRadius: '14px', border: `1px solid ${status === 'all' ? 'rgba(34,197,94,0.3)' : status === 'partial' ? 'rgba(245,158,11,0.3)' : 'rgba(14,45,110,0.08)'}`, overflow: 'hidden' }}>

                  {/* UNIT HEADER */}
                  <div style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setExpandedUnit(isExpanded ? null : unit.id)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '3px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C' }}>Unit {unit.order_index}</span>
                        <span style={{ fontWeight: 700, fontSize: '15px', color: '#0E2D6E' }}>{unit.title}</span>
                        {status === 'all' && <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#DCFCE7', color: '#166534' }}>all unlocked</span>}
                        {status === 'partial' && <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#FEF9C3', color: '#854D0E' }}>partially unlocked</span>}
                      </div>
                      {unit.description && <p style={{ margin: 0, fontSize: '13px', color: '#888780' }}>{unit.description}</p>}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span style={{ fontSize: '13px', color: '#888780' }}>{unit.lessons.length} lessons</span>

                      {selectedClassroom && (
                        status === 'all' ? (
                          <button
                            onClick={() => lockUnit(unit)}
                            disabled={isUnitLoading}
                            style={{ padding: '6px 14px', background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                          >
                            {isUnitLoading ? '...' : 'lock unit'}
                          </button>
                        ) : (
                          <button
                            onClick={() => unlockUnit(unit)}
                            disabled={isUnitLoading}
                            style={{ padding: '6px 14px', background: '#DCFCE7', color: '#166534', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                          >
                            {isUnitLoading ? '...' : 'unlock all'}
                          </button>
                        )
                      )}

                      <span
                        onClick={() => setExpandedUnit(isExpanded ? null : unit.id)}
                        style={{ color: '#888780', fontSize: '16px', cursor: 'pointer', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}
                      >▾</span>
                    </div>
                  </div>

                  {/* LESSONS */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid rgba(14,45,110,0.06)' }}>
                      {unit.lessons
                        .sort((a, b) => a.order_index - b.order_index)
                        .map((lesson, i) => {
                          const isUnlocked = unlockedLessons.has(lesson.id)
                          const isLoading = actionLoading === lesson.id
                          return (
                            <div key={lesson.id} style={{ padding: '1rem 1.5rem', borderBottom: i < unit.lessons.length - 1 ? '1px solid rgba(14,45,110,0.05)' : 'none', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', background: isUnlocked ? 'rgba(34,197,94,0.03)' : 'transparent' }}>

                              {/* UNLOCK INDICATOR */}
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isUnlocked ? '#22C55E' : '#D3D1C7', flexShrink: 0 }} />

                              <div style={{ flex: 1, minWidth: '200px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '11px', color: '#888780', fontFamily: "'DM Mono', monospace" }}>{unit.order_index}.{lesson.order_index}</span>
                                  <span style={{ fontWeight: 500, fontSize: '14px', color: '#0E2D6E' }}>{lesson.title}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  {lesson.lesson_content?.estimated_minutes && (
                                    <span style={{ fontSize: '11px', color: '#888780' }}>~{lesson.lesson_content.estimated_minutes} min</span>
                                  )}
                                  {SCAFFOLD_LABELS[lesson.scaffold_level] && (
                                    <span style={{ fontSize: '11px', color: '#888780' }}>{SCAFFOLD_LABELS[lesson.scaffold_level]}</span>
                                  )}
                                  {lesson.lesson_content?.has_coding_exercise && (
                                    <span style={{ fontSize: '11px', fontWeight: 500, padding: '1px 6px', borderRadius: '99px', background: '#DCFCE7', color: '#166534' }}>coding</span>
                                  )}
                                  {lesson.lesson_content?.activity_file_path && (
                                    <span style={{ fontSize: '11px', fontWeight: 500, padding: '1px 6px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C' }}>activity</span>
                                  )}
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                <Link
                                  href={`/lesson/${lesson.id}`}
                                  style={{ padding: '6px 14px', background: '#F1EFE8', color: '#5F5E5A', borderRadius: '7px', fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}
                                >
                                  preview
                                </Link>

                                <button
                                  onClick={() => setAssigningLesson(lesson)}
                                  style={{ padding: '6px 14px', background: '#EBF1FD', color: '#0C447C', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                                >
                                  + assign
                                </button>

                                {selectedClassroom && (
                                  isUnlocked ? (
                                    <button
                                      onClick={() => lockLesson(lesson.id)}
                                      disabled={isLoading}
                                      style={{ padding: '6px 14px', background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                                    >
                                      {isLoading ? '...' : '🔒 lock'}
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => unlockLesson(lesson.id)}
                                      disabled={isLoading}
                                      style={{ padding: '6px 14px', background: '#DCFCE7', color: '#166534', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                                    >
                                      {isLoading ? '...' : '🔓 unlock'}
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {assigningLesson && (
        <AssignLessonModal
          lesson={assigningLesson}
          classrooms={classrooms}
          selectedClassroomId={selectedClassroom}
          onClose={() => setAssigningLesson(null)}
          onAssigned={() => setAssigningLesson(null)}
        />
      )}
    </div>
  )
}