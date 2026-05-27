'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

type StepType = 'coding' | 'reading' | 'free_response'

interface Step {
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
  prompt: string
  min_words: number
  max_words: number
  projects: { id: string; title: string; unit_id: string; units: { id: string; title: string; order_index: number } } | null
}

export default function ProjectStepPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const params = useParams<{ project_id: string; step_id: string }>()

  const [step, setStep] = useState<Step | null>(null)
  const [stepLoading, setStepLoading] = useState(true)

  // Coding state
  const [code, setCode] = useState('')
  const [output, setOutput] = useState('')
  const [outputError, setOutputError] = useState(false)
  const [running, setRunning] = useState(false)

  // Reading state
  const [readingHtml, setReadingHtml] = useState<string | null>(null)

  // Reflection state
  const [responseText, setResponseText] = useState('')

  // Completion state
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  useEffect(() => {
    if (loading) return
    if (!profile) router.push('/login')
  }, [profile, loading, router])

  useEffect(() => {
    if (!profile) return
    loadStep()
  }, [profile, params.step_id])

  const loadStep = async () => {
    setStepLoading(true)
    try {
      const s = await api.get<Step>(`/curriculum/steps/${params.step_id}`)
      setStep(s)

      if (s.step_type === 'coding') {
        setCode(s.starter_code || '')
      }

      if (s.step_type === 'reading' && s.html_file_path) {
        try {
          const { url } = await api.get<{ url: string }>(`/curriculum/steps/${params.step_id}/html-url`)
          const html = await fetch(url).then(r => r.text())
          setReadingHtml(html)
        } catch {}
      }

      // Restore prior submission if any
      try {
        const all = await api.get<Array<{ step_id: string; response_text: string | null; code_snapshot: string | null; completed_at: string }>>(
          `/curriculum/projects/${s.project_id}/my-progress`
        )
        const mine = all.find(p => p.step_id === s.id)
        if (mine) {
          if (s.step_type === 'free_response' && mine.response_text) setResponseText(mine.response_text)
          if (s.step_type === 'coding' && mine.code_snapshot) setCode(mine.code_snapshot)
          setSavedAt(new Date(mine.completed_at))
        }
      } catch {}
    } catch (err: any) {
      console.error(err)
    } finally {
      setStepLoading(false)
    }
  }

  const handleRun = async () => {
    setRunning(true)
    setOutput('')
    setOutputError(false)
    try {
      const result = await api.post<{ output: string; stderr: string }>('/code/run', { code })
      if (result.stderr && !result.output) {
        setOutput(result.stderr); setOutputError(true)
      } else {
        setOutput(result.output || '(no output)')
      }
    } catch (e: any) {
      setOutput(e.message || 'Execution failed.'); setOutputError(true)
    } finally {
      setRunning(false)
    }
  }

  const handleTab = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const el = e.currentTarget
    const start = el.selectionStart
    const next = code.substring(0, start) + '    ' + code.substring(start)
    setCode(next)
    setTimeout(() => { el.selectionStart = el.selectionEnd = start + 4 }, 0)
  }

  const handleComplete = async () => {
    if (!step) return
    setSaving(true)
    try {
      await api.post(`/curriculum/steps/${step.id}/complete`, {
        response_text: step.step_type === 'free_response' ? responseText : null,
        code_snapshot: step.step_type === 'coding' ? code : null,
      })
      setSavedAt(new Date())
    } catch (err: any) {
      alert(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const resetToStarter = () => {
    if (code !== step?.starter_code && !confirm('Reset to starter code? Your edits will be lost.')) return
    setCode(step?.starter_code || '')
  }

  const wordCount = responseText.trim() === '' ? 0 : responseText.trim().split(/\s+/).length
  const minWords = step?.min_words || 0
  const maxWords = step?.max_words || 0
  const isTooShort = minWords > 0 && wordCount < minWords
  const isTooLong = maxWords > 0 && wordCount > maxWords

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5' }}>
      <p style={{ color: '#888780', fontFamily: "'DM Sans', sans-serif" }}>loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* TOPBAR */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 1.5rem', height: '52px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Link href="/learn" style={{ display: 'flex', alignItems: 'center', gap: '7px', textDecoration: 'none' }}>
          <div style={{ width: '26px', height: '26px', background: '#1A56DB', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'white' }}>{'>'}_</div>
        </Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        <Link href={`/project/${params.project_id}`} style={{ fontSize: '12px', color: '#888780', textDecoration: 'none' }}>
          {step?.projects?.title || 'project'}
        </Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        <span style={{ fontSize: '13px', color: '#0E2D6E', fontWeight: 500 }}>
          step {step?.order_index}: {step?.title}
        </span>
        <div style={{ flex: 1 }} />
        {savedAt && <span style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>✓ saved</span>}
      </nav>

      {stepLoading || !step ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888780' }}>loading step...</div>
      ) : step.step_type === 'coding' ? (
        // ── 3-PANE FOR CODING ──
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1.1fr 1fr', minHeight: 'calc(100vh - 52px)' }}>

          <div style={{ borderRight: '1px solid rgba(14,45,110,0.08)', background: 'white', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 16px', background: '#F8F7F5', borderBottom: '1px solid rgba(14,45,110,0.06)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888780' }}>problem</div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', fontSize: '14px', color: '#0E2D6E', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {step.instructions || 'no instructions provided'}
            </div>
          </div>

          <div style={{ background: '#1C1C1E', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(14,45,110,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: '#242426', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>editor · python</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={resetToStarter} disabled={!step.starter_code || code === step.starter_code} style={{ padding: '5px 12px', background: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>↺ starter</button>
                <button onClick={handleRun} disabled={running} style={{ padding: '5px 14px', background: running ? '#166534' : '#22C55E', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>{running ? '◌ running...' : '▶ run'}</button>
                <button onClick={handleComplete} disabled={saving} style={{ padding: '5px 14px', background: '#1A56DB', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>{saving ? 'saving...' : 'mark complete'}</button>
              </div>
            </div>
            <textarea value={code} onChange={e => setCode(e.target.value)} onKeyDown={handleTab} spellCheck={false} style={{ flex: 1, background: '#1C1C1E', color: '#EBF1FD', fontFamily: "'DM Mono', monospace", fontSize: '14px', lineHeight: 1.8, padding: '1rem 1.25rem', border: 'none', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
          </div>

          <div style={{ background: '#111113', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 16px', background: '#1C1C1E', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>console</div>
            <pre style={{ flex: 1, margin: 0, padding: '1rem 1.25rem', fontFamily: "'DM Mono', monospace", fontSize: '13px', color: outputError ? '#F09595' : '#22C55E', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowY: 'auto' }}>
              {output || <span style={{ color: 'rgba(255,255,255,0.25)' }}>run your code to see output here</span>}
            </pre>
          </div>
        </div>
      ) : step.step_type === 'reading' ? (
        // ── READING ──
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {readingHtml ? (
            <iframe srcDoc={readingHtml} style={{ flex: 1, width: '100%', border: 'none', minHeight: 'calc(100vh - 104px)' }} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" title={step.title} />
          ) : (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#888780', fontSize: '14px' }}>no reading content uploaded</div>
          )}
          <div style={{ padding: '1rem 2rem', background: 'white', borderTop: '1px solid rgba(14,45,110,0.08)', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleComplete} disabled={saving} style={{ padding: '10px 20px', background: '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>{saving ? 'saving...' : savedAt ? '✓ marked complete' : 'mark complete'}</button>
          </div>
        </div>
      ) : (
        // ── FREE RESPONSE ──
        <div style={{ flex: 1, maxWidth: '760px', margin: '0 auto', padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', background: '#EBF1FD', borderBottom: '1px solid rgba(26,86,219,0.1)' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0C447C', marginBottom: '6px' }}>reflection</div>
              <p style={{ margin: 0, fontSize: '14px', color: '#0E2D6E', lineHeight: 1.7, fontWeight: 500 }}>{step.prompt || step.instructions}</p>
              {(minWords > 0 || maxWords > 0) && (
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#5F5E5A' }}>
                  {minWords > 0 && `minimum ${minWords} words`}
                  {minWords > 0 && maxWords > 0 && ' · '}
                  {maxWords > 0 && `maximum ${maxWords} words`}
                </p>
              )}
            </div>
            <textarea value={responseText} onChange={e => setResponseText(e.target.value)} rows={10} placeholder="Write your response..." style={{ width: '100%', padding: '1.25rem 1.5rem', border: 'none', outline: 'none', resize: 'vertical', fontSize: '14px', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.8, color: '#333', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.5rem', background: '#F8F7F5', borderTop: '1px solid rgba(14,45,110,0.06)' }}>
              <span style={{ fontSize: '12px', color: isTooShort || isTooLong ? '#991B1B' : '#888780', fontWeight: isTooShort || isTooLong ? 600 : 400 }}>
                {wordCount} word{wordCount !== 1 ? 's' : ''}
                {isTooShort && ` — need ${minWords - wordCount} more`}
                {isTooLong && ` — ${wordCount - maxWords} over limit`}
              </span>
              <button onClick={handleComplete} disabled={saving || isTooShort || isTooLong} style={{ padding: '8px 18px', background: '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: isTooShort || isTooLong ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif" }}>{saving ? 'saving...' : savedAt ? '✓ saved' : 'submit'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
