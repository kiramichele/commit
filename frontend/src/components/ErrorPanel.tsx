'use client'
import { useState } from 'react'
import { interpretError, getErrorLineNumber, ScaffoldLevel } from '@/lib/errorInterpreter'

interface Props {
  stderr: string
  scaffoldLevel: ScaffoldLevel
  onFindInDocs: (docsKey: string) => void
  onFindInLesson: (hint: string) => void
  showLessonLink?: boolean
}

export default function ErrorPanel({ stderr, scaffoldLevel, onFindInDocs, onFindInLesson, showLessonLink = true }: Props) {
  const [dismissed, setDismissed] = useState(false)

  if (!stderr || dismissed) return null

  const interpretation = interpretError(stderr, scaffoldLevel)
  const lineNumber = getErrorLineNumber(stderr)

  // No interpretation — just show raw
  if (!interpretation) return (
    <div style={{ background: '#1a0000', borderTop: '1px solid rgba(239,68,68,0.3)', padding: '10px 1rem' }}>
      <pre style={{ margin: 0, fontFamily: "'DM Mono', monospace", fontSize: '12px', color: '#F09595', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {stderr}
      </pre>
    </div>
  )

  return (
    <div style={{ background: '#1a0505', borderTop: '2px solid rgba(239,68,68,0.4)', padding: '0', overflow: 'hidden' }}>

      {/* FRIENDLY ERROR */}
      <div style={{ padding: '12px 1rem 10px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>⚠️</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#F09595', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {interpretation.title}
            </span>
            {lineNumber && (
              <span style={{ fontSize: '11px', color: 'rgba(240,149,149,0.6)', fontFamily: "'DM Mono', monospace" }}>
                line {lineNumber}
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.8)', lineHeight: 1.7 }}>
            {interpretation.message}
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '16px', cursor: 'pointer', flexShrink: 0, padding: '0 4px', lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      {/* NAVIGATION BUTTONS */}
      <div style={{ padding: '0 1rem 12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {interpretation.docsKey && (
          <button
            onClick={() => onFindInDocs(interpretation.docsKey!)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', background: 'rgba(26,86,219,0.2)', border: '1px solid rgba(26,86,219,0.4)', borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: '#93C5FD', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
          >
            📚 find in docs
          </button>
        )}
        {showLessonLink && (
          <button
            onClick={() => onFindInLesson(interpretation.lessonHint)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
          >
            📄 find in lesson
          </button>
        )}

        {/* RAW ERROR TOGGLE */}
        <RawErrorToggle stderr={stderr} />
      </div>
    </div>
  )
}

function RawErrorToggle({ stderr }: { stderr: string }) {
  const [shown, setShown] = useState(false)
  return (
    <div style={{ width: '100%' }}>
      <button
        onClick={() => setShown(s => !s)}
        style={{ background: 'none', border: 'none', fontSize: '11px', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 0, fontFamily: "'DM Sans', sans-serif" }}
      >
        {shown ? '↑ hide raw error' : '↓ show raw error'}
      </button>
      {shown && (
        <pre style={{ margin: '6px 0 0', fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'rgba(240,149,149,0.7)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
          {stderr}
        </pre>
      )}
    </div>
  )
}