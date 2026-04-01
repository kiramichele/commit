'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface StreakEntry {
  display_name: string
  avatar_url: string | null
  current_streak: number
  is_me: boolean
}

interface Props {
  classroomId: string
}

const MEDALS = ['🥇', '🥈', '🥉']
const MEDAL_COLORS = ['#F59E0B', '#888780', '#CD7C2F']

export default function StreakLeaderboard({ classroomId }: Props) {
  const [leaders, setLeaders] = useState<StreakEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!classroomId) return
    api.get<StreakEntry[]>(`/classrooms/${classroomId}/streak-leaders`)
      .then(data => setLeaders(data || []))
      .catch(() => setLeaders([]))
      .finally(() => setLoading(false))
  }, [classroomId])

  if (loading || leaders.length === 0) return null

  return (
    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780', marginBottom: '12px' }}>
        🔥 streak leaders
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {leaders.map((entry, i) => (
          <div
            key={i}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: '10px',
              background: entry.is_me ? '#EBF1FD' : '#F8F7F5',
              border: `1px solid ${entry.is_me ? 'rgba(26,86,219,0.2)' : 'rgba(14,45,110,0.06)'}`,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '20px', marginBottom: '4px' }}>{MEDALS[i]}</div>
            {entry.avatar_url ? (
              <img src={entry.avatar_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 6px', display: 'block', border: `2px solid ${MEDAL_COLORS[i]}` }} />
            ) : (
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: entry.is_me ? '#1A56DB' : '#D3D1C7', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: 'white', border: `2px solid ${MEDAL_COLORS[i]}` }}>
                {entry.display_name.charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#0E2D6E', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entry.is_me ? 'you!' : entry.display_name.split(' ')[0]}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
              <span style={{ fontSize: '13px' }}>🔥</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: MEDAL_COLORS[i], fontFamily: "'DM Mono', monospace" }}>
                {entry.current_streak}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}