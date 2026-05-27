'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

// A simulated student view of the entire published curriculum.
// Admins use this from the curriculum admin page to verify what
// students experience — it mirrors the per-unit layout used on
// /learn/[classroom_id] but without classroom scoping or unlocks.

interface CurriculumLesson {
  id: string
  order_index: number
  title: string
  is_published: boolean
}
interface CurriculumProject {
  id: string
  order_index: number
  title: string
  description: string
  estimated_minutes: number
  is_published: boolean
}
interface CurriculumAssignmentRow {
  id: string
  order_index: number
  title: string
  assignment_type: string
  is_published: boolean
}
interface CurriculumUnit {
  id: string
  order_index: number
  title: string
  is_published: boolean
  lessons?: CurriculumLesson[]
  projects?: CurriculumProject[]
  curriculum_assignments?: CurriculumAssignmentRow[]
}

export default function CurriculumPreviewPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const [units, setUnits] = useState<CurriculumUnit[]>([])
  const [pageLoading, setPageLoading] = useState(true)

  useEffect(() => {
    if (loading) return
    if (!profile) router.push('/login')
    // Only admins and teachers should see the preview — students go through
    // their real classroom view.
    if (profile && profile.role === 'student') router.push('/learn')
  }, [profile, loading, router])

  useEffect(() => {
    if (!profile) return
    api.get<CurriculumUnit[]>('/curriculum/units')
      .then(data => setUnits(data || []))
      .catch(() => setUnits([]))
      .finally(() => setPageLoading(false))
  }, [profile])

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ color: '#888780' }}>loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <div style={{ background: '#FEF3C7', borderBottom: '1px solid rgba(245,158,11,0.3)', padding: '8px 16px', textAlign: 'center', fontSize: '12px', color: '#854D0E', fontWeight: 600 }}>
        👁 preview mode — viewing the curriculum as a student would see it ·
        <Link href="/admin/curriculum" style={{ color: '#854D0E', marginLeft: '8px', textDecoration: 'underline' }}>back to admin</Link>
      </div>

      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 1.5rem', height: '52px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <div style={{ width: '26px', height: '26px', background: '#1A56DB', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'white' }}>{'>'}_</div>
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#0E2D6E' }}>commit</span>
        </div>
        <span style={{ color: '#D3D1C7' }}>/</span>
        <span style={{ fontSize: '13px', color: '#0E2D6E', fontWeight: 500 }}>curriculum preview</span>
      </nav>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
        {pageLoading ? (
          <p style={{ color: '#888780', fontSize: '14px' }}>loading...</p>
        ) : units.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)' }}>
            <p style={{ color: '#888780', fontSize: '14px', margin: 0 }}>no published curriculum yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {units.map(unit => {
              type Row =
                | { kind: 'lesson'; data: CurriculumLesson; order_index: number; id: string }
                | { kind: 'project'; data: CurriculumProject; order_index: number; id: string }
                | { kind: 'assignment'; data: CurriculumAssignmentRow; order_index: number; id: string }
              const merged: Row[] = [
                ...(unit.lessons || []).filter(l => l.is_published).map(l => ({ kind: 'lesson' as const, data: l, order_index: l.order_index, id: l.id })),
                ...(unit.projects || []).filter(p => p.is_published).map(p => ({ kind: 'project' as const, data: p, order_index: p.order_index, id: p.id })),
                ...(unit.curriculum_assignments || []).filter(a => a.is_published).map(a => ({ kind: 'assignment' as const, data: a, order_index: a.order_index, id: a.id })),
              ].sort((a, b) => a.order_index - b.order_index)
              if (merged.length === 0) return null

              return (
                <div key={unit.id} style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 1.25rem', background: '#F8F7F5', borderBottom: '1px solid rgba(14,45,110,0.06)' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#0E2D6E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{unit.title}</span>
                  </div>
                  {merged.map((item, i) => {
                    const stepNum = i + 1
                    if (item.kind === 'lesson') {
                      const l = item.data
                      return (
                        <div key={l.id} style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(14,45,110,0.05)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#EBF1FD', border: '2px solid #B6CCFF', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#0C447C' }}>{stepNum}</div>
                          <div style={{ flex: 1, minWidth: '200px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 500, fontSize: '14px', color: '#0E2D6E' }}>{l.title}</span>
                              <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C', textTransform: 'uppercase', letterSpacing: '0.05em' }}>lesson</span>
                            </div>
                          </div>
                          <Link href={`/lesson/${l.id}`} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 18px', background: '#1A56DB', color: 'white', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>open →</Link>
                        </div>
                      )
                    }
                    if (item.kind === 'project') {
                      const p = item.data
                      return (
                        <div key={p.id} style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(14,45,110,0.05)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', background: 'rgba(254,243,199,0.3)' }}>
                          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#FEF3C7', border: '2px solid #FDE68A', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#92400E' }}>★</div>
                          <div style={{ flex: 1, minWidth: '200px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600, fontSize: '14px', color: '#0E2D6E' }}>{p.title}</span>
                              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: '#FEF3C7', color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>project</span>
                              <span style={{ fontSize: '11px', color: '#888780' }}>~{p.estimated_minutes} min</span>
                            </div>
                            {p.description && <div style={{ fontSize: '12px', color: '#5F5E5A', marginTop: '2px' }}>{p.description}</div>}
                          </div>
                          <Link href={`/project/${p.id}`} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 18px', background: '#1A56DB', color: 'white', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>open →</Link>
                        </div>
                      )
                    }
                    const a = item.data
                    return (
                      <div key={a.id} style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(14,45,110,0.05)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', background: 'rgba(224,242,254,0.3)' }}>
                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#E0F2FE', border: '2px solid #BAE6FD', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#075985' }}>&Sigma;</div>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: '14px', color: '#0E2D6E' }}>{a.title}</span>
                            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: '#E0F2FE', color: '#075985', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{a.assignment_type}</span>
                          </div>
                        </div>
                        <Link href={`/curriculum-assignment/${a.id}`} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 18px', background: '#1A56DB', color: 'white', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>open →</Link>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
