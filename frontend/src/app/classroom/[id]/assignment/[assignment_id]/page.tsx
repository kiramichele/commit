'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import ReadAloud from '@/components/ReadAloud'
import ErrorPanel from '@/components/ErrorPanel'
import type { ScaffoldLevel } from '@/lib/errorInterpreter'
import HintPanel from '@/components/HintPanel'

interface Assignment {
  id: string
  title: string
  instructions: string
  min_commits: number
  scaffold_level: string
  due_date: string | null
  starter_code: string
  hints_enabled: boolean
  lesson_id: string | null
}

interface Submission {
  id: string
  final_code: string
  submitted_at: string | null
  is_late: boolean
  grade: number | null
  teacher_feedback: string | null
}

interface Commit {
  id: string
  message: string
  line_count: number
  committed_at: string
}

export default function AssignmentEditorPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const assignmentId = params.assignment_id as string
  const classroomId = params.id as string

  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [commits, setCommits] = useState<Commit[]>([])
  const [code, setCode] = useState('')
  const [output, setOutput] = useState('')
  const [outputError, setOutputError] = useState(false)
  const [running, setRunning] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [showCommitPanel, setShowCommitPanel] = useState(false)
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [viewingCode, setViewingCode] = useState<string | null>(null)
  const [viewingMsg, setViewingMsg] = useState<string | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState('')
  const [flashCommit, setFlashCommit] = useState(false)
  const [helpRequested, setHelpRequested] = useState(false)
  const [helpRequestId, setHelpRequestId] = useState<string | null>(null)
  const [helpNote, setHelpNote] = useState('')
  const [showHelpModal, setShowHelpModal] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [runCount, setRunCount] = useState(0)
  const [hasEditedSinceRun, setHasEditedSinceRun] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!profile) router.push('/login')
  }, [profile, loading])

  useEffect(() => {
    if (!profile || !assignmentId) return
    loadAssignment()
  }, [profile, assignmentId])

  useEffect(() => {
    if (submission) {
      setRunCount((submission as any).run_count || 0)
      setHasEditedSinceRun((submission as any).has_edited_since_last_run || false)
    }
  }, [submission?.id])

  const handleFindInDocs = (docsKey: string) => {
    if (!assignment?.lesson_id) return
    window.open(`/lesson/${assignment.lesson_id}?tab=docs&search=${encodeURIComponent(docsKey)}`, '_blank')
  }

  const handleFindInLesson = (hint: string) => {
    if (!assignment?.lesson_id) return
    window.open(`/lesson/${assignment.lesson_id}?tab=lesson&hint=${encodeURIComponent(hint)}`, '_blank')
  }

  const loadAssignment = async () => {
    setDataLoading(true)
    try {
      const data = await api.post<{ submission: Submission; commits: Commit[]; assignment: Assignment }>(
        `/code/open?assignment_id=${assignmentId}`, {}
      )
      setAssignment(data.assignment)
      setSubmission(data.submission)
      setCommits(data.commits)
      setCode(data.submission.final_code || data.assignment.starter_code || '')

      // Check for existing open help request
      const helpReq = await api.get<{ id: string } | null>(
        `/help/student/${data.submission.id}`
      ).catch(() => null)
      if (helpReq) {
        setHelpRequested(true)
        setHelpRequestId(helpReq.id)
      }
    } catch (e: any) {
      setError(e.message || 'Could not load assignment.')
    } finally {
      setDataLoading(false)
    }
  }

  const handleRun = async () => {
    setRunning(true)
    setOutput('')
    setOutputError(false)
    try {
      const result = await api.post<{ stdout: string; stderr: string; exit_code: number; output: string }>(
        '/code/run', { code }
      )
      if (result.stderr && !result.stdout) {
        setOutput(result.stderr)
        setOutputError(true)
      } else {
        setOutput(result.output || result.stdout || '(no output)')
        setOutputError(false)
      }
    } catch (e: any) {
      setOutput(e.message || 'Execution failed.')
      setOutputError(true)
    } finally {
      setRunning(false)
      if (submission) {
        api.post<{ run_count: number }>('/code/track-run', {
          submission_id: submission.id,
          code_changed: hasEditedSinceRun,
        }).then(r => { setRunCount(r.run_count); setHasEditedSinceRun(false) }).catch(() => {})
      }
    }
  }

  const handleCommit = async () => {
    if (!submission || commitMsg.trim().length < 3) return
    setCommitting(true)
    try {
      const result = await api.post<{ commit: Commit; all_commits: Commit[] }>(
        '/code/commit',
        { submission_id: submission.id, code, message: commitMsg.trim() }
      )
      setCommits(result.all_commits)
      setCommitMsg('')
      setShowCommitPanel(false)
      setFlashCommit(true)
      setTimeout(() => setFlashCommit(false), 1000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCommitting(false)
    }
  }

  const handleSubmit = async () => {
    if (!submission) return
    if (commits.length < (assignment?.min_commits || 1)) {
      setError(`You need at least ${assignment?.min_commits} commit${(assignment?.min_commits || 1) !== 1 ? 's' : ''} before submitting. You have ${commits.length}.`)
      return
    }
    setSubmitLoading(true)
    setError('')
    try {
      const updated = await api.post<Submission>('/code/submit', { submission_id: submission.id })
      setSubmission(updated)
    } catch (e: any) {
      setError(e.message || 'Could not submit.')
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleHelpRequest = async () => {
    if (!submission) return
    if (helpRequested && helpRequestId) {
      await api.delete(`/help/${helpRequestId}`)
      setHelpRequested(false)
      setHelpRequestId(null)
    } else {
      setShowHelpModal(true)
    }
  }

  const submitHelpRequest = async () => {
    if (!submission) return
    try {
      const result = await api.post<{ id: string }>('/help/', {
        submission_id: submission.id,
        classroom_id: classroomId,
        note: helpNote.trim() || null,
      })
      setHelpRequested(true)
      setHelpRequestId(result.id)
      setShowHelpModal(false)
      setHelpNote('')
    } catch (e: any) {
      setError(e.message || 'Could not send help request.')
    }
  }

  const viewCommit = async (commit: Commit) => {
    if (selectedCommit === commit.id) {
      setSelectedCommit(null); setViewingCode(null); setViewingMsg(null); return
    }
    setSelectedCommit(commit.id)
    setViewingMsg(commit.message)
    try {
      const data = await api.get<{ code_snapshot: string; message: string }>(
        `/code/${submission?.id}/commits/${commit.id}/code`
      )
      setViewingCode(data.code_snapshot)
    } catch {}
  }

  const restoreCommit = () => {
    if (viewingCode) {
      setCode(viewingCode)
      setSelectedCommit(null); setViewingCode(null); setViewingMsg(null)
    }
  }

  const handleTab = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const el = e.currentTarget
      const start = el.selectionStart
      const end = el.selectionEnd
      const newCode = code.substring(0, start) + '    ' + code.substring(end)
      setCode(newCode)
      setTimeout(() => { el.selectionStart = el.selectionEnd = start + 4 }, 0)
    }
  }

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const isSubmitted = !!submission?.submitted_at
  const commitsNeeded = Math.max(0, (assignment?.min_commits || 1) - commits.length)
  const readyToSubmit = commitsNeeded === 0 && !isSubmitted

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1C1C1E', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <p style={{ color: '#888780' }}>loading...</p>
    </div>
  )

  if (dataLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1C1C1E', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <p style={{ color: '#888780' }}>loading assignment...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#1C1C1E', fontFamily: "'DM Sans', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* TOPBAR */}
      <div style={{ background: '#2A2A2C', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 1.5rem', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href={`/classroom/${classroomId}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <div style={{ width: '26px', height: '26px', background: '#1A56DB', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'white' }}>{'>'}_</div>
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>/</span>
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{assignment?.title}</span>
          {isSubmitted && <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 10px', borderRadius: '99px', background: '#DCFCE7', color: '#166534' }}>submitted</span>}
          {submission?.is_late && <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 10px', borderRadius: '99px', background: '#FEE2E2', color: '#991B1B' }}>late</span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '12px', color: flashCommit ? '#22C55E' : 'rgba(255,255,255,0.4)', transition: 'color 0.3s', fontFamily: "'DM Mono', monospace" }}>
            {commits.length} / {assignment?.min_commits} commits
          </div>
          <button onClick={handleRun} disabled={running || isSubmitted} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 16px', background: running ? '#166534' : '#22C55E', color: 'white', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 700, cursor: running || isSubmitted ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: isSubmitted ? 0.5 : 1 }}>
            {running ? '◌ running...' : '▶ run'}
          </button>
          {!isSubmitted && (
            <button onClick={() => setShowCommitPanel(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 16px', background: showCommitPanel ? '#185FA5' : '#1A56DB', color: 'white', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              ◎ commit
            </button>
          )}
          {!isSubmitted && (
            <button
              onClick={handleHelpRequest}
              style={{ padding: '7px 16px', background: helpRequested ? '#FEF9C3' : 'rgba(255,255,255,0.1)', color: helpRequested ? '#854D0E' : 'rgba(255,255,255,0.7)', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
            >
              {helpRequested ? '✋ help requested' : '✋ raise hand'}
            </button>
          )}
          {!isSubmitted && (
            <button onClick={handleSubmit} disabled={!readyToSubmit || submitLoading} style={{ padding: '7px 16px', background: readyToSubmit ? 'white' : 'rgba(255,255,255,0.1)', color: readyToSubmit ? '#0E2D6E' : 'rgba(255,255,255,0.3)', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 700, cursor: readyToSubmit ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.2s' }}>
              {submitLoading ? 'submitting...' : commitsNeeded > 0 ? `${commitsNeeded} more commit${commitsNeeded !== 1 ? 's' : ''} needed` : 'submit →'}
            </button>
          )}
        </div>
      </div>

      {/* COMMIT PANEL */}
      {showCommitPanel && (
        <div style={{ background: '#0E2D6E', padding: '12px 1.5rem', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>commit message:</span>
          <input autoFocus value={commitMsg} onChange={e => setCommitMsg(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && commitMsg.trim().length >= 3) handleCommit() }} placeholder="describe what you changed..." style={{ flex: 1, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', color: 'white', outline: 'none', fontFamily: "'DM Sans', sans-serif" }} />
          <button onClick={handleCommit} disabled={committing || commitMsg.trim().length < 3} style={{ padding: '8px 20px', background: commitMsg.trim().length >= 3 ? '#22C55E' : 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: commitMsg.trim().length >= 3 ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap', transition: 'background 0.15s' }}>
            {committing ? 'saving...' : 'save version ↵'}
          </button>
          <button onClick={() => setShowCommitPanel(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '18px', cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>
      )}

      {/* ERROR BANNER */}
      {error && (
        <div style={{ background: '#7F1D1D', padding: '10px 1.5rem', fontSize: '13px', color: '#FEE2E2', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          {error}
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#FEE2E2', cursor: 'pointer', fontSize: '16px' }}>×</button>
        </div>
      )}

      {/* MAIN AREA */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr 320px', minHeight: 0 }}>

        {/* LEFT — INSTRUCTIONS */}
        <div style={{ background: '#242426', borderRight: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '10px' }}>instructions</div>

            {/* READ ALOUD — on instructions */}
            {assignment?.instructions && (
              <div style={{ marginBottom: '10px' }}>
                <ReadAloud text={assignment.instructions} isPro={false} />
              </div>
            )}

            {assignment?.instructions ? (
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>{assignment.instructions}</p>
            ) : (
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)', margin: 0 }}>no instructions provided.</p>
            )}
          </div>

          {assignment?.due_date && (
            <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', borderLeft: '3px solid #1A56DB' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '4px' }}>due date</div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>{new Date(assignment.due_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
            </div>
          )}

          {submission?.grade != null && (
            <div style={{ padding: '10px 12px', background: 'rgba(34,197,94,0.08)', borderRadius: '8px', borderLeft: '3px solid #22C55E' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#22C55E', marginBottom: '4px' }}>grade</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#22C55E' }}>{submission.grade}</div>
              {submission.teacher_feedback && (
                <>
                  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '6px', lineHeight: 1.6 }}>{submission.teacher_feedback}</p>
                  {/* READ ALOUD — on teacher feedback */}
                  <div style={{ marginTop: '8px' }}>
                    <ReadAloud text={submission.teacher_feedback} isPro={false} />
                  </div>
                </>
              )}
            </div>
          )}

          {submission && assignment?.hints_enabled !== false && (
            <HintPanel
              submissionId={submission.id}
              runCount={runCount}
              hasEditedSinceRun={hasEditedSinceRun}
              hint1UnlockedAt={(submission as any).hint_1_unlocked_at}
              hint2UnlockedAt={(submission as any).hint_2_unlocked_at}
              onHintUsed={() => {
                // Re-fetch just the submission to update hint_*_unlocked_at
                api.post<{ submission: any }>(`/code/open?assignment_id=${assignmentId}`, {})
                  .then(data => setSubmission(data.submission))
                  .catch(() => {})
              }}
            />
          )}
        </div>

        {/* CENTER — EDITOR + OUTPUT */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            {viewingCode !== null && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: '#0E2D6E', padding: '8px 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>viewing: <strong style={{ color: 'white' }}>{viewingMsg}</strong></span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={restoreCommit} style={{ padding: '4px 12px', background: '#22C55E', color: 'white', border: 'none', borderRadius: '5px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>restore this version</button>
                  <button onClick={() => { setSelectedCommit(null); setViewingCode(null); setViewingMsg(null) }} style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '5px', fontSize: '12px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>back to current</button>
                </div>
              </div>
            )}
            <textarea ref={textareaRef} value={viewingCode !== null ? viewingCode : code} onChange={e => { if (viewingCode === null && !isSubmitted) { setCode(e.target.value); if (!hasEditedSinceRun && submission) { setHasEditedSinceRun(true); api.post(`/code/track-edit?submission_id=${submission.id}`, {}).catch(() => {}) } } }} onKeyDown={handleTab} readOnly={viewingCode !== null || isSubmitted} spellCheck={false} style={{ width: '100%', height: '100%', background: viewingCode !== null ? '#1a2a1a' : '#1C1C1E', color: viewingCode !== null ? '#9FE1CB' : '#EBF1FD', fontFamily: "'DM Mono', monospace", fontSize: '14px', lineHeight: 1.8, padding: viewingCode !== null ? '2.5rem 1.5rem 1.5rem' : '1.5rem', border: 'none', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ minHeight: '160px', background: '#111113', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <div style={{ padding: '8px 1rem', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>output</span>
              {running && <span style={{ fontSize: '11px', color: '#22C55E' }}>running...</span>}
            </div>
            {outputError && output ? (
              <ErrorPanel
                stderr={output}
                scaffoldLevel={assignment?.scaffold_level as ScaffoldLevel || 'typed_python'}
                onFindInDocs={handleFindInDocs}
                onFindInLesson={handleFindInLesson}
                showLessonLink={!!assignment?.lesson_id}
              />
            ) : (
              <pre style={{ margin: 0, padding: '10px 1rem', fontFamily: "'DM Mono', monospace", fontSize: '13px', color: '#22C55E', lineHeight: 1.7, overflowY: 'auto', height: 'calc(160px - 32px)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {output || <span style={{ color: 'rgba(255,255,255,0.2)' }}>run your code to see output here</span>}
              </pre>
            )}
          </div>
        </div>

        {/* RIGHT — COMMIT TIMELINE */}
        <div style={{ background: '#242426', borderLeft: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>version history</div>
              {commits.length >= 2 && submission && (
                <Link href={`/classroom/${classroomId}/assignment/${assignmentId}/diff/${submission.id}`} style={{ fontSize: '11px', color: '#1A56DB', textDecoration: 'none', fontWeight: 600 }}>
                  compare →
                </Link>
              )}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{commits.length} commit{commits.length !== 1 ? 's' : ''} · {commitsNeeded > 0 ? `${commitsNeeded} more needed` : 'ready to submit'}</div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 0' }}>
            {commits.length === 0 ? (
              <div style={{ padding: '2rem 1.25rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '8px', opacity: 0.4 }}>◎</div>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', margin: 0, lineHeight: 1.7 }}>no commits yet — write some code and click commit to save your first version</p>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '28px', top: '12px', bottom: '12px', width: '1.5px', background: 'rgba(26,86,219,0.3)' }} />
                {commits.map((commit, i) => {
                  const isLast = i === commits.length - 1
                  const isSelected = selectedCommit === commit.id
                  return (
                    <div key={commit.id} onClick={() => viewCommit(commit)} style={{ display: 'flex', gap: '12px', padding: '8px 1.25rem', cursor: 'pointer', background: isSelected ? 'rgba(26,86,219,0.15)' : 'transparent', transition: 'background 0.1s', position: 'relative' }}>
                      <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: isLast ? '#1A56DB' : '#2A2A2C', border: `2px solid ${isLast ? '#1A56DB' : 'rgba(26,86,219,0.5)'}`, flexShrink: 0, marginTop: '3px', boxShadow: isLast ? '0 0 0 3px rgba(26,86,219,0.2)' : 'none', zIndex: 1, position: 'relative' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: isLast ? 600 : 400, color: isLast ? 'white' : 'rgba(255,255,255,0.7)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{commit.message}</div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Mono', monospace" }}>{commit.line_count} lines · {formatTime(commit.committed_at)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            {!isSubmitted ? (
              <button onClick={handleSubmit} disabled={!readyToSubmit || submitLoading} style={{ width: '100%', padding: '10px', background: readyToSubmit ? '#1A56DB' : 'rgba(255,255,255,0.06)', color: readyToSubmit ? 'white' : 'rgba(255,255,255,0.3)', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: readyToSubmit ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.2s' }}>
                {submitLoading ? 'submitting...' : commitsNeeded > 0 ? `need ${commitsNeeded} more commit${commitsNeeded !== 1 ? 's' : ''}` : 'submit assignment →'}
              </button>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#22C55E', fontWeight: 600 }}>✓ submitted</div>
                {submission?.is_late && <div style={{ fontSize: '11px', color: '#F09595', marginTop: '2px' }}>submitted late</div>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* HELP MODAL */}
      {showHelpModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,45,110,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={e => { if (e.target === e.currentTarget) setShowHelpModal(false) }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '1.5rem', width: '100%', maxWidth: '400px' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '15px', fontWeight: 700, color: '#0E2D6E' }}>raise your hand</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '13px', color: '#888780' }}>optionally describe what you're stuck on</p>
            <textarea value={helpNote} onChange={e => setHelpNote(e.target.value)} placeholder="e.g. I'm getting a TypeError on line 5 and I don't understand why..." rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.15)', fontSize: '13px', outline: 'none', boxSizing: 'border-box', fontFamily: "'DM Sans', sans-serif", resize: 'vertical', lineHeight: 1.6 }} />
            <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
              <button onClick={() => setShowHelpModal(false)} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid rgba(14,45,110,0.15)', background: 'transparent', color: '#5F5E5A', fontWeight: 500, fontSize: '13px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>cancel</button>
              <button onClick={submitHelpRequest} style={{ flex: 1, padding: '9px', borderRadius: '8px', border: 'none', background: '#F59E0B', color: 'white', fontWeight: 600, fontSize: '13px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>✋ raise hand</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}