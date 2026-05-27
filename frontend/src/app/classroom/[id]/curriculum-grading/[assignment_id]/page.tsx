'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

interface Assignment {
  id: string
  title: string
  assignment_type: string
  instructions: string
  checkin_format?: 'html' | 'short_answer' | 'rating' | 'coding' | null
}

interface Question {
  id: string
  order_index: number
  question_type: 'multiple_choice' | 'constructed_response'
  question_text: string
  code_block: string | null
  choice_a: string | null
  choice_b: string | null
  choice_c: string | null
  choice_d: string | null
  correct_answer: string | null
}

interface Submission {
  id: string
  student_id: string
  response_text: string | null
  is_correct: boolean | null
  score: number | null
  teacher_feedback: string | null
  graded_at: string | null
  student: { id: string; display_name: string; email: string } | null
}

interface ParsedSubmission {
  answers: Record<string, string>
  grades: Record<string, number>
  feedback: Record<string, string>
}

const parsePayload = (text: string | null): ParsedSubmission => {
  if (!text) return { answers: {}, grades: {}, feedback: {} }
  try {
    const obj = JSON.parse(text)
    const grades = (obj.grades && typeof obj.grades === 'object') ? obj.grades : {}
    const feedback = (obj.feedback && typeof obj.feedback === 'object') ? obj.feedback : {}
    const answers: Record<string, string> = {}
    for (const k of Object.keys(obj)) {
      if (k === 'grades' || k === 'feedback' || k === 'text' || k === 'code' || k === 'rating') continue
      answers[k] = obj[k]
    }
    // For checkin/project type with single-field payloads, surface them via reserved keys.
    if (typeof obj.text === 'string') answers['_text'] = obj.text
    if (typeof obj.code === 'string') answers['_code'] = obj.code
    if (typeof obj.rating === 'number') answers['_rating'] = String(obj.rating)
    return { answers, grades, feedback }
  } catch {
    return { answers: {}, grades: {}, feedback: {} }
  }
}

export default function CurriculumGradingPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const params = useParams<{ id: string; assignment_id: string }>()
  const classroomId = params.id
  const assignmentId = params.assignment_id

  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Editable state for the currently-selected submission
  const [perQuestionGrades, setPerQuestionGrades] = useState<Record<string, number>>({})
  const [perQuestionFeedback, setPerQuestionFeedback] = useState<Record<string, string>>({})
  const [overallScore, setOverallScore] = useState<string>('')
  const [overallFeedback, setOverallFeedback] = useState('')

  useEffect(() => {
    if (loading) return
    if (!profile) router.push('/login')
    if (profile?.role === 'student') router.push('/learn')
  }, [profile, loading, router])

  useEffect(() => {
    if (!profile || profile.role === 'student') return
    load()
  }, [profile])

  const load = async () => {
    setPageLoading(true)
    try {
      const [a, qs, subs] = await Promise.all([
        api.get<Assignment>(`/curriculum/curriculum-assignments/${assignmentId}`),
        api.get<Question[]>(`/curriculum/curriculum-assignments/${assignmentId}/questions-for-grading`).catch(() => []),
        api.get<Submission[]>(`/curriculum/curriculum-assignments/${assignmentId}/classroom/${classroomId}/submissions`),
      ])
      setAssignment(a)
      setQuestions(qs || [])
      setSubmissions(subs || [])
    } catch (err: any) {
      console.error(err)
    } finally {
      setPageLoading(false)
    }
  }

  const selected = useMemo(
    () => submissions.find(s => s.student_id === selectedStudentId) || null,
    [submissions, selectedStudentId]
  )
  const parsed = useMemo(() => selected ? parsePayload(selected.response_text) : null, [selected])

  // Whenever the selected submission changes, hydrate the editor state.
  useEffect(() => {
    if (!selected || !parsed) {
      setPerQuestionGrades({})
      setPerQuestionFeedback({})
      setOverallScore('')
      setOverallFeedback('')
      return
    }
    setPerQuestionGrades(parsed.grades || {})
    setPerQuestionFeedback(parsed.feedback || {})
    setOverallScore(selected.score != null ? String(selected.score) : '')
    setOverallFeedback(selected.teacher_feedback || '')
  }, [selected?.id])

  const saveGrade = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const parsedScore = overallScore.trim() === '' ? null : parseFloat(overallScore)
      const updated = await api.patch<Submission>(
        `/curriculum/curriculum-assignments/submissions/${selected.id}/grade`,
        {
          score: parsedScore,
          teacher_feedback: overallFeedback || null,
          per_question_grades: perQuestionGrades,
          per_question_feedback: perQuestionFeedback,
        }
      )
      setSubmissions(arr => arr.map(s => s.id === updated.id ? { ...s, ...updated } : s))
    } catch (err: any) {
      alert(err.message || 'Failed to save grade')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5' }}>
      <p style={{ color: '#888780', fontFamily: "'DM Sans', sans-serif" }}>loading...</p>
    </div>
  )

  const card: React.CSSProperties = { background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden' }
  const label: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: '#0E2D6E', marginBottom: '4px', letterSpacing: '0.02em' }
  const input: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: '#FAFAF8', fontFamily: "'DM Sans', sans-serif" }
  const btn = (primary: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    border: primary ? 'none' : '1.5px solid rgba(14,45,110,0.15)',
    background: primary ? '#1A56DB' : 'transparent',
    color: primary ? 'white' : '#5F5E5A',
    fontFamily: "'DM Sans', sans-serif",
  })

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 1.5rem', height: '56px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <div style={{ width: '28px', height: '28px', background: '#1A56DB', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'white' }}>{'>'}_</div>
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#0E2D6E', letterSpacing: '-0.02em' }}>commit</span>
        </Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        <Link href={`/classroom/${classroomId}`} style={{ fontSize: '13px', color: '#5F5E5A', textDecoration: 'none', fontWeight: 500 }}>classroom</Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        <span style={{ fontSize: '13px', color: '#0E2D6E', fontWeight: 500 }}>grade: {assignment?.title || '...'}</span>
      </nav>

      {pageLoading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: '#888780' }}>loading...</div>
      ) : !assignment ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: '#888780' }}>assignment not found.</div>
      ) : (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem', display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1.5rem', alignItems: 'start' }}>

          {/* ROSTER */}
          <div style={card}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(14,45,110,0.06)' }}>
              <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>submissions ({submissions.length})</h2>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#888780' }}>students in this classroom who submitted</p>
            </div>
            {submissions.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#888780', fontSize: '13px' }}>no submissions yet</div>
            ) : (
              submissions.map(s => (
                <div
                  key={s.id}
                  onClick={() => setSelectedStudentId(s.student_id)}
                  style={{
                    padding: '0.75rem 1.25rem',
                    borderBottom: '1px solid rgba(14,45,110,0.05)',
                    cursor: 'pointer',
                    background: selectedStudentId === s.student_id ? '#EBF1FD' : 'transparent',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0E2D6E' }}>{s.student?.display_name || 'Unknown'}</div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                    {s.graded_at ? (
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#DCFCE7', color: '#166534' }}>graded {s.score ?? '—'}%</span>
                    ) : (
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#FEF9C3', color: '#854D0E' }}>needs grading</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* GRADING PANE */}
          <div>
            {!selected || !parsed ? (
              <div style={{ ...card, padding: '3rem', textAlign: 'center', color: '#888780', fontSize: '14px' }}>
                {submissions.length === 0 ? 'no submissions to grade yet.' : 'select a student on the left to grade their submission.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                {/* STUDENT HEADER */}
                <div style={{ ...card, padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0E2D6E' }}>{selected.student?.display_name}</h2>
                      <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#888780' }}>{selected.student?.email}</p>
                    </div>
                    {selected.graded_at && (
                      <span style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>last graded {new Date(selected.graded_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>

                {/* QUIZ-STYLE QUESTIONS */}
                {questions.length > 0 ? (
                  questions.map((q, i) => {
                    const studentAnswer = parsed.answers[q.id] || ''
                    const isCorrect = q.question_type === 'multiple_choice' && q.correct_answer && studentAnswer.toLowerCase() === q.correct_answer
                    return (
                      <div key={q.id} style={card}>
                        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(14,45,110,0.06)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', color: '#888780' }}>Q{i + 1}</span>
                            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: q.question_type === 'multiple_choice' ? '#EBF1FD' : '#FEF3C7', color: q.question_type === 'multiple_choice' ? '#0C447C' : '#92400E', textTransform: 'uppercase' }}>
                              {q.question_type === 'multiple_choice' ? 'multiple choice' : 'constructed'}
                            </span>
                            {q.question_type === 'multiple_choice' && q.correct_answer && (
                              isCorrect
                                ? <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#DCFCE7', color: '#166534' }}>✓ correct</span>
                                : <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#FEE2E2', color: '#991B1B' }}>incorrect</span>
                            )}
                          </div>
                          <div style={{ fontSize: '14px', color: '#0E2D6E', fontWeight: 500, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{q.question_text}</div>
                          {q.code_block && (
                            <pre style={{ margin: '10px 0 0', padding: '10px 14px', background: '#1C1C1E', color: '#EBF1FD', borderRadius: '8px', fontFamily: "'DM Mono', monospace", fontSize: '12px', lineHeight: 1.7, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{q.code_block}</pre>
                          )}
                        </div>

                        <div style={{ padding: '1rem 1.25rem' }}>
                          {q.question_type === 'multiple_choice' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {(['a', 'b', 'c', 'd'] as const).map(letter => {
                                const choice = (q as any)[`choice_${letter}`]
                                if (!choice) return null
                                const chosen = studentAnswer === letter
                                const correct = q.correct_answer === letter
                                return (
                                  <div key={letter} style={{
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    background: correct ? '#DCFCE7' : chosen ? '#FEE2E2' : '#F8F7F5',
                                    color: correct ? '#166534' : chosen ? '#991B1B' : '#5F5E5A',
                                    fontSize: '13px',
                                    fontWeight: correct || chosen ? 600 : 400,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                  }}>
                                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px' }}>{letter})</span>
                                    {choice}
                                    {chosen && <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 600 }}>{correct ? '✓ student picked' : '← student picked'}</span>}
                                    {correct && !chosen && <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 600 }}>(correct answer)</span>}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <>
                              <label style={label}>student response</label>
                              <div style={{ padding: '10px 14px', background: '#FAFAF8', borderRadius: '8px', fontSize: '14px', color: '#0E2D6E', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: '12px', minHeight: '50px' }}>
                                {studentAnswer || <span style={{ color: '#888780', fontStyle: 'italic' }}>no response</span>}
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '10px', alignItems: 'end' }}>
                                <div>
                                  <label style={label}>score (0-100)</label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={perQuestionGrades[q.id] ?? ''}
                                    onChange={e => setPerQuestionGrades(g => ({ ...g, [q.id]: parseFloat(e.target.value) || 0 }))}
                                    style={input}
                                  />
                                </div>
                                <div>
                                  <label style={label}>feedback for this question</label>
                                  <textarea
                                    value={perQuestionFeedback[q.id] || ''}
                                    onChange={e => setPerQuestionFeedback(f => ({ ...f, [q.id]: e.target.value }))}
                                    rows={2}
                                    placeholder="optional"
                                    style={{ ...input, fontSize: '13px', lineHeight: 1.6, resize: 'vertical' }}
                                  />
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  // Non-quiz submission. Render the student response based on
                  // the assignment's check-in format (or fall back to text).
                  <div style={card}>
                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(14,45,110,0.06)' }}>
                      <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>student response</h3>
                      {assignment.assignment_type === 'checkin' && assignment.checkin_format && (
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#888780' }}>format: {assignment.checkin_format.replace('_', ' ')}</p>
                      )}
                    </div>
                    <div style={{ padding: '1rem 1.25rem' }}>
                      {assignment.checkin_format === 'rating' ? (
                        parsed.answers._rating ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '36px', fontWeight: 700, color: '#0E2D6E', fontFamily: "'DM Mono', monospace" }}>{parsed.answers._rating}</span>
                            <span style={{ fontSize: '14px', color: '#888780' }}>/ 5</span>
                          </div>
                        ) : (
                          <span style={{ color: '#888780', fontStyle: 'italic', fontSize: '14px' }}>no rating</span>
                        )
                      ) : assignment.checkin_format === 'coding' ? (
                        parsed.answers._code ? (
                          <pre style={{ margin: 0, padding: '12px 16px', background: '#1C1C1E', color: '#EBF1FD', borderRadius: '8px', fontFamily: "'DM Mono', monospace", fontSize: '13px', lineHeight: 1.7, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{parsed.answers._code}</pre>
                        ) : (
                          <span style={{ color: '#888780', fontStyle: 'italic', fontSize: '14px' }}>no code</span>
                        )
                      ) : (
                        <div style={{ padding: '12px 16px', background: '#FAFAF8', borderRadius: '8px', fontSize: '14px', color: '#0E2D6E', lineHeight: 1.7, whiteSpace: 'pre-wrap', minHeight: '60px' }}>
                          {parsed.answers._text || parsed.answers._code || <span style={{ color: '#888780', fontStyle: 'italic' }}>no response</span>}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* OVERALL SCORE + FEEDBACK */}
                <div style={card}>
                  <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(14,45,110,0.06)' }}>
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>overall grade</h3>
                  </div>
                  <div style={{ padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px', alignItems: 'end' }}>
                    <div>
                      <label style={label}>score (0-100)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={overallScore}
                        onChange={e => setOverallScore(e.target.value)}
                        placeholder="—"
                        style={input}
                      />
                    </div>
                    <div>
                      <label style={label}>overall feedback for student</label>
                      <textarea
                        value={overallFeedback}
                        onChange={e => setOverallFeedback(e.target.value)}
                        rows={3}
                        placeholder="optional"
                        style={{ ...input, fontSize: '13px', lineHeight: 1.6, resize: 'vertical' }}
                      />
                    </div>
                  </div>
                  <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid rgba(14,45,110,0.06)', display: 'flex', justifyContent: 'flex-end', gap: '8px', background: '#FAFAF8' }}>
                    <button onClick={saveGrade} disabled={saving} style={btn(true)}>{saving ? 'saving...' : 'save grade'}</button>
                  </div>
                </div>

              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
