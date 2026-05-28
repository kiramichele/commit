'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import ReadAloud from '@/components/ReadAloud'
import ExerciseBlock from '@/components/ExerciseBlock'
import MarkCompleteButton from '@/components/MarkCompleteButton'
import LessonCompleteButton from '@/components/LessonCompleteButton'
import { StandardsBadgeList } from '@/components/Standards'
import PythonDocsBrowser from '@/components/PythonDocsBrowser'

interface Exercise {
  type: 'coding' | 'free_response' | 'multiple_choice' | 'short_answer'
  instructions?: string
  starter_code?: string
  prompt?: string
  min_words?: number
  max_words?: number
  question?: string
  choices?: string[]
  correct?: string
}

interface Lesson {
  id: string
  title: string
  scaffold_level: string
  order_index: number
  units: { id: string; title: string; order_index: number }
  lesson_content: {
    html_file_path: string | null
    activity_file_path: string | null
    estimated_minutes: number
    has_coding_exercise: boolean
    coding_instructions: string
    coding_starter_code: string
    example_code?: string
    example_explanation?: string
    exercises?: Exercise[]
  } | null
}

type Tab = 'lesson' | 'activity' | 'example' | 'practice' | 'docs'

// Python docs moved to /lib/pythonDocs.ts; rendered by PythonDocsBrowser.

interface Annotation {
  id: string
  lesson_id: string
  kind: 'highlight' | 'note'
  selected_text: string | null
  quote_before: string | null
  quote_after: string | null
  note_text: string | null
  linked_annotation_id: string | null
  created_at: string
}

// Annotation SDK injected into the lesson reading iframe. Watches for
// selection, shows a floating toolbar, paints existing highlights, and
// posts every interaction up to the parent via window.postMessage.
//
// Protocol (iframe → parent):
//   COMMIT_HIGHLIGHT       { selected_text, quote_before, quote_after }
//   COMMIT_HIGHLIGHT_NOTE  { selected_text, quote_before, quote_after }
//   COMMIT_HIGHLIGHT_CLICK { id }
//
// Protocol (parent → iframe):
//   COMMIT_ANNOTATIONS { highlights: [{ id, selected_text, has_note }] }
const ANNOTATION_SDK = `<script>
(function(){
  if(window.self===window.top)return;
  var saved = [];
  function paint(){
    document.querySelectorAll('mark[data-commit-hl]').forEach(function(m){
      var p=m.parentNode; while(m.firstChild){ p.insertBefore(m.firstChild,m); } p.removeChild(m);
    });
    saved.forEach(function(h){
      if(!h.selected_text) return;
      var t=h.selected_text;
      var walker=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      var node;
      while(node=walker.nextNode()){
        if(node.parentNode && (node.parentNode.tagName==='SCRIPT'||node.parentNode.tagName==='STYLE')) continue;
        var idx=node.textContent.indexOf(t);
        if(idx>=0){
          var range=document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx+t.length);
          var mark=document.createElement('mark');
          mark.setAttribute('data-commit-hl', h.id);
          mark.style.background='#FEF08A';
          mark.style.borderBottom = h.has_note ? '2px solid #F59E0B' : 'none';
          mark.style.padding='0';
          mark.style.cursor='pointer';
          try { range.surroundContents(mark); } catch(e) {}
          break;
        }
      }
    });
    document.querySelectorAll('mark[data-commit-hl]').forEach(function(m){
      m.addEventListener('click', function(){
        window.parent.postMessage({type:'COMMIT_HIGHLIGHT_CLICK', id: m.getAttribute('data-commit-hl')},'*');
      });
    });
  }
  window.addEventListener('message', function(e){
    if(!e.data || e.data.type !== 'COMMIT_ANNOTATIONS') return;
    saved = e.data.highlights || [];
    paint();
  });
  var bar=null;
  function hideBar(){ if(bar){ bar.remove(); bar=null; } }
  function showBar(rect){
    hideBar();
    bar=document.createElement('div');
    bar.style.cssText='position:fixed;z-index:99999;display:flex;gap:4px;padding:4px;background:#0E2D6E;color:white;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.25);font-family:sans-serif;font-size:12px;';
    bar.style.top=(rect.bottom+8)+'px';
    bar.style.left=Math.max(8, rect.left)+'px';
    var b1=document.createElement('button');
    b1.textContent='🖍 highlight';
    b1.style.cssText='border:none;background:transparent;color:white;cursor:pointer;padding:4px 10px;font-size:12px;font-weight:600;';
    var b2=document.createElement('button');
    b2.textContent='+ note';
    b2.style.cssText='border:none;background:#1A56DB;color:white;cursor:pointer;padding:4px 10px;border-radius:5px;font-size:12px;font-weight:600;';
    bar.appendChild(b1); bar.appendChild(b2);
    document.body.appendChild(bar);
    var sel=window.getSelection();
    if(!sel||sel.isCollapsed){ hideBar(); return; }
    var text=sel.toString();
    var range=sel.getRangeAt(0);
    var before=(range.startContainer.textContent||'').slice(Math.max(0,range.startOffset-40), range.startOffset);
    var after=(range.endContainer.textContent||'').slice(range.endOffset, range.endOffset+40);
    b1.addEventListener('click', function(){
      window.parent.postMessage({type:'COMMIT_HIGHLIGHT', selected_text:text, quote_before:before, quote_after:after},'*');
      hideBar(); sel.removeAllRanges();
    });
    b2.addEventListener('click', function(){
      window.parent.postMessage({type:'COMMIT_HIGHLIGHT_NOTE', selected_text:text, quote_before:before, quote_after:after},'*');
      hideBar(); sel.removeAllRanges();
    });
  }
  document.addEventListener('mouseup', function(){
    setTimeout(function(){
      var sel=window.getSelection();
      if(!sel||sel.isCollapsed||sel.toString().trim().length<2){ hideBar(); return; }
      var r=sel.getRangeAt(0).getBoundingClientRect();
      if(r.width===0&&r.height===0){ hideBar(); return; }
      showBar(r);
    }, 10);
  });
  document.addEventListener('mousedown', function(e){
    if(bar && !bar.contains(e.target)) hideBar();
  });
  window.parent.postMessage({type:'COMMIT_ANNOTATION_READY'},'*');
})();
<\/script>`

export default function LessonPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const lessonId = params.lesson_id as string
  const classroomId = params.id as string
  const searchParams = useSearchParams()
  const assignmentId = searchParams.get('assignment_id')

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [lessonUrl, setLessonUrl] = useState<string | null>(null)
  const [lessonHtml, setLessonHtml] = useState<string | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [showAnnotations, setShowAnnotations] = useState(false)
  const [pendingNoteFor, setPendingNoteFor] = useState<{ selected_text: string; quote_before: string; quote_after: string } | null>(null)
  const [pendingNoteText, setPendingNoteText] = useState('')
  const [newGeneralNote, setNewGeneralNote] = useState('')
  const [showNewGeneralNote, setShowNewGeneralNote] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('lesson')
  const [code, setCode] = useState('')
  const [output, setOutput] = useState('')
  const [outputError, setOutputError] = useState(false)
  const [running, setRunning] = useState(false)
  const [docSearch, setDocSearch] = useState('')
  const [lessonHint, setLessonHint] = useState<string | null>(null)
  const [exerciseOutput, setExerciseOutput] = useState<Record<number, string>>({})
  const [exerciseErrors, setExerciseErrors] = useState<Record<number, boolean>>({})
  const [runningExercise, setRunningExercise] = useState<number | null>(null)
  const [exerciseCode, setExerciseCode] = useState<Record<number, string>>({})
  const [selectedExercise, setSelectedExercise] = useState<number>(0)

  const handleExerciseRun = async (code: string, exerciseIndex: number) => {
    setRunningExercise(exerciseIndex)
    setExerciseOutput(prev => ({ ...prev, [exerciseIndex]: '' }))
    setExerciseErrors(prev => ({ ...prev, [exerciseIndex]: false }))
    try {
      const result = await api.post<{ output: string; stderr: string }>('/code/run', { code })
      if (result.stderr && !result.output) {
        setExerciseOutput(prev => ({ ...prev, [exerciseIndex]: result.stderr }))
        setExerciseErrors(prev => ({ ...prev, [exerciseIndex]: true }))
      } else {
        setExerciseOutput(prev => ({ ...prev, [exerciseIndex]: result.output || '(no output)' }))
      }
    } catch (e: any) {
      setExerciseOutput(prev => ({ ...prev, [exerciseIndex]: e.message || 'Execution failed.' }))
      setExerciseErrors(prev => ({ ...prev, [exerciseIndex]: true }))
    } finally {
      setRunningExercise(null)
    }
  }

  useEffect(() => {
    if (loading) return
    if (!profile) router.push('/login')
  }, [profile, loading])

  useEffect(() => {
    if (!profile || !lessonId) return
    fetchLesson()
  }, [profile, lessonId])

  useEffect(() => {
    const tab = searchParams.get('tab')
    const search = searchParams.get('search')
    const hint = searchParams.get('hint')

    if (tab) setActiveTab(tab as Tab)
    if (tab === 'docs' && search) {
      setDocSearch(search)
      setTimeout(() => {
        const el = document.querySelector(`[data-docs-key="${search}"]`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          ;(el as HTMLElement).click()
        }
      }, 300)
    }
    if (tab === 'lesson' && hint) {
      setLessonHint(hint)
    }
  }, [searchParams])

  const fetchAnnotations = async () => {
    try {
      const data = await api.get<Annotation[]>(`/annotations/lesson/${lessonId}`)
      setAnnotations(data || [])
    } catch {}
  }

  // Build the payload the iframe expects so existing highlights repaint.
  const annotationsForIframe = () => {
    const noteByLink: Record<string, boolean> = {}
    annotations.forEach(a => {
      if (a.kind === 'note' && a.linked_annotation_id) noteByLink[a.linked_annotation_id] = true
    })
    return annotations
      .filter(a => a.kind === 'highlight')
      .map(a => ({ id: a.id, selected_text: a.selected_text, has_note: !!noteByLink[a.id] }))
  }

  const postAnnotationsToIframe = () => {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    win.postMessage({ type: 'COMMIT_ANNOTATIONS', highlights: annotationsForIframe() }, '*')
  }

  // Re-send annotations whenever they change.
  useEffect(() => {
    postAnnotationsToIframe()
  }, [annotations])

  // Listen for messages from the SDK in the iframe.
  useEffect(() => {
    if (!profile) return
    const handler = async (e: MessageEvent) => {
      const d = e.data
      if (!d || !d.type) return
      if (d.type === 'COMMIT_ANNOTATION_READY') {
        postAnnotationsToIframe()
        return
      }
      if (d.type === 'COMMIT_HIGHLIGHT') {
        try {
          const created = await api.post<Annotation>('/annotations/', {
            lesson_id: lessonId,
            kind: 'highlight',
            selected_text: d.selected_text,
            quote_before: d.quote_before,
            quote_after: d.quote_after,
          })
          setAnnotations(prev => [...prev, created])
          setShowAnnotations(true)
        } catch {}
        return
      }
      if (d.type === 'COMMIT_HIGHLIGHT_NOTE') {
        setPendingNoteFor({
          selected_text: d.selected_text,
          quote_before: d.quote_before,
          quote_after: d.quote_after,
        })
        setPendingNoteText('')
        setShowAnnotations(true)
        return
      }
      if (d.type === 'COMMIT_HIGHLIGHT_CLICK') {
        setShowAnnotations(true)
        // Scroll the sidebar entry into view.
        setTimeout(() => {
          const el = document.querySelector(`[data-annotation-id="${d.id}"]`)
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 50)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [profile, lessonId, annotations])

  const saveLinkedNote = async () => {
    if (!pendingNoteFor) return
    try {
      // Step 1 — create the highlight.
      const hl = await api.post<Annotation>('/annotations/', {
        lesson_id: lessonId,
        kind: 'highlight',
        selected_text: pendingNoteFor.selected_text,
        quote_before: pendingNoteFor.quote_before,
        quote_after: pendingNoteFor.quote_after,
      })
      // Step 2 — create the note linked to it.
      const note = await api.post<Annotation>('/annotations/', {
        lesson_id: lessonId,
        kind: 'note',
        note_text: pendingNoteText.trim() || '(no text)',
        linked_annotation_id: hl.id,
      })
      setAnnotations(prev => [...prev, hl, note])
      setPendingNoteFor(null)
      setPendingNoteText('')
    } catch (err: any) {
      alert(err.message || 'Could not save note')
    }
  }

  const saveGeneralNote = async () => {
    if (!newGeneralNote.trim()) return
    try {
      const note = await api.post<Annotation>('/annotations/', {
        lesson_id: lessonId,
        kind: 'note',
        note_text: newGeneralNote.trim(),
      })
      setAnnotations(prev => [...prev, note])
      setNewGeneralNote('')
      setShowNewGeneralNote(false)
    } catch (err: any) {
      alert(err.message || 'Could not save note')
    }
  }

  const deleteAnnotation = async (id: string) => {
    try {
      await api.delete(`/annotations/${id}`)
      setAnnotations(prev => prev.filter(a => a.id !== id))
    } catch {}
  }

  const fetchLesson = async () => {
    setDataLoading(true)
    try {
      const [lessonData, urlData] = await Promise.all([
        api.get<Lesson>(`/curriculum/lessons/${lessonId}`),
        api.get<{ url: string }>(`/curriculum/lessons/${lessonId}/url?file_type=lesson`).catch(() => null),
      ])
      setLesson(lessonData)
      setCode(lessonData.lesson_content?.coding_starter_code || '')
      fetchAnnotations()

      // Pre-fill per-exercise code from each exercise's starter_code
      const starters: Record<number, string> = {}
      const exs = lessonData.lesson_content?.exercises || []
      exs.forEach((ex, i) => {
        if (ex.type === 'coding') starters[i] = ex.starter_code || ''
      })
      setExerciseCode(starters)
      setSelectedExercise(0)

      if (urlData) {
        setLessonUrl(urlData.url)
        fetch(urlData.url).then(r => r.text()).then(setLessonHtml).catch(() => {})
      }

    } catch (e) {
      console.error(e)
    } finally {
      setDataLoading(false)
    }
  }

  const resetExerciseToStarter = (i: number) => {
    const exs = lesson?.lesson_content?.exercises || []
    const starter = exs[i]?.starter_code || ''
    if (exerciseCode[i] && exerciseCode[i] !== starter && !confirm('Reset to starter code? Your edits will be lost.')) return
    setExerciseCode(prev => ({ ...prev, [i]: starter }))
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
        setOutput(result.output || '(no output)'); setOutputError(false)
      }
    } catch (e: any) {
      setOutput(e.message || 'Execution failed.'); setOutputError(true)
    } finally {
      setRunning(false)
    }
  }

  const handleTab = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const el = e.currentTarget
      const start = el.selectionStart
      const newCode = code.substring(0, start) + '    ' + code.substring(start)
      setCode(newCode)
      setTimeout(() => { el.selectionStart = el.selectionEnd = start + 4 }, 0)
    }
  }


  const hasActivity = !!lesson?.lesson_content?.activity_file_path
  const codingExercises = (lesson?.lesson_content?.exercises || []).filter(ex => ex.type === 'coding')
  const hasExercises = codingExercises.length > 0
  const hasLegacyCoding = !!lesson?.lesson_content?.has_coding_exercise && !hasExercises
  const isCodingLesson = hasExercises || hasLegacyCoding
  const hasExample = !!(lesson?.lesson_content?.example_code)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'lesson', label: isCodingLesson ? '⌨ code' : '📄 lesson' },
    ...(hasActivity ? [{ id: 'activity' as Tab, label: '⚡ activity' }] : []),
    ...(hasExample ? [{ id: 'example' as Tab, label: '💡 example' }] : []),
    { id: 'docs', label: '📚 python docs' },
  ]

  const tabStyle = (id: Tab) => ({
    padding: '10px 18px',
    fontSize: '13px',
    fontWeight: 600 as const,
    border: 'none',
    borderBottom: `2px solid ${activeTab === id ? '#1A56DB' : 'transparent'}`,
    background: 'transparent',
    color: activeTab === id ? '#1A56DB' : '#888780',
    cursor: 'pointer' as const,
    fontFamily: "'DM Sans', sans-serif",
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  })

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ color: '#888780' }}>loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* TOPBAR */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 1.5rem', height: '52px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Link href={classroomId ? `/learn/${classroomId}` : '/learn'} style={{ display: 'flex', alignItems: 'center', gap: '7px', textDecoration: 'none' }}>
          <div style={{ width: '26px', height: '26px', background: '#1A56DB', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'white' }}>{'>'}_</div>
        </Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        {lesson?.units && <span style={{ fontSize: '12px', color: '#888780' }}>Unit {lesson.units.order_index}</span>}
        <span style={{ color: '#D3D1C7' }}>/</span>
        <span style={{ fontSize: '13px', color: '#0E2D6E', fontWeight: 500 }}>{lesson?.title}</span>
        {(lesson as any)?.standards_tags?.length > 0 && (
          <StandardsBadgeList tags={(lesson as any).standards_tags} max={5} />
        )}
        {lesson?.lesson_content?.estimated_minutes && (
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#888780' }}>~{lesson.lesson_content.estimated_minutes} min</span>
        )}
      </nav>

      {/* TABS */}
      <div style={{ background: 'white', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 1.5rem', display: 'flex', gap: '0', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={tabStyle(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {dataLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#888780', fontSize: '14px' }}>loading lesson...</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* ── LESSON TAB ── */}
          {activeTab === 'lesson' && !isCodingLesson && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {lessonHint && (
                <div style={{ padding: '10px 16px', background: '#FEF9C3', borderBottom: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🔍</span>
                    <span style={{ fontSize: '13px', color: '#854D0E', fontWeight: 500 }}>look for content about: <strong>{lessonHint}</strong></span>
                  </div>
                  <button onClick={() => setLessonHint(null)} style={{ background: 'none', border: 'none', color: '#854D0E', cursor: 'pointer', fontSize: '16px' }}>×</button>
                </div>
              )}
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: showAnnotations ? '1fr 300px' : '1fr', minHeight: 'calc(100vh - 104px)' }}>
                {lessonHtml ? (
                  <iframe
                    ref={iframeRef}
                    srcDoc={lessonHtml + (profile?.role === 'student' ? ANNOTATION_SDK : '')}
                    onLoad={postAnnotationsToIframe}
                    style={{ width: '100%', height: '100%', border: 'none', minHeight: 'calc(100vh - 104px)' }}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    title={lesson?.title}
                  />
                ) : (
                  <div style={{ padding: '3rem', textAlign: 'center', color: '#888780', fontSize: '14px' }}>
                    {lessonUrl ? 'loading lesson...' : 'no lesson content uploaded yet'}
                  </div>
                )}

                {/* ANNOTATION SIDEBAR */}
                {showAnnotations && profile?.role === 'student' && (
                  <div style={{ background: 'white', borderLeft: '1px solid rgba(14,45,110,0.08)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(14,45,110,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#0E2D6E', letterSpacing: '0.05em', textTransform: 'uppercase' }}>my notes ({annotations.length})</span>
                      <button onClick={() => setShowAnnotations(false)} style={{ background: 'none', border: 'none', color: '#888780', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>
                    </div>

                    {/* Pending highlight + note input */}
                    {pendingNoteFor && (
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(14,45,110,0.06)', background: '#FEF9C3' }}>
                        <div style={{ fontSize: '11px', color: '#854D0E', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>new highlight + note</div>
                        <div style={{ fontSize: '12px', color: '#854D0E', fontStyle: 'italic', marginBottom: '8px', maxHeight: '60px', overflow: 'hidden' }}>"{pendingNoteFor.selected_text}"</div>
                        <textarea autoFocus value={pendingNoteText} onChange={e => setPendingNoteText(e.target.value)} rows={3} placeholder="what's your thought?" style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid rgba(245,158,11,0.3)', fontSize: '12px', outline: 'none', resize: 'vertical', fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box' }} />
                        <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                          <button onClick={() => { setPendingNoteFor(null); setPendingNoteText('') }} style={{ flex: 1, padding: '5px', borderRadius: '5px', background: 'transparent', border: '1.5px solid rgba(14,45,110,0.15)', fontSize: '11px', fontWeight: 600, color: '#5F5E5A', cursor: 'pointer' }}>cancel</button>
                          <button onClick={saveLinkedNote} style={{ flex: 1, padding: '5px', borderRadius: '5px', background: '#1A56DB', border: 'none', fontSize: '11px', fontWeight: 600, color: 'white', cursor: 'pointer' }}>save</button>
                        </div>
                      </div>
                    )}

                    {/* New general note */}
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(14,45,110,0.06)' }}>
                      {showNewGeneralNote ? (
                        <>
                          <textarea autoFocus value={newGeneralNote} onChange={e => setNewGeneralNote(e.target.value)} rows={3} placeholder="general note about this lesson..." style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '12px', outline: 'none', resize: 'vertical', fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', background: '#FAFAF8' }} />
                          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                            <button onClick={() => { setShowNewGeneralNote(false); setNewGeneralNote('') }} style={{ flex: 1, padding: '5px', borderRadius: '5px', background: 'transparent', border: '1.5px solid rgba(14,45,110,0.15)', fontSize: '11px', fontWeight: 600, color: '#5F5E5A', cursor: 'pointer' }}>cancel</button>
                            <button onClick={saveGeneralNote} disabled={!newGeneralNote.trim()} style={{ flex: 1, padding: '5px', borderRadius: '5px', background: newGeneralNote.trim() ? '#1A56DB' : '#D3D1C7', border: 'none', fontSize: '11px', fontWeight: 600, color: 'white', cursor: newGeneralNote.trim() ? 'pointer' : 'not-allowed' }}>save</button>
                          </div>
                        </>
                      ) : (
                        <button onClick={() => setShowNewGeneralNote(true)} style={{ width: '100%', padding: '7px', borderRadius: '6px', background: '#EBF1FD', border: '1.5px dashed rgba(26,86,219,0.3)', fontSize: '12px', fontWeight: 600, color: '#1A56DB', cursor: 'pointer' }}>+ general note</button>
                      )}
                    </div>

                    {/* Annotation list */}
                    {annotations.length === 0 ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: '#888780', fontSize: '12px', lineHeight: 1.6 }}>
                        select text in the lesson to highlight or add a note.
                      </div>
                    ) : (
                      annotations.map(a => {
                        const linkedNote = a.kind === 'highlight'
                          ? annotations.find(x => x.linked_annotation_id === a.id)
                          : null
                        if (a.kind === 'note' && a.linked_annotation_id) return null  // shown under its highlight
                        return (
                          <div key={a.id} data-annotation-id={a.id} style={{ padding: '10px 16px', borderBottom: '1px solid rgba(14,45,110,0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 700, color: a.kind === 'highlight' ? '#854D0E' : '#0C447C', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {a.kind === 'highlight' ? '🖍 highlight' : '📝 note'}
                              </span>
                              <button onClick={() => deleteAnnotation(a.id)} style={{ background: 'none', border: 'none', color: '#888780', cursor: 'pointer', fontSize: '14px', padding: 0, lineHeight: 1 }}>×</button>
                            </div>
                            {a.selected_text && (
                              <div style={{ fontSize: '12px', color: '#854D0E', fontStyle: 'italic', background: '#FEF08A', padding: '4px 6px', borderRadius: '4px', marginBottom: '4px' }}>"{a.selected_text}"</div>
                            )}
                            {a.note_text && (
                              <div style={{ fontSize: '12px', color: '#0E2D6E', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{a.note_text}</div>
                            )}
                            {linkedNote?.note_text && (
                              <div style={{ marginTop: '6px', padding: '6px 8px', background: '#EBF1FD', borderRadius: '4px', fontSize: '12px', color: '#0E2D6E', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                <div style={{ fontSize: '10px', fontWeight: 600, color: '#0C447C', marginBottom: '2px' }}>📝 NOTE</div>
                                {linkedNote.note_text}
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
              {profile?.role === 'student' && lesson && lessonHtml && (
                <button
                  onClick={() => setShowAnnotations(s => !s)}
                  style={{ position: 'fixed', bottom: '70px', right: '20px', zIndex: 100, padding: '10px 16px', background: '#0E2D6E', color: 'white', border: 'none', borderRadius: '10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", boxShadow: '0 4px 16px rgba(14,45,110,0.25)', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  📝 my notes ({annotations.length})
                </button>
              )}
              {profile?.role === 'student' && lesson && (
                <LessonCompleteButton lessonId={lesson.id} lessonTitle={lesson.title} />
              )}
            </div>
          )}

          {/* ── CODING LESSON 3-PANE ── */}
          {activeTab === 'lesson' && isCodingLesson && (() => {
            // Build the canonical "current exercise" — works for both new (exercises[]) and legacy (single coding fields)
            const currentExercise: Exercise = hasExercises
              ? codingExercises[selectedExercise] || codingExercises[0]
              : {
                  type: 'coding',
                  instructions: lesson?.lesson_content?.coding_instructions || '',
                  starter_code: lesson?.lesson_content?.coding_starter_code || '',
                }
            const exIdx = hasExercises ? selectedExercise : -1  // -1 = legacy single
            const codeKey = hasExercises ? selectedExercise : -1
            const currentCode = exerciseCode[codeKey] ?? (currentExercise.starter_code || '')
            const currentOutput = exerciseOutput[codeKey] || ''
            const currentError = !!exerciseErrors[codeKey]
            const isRunning = runningExercise === codeKey
            const starterForCurrent = currentExercise.starter_code || ''

            const runCurrent = () => handleExerciseRun(currentCode, codeKey)
            const updateCode = (val: string) => setExerciseCode(prev => ({ ...prev, [codeKey]: val }))

            const handleEditorTab = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key === 'Tab') {
                e.preventDefault()
                const el = e.currentTarget
                const start = el.selectionStart
                const next = currentCode.substring(0, start) + '    ' + currentCode.substring(start)
                updateCode(next)
                setTimeout(() => { el.selectionStart = el.selectionEnd = start + 4 }, 0)
              }
            }

            return (
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1.1fr 1fr', minHeight: 'calc(100vh - 104px)' }}>

                {/* LEFT PANE — PROBLEM */}
                <div style={{ borderRight: '1px solid rgba(14,45,110,0.08)', background: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', background: '#F8F7F5', borderBottom: '1px solid rgba(14,45,110,0.06)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888780' }}>
                    problem
                  </div>
                  {lessonHtml ? (
                    <iframe srcDoc={lessonHtml} style={{ flex: 1, width: '100%', border: 'none' }} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" title={lesson?.title} />
                  ) : currentExercise.instructions ? (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', fontSize: '14px', color: '#0E2D6E', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                      {currentExercise.instructions}
                    </div>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', color: '#888780', fontSize: '13px', textAlign: 'center' }}>
                      no problem description uploaded yet
                    </div>
                  )}
                </div>

                {/* MIDDLE PANE — EDITOR */}
                <div style={{ background: '#1C1C1E', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(14,45,110,0.08)' }}>

                  {/* Exercise tabs (only if multiple) */}
                  {hasExercises && codingExercises.length > 1 && (
                    <div style={{ display: 'flex', gap: '0', background: '#242426', borderBottom: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto' }}>
                      {codingExercises.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedExercise(i)}
                          style={{
                            padding: '8px 16px', fontSize: '12px', fontWeight: 600,
                            background: i === selectedExercise ? '#1C1C1E' : 'transparent',
                            color: i === selectedExercise ? '#EBF1FD' : 'rgba(255,255,255,0.5)',
                            border: 'none', borderBottom: i === selectedExercise ? '2px solid #1A56DB' : '2px solid transparent',
                            cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
                          }}
                        >
                          exercise {i + 1}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Editor toolbar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: '#242426', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>editor · python</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => resetExerciseToStarter(codeKey)}
                        disabled={!starterForCurrent || currentCode === starterForCurrent}
                        title="restore the original starter code"
                        style={{ padding: '5px 12px', background: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                      >
                        ↺ starter
                      </button>
                      <button
                        onClick={runCurrent}
                        disabled={isRunning}
                        style={{ padding: '5px 14px', background: isRunning ? '#166534' : '#22C55E', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: isRunning ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                      >
                        {isRunning ? '◌ running...' : '▶ run'}
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={currentCode}
                    onChange={e => updateCode(e.target.value)}
                    onKeyDown={handleEditorTab}
                    spellCheck={false}
                    style={{ flex: 1, width: '100%', background: '#1C1C1E', color: '#EBF1FD', fontFamily: "'DM Mono', monospace", fontSize: '14px', lineHeight: 1.8, padding: '1rem 1.25rem', border: 'none', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                {/* RIGHT PANE — CONSOLE */}
                <div style={{ background: '#111113', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '10px 16px', background: '#1C1C1E', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
                    console
                  </div>
                  <pre style={{ flex: 1, margin: 0, padding: '1rem 1.25rem', fontFamily: "'DM Mono', monospace", fontSize: '13px', color: currentError ? '#F09595' : '#22C55E', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowY: 'auto' }}>
                    {currentOutput || <span style={{ color: 'rgba(255,255,255,0.25)' }}>run your code to see output here</span>}
                  </pre>
                </div>

              </div>
            )
          })()}

          {/* ── ACTIVITY TAB ── */}
          {activeTab === 'activity' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '1.5rem' }}>
              {lesson?.lesson_content?.activity_file_path ? (
                <>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>◈</div>
                    <h2 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: '#0E2D6E' }}>
                      {lesson.title} — Activity
                    </h2>
                    <p style={{ margin: 0, fontSize: '14px', color: '#888780', maxWidth: '400px' }}>
                      This activity opens in a focused view so you can work through it step by step.
                    </p>
                  </div>
                  <Link
                    href={`/activity/${lesson.id}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '8px',
                      padding: '14px 28px',
                      background: '#1A56DB', color: 'white',
                      borderRadius: '10px', textDecoration: 'none',
                      fontSize: '15px', fontWeight: 700,
                      boxShadow: '0 4px 16px rgba(26,86,219,0.25)',
                      transition: 'all 0.15s',
                    }}
                  >
                    open activity →
                  </Link>
                  <p style={{ fontSize: '12px', color: '#888780' }}>
                    opens in this tab — use the back button to return to the lesson
                  </p>
                </>
              ) : (
                <p style={{ fontSize: '14px', color: '#888780' }}>no activity for this lesson yet</p>
              )}
              {profile?.role === 'student' && lesson && (
                <LessonCompleteButton lessonId={lesson.id} lessonTitle={lesson.title} />
              )}
            </div>
          )}

          {/* ── EXAMPLE TAB ── */}
          {activeTab === 'example' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#1C1C1E' }}>
              {lesson?.lesson_content?.example_explanation && (
                <div style={{ padding: '1.25rem 1.5rem', background: '#242426', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>example explanation</div>
                    <ReadAloud text={lesson.lesson_content.example_explanation} isPro={false} />
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.7 }}>
                    {lesson.lesson_content.example_explanation}
                  </p>
                </div>
              )}
              <pre style={{ flex: 1, margin: 0, padding: '1.5rem', fontFamily: "'DM Mono', monospace", fontSize: '14px', color: '#EBF1FD', lineHeight: 1.8, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                {lesson?.lesson_content?.example_code || '# no example code provided'}
              </pre>
              <div style={{ padding: '10px 1.5rem', background: '#2A2A2C', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button
                  onClick={() => { setCode(lesson?.lesson_content?.example_code || ''); setActiveTab('practice') }}
                  style={{ padding: '7px 16px', background: '#1A56DB', color: 'white', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                >
                  copy to practice →
                </button>
              </div>
            </div>
          )}


          {/* ── DOCS TAB ── */}
          {activeTab === 'docs' && (
            <div style={{ flex: 1, maxWidth: '860px', margin: '0 auto', width: '100%', padding: '1.5rem 2rem 3rem' }}>
              <PythonDocsBrowser initialSearch={docSearch} />
            </div>
          )}
        </div>
      )}

      {assignmentId && (
        <MarkCompleteButton assignmentId={assignmentId} />
      )}
    </div>
  )
}