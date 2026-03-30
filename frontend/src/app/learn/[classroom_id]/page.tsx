'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

interface Assignment {
  id: string
  title: string
  instructions: string
  due_date: string | null
  min_commits: number
  scaffold_level: string
  classroom_id: string
}

interface Submission {
  assignment_id: string
  submitted_at: string | null
  grade: number | null
  final_code: string
}

interface Classroom {
  id: string
  name: string
  description: string
  teacher_id: string
}

const SCAFFOLD_LABELS: Record<string, string> = {
  block_pseudo: 'Block pseudocode',
  typed_pseudo: 'Typed pseudocode',
  block_python: 'Block Python',
  typed_python: 'Typed Python',
}

export default function StudentClassroomPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const classroomId = params.classroom_id as string

  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    if (!loading && !profile) router.push('/login')
    if (!loading && profile?.role === 'teacher') router.push('/dashboard')
    if (!loading && profile?.role === 'admin') router.push('/admin')
  }, [profile, loading])

  useEffect(() => {
    if (!profile || !classroomId) return
    fetchData()
  }, [profile, classroomId])

  const fetchData = async () => {
    setDataLoading(true)
    try {
      const [c, a] = await Promise.all([
        api.get<Classroom>(`/classrooms/${classroomId}`),
        api.get<Assignment[]>(`/assignments/?classroom_id=${classroomId}`),
      ])
      setClassroom(c)
      setAssignments(a || [])

      // Load submission status for each assignment
      const submissionData = await Promise.all(
        (a || []).map(async (assignment) => {
          try {
            const result = await api.post<{ submission: Submission }>(
              `/code/open?assignment_id=${assignment.id}`, {}
            )
            return result.submission
          } catch {
            return null
          }
        })
      )
      setSubmissions(submissionData.filter(Boolean) as Submission[])
    } catch (e) {
      console.error(e)
    } finally {
      setDataLoading(false)
    }
  }

  const getSubmission = (assignmentId: string) =>
    submissions.find(s => s.assignment_id === assignmentId)

  const formatDue = (iso: string | null) => {
    if (!iso) return null
    const d = new Date(iso)
    const now = new Date()
    const diff = d.getTime() - now.getTime()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    if (diff < 0) return { label: 'overdue', color: '#991B1B', bg: '#FEE2E2' }
    if (days === 0) return { label: 'due today', color: '#854D0E', bg: '#FEF9C3' }
    if (days === 1) return { label: 'due tomorrow', color: '#854D0E', bg: '#FEF9C3' }
    return { label: `due ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, color: '#5F5E5A', bg: '#F1EFE8' }
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
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 2rem', height: '56px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Link href="/learn" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <div style={{ width: '26px', height: '26px', background: '#1A56DB', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'white' }}>{'>'}_</div>
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#0E2D6E', letterSpacing: '-0.02em' }}>commit</span>
        </Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        <span style={{ fontSize: '14px', color: '#5F5E5A', fontWeight: 500 }}>{classroom?.name}</span>
      </nav>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2.5rem 2rem' }}>

        {/* HEADER */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ margin: '0 0 4px', fontSize: '1.5rem', fontWeight: 700, color: '#0E2D6E', letterSpacing: '-0.03em' }}>{classroom?.name}</h1>
          {classroom?.description && <p style={{ margin: 0, fontSize: '14px', color: '#888780' }}>{classroom.description}</p>}
        </div>

        {/* ASSIGNMENTS */}
        {dataLoading ? (
          <p style={{ color: '#888780', fontSize: '14px' }}>loading assignments...</p>
        ) : assignments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)' }}>
            <p style={{ color: '#888780', fontSize: '14px', margin: 0 }}>no assignments yet — check back soon!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {assignments.map(a => {
              const submission = getSubmission(a.id)
              const isSubmitted = !!submission?.submitted_at
              const hasGrade = submission?.grade != null
              const due = formatDue(a.due_date)

              return (
                <Link key={a.id} href={`/classroom/${classroomId}/assignment/${a.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ background: 'white', borderRadius: '12px', border: `1px solid ${isSubmitted ? 'rgba(34,197,94,0.2)' : 'rgba(14,45,110,0.08)'}`, padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', transition: 'border-color 0.15s' }}>

                    {/* STATUS ICON */}
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: isSubmitted ? '#DCFCE7' : '#EBF1FD', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '16px' }}>
                      {isSubmitted ? '✓' : '○'}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '14px', color: '#0E2D6E' }}>{a.title}</span>
                        {isSubmitted && (
                          <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#DCFCE7', color: '#166534' }}>submitted</span>
                        )}
                        {hasGrade && (
                          <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C' }}>grade: {submission.grade}</span>
                        )}
                        {due && !isSubmitted && (
                          <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '99px', background: due.bg, color: due.color }}>{due.label}</span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: '#888780', display: 'flex', gap: '12px' }}>
                        <span>{SCAFFOLD_LABELS[a.scaffold_level] || a.scaffold_level}</span>
                        <span>min {a.min_commits} commit{a.min_commits !== 1 ? 's' : ''}</span>
                      </div>
                    </div>

                    <span style={{ fontSize: '14px', color: '#1A56DB', fontWeight: 600, flexShrink: 0 }}>
                      {isSubmitted ? 'view →' : 'open →'}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
