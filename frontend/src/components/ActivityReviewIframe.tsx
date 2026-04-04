'use client'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

interface ExerciseResponse {
  exercise_type: string
  response_text: string | null
  student_id: string
}

interface Props {
  lessonId: string
  studentId: string
  studentName: string
}

const PREFILL_SCRIPT = `<script>
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
      b.textContent='\\ud83d\\udc41 '+(event.data.studentName||'Student')+"\\'s responses — read only";
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
    window.parent.postMessage({type:'COMMIT_PREFILL_COMPLETE'},'*');
  });
  window.parent.postMessage({type:'COMMIT_IFRAME_READY'},'*');
})();
<\\/script>`

export default function ActivityReviewIframe({ lessonId, studentId, studentName }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [activityHtml, setActivityHtml] = useState<string | null>(null)
  const [responses, setResponses] = useState<Record<string, unknown> | null>(null)
  const [prefilled, setPrefilled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [noResponses, setNoResponses] = useState(false)

  // Fetch activity HTML + student responses
  useEffect(() => {
    if (!lessonId || !studentId) return
    setLoading(true)
    setPrefilled(false)
    setNoResponses(false)

    Promise.all([
      api.get<{ url: string }>(`/curriculum/lessons/${lessonId}/activity-url`),
      api.get<ExerciseResponse[]>(`/exercises/lesson/${lessonId}/all`),
    ]).then(async ([urlData, allResponses]) => {
      // Fetch HTML and inject prefill script
      if (urlData.url) {
        const html = await fetch(urlData.url).then(r => r.text())
        setActivityHtml(html + PREFILL_SCRIPT)
      }

      const studentResponse = (allResponses || []).find(
        r => r.student_id === studentId && r.exercise_type === 'activity_responses'
      )

      if (studentResponse?.response_text) {
        try {
          setResponses(JSON.parse(studentResponse.response_text))
        } catch {
          setNoResponses(true)
        }
      } else {
        setNoResponses(true)
      }
    }).catch(() => {
      setNoResponses(true)
    }).finally(() => setLoading(false))
  }, [lessonId, studentId])

  // Listen for prefill complete signal
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'COMMIT_PREFILL_COMPLETE') {
        setPrefilled(true)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Send prefill data when iframe loads
  const handleIframeLoad = () => {
    if (!responses || !iframeRef.current?.contentWindow) {
      setPrefilled(true) // no responses to fill, just show it
      return
    }
    // Small delay to let the prefill script initialize
    setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage({
        type: 'COMMIT_PREFILL_RESPONSES',
        responses,
        studentName,
      }, '*')
      // Fallback: if prefill complete never fires, show after 2s
      setTimeout(() => setPrefilled(true), 2000)
    }, 200)
  }

  if (loading) return (
    <div style={{ height: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5', borderRadius: '10px' }}>
      <p style={{ color: '#888780', fontSize: '13px' }}>loading activity...</p>
    </div>
  )

  if (noResponses) return (
    <div style={{ padding: '2rem', textAlign: 'center', background: '#F8F7F5', borderRadius: '10px', border: '1px solid rgba(14,45,110,0.08)' }}>
      <div style={{ fontSize: '2rem', marginBottom: '8px', opacity: 0.4 }}>◎</div>
      <p style={{ margin: 0, fontSize: '14px', color: '#888780' }}>
        no responses captured yet — student may not have completed the activity
      </p>
    </div>
  )

  return (
    <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(14,45,110,0.1)', position: 'relative' }}>
      {/* LOADING OVERLAY until prefill completes */}
      {!prefilled && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(248,247,245,0.85)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '24px', height: '24px', border: '2px solid #EBF1FD', borderTopColor: '#1A56DB', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ margin: 0, fontSize: '12px', color: '#888780' }}>filling in {studentName}'s responses...</p>
          </div>
        </div>
      )}

      {activityHtml ? (
        <iframe
          ref={iframeRef}
          srcDoc={activityHtml}
          onLoad={handleIframeLoad}
          style={{ width: '100%', height: '600px', border: 'none', display: 'block' }}
          sandbox="allow-scripts allow-same-origin allow-forms"
          title={`${studentName}'s activity responses`}
        />
      ) : (
        <div style={{ height: '600px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888780', fontSize: '13px' }}>loading activity...</div>
      )}
    </div>
  )
}