'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Props {
  assignmentId: string
  plainTextInstructions: string | null
  scaffoldLevel: string
}

// ── SCAFFOLD LEVEL LABEL ─────────────────────────────────────
const SCAFFOLD_LABELS: Record<string, string> = {
  block_pseudo: 'Block Pseudocode',
  typed_pseudo: 'Typed Pseudocode',
  block_python: 'Block Python',
  typed_python: 'Typed Python',
}

export default function AssignmentInstructionsPanel({
  assignmentId,
  plainTextInstructions,
  scaffoldLevel,
}: Props) {
  const [htmlUrl, setHtmlUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!assignmentId) return
    api.get<{ url: string | null }>(`/assignments/${assignmentId}/instructions-url`)
      .then(data => setHtmlUrl(data.url))
      .catch(() => setHtmlUrl(null))
      .finally(() => setLoading(false))
  }, [assignmentId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>

      {/* HEADER */}
      <div style={{ padding: '1rem 1.25rem 0.75rem', borderBottom: '1px solid rgba(14,45,110,0.08)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#0E2D6E' }}>instructions</span>
          {scaffoldLevel && (
            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C' }}>
              {SCAFFOLD_LABELS[scaffoldLevel] || scaffoldLevel}
            </span>
          )}
          {htmlUrl && (
            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#DCFCE7', color: '#166534' }}>
              rich view
            </span>
          )}
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {loading ? (
          <div style={{ padding: '1.5rem', fontSize: '13px', color: '#888780' }}>
            loading instructions...
          </div>
        ) : htmlUrl ? (
          // ── RICH HTML INSTRUCTIONS ──────────────────────────
          <iframe
            src={htmlUrl}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block',
            }}
            sandbox="allow-scripts allow-same-origin"
            title="Assignment instructions"
          />
        ) : plainTextInstructions ? (
          // ── PLAIN TEXT FALLBACK ─────────────────────────────
          <div style={{ padding: '1.25rem', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
            <p style={{
              margin: 0,
              fontSize: '14px',
              color: '#333',
              lineHeight: 1.8,
              whiteSpace: 'pre-wrap',
            }}>
              {plainTextInstructions}
            </p>
          </div>
        ) : (
          // ── EMPTY ───────────────────────────────────────────
          <div style={{ padding: '1.5rem', fontSize: '13px', color: '#888780', fontStyle: 'italic' }}>
            no instructions provided
          </div>
        )}
      </div>
    </div>
  )
}