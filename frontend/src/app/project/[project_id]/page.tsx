'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

interface Step {
  id: string
  order_index: number
  title: string
  step_type: 'coding' | 'reading' | 'free_response'
  is_published: boolean
}

interface Project {
  id: string
  title: string
  description: string
  estimated_minutes: number
  units: { id: string; title: string; order_index: number } | null
  project_steps: Step[]
}

interface Progress {
  step_id: string
  completed_at: string
}

export default function ProjectListingPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const params = useParams<{ project_id: string }>()

  const [project, setProject] = useState<Project | null>(null)
  const [progress, setProgress] = useState<Set<string>>(new Set())
  const [pageLoading, setPageLoading] = useState(true)

  useEffect(() => {
    if (loading) return
    if (!profile) router.push('/login')
  }, [profile, loading, router])

  useEffect(() => {
    if (!profile) return
    load()
  }, [profile])

  const load = async () => {
    try {
      const [projectData, progressData] = await Promise.all([
        api.get<Project>(`/curriculum/projects/${params.project_id}`),
        api.get<Progress[]>(`/curriculum/projects/${params.project_id}/my-progress`).catch(() => []),
      ])
      setProject(projectData)
      setProgress(new Set(progressData.map(p => p.step_id)))
    } catch (err: any) {
      console.error(err)
    } finally {
      setPageLoading(false)
    }
  }

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5' }}>
      <p style={{ color: '#888780', fontFamily: "'DM Sans', sans-serif" }}>loading...</p>
    </div>
  )

  const typeBadge = (t: Step['step_type']) => {
    const map = {
      coding: { bg: '#EBF1FD', color: '#0C447C', label: 'coding' },
      reading: { bg: '#F3E8FF', color: '#6B21A8', label: 'reading' },
      free_response: { bg: '#FEF3C7', color: '#92400E', label: 'reflection' },
    }
    return map[t]
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 1.5rem', height: '52px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Link href="/learn" style={{ display: 'flex', alignItems: 'center', gap: '7px', textDecoration: 'none' }}>
          <div style={{ width: '26px', height: '26px', background: '#1A56DB', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'white' }}>{'>'}_</div>
        </Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        {project?.units && <span style={{ fontSize: '12px', color: '#888780' }}>Unit {project.units.order_index}</span>}
        <span style={{ color: '#D3D1C7' }}>/</span>
        <span style={{ fontSize: '13px', color: '#0E2D6E', fontWeight: 500 }}>project: {project?.title}</span>
      </nav>

      {pageLoading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: '#888780' }}>loading...</div>
      ) : !project ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: '#888780' }}>project not found.</div>
      ) : (
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '2rem' }}>

          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', padding: '2rem', marginBottom: '1.5rem' }}>
            <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#92400E', background: '#FEF3C7', padding: '4px 10px', borderRadius: '99px', marginBottom: '12px' }}>project</span>
            <h1 style={{ margin: '0 0 8px', fontSize: '24px', fontWeight: 700, color: '#0E2D6E', letterSpacing: '-0.02em' }}>{project.title}</h1>
            {project.description && (
              <p style={{ margin: '0 0 12px', fontSize: '14px', color: '#5F5E5A', lineHeight: 1.6 }}>{project.description}</p>
            )}
            <p style={{ margin: 0, fontSize: '12px', color: '#888780' }}>
              {project.project_steps.length} step(s) · ~{project.estimated_minutes} min total
            </p>
          </div>

          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid rgba(14,45,110,0.06)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780' }}>
              steps
            </div>
            {project.project_steps.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#888780', fontSize: '13px' }}>no steps published yet</div>
            ) : (
              project.project_steps.map((s, i) => {
                const done = progress.has(s.id)
                const badge = typeBadge(s.step_type)
                return (
                  <Link
                    key={s.id}
                    href={`/project/${project.id}/step/${s.id}`}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.9rem 1.5rem', borderBottom: i < project.project_steps.length - 1 ? '1px solid rgba(14,45,110,0.05)' : 'none', textDecoration: 'none', color: 'inherit', gap: '12px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '50%',
                        background: done ? '#22C55E' : 'rgba(14,45,110,0.06)',
                        color: done ? 'white' : '#888780',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: "'DM Mono', monospace", fontSize: '12px', fontWeight: 700,
                        flexShrink: 0,
                      }}>
                        {done ? '✓' : s.order_index}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#0E2D6E' }}>{s.title}</div>
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: badge.bg, color: badge.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{badge.label}</span>
                      </div>
                    </div>
                    <span style={{ color: '#888780', fontSize: '14px', flexShrink: 0 }}>→</span>
                  </Link>
                )
              })
            )}
          </div>

        </div>
      )}
    </div>
  )
}
