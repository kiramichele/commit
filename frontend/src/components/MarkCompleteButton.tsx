'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

interface Props {
  assignmentId: string
  classroomId?: string
}

export default function MarkCompleteButton({ assignmentId, classroomId }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const router = useRouter()

  const handleComplete = async () => {
    setStatus('loading')
    try {
      // Open/create submission
      const opened = await api.post<{ submission: { id: string } }>(
        `/code/open?assignment_id=${assignmentId}`, {}
      )
      const submissionId = opened.submission?.id
      if (!submissionId) throw new Error('No submission created.')

      // Submit it
      await api.post('/code/submit', { submission_id: submissionId })
      setStatus('done')

      // After a beat, redirect back to kanban
      setTimeout(() => {
        if (classroomId) {
          router.push(`/learn/${classroomId}`)
        } else {
          router.push('/learn')
        }
      }, 1800)
    } catch (e) {
      console.error(e)
      setStatus('idle')
    }
  }

  if (status === 'done') return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: '10px', padding: '16px 24px',
      background: '#DCFCE7', borderRadius: '10px',
      border: '1px solid rgba(34,197,94,0.25)',
    }}>
      <span style={{ fontSize: '20px' }}>✓</span>
      <span style={{ fontSize: '14px', fontWeight: 600, color: '#166534' }}>
        marked complete! heading back...
      </span>
    </div>
  )

  return (
    <button
      onClick={handleComplete}
      disabled={status === 'loading'}
      style={{
        width: '100%', padding: '14px',
        background: status === 'loading' ? '#93C5FD' : '#1A56DB',
        color: 'white', border: 'none', borderRadius: '10px',
        fontSize: '14px', fontWeight: 700,
        cursor: status === 'loading' ? 'not-allowed' : 'pointer',
        fontFamily: "'DM Sans', sans-serif",
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        transition: 'background 0.2s',
      }}
    >
      {status === 'loading' ? (
        <>
          <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          marking complete...
        </>
      ) : (
        '✓ mark as complete'
      )}
    </button>
  )
}