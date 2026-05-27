'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import ReadAloud from '@/components/ReadAloud'

interface Weights {
  code: number
  activity: number
  checkin: number
  quiz: number
  project: number
}

const DEFAULT_WEIGHTS: Weights = { code: 35, project: 35, quiz: 15, activity: 10, checkin: 5 }
const TYPE_KEYS: Array<keyof Weights> = ['code', 'activity', 'checkin', 'quiz', 'project']
const TYPE_LABELS: Record<keyof Weights, string> = {
  code: 'coding', activity: 'activity', checkin: 'check-in', quiz: 'quiz', project: 'project',
}

interface Classroom {
  id: string
  name: string
  grade_weights?: Weights
}

interface Assignment {
  id: string
  title: string
  due_date: string | null
  min_commits: number
  assignment_type?: string
}

interface Submission {
  id: string
  assignment_id: string
  submitted_at: string | null
  is_late: boolean
  grade: number | null
  penalized_grade: number | null
  late_penalty_applied: number | null
  teacher_feedback: string | null
  graded_at: string | null
  commit_count: number
}

interface GradeRow {
  assignment: Assignment
  submission: Submission | null
}

export default function GradesPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()

  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [selectedClassroom, setSelectedClassroom] = useState<string>('')
  const [rows, setRows] = useState<GradeRow[]>([])
  const [curriculumGrades, setCurriculumGrades] = useState<Array<{ id: string; title: string; assignment_type: string; score: number | null; submitted: boolean }>>([])
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    if (loading) return
    if (!profile) router.push('/login')
    if (profile?.role === 'teacher') router.push('/dashboard')
    if (profile?.role === 'admin') router.push('/admin')
  }, [profile, loading])

  useEffect(() => {
    if (!profile) return
    api.get<Classroom[]>('/classrooms/my')
      .then(data => {
        setClassrooms(data || [])
        if (data?.length > 0) setSelectedClassroom(data[0].id)
        else setDataLoading(false)
      })
      .catch(() => setDataLoading(false))
  }, [profile])

  useEffect(() => {
    if (!selectedClassroom) return
    fetchGrades()
  }, [selectedClassroom])

  const fetchGrades = async () => {
    setDataLoading(true)
    try {
      const assignments = await api.get<Assignment[]>(
        `/assignments/?classroom_id=${selectedClassroom}`
      )
      if (!assignments?.length) { setRows([]); setDataLoading(false); return }

      const submissionResults = await Promise.all(
        assignments.map(a =>
          api.post<{ submission: Submission }>(`/code/open?assignment_id=${a.id}`, {})
            .then(d => d.submission)
            .catch(() => null)
        )
      )

      setRows(assignments.map((a, i) => ({
        assignment: a,
        submission: submissionResults[i],
      })))

      // Fold in curriculum assignment grades for this classroom.
      try {
        const cd = await api.get<{ assignments: Array<{ id: string; title: string; assignment_type: string }>; submissions: Array<{ lesson_id: string; score: number | null; graded_at: string | null }> }>(
          `/curriculum/my/classroom/${selectedClassroom}/curriculum-grades`
        )
        const subsByAssignment = new Map(cd.submissions.map(s => [s.lesson_id, s]))
        setCurriculumGrades(cd.assignments.map(a => {
          const sub = subsByAssignment.get(a.id)
          return { id: a.id, title: a.title, assignment_type: a.assignment_type, score: sub?.score ?? null, submitted: !!sub }
        }))
      } catch {
        setCurriculumGrades([])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setDataLoading(false)
    }
  }

  // ── GRADE CALCULATIONS ───────────────────────────────────────
  const effectiveGrade = (sub: Submission): number =>
    sub.penalized_grade != null ? sub.penalized_grade : sub.grade!

  const gradedRows = rows.filter(r => r.submission?.grade != null)
  const submittedRows = rows.filter(r => r.submission?.submitted_at)
  const totalAssignments = rows.length

  const currentClassroom = classrooms.find(c => c.id === selectedClassroom)
  const weights: Weights = { ...DEFAULT_WEIGHTS, ...(currentClassroom?.grade_weights || {}) }

  const typeOf = (r: GradeRow): keyof Weights => {
    const t = (r.assignment.assignment_type || 'code') as keyof Weights
    return TYPE_KEYS.includes(t) ? t : 'code'
  }

  const curriculumTypeOf = (c: { assignment_type: string }): keyof Weights => {
    const t = (c.assignment_type || 'code') as keyof Weights
    return TYPE_KEYS.includes(t) ? t : 'code'
  }

  // Per-type averages folding in curriculum assignment scores alongside
  // classroom assignment grades. Each type bucket averages over both sources.
  const typeAverages = (): Partial<Record<keyof Weights, number>> => {
    const buckets: Partial<Record<keyof Weights, number[]>> = {}
    gradedRows.forEach(r => {
      const t = typeOf(r)
      const g = effectiveGrade(r.submission!)
      if (!buckets[t]) buckets[t] = []
      buckets[t]!.push(g)
    })
    curriculumGrades.forEach(c => {
      if (c.score == null) return
      const t = curriculumTypeOf(c)
      if (!buckets[t]) buckets[t] = []
      buckets[t]!.push(c.score)
    })
    const out: Partial<Record<keyof Weights, number>> = {}
    for (const t of TYPE_KEYS) {
      const arr = buckets[t]
      if (arr && arr.length) out[t] = arr.reduce((a, b) => a + b, 0) / arr.length
    }
    return out
  }

  // Weighted average — only types the student has grades in count, then
  // renormalize so missing categories don't drag the score down.
  const computeWeightedAverage = (byType: Partial<Record<keyof Weights, number>>): number | null => {
    const presentTypes = Object.keys(byType) as Array<keyof Weights>
    if (presentTypes.length === 0) return null
    const totalWeight = presentTypes.reduce((sum, t) => sum + (weights[t] || 0), 0)
    if (totalWeight === 0) {
      const vals = presentTypes.map(t => byType[t]!)
      return vals.reduce((a, b) => a + b, 0) / vals.length
    }
    return presentTypes.reduce((sum, t) => sum + (byType[t]! * (weights[t] || 0)), 0) / totalWeight
  }

  const byType = typeAverages()
  const currentAverage = computeWeightedAverage(byType)

  // Projected = same weighted formula but treats not-yet-graded assignments
  // as 0 within each type. Less common for students to look at, kept for parity.
  const projectedTypeAverages = (): Partial<Record<keyof Weights, number>> => {
    const buckets: Partial<Record<keyof Weights, number[]>> = {}
    rows.forEach(r => {
      const t = typeOf(r)
      const g = r.submission?.grade != null ? effectiveGrade(r.submission) : 0
      if (!buckets[t]) buckets[t] = []
      buckets[t]!.push(g)
    })
    const out: Partial<Record<keyof Weights, number>> = {}
    for (const t of TYPE_KEYS) {
      const arr = buckets[t]
      if (arr && arr.length) out[t] = arr.reduce((a, b) => a + b, 0) / arr.length
    }
    return out
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const projectedAverage = computeWeightedAverage(projectedTypeAverages())

  const getLetterGrade = (avg: number) => {
    if (avg >= 90) return { letter: 'A', color: '#166534', bg: '#DCFCE7' }
    if (avg >= 80) return { letter: 'B', color: '#0C447C', bg: '#EBF1FD' }
    if (avg >= 70) return { letter: 'C', color: '#854D0E', bg: '#FEF9C3' }
    if (avg >= 60) return { letter: 'D', color: '#9A3412', bg: '#FEE2E2' }
    return { letter: 'F', color: '#991B1B', bg: '#FEE2E2' }
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getStatusStyle = (row: GradeRow) => {
    if (row.submission?.grade != null) return { label: 'graded', color: '#166534', bg: '#DCFCE7' }
    if (row.submission?.submitted_at) return { label: 'submitted', color: '#854D0E', bg: '#FEF9C3' }
    if (row.submission && row.submission.commit_count > 0) return { label: 'in progress', color: '#0C447C', bg: '#EBF1FD' }
    return { label: 'not started', color: '#888780', bg: '#F1EFE8' }
  }

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <p style={{ color: '#888780' }}>loading...</p>
    </div>
  )

  const letterGrade = currentAverage != null ? getLetterGrade(currentAverage) : null

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* NAV */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 1.5rem', height: '56px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link href="/learn" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <div style={{ width: '28px', height: '28px', background: '#1A56DB', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'white' }}>{'>'}_</div>
          <span style={{ fontWeight: 700, fontSize: '15px', color: '#0E2D6E', letterSpacing: '-0.02em' }}>commit</span>
        </Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        <span style={{ fontSize: '14px', color: '#5F5E5A', fontWeight: 500 }}>my grades</span>

        {classrooms.length > 1 && (
          <select
            value={selectedClassroom}
            onChange={e => setSelectedClassroom(e.target.value)}
            style={{ marginLeft: 'auto', padding: '5px 10px', borderRadius: '7px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '13px', fontWeight: 600, color: '#0E2D6E', background: 'white', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
          >
            {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </nav>

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '2rem' }}>

        {/* GRADE SUMMARY CARDS */}
        {!dataLoading && rows.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>

            {/* CURRENT WEIGHTED AVERAGE */}
            <div
              style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.25rem', textAlign: 'center' }}
              title={`Weighted by type — code:${weights.code}% project:${weights.project}% quiz:${weights.quiz}% activity:${weights.activity}% checkin:${weights.checkin}%`}
            >
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780', marginBottom: '10px' }}>weighted avg</div>
              {currentAverage != null ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '2.5rem', fontWeight: 700, color: '#0E2D6E', letterSpacing: '-0.03em', fontFamily: "'DM Mono', monospace" }}>
                    {currentAverage.toFixed(1)}
                  </span>
                  {letterGrade && (
                    <span style={{ fontSize: '1.5rem', fontWeight: 700, padding: '4px 12px', borderRadius: '8px', background: letterGrade.bg, color: letterGrade.color }}>
                      {letterGrade.letter}
                    </span>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: '1.5rem', color: '#D3D1C7', fontWeight: 700 }}>—</div>
              )}
              <div style={{ fontSize: '11px', color: '#888780', marginTop: '6px' }}>
                based on {gradedRows.length} graded assignment{gradedRows.length !== 1 ? 's' : ''}
              </div>
            </div>

            {/* ASSIGNMENTS STATUS */}
            <div style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780', marginBottom: '10px' }}>submitted</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#0E2D6E', letterSpacing: '-0.03em', fontFamily: "'DM Mono', monospace" }}>
                {submittedRows.length}<span style={{ fontSize: '1.2rem', color: '#888780' }}>/{totalAssignments}</span>
              </div>
              <div style={{ marginTop: '8px', height: '6px', background: '#EBF1FD', borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${totalAssignments > 0 ? (submittedRows.length / totalAssignments) * 100 : 0}%`, background: '#1A56DB', borderRadius: '99px', transition: 'width 0.5s' }} />
              </div>
            </div>

            {/* GRADED */}
            <div style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780', marginBottom: '10px' }}>graded</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#0E2D6E', letterSpacing: '-0.03em', fontFamily: "'DM Mono', monospace" }}>
                {gradedRows.length}<span style={{ fontSize: '1.2rem', color: '#888780' }}>/{totalAssignments}</span>
              </div>
              <div style={{ marginTop: '8px', height: '6px', background: '#EBF1FD', borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${totalAssignments > 0 ? (gradedRows.length / totalAssignments) * 100 : 0}%`, background: '#22C55E', borderRadius: '99px', transition: 'width 0.5s' }} />
              </div>
            </div>

            {/* LATE */}
            {rows.some(r => r.submission?.is_late) && (
              <div style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(239,68,68,0.15)', padding: '1.25rem', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780', marginBottom: '10px' }}>late</div>
                <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#991B1B', letterSpacing: '-0.03em', fontFamily: "'DM Mono', monospace" }}>
                  {rows.filter(r => r.submission?.is_late).length}
                </div>
              </div>
            )}
          </div>
        )}

        {/* GRADE BREAKDOWN BY TYPE */}
        {!dataLoading && rows.length > 0 && (
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.25rem 1.5rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#0E2D6E', letterSpacing: '0.02em' }}>grade breakdown</h3>
              <span style={{ fontSize: '11px', color: '#888780' }}>how each category contributes to your weighted average</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
              {TYPE_KEYS.map(t => {
                const avg = byType[t]
                const w = weights[t] || 0
                const has = avg != null
                return (
                  <div key={t} style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(14,45,110,0.08)', background: has ? '#FAFAF8' : 'transparent' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                      {TYPE_LABELS[t]} · {w}%
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: has ? '#0E2D6E' : '#D3D1C7', fontFamily: "'DM Mono', monospace" }}>
                      {has ? avg!.toFixed(1) : '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ASSIGNMENT LIST */}
        {dataLoading ? (
          <p style={{ color: '#888780', fontSize: '14px' }}>loading grades...</p>
        ) : rows.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)' }}>
            <p style={{ color: '#888780', fontSize: '14px', margin: 0 }}>no assignments yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {rows.map(row => {
              const status = getStatusStyle(row)
              const hasGrade = row.submission?.grade != null
              const hasFeedback = !!row.submission?.teacher_feedback
              const displayGrade = hasGrade ? effectiveGrade(row.submission!) : null
              const lg = displayGrade != null ? getLetterGrade(displayGrade) : null

              return (
                <div key={row.assignment.id} style={{ background: 'white', borderRadius: '12px', border: `1px solid ${hasGrade ? 'rgba(34,197,94,0.15)' : 'rgba(14,45,110,0.08)'}`, overflow: 'hidden' }}>

                  {/* ASSIGNMENT HEADER */}
                  <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '14px', color: '#0E2D6E' }}>{row.assignment.title}</span>
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: status.bg, color: status.color }}>
                          {status.label}
                        </span>
                        {row.submission?.is_late && (
                          <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#FEE2E2', color: '#991B1B' }}>late</span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: '#888780', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {row.assignment.due_date && (
                          <span>due {formatDate(row.assignment.due_date)}</span>
                        )}
                        {row.submission?.submitted_at && (
                          <span>submitted {formatDate(row.submission.submitted_at)}</span>
                        )}
                        {row.submission?.commit_count != null && row.submission.commit_count > 0 && (
                          <span>{row.submission.commit_count} commits</span>
                        )}
                      </div>
                    </div>

                    {/* GRADE DISPLAY */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {hasGrade ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0E2D6E', fontFamily: "'DM Mono', monospace" }}>
                            {displayGrade}
                          </span>
                          <span style={{ fontSize: '12px', color: '#888780' }}>/100</span>
                          {lg && (
                            <span style={{ fontSize: '1.25rem', fontWeight: 700, padding: '3px 10px', borderRadius: '7px', background: lg.bg, color: lg.color }}>
                              {lg.letter}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: '13px', color: '#888780', fontStyle: 'italic' }}>not graded yet</span>
                      )}
                    </div>
                  </div>

                  {/* FEEDBACK */}
                  {hasFeedback && (
                    <div style={{ padding: '0.75rem 1.25rem 1rem', borderTop: '1px solid rgba(14,45,110,0.06)', background: '#F8F7F5' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#888780' }}>teacher feedback</span>
                        <ReadAloud text={row.submission!.teacher_feedback!} isPro={false} />
                      </div>
                      <p style={{ margin: 0, fontSize: '13px', color: '#5F5E5A', lineHeight: 1.7, fontStyle: 'italic' }}>
                        "{row.submission!.teacher_feedback}"
                      </p>
                    </div>
                  )}

                  {/* LATE PENALTY */}
                  {row.submission?.is_late && row.submission?.late_penalty_applied != null && row.submission.late_penalty_applied > 0 && (
                    <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid rgba(14,45,110,0.06)', background: '#FEE2E2' }}>
                      <div style={{ fontSize: '12px', color: '#991B1B' }}>
                        late penalty: -{row.submission.late_penalty_applied} pts → final grade: <strong>{row.submission.penalized_grade}</strong>
                      </div>
                    </div>
                  )}

                  {/* OPEN BUTTON */}
                  <div style={{ padding: '0.5rem 1.25rem 0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <Link
                      href={`/classroom/${selectedClassroom}/assignment/${row.assignment.id}`}
                      style={{ fontSize: '12px', color: '#1A56DB', fontWeight: 600, textDecoration: 'none' }}
                    >
                      open assignment →
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* CURRICULUM ASSIGNMENTS */}
        {!dataLoading && curriculumGrades.length > 0 && (
          <div style={{ marginTop: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#0E2D6E', letterSpacing: '0.02em' }}>curriculum assignments</h3>
              <span style={{ fontSize: '11px', color: '#888780' }}>from the platform curriculum</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {curriculumGrades.map(c => {
                const hasGrade = c.score != null
                const lg = hasGrade ? getLetterGrade(c.score!) : null
                return (
                  <div key={c.id} style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '14px', color: '#0E2D6E' }}>{c.title}</span>
                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: '#E0F2FE', color: '#075985', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.assignment_type}</span>
                        {!hasGrade && c.submitted && (
                          <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#FEF9C3', color: '#854D0E' }}>awaiting grade</span>
                        )}
                        {!c.submitted && (
                          <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#F1EFE8', color: '#5F5E5A' }}>not started</span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {hasGrade ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0E2D6E', fontFamily: "'DM Mono', monospace" }}>{c.score}</span>
                          <span style={{ fontSize: '11px', color: '#888780' }}>/100</span>
                          {lg && <span style={{ fontSize: '1rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: lg.bg, color: lg.color }}>{lg.letter}</span>}
                        </div>
                      ) : (
                        <Link href={`/curriculum-assignment/${c.id}`} style={{ fontSize: '12px', color: '#1A56DB', fontWeight: 600, textDecoration: 'none', padding: '6px 12px', borderRadius: '6px', background: '#EBF1FD' }}>
                          open →
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}