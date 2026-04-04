'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface RawResponse {
  type: string
  label: string
  value: string
  wordCount?: number
  selected?: string[]
  text?: string
}

interface ExerciseResponse {
  id: string
  student_id: string
  lesson_id: string
  exercise_index: number
  exercise_type: string
  response_text: string | null
  word_count: number | null
  updated_at: string
  profiles?: { display_name: string; avatar_url: string | null }
}

// ── SINGLE STUDENT RESPONSE SUMMARY ─────────────────────────
// Used in the grading panel (teacher sees one student's responses)

interface SummaryProps {
  lessonId: string
  studentId?: string  // if provided, fetch this student's responses
  responseText?: string  // or pass directly
}

export function ActivityResponseSummary({ lessonId, studentId, responseText }: SummaryProps) {
  const [text, setText] = useState<string | null>(responseText || null)
  const [loading, setLoading] = useState(!responseText)

  useEffect(() => {
    if (responseText) return
    if (!lessonId) return
    api.get<ExerciseResponse[]>(`/exercises/lesson/${lessonId}/my`)
      .then(data => {
        const activity = data?.find(r => r.exercise_type === 'activity_responses')
        setText(activity?.response_text || null)
      })
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [lessonId, responseText])

  if (loading) return <p style={{ fontSize: '13px', color: '#888780' }}>loading responses...</p>
  if (!text) return <p style={{ fontSize: '13px', color: '#888780', fontStyle: 'italic' }}>no responses captured yet</p>

  let parsed: Record<string, RawResponse> = {}
  try { parsed = JSON.parse(text) } catch { return null }

  const entries = Object.entries(parsed).filter(([_, r]) => r.value?.toString().trim())
  if (entries.length === 0) return <p style={{ fontSize: '13px', color: '#888780', fontStyle: 'italic' }}>no responses captured yet</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {entries.map(([key, r]) => (
        <div key={key} style={{ padding: '10px 14px', background: '#F8F7F5', borderRadius: '8px', border: '1px solid rgba(14,45,110,0.06)' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780', marginBottom: '4px' }}>
            {r.label || key}
          </div>
          <div style={{ fontSize: '13px', color: '#333', lineHeight: 1.6 }}>
            {r.value}
          </div>
          {r.wordCount && r.wordCount > 0 && (
            <div style={{ fontSize: '11px', color: '#888780', marginTop: '4px' }}>{r.wordCount} words</div>
          )}
        </div>
      ))}
    </div>
  )
}


// ── ALL STUDENTS RESPONSE VIEW ───────────────────────────────
// Used on the full detail page (teacher sees all students)

interface AllResponsesProps {
  lessonId: string
}

export function ActivityAllResponses({ lessonId }: AllResponsesProps) {
  const [responses, setResponses] = useState<ExerciseResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    api.get<ExerciseResponse[]>(`/exercises/lesson/${lessonId}/all`)
      .then(data => {
        const activityResponses = (data || []).filter(r => r.exercise_type === 'activity_responses')
        setResponses(activityResponses)
        if (activityResponses.length > 0) setSelected(activityResponses[0].student_id)
      })
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [lessonId])

  if (loading) return <p style={{ color: '#888780', fontSize: '14px' }}>loading...</p>
  if (responses.length === 0) return (
    <div style={{ padding: '3rem', textAlign: 'center', background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)' }}>
      <p style={{ color: '#888780', fontSize: '14px', margin: 0 }}>no student responses yet</p>
    </div>
  )

  const selectedResponse = responses.find(r => r.student_id === selected)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1rem', height: '100%' }}>

      {/* STUDENT LIST */}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden', alignSelf: 'start' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(14,45,110,0.06)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780' }}>
          {responses.length} student{responses.length !== 1 ? 's' : ''}
        </div>
        {responses.map(r => {
          const isSelected = r.student_id === selected
          const name = r.profiles?.display_name || 'Student'
          const words = r.word_count || 0
          return (
            <div
              key={r.student_id}
              onClick={() => setSelected(r.student_id)}
              style={{ padding: '10px 14px', cursor: 'pointer', background: isSelected ? '#EBF1FD' : 'white', borderBottom: '1px solid rgba(14,45,110,0.04)', display: 'flex', alignItems: 'center', gap: '10px', transition: 'background 0.1s' }}
            >
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: isSelected ? '#1A56DB' : '#D3D1C7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                {name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: isSelected ? 600 : 400, color: isSelected ? '#0E2D6E' : '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {name}
                </div>
                <div style={{ fontSize: '11px', color: '#888780' }}>{words} words total</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* SELECTED STUDENT RESPONSES */}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.25rem' }}>
        {selectedResponse ? (
          <>
            <div style={{ marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(14,45,110,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#0E2D6E' }}>
                {selectedResponse.profiles?.display_name || 'Student'}
              </span>
              <span style={{ fontSize: '11px', color: '#888780' }}>
                last updated {new Date(selectedResponse.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <ActivityResponseSummary
              lessonId={lessonId}
              responseText={selectedResponse.response_text || undefined}
            />
          </>
        ) : (
          <p style={{ color: '#888780', fontSize: '14px' }}>select a student</p>
        )}
      </div>
    </div>
  )
}