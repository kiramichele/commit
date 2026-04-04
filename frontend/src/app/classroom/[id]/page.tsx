'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import HelpQueue from '@/components/HelpQueue'
import LatePenaltySettings from '@/components/LatePenaltySettings'
import { StandardsPicker } from '@/components/Standards'
import InstructionsUpload from '@/components/InstructionsUpload'

type Tab = 'students' | 'assignments' | 'help queue' | 'settings'

interface Classroom {
  id: string
  name: string
  description: string
  join_code: string
  sequential_unlock: boolean
  collab_enabled: boolean
  standup_enabled: boolean
  discussion_enabled: boolean
  standup_frequency_days: number
  archived: boolean
  late_submissions_allowed: boolean
  late_penalty_per_day: number
  late_penalty_max: number
}

interface StudentProgress {
  student_id: string
  student_name: string
  assignments_total: number
  assignments_submitted: number
  assignments_late: number
  open_help_request: boolean
  last_commit_at: string | null
}

interface Assignment {
  id: string
  title: string
  instructions: string
  instructions_html_path: string | null
  due_date: string | null
  min_commits: number
  scaffold_level: string
  created_at: string
  assignment_type: string
}

interface NewAssignment {
  title: string
  instructions: string
  due_date: string
  min_commits: number
  scaffold_level: string
  starter_code: string
}

const SCAFFOLD_LABELS: Record<string, string> = {
  block_pseudo: 'Block pseudocode',
  typed_pseudo: 'Typed pseudocode',
  block_python: 'Block Python',
  typed_python: 'Typed Python',
}

const SCAFFOLD_COLORS: Record<string, { bg: string; text: string }> = {
  block_pseudo:  { bg: '#EBF1FD', text: '#0C447C' },
  typed_pseudo:  { bg: '#EAF3DE', text: '#27500A' },
  block_python:  { bg: '#FAEEDA', text: '#633806' },
  typed_python:  { bg: '#DCFCE7', text: '#166534' },
}

export default function ClassroomPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const classroomId = params.id as string

  const [tab, setTab] = useState<Tab>('students')
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [students, setStudents] = useState<StudentProgress[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [copiedCode, setCopiedCode] = useState(false)
  const [showAddStudent, setShowAddStudent] = useState(false)
  const [showAddAssignment, setShowAddAssignment] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [resetSent, setResetSent] = useState<string | null>(null)
  const [resetLoading, setResetLoading] = useState<string | null>(null)

  const [newStudent, setNewStudent] = useState({ display_name: '', email: '', password: '' })
  const [newAssignment, setNewAssignment] = useState<NewAssignment>({
    title: '', instructions: '', due_date: '', min_commits: 3,
    scaffold_level: 'typed_python', starter_code: '',
  })
  const [standardsTags, setStandardsTags] = useState<string[]>([])
  const [hintsEnabled, setHintsEnabled] = useState(true)
  const [hint1, setHint1] = useState('')
  const [hint2, setHint2] = useState('')

  useEffect(() => {
    if (!loading && !profile) router.push('/login')
  }, [profile, loading])

  useEffect(() => {
    if (!profile || !classroomId) return
    fetchAll()
  }, [profile, classroomId])

  const fetchAll = async () => {
    setDataLoading(true)
    try {
      const [c, s, a] = await Promise.all([
        api.get<Classroom>(`/classrooms/${classroomId}`),
        api.get<StudentProgress[]>(`/classrooms/${classroomId}/students`),
        api.get<Assignment[]>(`/assignments/?classroom_id=${classroomId}`),
      ])
      setClassroom(c)
      setStudents(s)
      setAssignments(a)
    } catch (e) {
      console.error(e)
    } finally {
      setDataLoading(false)
    }
  }

  const copyCode = () => {
    if (!classroom) return
    navigator.clipboard.writeText(classroom.join_code)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    setActionError('')
    setActionLoading(true)
    try {
      await api.post(`/classrooms/${classroomId}/students`, newStudent)
      setShowAddStudent(false)
      setNewStudent({ display_name: '', email: '', password: '' })
      fetchAll()
    } catch (err: any) {
      setActionError(err.message || 'Could not add student.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleAddAssignment = async (e: React.FormEvent) => {
    e.preventDefault()
    setActionError('')
    setActionLoading(true)
    try {
      await api.post('/assignments/', {
        classroom_id: classroomId,
        title: newAssignment.title,
        instructions: newAssignment.instructions,
        due_date: newAssignment.due_date || null,
        min_commits: newAssignment.min_commits,
        scaffold_level: newAssignment.scaffold_level,
        starter_code: newAssignment.starter_code,
        standards_tags: standardsTags,
        hints_enabled: hintsEnabled,
        hint_1: hint1 || null,
        hint_2: hint2 || null,
      })
      setShowAddAssignment(false)
      setNewAssignment({ title: '', instructions: '', due_date: '', min_commits: 3, scaffold_level: 'typed_python', starter_code: '' })
      setStandardsTags([])
      setHintsEnabled(true)
      setHint1('')
      setHint2('')
      fetchAll()
    } catch (err: any) {
      setActionError(err.message || 'Could not create assignment.')
    } finally {
      setActionLoading(false)
    }
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return null
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const isOverdue = (due: string | null) => due && new Date(due) < new Date()

  const timeAgo = (iso: string | null) => {
    if (!iso) return 'never'
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  const inputStyle = {
    width: '100%', padding: '9px 13px', borderRadius: '8px',
    border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '13px',
    outline: 'none', boxSizing: 'border-box' as const,
    fontFamily: "'DM Sans', sans-serif", background: '#FAFAF8',
  }

  const labelStyle = {
    display: 'block' as const, fontSize: '12px',
    fontWeight: 500 as const, color: '#0E2D6E', marginBottom: '5px',
  }

  const handleResetPassword = async (studentId: string) => {
    setResetLoading(studentId)
    setResetSent(null)
    try {
      await api.post(`/classrooms/${classroomId}/students/${studentId}/reset-password`, {})
      setResetSent(studentId)
      setTimeout(() => setResetSent(null), 3000)
    } catch (e: any) {
      setActionError(e.message || 'Could not send reset email.')
    } finally {
      setResetLoading(null)
    }
  }

  const helpCount = students.filter(s => s.open_help_request).length

  if (loading || !profile || !classroom) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <p style={{ color: '#888780' }}>{dataLoading ? 'loading classroom...' : 'classroom not found.'}</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* TOPBAR */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 2rem', height: '56px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <div style={{ width: '28px', height: '28px', background: '#1A56DB', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'white' }}>{'>'}_</div>
          <span style={{ fontWeight: 700, fontSize: '15px', color: '#0E2D6E', letterSpacing: '-0.02em' }}>commit</span>
        </Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        <span style={{ fontSize: '14px', color: '#5F5E5A', fontWeight: 500 }}>{classroom.name}</span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {helpCount > 0 && (
            <button onClick={() => setTab('help queue')} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FEF9C3', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '99px', padding: '4px 12px', fontSize: '12px', fontWeight: 600, color: '#854D0E', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              <span style={{ width: '6px', height: '6px', background: '#F59E0B', borderRadius: '50%', display: 'inline-block' }} />
              {helpCount} help request{helpCount !== 1 ? 's' : ''}
            </button>
          )}
          <button onClick={copyCode} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(14,45,110,0.15)', background: copiedCode ? '#DCFCE7' : 'white', color: copiedCode ? '#166534' : '#5F5E5A', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s' }}>
            <span style={{ fontFamily: "'DM Mono', monospace", letterSpacing: '0.06em' }}>{classroom.join_code}</span>
            {copiedCode ? 'copied!' : 'copy code'}
          </button>
        </div>

        <Link href={`/classroom/${classroomId}/gradebook`} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(14,45,110,0.15)', background: 'white', color: '#5F5E5A', fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}>
  gradebook
</Link>
      </nav>

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem' }}>

        {/* STAT STRIP */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          {[
            { label: 'students', value: students.length },
            { label: 'assignments', value: assignments.length },
            { label: 'help requests', value: helpCount, warn: helpCount > 0 },
            { label: 'late submissions', value: students.reduce((n, s) => n + s.assignments_late, 0), warn: students.some(s => s.assignments_late > 0) },
          ].map((s, i) => (
            <div key={i} style={{ background: 'white', borderRadius: '10px', padding: '1rem 1.25rem', border: `1px solid ${s.warn ? 'rgba(245,158,11,0.25)' : 'rgba(14,45,110,0.08)'}` }}>
              <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780', marginBottom: '6px' }}>{s.label}</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: s.warn ? '#854D0E' : '#0E2D6E', letterSpacing: '-0.03em' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '1.5rem', background: 'white', padding: '4px', borderRadius: '10px', border: '1px solid rgba(14,45,110,0.08)', width: 'fit-content' }}>
          {(['students', 'assignments', 'help queue', 'settings'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 20px', borderRadius: '7px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", background: tab === t ? '#1A56DB' : 'transparent', color: tab === t ? 'white' : '#5F5E5A', transition: 'all 0.15s', position: 'relative' }}>
              {t}
              {t === 'help queue' && helpCount > 0 && (
                <span style={{ position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px', background: '#F59E0B', borderRadius: '50%' }} />
              )}
            </button>
          ))}
        </div>

        {/* ── STUDENTS TAB ── */}
        {tab === 'students' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <button onClick={() => setShowAddStudent(true)} style={{ padding: '9px 18px', background: '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                + add student
              </button>
            </div>

            {students.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)' }}>
                <p style={{ color: '#888780', fontSize: '14px', margin: '0 0 1rem' }}>no students yet — add your first student or share the join code</p>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5rem', fontWeight: 700, color: '#1A56DB', letterSpacing: '0.1em' }}>{classroom.join_code}</div>
              </div>
            ) : (
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 80px 100px 110px', gap: '1rem', padding: '10px 1.25rem', background: '#F8F7F5', borderBottom: '1px solid rgba(14,45,110,0.06)' }}>
                  {['student', 'submitted', 'late', 'last commit', 'status', ''].map(h => (
                    <div key={h} style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#888780' }}>{h}</div>
                  ))}
                </div>
                {students.map((s, i) => (
                  <div key={s.student_id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 80px 100px 110px', gap: '1rem', padding: '12px 1.25rem', alignItems: 'center', borderBottom: i < students.length - 1 ? '1px solid rgba(14,45,110,0.05)' : 'none', background: s.open_help_request ? 'rgba(254,249,195,0.4)' : 'transparent' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 500, color: '#0E2D6E' }}>{s.student_name}</div>
                      {s.assignments_total > 0 && (
                        <div style={{ marginTop: '4px', height: '4px', background: '#EBF1FD', borderRadius: '99px', overflow: 'hidden', width: '120px' }}>
                          <div style={{ height: '100%', width: `${(s.assignments_submitted / s.assignments_total) * 100}%`, background: '#1A56DB', borderRadius: '99px' }} />
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', color: '#5F5E5A' }}>{s.assignments_submitted} / {s.assignments_total}</div>
                    <div style={{ fontSize: '13px', color: s.assignments_late > 0 ? '#991B1B' : '#5F5E5A', fontWeight: s.assignments_late > 0 ? 600 : 400 }}>{s.assignments_late}</div>
                    <div style={{ fontSize: '12px', color: '#888780', fontFamily: "'DM Mono', monospace" }}>{timeAgo(s.last_commit_at)}</div>
                    <div>
                      {s.open_help_request ? (
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '99px', background: '#FEF9C3', color: '#854D0E' }}>help needed</span>
                      ) : (
                        <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '99px', background: '#F1EFE8', color: '#5F5E5A' }}>on track</span>
                      )}
                    </div>
                    <div>
                      <button
                        onClick={() => handleResetPassword(s.student_id)}
                        disabled={resetLoading === s.student_id}
                        style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '6px', border: '1px solid rgba(14,45,110,0.12)', background: resetSent === s.student_id ? '#DCFCE7' : 'white', color: resetSent === s.student_id ? '#166534' : '#5F5E5A', cursor: resetLoading === s.student_id ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}
                      >
                        {resetLoading === s.student_id ? 'sending...' : resetSent === s.student_id ? 'sent!' : 'reset password'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ASSIGNMENTS TAB ── */}
        {tab === 'assignments' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <button onClick={() => setShowAddAssignment(true)} style={{ padding: '9px 18px', background: '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                + new assignment
              </button>
            </div>

            {assignments.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)' }}>
                <p style={{ color: '#888780', fontSize: '14px', margin: '0 0 1rem' }}>no assignments yet</p>
                <button onClick={() => setShowAddAssignment(true)} style={{ padding: '9px 20px', background: '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>+ create first assignment</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {assignments.map(a => {
                  const overdue = isOverdue(a.due_date)
                  const sc = SCAFFOLD_COLORS[a.scaffold_level] || SCAFFOLD_COLORS.typed_python
                  return (
                    <div key={a.id} style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: '14px', color: '#0E2D6E' }}>{a.title}</span>
                          <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '99px', background: sc.bg, color: sc.text }}>{SCAFFOLD_LABELS[a.scaffold_level]}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#888780', flexWrap: 'wrap' }}>
                          <span>min {a.min_commits} commits</span>
                          {a.due_date && (
                            <span style={{ color: overdue ? '#991B1B' : '#5F5E5A', fontWeight: overdue ? 600 : 400 }}>
                              {overdue ? 'overdue · ' : 'due '}
                              {formatDate(a.due_date)}
                            </span>
                          )}
                        </div>
                      </div>
                      <Link href={a.assignment_type === 'code' || !a.assignment_type ? `/classroom/${classroomId}/submissions/${a.id}` : `/classroom/${classroomId}/curriculum-submissions/${a.id}`} style={{ padding: '7px 16px', background: '#EBF1FD', color: '#0C447C', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        view submissions
                      </Link>
                      <InstructionsUpload
                        assignmentId={a.id}
                        currentHtmlPath={a.instructions_html_path}
                        onUploaded={fetchAll}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── HELP QUEUE TAB ── */}
        {tab === 'help queue' && (
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0E2D6E' }}>help queue</h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#888780' }}>refreshes every 30 seconds</p>
            </div>
            <HelpQueue classroomId={classroomId} />
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === 'settings' && (
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1.5rem', fontSize: '15px', fontWeight: 700, color: '#0E2D6E' }}>classroom settings</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[
                { label: 'Sequential lesson unlock', desc: 'Students must complete each lesson before the next unlocks', value: classroom.sequential_unlock },
                { label: 'Collaboration enabled', desc: 'Allow students to work together in real time on assignments', value: classroom.collab_enabled },
                { label: 'Stand-up meetings', desc: 'Students post regular progress updates', value: classroom.standup_enabled },
                { label: 'Discussion boards', desc: 'Open discussion threads on lessons and assignments', value: classroom.discussion_enabled },
              ].map(setting => (
                <div key={setting.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(14,45,110,0.08)', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: '#0E2D6E', marginBottom: '2px' }}>{setting.label}</div>
                    <div style={{ fontSize: '12px', color: '#888780' }}>{setting.desc}</div>
                  </div>
                  <div style={{ width: '40px', height: '22px', borderRadius: '99px', background: setting.value ? '#1A56DB' : '#D3D1C7', position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: '3px', left: setting.value ? '21px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.15s' }} />
                  </div>
                </div>
              ))}
            </div>
            <p style={{ marginTop: '1rem', fontSize: '12px', color: '#888780' }}>settings changes coming in the next update — toggles are preview only for now.</p>

            <LatePenaltySettings
              classroomId={classroomId}
              initial={{
                late_submissions_allowed: classroom.late_submissions_allowed ?? true,
                late_penalty_per_day: classroom.late_penalty_per_day ?? 0,
                late_penalty_max: classroom.late_penalty_max ?? 0,
              }}
            />
          </div>
        )}
      </div>

      {/* ADD STUDENT MODAL */}
      {showAddStudent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,45,110,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={e => { if (e.target === e.currentTarget) setShowAddStudent(false) }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '400px' }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 700, color: '#0E2D6E' }}>add student</h2>
            <p style={{ margin: '0 0 1.5rem', fontSize: '13px', color: '#888780' }}>creates a login for this student and adds them to the classroom</p>
            {actionError && <div style={{ background: '#FEE2E2', borderRadius: '8px', padding: '10px 14px', marginBottom: '1rem', fontSize: '13px', color: '#991B1B' }}>{actionError}</div>}
            <form onSubmit={handleAddStudent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div><label style={labelStyle}>display name</label><input required value={newStudent.display_name} onChange={e => setNewStudent(s => ({ ...s, display_name: e.target.value }))} placeholder="Alex Johnson" style={inputStyle} /></div>
              <div><label style={labelStyle}>email</label><input required type="email" value={newStudent.email} onChange={e => setNewStudent(s => ({ ...s, email: e.target.value }))} placeholder="alex@school.edu" style={inputStyle} /></div>
              <div><label style={labelStyle}>temporary password</label><input required type="password" value={newStudent.password} onChange={e => setNewStudent(s => ({ ...s, password: e.target.value }))} placeholder="they can change this later" style={inputStyle} /></div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => setShowAddStudent(false)} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid rgba(14,45,110,0.15)', background: 'transparent', color: '#5F5E5A', fontWeight: 500, fontSize: '13px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>cancel</button>
                <button type="submit" disabled={actionLoading} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: 'none', background: actionLoading ? '#93C5FD' : '#1A56DB', color: 'white', fontWeight: 600, fontSize: '13px', cursor: actionLoading ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>{actionLoading ? 'adding...' : 'add student'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD ASSIGNMENT MODAL */}
      {showAddAssignment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,45,110,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }} onClick={e => { if (e.target === e.currentTarget) setShowAddAssignment(false) }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '520px', margin: 'auto' }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 700, color: '#0E2D6E' }}>new assignment</h2>
            <p style={{ margin: '0 0 1.5rem', fontSize: '13px', color: '#888780' }}>students will see this in their classroom</p>
            {actionError && <div style={{ background: '#FEE2E2', borderRadius: '8px', padding: '10px 14px', marginBottom: '1rem', fontSize: '13px', color: '#991B1B' }}>{actionError}</div>}
            <form onSubmit={handleAddAssignment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div><label style={labelStyle}>title</label><input required value={newAssignment.title} onChange={e => setNewAssignment(s => ({ ...s, title: e.target.value }))} placeholder="e.g. Hello World — functions" style={inputStyle} /></div>
              <div>
                <label style={labelStyle}>instructions</label>
                <textarea value={newAssignment.instructions} onChange={e => setNewAssignment(s => ({ ...s, instructions: e.target.value }))} rows={3} placeholder="Describe what students need to do..." style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>scaffold level</label>
                  <select value={newAssignment.scaffold_level} onChange={e => setNewAssignment(s => ({ ...s, scaffold_level: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                    {Object.entries(SCAFFOLD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>min commits required</label>
                  <input type="number" min={1} max={20} value={newAssignment.min_commits} onChange={e => setNewAssignment(s => ({ ...s, min_commits: parseInt(e.target.value) }))} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>due date <span style={{ color: '#888780', fontWeight: 400 }}>(optional)</span></label>
                <input type="datetime-local" value={newAssignment.due_date} onChange={e => setNewAssignment(s => ({ ...s, due_date: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>starter code <span style={{ color: '#888780', fontWeight: 400 }}>(optional)</span></label>
                <textarea value={newAssignment.starter_code} onChange={e => setNewAssignment(s => ({ ...s, starter_code: e.target.value }))} rows={4} placeholder="# starter code for students..." style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, fontFamily: "'DM Mono', monospace", fontSize: '12px' }} />
              </div>
              <div>
                <label style={labelStyle}>learning objectives <span style={{ color: '#888780', fontWeight: 400 }}>(optional)</span></label>
                <StandardsPicker selected={standardsTags} onChange={setStandardsTags} />
              </div>

              {/* HINTS */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#F8F7F5', borderRadius: '8px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0E2D6E' }}>enable hints</div>
                  <div style={{ fontSize: '11px', color: '#888780' }}>students can request hints after running + editing</div>
                </div>
                <div onClick={() => setHintsEnabled(h => !h)} style={{ width: '40px', height: '22px', borderRadius: '99px', background: hintsEnabled ? '#1A56DB' : '#D3D1C7', position: 'relative', cursor: 'pointer' }}>
                  <div style={{ position: 'absolute', top: '3px', left: hintsEnabled ? '21px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                </div>
              </div>
              {hintsEnabled && (
                <>
                  <div>
                    <label style={labelStyle}>hint 1 <span style={{ fontWeight: 400, color: '#888780' }}>(vague nudge — optional, AI generates if blank)</span></label>
                    <textarea value={hint1} onChange={e => setHint1(e.target.value)} placeholder="e.g. Think about what type of value your function should return..." rows={2} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
                  </div>
                  <div>
                    <label style={labelStyle}>hint 2 <span style={{ fontWeight: 400, color: '#888780' }}>(more specific — optional, AI generates if blank)</span></label>
                    <textarea value={hint2} onChange={e => setHint2(e.target.value)} placeholder="e.g. Check the indentation inside your for loop..." rows={2} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '0.25rem' }}>
                <button type="button" onClick={() => setShowAddAssignment(false)} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid rgba(14,45,110,0.15)', background: 'transparent', color: '#5F5E5A', fontWeight: 500, fontSize: '13px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>cancel</button>
                <button type="submit" disabled={actionLoading} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: 'none', background: actionLoading ? '#93C5FD' : '#1A56DB', color: 'white', fontWeight: 600, fontSize: '13px', cursor: actionLoading ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>{actionLoading ? 'creating...' : 'create assignment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}