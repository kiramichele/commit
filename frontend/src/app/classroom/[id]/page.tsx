'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import HelpQueue from '@/components/HelpQueue'
import LatePenaltySettings from '@/components/LatePenaltySettings'
import GradeWeightSettings from '@/components/GradeWeightSettings'
import GroupsManager from '@/components/GroupsManager'
import { StandardsPicker } from '@/components/Standards'
import InstructionsUpload from '@/components/InstructionsUpload'

type Tab = 'students' | 'assignments' | 'curriculum' | 'help queue' | 'settings'

interface CurriculumLesson {
  id: string
  order_index: number
  title: string
  is_published: boolean
}
interface CurriculumProject {
  id: string
  order_index: number
  title: string
  description: string
  estimated_minutes: number
  is_published: boolean
}
interface CurriculumAssignmentRow {
  id: string
  order_index: number
  title: string
  assignment_type: string
  is_published: boolean
}
interface CurriculumUnit {
  id: string
  order_index: number
  title: string
  is_published: boolean
  lessons?: CurriculumLesson[]
  projects?: CurriculumProject[]
  curriculum_assignments?: CurriculumAssignmentRow[]
}

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
  discussion_name_display?: 'first_name' | 'first_last_initial' | 'full_name'
  auto_grade_test_cases?: boolean
  auto_add_assigned_to_todo?: boolean
  collab_default_group_size?: number
  collab_default_strategy?: 'random' | 'similar_grade' | 'opposite_grade' | 'manual' | 'student_choice'
  collab_allow_student_choice?: boolean
  collab_allow_solo?: boolean
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
  curriculum_unit_id?: string | null
  curriculum_order?: number | null
}

interface NewAssignment {
  title: string
  instructions: string
  due_date: string
  min_commits: number
  scaffold_level: string
  starter_code: string
  assignment_type: string
  curriculum_unit_id: string
  discussion_min_posts: number
  discussion_min_comments: number
}

const ASSIGNMENT_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'code',       label: 'Coding' },
  { value: 'activity',   label: 'Interactive activity' },
  { value: 'checkin',    label: 'Check-in' },
  { value: 'quiz',       label: 'Quiz' },
  { value: 'project',    label: 'Project' },
  { value: 'discussion', label: 'Discussion board' },
]

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
  const [curriculumUnits, setCurriculumUnits] = useState<CurriculumUnit[]>([])
  const [curriculumLoading, setCurriculumLoading] = useState(false)
  const [unlockedLessonIds, setUnlockedLessonIds] = useState<Set<string>>(new Set())
  const [unlockedProjectIds, setUnlockedProjectIds] = useState<Set<string>>(new Set())
  const [unlockedAsstIds, setUnlockedAsstIds] = useState<Set<string>>(new Set())
  const [busyUnlock, setBusyUnlock] = useState<string | null>(null)
  // When the teacher clicks "⚏ groups" on an assignment row, we open a
  // modal scoped to that one assignment.
  const [openGroupsForAsst, setOpenGroupsForAsst] = useState<
    { kind: 'classroom' | 'curriculum'; id: string } | null
  >(null)
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
    scaffold_level: 'typed_python', starter_code: '', assignment_type: 'code',
    curriculum_unit_id: '',
    discussion_min_posts: 1, discussion_min_comments: 2,
  })
  const [standardsTags, setStandardsTags] = useState<string[]>([])
  const [hintsEnabled, setHintsEnabled] = useState(true)
  const [hint1, setHint1] = useState('')
  const [hint2, setHint2] = useState('')
  // Collab settings on the new-assignment form. When the master
  // toggle is on we surface the strategy + group size so the teacher
  // picks per assignment. student-choice + solo overrides inherit
  // the classroom defaults (editable later in the assignment editor).
  const [collabEnabled, setCollabEnabled] = useState(false)
  const [collabStrategy, setCollabStrategy] = useState<'random' | 'similar_grade' | 'opposite_grade' | 'manual' | 'student_choice'>('random')
  const [collabGroupSize, setCollabGroupSize] = useState<number>(2)

  useEffect(() => {
    if (!loading && !profile) router.push('/login')
  }, [profile, loading])

  useEffect(() => {
    if (!profile || !classroomId) return
    fetchAll()
  }, [profile, classroomId])

  // Fetch curriculum + per-classroom unlocks on first render. Both the
  // curriculum tab AND the assignments tab need them (the assignments
  // tab merges curriculum assignments into the teacher's list), so no
  // longer gated on tab.
  useEffect(() => {
    if (!profile) return
    if (curriculumUnits.length > 0 || curriculumLoading) return
    setCurriculumLoading(true)
    Promise.all([
      api.get<CurriculumUnit[]>('/curriculum/units').catch(() => [] as CurriculumUnit[]),
      api.get<{ lesson_ids: string[]; project_ids: string[]; curriculum_assignment_ids: string[] }>(
        `/curriculum/classroom/${classroomId}/unlocks`
      ).catch(() => ({ lesson_ids: [], project_ids: [], curriculum_assignment_ids: [] })),
    ])
      .then(([data, unlocks]) => {
        setCurriculumUnits(data || [])
        setUnlockedLessonIds(new Set(unlocks.lesson_ids))
        setUnlockedProjectIds(new Set(unlocks.project_ids))
        setUnlockedAsstIds(new Set(unlocks.curriculum_assignment_ids))
      })
      .finally(() => setCurriculumLoading(false))
  }, [profile])

  const toggleAssign = async (
    kind: 'lesson' | 'project' | 'assignment',
    id: string,
    currentlyAssigned: boolean,
  ) => {
    const busyKey = `${kind}:${id}`
    setBusyUnlock(busyKey)
    const path = kind === 'lesson'
      ? `/curriculum/classroom/${classroomId}/unlock/${id}`
      : kind === 'project'
        ? `/curriculum/classroom/${classroomId}/unlock-project/${id}`
        : `/curriculum/classroom/${classroomId}/unlock-assignment/${id}`
    try {
      if (currentlyAssigned) {
        await api.delete(path)
        if (kind === 'lesson') setUnlockedLessonIds(s => { const n = new Set(s); n.delete(id); return n })
        else if (kind === 'project') setUnlockedProjectIds(s => { const n = new Set(s); n.delete(id); return n })
        else setUnlockedAsstIds(s => { const n = new Set(s); n.delete(id); return n })
      } else {
        await api.post(path, {})
        if (kind === 'lesson') setUnlockedLessonIds(s => new Set(s).add(id))
        else if (kind === 'project') setUnlockedProjectIds(s => new Set(s).add(id))
        else setUnlockedAsstIds(s => new Set(s).add(id))
      }
    } catch (err: any) {
      alert(err.message || 'Could not update assignment.')
    } finally {
      setBusyUnlock(null)
    }
  }

  const toggleAssignUnit = async (unitId: string, currentlyAllAssigned: boolean) => {
    const busyKey = `unit:${unitId}`
    setBusyUnlock(busyKey)
    const path = `/curriculum/classroom/${classroomId}/unlock-unit/${unitId}`
    try {
      if (currentlyAllAssigned) {
        await api.delete(path)
      } else {
        await api.post(path, {})
      }
      // Refresh unlocks from server to avoid drift.
      const unlocks = await api.get<{ lesson_ids: string[]; project_ids: string[]; curriculum_assignment_ids: string[] }>(
        `/curriculum/classroom/${classroomId}/unlocks`
      )
      setUnlockedLessonIds(new Set(unlocks.lesson_ids))
      setUnlockedProjectIds(new Set(unlocks.project_ids))
      setUnlockedAsstIds(new Set(unlocks.curriculum_assignment_ids))
    } catch (err: any) {
      alert(err.message || 'Could not update unit.')
    } finally {
      setBusyUnlock(null)
    }
  }

  // Move a teacher's classroom assignment up or down in the merged curriculum
  // view. We slot it next to the adjacent item by setting curriculum_order to
  // a half-step value — admin items keep their integer order_index, teacher
  // items can shift around them freely.
  const moveTeacherAssignment = async (
    assignmentId: string,
    mergedList: Array<{ id: string; order_index: number; kind: string }>,
    direction: -1 | 1,
  ) => {
    const idx = mergedList.findIndex(x => x.id === assignmentId)
    if (idx < 0) return
    const target = mergedList[idx + direction]
    if (!target) return  // already at the top/bottom

    let newOrder: number
    if (direction === -1) {
      // Moving up: slot above the target.
      const above = mergedList[idx + direction - 1]
      newOrder = above ? (above.order_index + target.order_index) / 2 : target.order_index - 0.5
    } else {
      // Moving down: slot below the target.
      const below = mergedList[idx + direction + 1]
      newOrder = below ? (target.order_index + below.order_index) / 2 : target.order_index + 0.5
    }

    // Optimistic local update so the UI moves immediately.
    setAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, curriculum_order: newOrder } : a))
    try {
      await api.patch(`/assignments/${assignmentId}`, { curriculum_order: newOrder })
    } catch (err: any) {
      alert(err.message || 'Failed to reorder')
      // Refetch on failure to revert.
      fetchAll()
    }
  }

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
        assignment_type: newAssignment.assignment_type,
        standards_tags: standardsTags,
        hints_enabled: hintsEnabled,
        hint_1: hint1 || null,
        hint_2: hint2 || null,
        curriculum_unit_id: newAssignment.curriculum_unit_id || null,
        // Append to the end of the unit by default; teachers reorder with
        // the up/down arrows in the curriculum tab.
        curriculum_order: newAssignment.curriculum_unit_id ? Math.floor(Date.now() / 1000) : null,
        discussion_min_posts: newAssignment.assignment_type === 'discussion' ? newAssignment.discussion_min_posts : null,
        discussion_min_comments: newAssignment.assignment_type === 'discussion' ? newAssignment.discussion_min_comments : null,
        collab_enabled: collabEnabled,
        collab_strategy: collabEnabled ? collabStrategy : null,
        collab_group_size: collabEnabled ? collabGroupSize : null,
      })
      setShowAddAssignment(false)
      setNewAssignment({ title: '', instructions: '', due_date: '', min_commits: 3, scaffold_level: 'typed_python', starter_code: '', assignment_type: 'code', curriculum_unit_id: '', discussion_min_posts: 1, discussion_min_comments: 2 })
      setStandardsTags([])
      setHintsEnabled(true)
      setHint1('')
      setHint2('')
      setCollabEnabled(false)
      setCollabStrategy('random')
      setCollabGroupSize(2)
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

  const handleDeleteAssignment = async (assignmentId: string, title: string) => {
    if (!confirm(`Delete "${title}"? This removes the assignment AND every student submission tied to it. This can't be undone.`)) return
    try {
      await api.delete(`/assignments/${assignmentId}`)
      fetchAll()
    } catch (err: any) {
      alert(err.message || 'Could not delete assignment.')
    }
  }

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
          {(['students', 'assignments', 'curriculum', 'help queue', 'settings'] as Tab[]).map(t => (
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
                      <Link href={`/student/${s.student_id}`} style={{ fontSize: '14px', fontWeight: 500, color: '#0E2D6E', textDecoration: 'none' }}>{s.student_name}</Link>
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
        {tab === 'assignments' && (() => {
          // Pull curriculum assignments unlocked for this classroom and
          // merge them into the assignments list so teachers see one
          // unified actionable surface. Hide discussions when the
          // classroom toggle is off.
          const discussionsAllowed = classroom?.discussion_enabled !== false
          const unlockedCurricAssts = curriculumUnits.flatMap(u =>
            (u.curriculum_assignments || [])
              .filter(a => a.is_published && unlockedAsstIds.has(a.id))
              .filter(a => discussionsAllowed || a.assignment_type !== 'discussion')
              .map(a => ({ ...a, _unitTitle: u.title, _unitOrder: u.order_index }))
          )
          const hasAny = assignments.length > 0 || unlockedCurricAssts.length > 0
          const curricTypeColors: Record<string, { bg: string; color: string; label: string }> = {
            code:        { bg: '#EBF1FD', color: '#0C447C', label: 'coding' },
            activity:    { bg: '#F3E8FF', color: '#6B21A8', label: 'activity' },
            checkin:     { bg: '#FEF3C7', color: '#92400E', label: 'check-in' },
            quiz:        { bg: '#FCE7F3', color: '#9D174D', label: 'quiz' },
            project:     { bg: '#FEF3C7', color: '#92400E', label: 'project' },
            code_review: { bg: '#E0E7FF', color: '#3730A3', label: 'code review' },
            discussion:  { bg: '#E0F2FE', color: '#075985', label: 'discussion' },
          }
          return (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                <button onClick={() => setShowAddAssignment(true)} style={{ padding: '9px 18px', background: '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                  + new assignment
                </button>
              </div>

              {!hasAny ? (
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
                        <button
                          onClick={() => handleDeleteAssignment(a.id, a.title)}
                          title="delete this assignment"
                          style={{ padding: '7px 12px', borderRadius: '8px', border: '1.5px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#991B1B', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap' }}
                        >
                          delete
                        </button>
                      </div>
                    )
                  })}

                  {unlockedCurricAssts.length > 0 && (
                    <div style={{ marginTop: '0.5rem', padding: '8px 14px', fontSize: '11px', fontWeight: 700, color: '#888780', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      from the curriculum
                    </div>
                  )}
                  {unlockedCurricAssts.map(a => {
                    const tc = curricTypeColors[a.assignment_type] || curricTypeColors.code
                    return (
                      <div key={`ca-${a.id}`} style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: '14px', color: '#0E2D6E' }}>{a.title}</span>
                            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: tc.bg, color: tc.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{tc.label}</span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#888780' }}>{a._unitTitle}</div>
                        </div>
                        <Link href={`/classroom/${classroomId}/curriculum-submissions/${a.id}`} style={{ padding: '7px 16px', background: '#EBF1FD', color: '#0C447C', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          view submissions
                        </Link>
                        <Link href={`/curriculum-assignment/${a.id}?classroom_id=${classroomId}`} style={{ padding: '7px 16px', background: '#F1EFE8', color: '#5F5E5A', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          preview →
                        </Link>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}

        {/* ── CURRICULUM TAB ── */}
        {tab === 'curriculum' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>curriculum content</h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#888780' }}>
                  Lessons, projects, and assignments authored at the curriculum level — available to your students by default.
                  Click any item to preview what students will see.
                </p>
              </div>
              <a
                href={`/learn/${classroomId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ padding: '8px 16px', borderRadius: '8px', background: '#EBF1FD', color: '#0C447C', fontSize: '13px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', border: '1.5px solid rgba(26,86,219,0.2)' }}
                title="opens the student-facing classroom view in a new tab"
              >
                👁 view as student
              </a>
            </div>

            {curriculumLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#888780', fontSize: '14px', background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)' }}>loading...</div>
            ) : curriculumUnits.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)' }}>
                <p style={{ color: '#888780', fontSize: '14px', margin: 0 }}>no published curriculum yet</p>
              </div>
            ) : (
              curriculumUnits.map(unit => {
                type MergedRow =
                  | { kind: 'lesson'; data: CurriculumLesson; order_index: number; id: string }
                  | { kind: 'project'; data: CurriculumProject; order_index: number; id: string }
                  | { kind: 'assignment'; data: CurriculumAssignmentRow; order_index: number; id: string }
                  | { kind: 'teacher_assignment'; data: Assignment; order_index: number; id: string }
                const teacherAssignmentsInUnit = assignments
                  .filter(a => a.curriculum_unit_id === unit.id)
                const discussionsAllowed = classroom?.discussion_enabled !== false
                const merged: MergedRow[] = [
                  ...(unit.lessons || []).filter(l => l.is_published).map(l => ({ kind: 'lesson' as const, data: l, order_index: l.order_index, id: l.id })),
                  ...(unit.projects || []).filter(p => p.is_published).map(p => ({ kind: 'project' as const, data: p, order_index: p.order_index, id: p.id })),
                  ...(unit.curriculum_assignments || [])
                    .filter(a => a.is_published)
                    .filter(a => discussionsAllowed || a.assignment_type !== 'discussion')
                    .map(a => ({ kind: 'assignment' as const, data: a, order_index: a.order_index, id: a.id })),
                  ...teacherAssignmentsInUnit
                    .filter(a => discussionsAllowed || a.assignment_type !== 'discussion')
                    .map(a => ({ kind: 'teacher_assignment' as const, data: a, order_index: a.curriculum_order || 9999, id: a.id })),
                ].sort((a, b) => {
                  if (a.order_index !== b.order_index) return a.order_index - b.order_index
                  const rank = { lesson: 0, project: 1, assignment: 2, teacher_assignment: 3 }
                  return rank[a.kind] - rank[b.kind]
                })
                if (merged.length === 0) return null

                // Unit-level "assign all / unassign all" toggle. The unit is
                // considered fully-assigned when every lesson + project +
                // assignment is already unlocked for this classroom.
                const unitContentIds = merged.filter(m => m.kind !== 'teacher_assignment')
                const allAssigned = unitContentIds.length > 0 && unitContentIds.every(m => {
                  if (m.kind === 'lesson') return unlockedLessonIds.has(m.id)
                  if (m.kind === 'project') return unlockedProjectIds.has(m.id)
                  if (m.kind === 'assignment') return unlockedAsstIds.has(m.id)
                  return true
                })
                const unitBusy = busyUnlock === `unit:${unit.id}`

                const typeColors: Record<string, { bg: string; color: string; label: string }> = {
                  code:     { bg: '#EBF1FD', color: '#0C447C', label: 'coding' },
                  activity: { bg: '#F3E8FF', color: '#6B21A8', label: 'activity' },
                  checkin:  { bg: '#FEF3C7', color: '#92400E', label: 'check-in' },
                  quiz:     { bg: '#FCE7F3', color: '#9D174D', label: 'quiz' },
                  project:  { bg: '#FEF3C7', color: '#92400E', label: 'project' },
                }

                return (
                  <div key={unit.id} style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 1.25rem', background: '#F8F7F5', borderBottom: '1px solid rgba(14,45,110,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#0E2D6E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{unit.title}</span>
                        <span style={{ fontSize: '11px', color: '#888780' }}>· {merged.length} item(s)</span>
                      </div>
                      {unitContentIds.length > 0 && (
                        <button
                          onClick={() => toggleAssignUnit(unit.id, allAssigned)}
                          disabled={unitBusy}
                          style={{
                            padding: '6px 12px', borderRadius: '8px', border: 'none',
                            background: allAssigned ? '#DCFCE7' : '#1A56DB',
                            color: allAssigned ? '#166534' : 'white',
                            fontSize: '12px', fontWeight: 600, cursor: unitBusy ? 'wait' : 'pointer',
                            fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
                          }}
                          title={allAssigned ? 'unassign every lesson, project, and assignment in this unit' : 'assign every lesson, project, and assignment in this unit'}
                        >
                          {unitBusy ? '...' : allAssigned ? '✓ unit assigned · unassign' : '+ assign unit'}
                        </button>
                      )}
                    </div>

                    {merged.map((item, i) => {
                      const stepNum = i + 1
                      const assignBtn = (kind: 'lesson' | 'project' | 'assignment', id: string) => {
                        const assigned = kind === 'lesson' ? unlockedLessonIds.has(id)
                          : kind === 'project' ? unlockedProjectIds.has(id)
                          : unlockedAsstIds.has(id)
                        const busy = busyUnlock === `${kind}:${id}`
                        return (
                          <button
                            onClick={() => toggleAssign(kind, id, assigned)}
                            disabled={busy}
                            style={{
                              padding: '6px 12px', borderRadius: '8px', border: 'none',
                              background: assigned ? '#DCFCE7' : '#EBF1FD',
                              color: assigned ? '#166534' : '#0C447C',
                              fontSize: '12px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
                              fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
                            }}
                            title={assigned ? 'visible to students — click to unassign' : 'click to make visible to students'}
                          >
                            {busy ? '...' : assigned ? '✓ assigned' : '+ assign'}
                          </button>
                        )
                      }
                      if (item.kind === 'lesson') {
                        const l = item.data
                        return (
                          <div key={`lesson-${l.id}`} style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid rgba(14,45,110,0.05)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#EBF1FD', border: '1.5px solid #B6CCFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#0C447C', flexShrink: 0 }}>{stepNum}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '14px', fontWeight: 500, color: '#0E2D6E' }}>{l.title}</span>
                                <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C', textTransform: 'uppercase', letterSpacing: '0.05em' }}>lesson</span>
                              </div>
                            </div>
                            {assignBtn('lesson', l.id)}
                            <Link href={`/lesson/${l.id}`} style={{ padding: '6px 14px', borderRadius: '8px', background: '#F1EFE8', color: '#5F5E5A', fontSize: '12px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>preview →</Link>
                          </div>
                        )
                      }
                      if (item.kind === 'project') {
                        const p = item.data
                        return (
                          <div key={`project-${p.id}`} style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid rgba(14,45,110,0.05)', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(254,243,199,0.25)' }}>
                            <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#FEF3C7', border: '1.5px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#92400E', flexShrink: 0 }}>{stepNum}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '14px', fontWeight: 500, color: '#0E2D6E' }}>{p.title}</span>
                                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: '#FEF3C7', color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>project</span>
                              </div>
                              {p.description && <div style={{ fontSize: '12px', color: '#5F5E5A', marginTop: '2px' }}>{p.description}</div>}
                            </div>
                            {assignBtn('project', p.id)}
                            <Link href={`/project/${p.id}`} style={{ padding: '6px 14px', borderRadius: '8px', background: '#F1EFE8', color: '#5F5E5A', fontSize: '12px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>preview →</Link>
                          </div>
                        )
                      }
                      if (item.kind === 'assignment') {
                        const a = item.data
                        const tc = typeColors[a.assignment_type] || typeColors.code
                        const isReview = a.assignment_type === 'code_review'
                        const generatePairings = async () => {
                          try {
                            const res = await api.post<{ created: number; total_pairs: number; strategy: string }>(
                              `/curriculum/code-review/${a.id}/classroom/${classroomId}/generate-pairings?replace=true`,
                              {}
                            )
                            alert(`Created ${res.created} pairings using "${res.strategy}". ${res.total_pairs} students paired total.`)
                          } catch (err: any) {
                            alert(err.message || 'Failed to generate pairings')
                          }
                        }
                        return (
                          <div key={`assignment-${a.id}`} style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid rgba(14,45,110,0.05)', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(224,242,254,0.25)' }}>
                            <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#E0F2FE', border: '1.5px solid #BAE6FD', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#075985', flexShrink: 0 }}>{stepNum}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '14px', fontWeight: 500, color: '#0E2D6E' }}>{a.title}</span>
                                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: '#E0F2FE', color: '#075985', textTransform: 'uppercase', letterSpacing: '0.05em' }}>assignment</span>
                                <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: tc.bg, color: tc.color }}>{tc.label}</span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
                              {isReview && (
                                <button
                                  onClick={generatePairings}
                                  style={{ padding: '6px 14px', borderRadius: '8px', background: '#FEF3C7', color: '#92400E', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: 'none', whiteSpace: 'nowrap' }}
                                  title="generates or regenerates the reviewer↔reviewee pairings for this classroom"
                                >
                                  ⚏ pairings
                                </button>
                              )}
                              <button
                                onClick={() => setOpenGroupsForAsst({ kind: 'curriculum', id: a.id })}
                                style={{ padding: '6px 12px', borderRadius: '8px', background: '#EBF1FD', color: '#0C447C', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: 'none', whiteSpace: 'nowrap' }}
                                title="manage collab groups for this assignment"
                              >
                                ⚏ groups
                              </button>
                              {assignBtn('assignment', a.id)}
                              <Link href={`/curriculum-assignment/${a.id}?classroom_id=${classroomId}`} style={{ padding: '6px 14px', borderRadius: '8px', background: '#F1EFE8', color: '#5F5E5A', fontSize: '12px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>preview →</Link>
                              <Link href={`/classroom/${classroomId}/curriculum-grading/${a.id}`} style={{ padding: '6px 14px', borderRadius: '8px', background: '#EBF1FD', color: '#0C447C', fontSize: '12px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>grade →</Link>
                            </div>
                          </div>
                        )
                      }

                      // Teacher's own classroom assignment, attached to this unit
                      const ta = item.data
                      const tatc = typeColors[ta.assignment_type || 'code'] || typeColors.code
                      const isFirst = i === 0
                      const isLast = i === merged.length - 1
                      const arrowBtn = (disabled: boolean): React.CSSProperties => ({
                        width: '24px', height: '20px', padding: 0, borderRadius: '4px',
                        border: disabled ? '1px solid rgba(14,45,110,0.08)' : '1.5px solid #166534',
                        background: disabled ? 'transparent' : '#DCFCE7',
                        color: disabled ? '#D3D1C7' : '#166534',
                        fontSize: '11px', fontWeight: 700,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        lineHeight: 1,
                      })
                      return (
                        <div key={`teacher-${ta.id}`} style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid rgba(14,45,110,0.05)', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(220,252,231,0.35)' }}>
                          <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#DCFCE7', border: '1.5px solid #BBF7D0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#166534', flexShrink: 0 }}>{stepNum}</span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                            <button onClick={() => moveTeacherAssignment(ta.id, merged, -1)} disabled={isFirst} style={arrowBtn(isFirst)} title="move up">↑</button>
                            <button onClick={() => moveTeacherAssignment(ta.id, merged, 1)} disabled={isLast} style={arrowBtn(isLast)} title="move down">↓</button>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '14px', fontWeight: 500, color: '#0E2D6E' }}>{ta.title}</span>
                              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: '#DCFCE7', color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em' }}>yours</span>
                              <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: tatc.bg, color: tatc.color }}>{tatc.label}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => setOpenGroupsForAsst({ kind: 'classroom', id: ta.id })}
                            style={{ padding: '6px 12px', borderRadius: '8px', background: '#EBF1FD', color: '#0C447C', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: 'none', whiteSpace: 'nowrap' }}
                            title="manage collab groups for this assignment"
                          >
                            ⚏ groups
                          </button>
                          <Link href={ta.assignment_type === 'code' || !ta.assignment_type ? `/classroom/${classroomId}/submissions/${ta.id}` : `/classroom/${classroomId}/curriculum-submissions/${ta.id}`} style={{ padding: '6px 14px', borderRadius: '8px', background: '#EBF1FD', color: '#0C447C', fontSize: '12px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>submissions →</Link>
                          <button
                            onClick={() => handleDeleteAssignment(ta.id, ta.title)}
                            title="delete this assignment"
                            style={{ padding: '6px 10px', borderRadius: '8px', border: '1.5px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#991B1B', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap' }}
                          >
                            delete
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>
        )}

        {openGroupsForAsst && (
          <GroupsManager
            classroomId={classroomId}
            assignmentId={openGroupsForAsst.kind === 'classroom' ? openGroupsForAsst.id : undefined}
            curriculumAssignmentId={openGroupsForAsst.kind === 'curriculum' ? openGroupsForAsst.id : undefined}
            onClose={() => setOpenGroupsForAsst(null)}
          />
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

            <div style={{ marginTop: '1.5rem', padding: '1.25rem', border: '1px solid rgba(14,45,110,0.08)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <h4 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>assigned auto-adds to to-do</h4>
                <p style={{ margin: 0, fontSize: '12px', color: '#888780', lineHeight: 1.55 }}>
                  When on, every lesson, project, and curriculum assignment you assign drops automatically into every student&apos;s to-do column on their kanban board. Students can&apos;t remove these manually — the per-item and per-unit add buttons in their classroom view become checked + greyed.
                </p>
              </div>
              <div
                onClick={async () => {
                  const next = !classroom.auto_add_assigned_to_todo
                  try {
                    await api.patch(`/classrooms/${classroomId}`, { auto_add_assigned_to_todo: next })
                    setClassroom(c => c ? { ...c, auto_add_assigned_to_todo: next } : c)
                  } catch (err: any) {
                    alert(err.message || 'Could not update.')
                  }
                }}
                style={{ width: '44px', height: '24px', borderRadius: '99px', background: classroom.auto_add_assigned_to_todo ? '#1A56DB' : '#D3D1C7', position: 'relative', cursor: 'pointer', flexShrink: 0 }}
              >
                <div style={{ position: 'absolute', top: '3px', left: classroom.auto_add_assigned_to_todo ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: 'white', transition: 'left 0.15s' }} />
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', padding: '1.25rem', border: '1px solid rgba(14,45,110,0.08)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <h4 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>auto-grade coding from test cases</h4>
                <p style={{ margin: 0, fontSize: '12px', color: '#888780', lineHeight: 1.55 }}>
                  When on, submitting a curriculum coding assignment runs every test case and sets the grade to the % of weighted cases that pass. Off = teacher grades manually; students can still hit "run tests" for feedback.
                </p>
              </div>
              <div
                onClick={async () => {
                  const next = !classroom.auto_grade_test_cases
                  try {
                    await api.patch(`/classrooms/${classroomId}`, { auto_grade_test_cases: next })
                    setClassroom(c => c ? { ...c, auto_grade_test_cases: next } : c)
                  } catch (err: any) {
                    alert(err.message || 'Could not update.')
                  }
                }}
                style={{ width: '44px', height: '24px', borderRadius: '99px', background: classroom.auto_grade_test_cases ? '#1A56DB' : '#D3D1C7', position: 'relative', cursor: 'pointer', flexShrink: 0 }}
              >
                <div style={{ position: 'absolute', top: '3px', left: classroom.auto_grade_test_cases ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: 'white', transition: 'left 0.15s' }} />
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', padding: '1.25rem', border: '1px solid rgba(14,45,110,0.08)', borderRadius: '10px' }}>
              <h4 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>discussion name display</h4>
              <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#888780', lineHeight: 1.55 }}>
                how each student&apos;s name appears next to their posts and comments on discussion boards in this classroom.
              </p>
              <select
                value={classroom.discussion_name_display || 'first_name'}
                onChange={async e => {
                  const v = e.target.value as 'first_name' | 'first_last_initial' | 'full_name'
                  try {
                    await api.patch(`/classrooms/${classroomId}`, { discussion_name_display: v })
                    setClassroom(c => c ? { ...c, discussion_name_display: v } : c)
                  } catch (err: any) {
                    alert(err.message || 'Could not update.')
                  }
                }}
                style={{ width: '100%', maxWidth: '320px', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '13px', background: '#FAFAF8', fontFamily: "'DM Sans', sans-serif", cursor: 'pointer' }}
              >
                <option value="first_name">First name only (e.g. "Alex")</option>
                <option value="first_last_initial">First name + last initial (e.g. "Alex J.")</option>
                <option value="full_name">Full name (e.g. "Alex Johnson")</option>
              </select>
            </div>

            <div style={{ marginTop: '1.5rem', padding: '1.25rem', border: '1px solid rgba(14,45,110,0.08)', borderRadius: '10px' }}>
              <h4 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>collaboration defaults</h4>
              <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#888780', lineHeight: 1.55 }}>
                Defaults applied to every collab-enabled assignment in this classroom. Individual assignments can override any of these.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#0E2D6E', marginBottom: '4px' }}>default group size</label>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={classroom.collab_default_group_size ?? 2}
                    onChange={async e => {
                      const v = Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 2))
                      try {
                        await api.patch(`/classrooms/${classroomId}`, { collab_default_group_size: v })
                        setClassroom(c => c ? { ...c, collab_default_group_size: v } : c)
                      } catch (err: any) {
                        alert(err.message || 'Could not update.')
                      }
                    }}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '13px', background: '#FAFAF8', fontFamily: "'DM Sans', sans-serif" }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#0E2D6E', marginBottom: '4px' }}>default grouping strategy</label>
                  <select
                    value={classroom.collab_default_strategy ?? 'random'}
                    onChange={async e => {
                      const v = e.target.value as Classroom['collab_default_strategy']
                      try {
                        await api.patch(`/classrooms/${classroomId}`, { collab_default_strategy: v })
                        setClassroom(c => c ? { ...c, collab_default_strategy: v } : c)
                      } catch (err: any) {
                        alert(err.message || 'Could not update.')
                      }
                    }}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '13px', background: '#FAFAF8', fontFamily: "'DM Sans', sans-serif", cursor: 'pointer' }}
                  >
                    <option value="random">Random</option>
                    <option value="similar_grade">By grade (similar)</option>
                    <option value="opposite_grade">By grade (opposite)</option>
                    <option value="manual">Manual (teacher picks)</option>
                    <option value="student_choice">Student choice</option>
                  </select>
                </div>
              </div>
              {(['collab_allow_student_choice', 'collab_allow_solo'] as const).map(key => {
                const checked = !!classroom[key]
                const label = key === 'collab_allow_student_choice'
                  ? 'Students can form their own groups'
                  : 'Students can choose to work solo'
                const desc = key === 'collab_allow_student_choice'
                  ? 'Lets students create new groups or join existing ones from the assignment page.'
                  : 'Lets students opt out of group work entirely on a collab assignment.'
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid rgba(14,45,110,0.05)' }}>
                    <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0E2D6E' }}>{label}</div>
                      <div style={{ fontSize: '11px', color: '#888780', lineHeight: 1.5 }}>{desc}</div>
                    </div>
                    <div
                      onClick={async () => {
                        const next = !checked
                        try {
                          await api.patch(`/classrooms/${classroomId}`, { [key]: next })
                          setClassroom(c => c ? { ...c, [key]: next } : c)
                        } catch (err: any) {
                          alert(err.message || 'Could not update.')
                        }
                      }}
                      style={{ width: '40px', height: '22px', borderRadius: '99px', background: checked ? '#1A56DB' : '#D3D1C7', position: 'relative', cursor: 'pointer', flexShrink: 0 }}
                    >
                      <div style={{ position: 'absolute', top: '3px', left: checked ? '21px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.15s' }} />
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <GradeWeightSettings classroomId={classroomId} />
            </div>
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
              <div style={{ display: 'grid', gridTemplateColumns: newAssignment.assignment_type === 'code' ? '1fr 1fr' : '1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>assignment type</label>
                  <select value={newAssignment.assignment_type} onChange={e => setNewAssignment(s => ({ ...s, assignment_type: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                    {ASSIGNMENT_TYPE_OPTIONS
                      .filter(o => classroom?.discussion_enabled !== false || o.value !== 'discussion')
                      .map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {newAssignment.assignment_type === 'code' && (
                  <>
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
                  </>
                )}
              </div>
              {newAssignment.assignment_type === 'discussion' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={labelStyle}>required posts (own threads)</label>
                    <input type="number" min={0} value={newAssignment.discussion_min_posts} onChange={e => setNewAssignment(s => ({ ...s, discussion_min_posts: parseInt(e.target.value, 10) || 0 }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>required comments (on others)</label>
                    <input type="number" min={0} value={newAssignment.discussion_min_comments} onChange={e => setNewAssignment(s => ({ ...s, discussion_min_comments: parseInt(e.target.value, 10) || 0 }))} style={inputStyle} />
                  </div>
                </div>
              )}
              <div>
                <label style={labelStyle}>due date <span style={{ color: '#888780', fontWeight: 400 }}>(optional)</span></label>
                <input type="datetime-local" value={newAssignment.due_date} onChange={e => setNewAssignment(s => ({ ...s, due_date: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>add to curriculum unit <span style={{ color: '#888780', fontWeight: 400 }}>(optional — only your classroom; use the up/down arrows in the curriculum tab to reorder later)</span></label>
                <select
                  value={newAssignment.curriculum_unit_id}
                  onChange={e => setNewAssignment(s => ({ ...s, curriculum_unit_id: e.target.value }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">— not in curriculum —</option>
                  {curriculumUnits.map(u => (
                    <option key={u.id} value={u.id}>unit {u.order_index}: {u.title}</option>
                  ))}
                </select>
              </div>
              {newAssignment.assignment_type === 'code' && (
                <div>
                  <label style={labelStyle}>starter code <span style={{ color: '#888780', fontWeight: 400 }}>(optional)</span></label>
                  <textarea value={newAssignment.starter_code} onChange={e => setNewAssignment(s => ({ ...s, starter_code: e.target.value }))} rows={4} placeholder="# starter code for students..." style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, fontFamily: "'DM Mono', monospace", fontSize: '12px' }} />
                </div>
              )}
              <div>
                <label style={labelStyle}>learning objectives <span style={{ color: '#888780', fontWeight: 400 }}>(optional)</span></label>
                <StandardsPicker selected={standardsTags} onChange={setStandardsTags} />
              </div>

              {/* COLLAB — toggle + per-assignment strategy + size.
                  When the strategy is random / grade-based, the
                  backend auto-fills groups on assignment create AND
                  lazily slots in late-joining students on first
                  open. Manual + student_choice leave group formation
                  to the teacher / students respectively. */}
              <div style={{ padding: '12px 14px', background: '#F8F7F5', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0E2D6E' }}>enable collaboration</div>
                    <div style={{ fontSize: '11px', color: '#888780' }}>students work in groups; pick how to assign them below</div>
                  </div>
                  <div onClick={() => setCollabEnabled(c => !c)} style={{ width: '40px', height: '22px', borderRadius: '99px', background: collabEnabled ? '#1A56DB' : '#D3D1C7', position: 'relative', cursor: 'pointer' }}>
                    <div style={{ position: 'absolute', top: '3px', left: collabEnabled ? '21px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                  </div>
                </div>
                {collabEnabled && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '8px', marginTop: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#0E2D6E', marginBottom: '4px' }}>grouping strategy</label>
                      <select
                        value={collabStrategy}
                        onChange={e => setCollabStrategy(e.target.value as typeof collabStrategy)}
                        style={{ ...inputStyle, cursor: 'pointer', fontSize: '13px' }}
                      >
                        <option value="random">Randomly</option>
                        <option value="similar_grade">By grade (similar)</option>
                        <option value="opposite_grade">By grade (opposite)</option>
                        <option value="manual">Manually (teacher picks)</option>
                        <option value="student_choice">Students choose</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#0E2D6E', marginBottom: '4px' }}>group size</label>
                      <input
                        type="number"
                        min={1}
                        max={6}
                        value={collabGroupSize}
                        onChange={e => setCollabGroupSize(Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 2)))}
                        style={{ ...inputStyle, fontSize: '13px' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* HINTS — coding only */}
              {newAssignment.assignment_type === 'code' && (
                <>
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