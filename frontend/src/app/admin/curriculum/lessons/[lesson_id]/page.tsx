'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

// Lessons are reading-only — they have a title, metadata, and an HTML body.
// Anything interactive (coding, quizzes, activities, etc.) belongs as a
// curriculum_assignment, not a lesson.
interface LessonContent {
  estimated_minutes: number
  html_body: string | null
  html_file_path?: string | null
}

interface LessonResponse {
  id: string
  unit_id: string
  order_index: number
  title: string
  standards_tags: string[] | null
  is_published: boolean
  lesson_content: LessonContent
}

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

  const [title, setTitle] = useState('')
  const [standardsText, setStandardsText] = useState('')
  const [isPublished, setIsPublished] = useState(false)
  const [estimatedMinutes, setEstimatedMinutes] = useState(20)
  const [htmlBody, setHtmlBody] = useState('')

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
      setTitle(data.title)
      setStandardsText((data.standards_tags || []).join(', '))
      setIsPublished(data.is_published)
      const c = data.lesson_content || ({} as LessonContent)
      setEstimatedMinutes(c.estimated_minutes || 20)
      setHtmlBody(c.html_body || '')
    } catch (err: any) {
      alert(err.message || 'Failed to load lesson')
    } finally {
      setLoading(false)
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

  const handleSave = async () => {
    if (!title.trim()) return alert('Title is required')
    if (!unitId) return alert('No unit selected')
    setSaving(true)
    try {
      const standardsList = standardsText.split(',').map(s => s.trim()).filter(Boolean)
      // Reading-only lessons. We explicitly null out all the
      // legacy coding/activity fields so the underlying lesson_content
      // row matches the reading-only contract.
      const content = {
        estimated_minutes: estimatedMinutes,
        has_coding_exercise: false,
        coding_instructions: '',
        coding_starter_code: '',
        example_code: '',
        example_explanation: '',
        exercises: null,
        html_body: htmlBody,
        activity_body: null,
      }
      // We deliberately don't send order_index — the up/down arrows in the
      // curriculum list are the only way to change it, and the backend
      // auto-assigns on create.
      const payload: Record<string, unknown> = {
        title,
        scaffold_level: 'typed_python',
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
            <div style={{ marginBottom: '12px' }}>
              <label style={label}>title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} style={input} />
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

          {/* HTML BODY */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ ...label, marginBottom: 0 }}>lesson html body</label>
              <label style={{ ...btn(false), padding: '5px 10px', fontSize: '12px', display: 'inline-block' }}>
                {uploading ? 'reading...' : '+ upload .html'}
                <input type="file" accept=".html" onChange={handleFileUpload} style={{ display: 'none' }} />
              </label>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#888780', lineHeight: 1.5 }}>
              Lessons are reading-only. For coding tasks, interactive activities, quizzes, or check-ins, create a <strong>curriculum assignment</strong> instead.
            </p>
            <textarea value={htmlBody} onChange={e => setHtmlBody(e.target.value)} rows={16} placeholder="<h1>Lesson title</h1>&#10;<p>Lesson body HTML here...</p>" style={textareaStyle} />
          </div>

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
