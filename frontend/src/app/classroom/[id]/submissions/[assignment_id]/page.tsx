'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import DiffViewer from '@/components/DiffViewer'
import { StandardsBadgeList } from '@/components/Standards'
import { ActivityResponseSummary } from '@/components/ActivityResponsesView'
import AssignmentAnalytics from '@/components/AssignmentAnalytics'

interface Assignment {
  id: string
  title: string
  instructions: string
  min_commits: number
  scaffold_level: string
  due_date: string | null
  starter_code: string
  standards_tags: string[]
}

interface Submission {
  id: string
  student_id: string
  final_code: string
  submitted_at: string | null
  is_late: boolean
  grade: number | null
  teacher_feedback: string | null
  graded_at: string | null
  commit_count: number
  fast_submit_flag: boolean
  time_on_task_seconds: number | null
  hint_count: number
  hint_1_unlocked_at: string | null
  hint_2_unlocked_at: string | null
  penalized_grade: number | null
  late_penalty_applied: number | null
  assignment_type: string
  lesson_id: string | null
  profiles: {
    display_name: string
    email: string
  }
}

interface CommitHistory {
  id: string
  message: string
  line_count: number
  committed_at: string
  code_snapshot: string
}

export default function SubmissionsPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const classroomId = params.id as string
  const assignmentId = params['assignment_id'] as string

  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [selected, setSelected] = useState<Submission | null>(null)
  const [commits, setCommits] = useState<CommitHistory[]>([])
  const [commitsLoading, setCommitsLoading] = useState(false)
  const [viewingCommit, setViewingCommit] = useState<CommitHistory | null>(null)
  const [grade, setGrade] = useState('')
  const [feedback, setFeedback] = useState('')
  const [grading, setGrading] = useState(false)
  const [gradeSuccess, setGradeSuccess] = useState(false)

  const [compareMode, setCompareMode] = useState(false)
  const [compareFrom, setCompareFrom] = useState<CommitHistory | null>(null)
  const [compareTo, setCompareTo] = useState<CommitHistory | null>(null)

  useEffect(() => {
    if (!loading && !profile) router.push('/login')
    if (!loading && profile?.role === 'student') router.push('/learn')
  }, [profile, loading])

  useEffect(() => {
    if (!profile || !assignmentId) return
    fetchData()
  }, [profile, assignmentId])

  const fetchData = async () => {
    setDataLoading(true)
    try {
      const [a, s] = await Promise.all([
        api.get<Assignment>(`/assignments/${assignmentId}`),
        api.get<Submission[]>(`/code/assignment/${assignmentId}`),
      ])
      setAssignment(a)
      setSubmissions(s || [])
    } catch (e) {
      console.error(e)
    } finally {
      setDataLoading(false)
    }
  }

  const selectStudent = async (sub: Submission) => {
    setSelected(sub)
    setGrade(sub.grade?.toString() || '')
    setFeedback(sub.teacher_feedback || '')
    setViewingCommit(null)
    setCompareMode(false)
    setCompareFrom(null)
    setCompareTo(null)
    setCommitsLoading(true)
    try {
      const data = await api.get<CommitHistory[]>(`/code/${sub.id}/commits`)
      setCommits(data || [])
    } catch {
      setCommits([])
    } finally {
      setCommitsLoading(false)
    }
  }

  const handleGrade = async () => {
    if (!selected || !grade) return
    setGrading(true)
    setGradeSuccess(false)
    try {
      await api.patch(`/code/grade/${selected.id}`, {
        grade: parseFloat(grade),
        feedback: feedback || null,
      })
      setGradeSuccess(true)
      setSubmissions(prev => prev.map(s =>
        s.id === selected.id
          ? { ...s, grade: parseFloat(grade), teacher_feedback: feedback }
          : s
      ))
      setSelected(prev => prev ? { ...prev, grade: parseFloat(grade), teacher_feedback: feedback } : prev)
      setTimeout(() => setGradeSuccess(false), 2000)
    } catch (e) {
      console.error(e)
    } finally {
      setGrading(false)
    }
  }

  const handleCompareClick = (c: CommitHistory) => {
    if (!compareFrom) {
      setCompareFrom(c)
      setCompareTo(null)
      return
    }
    if (compareFrom.id === c.id) {
      setCompareFrom(null)
      return
    }
    setCompareTo(c)
  }

  const exitCompare = () => {
    setCompareMode(false)
    setCompareFrom(null)
    setCompareTo(null)
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const submittedCount = submissions.filter(s => s.submitted_at).length
  const gradedCount = submissions.filter(s => s.grade != null).length
  const lateCount = submissions.filter(s => s.is_late).length

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <p style={{ color: '#888780' }}>loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* TOPBAR */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 1.5rem', height: '52px', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '7px', textDecoration: 'none' }}>
          <div style={{ width: '26px', height: '26px', background: '#1A56DB', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'white' }}>{'>'}_</div>
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#0E2D6E', letterSpacing: '-0.02em' }}>commit</span>
        </Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        <Link href={`/classroom/${classroomId}`} style={{ fontSize: '13px', color: '#5F5E5A', textDecoration: 'none', fontWeight: 500 }}>classroom</Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        <span style={{ fontSize: '13px', color: '#0E2D6E', fontWeight: 500 }}>{assignment?.title}</span>
        {(assignment?.standards_tags?.length ?? 0) > 0 && (
          <StandardsBadgeList tags={assignment!.standards_tags} max={6} />
        )}

        {/* STATS */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', fontSize: '12px', color: '#888780' }}>
          <span><strong style={{ color: '#0E2D6E' }}>{submittedCount}</strong> / {submissions.length} submitted</span>
          <span><strong style={{ color: '#0E2D6E' }}>{gradedCount}</strong> graded</span>
          {lateCount > 0 && <span><strong style={{ color: '#991B1B' }}>{lateCount}</strong> late</span>}
        </div>
      </nav>

      <AssignmentAnalytics assignmentId={assignmentId} />

      {/* MAIN — TWO PANEL */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: selected ? '320px 1fr' : '1fr', minHeight: 0 }}>

        {/* LEFT — STUDENT LIST */}
        <div style={{ background: 'white', borderRight: '1px solid rgba(14,45,110,0.08)', overflowY: 'auto' }}>
          {dataLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#888780', fontSize: '14px' }}>loading...</div>
          ) : submissions.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem', opacity: 0.4 }}>◎</div>
              <p style={{ color: '#888780', fontSize: '14px', margin: 0 }}>no submissions yet</p>
            </div>
          ) : (
            submissions.map((sub, i) => {
              const isSelected = selected?.id === sub.id
              const isSubmitted = !!sub.submitted_at
              const hasGrade = sub.grade != null

              return (
                <div key={sub.id} onClick={() => selectStudent(sub)} style={{
                  padding: '1rem 1.25rem',
                  borderBottom: '1px solid rgba(14,45,110,0.05)',
                  cursor: 'pointer',
                  background: isSelected ? '#EBF1FD' : 'transparent',
                  transition: 'background 0.1s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px', color: '#0E2D6E' }}>{sub.profiles?.display_name}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {hasGrade && (
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C' }}>{sub.grade}</span>
                      )}
                      {isSubmitted ? (
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: sub.is_late ? '#FEE2E2' : '#DCFCE7', color: sub.is_late ? '#991B1B' : '#166534' }}>
                          {sub.is_late ? 'late' : 'submitted'}
                        </span>
                      ) : (
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '99px', background: '#F1EFE8', color: '#5F5E5A' }}>in progress</span>
                      )}
                      {sub.fast_submit_flag && (
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#FEF9C3', color: '#854D0E', border: '1px solid rgba(245,158,11,0.3)' }} title="Submitted very quickly — possible academic integrity concern">
                          ⚠️ fast submit
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#888780', display: 'flex', gap: '10px' }}>
                    <span>{sub.commit_count} commit{sub.commit_count !== 1 ? 's' : ''}</span>
                    {isSubmitted && <span>{formatDate(sub.submitted_at)}</span>}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* RIGHT — STUDENT DETAIL */}
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>

            {/* STUDENT HEADER */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(14,45,110,0.08)', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ margin: '0 0 2px', fontSize: '15px', fontWeight: 700, color: '#0E2D6E' }}>{selected.profiles?.display_name}</h2>
                <p style={{ margin: 0, fontSize: '12px', color: '#888780' }}>{selected.profiles?.email}</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {selected.submitted_at && (
                  <span style={{ fontSize: '12px', color: '#5F5E5A' }}>submitted {formatDate(selected.submitted_at)}</span>
                )}
                <Link
                  href={`/classroom/${classroomId}/assignment/${assignmentId}?student=${selected.student_id}`}
                  style={{ padding: '7px 14px', background: '#EBF1FD', color: '#0C447C', borderRadius: '7px', fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}
                >
                  open in editor →
                </Link>
              </div>
            </div>

            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 280px', minHeight: 0 }}>

              {/* CODE + COMMITS */}
              <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(14,45,110,0.08)' }}>

                {/* COMMIT TIMELINE */}
                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(14,45,110,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780' }}>
                      commit history ({selected.commit_count})
                    </div>
                    {commits.length >= 2 && (
                      compareMode ? (
                        <button onClick={exitCompare} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(245,158,11,0.1)', color: '#854D0E', border: '1px solid rgba(245,158,11,0.3)', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>exit compare</button>
                      ) : (
                        <button onClick={() => { setCompareMode(true); setViewingCommit(null) }} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#EBF1FD', color: '#0C447C', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>compare</button>
                      )
                    )}
                  </div>
                  {commitsLoading ? (
                    <p style={{ fontSize: '13px', color: '#888780', margin: 0 }}>loading commits...</p>
                  ) : commits.length === 0 ? (
                    <p style={{ fontSize: '13px', color: '#888780', margin: 0 }}>no commits yet</p>
                  ) : (
                    <div style={{ display: 'flex', gap: 0, overflowX: 'auto', paddingBottom: '4px', position: 'relative' }}>
                      <div style={{ position: 'absolute', top: '10px', left: '10px', right: '10px', height: '1.5px', background: 'rgba(26,86,219,0.2)', zIndex: 0 }} />
                      {commits.map((c, i) => {
                        const isLast = i === commits.length - 1
                        const isViewing = viewingCommit?.id === c.id
                        const isFrom = compareMode && compareFrom?.id === c.id
                        const isTo = compareMode && compareTo?.id === c.id
                        const dotBg = isFrom ? '#F59E0B' : isTo || isViewing ? '#1A56DB' : isLast ? '#EBF1FD' : 'white'
                        const dotShadow = isFrom ? '0 0 0 3px rgba(245,158,11,0.2)' : isLast || isTo ? '0 0 0 3px rgba(26,86,219,0.15)' : 'none'
                        return (
                          <div key={c.id} onClick={() => compareMode ? handleCompareClick(c) : setViewingCommit(isViewing ? null : c)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: '80px', cursor: 'pointer', position: 'relative', zIndex: 1, padding: '0 4px' }}>
                            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: dotBg, border: `2px solid ${isFrom ? '#F59E0B' : '#1A56DB'}`, flexShrink: 0, boxShadow: dotShadow }} />
                            <div style={{ fontSize: '10px', color: isFrom ? '#854D0E' : isTo || isViewing ? '#1A56DB' : '#5F5E5A', textAlign: 'center', lineHeight: 1.3, maxWidth: '72px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isFrom || isTo || isViewing ? 600 : 400 }}>{c.message}</div>
                            <div style={{ fontSize: '10px', color: '#888780', fontFamily: "'DM Mono', monospace" }}>{c.line_count}L</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* CODE VIEW */}
                <div style={{ flex: 1, background: '#1C1C1E', overflow: 'auto' }}>
                  {compareMode && compareFrom && compareTo ? (
                    <DiffViewer
                      oldCode={compareFrom.code_snapshot}
                      newCode={compareTo.code_snapshot}
                      oldLabel={compareFrom.message}
                      newLabel={compareTo.message}
                    />
                  ) : compareMode ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '13px', fontFamily: "'DM Sans', sans-serif" }}>
                      {compareFrom ? 'now pick a second commit to compare' : 'click a commit to start comparing'}
                    </div>
                  ) : viewingCommit ? (
                    <div>
                      <div style={{ padding: '8px 1rem', background: '#2A2A2C', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                        viewing: <strong style={{ color: 'white' }}>{viewingCommit.message}</strong>
                        <span style={{ marginLeft: '12px', color: 'rgba(255,255,255,0.3)' }}>{formatDate(viewingCommit.committed_at)}</span>
                      </div>
                      <pre style={{ margin: 0, padding: '1.25rem', fontFamily: "'DM Mono', monospace", fontSize: '13px', color: '#9FE1CB', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {viewingCommit.code_snapshot}
                      </pre>
                    </div>
                  ) : (
                    <div>
                      <div style={{ padding: '8px 1rem', background: '#2A2A2C', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                        final submission
                      </div>
                      <pre style={{ margin: 0, padding: '1.25rem', fontFamily: "'DM Mono', monospace", fontSize: '13px', color: '#EBF1FD', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {selected.final_code || '# no code submitted yet'}
                      </pre>
                    </div>
                  )}
                </div>
              </div>

              {/* GRADING PANEL */}
              <div style={{ padding: '1.25rem', background: '#FAFAF8', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780', marginBottom: '12px' }}>grade</div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#0E2D6E', marginBottom: '5px' }}>score</label>
                    <input
                      type="number" min="0" max="100" step="0.5"
                      value={grade} onChange={e => setGrade(e.target.value)}
                      placeholder="0 – 100"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: 'white', fontFamily: "'DM Sans', sans-serif" }}
                    />
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#0E2D6E', marginBottom: '5px' }}>feedback</label>
                    <textarea
                      value={feedback} onChange={e => setFeedback(e.target.value)}
                      placeholder="Leave feedback for the student..."
                      rows={5}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: 'white', fontFamily: "'DM Sans', sans-serif", resize: 'vertical', lineHeight: 1.6 }}
                    />
                  </div>

                  <button onClick={handleGrade} disabled={grading || !grade} style={{ width: '100%', padding: '9px', background: gradeSuccess ? '#22C55E' : grade ? '#1A56DB' : '#D3D1C7', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: grade ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans', sans-serif", transition: 'background 0.2s' }}>
                    {grading ? 'saving...' : gradeSuccess ? '✓ saved!' : 'save grade'}
                  </button>

                  {selected.is_late && selected.late_penalty_applied != null && selected.late_penalty_applied > 0 && (
                    <div style={{ padding: '8px 12px', background: '#FEE2E2', borderRadius: '8px', fontSize: '12px', color: '#991B1B' }}>
                      late penalty: -{selected.late_penalty_applied} pts → final grade: <strong>{selected.penalized_grade}</strong>
                    </div>
                  )}
                </div>

                {/* SUBMISSION INFO */}
                <div style={{ padding: '1rem', background: 'white', borderRadius: '10px', border: '1px solid rgba(14,45,110,0.08)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780', marginBottom: '10px' }}>info</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#888780' }}>commits</span>
                      <span style={{ color: '#0E2D6E', fontWeight: 500 }}>{selected.commit_count} / {assignment?.min_commits} required</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#888780' }}>submitted</span>
                      <span style={{ color: selected.submitted_at ? '#166534' : '#888780', fontWeight: selected.submitted_at ? 500 : 400 }}>{selected.submitted_at ? formatDate(selected.submitted_at) : 'not yet'}</span>
                    </div>
                    {selected.is_late && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#888780' }}>status</span>
                        <span style={{ color: '#991B1B', fontWeight: 600 }}>late</span>
                      </div>
                    )}
                    {selected.graded_at && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#888780' }}>graded</span>
                        <span style={{ color: '#0E2D6E', fontWeight: 500 }}>{formatDate(selected.graded_at)}</span>
                      </div>
                    )}
                    {selected.time_on_task_seconds != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#888780' }}>time on task</span>
                        <span style={{ color: selected.fast_submit_flag ? '#854D0E' : '#0E2D6E', fontWeight: 500 }}>
                          {selected.time_on_task_seconds < 60
                            ? `${selected.time_on_task_seconds}s ⚠️`
                            : selected.time_on_task_seconds < 3600
                            ? `${Math.floor(selected.time_on_task_seconds / 60)}m`
                            : `${Math.floor(selected.time_on_task_seconds / 3600)}h ${Math.floor((selected.time_on_task_seconds % 3600) / 60)}m`
                          }
                        </span>
                      </div>
                    )}
                    {(selected.hint_count || 0) > 0 ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#888780' }}>hints used</span>
                        <span style={{ color: '#854D0E', fontWeight: 600 }}>
                          {selected.hint_count} hint{selected.hint_count !== 1 ? 's' : ''}
                          {selected.hint_1_unlocked_at && ' · h1'}
                          {selected.hint_2_unlocked_at && ' · h2'}
                        </span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#888780' }}>hints used</span>
                        <span style={{ color: '#888780' }}>none</span>
                      </div>
                    )}
                  </div>
                </div>

                {selected.assignment_type !== 'code' && selected.lesson_id && (
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#888780', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>activity responses</div>
                    <ActivityResponseSummary lessonId={selected.lesson_id} />
                    <Link href={`/activity/${selected.lesson_id}/responses`} style={{ fontSize: '12px', color: '#1A56DB', fontWeight: 600, textDecoration: 'none', display: 'block', marginTop: '8px' }}>
                      view all student responses →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
