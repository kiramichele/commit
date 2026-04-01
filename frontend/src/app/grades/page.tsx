'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import ReadAloud from '@/components/ReadAloud'

interface Classroom {
  id: string
  name: string
}

interface Assignment {
  id: string
  title: string
  due_date: string | null
  min_commits: number
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

  const currentAverage = gradedRows.length > 0
    ? gradedRows.reduce((sum, r) => sum + effectiveGrade(r.submission!), 0) / gradedRows.length
    : null

  const projectedAverage = rows.length > 0
    ? gradedRows.reduce((sum, r) => sum + effectiveGrade(r.submission!), 0) / rows.length
    : null

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

            {/* CURRENT AVERAGE */}
            <div style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780', marginBottom: '10px' }}>current avg</div>
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
      </div>
    </div>
  )
}