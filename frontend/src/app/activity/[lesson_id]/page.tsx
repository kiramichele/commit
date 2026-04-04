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

const ACTIVITY_RESPONSE_SCRIPT = `<script>
(function(){
  if(window.self===window.top)return;
  var t=null;
  function collect(){
    var r={};
    document.querySelectorAll('textarea').forEach(function(el,i){
      var k=el.name||el.id||el.dataset.responseKey||('textarea_'+i);
      r[k]={type:'text',label:el.placeholder||el.getAttribute('aria-label')||k,value:el.value,wordCount:el.value.trim()?el.value.trim().split(/\\s+/).length:0};
    });
    document.querySelectorAll('input[type="text"],input[type="number"]').forEach(function(el,i){
      var k=el.name||el.id||('input_'+i);
      if(!k.startsWith('input_')||el.value)r[k]={type:'text',label:el.placeholder||el.getAttribute('aria-label')||k,value:el.value};
    });
    document.querySelectorAll('select').forEach(function(el,i){
      var k=el.name||el.id||('select_'+i);
      r[k]={type:'select',label:k,value:el.value,text:el.options[el.selectedIndex]?.text||el.value};
    });
    var cg={};
    document.querySelectorAll('input[type="checkbox"],input[type="radio"]').forEach(function(el){
      var g=el.name||el.dataset.group||'checks';if(!cg[g])cg[g]=[];
      if(el.checked)cg[g].push(el.value||el.id||el.dataset.label||'checked');
    });
    Object.keys(cg).forEach(function(g){r['check_'+g]={type:'checkbox',label:g,value:cg[g].join(', '),selected:cg[g]};});
    document.querySelectorAll('[data-response-value]').forEach(function(el){
      var k=el.dataset.responseKey||'selection';
      r[k]={type:'selection',label:el.dataset.responseLabel||k,value:el.dataset.responseValue};
    });
    return r;
  }
  function post(){
    var r=collect();
    if(!Object.values(r).some(function(v){return v.value&&v.value.toString().trim().length>0}))return;
    window.parent.postMessage({type:'COMMIT_ACTIVITY_RESPONSES',responses:r,timestamp:new Date().toISOString()},'*');
  }
  function sched(){clearTimeout(t);t=setTimeout(post,1500);}
  document.addEventListener('input',sched);
  document.addEventListener('change',sched);
  document.addEventListener('click',function(e){
    if(e.target.closest('[onclick]')||e.target.closest('.platform-card')||e.target.closest('.signal-item')||e.target.closest('[data-response-value]'))sched();
  });
  setTimeout(post,500);
  window.addEventListener('hashchange',sched);
})();
<\/script>`

const ACTIVITY_PREFILL_SCRIPT = `<script>
(function(){
  if(window.self===window.top)return;
  window.addEventListener('message',function(event){
    if(!event.data||event.data.type!=='COMMIT_PREFILL_RESPONSES')return;
    var r=event.data.responses;if(!r)return;
    document.body.setAttribute('data-commit-review','true');
    var existing=document.getElementById('commit-review-banner');
    if(!existing){
      var b=document.createElement('div');b.id='commit-review-banner';
      b.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;background:#1A56DB;color:white;padding:8px 16px;font-family:sans-serif;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;box-shadow:0 2px 8px rgba(0,0,0,0.2)';
      b.innerHTML='\\ud83d\\udc41 '+(event.data.studentName||'Student')+"\\'s responses \\u2014 read only";
      document.body.style.paddingTop='40px';
      document.body.insertBefore(b,document.body.firstChild);
    }
    document.querySelectorAll('textarea').forEach(function(el,i){
      var k=el.name||el.id||el.dataset.responseKey||('textarea_'+i);
      if(r[k]&&r[k].value){el.value=r[k].value;el.style.background='#fffef0';el.style.borderColor='#F59E0B';el.readOnly=true;}
    });
    document.querySelectorAll('input[type="text"],input[type="number"]').forEach(function(el,i){
      var k=el.name||el.id||('input_'+i);
      if(r[k]&&r[k].value){el.value=r[k].value;el.style.background='#fffef0';el.readOnly=true;}
    });
    Object.keys(r).forEach(function(k){
      var v=r[k];if(v.type==='selection'||v.type==='checkbox')return;
      document.querySelectorAll('.platform-card,.signal-item').forEach(function(card){
        if(v.value&&(card.textContent||'').includes(v.value))card.classList.add('selected');
      });
    });
    Object.keys(r).forEach(function(k){
      var v=r[k];if(v.type!=='checkbox')return;
      var sel=v.selected||[];
      document.querySelectorAll('.signal-item').forEach(function(item){
        if(sel.some(function(s){return(item.textContent||'').includes(s);}))item.classList.add('checked');
      });
    });
    window.parent.postMessage({type:'COMMIT_PREFILL_COMPLETE'},'*');
  });
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
        setActivityHtml(html + ACTIVITY_RESPONSE_SCRIPT + ACTIVITY_PREFILL_SCRIPT)
      }).catch(() => {})
    } catch (e) {
      setError('Could not load activity.')
    } finally {
      setDataLoading(false)
    }
  }

  // ── RESPONSE CAPTURE ────────────────────────────────────────
  const handleMessage = useCallback(async (event: MessageEvent) => {
    if (event.data?.type !== 'COMMIT_ACTIVITY_RESPONSES') return
    const responses = event.data.responses as Record<string, { type: string; label: string; value: string; wordCount?: number }>

    const nonEmpty = Object.entries(responses).filter(([_, r]) => r.value?.toString().trim())
    if (nonEmpty.length === 0) return

    setResponseCount(nonEmpty.length)
    setSaveStatus('saving')

    try {
      // Save as a single exercise_response with index 0
      // The full responses object is stored as JSON in response_text
      await api.post('/exercises/save', {
        lesson_id: lessonId,
        exercise_index: 0,
        exercise_type: 'activity_responses',
        response_text: JSON.stringify(responses),
        word_count: Object.values(responses).reduce((sum, r) => sum + (r.wordCount || 0), 0),
      })
      setSaveStatus('saved')
      setLastSaved(new Date())
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (e) {
      console.error('Failed to save activity responses:', e)
      setSaveStatus('idle')
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