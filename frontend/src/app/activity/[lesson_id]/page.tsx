'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import MarkCompleteButton from '@/components/MarkCompleteButton'

interface Lesson {
  id: string
  title: string
  order_index: number
  units: { id: string; title: string; order_index: number }
  lesson_content: {
    activity_file_path: string | null
    html_file_path: string | null
  } | null
}

export default function ActivityPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const lessonId = params.lesson_id as string
  const searchParams = useSearchParams()
  const assignmentId = searchParams.get('assignment_id')

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [activityUrl, setActivityUrl] = useState<string | null>(null)
  const [activityHtml, setActivityHtml] = useState<string | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading) return
    if (!profile) router.push('/login')
  }, [profile, loading])

  useEffect(() => {
    if (!profile || !lessonId) return
    fetchActivity()
  }, [profile, lessonId])

  const fetchActivity = async () => {
    setDataLoading(true)
    try {
      const lessonData = await api.get<Lesson>(`/curriculum/lessons/${lessonId}`)
      setLesson(lessonData)

      if (!lessonData?.lesson_content?.activity_file_path) {
        setError('No activity found for this lesson.')
        setDataLoading(false)
        return
      }

      const urlData = await api.get<{ url: string }>(
        `/curriculum/lessons/${lessonId}/activity-url`
      )
      setActivityUrl(urlData.url)
      fetch(urlData.url).then(r => r.text()).then(setActivityHtml).catch(() => {})
    } catch (e) {
      setError('Could not load activity.')
      console.error(e)
    } finally {
      setDataLoading(false)
    }
  }

  // Back link — go to lesson or learn depending on role
  const backHref = profile?.role === 'student'
    ? `/lesson/${lessonId}`
    : `/lesson/${lessonId}`

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <p style={{ color: '#888780' }}>loading...</p>
    </div>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* SLIM NAV */}
      <nav style={{
        height: '44px', flexShrink: 0,
        background: 'rgba(248,247,245,0.97)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(14,45,110,0.08)',
        padding: '0 1.25rem',
        display: 'flex', alignItems: 'center', gap: '10px',
        zIndex: 50,
      }}>
        {/* LOGO */}
        <Link href="/learn" style={{ display: 'flex', alignItems: 'center', gap: '7px', textDecoration: 'none', flexShrink: 0 }}>
          <div style={{ width: '24px', height: '24px', background: '#1A56DB', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '9px', color: 'white' }}>{'>'}_</div>
        </Link>

        <span style={{ color: '#D3D1C7', flexShrink: 0 }}>/</span>

        {/* BREADCRUMB */}
        <Link href={backHref} style={{ fontSize: '12px', color: '#888780', textDecoration: 'none', flexShrink: 0, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lesson?.units?.title && <span>{lesson.units.title} · </span>}
          {lesson?.title}
        </Link>

        <span style={{ color: '#D3D1C7', flexShrink: 0 }}>/</span>

        <span style={{ fontSize: '12px', fontWeight: 600, color: '#0E2D6E', flexShrink: 0 }}>activity</span>

        {/* SPACER */}
        <div style={{ flex: 1 }} />

        {/* BACK TO LESSON */}
        <Link
          href={backHref}
          style={{
            fontSize: '12px', fontWeight: 600, color: '#5F5E5A',
            textDecoration: 'none', padding: '5px 12px',
            background: '#F1EFE8', borderRadius: '6px',
            border: '1px solid rgba(14,45,110,0.08)',
            flexShrink: 0,
          }}
        >
          ← back to lesson
        </Link>
      </nav>

      {/* CONTENT */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {dataLoading ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
            <div style={{ width: '32px', height: '32px', border: '2px solid #EBF1FD', borderTopColor: '#1A56DB', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ fontSize: '13px', color: '#888780' }}>loading activity...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : error ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', padding: '2rem' }}>
            <div style={{ fontSize: '3rem', opacity: 0.3 }}>◎</div>
            <p style={{ fontSize: '15px', color: '#5F5E5A', fontWeight: 500, textAlign: 'center' }}>{error}</p>
            <Link href={backHref} style={{ fontSize: '13px', color: '#1A56DB', fontWeight: 600, textDecoration: 'none' }}>
              ← back to lesson
            </Link>
          </div>
        ) : activityHtml ? (
          <iframe
            srcDoc={activityHtml}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            sandbox="allow-scripts allow-same-origin allow-forms"
            title={`Activity: ${lesson?.title}`}
          />
        ) : activityUrl ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888780', fontSize: '14px' }}>loading activity...</div>
        ) : null}
      </div>

      {assignmentId && (
        <MarkCompleteButton assignmentId={assignmentId} />
      )}
    </div>
  )
}