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
      const assignments = await api.get<Assignment[]>(
        `/assignments/?classroom_id=${selectedClassroom}`
      )
      if (!assignments?.length) { setCards([]); setDataLoading(false); return }

      const submissionResults = await Promise.all(
        assignments.map(a =>
          api.post<{ submission: Submission }>(`/code/open?assignment_id=${a.id}`, {})
            .then(d => d.submission)
            .catch(() => null)
        )
      )

      const built: AssignmentCard[] = assignments.map((a, i) => {
        const sub = submissionResults[i]
        let column: AssignmentCard['column'] = 'todo'
        if (sub?.grade != null) column = 'graded'
        else if (sub?.submitted_at) column = 'submitted'
        else if (sub && sub.commit_count > 0) column = 'inprogress'

        // New grade = graded but never viewed
        const isNewGrade = column === 'graded' && !!sub?.graded_at && !sub?.grade_viewed_at

        return {
          assignment: a,
          submission: sub,
          column,
          dueStatus: getDueStatus(a.due_date),
          isNewGrade,
        }
      })

      // Sort graded by most recently graded first
      built.sort((a, b) => {
        if (a.column === 'graded' && b.column === 'graded') {
          const aDate = a.submission?.graded_at ? new Date(a.submission.graded_at).getTime() : 0
          const bDate = b.submission?.graded_at ? new Date(b.submission.graded_at).getTime() : 0
          return bDate - aDate
        }
        return 0
      })

      setCards(built)
    } catch (e) {
      console.error(e)
    } finally {
      setDataLoading(false)
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

  const newGradeCount = cards.filter(c => c.isNewGrade).length
  const totalDone = cards.filter(c => c.column === 'graded' || c.column === 'submitted').length
  const total = cards.length
  const progress = total > 0 ? Math.round(((cards.filter(c => c.column === 'graded').length) / total) * 100) : 0

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
            {cards.filter(c => c.column === 'graded').length} / {total} graded {progress === 100 ? '🎉' : ''}
          </span>
        </div>
      )}

      {/* KANBAN BOARD */}
      <div style={{ flex: 1, padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', alignItems: 'start' }}>
        {COLUMNS.map(col => {
          const colCards = getColumnCards(col.id)
          const isGraded = col.id === 'graded'
          const newInCol = isGraded ? newGradeCount : 0
          const visibleCards = isGraded && !gradedExpanded
            ? colCards.slice(0, GRADED_SHOWN_DEFAULT)
            : colCards
          const hiddenCount = isGraded ? colCards.length - GRADED_SHOWN_DEFAULT : 0

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
                  {colCards.length}
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
                ) : colCards.length === 0 ? (
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

                    {/* SEE MORE / COLLAPSE for graded column */}
                    {isGraded && colCards.length > GRADED_SHOWN_DEFAULT && (
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

  const href = isCode
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