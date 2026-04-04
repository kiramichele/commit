'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import { ActivityAllResponses } from '@/components/ActivityResponsesView'

interface Lesson {
  id: string
  title: string
  units: { title: string }
}

export default function ActivityResponsesPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const lessonId = params.lesson_id as string
  const classroomId = params.classroom_id as string

  const [lesson, setLesson] = useState<Lesson | null>(null)

  useEffect(() => {
    if (loading) return
    if (!profile) router.push('/login')
    if (profile?.role === 'student') router.push('/learn')
  }, [profile, loading])

  useEffect(() => {
    if (!profile || !lessonId) return
    api.get<Lesson>(`/curriculum/lessons/${lessonId}`)
      .then(setLesson)
      .catch(() => null)
  }, [profile, lessonId])

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ color: '#888780' }}>loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 1.5rem', height: '56px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <div style={{ width: '28px', height: '28px', background: '#1A56DB', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'white' }}>{'>'}_</div>
        </Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        {classroomId && (
          <>
            <Link href={`/classroom/${classroomId}`} style={{ fontSize: '13px', color: '#888780', textDecoration: 'none' }}>classroom</Link>
            <span style={{ color: '#D3D1C7' }}>/</span>
          </>
        )}
        <span style={{ fontSize: '13px', color: '#0E2D6E', fontWeight: 500 }}>
          {lesson?.title || 'activity'} — responses
        </span>
      </nav>

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem', height: 'calc(100vh - 56px)', boxSizing: 'border-box' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ margin: '0 0 4px', fontSize: '1.25rem', fontWeight: 700, color: '#0E2D6E' }}>
            {lesson?.title} — student responses
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#888780' }}>
            {lesson?.units?.title} · activity responses
          </p>
        </div>

        <ActivityAllResponses lessonId={lessonId} />
      </div>
    </div>
  )
}