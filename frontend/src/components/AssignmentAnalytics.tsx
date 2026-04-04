'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Analytics {
  total_students: number
  submitted_count: number
  submission_rate: number
  graded_count: number
  avg_grade: number | null
  avg_commits: number | null
  avg_time_to_submit_minutes: number | null
  grade_distribution: { A: number; B: number; C: number; D: number; F: number }
  hint_usage: { none: number; hint1_only: number; hint2: number }
}

interface Props {
  assignmentId: string
}

function formatTime(minutes: number | null): string {
  if (!minutes) return '—'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const GRADE_COLORS: Record<string, { color: string; bg: string }> = {
  A: { color: '#166534', bg: '#DCFCE7' },
  B: { color: '#0C447C', bg: '#EBF1FD' },
  C: { color: '#854D0E', bg: '#FEF9C3' },
  D: { color: '#9A3412', bg: '#FEE2E2' },
  F: { color: '#991B1B', bg: '#FEE2E2' },
}

export default function AssignmentAnalytics({ assignmentId }: Props) {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    api.get<Analytics>(`/assignments/${assignmentId}/analytics`)
      .then(setData)
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [assignmentId])

  if (loading || !data || data.total_students === 0) return null

  const maxDist = Math.max(...Object.values(data.grade_distribution), 1)

  return (
    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden', marginBottom: '1rem' }}>

      {/* HEADER */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '12px 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: '#F8F7F5', borderBottom: expanded ? '1px solid rgba(14,45,110,0.06)' : 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px' }}>📊</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#0E2D6E' }}>assignment analytics</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* QUICK STATS INLINE */}
          <span style={{ fontSize: '12px', color: '#888780' }}>
            {data.submitted_count}/{data.total_students} submitted
            {data.avg_grade != null && ` · avg ${data.avg_grade}`}
          </span>
          <span style={{ fontSize: '11px', color: '#888780' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '1.25rem' }}>

          {/* TOP STATS GRID */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '1.25rem' }}>
            {[
              { label: 'submission rate', value: `${data.submission_rate}%`, sub: `${data.submitted_count} of ${data.total_students}`, color: data.submission_rate >= 80 ? '#166534' : data.submission_rate >= 50 ? '#854D0E' : '#991B1B' },
              { label: 'average grade', value: data.avg_grade != null ? `${data.avg_grade}` : '—', sub: `${data.graded_count} graded`, color: data.avg_grade != null ? (data.avg_grade >= 80 ? '#166534' : data.avg_grade >= 70 ? '#854D0E' : '#991B1B') : '#888780' },
              { label: 'avg commits', value: data.avg_commits != null ? `${data.avg_commits}` : '—', sub: 'per submission', color: '#0E2D6E' },
              { label: 'avg time', value: formatTime(data.avg_time_to_submit_minutes), sub: 'open to submit', color: '#0E2D6E' },
            ].map(stat => (
              <div key={stat.label} style={{ padding: '12px', background: '#F8F7F5', borderRadius: '8px', border: '1px solid rgba(14,45,110,0.06)', textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: 700, color: stat.color, fontFamily: "'DM Mono', monospace", letterSpacing: '-0.02em' }}>{stat.value}</div>
                <div style={{ fontSize: '10px', fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '2px' }}>{stat.label}</div>
                <div style={{ fontSize: '11px', color: '#888780', marginTop: '2px' }}>{stat.sub}</div>
              </div>
            ))}
          </div>

          {/* GRADE DISTRIBUTION */}
          {data.graded_count > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780', marginBottom: '10px' }}>grade distribution</div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', height: '60px' }}>
                {Object.entries(data.grade_distribution).map(([letter, count]) => {
                  const pct = maxDist > 0 ? (count / maxDist) * 100 : 0
                  const { color, bg } = GRADE_COLORS[letter]
                  return (
                    <div key={letter} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
                      {count > 0 && (
                        <span style={{ fontSize: '11px', fontWeight: 600, color }}>{count}</span>
                      )}
                      <div style={{ width: '100%', height: `${Math.max(pct, count > 0 ? 8 : 0)}%`, background: count > 0 ? bg : '#F1EFE8', borderRadius: '4px 4px 0 0', border: count > 0 ? `1px solid ${color}30` : 'none', transition: 'height 0.3s', minHeight: count > 0 ? '8px' : '0' }} />
                      <span style={{ fontSize: '11px', fontWeight: 700, color: count > 0 ? color : '#D3D1C7' }}>{letter}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* HINT USAGE */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780', marginBottom: '10px' }}>hint usage</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { label: 'no hints', value: data.hint_usage.none, color: '#166534', bg: '#DCFCE7' },
                { label: 'hint 1 only', value: data.hint_usage.hint1_only, color: '#854D0E', bg: '#FEF9C3' },
                { label: 'hint 2 used', value: data.hint_usage.hint2, color: '#991B1B', bg: '#FEE2E2' },
              ].map(item => (
                <div key={item.label} style={{ flex: 1, padding: '8px 10px', borderRadius: '8px', background: item.value > 0 ? item.bg : '#F8F7F5', border: `1px solid ${item.value > 0 ? item.color + '30' : 'rgba(14,45,110,0.06)'}`, textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: item.value > 0 ? item.color : '#D3D1C7', fontFamily: "'DM Mono', monospace" }}>{item.value}</div>
                  <div style={{ fontSize: '11px', color: item.value > 0 ? item.color : '#888780', marginTop: '2px' }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

// ============================================================
// Wire into classroom/[id]/submissions/[assignment_id]/page.tsx
// ============================================================
//
// import AssignmentAnalytics from '@/components/AssignmentAnalytics'
//
// Add at the TOP of the submissions page, before the student list:
//
// <AssignmentAnalytics assignmentId={assignmentId} />