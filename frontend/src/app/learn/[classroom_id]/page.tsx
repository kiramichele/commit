'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import StreakLeaderboard from '@/components/StreakLeaderboard'
import { StandardsBadgeList } from '@/components/Standards'

type Tab = 'assignments' | 'lessons'

interface Assignment {
  id: string
  title: string
  instructions: string
  due_date: string | null
  min_commits: number
  scaffold_level: string
}

interface Submission {
  assignment_id: string
  submitted_at: string | null
  commit_count: number
  grade: number | null
}

interface UnlockedLesson {
  lesson_id: string
  lessons: {
    id: string
    title: string
    order_index: number
    scaffold_level: string
    units: { title: string; order_index: number }
    lesson_content: {
      estimated_minutes: number
      has_coding_exercise: boolean
      activity_file_path: string | null
    } | null
  }
}

interface Classroom {
  id: string
  name: string
  description: string
}

export default function StudentClassroomPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const classroomId = params.classroom_id as string

  const [tab, setTab] = useState<Tab>('assignments')
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [lessons, setLessons] = useState<UnlockedLesson[]>([])
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set())
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    if (loading) return
    if (!profile) router.push('/login')
    if (profile?.role === 'teacher') router.push('/dashboard')
    if (profile?.role === 'admin') router.push('/admin')
  }, [profile, loading])

  useEffect(() => {
    if (!profile || !classroomId) return
    fetchData()
  }, [profile, classroomId])

  const fetchData = async () => {
    setDataLoading(true)
    try {
      const [classroomData, assignmentsData, lessonsData] = await Promise.all([
        api.get<Classroom>(`/classrooms/${classroomId}`),
        api.get<Assignment[]>(`/assignments/?classroom_id=${classroomId}`),
        api.get<UnlockedLesson[]>(`/curriculum/classroom/${classroomId}/unlocked`),
      ])
      setClassroom(classroomData)
      setAssignments(assignmentsData || [])
      setLessons(lessonsData || [])

      const completionsData = await api.get<{ lesson_id: string }[]>(
        `/curriculum/classroom/${classroomId}/completions`
      ).catch(() => [])
      setCompletedLessonIds(new Set((completionsData || []).map(c => c.lesson_id)))

      // Fetch submissions for this student
      if (assignmentsData?.length > 0) {
        const subs = await Promise.all(
          assignmentsData.map(a =>
            api.post<{ submission: Submission }>(`/code/open?assignment_id=${a.id}`, {})
              .then(d => d.submission)
              .catch(() => null)
          )
        )
        setSubmissions(subs.filter(Boolean) as Submission[])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setDataLoading(false)
    }
  }

  const getSubmission = (assignmentId: string) =>
    submissions.find(s => s.assignment_id === assignmentId)

  const getAssignmentStatus = (assignment: Assignment) => {
    const sub = getSubmission(assignment.id)
    if (!sub) return 'not_started'
    if (sub.submitted_at) return 'submitted'
    if (sub.commit_count > 0) return 'in_progress'
    return 'not_started'
  }

  const isOverdue = (dueDate: string | null) =>
    dueDate && new Date(dueDate) < new Date()

  const formatDue = (dueDate: string | null) => {
    if (!dueDate) return null
    const due = new Date(dueDate)
    const now = new Date()
    const diffMs = due.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    if (diffMs < 0) return { text: 'overdue', color: '#991B1B', bg: '#FEE2E2' }
    if (diffDays === 0) return { text: 'due today', color: '#854D0E', bg: '#FEF9C3' }
    if (diffDays === 1) return { text: 'due tomorrow', color: '#854D0E', bg: '#FEF9C3' }
    if (diffDays <= 3) return { text: `due in ${diffDays} days`, color: '#854D0E', bg: '#FEF9C3' }
    return { text: `due ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, color: '#5F5E5A', bg: '#F1EFE8' }
  }

  // Group lessons by unit
  const lessonsByUnit = lessons.reduce((acc, ul) => {
    const unitTitle = ul.lessons?.units?.title || 'Unknown Unit'
    if (!acc[unitTitle]) acc[unitTitle] = []
    acc[unitTitle].push(ul)
    return acc
  }, {} as Record<string, UnlockedLesson[]>)

  const STATUS_STYLES = {
    submitted: { bg: '#DCFCE7', color: '#166534', label: 'submitted' },
    in_progress: { bg: '#EBF1FD', color: '#0C447C', label: 'in progress' },
    not_started: { bg: '#F1EFE8', color: '#5F5E5A', label: 'not started' },
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
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 1.5rem', height: '52px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Link href="/learn" style={{ display: 'flex', alignItems: 'center', gap: '7px', textDecoration: 'none' }}>
          <div style={{ width: '26px', height: '26px', background: '#1A56DB', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'white' }}>{'>'}_</div>
        </Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        <span style={{ fontSize: '13px', color: '#0E2D6E', fontWeight: 500 }}>{classroom?.name}</span>
        <Link href="/settings" style={{ fontSize: '12px', color: '#888780', textDecoration: 'none', marginLeft: 'auto' }}>
          settings
        </Link>
      </nav>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>

        <StreakLeaderboard classroomId={classroomId} />

        {/* TABS */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '1.5rem', background: 'white', padding: '4px', borderRadius: '10px', border: '1px solid rgba(14,45,110,0.08)', width: 'fit-content' }}>
          {(['assignments', 'lessons'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 20px', borderRadius: '7px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", background: tab === t ? '#1A56DB' : 'transparent', color: tab === t ? 'white' : '#5F5E5A', transition: 'all 0.15s' }}>
              {t}
              {t === 'lessons' && lessons.length > 0 && (
                <span style={{ marginLeft: '6px', fontSize: '11px', background: tab === t ? 'rgba(255,255,255,0.3)' : '#EBF1FD', color: tab === t ? 'white' : '#0C447C', padding: '1px 6px', borderRadius: '99px' }}>
                  {lessons.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {dataLoading ? (
          <p style={{ color: '#888780', fontSize: '14px' }}>loading...</p>
        ) : (
          <>
            {/* ── ASSIGNMENTS TAB ── */}
            {tab === 'assignments' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {assignments.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)' }}>
                    <p style={{ color: '#888780', fontSize: '14px', margin: 0 }}>no assignments yet — check back soon!</p>
                  </div>
                ) : (
                  assignments.map(a => {
                    const status = getAssignmentStatus(a)
                    const style = STATUS_STYLES[status]
                    const due = formatDue(a.due_date)
                    const sub = getSubmission(a.id)

                    return (
                      <div key={a.id} style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: '14px', color: '#0E2D6E' }}>{a.title}</span>
                            <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: style.bg, color: style.color }}>
                              {style.label}
                            </span>
                            {due && (
                              <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '99px', background: due.bg, color: due.color }}>
                                {due.text}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: '#888780', display: 'flex', gap: '10px' }}>
                            <span>min {a.min_commits} commits</span>
                            {sub && sub.commit_count > 0 && (
                              <span>{sub.commit_count} commit{sub.commit_count !== 1 ? 's' : ''} made</span>
                            )}
                            {sub?.grade != null && (
                              <span style={{ color: '#166534', fontWeight: 600 }}>grade: {sub.grade}</span>
                            )}
                          </div>
                        </div>

                        <Link
                          href={`/classroom/${classroomId}/assignment/${a.id}`}
                          style={{ padding: '8px 18px', background: status === 'submitted' ? '#F1EFE8' : '#1A56DB', color: status === 'submitted' ? '#5F5E5A' : 'white', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
                        >
                          {status === 'submitted' ? 'view →' : status === 'in_progress' ? 'continue →' : 'start →'}
                        </Link>
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* ── LESSONS TAB ── */}
            {tab === 'lessons' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {lessons.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '8px', opacity: 0.4 }}>📄</div>
                    <p style={{ color: '#888780', fontSize: '14px', margin: 0 }}>no lessons unlocked yet — your teacher will add them soon!</p>
                  </div>
                ) : (
                  Object.entries(lessonsByUnit).map(([unitTitle, unitLessons]) => (
                    <div key={unitTitle} style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden' }}>
                      <div style={{ padding: '12px 1.25rem', background: '#F8F7F5', borderBottom: '1px solid rgba(14,45,110,0.06)' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#0E2D6E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{unitTitle}</span>
                      </div>
                      {unitLessons
                        .sort((a, b) => (a.lessons?.order_index || 0) - (b.lessons?.order_index || 0))
                        .map((ul, i) => {
                          const lesson = ul.lessons
                          if (!lesson) return null
                          const isDone = completedLessonIds.has(lesson.id)
                          return (
                            <div key={ul.lesson_id} style={{ padding: '1rem 1.25rem', borderBottom: i < unitLessons.length - 1 ? '1px solid rgba(14,45,110,0.05)' : 'none', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', background: isDone ? 'rgba(34,197,94,0.03)' : 'transparent' }}>

                              {/* COMPLETION INDICATOR */}
                              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: isDone ? '#22C55E' : '#F1EFE8', border: `2px solid ${isDone ? '#22C55E' : '#D3D1C7'}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {isDone && <span style={{ color: 'white', fontSize: '12px', fontWeight: 700 }}>✓</span>}
                              </div>

                              <div style={{ flex: 1, minWidth: '200px' }}>
                                <div style={{ fontWeight: 500, fontSize: '14px', color: isDone ? '#888780' : '#0E2D6E', marginBottom: '4px' }}>
                                  {lesson.title}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  {lesson.lesson_content?.estimated_minutes && (
                                    <span style={{ fontSize: '11px', color: '#888780' }}>~{lesson.lesson_content.estimated_minutes} min</span>
                                  )}
                                  {isDone && (
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#166534' }}>completed ✓</span>
                                  )}
                                </div>
                                {(lesson as any).standards_tags?.length > 0 && (
                                  <StandardsBadgeList tags={(lesson as any).standards_tags} max={2} />
                                )}
                              </div>

                              <Link
                                href={`/lesson/${lesson.id}`}
                                style={{ padding: '8px 18px', background: isDone ? '#F1EFE8' : '#1A56DB', color: isDone ? '#5F5E5A' : 'white', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
                              >
                                {isDone ? 'review →' : 'open →'}
                              </Link>
                            </div>
                          )
                        })}
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}