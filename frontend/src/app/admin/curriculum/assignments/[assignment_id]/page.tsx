'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

interface CurriculumAssignment {
  id: string
  unit_id: string
  order_index: number
  title: string
  instructions: string
  starter_code: string
  assignment_type: string
  min_commits: number
  scaffold_level: string
  allow_collab: boolean
  standards_tags: string[] | null
  hints_enabled: boolean
  hint_1: string | null
  hint_2: string | null
  is_published: boolean
  html_file_path: string | null
  html_body?: string | null
}

const TYPE_OPTIONS = [
  { value: 'code',     label: 'Coding' },
  { value: 'activity', label: 'Interactive activity' },
  { value: 'checkin',  label: 'Check-in' },
  { value: 'quiz',     label: 'Quiz' },
  { value: 'project',  label: 'Project' },
]
const SCAFFOLD_LEVELS = ['typed_python', 'pseudocode', 'block_python', 'free_python']

export default function CurriculumAssignmentEditor() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams<{ assignment_id: string }>()

  const [assignment, setAssignment] = useState<CurriculumAssignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [orderIndex, setOrderIndex] = useState(1)
  const [title, setTitle] = useState('')
  const [assignmentType, setAssignmentType] = useState('code')
  const [scaffoldLevel, setScaffoldLevel] = useState('typed_python')
  const [minCommits, setMinCommits] = useState(1)
  const [standardsText, setStandardsText] = useState('')
  const [isPublished, setIsPublished] = useState(false)
  const [allowCollab, setAllowCollab] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [starterCode, setStarterCode] = useState('')
  const [hintsEnabled, setHintsEnabled] = useState(true)
  const [hint1, setHint1] = useState('')
  const [hint2, setHint2] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [uploading, setUploading] = useState(false)

  const isCoding = assignmentType === 'code'
  const isActivity = assignmentType === 'activity'
  const isQuiz = assignmentType === 'quiz'

  const [quizQuestions, setQuizQuestions] = useState<Array<{
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
  }>>([])
  const [uploadingCsv, setUploadingCsv] = useState(false)
  const [csvErrors, setCsvErrors] = useState<string[]>([])

  useEffect(() => {
    if (authLoading) return
    if (!profile || profile.role !== 'admin') router.push('/login')
  }, [profile, authLoading, router])

  useEffect(() => {
    if (profile?.role === 'admin') load()
  }, [profile])

  const load = async () => {
    try {
      const data = await api.get<CurriculumAssignment>(`/admin/curriculum/assignments/${params.assignment_id}`)
      setAssignment(data)
      setOrderIndex(data.order_index)
      setTitle(data.title)
      setAssignmentType(data.assignment_type)
      setScaffoldLevel(data.scaffold_level)
      setMinCommits(data.min_commits)
      setStandardsText((data.standards_tags || []).join(', '))
      setIsPublished(data.is_published)
      setAllowCollab(data.allow_collab)
      setInstructions(data.instructions || '')
      setStarterCode(data.starter_code || '')
      setHintsEnabled(data.hints_enabled)
      setHint1(data.hint_1 || '')
      setHint2(data.hint_2 || '')
      setHtmlBody(data.html_body || '')

      // Fetch quiz questions if applicable
      if (data.assignment_type === 'quiz') {
        try {
          const qs = await api.get<any[]>(`/admin/curriculum/assignments/${data.id}/questions`)
          setQuizQuestions(qs || [])
        } catch {}
      }
    } catch (err: any) {
      alert(err.message || 'Failed to load assignment')
    } finally {
      setLoading(false)
    }
  }

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingCsv(true)
    setCsvErrors([])
    try {
      const formData = new FormData()
      formData.append('file', file)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8888'
      const token = typeof window !== 'undefined' ? localStorage.getItem('commit_access_token') : null
      const response = await fetch(`${apiUrl}/admin/curriculum/assignments/${params.assignment_id}/questions/upload-csv`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result.detail || `Upload failed: ${response.status}`)
      }
      const qs = await api.get<any[]>(`/admin/curriculum/assignments/${params.assignment_id}/questions`)
      setQuizQuestions(qs || [])
      setCsvErrors(result.errors || [])
      alert(`${result.inserted} question(s) imported${result.errors?.length ? ` with ${result.errors.length} row(s) skipped` : ''}`)
    } catch (err: any) {
      alert(err.message || 'CSV upload failed')
    } finally {
      setUploadingCsv(false)
      e.target.value = ''
    }
  }

  const deleteQuizQuestion = async (qid: string) => {
    if (!confirm('Delete this question?')) return
    try {
      await api.delete(`/admin/curriculum/assignments/${params.assignment_id}/questions/${qid}`)
      setQuizQuestions(qs => qs.filter(q => q.id !== qid))
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const text = await file.text()
      setHtmlBody(text)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const save = async () => {
    if (!title.trim()) return alert('Title is required')
    setSaving(true)
    try {
      const standardsList = standardsText.split(',').map(s => s.trim()).filter(Boolean)
      await api.patch(`/admin/curriculum/assignments/${params.assignment_id}`, {
        order_index: orderIndex,
        title,
        assignment_type: assignmentType,
        scaffold_level: scaffoldLevel,
        min_commits: isCoding ? minCommits : 0,
        standards_tags: standardsList.length ? standardsList : null,
        is_published: isPublished,
        allow_collab: allowCollab,
        instructions,
        starter_code: isCoding ? starterCode : '',
        hints_enabled: hintsEnabled,
        hint_1: hint1 || null,
        hint_2: hint2 || null,
        html_body: isActivity ? htmlBody : null,
      })
      alert('Saved')
    } catch (err: any) {
      alert(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5' }}>
      <p style={{ color: '#888780', fontFamily: "'DM Sans', sans-serif" }}>loading...</p>
    </div>
  )

  const card: React.CSSProperties = { background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.5rem', marginBottom: '1rem' }
  const label: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#0E2D6E', marginBottom: '6px' }
  const input: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: '#FAFAF8', fontFamily: "'DM Sans', sans-serif" }
  const textareaStyle: React.CSSProperties = { ...input, fontFamily: "'DM Mono', monospace", fontSize: '12px', lineHeight: 1.5, resize: 'vertical' as const }
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

      <div style={{ background: '#0E2D6E', padding: '0 2rem', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '28px', height: '28px', background: '#1A56DB', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'white' }}>{'>'}_</div>
          <span style={{ color: 'white', fontWeight: 700, fontSize: '15px' }}>commit</span>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>/</span>
          <Link href="/admin" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', textDecoration: 'none' }}>admin</Link>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>/</span>
          <Link href="/admin/curriculum" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', textDecoration: 'none' }}>curriculum</Link>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>/</span>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>assignment: {title || '...'}</span>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>{profile.email}</span>
      </div>

      {loading || !assignment ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: '#888780' }}>loading assignment...</div>
      ) : (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem' }}>

          {/* META */}
          <div style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 180px', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={label}>order</label>
                <input type="number" value={orderIndex} onChange={e => setOrderIndex(parseInt(e.target.value, 10) || 0)} style={input} />
              </div>
              <div>
                <label style={label}>title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} style={input} />
              </div>
              <div>
                <label style={label}>type</label>
                <select value={assignmentType} onChange={e => setAssignmentType(e.target.value)} style={input}>
                  {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isCoding ? '1fr 1fr 120px 120px' : '1fr 120px', gap: '12px', alignItems: 'end' }}>
              {isCoding && (
                <div>
                  <label style={label}>scaffold level</label>
                  <select value={scaffoldLevel} onChange={e => setScaffoldLevel(e.target.value)} style={input}>
                    {SCAFFOLD_LEVELS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={label}>standards (comma-separated)</label>
                <input value={standardsText} onChange={e => setStandardsText(e.target.value)} placeholder="CRD-1.A" style={input} />
              </div>
              {isCoding && (
                <div>
                  <label style={label}>min commits</label>
                  <input type="number" value={minCommits} onChange={e => setMinCommits(parseInt(e.target.value, 10) || 0)} style={input} />
                </div>
              )}
              <div>
                <label style={label}>published</label>
                <button onClick={() => setIsPublished(p => !p)} style={{ ...input, textAlign: 'left' as const, cursor: 'pointer', background: isPublished ? '#DCFCE7' : '#FEF9C3', color: isPublished ? '#166534' : '#854D0E', fontWeight: 600 }}>
                  {isPublished ? '● live' : '○ draft'}
                </button>
              </div>
            </div>
          </div>

          {/* INSTRUCTIONS + CODE */}
          <div style={card}>
            <label style={label}>{isCoding ? 'instructions' : assignmentType === 'quiz' || assignmentType === 'checkin' ? 'prompt' : 'instructions'}</label>
            <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={6} placeholder="What the student needs to do." style={{ ...input, fontFamily: "'DM Sans', sans-serif", fontSize: '13px', marginBottom: isCoding ? '12px' : '0' }} />

            {isCoding && (
              <>
                <label style={label}>starter code</label>
                <textarea value={starterCode} onChange={e => setStarterCode(e.target.value)} rows={8} placeholder="# starter code here" style={textareaStyle} />
              </>
            )}
          </div>

          {/* QUIZ QUESTIONS — only for quiz type */}
          {isQuiz && (
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3 style={{ margin: '0 0 2px', fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>questions ({quizQuestions.length})</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#888780' }}>upload a CSV to replace the current set</p>
                </div>
                <label style={{ ...btn(true), padding: '7px 14px', fontSize: '12px', display: 'inline-block' }}>
                  {uploadingCsv ? 'uploading...' : '+ upload .csv'}
                  <input type="file" accept=".csv,text/csv" onChange={handleCsvUpload} style={{ display: 'none' }} />
                </label>
              </div>

              <div style={{ padding: '10px 14px', background: '#F8F7F5', borderRadius: '8px', fontSize: '12px', color: '#5F5E5A', lineHeight: 1.6, marginBottom: '12px' }}>
                <strong style={{ color: '#0E2D6E' }}>CSV columns:</strong> <code style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px' }}>question_type, question, code, a, b, c, d, correct_answer</code>
                <br />
                <span style={{ color: '#888780' }}>
                  <code style={{ fontFamily: "'DM Mono', monospace" }}>question_type</code> = <code>multiple_choice</code> or <code>constructed_response</code>.
                  For multiple choice, fill choices a-d and set <code>correct_answer</code> to one of <code>a/b/c/d</code>.
                  For constructed response, leave choices and correct_answer empty (graded later by AI or teacher).
                  Optional <code>code</code> column shows as a formatted code block under the question.
                </span>
              </div>

              {csvErrors.length > 0 && (
                <div style={{ padding: '10px 14px', background: '#FEE2E2', borderRadius: '8px', fontSize: '12px', color: '#991B1B', marginBottom: '12px' }}>
                  <strong>skipped rows:</strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {csvErrors.slice(0, 10).map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}

              {quizQuestions.length === 0 ? (
                <p style={{ margin: 0, padding: '1rem', textAlign: 'center', color: '#888780', fontSize: '13px' }}>no questions yet — upload a CSV above</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {quizQuestions.map((q, i) => (
                    <div key={q.id} style={{ padding: '10px 14px', border: '1px solid rgba(14,45,110,0.08)', borderRadius: '8px', background: '#FAFAF8' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: '#888780' }}>{i + 1}</span>
                          <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: q.question_type === 'multiple_choice' ? '#EBF1FD' : '#FEF3C7', color: q.question_type === 'multiple_choice' ? '#0C447C' : '#92400E', textTransform: 'uppercase' }}>
                            {q.question_type === 'multiple_choice' ? 'MC' : 'constructed'}
                          </span>
                        </div>
                        <button onClick={() => deleteQuizQuestion(q.id)} style={{ ...btn(false), padding: '3px 8px', fontSize: '11px', borderColor: 'rgba(239,68,68,0.3)', color: '#991B1B' }}>delete</button>
                      </div>
                      <div style={{ fontSize: '13px', color: '#0E2D6E', fontWeight: 500, marginBottom: '6px' }}>{q.question_text}</div>
                      {q.code_block && (
                        <pre style={{ margin: '0 0 8px', padding: '8px 10px', background: '#1C1C1E', color: '#EBF1FD', borderRadius: '6px', fontFamily: "'DM Mono', monospace", fontSize: '12px', lineHeight: 1.6, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{q.code_block}</pre>
                      )}
                      {q.question_type === 'multiple_choice' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '12px', color: '#5F5E5A' }}>
                          {(['a', 'b', 'c', 'd'] as const).map(letter => {
                            const choice = (q as any)[`choice_${letter}`]
                            if (!choice) return null
                            const correct = q.correct_answer === letter
                            return (
                              <div key={letter} style={{ color: correct ? '#166534' : '#5F5E5A', fontWeight: correct ? 600 : 400 }}>
                                {letter}) {choice} {correct && <span style={{ color: '#166534' }}>✓</span>}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ACTIVITY HTML BODY — only for activity type */}
          {isActivity && (
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <label style={{ ...label, marginBottom: 0 }}>activity html body</label>
                <label style={{ ...btn(false), padding: '5px 10px', fontSize: '12px', display: 'inline-block' }}>
                  {uploading ? 'reading...' : '+ upload .html'}
                  <input type="file" accept=".html" onChange={handleFileUpload} style={{ display: 'none' }} />
                </label>
              </div>
              <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#888780', lineHeight: 1.5 }}>
                Renders like a lesson page; students read it and answer embedded questions.
                Use the <code style={{ background: '#EBF1FD', padding: '1px 5px', borderRadius: '4px', fontFamily: "'DM Mono', monospace" }}>Commit.submit(responses)</code> SDK from your submit button (see lesson editor for the activity template).
              </p>
              <textarea value={htmlBody} onChange={e => setHtmlBody(e.target.value)} rows={14} placeholder="<h1>Activity title</h1>&#10;<p>Body HTML with form inputs...</p>" style={textareaStyle} />
            </div>
          )}

          {/* HINTS — coding only */}
          {isCoding && (
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>hints</h3>
                <button onClick={() => setHintsEnabled(h => !h)} style={{ ...btn(false), padding: '5px 10px', fontSize: '12px', background: hintsEnabled ? '#DCFCE7' : '#FEF9C3', color: hintsEnabled ? '#166534' : '#854D0E', border: 'none' }}>
                  {hintsEnabled ? 'enabled' : 'disabled'}
                </button>
              </div>
              <label style={label}>hint 1</label>
              <textarea value={hint1} onChange={e => setHint1(e.target.value)} rows={2} placeholder="nudge students toward the right idea" style={{ ...input, fontFamily: "'DM Sans', sans-serif", fontSize: '13px', marginBottom: '10px' }} />
              <label style={label}>hint 2 (deeper)</label>
              <textarea value={hint2} onChange={e => setHint2(e.target.value)} rows={2} placeholder="more direct hint" style={{ ...input, fontFamily: "'DM Sans', sans-serif", fontSize: '13px' }} />
            </div>
          )}

          {/* COLLAB */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: '0 0 2px', fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>allow collaboration</h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#888780' }}>let students work together on this assignment</p>
              </div>
              <button onClick={() => setAllowCollab(c => !c)} style={{ ...btn(false), padding: '5px 12px', fontSize: '12px', background: allowCollab ? '#DCFCE7' : '#FEF9C3', color: allowCollab ? '#166534' : '#854D0E', border: 'none' }}>
                {allowCollab ? 'enabled' : 'disabled'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <Link href="/admin/curriculum" style={{ ...btn(false), textDecoration: 'none' }}>← back</Link>
            <button onClick={save} disabled={saving} style={btn(true)}>{saving ? 'saving...' : 'save changes'}</button>
          </div>

        </div>
      )}
    </div>
  )
}
