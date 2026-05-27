'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

type AssignmentType = 'code' | 'activity' | 'checkin' | 'quiz' | 'project'

interface Assignment {
  id: string
  title: string
  instructions: string
  starter_code: string
  assignment_type: AssignmentType
  units: { id: string; title: string; order_index: number } | null
  checkin_format: 'html' | 'short_answer' | 'rating' | 'coding' | null
  html_file_path: string | null
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
}

// SDK injected into activity iframes — same shape as the lesson activity page.
const COMMIT_SDK_SCRIPT = `<script>
(function(){
  if(window.self===window.top)return;
  var listeners={ready:[],submitting:[],submitted:[],error:[]};
  var priorResolvers=[];
  function emit(ev,payload){(listeners[ev]||[]).forEach(function(fn){try{fn(payload)}catch(e){console.error(e)}});}
  window.addEventListener('message',function(e){
    var d=e.data;if(!d||!d.type)return;
    if(d.type==='COMMIT_SUBMIT_OK')emit('submitted',d.payload);
    else if(d.type==='COMMIT_SUBMIT_ERROR')emit('error',d.payload||{message:'submit failed'});
    else if(d.type==='COMMIT_PRIOR_RESPONSES'){
      var r=priorResolvers;priorResolvers=[];
      r.forEach(function(res){res(d.responses||null)});
    }
  });
  window.Commit={
    submit:function(responses){
      emit('submitting',null);
      window.parent.postMessage({type:'COMMIT_SUBMIT',responses:responses||{}},'*');
    },
    getPriorResponses:function(){
      return new Promise(function(resolve){
        priorResolvers.push(resolve);
        window.parent.postMessage({type:'COMMIT_GET_PRIOR_RESPONSES'},'*');
      });
    },
    on:function(ev,cb){if(!listeners[ev])listeners[ev]=[];listeners[ev].push(cb);},
    onReady:function(cb){
      if(document.readyState!=='loading'){cb()}
      else{document.addEventListener('DOMContentLoaded',cb)}
    }
  };
  window.parent.postMessage({type:'COMMIT_IFRAME_READY'},'*');
})();
<\/script>`

export default function CurriculumAssignmentPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const params = useParams<{ assignment_id: string }>()

  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [error, setError] = useState('')

  // Per-type state
  const [activityHtml, setActivityHtml] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({})
  const [textResponse, setTextResponse] = useState('')
  const [ratingResponse, setRatingResponse] = useState<number | null>(null)
  const [checkinHtml, setCheckinHtml] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [output, setOutput] = useState('')
  const [outputError, setOutputError] = useState(false)
  const [running, setRunning] = useState(false)

  const [saving, setSaving] = useState(false)
  const [savedScore, setSavedScore] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!profile) router.push('/login')
  }, [profile, loading, router])

  useEffect(() => {
    if (!profile) return
    load()
  }, [profile])

  const load = async () => {
    setPageLoading(true)
    try {
      const a = await api.get<Assignment>(`/curriculum/curriculum-assignments/${params.assignment_id}`)
      setAssignment(a)

      if (a.assignment_type === 'code') {
        setCode(a.starter_code || '')
      }

      if (a.assignment_type === 'checkin' && a.checkin_format === 'coding') {
        setCode(a.starter_code || '')
      }

      if (a.assignment_type === 'activity') {
        try {
          const { url } = await api.get<{ url: string }>(`/curriculum/curriculum-assignments/${a.id}/html-url`)
          const html = await fetch(url).then(r => r.text())
          setActivityHtml(html + COMMIT_SDK_SCRIPT)
        } catch {}
      }

      // Check-in with HTML prompt: fetch the body, inject the Commit SDK so
      // the activity HTML can submit responses from its own forms, and render
      // it just like an activity (no separate textarea below).
      if (a.assignment_type === 'checkin' && a.checkin_format === 'html' && a.html_file_path) {
        try {
          const { url } = await api.get<{ url: string }>(`/curriculum/curriculum-assignments/${a.id}/html-url`)
          const html = await fetch(url).then(r => r.text())
          setCheckinHtml(html + COMMIT_SDK_SCRIPT)
        } catch {}
      }

      if (a.assignment_type === 'quiz') {
        const qs = await api.get<Question[]>(`/curriculum/curriculum-assignments/${a.id}/questions`)
        setQuestions(qs || [])
      }

      // Restore prior submission
      try {
        const prior = await api.get<{ response_text: string | null; is_correct: boolean | null } | null>(
          `/curriculum/curriculum-assignments/${a.id}/my-submission`
        )
        if (prior?.response_text) {
          const parsed = JSON.parse(prior.response_text)
          if (a.assignment_type === 'quiz') setQuizAnswers(parsed)
          else if (a.assignment_type === 'code') setCode(parsed.code || a.starter_code || '')
          else if (a.assignment_type === 'checkin') {
            if (a.checkin_format === 'rating' && typeof parsed.rating === 'number') setRatingResponse(parsed.rating)
            else if (a.checkin_format === 'coding') setCode(parsed.code || a.starter_code || '')
            else setTextResponse(parsed.text || '')
          }
          else if (a.assignment_type === 'project') setTextResponse(parsed.text || '')
          setSubmitted(true)
        }
      } catch {}
    } catch (err: any) {
      setError(err.message || 'Could not load assignment')
    } finally {
      setPageLoading(false)
    }
  }

  const submit = async (responseData: any) => {
    setSaving(true)
    try {
      const result = await api.post<{ submitted: boolean; score: number | null }>(
        `/curriculum/curriculum-assignments/${params.assignment_id}/submit`,
        { response_data: responseData }
      )
      setSavedScore(result.score)
      setSubmitted(true)
    } catch (err: any) {
      alert(err.message || 'Submit failed')
    } finally {
      setSaving(false)
    }
  }

  // Activity message handler (parent side of the SDK)
  const handleActivityMessage = useCallback(async (event: MessageEvent) => {
    const data = event.data
    if (!data || !data.type) return
    const iframe = (event.source as Window | null) || undefined

    if (data.type === 'COMMIT_SUBMIT') {
      try {
        await api.post(`/curriculum/curriculum-assignments/${params.assignment_id}/submit`, {
          response_data: data.responses || {},
        })
        setSubmitted(true)
        iframe?.postMessage({ type: 'COMMIT_SUBMIT_OK' }, '*')
      } catch (e: any) {
        iframe?.postMessage({ type: 'COMMIT_SUBMIT_ERROR', payload: { message: e?.message || 'save failed' } }, '*')
      }
      return
    }

    if (data.type === 'COMMIT_GET_PRIOR_RESPONSES') {
      try {
        const prior = await api.get<{ response_text: string | null } | null>(
          `/curriculum/curriculum-assignments/${params.assignment_id}/my-submission`
        )
        const parsed = prior?.response_text ? JSON.parse(prior.response_text) : null
        iframe?.postMessage({ type: 'COMMIT_PRIOR_RESPONSES', responses: parsed }, '*')
      } catch {
        iframe?.postMessage({ type: 'COMMIT_PRIOR_RESPONSES', responses: null }, '*')
      }
    }
  }, [params.assignment_id])

  useEffect(() => {
    // The Commit SDK handler powers both activity assignments and HTML
    // check-ins — both inject the SDK into an iframe and submit responses
    // through window.postMessage.
    const isSdkIframe = assignment?.assignment_type === 'activity'
      || (assignment?.assignment_type === 'checkin' && assignment?.checkin_format === 'html')
    if (!isSdkIframe) return
    window.addEventListener('message', handleActivityMessage)
    return () => window.removeEventListener('message', handleActivityMessage)
  }, [assignment, handleActivityMessage])

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
      setOutput(e.message || 'Execution failed'); setOutputError(true)
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

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5' }}>
      <p style={{ color: '#888780', fontFamily: "'DM Sans', sans-serif" }}>loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 1.5rem', height: '52px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Link href="/learn" style={{ display: 'flex', alignItems: 'center', gap: '7px', textDecoration: 'none' }}>
          <div style={{ width: '26px', height: '26px', background: '#1A56DB', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'white' }}>{'>'}_</div>
        </Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        {assignment?.units && <span style={{ fontSize: '12px', color: '#888780' }}>Unit {assignment.units.order_index}</span>}
        <span style={{ color: '#D3D1C7' }}>/</span>
        <span style={{ fontSize: '13px', color: '#0E2D6E', fontWeight: 500 }}>{assignment?.title}</span>
        {submitted && <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#166534', fontWeight: 600 }}>✓ submitted{savedScore != null ? ` — ${savedScore}%` : ''}</span>}
      </nav>

      {pageLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888780' }}>loading...</div>
      ) : error || !assignment ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', color: '#888780', padding: '2rem' }}>
          <div style={{ fontSize: '2rem', opacity: 0.4 }}>◎</div>
          <p style={{ fontSize: '14px', margin: 0 }}>{error || 'assignment not found'}</p>
          <Link href="/learn" style={{ fontSize: '13px', color: '#1A56DB', fontWeight: 600, textDecoration: 'none' }}>← back to learn</Link>
        </div>
      ) : assignment.assignment_type === 'checkin' && assignment.checkin_format === 'coding' ? (
        // ── CHECK-IN: coding format → 3-pane editor ──
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1.1fr 1fr', minHeight: 'calc(100vh - 52px)' }}>
          <div style={{ borderRight: '1px solid rgba(14,45,110,0.08)', background: 'white', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 16px', background: '#F8F7F5', borderBottom: '1px solid rgba(14,45,110,0.06)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888780' }}>check-in</div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', fontSize: '14px', color: '#0E2D6E', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{assignment.instructions || 'no prompt'}</div>
          </div>
          <div style={{ background: '#1C1C1E', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(14,45,110,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: '#242426', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>your code</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={handleRun} disabled={running} style={{ padding: '5px 14px', background: running ? '#166534' : '#22C55E', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>{running ? '◌ running...' : '▶ run'}</button>
                <button onClick={() => submit({ code })} disabled={saving} style={{ padding: '5px 14px', background: '#1A56DB', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>{saving ? 'saving...' : submitted ? 'resubmit' : 'submit'}</button>
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
      ) : assignment.assignment_type === 'checkin' && assignment.checkin_format === 'rating' ? (
        // ── CHECK-IN: 1-5 rating ──
        <div style={{ flex: 1, maxWidth: '600px', margin: '0 auto', padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.75rem 2rem' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0C447C', marginBottom: '10px' }}>check-in</div>
            <p style={{ margin: '0 0 1.5rem', fontSize: '15px', color: '#0E2D6E', lineHeight: 1.7, fontWeight: 500, whiteSpace: 'pre-wrap' }}>{assignment.instructions}</p>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '1.5rem' }}>
              {[1, 2, 3, 4, 5].map(n => {
                const active = ratingResponse === n
                return (
                  <button
                    key={n}
                    onClick={() => setRatingResponse(n)}
                    style={{
                      width: '60px', height: '60px', borderRadius: '12px', fontSize: '20px', fontWeight: 700,
                      border: active ? '3px solid #1A56DB' : '2px solid rgba(14,45,110,0.12)',
                      background: active ? '#EBF1FD' : 'white',
                      color: active ? '#0C447C' : '#5F5E5A',
                      cursor: 'pointer',
                      fontFamily: "'DM Sans', sans-serif",
                      transition: 'all 0.1s',
                    }}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#888780', padding: '0 12px', marginBottom: '1.5rem' }}>
              <span>1 — low</span>
              <span>5 — high</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => submit({ rating: ratingResponse })}
                disabled={saving || ratingResponse == null}
                style={{ padding: '10px 22px', background: ratingResponse == null ? '#D3D1C7' : '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: saving || ratingResponse == null ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}
              >
                {saving ? 'submitting...' : submitted ? 'resubmit' : 'submit'}
              </button>
            </div>
          </div>
        </div>
      ) : assignment.assignment_type === 'checkin' && assignment.checkin_format === 'html' ? (
        // ── CHECK-IN: html with embedded form inputs (Commit SDK powers it) ──
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {checkinHtml ? (
            <iframe srcDoc={checkinHtml} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} sandbox="allow-scripts allow-same-origin allow-forms" title={assignment.title} />
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888780' }}>loading check-in...</div>
          )}
        </div>
      ) : assignment.assignment_type === 'code' ? (
        // ── 3-PANE FOR CODING ──
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1.1fr 1fr', minHeight: 'calc(100vh - 52px)' }}>
          <div style={{ borderRight: '1px solid rgba(14,45,110,0.08)', background: 'white', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 16px', background: '#F8F7F5', borderBottom: '1px solid rgba(14,45,110,0.06)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888780' }}>problem</div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', fontSize: '14px', color: '#0E2D6E', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{assignment.instructions || 'no instructions provided'}</div>
          </div>
          <div style={{ background: '#1C1C1E', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(14,45,110,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: '#242426', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>editor · python</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={handleRun} disabled={running} style={{ padding: '5px 14px', background: running ? '#166534' : '#22C55E', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>{running ? '◌ running...' : '▶ run'}</button>
                <button onClick={() => submit({ code })} disabled={saving} style={{ padding: '5px 14px', background: '#1A56DB', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>{saving ? 'saving...' : submitted ? 'resubmit' : 'submit'}</button>
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
      ) : assignment.assignment_type === 'activity' ? (
        // ── ACTIVITY (iframe with Commit SDK) ──
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {activityHtml ? (
            <iframe srcDoc={activityHtml} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} sandbox="allow-scripts allow-same-origin allow-forms" title={assignment.title} />
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888780' }}>loading activity...</div>
          )}
        </div>
      ) : assignment.assignment_type === 'quiz' ? (
        // ── QUIZ ──
        <div style={{ flex: 1, maxWidth: '760px', margin: '0 auto', padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
          {assignment.instructions && (
            <div style={{ padding: '1rem 1.25rem', background: '#EBF1FD', borderRadius: '12px', marginBottom: '1.5rem', fontSize: '14px', color: '#0E2D6E', lineHeight: 1.7 }}>
              {assignment.instructions}
            </div>
          )}
          {questions.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', color: '#888780', fontSize: '14px' }}>no questions yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {questions.map((q, i) => (
                <div key={q.id} style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.25rem 1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', color: '#888780' }}>Q{i + 1}</span>
                    <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: q.question_type === 'multiple_choice' ? '#EBF1FD' : '#FEF3C7', color: q.question_type === 'multiple_choice' ? '#0C447C' : '#92400E', textTransform: 'uppercase' }}>
                      {q.question_type === 'multiple_choice' ? 'multiple choice' : 'constructed response'}
                    </span>
                  </div>
                  <div style={{ fontSize: '15px', color: '#0E2D6E', fontWeight: 500, marginBottom: '10px', lineHeight: 1.6 }}>{q.question_text}</div>
                  {q.code_block && (
                    <pre style={{ margin: '0 0 12px', padding: '10px 14px', background: '#1C1C1E', color: '#EBF1FD', borderRadius: '8px', fontFamily: "'DM Mono', monospace", fontSize: '13px', lineHeight: 1.7, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{q.code_block}</pre>
                  )}

                  {q.question_type === 'multiple_choice' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {(['a', 'b', 'c', 'd'] as const).map(letter => {
                        const choice = (q as any)[`choice_${letter}`]
                        if (!choice) return null
                        const checked = quizAnswers[q.id] === letter
                        return (
                          <label key={letter} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: `1.5px solid ${checked ? '#1A56DB' : 'rgba(14,45,110,0.12)'}`, background: checked ? '#EBF1FD' : '#FAFAF8', cursor: 'pointer', fontSize: '14px', color: '#0E2D6E' }}>
                            <input type="radio" name={`q-${q.id}`} value={letter} checked={checked} onChange={() => setQuizAnswers(a => ({ ...a, [q.id]: letter }))} />
                            <span style={{ fontWeight: 600, fontFamily: "'DM Mono', monospace", fontSize: '12px', color: '#888780' }}>{letter})</span>
                            <span>{choice}</span>
                          </label>
                        )
                      })}
                    </div>
                  ) : (
                    <textarea
                      value={quizAnswers[q.id] || ''}
                      onChange={e => setQuizAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                      placeholder="Type your response..."
                      rows={4}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '14px', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6, color: '#333', resize: 'vertical', boxSizing: 'border-box', background: '#FAFAF8' }}
                    />
                  )}
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <button onClick={() => submit(quizAnswers)} disabled={saving} style={{ padding: '10px 22px', background: '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>{saving ? 'submitting...' : submitted ? 'resubmit' : 'submit quiz'}</button>
              </div>
              {savedScore != null && (
                <div style={{ padding: '12px 16px', background: savedScore >= 70 ? '#DCFCE7' : '#FEE2E2', borderRadius: '8px', textAlign: 'center', fontSize: '14px', fontWeight: 600, color: savedScore >= 70 ? '#166534' : '#991B1B' }}>
                  Score: {savedScore}% on auto-graded questions
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        // ── CHECK-IN / PROJECT-TYPE / FALLBACK: simple textarea ──
        <div style={{ flex: 1, maxWidth: '760px', margin: '0 auto', padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', background: '#EBF1FD', borderBottom: '1px solid rgba(26,86,219,0.1)' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0C447C', marginBottom: '6px' }}>{assignment.assignment_type === 'checkin' ? 'check-in' : 'prompt'}</div>
              <p style={{ margin: 0, fontSize: '14px', color: '#0E2D6E', lineHeight: 1.7, fontWeight: 500, whiteSpace: 'pre-wrap' }}>{assignment.instructions}</p>
            </div>
            <textarea value={textResponse} onChange={e => setTextResponse(e.target.value)} rows={10} placeholder="Write your response..." style={{ width: '100%', padding: '1.25rem 1.5rem', border: 'none', outline: 'none', resize: 'vertical', fontSize: '14px', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.8, color: '#333', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.75rem 1.5rem', background: '#F8F7F5', borderTop: '1px solid rgba(14,45,110,0.06)' }}>
              <button onClick={() => submit({ text: textResponse })} disabled={saving} style={{ padding: '9px 20px', background: '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>{saving ? 'submitting...' : submitted ? 'resubmit' : 'submit'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
