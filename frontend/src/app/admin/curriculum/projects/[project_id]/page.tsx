'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

type StepType = 'coding' | 'reading' | 'free_response'

interface ProjectStep {
  id: string
  project_id: string
  order_index: number
  title: string
  step_type: StepType
  instructions: string
  starter_code: string
  example_code: string
  example_explanation: string
  html_file_path: string | null
  html_body?: string | null
  prompt: string
  min_words: number
  max_words: number
  is_published: boolean
}

interface Project {
  id: string
  unit_id: string
  order_index: number
  title: string
  description: string
  estimated_minutes: number
  scaffold_level: string
  standards_tags: string[] | null
  is_published: boolean
  project_steps: ProjectStep[]
}

export default function ProjectEditorPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams<{ project_id: string }>()

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingMeta, setSavingMeta] = useState(false)

  // Local editable meta
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [estimatedMinutes, setEstimatedMinutes] = useState(60)
  const [standardsText, setStandardsText] = useState('')
  const [isPublished, setIsPublished] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!profile || profile.role !== 'admin') router.push('/login')
  }, [profile, authLoading, router])

  useEffect(() => {
    if (profile?.role === 'admin') load()
  }, [profile])

  const load = async () => {
    try {
      const data = await api.get<Project>(`/admin/curriculum/projects/${params.project_id}`)
      setProject(data)
      setTitle(data.title)
      setDescription(data.description || '')
      setEstimatedMinutes(data.estimated_minutes || 60)
      setStandardsText((data.standards_tags || []).join(', '))
      setIsPublished(data.is_published)
    } catch (err: any) {
      alert(err.message || 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }

  const saveMeta = async () => {
    setSavingMeta(true)
    try {
      const standardsList = standardsText.split(',').map(s => s.trim()).filter(Boolean)
      // order_index intentionally omitted — the up/down arrows in the
      // curriculum admin list are the only way to change it.
      await api.patch(`/admin/curriculum/projects/${params.project_id}`, {
        title,
        description,
        estimated_minutes: estimatedMinutes,
        standards_tags: standardsList.length ? standardsList : null,
        is_published: isPublished,
      })
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSavingMeta(false)
    }
  }

  const addStep = async (step_type: StepType) => {
    if (!project) return
    const nextOrder = ((project.project_steps || []).slice(-1)[0]?.order_index || 0) + 1
    const defaultTitle = step_type === 'coding' ? 'New coding step' : step_type === 'reading' ? 'New reading step' : 'New reflection'
    try {
      const created = await api.post<ProjectStep>(`/admin/curriculum/projects/${project.id}/steps`, {
        order_index: nextOrder,
        title: defaultTitle,
        step_type,
        is_published: false,
      })
      setProject(p => p ? { ...p, project_steps: [...(p.project_steps || []), created] } : p)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const updateStep = (stepId: string, patch: Partial<ProjectStep>) => {
    setProject(p => p ? { ...p, project_steps: p.project_steps.map(s => s.id === stepId ? { ...s, ...patch } : s) } : p)
  }

  const saveStep = async (step: ProjectStep) => {
    try {
      await api.patch(`/admin/curriculum/steps/${step.id}`, {
        order_index: step.order_index,
        title: step.title,
        step_type: step.step_type,
        instructions: step.instructions,
        starter_code: step.starter_code,
        example_code: step.example_code,
        example_explanation: step.example_explanation,
        html_body: step.html_body ?? null,
        prompt: step.prompt,
        min_words: step.min_words,
        max_words: step.max_words,
        is_published: step.is_published,
      })
    } catch (err: any) {
      alert(err.message)
    }
  }

  const deleteStep = async (step: ProjectStep) => {
    if (!confirm(`Delete step "${step.title}"?`)) return
    try {
      await api.delete(`/admin/curriculum/steps/${step.id}`)
      setProject(p => p ? { ...p, project_steps: p.project_steps.filter(s => s.id !== step.id) } : p)
    } catch (err: any) {
      alert(err.message)
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
    padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
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
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>project: {title || '...'}</span>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>{profile.email}</span>
      </div>

      {loading || !project ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: '#888780' }}>loading project...</div>
      ) : (
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem' }}>

          {/* META */}
          <div style={card}>
            <h2 style={{ margin: '0 0 1rem', fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>project details</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={label}>title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} style={input} />
              </div>
              <div>
                <label style={label}>est. minutes</label>
                <input type="number" value={estimatedMinutes} onChange={e => setEstimatedMinutes(parseInt(e.target.value, 10) || 0)} style={input} />
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={label}>description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...input, fontFamily: "'DM Sans', sans-serif", fontSize: '13px' }} placeholder="What students will build / learn in this project" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 120px', gap: '12px', alignItems: 'end' }}>
              <div>
                <label style={label}>standards (comma-separated)</label>
                <input value={standardsText} onChange={e => setStandardsText(e.target.value)} placeholder="CRD-1.A, IOC-1.A" style={input} />
              </div>
              <div>
                <label style={label}>published</label>
                <button onClick={() => setIsPublished(p => !p)} style={{ ...input, textAlign: 'left' as const, cursor: 'pointer', background: isPublished ? '#DCFCE7' : '#FEF9C3', color: isPublished ? '#166534' : '#854D0E', fontWeight: 600 }}>
                  {isPublished ? '● live' : '○ draft'}
                </button>
              </div>
              <button onClick={saveMeta} disabled={savingMeta} style={btn(true)}>{savingMeta ? 'saving...' : 'save details'}</button>
            </div>
          </div>

          {/* STEPS */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>steps ({project.project_steps?.length || 0})</h2>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => addStep('coding')} style={btn(false)}>+ coding</button>
                <button onClick={() => addStep('reading')} style={btn(false)}>+ reading</button>
                <button onClick={() => addStep('free_response')} style={btn(false)}>+ reflection</button>
              </div>
            </div>

            {(project.project_steps || []).length === 0 ? (
              <p style={{ color: '#888780', fontSize: '13px', textAlign: 'center', padding: '1rem' }}>no steps yet — add one above</p>
            ) : (
              (project.project_steps || []).map((step, i) => (
                <div key={step.id} style={{ border: '1px solid rgba(14,45,110,0.08)', borderRadius: '10px', padding: '1rem', marginBottom: '12px', background: '#FAFAF8' }}>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", color: '#888780', fontSize: '12px' }}>{step.order_index}</span>
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C', textTransform: 'uppercase' }}>{step.step_type.replace('_', ' ')}</span>
                      <input value={step.title} onChange={e => updateStep(step.id, { title: e.target.value })} style={{ ...input, fontWeight: 600, fontSize: '13px', flex: 1 }} />
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => updateStep(step.id, { is_published: !step.is_published })} style={{ ...btn(false), padding: '5px 10px', fontSize: '11px', background: step.is_published ? '#DCFCE7' : '#FEF9C3', color: step.is_published ? '#166534' : '#854D0E', border: 'none' }}>
                        {step.is_published ? 'live' : 'draft'}
                      </button>
                      <button onClick={() => saveStep(step)} style={btn(true)}>save</button>
                      <button onClick={() => deleteStep(step)} style={{ ...btn(false), borderColor: 'rgba(239,68,68,0.3)', color: '#991B1B' }}>delete</button>
                    </div>
                  </div>

                  {/* CODING STEP FIELDS */}
                  {step.step_type === 'coding' && (
                    <>
                      <label style={label}>instructions</label>
                      <textarea value={step.instructions || ''} onChange={e => updateStep(step.id, { instructions: e.target.value })} rows={4} style={{ ...input, background: 'white', fontFamily: "'DM Sans', sans-serif", fontSize: '13px', marginBottom: '10px' }} />
                      <label style={label}>starter code</label>
                      <textarea value={step.starter_code || ''} onChange={e => updateStep(step.id, { starter_code: e.target.value })} rows={6} style={{ ...textareaStyle, background: 'white', marginBottom: '10px' }} />
                      <label style={label}>example code (optional)</label>
                      <textarea value={step.example_code || ''} onChange={e => updateStep(step.id, { example_code: e.target.value })} rows={4} style={{ ...textareaStyle, background: 'white', marginBottom: '10px' }} />
                      <label style={label}>example explanation (optional)</label>
                      <textarea value={step.example_explanation || ''} onChange={e => updateStep(step.id, { example_explanation: e.target.value })} rows={2} style={{ ...input, background: 'white', fontFamily: "'DM Sans', sans-serif", fontSize: '13px' }} />
                    </>
                  )}

                  {/* READING STEP FIELDS */}
                  {step.step_type === 'reading' && (
                    <>
                      <label style={label}>html body</label>
                      <textarea
                        value={step.html_body ?? ''}
                        onChange={e => updateStep(step.id, { html_body: e.target.value })}
                        rows={12}
                        style={{ ...textareaStyle, background: 'white' }}
                        placeholder="<h1>Title</h1>&#10;<p>Body...</p>"
                      />
                      <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#888780' }}>Saved to Supabase Storage on save.</p>
                    </>
                  )}

                  {/* FREE RESPONSE STEP FIELDS */}
                  {step.step_type === 'free_response' && (
                    <>
                      <label style={label}>prompt</label>
                      <textarea value={step.prompt || ''} onChange={e => updateStep(step.id, { prompt: e.target.value })} rows={3} style={{ ...input, background: 'white', fontFamily: "'DM Sans', sans-serif", fontSize: '13px', marginBottom: '10px' }} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={label}>min words</label>
                          <input type="number" value={step.min_words || 0} onChange={e => updateStep(step.id, { min_words: parseInt(e.target.value, 10) || 0 })} style={{ ...input, background: 'white' }} />
                        </div>
                        <div>
                          <label style={label}>max words</label>
                          <input type="number" value={step.max_words || 0} onChange={e => updateStep(step.id, { max_words: parseInt(e.target.value, 10) || 0 })} style={{ ...input, background: 'white' }} />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Link href="/admin/curriculum" style={{ ...btn(false), textDecoration: 'none' }}>← back to curriculum</Link>
          </div>

        </div>
      )}
    </div>
  )
}
