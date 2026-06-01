'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import StreakBadge from '@/components/StreakBadge'
import { StandardsBadgeList } from '@/components/Standards'

interface Classroom {
  id: string
  name: string
  description: string
}

interface Assignment {
  id: string
  title: string
  instructions: string
  due_date: string | null
  min_commits: number
  scaffold_level: string
  assignment_type: string
  lesson_id: string | null
  is_graded: boolean
  standards_tags: string[]
}

interface Submission {
  id: string
  assignment_id: string
  submitted_at: string | null
  grade: number | null
  teacher_feedback: string | null
  commit_count: number
  graded_at: string | null
  grade_viewed_at: string | null
}

interface AssignmentCard {
  assignment: Assignment
  submission: Submission | null
  column: 'todo' | 'inprogress' | 'submitted' | 'graded'
  dueStatus: { text: string; color: string; bg: string } | null
  isNewGrade: boolean
}

// Cards backing the lesson / curriculum-assignment / project rows on
// the kanban. They share the column model but render differently.
interface TodoExtraCard {
  kind: 'lesson' | 'curriculum_assignment' | 'project'
  id: string
  title: string
  typeLabel: string
  typeColor: { bg: string; color: string }
  column: 'todo' | 'inprogress' | 'submitted' | 'graded'
  href: string
  grade: number | null
  unitTitle: string | null
}

interface CurricStatus {
  submitted: boolean
  score: number | null
  grade: number | null
}

const GRADED_SHOWN_DEFAULT = 3

const getDueStatus = (dueDate: string | null) => {
  if (!dueDate) return null
  const due = new Date(dueDate)
  const now = new Date()
  const diffMs = due.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffMs < 0) return { text: 'overdue', color: '#991B1B', bg: '#FEE2E2' }
  if (diffDays === 0) return { text: 'due today', color: '#854D0E', bg: '#FEF9C3' }
  if (diffDays === 1) return { text: 'due tomorrow', color: '#854D0E', bg: '#FEF9C3' }
  if (diffDays <= 3) return { text: `${diffDays} days left`, color: '#854D0E', bg: '#FEF9C3' }
  if (diffDays <= 7) return { text: `${diffDays} days left`, color: '#5F5E5A', bg: '#F1EFE8' }
  return { text: new Date(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), color: '#888780', bg: '#F8F7F5' }
}

const COLUMNS = [
  { id: 'todo',       label: 'To Do',       emoji: '○', color: '#888780', bg: '#F8F7F5', border: 'rgba(14,45,110,0.08)',   emptyText: 'all caught up!' },
  { id: 'inprogress', label: 'In Progress',  emoji: '◑', color: '#0C447C', bg: '#EBF1FD', border: 'rgba(26,86,219,0.2)',   emptyText: 'nothing in progress' },
  { id: 'submitted',  label: 'Submitted',    emoji: '◕', color: '#854D0E', bg: '#FEF9C3', border: 'rgba(245,158,11,0.25)', emptyText: 'nothing submitted yet' },
  { id: 'graded',     label: 'Graded',       emoji: '●', color: '#166534', bg: '#DCFCE7', border: 'rgba(34,197,94,0.25)',  emptyText: 'nothing graded yet' },
] as const

export default function LearnPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()

  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [selectedClassroom, setSelectedClassroom] = useState<string>('')
  const [cards, setCards] = useState<AssignmentCard[]>([])
  const [extraCards, setExtraCards] = useState<TodoExtraCard[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [gradedExpanded, setGradedExpanded] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!profile) router.push('/login')
    if (profile?.role === 'teacher') router.push('/dashboard')
    if (profile?.role === 'admin') router.push('/admin')
  }, [profile, loading])

  useEffect(() => {
    if (!profile) return
    fetchClassrooms()
  }, [profile])

  useEffect(() => {
    if (!selectedClassroom) return
    fetchAssignments()
  }, [selectedClassroom])

  const fetchClassrooms = async () => {
    try {
      const data = await api.get<Classroom[]>('/classrooms/my')
      setClassrooms(data || [])
      if (data?.length > 0) setSelectedClassroom(data[0].id)
      else setDataLoading(false)
    } catch (e) {
      console.error(e)
      setDataLoading(false)
    }
  }

  const fetchAssignments = async () => {
    setDataLoading(true)
    try {
      // Parallel fetch: assignments, the student's todo lists,
      // the curriculum (for titles), completions, and per-curric status.
      const [
        assignments,
        todoLists,
        units,
        completions,
        curricStatus,
        unlocks,
      ] = await Promise.all([
        api.get<Assignment[]>(`/assignments/?classroom_id=${selectedClassroom}`).catch(() => []),
        api.get<{ lesson: string[]; project: string[]; curriculum_assignment: string[] }>(
          `/todo/me?classroom_id=${selectedClassroom}`
        ).catch(() => ({ lesson: [], project: [], curriculum_assignment: [] })),
        api.get<Array<{ id: string; title: string; order_index: number; lessons?: Array<{ id: string; title: string; order_index: number }>; projects?: Array<{ id: string; title: string; order_index: number; is_published: boolean }>; curriculum_assignments?: Array<{ id: string; title: string; order_index: number; assignment_type: string; is_published: boolean }> }>>(
          `/curriculum/units`
        ).catch(() => []),
        api.get<Array<{ lesson_id: string; completed_at: string }>>(
          `/curriculum/classroom/${selectedClassroom}/completions`
        ).catch(() => []),
        api.get<Record<string, CurricStatus>>(
          `/curriculum/classroom/${selectedClassroom}/my-curric-status`
        ).catch(() => ({} as Record<string, CurricStatus>)),
        // Also pull what's been *unlocked* (assigned) for this
        // classroom — curriculum assignments should show on the
        // kanban whether or not the student has explicitly added
        // them to their personal to-do.
        api.get<{ lesson_ids: string[]; project_ids: string[]; curriculum_assignment_ids: string[] }>(
          `/curriculum/classroom/${selectedClassroom}/unlocks`
        ).catch(() => ({ lesson_ids: [], project_ids: [], curriculum_assignment_ids: [] })),
      ])

      const classroomAssignments = assignments || []

      // ── Classroom assignment cards (existing behavior — always on the kanban) ──
      let built: AssignmentCard[] = []
      if (classroomAssignments.length > 0) {
        const submissionResults = await Promise.all(
          classroomAssignments.map(a =>
            // /code/open returns { submission, commits, assignment }
            // — the submissions table has no commit_count column, so
            // we derive it from the commits array length here. Without
            // this, every classroom assignment stayed in the "to-do"
            // column even after the student had committed.
            api.post<{ submission: Submission; commits: unknown[] }>(`/code/open?assignment_id=${a.id}`, {})
              .then(d => d.submission ? { ...d.submission, commit_count: (d.commits || []).length } : null)
              .catch(() => null)
          )
        )

        built = classroomAssignments.map((a, i) => {
          const sub = submissionResults[i]
          let column: AssignmentCard['column'] = 'todo'
          if (sub?.grade != null) column = 'graded'
          else if (sub?.submitted_at) column = 'submitted'
          else if (sub && sub.commit_count > 0) column = 'inprogress'

          const isNewGrade = column === 'graded' && !!sub?.graded_at && !sub?.grade_viewed_at
          return {
            assignment: a,
            submission: sub,
            column,
            dueStatus: getDueStatus(a.due_date),
            isNewGrade,
          }
        })

        built.sort((a, b) => {
          if (a.column === 'graded' && b.column === 'graded') {
            const aDate = a.submission?.graded_at ? new Date(a.submission.graded_at).getTime() : 0
            const bDate = b.submission?.graded_at ? new Date(b.submission.graded_at).getTime() : 0
            return bDate - aDate
          }
          return 0
        })
      }

      // ── To-do extras: lessons + projects + curriculum assignments ──
      const completedLessonIds = new Set((completions || []).map(c => c.lesson_id))
      const lessonTitleById: Record<string, { title: string; unit: string }> = {}
      const projectTitleById: Record<string, { title: string; unit: string }> = {}
      const curricAsstById: Record<string, { title: string; unit: string; assignment_type: string }> = {}
      for (const u of units || []) {
        for (const l of (u.lessons || [])) {
          lessonTitleById[l.id] = { title: l.title, unit: u.title }
        }
        for (const p of (u.projects || [])) {
          projectTitleById[p.id] = { title: p.title, unit: u.title }
        }
        for (const a of (u.curriculum_assignments || [])) {
          curricAsstById[a.id] = { title: a.title, unit: u.title, assignment_type: a.assignment_type }
        }
      }

      const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
        lesson:       { bg: '#DCFCE7', color: '#166534' },
        project:      { bg: '#FEF3C7', color: '#92400E' },
        code:         { bg: '#EBF1FD', color: '#0C447C' },
        activity:     { bg: '#F3E8FF', color: '#6B21A8' },
        checkin:      { bg: '#FEF3C7', color: '#92400E' },
        quiz:         { bg: '#FCE7F3', color: '#9D174D' },
        code_review:  { bg: '#E0E7FF', color: '#3730A3' },
        discussion:   { bg: '#E0F2FE', color: '#075985' },
      }

      const extras: TodoExtraCard[] = []
      for (const lid of (todoLists.lesson || [])) {
        const info = lessonTitleById[lid]
        if (!info) continue
        const completed = completedLessonIds.has(lid)
        extras.push({
          kind: 'lesson',
          id: lid,
          title: info.title,
          typeLabel: 'lesson',
          typeColor: TYPE_COLORS.lesson,
          column: completed ? 'graded' : 'todo',
          href: `/lesson/${lid}`,
          grade: null,
          unitTitle: info.unit,
        })
      }
      for (const pid of (todoLists.project || [])) {
        const info = projectTitleById[pid]
        if (!info) continue
        extras.push({
          kind: 'project',
          id: pid,
          title: info.title,
          typeLabel: 'project',
          typeColor: TYPE_COLORS.project,
          column: 'todo',
          href: `/project/${pid}`,
          grade: null,
          unitTitle: info.unit,
        })
      }
      // Curriculum assignments on the kanban = union of (student's
      // to-do list) and (everything the teacher has assigned to the
      // classroom). The teacher's assigned items show up
      // automatically so the student doesn't have to hunt them down
      // to-do-by-to-do — they ARE the work, after all.
      const curricAsstIds = new Set<string>([
        ...(todoLists.curriculum_assignment || []),
        ...(unlocks.curriculum_assignment_ids || []),
      ])
      for (const cid of curricAsstIds) {
        const info = curricAsstById[cid]
        if (!info) continue
        const status = curricStatus[cid]
        let column: TodoExtraCard['column'] = 'todo'
        const grade = status?.grade ?? status?.score ?? null
        if (grade != null) column = 'graded'
        else if (status?.submitted) column = 'submitted'
        extras.push({
          kind: 'curriculum_assignment',
          id: cid,
          title: info.title,
          typeLabel: info.assignment_type.replace('_', ' '),
          typeColor: TYPE_COLORS[info.assignment_type] || TYPE_COLORS.code,
          column,
          href: `/curriculum-assignment/${cid}?classroom_id=${selectedClassroom}`,
          grade,
          unitTitle: info.unit,
        })
      }

      setCards(built)
      setExtraCards(extras)
    } catch (e) {
      console.error(e)
    } finally {
      setDataLoading(false)
    }
  }

  const removeFromTodo = async (kind: 'lesson' | 'project' | 'curriculum_assignment', targetId: string) => {
    try {
      await api.delete(`/todo/me?classroom_id=${selectedClassroom}&kind=${kind}&target_id=${targetId}`)
      setExtraCards(prev => prev.filter(c => !(c.kind === kind && c.id === targetId)))
    } catch (e: any) {
      alert(e?.message || 'Could not remove from to-do.')
    }
  }

  const markGradeViewed = async (submissionId: string) => {
    try {
      await api.patch(`/code/grade-viewed/${submissionId}`, {})
      setCards(prev => prev.map(c =>
        c.submission?.id === submissionId
          ? { ...c, isNewGrade: false, submission: c.submission ? { ...c.submission, grade_viewed_at: new Date().toISOString() } : null }
          : c
      ))
    } catch (e) {
      console.error(e)
    }
  }

  const getColumnCards = (colId: string) => cards.filter(c => c.column === colId)
  const getExtraCards = (colId: string) => extraCards.filter(c => c.column === colId)

  const newGradeCount = cards.filter(c => c.isNewGrade).length
  const totalDone = cards.filter(c => c.column === 'graded' || c.column === 'submitted').length
    + extraCards.filter(c => c.column === 'graded' || c.column === 'submitted').length
  const total = cards.length + extraCards.length
  const gradedCount = cards.filter(c => c.column === 'graded').length + extraCards.filter(c => c.column === 'graded').length
  const progress = total > 0 ? Math.round((gradedCount / total) * 100) : 0

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <p style={{ color: '#888780' }}>loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* NAV */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 1.5rem', height: '56px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', background: '#1A56DB', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'white' }}>{'>'}_</div>
          <span style={{ fontWeight: 700, fontSize: '15px', color: '#0E2D6E', letterSpacing: '-0.02em' }}>commit</span>
        </div>

        {classrooms.length > 1 && (
          <>
            <span style={{ color: '#D3D1C7' }}>/</span>
            <select value={selectedClassroom} onChange={e => setSelectedClassroom(e.target.value)} style={{ padding: '5px 10px', borderRadius: '7px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '13px', fontWeight: 600, color: '#0E2D6E', background: 'white', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", outline: 'none' }}>
              {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </>
        )}
        {classrooms.length === 1 && (
          <>
            <span style={{ color: '#D3D1C7' }}>/</span>
            <span style={{ fontSize: '13px', color: '#5F5E5A', fontWeight: 500 }}>{classrooms[0]?.name}</span>
          </>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <StreakBadge />
          <span style={{ fontSize: '13px', color: '#5F5E5A' }}>hey, {profile.display_name?.split(' ')[0]} 👋</span>
          <Link href={`/learn/${selectedClassroom}`} style={{ fontSize: '12px', color: '#1A56DB', fontWeight: 600, textDecoration: 'none' }}>lessons</Link>
          <Link href="/grades" style={{ fontSize: '12px', color: '#1A56DB', fontWeight: 600, textDecoration: 'none' }}>my grades</Link>
          <Link href="/docs" style={{ fontSize: '12px', color: '#1A56DB', fontWeight: 600, textDecoration: 'none' }}>📚 python docs</Link>
          <Link href="/search" style={{ fontSize: '12px', color: '#1A56DB', fontWeight: 600, textDecoration: 'none' }}>🔍 search</Link>
          <Link href="/settings" style={{ fontSize: '12px', color: '#888780', textDecoration: 'none' }}>settings</Link>
        </div>
      </nav>

      {/* PROGRESS BAR */}
      {total > 0 && (
        <div style={{ padding: '0.75rem 1.5rem', background: 'white', borderBottom: '1px solid rgba(14,45,110,0.06)', display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
          <div style={{ flex: 1, height: '6px', background: '#EBF1FD', borderRadius: '99px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: progress === 100 ? '#22C55E' : '#1A56DB', borderRadius: '99px', transition: 'width 0.5s ease' }} />
          </div>
          <span style={{ fontSize: '12px', fontWeight: 600, color: progress === 100 ? '#166534' : '#0E2D6E', flexShrink: 0 }}>
            {gradedCount} / {total} graded {progress === 100 ? '🎉' : ''}
          </span>
        </div>
      )}

      {/* KANBAN BOARD */}
      <div style={{ flex: 1, padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', alignItems: 'start' }}>
        {COLUMNS.map(col => {
          const colCards = getColumnCards(col.id)
          const colExtras = getExtraCards(col.id)
          const totalInCol = colCards.length + colExtras.length
          const isGraded = col.id === 'graded'
          const newInCol = isGraded ? newGradeCount : 0
          const visibleCards = isGraded && !gradedExpanded
            ? colCards.slice(0, GRADED_SHOWN_DEFAULT)
            : colCards
          const visibleExtras = isGraded && !gradedExpanded
            ? colExtras.slice(0, Math.max(0, GRADED_SHOWN_DEFAULT - visibleCards.length))
            : colExtras
          const hiddenCount = isGraded ? totalInCol - GRADED_SHOWN_DEFAULT : 0

          return (
            <div key={col.id}>
              {/* COLUMN HEADER */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '0 4px' }}>
                <span style={{ fontSize: '16px', color: col.color }}>{col.emoji}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: col.color }}>{col.label}</span>

                {/* NEW GRADE DOT on header */}
                {newInCol > 0 && (
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F59E0B', display: 'inline-block', flexShrink: 0 }} />
                )}

                <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: col.bg, color: col.color, border: `1px solid ${col.border}` }}>
                  {totalInCol}
                </span>
              </div>

              {/* CARDS */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {dataLoading ? (
                  [1, 2].map(i => (
                    <div key={i} style={{ background: 'white', borderRadius: '10px', padding: '1rem', border: '1px solid rgba(14,45,110,0.08)', opacity: 0.4 }}>
                      <div style={{ height: '14px', background: '#EBF1FD', borderRadius: '4px', width: '70%', marginBottom: '8px' }} />
                      <div style={{ height: '10px', background: '#EBF1FD', borderRadius: '4px', width: '40%' }} />
                    </div>
                  ))
                ) : totalInCol === 0 ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', borderRadius: '10px', border: `1.5px dashed ${col.border}`, background: col.bg + '40' }}>
                    <p style={{ margin: 0, fontSize: '12px', color: col.color, opacity: 0.7 }}>{col.emptyText}</p>
                  </div>
                ) : (
                  <>
                    {visibleCards.map(card => (
                      <AssignmentKanbanCard
                        key={card.assignment.id}
                        card={card}
                        classroomId={selectedClassroom}
                        colColor={col.color}
                        colBorder={col.border}
                        onView={card.isNewGrade && card.submission ? () => markGradeViewed(card.submission!.id) : undefined}
                      />
                    ))}

                    {visibleExtras.map(extra => (
                      <TodoExtraKanbanCard
                        key={`${extra.kind}-${extra.id}`}
                        card={extra}
                        colColor={col.color}
                        colBorder={col.border}
                        onRemove={() => removeFromTodo(extra.kind, extra.id)}
                      />
                    ))}

                    {/* SEE MORE / COLLAPSE for graded column */}
                    {isGraded && totalInCol > GRADED_SHOWN_DEFAULT && (
                      <button
                        onClick={() => setGradedExpanded(e => !e)}
                        style={{ width: '100%', padding: '8px', background: 'transparent', border: `1px dashed ${col.border}`, borderRadius: '8px', fontSize: '12px', fontWeight: 600, color: col.color, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif', transition: 'all 0.15s'" }}
                      >
                        {gradedExpanded
                          ? '↑ show less'
                          : `see ${hiddenCount} more →`
                        }
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* EMPTY STATE */}
      {!dataLoading && classrooms.length === 0 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.4 }}>◎</div>
            <h3 style={{ margin: '0 0 0.5rem', color: '#0E2D6E', fontWeight: 600 }}>not in any classrooms yet</h3>
            <p style={{ margin: 0, color: '#888780', fontSize: '14px' }}>ask your teacher for a join code</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── HELPERS ──────────────────────────────────────────────────

const TYPE_BADGE: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  code:      { emoji: '</>', label: 'code',      color: '#0C447C', bg: '#EBF1FD' },
  lesson:    { emoji: '📖', label: 'lesson',    color: '#166534', bg: '#DCFCE7' },
  activity:  { emoji: '◈',  label: 'activity',  color: '#854D0E', bg: '#FEF9C3' },
  exercises: { emoji: '✏️', label: 'exercises', color: '#6B21A8', bg: '#F3E8FF' },
  full:      { emoji: '📚', label: 'full',      color: '#0C447C', bg: '#EBF1FD' },
}

function getCurriculumHref(assignment: Assignment) {
  if (!assignment.lesson_id) return `/lesson/${assignment.lesson_id}`
  switch (assignment.assignment_type) {
    case 'activity':   return `/activity/${assignment.lesson_id}?assignment_id=${assignment.id}`
    case 'exercises':  return `/lesson/${assignment.lesson_id}?tab=practice&assignment_id=${assignment.id}`
    case 'lesson':     return `/lesson/${assignment.lesson_id}?assignment_id=${assignment.id}`
    case 'full':       return `/lesson/${assignment.lesson_id}?assignment_id=${assignment.id}`
    default:           return `/lesson/${assignment.lesson_id}?assignment_id=${assignment.id}`
  }
}

// ── ASSIGNMENT CARD ──────────────────────────────────────────

function TodoExtraKanbanCard({ card, colColor, colBorder, onRemove }: {
  card: TodoExtraCard
  colColor: string
  colBorder: string
  onRemove: () => void
}) {
  const isGraded = card.column === 'graded'
  const isSubmitted = card.column === 'submitted'
  const accentColor = isGraded ? '#22C55E' : isSubmitted ? '#F59E0B' : '#D3D1C7'
  return (
    <div style={{ position: 'relative', overflow: 'visible' }}>
      <Link
        href={card.href}
        style={{ textDecoration: 'none', display: 'block' }}
      >
        <div
          style={{ background: 'white', borderRadius: '10px', padding: '1rem', border: `1px solid ${colBorder}`, cursor: 'pointer', transition: 'all 0.15s', position: 'relative', overflow: 'hidden' }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(14,45,110,0.1)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
        >
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px', background: accentColor, borderRadius: '10px 0 0 10px' }} />

          <div style={{ paddingLeft: '8px', paddingRight: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0E2D6E', marginBottom: '6px', lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {card.title}
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '99px', background: card.typeColor.bg, color: card.typeColor.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {card.typeLabel}
              </span>
            </div>
            {card.unitTitle && (
              <div style={{ fontSize: '11px', color: '#888780', marginBottom: card.grade != null ? '6px' : 0 }}>{card.unitTitle}</div>
            )}
            {isGraded && card.grade != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '18px', fontWeight: 700, color: '#166534', fontFamily: "'DM Mono', monospace" }}>{card.grade}</span>
                <span style={{ fontSize: '11px', color: '#888780' }}>/ 100</span>
              </div>
            )}
          </div>
        </div>
      </Link>
      <button
        onClick={onRemove}
        title="remove from to-do"
        style={{ position: 'absolute', top: '6px', right: '6px', width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(255,255,255,0.95)', border: `1px solid ${colBorder}`, color: '#888780', cursor: 'pointer', fontSize: '14px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontFamily: "'DM Sans', sans-serif" }}
      >
        ×
      </button>
    </div>
  )
}

function AssignmentKanbanCard({ card, classroomId, colColor, colBorder, onView }: {
  card: AssignmentCard
  classroomId: string
  colColor: string
  colBorder: string
  onView?: () => void
}) {
  const { assignment, submission, dueStatus, isNewGrade } = card
  const isGraded = card.column === 'graded'
  const isSubmitted = card.column === 'submitted'
  const isInProgress = card.column === 'inprogress'
  const isCode = !assignment.assignment_type || assignment.assignment_type === 'code' || assignment.assignment_type === 'exercises'
  const badge = TYPE_BADGE[assignment.assignment_type] || TYPE_BADGE.code

  const accentColor = isGraded ? '#22C55E' : isSubmitted ? '#F59E0B' : isInProgress ? '#1A56DB' : '#D3D1C7'

  const href = !assignment.assignment_type
    || assignment.assignment_type === 'code'
    || !assignment.lesson_id
    ? `/classroom/${classroomId}/assignment/${assignment.id}`
    : getCurriculumHref(assignment)

  return (
    <Link
      href={href}
      style={{ textDecoration: 'none', display: 'block' }}
      onClick={onView}
    >
      <div
        style={{ background: 'white', borderRadius: '10px', padding: '1rem', border: `1px solid ${isNewGrade ? 'rgba(245,158,11,0.4)' : colBorder}`, cursor: 'pointer', transition: 'all 0.15s', position: 'relative', overflow: 'hidden', boxShadow: isNewGrade ? '0 0 0 2px rgba(245,158,11,0.2)' : 'none' }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = isNewGrade ? '0 4px 16px rgba(245,158,11,0.2)' : '0 4px 16px rgba(14,45,110,0.1)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = isNewGrade ? '0 0 0 2px rgba(245,158,11,0.2)' : 'none' }}
      >
        {/* LEFT ACCENT BAR */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px', background: accentColor, borderRadius: '10px 0 0 10px' }} />

        {/* NEW GRADE DOT */}
        {isNewGrade && (
          <div style={{ position: 'absolute', top: '10px', right: '10px', width: '10px', height: '10px', borderRadius: '50%', background: '#F59E0B', boxShadow: '0 0 0 3px rgba(245,158,11,0.2)' }} />
        )}

        <div style={{ paddingLeft: '8px', paddingRight: isNewGrade ? '16px' : '0' }}>
          {/* TITLE */}
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0E2D6E', marginBottom: '6px', lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {assignment.title}
            {!isCode && (
              <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '99px', background: badge.bg, color: badge.color }}>
                {badge.emoji} {badge.label}
              </span>
            )}
          </div>
          {assignment.standards_tags?.length > 0 && (
            <StandardsBadgeList tags={assignment.standards_tags} max={2} />
          )}

          {/* GRADE DISPLAY */}
          {isGraded && submission?.grade != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#166534', fontFamily: "'DM Mono', monospace" }}>
                {submission.grade}
              </span>
              <span style={{ fontSize: '11px', color: '#888780' }}>/ 100</span>
              {isNewGrade && (
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '99px', background: '#FEF9C3', color: '#854D0E' }}>new!</span>
              )}
            </div>
          )}

          {/* BADGES */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {submission?.commit_count != null && submission.commit_count > 0 && !isGraded && (
              <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C' }}>
                {submission.commit_count} commit{submission.commit_count !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* DUE DATE — only on non-graded cards */}
          {dueStatus && !isGraded && (
            <div style={{ marginTop: '6px' }}>
              <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '99px', background: dueStatus.bg, color: dueStatus.color }}>
                {dueStatus.text}
              </span>
            </div>
          )}

          {/* COMMIT PROGRESS BAR — only on todo/in progress */}
          {!isGraded && !isSubmitted && assignment.min_commits > 1 && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ height: '3px', background: '#F1EFE8', borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, ((submission?.commit_count || 0) / assignment.min_commits) * 100)}%`, background: isInProgress ? '#1A56DB' : '#D3D1C7', borderRadius: '99px', transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: '10px', color: '#888780', marginTop: '2px' }}>
                {submission?.commit_count || 0} / {assignment.min_commits} commits needed
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}