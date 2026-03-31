'use client'
import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'

interface HelpRequest {
  id: string
  student_id: string
  submission_id: string
  note: string | null
  status: string
  created_at: string
  claimed_by: string | null
  profiles: { display_name: string; email: string }
  submissions: { assignment_id: string; assignments: { title: string } }
}

interface Props {
  classroomId: string
}

export default function HelpQueue({ classroomId }: Props) {
  const [requests, setRequests] = useState<HelpRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchRequests = useCallback(async () => {
    try {
      const data = await api.get<HelpRequest[]>(`/help/classroom/${classroomId}`)
      setRequests(data || [])
    } catch {
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [classroomId])

  useEffect(() => {
    fetchRequests()
    // Poll every 30 seconds for new requests
    const interval = setInterval(fetchRequests, 30000)
    return () => clearInterval(interval)
  }, [fetchRequests])

  const handleAction = async (requestId: string, newStatus: 'in_progress' | 'resolved') => {
    setActionLoading(requestId)
    try {
      await api.patch(`/help/${requestId}`, { status: newStatus })
      if (newStatus === 'resolved') {
        setRequests(prev => prev.filter(r => r.id !== requestId))
      } else {
        setRequests(prev => prev.map(r =>
          r.id === requestId ? { ...r, status: newStatus } : r
        ))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(null)
    }
  }

  const formatTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    return `${Math.floor(mins / 60)}h ago`
  }

  if (loading) return (
    <div style={{ padding: '1rem', color: '#888780', fontSize: '13px' }}>loading help queue...</div>
  )

  if (requests.length === 0) return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '8px', opacity: 0.4 }}>✓</div>
      <p style={{ color: '#888780', fontSize: '13px', margin: 0 }}>no open help requests</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {requests.map(req => (
        <div key={req.id} style={{
          padding: '1rem 1.25rem',
          borderRadius: '10px',
          border: `1px solid ${req.status === 'in_progress' ? 'rgba(26,86,219,0.3)' : 'rgba(245,158,11,0.3)'}`,
          background: req.status === 'in_progress' ? '#EBF1FD' : '#FEF9C3',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: '14px', color: '#0E2D6E' }}>
                  {req.profiles?.display_name}
                </span>
                <span style={{
                  fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px',
                  background: req.status === 'in_progress' ? '#1A56DB' : '#F59E0B',
                  color: 'white',
                }}>
                  {req.status === 'in_progress' ? 'in progress' : 'needs help'}
                </span>
                <span style={{ fontSize: '11px', color: '#888780' }}>{formatTime(req.created_at)}</span>
              </div>
              <div style={{ fontSize: '12px', color: '#5F5E5A', marginBottom: req.note ? '6px' : '0' }}>
                {req.submissions?.assignments?.title || 'unknown assignment'}
              </div>
              {req.note && (
                <div style={{ fontSize: '13px', color: '#0E2D6E', padding: '6px 10px', background: 'rgba(255,255,255,0.6)', borderRadius: '6px', fontStyle: 'italic' }}>
                  "{req.note}"
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              {req.status === 'open' && (
                <button
                  onClick={() => handleAction(req.id, 'in_progress')}
                  disabled={actionLoading === req.id}
                  style={{ padding: '6px 14px', background: '#1A56DB', color: 'white', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                >
                  {actionLoading === req.id ? '...' : 'claim'}
                </button>
              )}
              <button
                onClick={() => handleAction(req.id, 'resolved')}
                disabled={actionLoading === req.id}
                style={{ padding: '6px 14px', background: '#22C55E', color: 'white', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
              >
                {actionLoading === req.id ? '...' : 'resolve ✓'}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
