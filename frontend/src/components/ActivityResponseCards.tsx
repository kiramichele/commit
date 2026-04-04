'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface RawResponse {
  type: string
  label: string
  value: string
  wordCount?: number
  selected?: string[]
}

interface Props {
  lessonId: string
  studentId: string
  studentName: string
}

// Clean up auto-generated keys into readable labels
function cleanLabel(key: string, label: string): string {
  if (label && label !== key && !label.startsWith('textarea_') && !label.startsWith('input_')) {
    // Use placeholder text as label — truncate if too long
    return label.length > 80 ? label.substring(0, 80) + '...' : label
  }
  // Fall back to humanizing the key
  return key
    .replace(/textarea_/g, 'Response ')
    .replace(/input_/g, 'Input ')
    .replace(/check_/g, '')
    .replace(/_/g, ' ')
    .replace(/^\w/, c => c.toUpperCase())
}

// Determine if a response is worth showing
function isSignificant(r: RawResponse): boolean {
  if (!r.value || !r.value.toString().trim()) return false
  // Skip single-character or very short non-text responses
  if (r.type === 'text' && r.value.trim().length < 2) return false
  return true
}

export default function ActivityResponseCards({ lessonId, studentId, studentName }: Props) {
  const [responses, setResponses] = useState<Record<string, RawResponse> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!lessonId || !studentId) return
    setLoading(true)
    setResponses(null)

    api.get<{ exercise_type: string; response_text: string | null; student_id: string }[]>(
      `/exercises/lesson/${lessonId}/all`
    )
      .then(data => {
        const studentResponse = (data || []).find(
          r => r.student_id === studentId && r.exercise_type === 'activity_responses'
        )
        if (studentResponse?.response_text) {
          try {
            setResponses(JSON.parse(studentResponse.response_text))
          } catch {
            setResponses(null)
          }
        }
      })
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [lessonId, studentId])

  if (loading) return (
    <div style={{ padding: '1.5rem', textAlign: 'center' }}>
      <p style={{ margin: 0, fontSize: '13px', color: '#888780' }}>loading responses...</p>
    </div>
  )

  if (!responses) return (
    <div style={{ padding: '2rem', textAlign: 'center', background: '#F8F7F5', borderRadius: '10px', border: '1px dashed rgba(14,45,110,0.12)' }}>
      <div style={{ fontSize: '2rem', marginBottom: '8px', opacity: 0.3 }}>◎</div>
      <p style={{ margin: 0, fontSize: '14px', color: '#888780' }}>
        no responses captured — {studentName} may not have completed this activity
      </p>
    </div>
  )

  const entries = Object.entries(responses).filter(([_, r]) => isSignificant(r))

  if (entries.length === 0) return (
    <div style={{ padding: '2rem', textAlign: 'center', background: '#F8F7F5', borderRadius: '10px', border: '1px dashed rgba(14,45,110,0.12)' }}>
      <p style={{ margin: 0, fontSize: '14px', color: '#888780' }}>
        activity opened but no responses recorded yet
      </p>
    </div>
  )

  // Separate text responses from selections/checkboxes
  const textResponses = entries.filter(([_, r]) => r.type === 'text' && (r.wordCount || 0) > 2)
  const selections = entries.filter(([_, r]) => r.type !== 'text' || (r.wordCount || 0) <= 2)

  const totalWords = entries.reduce((sum, [_, r]) => sum + (r.wordCount || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* SUMMARY BAR */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {totalWords > 0 && (
          <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C' }}>
            {totalWords} words written
          </span>
        )}
        {textResponses.length > 0 && (
          <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '99px', background: '#DCFCE7', color: '#166534' }}>
            {textResponses.length} question{textResponses.length !== 1 ? 's' : ''} answered
          </span>
        )}
        {selections.length > 0 && (
          <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '99px', background: '#F3E8FF', color: '#7C3AED' }}>
            {selections.length} selection{selections.length !== 1 ? 's' : ''} made
          </span>
        )}
      </div>

      {/* SELECTIONS / CHOICES (compact row) */}
      {selections.length > 0 && (
        <div style={{ background: '#F8F7F5', borderRadius: '10px', padding: '12px 16px', border: '1px solid rgba(14,45,110,0.06)' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888780', marginBottom: '10px' }}>
            choices & selections
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {selections.map(([key, r]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <span style={{ fontSize: '12px', color: '#888780', minWidth: '120px', flexShrink: 0, paddingTop: '1px' }}>
                  {cleanLabel(key, r.label)}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#0E2D6E', background: '#EBF1FD', padding: '2px 10px', borderRadius: '99px' }}>
                  {r.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TEXT RESPONSES (full cards) */}
      {textResponses.map(([key, r], i) => (
        <div key={key} style={{ background: 'white', borderRadius: '10px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden' }}>
          {/* QUESTION HEADER */}
          <div style={{ padding: '10px 16px', background: '#F8F7F5', borderBottom: '1px solid rgba(14,45,110,0.06)', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C', flexShrink: 0, marginTop: '1px' }}>
              Q{i + 1}
            </span>
            <span style={{ fontSize: '13px', color: '#5F5E5A', lineHeight: 1.5, fontStyle: 'italic' }}>
              {cleanLabel(key, r.label)}
            </span>
          </div>

          {/* STUDENT ANSWER */}
          <div style={{ padding: '14px 16px' }}>
            <p style={{ margin: 0, fontSize: '14px', color: '#0E2D6E', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
              {r.value}
            </p>
            {r.wordCount && r.wordCount > 0 && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#888780' }}>
                {r.wordCount} words
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}