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
  assignment_type?: string
  curriculum_unit_id?: string | null
  curriculum_order?: number | null
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

interface UnitWithProjects {
  id: string
  title: string
  order_index: number
  is_published: boolean
  projects?: Array<{ id: string; order_index: number; title: string; description: string; estimated_minutes: number; is_published: boolean }>
  curriculum_assignments?: Array<{ id: string; order_index: number; title: string; assignment_type: string; is_published: boolean }>
}

interface Classroom {
  id: string
  name: string
  description: string
  discussion_enabled?: boolean
}

interface CurricStatus {
  submitted: boolean
  score: number | null
  grade: number | null
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
  const [projectsByUnitTitle, setProjectsByUnitTitle] = useState<Record<string, UnitWithProjects['projects']>>({})
  const [curriculumAssignmentsByUnitTitle, setCurriculumAssignmentsByUnitTitle] = useState<Record<string, UnitWithProjects['curriculum_assignments']>>({})
  const [curricStatus, setCurricStatus] = useState<Record<string, CurricStatus>>({})
  const [units, setUnits] = useState<UnitWithProjects[]>([])
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
      const [classroomData, assignmentsData, lessonsData, unitsData, unlocksData, curricStatusData] = await Promise.all([
        api.get<Classroom>(`/classrooms/${classroomId}`),
        api.get<Assignment[]>(`/assignments/?classroom_id=${classroomId}`),
        api.get<UnlockedLesson[]>(`/curriculum/classroom/${classroomId}/unlocked`),
        api.get<UnitWithProjects[]>(`/curriculum/units`).catch(() => []),
        api.get<{ project_ids: string[]; curriculum_assignment_ids: string[] }>(
          `/curriculum/classroom/${classroomId}/unlocks`
        ).catch(() => ({ project_ids: [], curriculum_assignment_ids: [] })),
        api.get<Record<string, CurricStatus>>(
          `/curriculum/classroom/${classroomId}/my-curric-status`
        ).catch(() => ({} as Record<string, CurricStatus>)),
      ])
      setCurricStatus(curricStatusData || {})
      setClassroom(classroomData)
      setAssignments(assignmentsData || [])
      setLessons(lessonsData || [])

      // Per-classroom assignment visibility — projects and curriculum
      // assignments only show if the teacher has assigned them. The
      // backfill in migration 019 means existing classrooms keep
      // seeing everything they were seeing before. Discussions are
      // hidden globally when the classroom's discussion_enabled toggle
      // is off.
      const projectUnlocks = new Set(unlocksData.project_ids || [])
      const asstUnlocks = new Set(unlocksData.curriculum_assignment_ids || [])
      const discussionsAllowed = classroomData?.discussion_enabled !== false

      // Build unitTitle → projects + unitTitle → curriculum assignments maps
      // so we can render them alongside lessons in the same per-unit blocks.
      const projectsMap: Record<string, UnitWithProjects['projects']> = {}
      const curricAsstMap: Record<string, UnitWithProjects['curriculum_assignments']> = {}
      for (const u of unitsData || []) {
        const published = (u.projects || [])
          .filter(p => p.is_published && projectUnlocks.has(p.id))
          .sort((a, b) => a.order_index - b.order_index)
        if (published.length) projectsMap[u.title] = published
        const publishedAsst = (u.curriculum_assignments || [])
          .filter(a => a.is_published && asstUnlocks.has(a.id))
          .filter(a => discussionsAllowed || a.assignment_type !== 'discussion')
          .sort((a, b) => a.order_index - b.order_index)
        if (publishedAsst.length) curricAsstMap[u.title] = publishedAsst
      }
      setProjectsByUnitTitle(projectsMap)
      setCurriculumAssignmentsByUnitTitle(curricAsstMap)
      setUnits(unitsData || [])

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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '14px', alignItems: 'center' }}>
          <Link href="/docs" style={{ fontSize: '12px', color: '#1A56DB', fontWeight: 600, textDecoration: 'none' }}>
            📚 docs
          </Link>
          <Link href="/search" style={{ fontSize: '12px', color: '#1A56DB', fontWeight: 600, textDecoration: 'none' }}>
            🔍 search
          </Link>
          {profile && (
            <Link href={`/student/${profile.profile_id}`} style={{ fontSize: '12px', color: '#888780', textDecoration: 'none' }}>
              my profile
            </Link>
          )}
          <Link href="/settings" style={{ fontSize: '12px', color: '#888780', textDecoration: 'none' }}>
            settings
          </Link>
        </div>
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
            {tab === 'assignments' && (() => {
              // Merged view: classroom + curriculum assignments in
              // curriculum order. We sort everything by (unit_order,
              // item_order); classroom-only items without a unit slot
              // at the bottom.
              const discussionsAllowed = classroom?.discussion_enabled !== false
              const unitOrderById: Record<string, number> = {}
              for (const u of units) unitOrderById[u.id] = u.order_index ?? 9999

              type Row =
                | { kind: 'classroom'; data: Assignment; unitOrder: number; itemOrder: number }
                | { kind: 'curriculum'; data: NonNullable<UnitWithProjects['curriculum_assignments']>[number]; unitTitle: string; unitOrder: number; itemOrder: number }

              const classroomRows: Row[] = assignments
                .filter(a => discussionsAllowed || a.assignment_type !== 'discussion')
                .map(a => ({
                  kind: 'classroom' as const,
                  data: a,
                  unitOrder: a.curriculum_unit_id ? (unitOrderById[a.curriculum_unit_id] ?? 9999) : 99999,
                  itemOrder: a.curriculum_order ?? 9999,
                }))

              const curricRows: Row[] = []
              for (const u of units) {
                for (const ca of (u.curriculum_assignments || [])) {
                  if (!ca.is_published) continue
                  if (!discussionsAllowed && ca.assignment_type === 'discussion') continue
                  // Use the same unlock filter the lessons tab applies.
                  if (!curriculumAssignmentsByUnitTitle[u.title]?.some(x => x.id === ca.id)) continue
                  curricRows.push({
                    kind: 'curriculum',
                    data: ca,
                    unitTitle: u.title,
                    unitOrder: u.order_index ?? 9999,
                    itemOrder: ca.order_index ?? 9999,
                  })
                }
              }

              const merged = [...classroomRows, ...curricRows].sort((a, b) => {
                if (a.unitOrder !== b.unitOrder) return a.unitOrder - b.unitOrder
                return a.itemOrder - b.itemOrder
              })

              const curricTypeColors: Record<string, { bg: string; color: string; label: string }> = {
                code:        { bg: '#EBF1FD', color: '#0C447C', label: 'coding' },
                activity:    { bg: '#F3E8FF', color: '#6B21A8', label: 'activity' },
                checkin:     { bg: '#FEF3C7', color: '#92400E', label: 'check-in' },
                quiz:        { bg: '#FCE7F3', color: '#9D174D', label: 'quiz' },
                project:     { bg: '#FEF3C7', color: '#92400E', label: 'project' },
                code_review: { bg: '#E0E7FF', color: '#3730A3', label: 'code review' },
                discussion:  { bg: '#E0F2FE', color: '#075985', label: 'discussion' },
              }

              if (merged.length === 0) {
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ padding: '3rem', textAlign: 'center', background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)' }}>
                      <p style={{ color: '#888780', fontSize: '14px', margin: 0 }}>no assignments yet — check back soon!</p>
                    </div>
                  </div>
                )
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {merged.map(row => {
                    if (row.kind === 'classroom') {
                      const a = row.data
                      const status = getAssignmentStatus(a)
                      const style = STATUS_STYLES[status]
                      const due = formatDue(a.due_date)
                      const sub = getSubmission(a.id)
                      return (
                        <div key={`cl-${a.id}`} style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
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
                    }
                    // Curriculum-assignment row.
                    const ca = row.data
                    const tc = curricTypeColors[ca.assignment_type] || curricTypeColors.code
                    const status = curricStatus[ca.id]
                    const submitted = status?.submitted
                    const grade = status?.grade ?? status?.score ?? null
                    return (
                      <div key={`ca-${ca.id}`} style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: '14px', color: '#0E2D6E' }}>{ca.title}</span>
                            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: tc.bg, color: tc.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{tc.label}</span>
                            {submitted && (
                              <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#DCFCE7', color: '#166534' }}>submitted</span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: '#888780', display: 'flex', gap: '10px' }}>
                            <span>{row.unitTitle}</span>
                            {grade != null && (
                              <span style={{ color: '#166534', fontWeight: 600 }}>grade: {grade}</span>
                            )}
                          </div>
                        </div>
                        <Link
                          href={`/curriculum-assignment/${ca.id}?classroom_id=${classroomId}`}
                          style={{ padding: '8px 18px', background: submitted ? '#F1EFE8' : '#1A56DB', color: submitted ? '#5F5E5A' : 'white', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
                        >
                          {submitted ? 'view →' : 'open →'}
                        </Link>
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* ── LESSONS TAB ── */}
            {/* Per-unit blocks. Inside each unit we merge lessons,
                projects, curriculum assignments, and the teacher's own
                classroom assignments into one ordered list — sorted by
                each item's order_index (or curriculum_order for teacher
                assignments) so students see them in the curriculum order
                the author set. */}
            {tab === 'lessons' && (() => {
              const discussionsAllowed = classroom?.discussion_enabled !== false
              const curricTypeColors: Record<string, { bg: string; color: string; label: string }> = {
                code:        { bg: '#EBF1FD', color: '#0C447C', label: 'coding' },
                activity:    { bg: '#F3E8FF', color: '#6B21A8', label: 'activity' },
                checkin:     { bg: '#FEF3C7', color: '#92400E', label: 'check-in' },
                quiz:        { bg: '#FCE7F3', color: '#9D174D', label: 'quiz' },
                project:     { bg: '#FEF3C7', color: '#92400E', label: 'project' },
                code_review: { bg: '#E0E7FF', color: '#3730A3', label: 'code review' },
                discussion:  { bg: '#E0F2FE', color: '#075985', label: 'discussion' },
              }

              type Row =
                | { kind: 'lesson'; id: string; order: number; data: NonNullable<UnlockedLesson['lessons']> }
                | { kind: 'project'; id: string; order: number; data: NonNullable<UnitWithProjects['projects']>[number] }
                | { kind: 'curriculum'; id: string; order: number; data: NonNullable<UnitWithProjects['curriculum_assignments']>[number] }
                | { kind: 'teacher_assignment'; id: string; order: number; data: Assignment }

              const sortedUnits = [...units].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
              const haveAnything = lessons.length > 0
                || Object.keys(projectsByUnitTitle).length > 0
                || Object.keys(curriculumAssignmentsByUnitTitle).length > 0

              if (!haveAnything) {
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ padding: '3rem', textAlign: 'center', background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)' }}>
                      <div style={{ fontSize: '2rem', marginBottom: '8px', opacity: 0.4 }}>📄</div>
                      <p style={{ color: '#888780', fontSize: '14px', margin: 0 }}>no lessons unlocked yet — your teacher will add them soon!</p>
                    </div>
                  </div>
                )
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {sortedUnits.map(unit => {
                    const unitLessons = lessonsByUnit[unit.title] || []
                    const unitProjects = projectsByUnitTitle[unit.title] || []
                    const unitCurricAssts = curriculumAssignmentsByUnitTitle[unit.title] || []
                    const unitTeacherAssts = assignments
                      .filter(a => a.curriculum_unit_id === unit.id)
                      .filter(a => discussionsAllowed || a.assignment_type !== 'discussion')

                    const rows: Row[] = [
                      ...unitLessons.map(ul => ({
                        kind: 'lesson' as const,
                        id: ul.lesson_id,
                        order: ul.lessons?.order_index ?? 9999,
                        data: ul.lessons!,
                      })),
                      ...unitProjects.map(p => ({
                        kind: 'project' as const,
                        id: p.id,
                        order: p.order_index ?? 9999,
                        data: p,
                      })),
                      ...unitCurricAssts.map(a => ({
                        kind: 'curriculum' as const,
                        id: a.id,
                        order: a.order_index ?? 9999,
                        data: a,
                      })),
                      ...unitTeacherAssts.map(a => ({
                        kind: 'teacher_assignment' as const,
                        id: a.id,
                        order: a.curriculum_order ?? 9999,
                        data: a,
                      })),
                    ].sort((a, b) => a.order - b.order)

                    if (rows.length === 0) return null

                    return (
                      <div key={unit.id} style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden' }}>
                        <div style={{ padding: '12px 1.25rem', background: '#F8F7F5', borderBottom: '1px solid rgba(14,45,110,0.06)' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#0E2D6E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{unit.title}</span>
                        </div>

                        {rows.map((row, i) => {
                          const isLast = i === rows.length - 1
                          const rowBorder = isLast ? 'none' : '1px solid rgba(14,45,110,0.05)'

                          if (row.kind === 'lesson') {
                            const lesson = row.data
                            const isDone = completedLessonIds.has(lesson.id)
                            return (
                              <div key={`lesson-${lesson.id}`} style={{ padding: '1rem 1.25rem', borderBottom: rowBorder, display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', background: isDone ? 'rgba(34,197,94,0.03)' : 'transparent' }}>
                                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: isDone ? '#22C55E' : '#F1EFE8', border: `2px solid ${isDone ? '#22C55E' : '#D3D1C7'}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {isDone && <span style={{ color: 'white', fontSize: '12px', fontWeight: 700 }}>✓</span>}
                                </div>
                                <div style={{ flex: 1, minWidth: '200px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 500, fontSize: '14px', color: isDone ? '#888780' : '#0E2D6E' }}>{lesson.title}</span>
                                    <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C', textTransform: 'uppercase', letterSpacing: '0.05em' }}>lesson</span>
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
                          }

                          if (row.kind === 'project') {
                            const p = row.data
                            return (
                              <div key={`project-${p.id}`} style={{ padding: '1rem 1.25rem', borderBottom: rowBorder, display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', background: 'rgba(254,243,199,0.3)' }}>
                                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#FEF3C7', border: '2px solid #FDE68A', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: '#92400E', fontSize: '11px', fontWeight: 700 }}>★</span>
                                </div>
                                <div style={{ flex: 1, minWidth: '200px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 600, fontSize: '14px', color: '#0E2D6E' }}>{p.title}</span>
                                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: '#FEF3C7', color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>project</span>
                                  </div>
                                  {p.description && <div style={{ fontSize: '12px', color: '#5F5E5A', marginTop: '2px' }}>{p.description}</div>}
                                </div>
                                <Link href={`/project/${p.id}`} style={{ padding: '8px 18px', background: '#1A56DB', color: 'white', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                  open →
                                </Link>
                              </div>
                            )
                          }

                          if (row.kind === 'curriculum') {
                            const a = row.data
                            const tc = curricTypeColors[a.assignment_type] || curricTypeColors.code
                            const status = curricStatus[a.id]
                            const submitted = status?.submitted
                            return (
                              <div key={`ca-${a.id}`} style={{ padding: '1rem 1.25rem', borderBottom: rowBorder, display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', background: 'rgba(224,242,254,0.3)' }}>
                                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: tc.bg, border: `2px solid ${tc.color}55`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: tc.color, fontSize: '11px', fontWeight: 700 }}>&Sigma;</span>
                                </div>
                                <div style={{ flex: 1, minWidth: '200px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 600, fontSize: '14px', color: '#0E2D6E' }}>{a.title}</span>
                                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: tc.bg, color: tc.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{tc.label}</span>
                                    {submitted && (
                                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#166534' }}>submitted ✓</span>
                                    )}
                                  </div>
                                </div>
                                <Link href={`/curriculum-assignment/${a.id}?classroom_id=${classroomId}`} style={{ padding: '8px 18px', background: submitted ? '#F1EFE8' : '#1A56DB', color: submitted ? '#5F5E5A' : 'white', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                  {submitted ? 'view →' : 'open →'}
                                </Link>
                              </div>
                            )
                          }

                          // teacher_assignment
                          const a = row.data
                          const tc = curricTypeColors[a.assignment_type || 'code'] || curricTypeColors.code
                          const status = getAssignmentStatus(a)
                          const sub = getSubmission(a.id)
                          return (
                            <div key={`ta-${a.id}`} style={{ padding: '1rem 1.25rem', borderBottom: rowBorder, display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', background: 'rgba(241,239,232,0.5)' }}>
                              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: tc.bg, border: `2px solid ${tc.color}55`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ color: tc.color, fontSize: '11px', fontWeight: 700 }}>✎</span>
                              </div>
                              <div style={{ flex: 1, minWidth: '200px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#0E2D6E' }}>{a.title}</span>
                                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: tc.bg, color: tc.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{tc.label}</span>
                                  {status === 'submitted' && (
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#166534' }}>submitted ✓</span>
                                  )}
                                  {sub?.grade != null && (
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#166534' }}>grade: {sub.grade}</span>
                                  )}
                                </div>
                              </div>
                              <Link href={`/classroom/${classroomId}/assignment/${a.id}`} style={{ padding: '8px 18px', background: status === 'submitted' ? '#F1EFE8' : '#1A56DB', color: status === 'submitted' ? '#5F5E5A' : 'white', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                {status === 'submitted' ? 'view →' : status === 'in_progress' ? 'continue →' : 'start →'}
                              </Link>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </>
        )}
      </div>
    </div>
  )
}