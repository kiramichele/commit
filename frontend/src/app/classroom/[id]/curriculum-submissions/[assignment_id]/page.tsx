'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import { ActivityAllResponses } from '@/components/ActivityResponsesView'
import ActivityResponseCards from '@/components/ActivityResponseCards'

interface Assignment {
  id: string
  title: string
  instructions: string
  assignment_type: string
  lesson_id: string | null
  is_graded: boolean
  due_date: string | null
  classroom_id: string
}

interface Submission {
  id: string
  student_id: string
  submitted_at: string | null
  is_late: boolean
  grade: number | null
  teacher_feedback: string | null
  graded_at: string | null
  profiles: { display_name: string; avatar_url: string | null; email: string }
}

interface GradeBody {
  grade: number
  feedback: string
}

const TYPE_LABELS: Record<string, string> = {
  lesson: '📖 lesson',
  activity: '◈ activity',
  exercises: '✏️ exercises',
  full: '📚 full lesson',
}

export default function CurriculumSubmissionsPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const classroomId = params.id as string
  const assignmentId = params.assignment_id as string

  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [selected, setSelected] = useState<Submission | null>(null)
  const [grade, setGrade] = useState('')
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    if (loading) return
    if (!profile) router.push('/login')
    if (profile?.role === 'student') router.push('/learn')
  }, [profile, loading])

  useEffect(() => {
    if (!profile) return
    fetchData()
  }, [profile, assignmentId])

  const fetchData = async () => {
    setDataLoading(true)
    try {
      const [assignmentData, subsData] = await Promise.all([
        api.get<Assignment>(`/assignments/${assignmentId}`),
        api.get<Submission[]>(`/code/assignment/${assignmentId}`),
      ])
      setAssignment(assignmentData)
      setSubmissions(subsData || [])
      if (subsData?.length > 0) {
        const first = subsData.find(s => s.submitted_at) || subsData[0]
        setSelected(first)
        setGrade(first.grade?.toString() || '')
        setFeedback(first.teacher_feedback || '')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setDataLoading(false)
    }
  }

  const selectStudent = (sub: Submission) => {
    setSelected(sub)
    setGrade(sub.grade?.toString() || '')
    setFeedback(sub.teacher_feedback || '')
    setSaved(false)
  }

  const handleGrade = async () => {
    if (!selected || !assignment?.is_graded) return
    setSaving(true)
    try {
      await api.patch(`/code/grade/${selected.id}`, {
        grade: parseFloat(grade),
        feedback,
      })
      setSubmissions(prev => prev.map(s =>
        s.id === selected.id
          ? { ...s, grade: parseFloat(grade), teacher_feedback: feedback }
          : s
      ))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const submittedCount = submissions.filter(s => s.submitted_at).length
  const typeLabel = assignment ? (TYPE_LABELS[assignment.assignment_type] || assignment.assignment_type) : ''

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
        <Link href={`/classroom/${classroomId}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <div style={{ width: '28px', height: '28px', background: '#1A56DB', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'white' }}>{'>'}_</div>
        </Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        <span style={{ fontSize: '13px', color: '#5F5E5A' }}>{typeLabel}</span>
        <span style={{ color: '#D3D1C7' }}>/</span>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#0E2D6E', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {assignment?.title}
        </span>
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#888780' }}>
          {submittedCount} of {submissions.length} submitted
        </div>
      </nav>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '260px 1fr', overflow: 'hidden' }}>

        {/* STUDENT LIST */}
        <div style={{ borderRight: '1px solid rgba(14,45,110,0.08)', background: 'white', overflowY: 'auto' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(14,45,110,0.06)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780' }}>
            students
          </div>
          {dataLoading ? (
            <div style={{ padding: '1rem', fontSize: '13px', color: '#888780' }}>loading...</div>
          ) : submissions.map(sub => {
            const isSelected = selected?.id === sub.id
            const name = sub.profiles?.display_name || 'Student'
            const hasSubmitted = !!sub.submitted_at
            const hasGrade = sub.grade != null

            return (
              <div
                key={sub.id}
                onClick={() => selectStudent(sub)}
                style={{ padding: '12px 16px', cursor: 'pointer', background: isSelected ? '#EBF1FD' : 'white', borderBottom: '1px solid rgba(14,45,110,0.04)', display: 'flex', alignItems: 'center', gap: '10px', transition: 'background 0.1s' }}
              >
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: isSelected ? '#1A56DB' : '#D3D1C7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                  {name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: isSelected ? 600 : 400, color: isSelected ? '#0E2D6E' : '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                    {hasSubmitted ? (
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '99px', background: '#DCFCE7', color: '#166534' }}>submitted</span>
                    ) : (
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '99px', background: '#F1EFE8', color: '#888780' }}>not submitted</span>
                    )}
                    {hasGrade && (
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C' }}>
                        {sub.grade}/100
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* RIGHT PANEL */}
        <div style={{ overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {!selected ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888780', fontSize: '14px' }}>
              select a student
            </div>
          ) : (
            <>
              {/* STUDENT HEADER */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#0E2D6E' }}>{selected.profiles?.display_name}</div>
                  <div style={{ fontSize: '12px', color: '#888780', marginTop: '2px' }}>
                    {selected.submitted_at
                      ? `submitted ${new Date(selected.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                      : 'not submitted yet'
                    }
                    {selected.is_late && <span style={{ marginLeft: '8px', color: '#991B1B', fontWeight: 600 }}>late</span>}
                  </div>
                </div>
                {assignment?.lesson_id && (
                  <Link
                    href={`/activity/${assignment.lesson_id}`}
                    target="_blank"
                    style={{ fontSize: '12px', color: '#1A56DB', fontWeight: 600, textDecoration: 'none', padding: '6px 14px', background: '#EBF1FD', borderRadius: '7px' }}
                  >
                    preview activity ↗
                  </Link>
                )}
              </div>

              {/* ACTIVITY RESPONSES */}
              {assignment?.lesson_id && (
                <div style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.25rem' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780', marginBottom: '12px' }}>
                    student responses
                  </div>
                  <ActivityResponseCards
                    lessonId={assignment.lesson_id}
                    studentId={selected.student_id}
                    studentName={selected.profiles?.display_name || 'Student'}
                  />
                </div>
              )}

              {/* GRADING PANEL */}
              {assignment?.is_graded && selected.submitted_at && (
                <div style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.25rem' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780', marginBottom: '12px' }}>
                    grade
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={grade}
                      onChange={e => setGrade(e.target.value)}
                      placeholder="0–100"
                      style={{ width: '100px', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '16px', fontWeight: 700, fontFamily: "'DM Mono', monospace", outline: 'none', color: '#0E2D6E' }}
                    />
                    <span style={{ fontSize: '14px', color: '#888780', alignSelf: 'center' }}>/ 100</span>
                  </div>
                  <textarea
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    placeholder="feedback for student (optional)..."
                    rows={3}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '14px', fontFamily: "'DM Sans', sans-serif", resize: 'vertical', outline: 'none', marginBottom: '12px', boxSizing: 'border-box' as const }}
                  />
                  <button
                    onClick={handleGrade}
                    disabled={saving || !grade}
                    style={{ width: '100%', padding: '11px', background: saved ? '#22C55E' : saving ? '#93C5FD' : '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: saving || !grade ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                  >
                    {saved ? '✓ grade saved!' : saving ? 'saving...' : 'save grade'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

