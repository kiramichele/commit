'use client'
import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import PythonDocsBrowser from '@/components/PythonDocsBrowser'

/**
 * Standalone Python reference. Accessible from anywhere — student main page,
 * the docs button on coding assignments, error panel 'find in docs' when no
 * lesson is associated, etc.
 *
 * Supports ?search=<term> to deep-link to a specific entry, the same way
 * the lesson docs tab does.
 */
export default function DocsPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: '#888780' }}>loading docs...</p>
      </div>
    }>
      <DocsPageInner />
    </Suspense>
  )
}

function DocsPageInner() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialSearch = searchParams.get('search') || ''

  useEffect(() => {
    if (loading) return
    if (!profile) router.push('/login')
  }, [profile, loading, router])

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ color: '#888780' }}>loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 1.5rem', height: '56px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link href={profile.role === 'student' ? '/learn' : profile.role === 'teacher' ? '/dashboard' : '/admin'} style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <div style={{ width: '28px', height: '28px', background: '#1A56DB', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'white' }}>{'>'}_</div>
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#0E2D6E' }}>commit</span>
        </Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        <span style={{ fontSize: '13px', color: '#0E2D6E', fontWeight: 500 }}>📚 python docs</span>
      </nav>

      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '2rem' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <h1 style={{ margin: '0 0 4px', fontSize: '1.5rem', fontWeight: 700, color: '#0E2D6E', letterSpacing: '-0.02em' }}>python reference</h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#888780', lineHeight: 1.6 }}>
            quick lookups for the syntax you need. search above, click any entry for an example.
          </p>
        </div>
        <PythonDocsBrowser initialSearch={initialSearch} />
      </div>
    </div>
  )
}
