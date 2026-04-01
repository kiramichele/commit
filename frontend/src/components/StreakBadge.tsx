'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface StreakData {
  current_streak: number
  longest_streak: number
  last_activity_date: string | null
}

export default function StreakBadge() {
  const [streak, setStreak] = useState<StreakData | null>(null)

  useEffect(() => {
    api.get<StreakData>('/auth/streak')
      .then(setStreak)
      .catch(() => null)
  }, [])

  if (!streak || streak.current_streak === 0) return null

  const isToday = streak.last_activity_date === new Date().toISOString().split('T')[0]

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '5px 12px', borderRadius: '99px',
      background: isToday ? '#FEF9C3' : '#F1EFE8',
      border: `1px solid ${isToday ? 'rgba(245,158,11,0.3)' : 'rgba(14,45,110,0.1)'}`,
      transition: 'all 0.2s',
    }}>
      <span style={{ fontSize: '16px', lineHeight: 1 }}>🔥</span>
      <span style={{
        fontSize: '14px', fontWeight: 700,
        color: isToday ? '#854D0E' : '#5F5E5A',
        fontFamily: "'DM Mono', monospace",
      }}>
        {streak.current_streak}
      </span>
    </div>
  )
}