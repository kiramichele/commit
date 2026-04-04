'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'

interface Props {
  lessonId: string
  lessonTitle: string
}

export default function LessonCompleteButton({ lessonId, lessonTitle }: Props) {
  const [completed, setCompleted] = useState(false)
  const [completedAt, setCompletedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)

  useEffect(() => {
    api.get<{ completed: boolean; completed_at: string | null }>(
      `/curriculum/lessons/${lessonId}/completion`
    )
      .then(data => {
        setCompleted(data.completed)
        setCompletedAt(data.completed_at)
      })
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [lessonId])

  const handleComplete = async () => {
    setMarking(true)
    try {
      const result = await api.post<{ completed_at: string }>(
        `/curriculum/lessons/${lessonId}/complete`, {}
      )
      setCompleted(true)
      setCompletedAt(result.completed_at)
    } catch (e) {
      console.error(e)
    } finally {
      setMarking(false)
    }
  }

  if (loading) return null

  if (completed) return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '14px 20px', borderRadius: '10px',
      background: '#DCFCE7', border: '1px solid rgba(34,197,94,0.25)',
      margin: '2rem 0',
    }}>
      <span style={{ fontSize: '20px' }}>✓</span>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#166534' }}>
          lesson complete!
        </div>
        {completedAt && (
          <div style={{ fontSize: '11px', color: '#166534', opacity: 0.7 }}>
            completed {new Date(completedAt).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            })}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div style={{ margin: '2rem 0' }}>
      <button
        onClick={handleComplete}
        disabled={marking}
        style={{
          width: '100%', padding: '14px',
          background: marking ? '#93C5FD' : '#1A56DB',
          color: 'white', border: 'none', borderRadius: '10px',
          fontSize: '14px', fontWeight: 700,
          cursor: marking ? 'not-allowed' : 'pointer',
          fontFamily: "'DM Sans', sans-serif",
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: '8px',
          transition: 'background 0.2s',
        }}
      >
        {marking ? (
          <>
            <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            marking complete...
          </>
        ) : (
          '✓ mark lesson as complete'
        )}
      </button>
      <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#888780', textAlign: 'center' }}>
        let your teacher know you've finished this lesson
      </p>
    </div>
  )
}