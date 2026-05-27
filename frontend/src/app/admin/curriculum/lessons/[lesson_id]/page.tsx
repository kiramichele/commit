'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

type LessonType = 'reading' | 'coding' | 'activity'

interface ExerciseItem {
  type: string
  instructions: string
  starter_code: string
}

interface LessonContent {
  estimated_minutes: number
  has_coding_exercise: boolean
  coding_instructions: string
  coding_starter_code: string
  example_code: string
  example_explanation: string
  exercises: ExerciseItem[] | null
  html_body: string | null
  activity_body: string | null
  html_file_path?: string | null
  activity_file_path?: string | null
}

interface LessonResponse {
  id: string
  unit_id: string
  order_index: number
  title: string
  scaffold_level: string
  standards_tags: string[] | null
  is_published: boolean
  lesson_content: LessonContent
}

const SCAFFOLD_LEVELS = ['typed_python', 'pseudocode', 'block_python', 'free_python']

// Starter template that demonstrates the Commit SDK contract.
// Activities call `Commit.submit(responses)` from their own submit button.
const ACTIVITY_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Activity</title>
  <style>
    body { font-family: 'DM Sans', system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1.5rem; color: #0E2D6E; line-height: 1.6; }
    h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
    p { color: #5F5E5A; }
    label { display: block; font-weight: 600; margin: 1.25rem 0 0.5rem; font-size: 14px; }
    textarea, input[type=text] { width: 100%; padding: 10px 12px; border: 1.5px solid rgba(14,45,110,0.15); border-radius: 8px; font-family: inherit; font-size: 14px; box-sizing: border-box; }
    textarea { resize: vertical; min-height: 90px; }
    button { background: #1A56DB; color: white; border: none; padding: 11px 22px; border-radius: 8px; font-weight: 600; font-size: 15px; cursor: pointer; margin-top: 1.5rem; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    #status { margin-top: 0.75rem; font-size: 13px; min-height: 1.2em; }
  </style>
</head>
<body>
  <h1>Activity title</h1>
  <p>Brief intro for the student.</p>

  <label for="q1">Question 1 — open-ended</label>
  <textarea id="q1" rows="3"></textarea>

  <label for="q2">Question 2 — short answer</label>
  <input type="text" id="q2" />

  <button id="submitBtn">submit</button>
  <div id="status"></div>

  <script>
    var btn = document.getElementById('submitBtn');
    var status = document.getElementById('status');

    // Optional: prefill prior responses when the student revisits.
    Commit.onReady(function() {
      Commit.getPriorResponses().then(function(prior) {
        if (!prior) return;
        if (prior.q1) document.getElementById('q1').value = prior.q1;
        if (prior.q2) document.getElementById('q2').value = prior.q2;
      });
    });

    Commit.on('submitting', function() {
      btn.disabled = true;
      status.textContent = 'saving...';
      status.style.color = '#888780';
    });

    Commit.on('submitted', function() {
      btn.disabled = false;
      status.textContent = '✓ saved';
      status.style.color = '#166534';
    });

    Commit.on('error', function(err) {
      btn.disabled = false;
      status.textContent = (err && err.message) || 'something went wrong, try again';
      status.style.color = '#991B1B';
    });

    btn.addEventListener('click', function() {
      Commit.submit({
        q1: document.getElementById('q1').value,
        q2: document.getElementById('q2').value
      });
    });
  </script>
</body>
</html>
`

export default function LessonEditorPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams<{ lesson_id: string }>()
  const searchParams = useSearchParams()
  const isNew = params.lesson_id === 'new'
  const unitIdForNew = searchParams.get('unit')

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [unitId, setUnitId] = useState<string>(unitIdForNew || '')

  const [orderIndex, setOrderIndex] = useState(1)
  const [title, setTitle] = useState('')
  const [scaffoldLevel, setScaffoldLevel] = useState('typed_python')
  const [standardsText, setStandardsText] = useState('')
  const [isPublished, setIsPublished] = useState(false)

  const [lessonType, setLessonType] = useState<LessonType>('reading')
  const [estimatedMinutes, setEstimatedMinutes] = useState(20)
  const [htmlBody, setHtmlBody] = useState('')
  const [activityBody, setActivityBody] = useState('')
  const [codingInstructions, setCodingInstructions] = useState('')
  const [codingStarterCode, setCodingStarterCode] = useState('')
  const [exampleCode, setExampleCode] = useState('')
  const [exampleExplanation, setExampleExplanation] = useState('')
  const [exercises, setExercises] = useState<ExerciseItem[]>([])

  useEffect(() => {
    if (authLoading) return
    if (!profile || profile.role !== 'admin') router.push('/login')
  }, [profile, authLoading, router])

  useEffect(() => {
    if (isNew || !profile || profile.role !== 'admin') return
    loadLesson()
  }, [profile])

  const loadLesson = async () => {
    try {
      const data = await api.get<LessonResponse>(`/admin/curriculum/lessons/${params.lesson_id}`)
      setUnitId(data.unit_id)
      setOrderIndex(data.order_index)
      setTitle(data.title)
      setScaffoldLevel(data.scaffold_level)
      setStandardsText((data.standards_tags || []).join(', '))
      setIsPublished(data.is_published)

      const c = data.lesson_content || ({} as LessonContent)
      setEstimatedMinutes(c.estimated_minutes || 20)
      setHtmlBody(c.html_body || '')
      setActivityBody(c.activity_body || '')
      setCodingInstructions(c.coding_instructions || '')
      setCodingStarterCode(c.coding_starter_code || '')
      setExampleCode(c.example_code || '')
      setExampleExplanation(c.example_explanation || '')
      setExercises(c.exercises || [])

      if (c.has_coding_exercise || (c.exercises && c.exercises.length > 0)) setLessonType('coding')
      else if (c.activity_file_path || c.activity_body) setLessonType('activity')
      else setLessonType('reading')
    } catch (err: any) {
      alert(err.message || 'Failed to load lesson')
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'lesson' | 'activity') => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const text = await file.text()
      if (target === 'lesson') setHtmlBody(text)
      else setActivityBody(text)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const addExercise = () => setExercises(ex => [...ex, { type: 'coding', instructions: '', starter_code: '' }])
  const updateExercise = (i: number, patch: Partial<ExerciseItem>) =>
    setExercises(ex => ex.map((e, idx) => idx === i ? { ...e, ...patch } : e))
  const removeExercise = (i: number) => setExercises(ex => ex.filter((_, idx) => idx !== i))
  const moveExercise = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= exercises.length) return
    const copy = [...exercises]
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    setExercises(copy)
  }

  const handleSave = async () => {
    if (!title.trim()) return alert('Title is required')
    if (!unitId) return alert('No unit selected')
    setSaving(true)
    try {
      const standardsList = standardsText.split(',').map(s => s.trim()).filter(Boolean)

      const content: any = {
        estimated_minutes: estimatedMinutes,
        has_coding_exercise: lessonType === 'coding',
        coding_instructions: lessonType === 'coding' ? codingInstructions : '',
        coding_starter_code: lessonType === 'coding' ? codingStarterCode : '',
        example_code: lessonType === 'coding' ? exampleCode : '',
        example_explanation: lessonType === 'coding' ? exampleExplanation : '',
        exercises: lessonType === 'coding' ? exercises : null,
        html_body: lessonType === 'activity' ? null : htmlBody,
        activity_body: lessonType === 'activity' ? activityBody : null,
      }

      const payload = {
        order_index: orderIndex,
        title,
        scaffold_level: scaffoldLevel,
        standards_tags: standardsList.length ? standardsList : null,
        is_published: isPublished,
        content,
      }

      if (isNew) {
        const created = await api.post<LessonResponse>(`/admin/curriculum/units/${unitId}/lessons`, payload)
        router.push(`/admin/curriculum/lessons/${created.id}`)
      } else {
        await api.patch(`/admin/curriculum/lessons/${params.lesson_id}`, payload)
        alert('Saved')
      }
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
  const label: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#0E2D6E', marginBottom: '6px', letterSpacing: '0.02em' }
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
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>{isNew ? 'new lesson' : title || 'lesson'}</span>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>{profile.email}</span>
      </div>

      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: '#888780' }}>loading lesson...</div>
      ) : (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem' }}>

          {/* META */}
          <div style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 200px', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={label}>order</label>
                <input type="number" value={orderIndex} onChange={e => setOrderIndex(parseInt(e.target.value, 10) || 0)} style={input} />
              </div>
              <div>
                <label style={label}>title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} style={input} />
              </div>
              <div>
                <label style={label}>scaffold</label>
                <select value={scaffoldLevel} onChange={e => setScaffoldLevel(e.target.value)} style={input}>
                  {SCAFFOLD_LEVELS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', gap: '12px' }}>
              <div>
                <label style={label}>standards (comma-separated)</label>
                <input value={standardsText} onChange={e => setStandardsText(e.target.value)} placeholder="CRD-1.A, IOC-1.A" style={input} />
              </div>
              <div>
                <label style={label}>est. minutes</label>
                <input type="number" value={estimatedMinutes} onChange={e => setEstimatedMinutes(parseInt(e.target.value, 10) || 0)} style={input} />
              </div>
              <div>
                <label style={label}>published</label>
                <button onClick={() => setIsPublished(p => !p)} style={{ ...input, textAlign: 'left' as const, cursor: 'pointer', background: isPublished ? '#DCFCE7' : '#FEF9C3', color: isPublished ? '#166534' : '#854D0E', fontWeight: 600 }}>
                  {isPublished ? '● live' : '○ draft'}
                </button>
              </div>
            </div>
          </div>

          {/* TYPE PICKER */}
          <div style={card}>
            <label style={label}>lesson type</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['reading', 'coding', 'activity'] as LessonType[]).map(t => (
                <button key={t} onClick={() => setLessonType(t)} style={{
                  padding: '10px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  border: lessonType === t ? '2px solid #1A56DB' : '2px solid rgba(14,45,110,0.1)',
                  background: lessonType === t ? '#EBF1FD' : 'white',
                  color: lessonType === t ? '#0C447C' : '#5F5E5A',
                  fontFamily: "'DM Sans', sans-serif", flex: 1,
                }}>
                  {t === 'reading' && '📖 reading'}
                  {t === 'coding' && '💻 coding'}
                  {t === 'activity' && '🎯 activity'}
                </button>
              ))}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#888780', lineHeight: 1.5 }}>
              {lessonType === 'reading' && 'Static HTML lesson page. No interactive coding or full-screen activity.'}
              {lessonType === 'coding' && 'Lesson with hands-on coding exercises rendered in the practice tab.'}
              {lessonType === 'activity' && 'Full-screen interactive activity. The activity HTML renders standalone in the activity viewer.'}
            </p>
          </div>

          {/* HTML BODY (reading + coding) */}
          {lessonType !== 'activity' && (
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ ...label, marginBottom: 0 }}>lesson html body</label>
                <label style={{ ...btn(false), padding: '5px 10px', fontSize: '12px', display: 'inline-block' }}>
                  {uploading ? 'reading...' : '+ upload .html'}
                  <input type="file" accept=".html" onChange={e => handleFileUpload(e, 'lesson')} style={{ display: 'none' }} />
                </label>
              </div>
              <textarea value={htmlBody} onChange={e => setHtmlBody(e.target.value)} rows={14} placeholder="<h1>Lesson title</h1>&#10;<p>Lesson body HTML here...</p>" style={textareaStyle} />
            </div>
          )}

          {/* ACTIVITY BODY */}
          {lessonType === 'activity' && (
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <label style={{ ...label, marginBottom: 0 }}>activity html (full-screen)</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (activityBody.trim() && !confirm('Replace current activity HTML with the template?')) return
                      setActivityBody(ACTIVITY_TEMPLATE)
                    }}
                    style={{ ...btn(false), padding: '5px 10px', fontSize: '12px' }}
                    title="Load a starter HTML that uses the Commit SDK (Commit.submit, Commit.getPriorResponses, etc.)"
                  >
                    ↶ load template
                  </button>
                  <label style={{ ...btn(false), padding: '5px 10px', fontSize: '12px', display: 'inline-block' }}>
                    {uploading ? 'reading...' : '+ upload .html'}
                    <input type="file" accept=".html" onChange={e => handleFileUpload(e, 'activity')} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>
              <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#888780', lineHeight: 1.5 }}>
                Activities can talk to Commit via <code style={{ background: '#EBF1FD', padding: '1px 5px', borderRadius: '4px', fontFamily: "'DM Mono', monospace" }}>Commit.submit(responses)</code> — call it from your own submit button.
                See the template for the full API (submit, getPriorResponses, status events).
              </p>
              <textarea value={activityBody} onChange={e => setActivityBody(e.target.value)} rows={20} placeholder="<!DOCTYPE html>&#10;<html>...</html>" style={textareaStyle} />
            </div>
          )}

          {/* CODING-SPECIFIC FIELDS */}
          {lessonType === 'coding' && (
            <>
              <div style={card}>
                <label style={label}>example code (shown above exercises)</label>
                <textarea value={exampleCode} onChange={e => setExampleCode(e.target.value)} rows={6} placeholder="# optional worked example" style={textareaStyle} />
                <label style={{ ...label, marginTop: '12px' }}>example explanation</label>
                <textarea value={exampleExplanation} onChange={e => setExampleExplanation(e.target.value)} rows={3} placeholder="brief prose explaining the example" style={{ ...textareaStyle, fontFamily: "'DM Sans', sans-serif", fontSize: '13px' }} />
              </div>

              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>exercises ({exercises.length})</h3>
                  <button onClick={addExercise} style={btn(true)}>+ add exercise</button>
                </div>

                {exercises.length === 0 ? (
                  <p style={{ color: '#888780', fontSize: '13px', textAlign: 'center', padding: '1rem' }}>no exercises yet</p>
                ) : exercises.map((ex, i) => (
                  <div key={i} style={{ border: '1px solid rgba(14,45,110,0.08)', borderRadius: '10px', padding: '1rem', marginBottom: '12px', background: '#FAFAF8' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#0E2D6E' }}>exercise {i + 1}</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => moveExercise(i, -1)} disabled={i === 0} style={{ ...btn(false), padding: '3px 8px', fontSize: '11px' }}>↑</button>
                        <button onClick={() => moveExercise(i, 1)} disabled={i === exercises.length - 1} style={{ ...btn(false), padding: '3px 8px', fontSize: '11px' }}>↓</button>
                        <button onClick={() => removeExercise(i)} style={{ ...btn(false), padding: '3px 10px', fontSize: '11px', borderColor: 'rgba(239,68,68,0.3)', color: '#991B1B' }}>remove</button>
                      </div>
                    </div>
                    <label style={{ ...label, fontSize: '11px' }}>instructions</label>
                    <textarea value={ex.instructions} onChange={e => updateExercise(i, { instructions: e.target.value })} rows={4} style={{ ...textareaStyle, fontFamily: "'DM Sans', sans-serif", fontSize: '13px', background: 'white', marginBottom: '10px' }} />
                    <label style={{ ...label, fontSize: '11px' }}>starter code</label>
                    <textarea value={ex.starter_code} onChange={e => updateExercise(i, { starter_code: e.target.value })} rows={6} style={{ ...textareaStyle, background: 'white' }} />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* SAVE BAR */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <Link href="/admin/curriculum" style={{ ...btn(false), textDecoration: 'none' }}>cancel</Link>
            <button onClick={handleSave} disabled={saving} style={btn(true)}>
              {saving ? 'saving...' : (isNew ? 'create lesson' : 'save changes')}
            </button>
          </div>

        </div>
      )}
    </div>
  )
}
