'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'

interface UngradedItem {
  assignment_id: string
  assignment_title: string
  classroom_id: string
  classroom_name: string
  ungraded_count: number
  assignment_type: string
}

export default function GradingQueue() {
  const [items, setItems] = useState<UngradedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<UngradedItem[]>('/assignments/ungraded-queue')
      .then(data => setItems(data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading || items.length === 0) return null

  const totalUngraded = items.reduce((sum, i) => sum + i.ungraded_count, 0)

  return (
    <div style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(26,86,219,0.15)', padding: '1.25rem 1.5rem', marginBottom: '1.5rem', boxShadow: '0 2px 12px rgba(26,86,219,0.06)' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
        <span style={{ fontSize: '16px' }}>📝</span>
        <span style={{ fontWeight: 700, fontSize: '14px', color: '#0E2D6E' }}>needs grading</span>
        <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 10px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C', marginLeft: '4px' }}>
          {totalUngraded} submission{totalUngraded !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ITEMS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {items.map(item => (
          <Link
            key={item.assignment_id}
            href={item.assignment_type === 'code' || !item.assignment_type
              ? `/classroom/${item.classroom_id}/submissions/${item.assignment_id}`
              : `/classroom/${item.classroom_id}/curriculum-submissions/${item.assignment_id}`
            }
            style={{ textDecoration: 'none', display: 'block' }}
          >
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', background: '#F8F7F5', border: '1px solid rgba(14,45,110,0.06)', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#EBF1FD'; e.currentTarget.style.borderColor = 'rgba(26,86,219,0.2)' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#F8F7F5'; e.currentTarget.style.borderColor = 'rgba(14,45,110,0.06)' }}
            >
              {/* UNGRADED COUNT BUBBLE */}
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#1A56DB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'white', fontFamily: "'DM Mono', monospace" }}>
                  {item.ungraded_count}
                </span>
              </div>

              {/* ASSIGNMENT INFO */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0E2D6E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.assignment_title}
                </div>
                <div style={{ fontSize: '11px', color: '#888780' }}>{item.classroom_name}</div>
              </div>

              <span style={{ fontSize: '12px', color: '#1A56DB', fontWeight: 600, flexShrink: 0 }}>
                grade now →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}