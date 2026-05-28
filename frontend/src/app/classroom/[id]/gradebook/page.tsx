'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

interface Assignment {
  id: string
  title: string
  due_date: string | null
  min_commits: number
  assignment_type?: string
}

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

interface Submission {
  id: string
  student_id: string
  assignment_id: string
  submitted_at: string | null
  is_late: boolean
  grade: number | null
  penalized_grade: number | null
  late_penalty_applied: number | null
  teacher_feedback: string | null
  commit_count: number
}

interface Student {
  student_id: string
  student_name: string
}

interface GradeCell {
  submission: Submission | null
  status: 'graded' | 'submitted' | 'in_progress' | 'not_started'
}

export default function GradebookPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const classroomId = params.id as string

  const [students, setStudents] = useState<Student[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS)
  const [curriculumAssignments, setCurriculumAssignments] = useState<Array<{ id: string; title: string; assignment_type: string }>>([])
  const [curriculumSubmissions, setCurriculumSubmissions] = useState<Array<{ student_id: string; lesson_id: string; score: number | null; is_correct: boolean | null; graded_at: string | null }>>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [studentFilter, setStudentFilter] = useState('')
  const [classroomName, setClassroomName] = useState('')

  useEffect(() => {
    if (loading) return
    if (!profile) router.push('/login')
    if (profile?.role === 'student') router.push('/learn')
  }, [profile, loading])

  useEffect(() => {
    if (!profile || !classroomId) return
    fetchData()
  }, [profile, classroomId])

  const fetchData = async () => {
    setDataLoading(true)
    try {
      const [classroom, studentData, assignmentData, weightsData] = await Promise.all([
        api.get<{ name: string }>(`/classrooms/${classroomId}`),
        api.get<Student[]>(`/classrooms/${classroomId}/students`),
        api.get<Assignment[]>(`/assignments/?classroom_id=${classroomId}`),
        api.get<Weights>(`/classrooms/${classroomId}/grade-weights`).catch(() => DEFAULT_WEIGHTS),
      ])
      setClassroomName(classroom.name)
      setStudents(studentData || [])
      setAssignments(assignmentData || [])
      setWeights({ ...DEFAULT_WEIGHTS, ...(weightsData || {}) })

      // Fetch all submissions for all assignments
      const allSubmissions = await Promise.all(
        (assignmentData || []).map(a =>
          api.get<Submission[]>(`/code/assignment/${a.id}`).catch(() => [])
        )
      )
      setSubmissions(allSubmissions.flat())

      // Fetch curriculum assignment grade data for this classroom.
      try {
        const cd = await api.get<{ assignments: Array<{ id: string; title: string; assignment_type: string }>; submissions: Array<any> }>(
          `/curriculum/classroom/${classroomId}/curriculum-grade-data`
        )
        setCurriculumAssignments(cd.assignments || [])
        setCurriculumSubmissions(cd.submissions || [])
      } catch {
        setCurriculumAssignments([])
        setCurriculumSubmissions([])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setDataLoading(false)
    }
  }

  const assignmentType = (assignmentId: string): keyof Weights => {
    const a = assignments.find(x => x.id === assignmentId)
    const t = (a?.assignment_type || 'code') as keyof Weights
    return TYPE_KEYS.includes(t) ? t : 'code'
  }

  const effectiveGrade = (sub: Submission): number | null => {
    if (sub.grade == null) return null
    return sub.penalized_grade != null ? sub.penalized_grade : sub.grade
  }

  const getCell = (studentId: string, assignmentId: string): GradeCell => {
    const sub = submissions.find(
      s => s.student_id === studentId && s.assignment_id === assignmentId
    )
    if (!sub) return { submission: null, status: 'not_started' }
    if (sub.grade != null) return { submission: sub, status: 'graded' }
    if (sub.submitted_at) return { submission: sub, status: 'submitted' }
    if (sub.commit_count > 0) return { submission: sub, status: 'in_progress' }
    return { submission: sub, status: 'not_started' }
  }

  const filteredStudents = useMemo(() =>
    students.filter(s =>
      s.student_name.toLowerCase().includes(studentFilter.toLowerCase())
    ), [students, studentFilter])

  const classAverage = (assignmentId: string) => {
    const graded = submissions.filter(
      s => s.assignment_id === assignmentId && s.grade != null
    )
    if (graded.length === 0) return null
    return (graded.reduce((sum, s) => sum + (effectiveGrade(s) || 0), 0) / graded.length).toFixed(1)
  }

  const curriculumAssignmentType = (assignmentId: string): keyof Weights => {
    const a = curriculumAssignments.find(x => x.id === assignmentId)
    const t = (a?.assignment_type || 'code') as keyof Weights
    return TYPE_KEYS.includes(t) ? t : 'code'
  }

  // Per-type averages for a student. Returns map from type -> average (0-100).
  // Mixes classroom assignment grades and curriculum assignment scores into
  // the same type buckets. Types with no grades are omitted.
  const studentTypeAverages = (studentId: string): Partial<Record<keyof Weights, number>> => {
    const buckets: Partial<Record<keyof Weights, number[]>> = {}
    submissions
      .filter(s => s.student_id === studentId && s.grade != null)
      .forEach(s => {
        const t = assignmentType(s.assignment_id)
        const g = effectiveGrade(s)
        if (g == null) return
        if (!buckets[t]) buckets[t] = []
        buckets[t]!.push(g)
      })
    curriculumSubmissions
      .filter(s => s.student_id === studentId && s.score != null)
      .forEach(s => {
        const t = curriculumAssignmentType(s.lesson_id)
        if (!buckets[t]) buckets[t] = []
        buckets[t]!.push(s.score as number)
      })
    const out: Partial<Record<keyof Weights, number>> = {}
    for (const t of TYPE_KEYS) {
      const arr = buckets[t]
      if (arr && arr.length) out[t] = arr.reduce((a, b) => a + b, 0) / arr.length
    }
    return out
  }

  const getCurriculumCell = (studentId: string, assignmentId: string) => {
    const sub = curriculumSubmissions.find(s => s.student_id === studentId && s.lesson_id === assignmentId)
    if (!sub) return { state: 'not_started' as const, score: null as number | null }
    if (sub.score != null) return { state: 'graded' as const, score: sub.score }
    return { state: 'submitted' as const, score: null }
  }

  const curriculumClassAverage = (assignmentId: string): string | null => {
    const graded = curriculumSubmissions.filter(s => s.lesson_id === assignmentId && s.score != null)
    if (graded.length === 0) return null
    return (graded.reduce((sum, s) => sum + (s.score as number), 0) / graded.length).toFixed(1)
  }

  // Weighted average across only the types the student has grades in.
  // Denominator renormalizes so missing categories don't penalize.
  const studentAverage = (studentId: string): string | null => {
    const byType = studentTypeAverages(studentId)
    const presentTypes = Object.keys(byType) as Array<keyof Weights>
    if (presentTypes.length === 0) return null
    const totalWeight = presentTypes.reduce((sum, t) => sum + (weights[t] || 0), 0)
    if (totalWeight === 0) {
      // Edge case: all present types have 0 weight — fall back to straight average.
      const vals = presentTypes.map(t => byType[t]!)
      return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
    }
    const weighted = presentTypes.reduce((sum, t) => sum + (byType[t]! * (weights[t] || 0)), 0)
    return (weighted / totalWeight).toFixed(1)
  }

  const exportCSV = () => {
    const typeHeaders = TYPE_KEYS.map(t => `${TYPE_LABELS[t]} avg (${weights[t]}%)`)
    const curricHeaders = curriculumAssignments.map(a => `${a.title} (curr · ${a.assignment_type})`)
    const headers = ['Student', ...assignments.map(a => a.title), ...curricHeaders, ...typeHeaders, 'Weighted Avg']
    const rows = students.map(student => {
      const grades = assignments.map(a => {
        const cell = getCell(student.student_id, a.id)
        if (cell.status === 'graded') return (cell.submission ? effectiveGrade(cell.submission) : '')?.toString() || ''
        if (cell.status === 'submitted') return 'submitted'
        if (cell.status === 'in_progress') return 'in progress'
        return 'not started'
      })
      const curricGrades = curriculumAssignments.map(a => {
        const c = getCurriculumCell(student.student_id, a.id)
        if (c.state === 'graded') return c.score?.toString() || ''
        if (c.state === 'submitted') return 'submitted'
        return 'not started'
      })
      const byType = studentTypeAverages(student.student_id)
      const typeCells = TYPE_KEYS.map(t => byType[t] != null ? byType[t]!.toFixed(1) : '')
      const avg = studentAverage(student.student_id) || ''
      return [student.student_name, ...grades, ...curricGrades, ...typeCells, avg]
    })

    // Add class average row
    const avgRow = [
      'Class Average',
      ...assignments.map(a => classAverage(a.id) || ''),
      ...curriculumAssignments.map(a => curriculumClassAverage(a.id) || ''),
      ...TYPE_KEYS.map(() => ''),
      ''
    ]

    const csvContent = [headers, ...rows, [], avgRow]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${classroomName.replace(/\s+/g, '_')}_gradebook.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const CELL_STYLES: Record<string, { bg: string; color: string; border: string }> = {
    graded:      { bg: '#DCFCE7', color: '#166534', border: 'rgba(34,197,94,0.3)' },
    submitted:   { bg: '#FEF9C3', color: '#854D0E', border: 'rgba(245,158,11,0.3)' },
    in_progress: { bg: '#EBF1FD', color: '#0C447C', border: 'rgba(26,86,219,0.2)' },
    not_started: { bg: '#F8F7F5', color: '#888780', border: 'rgba(14,45,110,0.06)' },
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
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 1.5rem', height: '56px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '7px', textDecoration: 'none' }}>
          <div style={{ width: '26px', height: '26px', background: '#1A56DB', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'white' }}>{'>'}_</div>
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#0E2D6E', letterSpacing: '-0.02em' }}>commit</span>
        </Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        <Link href={`/classroom/${classroomId}`} style={{ fontSize: '13px', color: '#5F5E5A', textDecoration: 'none', fontWeight: 500 }}>{classroomName}</Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        <span style={{ fontSize: '13px', color: '#0E2D6E', fontWeight: 500 }}>gradebook</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* LEGEND */}
          <div style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
            {[
              { label: 'graded', ...CELL_STYLES.graded },
              { label: 'submitted', ...CELL_STYLES.submitted },
              { label: 'in progress', ...CELL_STYLES.in_progress },
              { label: 'not started', ...CELL_STYLES.not_started },
            ].map(s => (
              <span key={s.label} style={{ padding: '2px 8px', borderRadius: '99px', background: s.bg, color: s.color, fontWeight: 500, border: `1px solid ${s.border}` }}>
                {s.label}
              </span>
            ))}
          </div>

          <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 16px', background: '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            export CSV ↓
          </button>
        </div>
      </nav>

      <div style={{ padding: '1.5rem 1.5rem 3rem' }}>

        {/* FILTER */}
        <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input
            type="text"
            placeholder="search students..."
            value={studentFilter}
            onChange={e => setStudentFilter(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '13px', outline: 'none', background: 'white', fontFamily: "'DM Sans', sans-serif", width: '220px' }}
          />
          <span style={{ fontSize: '13px', color: '#888780' }}>
            {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}
            {studentFilter && ` matching "${studentFilter}"`}
          </span>
        </div>

        {dataLoading ? (
          <p style={{ color: '#888780', fontSize: '14px' }}>loading gradebook...</p>
        ) : assignments.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', color: '#888780', fontSize: '14px' }}>
            no assignments yet
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', background: 'white', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(14,45,110,0.08)', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: '#F8F7F5', borderBottom: '1px solid rgba(14,45,110,0.08)' }}>
                  {/* STUDENT COLUMN */}
                  <th style={{ padding: '10px 1.25rem', textAlign: 'left', fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#888780', width: '180px', position: 'sticky', left: 0, background: '#F8F7F5', zIndex: 10 }}>
                    student
                  </th>
                  {/* ASSIGNMENT COLUMNS */}
                  {assignments.map(a => (
                    <th key={a.id} style={{ padding: '10px 12px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#0E2D6E', minWidth: '120px', maxWidth: '160px' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.title}>
                        {a.title}
                      </div>
                      {classAverage(a.id) && (
                        <div style={{ fontSize: '10px', color: '#888780', fontWeight: 400, marginTop: '2px' }}>
                          avg: {classAverage(a.id)}
                        </div>
                      )}
                    </th>
                  ))}
                  {/* CURRICULUM ASSIGNMENT COLUMNS */}
                  {curriculumAssignments.map(a => (
                    <th key={a.id} style={{ padding: '10px 12px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#075985', minWidth: '120px', maxWidth: '160px', background: '#F0F9FF' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${a.title} (curriculum · ${a.assignment_type})`}>
                        {a.title}
                      </div>
                      <div style={{ fontSize: '9px', color: '#0369A1', fontWeight: 700, marginTop: '2px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        curriculum
                      </div>
                      {curriculumClassAverage(a.id) && (
                        <div style={{ fontSize: '10px', color: '#888780', fontWeight: 400, marginTop: '2px' }}>
                          avg: {curriculumClassAverage(a.id)}
                        </div>
                      )}
                    </th>
                  ))}
                  {/* WEIGHTED AVERAGE COLUMN */}
                  <th
                    style={{ padding: '10px 12px', textAlign: 'center', fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#888780', width: '90px' }}
                    title={`Weighted by type — code:${weights.code}% project:${weights.project}% quiz:${weights.quiz}% activity:${weights.activity}% checkin:${weights.checkin}%`}
                  >
                    weighted avg
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student, si) => (
                  <tr key={student.student_id} style={{ borderBottom: si < filteredStudents.length - 1 ? '1px solid rgba(14,45,110,0.05)' : 'none' }}>
                    {/* STUDENT NAME */}
                    <td style={{ padding: '10px 1.25rem', fontSize: '13px', fontWeight: 500, position: 'sticky', left: 0, background: 'white', zIndex: 5, borderRight: '1px solid rgba(14,45,110,0.06)' }}>
                      <Link href={`/student/${student.student_id}`} style={{ color: '#0E2D6E', textDecoration: 'none' }}>
                        {student.student_name}
                      </Link>
                    </td>

                    {/* GRADE CELLS */}
                    {assignments.map(a => {
                      const cell = getCell(student.student_id, a.id)
                      const style = CELL_STYLES[cell.status]
                      return (
                        <td key={a.id} style={{ padding: '6px 8px', textAlign: 'center' }}>
                          {cell.submission ? (
                            <Link
                              href={`/classroom/${classroomId}/submissions/${a.id}`}
                              style={{ textDecoration: 'none', display: 'block' }}
                            >
                              <div style={{ padding: '5px 8px', borderRadius: '6px', background: style.bg, color: style.color, fontSize: '13px', fontWeight: 600, border: `1px solid ${style.border}`, cursor: 'pointer' }}>
                                {cell.status === 'graded'
                                  ? effectiveGrade(cell.submission!)
                                  : cell.status === 'submitted'
                                  ? 'sub'
                                  : cell.status === 'in_progress'
                                  ? `${cell.submission.commit_count}c`
                                  : '—'
                                }
                              </div>
                            </Link>
                          ) : (
                            <div style={{ padding: '5px 8px', borderRadius: '6px', background: style.bg, color: style.color, fontSize: '13px', border: `1px solid ${style.border}` }}>
                              —
                            </div>
                          )}
                        </td>
                      )
                    })}

                    {/* CURRICULUM ASSIGNMENT CELLS */}
                    {curriculumAssignments.map(a => {
                      const c = getCurriculumCell(student.student_id, a.id)
                      const cellStyle =
                        c.state === 'graded'      ? { bg: '#DCFCE7', color: '#166534', border: 'rgba(34,197,94,0.3)' }
                        : c.state === 'submitted' ? { bg: '#FEF9C3', color: '#854D0E', border: 'rgba(245,158,11,0.3)' }
                        :                           { bg: '#F0F9FF', color: '#888780', border: 'rgba(14,45,110,0.06)' }
                      return (
                        <td key={a.id} style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <Link
                            href={`/classroom/${classroomId}/curriculum-grading/${a.id}`}
                            style={{ textDecoration: 'none', display: 'block' }}
                          >
                            <div style={{ padding: '5px 8px', borderRadius: '6px', background: cellStyle.bg, color: cellStyle.color, fontSize: '13px', fontWeight: 600, border: `1px solid ${cellStyle.border}`, cursor: 'pointer' }}>
                              {c.state === 'graded'
                                ? c.score
                                : c.state === 'submitted'
                                ? 'sub'
                                : '—'
                              }
                            </div>
                          </Link>
                        </td>
                      )
                    })}

                    {/* STUDENT AVERAGE */}
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: '13px', fontWeight: 600, color: studentAverage(student.student_id) ? '#0E2D6E' : '#888780' }}>
                      {studentAverage(student.student_id) || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* LEGEND DETAIL */}
        <div style={{ marginTop: '1rem', fontSize: '12px', color: '#888780', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <span><strong style={{ color: '#0E2D6E' }}>sub</strong> = submitted, not yet graded</span>
          <span><strong style={{ color: '#0E2D6E' }}>3c</strong> = 3 commits, not submitted</span>
          <span><strong style={{ color: '#0E2D6E' }}>—</strong> = not started</span>
          <span>click any cell to open that submission</span>
        </div>
      </div>
    </div>
  )
}