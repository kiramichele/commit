'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

interface Lesson {
  id: string
  title: string
  order_index: number
  units: { id: string; title: string; order_index: number }
  lesson_content: {
    activity_file_path: string | null
  } | null
}

type SaveStatus = 'idle' | 'saving' | 'saved'

// ============================================================
// Commit SDK — injected into every activity iframe.
// Activity HTML talks to the parent through `window.Commit`:
//   Commit.submit(responses)         — send final responses
//   Commit.getPriorResponses()       — Promise<object|null>
//   Commit.onReady(cb)               — fired when DOM is ready
//   Commit.on('submitting' | 'submitted' | 'error', cb)
// Message protocol (iframe -> parent):
//   COMMIT_IFRAME_READY
//   COMMIT_SUBMIT { responses }
//   COMMIT_GET_PRIOR_RESPONSES
// Message protocol (parent -> iframe):
//   COMMIT_PRIOR_RESPONSES { responses: object | null }
//   COMMIT_SUBMIT_OK
//   COMMIT_SUBMIT_ERROR { message }
// ============================================================
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

export default function ActivityPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const lessonId = params.lesson_id as string
  const assignmentId = searchParams.get('assignment_id')

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [activityUrl, setActivityUrl] = useState<string | null>(null)
  const [activityHtml, setActivityHtml] = useState<string | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [responseCount, setResponseCount] = useState(0)

  useEffect(() => {
    if (loading) return
    if (!profile) router.push('/login')
  }, [profile, loading])

  useEffect(() => {
    if (!profile || !lessonId) return
    fetchActivity()
  }, [profile, lessonId])

  const fetchActivity = async () => {
    setDataLoading(true)
    try {
      const lessonData = await api.get<Lesson>(`/curriculum/lessons/${lessonId}`)
      setLesson(lessonData)
      if (!lessonData?.lesson_content?.activity_file_path) {
        setError('No activity found for this lesson.')
        return
      }
      const urlData = await api.get<{ url: string }>(`/curriculum/lessons/${lessonId}/activity-url`)
      setActivityUrl(urlData.url)
      fetch(urlData.url).then(r => r.text()).then(html => {
        setActivityHtml(html + COMMIT_SDK_SCRIPT)
      }).catch(() => {})
    } catch (e) {
      setError('Could not load activity.')
    } finally {
      setDataLoading(false)
    }
  }

  // ── COMMIT SDK MESSAGE HANDLER ──────────────────────────────
  const handleMessage = useCallback(async (event: MessageEvent) => {
    const data = event.data
    if (!data || !data.type) return
    const iframe = (event.source as Window | null) || undefined

    if (data.type === 'COMMIT_SUBMIT') {
      const responses = data.responses || {}
      const fieldCount = Object.keys(responses).length
      setResponseCount(fieldCount)
      setSaveStatus('saving')

      try {
        await api.post('/exercises/save', {
          lesson_id: lessonId,
          exercise_index: 0,
          exercise_type: 'activity_responses',
          response_text: JSON.stringify(responses),
        })
        setSaveStatus('saved')
        setLastSaved(new Date())
        setTimeout(() => setSaveStatus('idle'), 2000)
        iframe?.postMessage({ type: 'COMMIT_SUBMIT_OK' }, '*')
      } catch (e: any) {
        console.error('Failed to save activity responses:', e)
        setSaveStatus('idle')
        iframe?.postMessage({ type: 'COMMIT_SUBMIT_ERROR', payload: { message: e?.message || 'save failed' } }, '*')
      }
      return
    }

    if (data.type === 'COMMIT_GET_PRIOR_RESPONSES') {
      try {
        const all = await api.get<Array<{ exercise_index: number; exercise_type: string; response_text: string | null }>>(
          `/exercises/lesson/${lessonId}/my`
        )
        const mine = (all || []).find(r => r.exercise_index === 0 && r.exercise_type === 'activity_responses')
        let parsed: any = null
        if (mine?.response_text) {
          try { parsed = JSON.parse(mine.response_text) } catch { parsed = null }
        }
        iframe?.postMessage({ type: 'COMMIT_PRIOR_RESPONSES', responses: parsed }, '*')
      } catch (e) {
        iframe?.postMessage({ type: 'COMMIT_PRIOR_RESPONSES', responses: null }, '*')
      }
      return
    }
  }, [lessonId])

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  const backHref = `/lesson/${lessonId}`

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <p style={{ color: '#888780' }}>loading...</p>
    </div>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* SLIM NAV */}
      <nav style={{ height: '44px', flexShrink: 0, background: 'rgba(248,247,245,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 1.25rem', display: 'flex', alignItems: 'center', gap: '10px', zIndex: 50 }}>
        <Link href="/learn" style={{ display: 'flex', alignItems: 'center', gap: '7px', textDecoration: 'none', flexShrink: 0 }}>
          <div style={{ width: '24px', height: '24px', background: '#1A56DB', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '9px', color: 'white' }}>{'>'}_</div>
        </Link>

        <span style={{ color: '#D3D1C7', flexShrink: 0 }}>/</span>

        <Link href={backHref} style={{ fontSize: '12px', color: '#888780', textDecoration: 'none', flexShrink: 0, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lesson?.units?.title && <span>{lesson.units.title} · </span>}
          {lesson?.title}
        </Link>

        <span style={{ color: '#D3D1C7', flexShrink: 0 }}>/</span>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#0E2D6E', flexShrink: 0 }}>activity</span>

        <div style={{ flex: 1 }} />

        {/* SAVE STATUS */}
        {profile.role === 'student' && responseCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            {saveStatus === 'saving' && (
              <span style={{ fontSize: '11px', color: '#888780' }}>saving...</span>
            )}
            {saveStatus === 'saved' && (
              <span style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>✓ responses saved</span>
            )}
            {saveStatus === 'idle' && lastSaved && (
              <span style={{ fontSize: '11px', color: '#888780' }}>
                {responseCount} response{responseCount !== 1 ? 's' : ''} saved
              </span>
            )}
          </div>
        )}

        <Link href={backHref} style={{ fontSize: '12px', fontWeight: 600, color: '#5F5E5A', textDecoration: 'none', padding: '5px 12px', background: '#F1EFE8', borderRadius: '6px', border: '1px solid rgba(14,45,110,0.08)', flexShrink: 0 }}>
          ← back to lesson
        </Link>
      </nav>

      {/* CONTENT */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {dataLoading ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
            <div style={{ width: '32px', height: '32px', border: '2px solid #EBF1FD', borderTopColor: '#1A56DB', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ fontSize: '13px', color: '#888780' }}>loading activity...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : error ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', padding: '2rem' }}>
            <div style={{ fontSize: '3rem', opacity: 0.3 }}>◎</div>
            <p style={{ fontSize: '15px', color: '#5F5E5A', fontWeight: 500, textAlign: 'center' }}>{error}</p>
            <Link href={backHref} style={{ fontSize: '13px', color: '#1A56DB', fontWeight: 600, textDecoration: 'none' }}>← back to lesson</Link>
          </div>
        ) : activityHtml ? (
          <iframe
            srcDoc={activityHtml}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            sandbox="allow-scripts allow-same-origin allow-forms"
            title={`Activity: ${lesson?.title}`}
          />
        ) : activityUrl ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888780', fontSize: '14px' }}>loading activity...</div>
        ) : null}
      </div>
    </div>
  )
}