'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

interface DocResult { name: string; search: string }
interface LessonResult { id: string; title: string; unit_title: string | null }
interface AnnotationResult {
  id: string
  lesson_id: string
  lesson_title: string | null
  kind: 'highlight' | 'note'
  selected_text: string | null
  note_text: string | null
}

interface SearchResponse {
  docs: DocResult[]
  lessons: LessonResult[]
  annotations: AnnotationResult[]
}

type Tab = 'all' | 'docs' | 'lessons' | 'notes'

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: '#888780' }}>loading search...</p>
      </div>
    }>
      <SearchInner />
    </Suspense>
  )
}

function SearchInner() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialQ = searchParams.get('q') || ''

  const [query, setQuery] = useState(initialQ)
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [searching, setSearching] = useState(false)
  const [tab, setTab] = useState<Tab>('all')

  useEffect(() => {
    if (loading) return
    if (!profile) router.push('/login')
  }, [profile, loading, router])

  // Debounce the search by 300ms so we don't fire on every keystroke.
  useEffect(() => {
    if (!profile) return
    if (!query.trim()) {
      setResults(null)
      return
    }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await api.get<SearchResponse>(`/annotations/search?q=${encodeURIComponent(query)}`)
        setResults(data)
      } catch {
        setResults({ docs: [], lessons: [], annotations: [] })
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query, profile])

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ color: '#888780' }}>loading...</p>
    </div>
  )

  const docs = results?.docs || []
  const lessons = results?.lessons || []
  const annotations = results?.annotations || []
  const totalCount = docs.length + lessons.length + annotations.length

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'all', label: 'all', count: totalCount },
    { id: 'docs', label: '📚 python docs', count: docs.length },
    { id: 'lessons', label: '📄 lessons', count: lessons.length },
    { id: 'notes', label: '📝 my notes', count: annotations.length },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 1.5rem', height: '56px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link href={profile.role === 'student' ? '/learn' : profile.role === 'teacher' ? '/dashboard' : '/admin'} style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <div style={{ width: '28px', height: '28px', background: '#1A56DB', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'white' }}>{'>'}_</div>
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#0E2D6E' }}>commit</span>
        </Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        <span style={{ fontSize: '13px', color: '#0E2D6E', fontWeight: 500 }}>🔍 search</span>
      </nav>

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '2rem' }}>

        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="search docs, lessons, and your notes..."
          autoFocus
          style={{ width: '100%', padding: '14px 18px', borderRadius: '12px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '15px', outline: 'none', background: 'white', fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', boxShadow: '0 2px 8px rgba(14,45,110,0.05)' }}
        />

        {/* TABS */}
        <div style={{ display: 'flex', gap: '4px', marginTop: '1.25rem', background: 'white', padding: '4px', borderRadius: '10px', border: '1px solid rgba(14,45,110,0.08)', width: 'fit-content', flexWrap: 'wrap' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{ padding: '6px 14px', borderRadius: '7px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", background: tab === t.id ? '#1A56DB' : 'transparent', color: tab === t.id ? 'white' : '#5F5E5A' }}
            >
              {t.label} {results && <span style={{ marginLeft: '4px', fontSize: '11px', opacity: 0.75 }}>{t.count}</span>}
            </button>
          ))}
        </div>

        {/* RESULTS */}
        <div style={{ marginTop: '1.25rem' }}>
          {!query.trim() ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#888780', fontSize: '14px' }}>
              start typing to search.
            </div>
          ) : searching && !results ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#888780', fontSize: '13px' }}>searching...</div>
          ) : results && totalCount === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#888780', fontSize: '14px' }}>
              no results for "{query}".
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* DOCS */}
              {(tab === 'all' || tab === 'docs') && docs.length > 0 && (
                <Section title="📚 python docs" count={docs.length}>
                  {docs.map(d => (
                    <Link key={d.name} href={`/docs?search=${encodeURIComponent(d.search)}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(14,45,110,0.05)', textDecoration: 'none', color: 'inherit' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: '#0E2D6E' }}>{d.name}</span>
                      <span style={{ fontSize: '11px', color: '#1A56DB' }}>open →</span>
                    </Link>
                  ))}
                </Section>
              )}

              {/* LESSONS */}
              {(tab === 'all' || tab === 'lessons') && lessons.length > 0 && (
                <Section title="📄 lessons" count={lessons.length}>
                  {lessons.map(l => (
                    <Link key={l.id} href={`/lesson/${l.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(14,45,110,0.05)', textDecoration: 'none', color: 'inherit' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#0E2D6E' }}>{l.title}</div>
                        {l.unit_title && <div style={{ fontSize: '11px', color: '#888780' }}>{l.unit_title}</div>}
                      </div>
                      <span style={{ fontSize: '11px', color: '#1A56DB' }}>open →</span>
                    </Link>
                  ))}
                </Section>
              )}

              {/* NOTES */}
              {(tab === 'all' || tab === 'notes') && annotations.length > 0 && (
                <Section title="📝 my notes" count={annotations.length}>
                  {annotations.map(a => (
                    <Link key={a.id} href={`/lesson/${a.lesson_id}`} style={{ display: 'block', padding: '10px 14px', borderBottom: '1px solid rgba(14,45,110,0.05)', textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: a.kind === 'highlight' ? '#854D0E' : '#0C447C', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {a.kind === 'highlight' ? '🖍 highlight' : '📝 note'}
                        </span>
                        {a.lesson_title && <span style={{ fontSize: '11px', color: '#888780' }}>{a.lesson_title}</span>}
                      </div>
                      {a.selected_text && (
                        <div style={{ fontSize: '12px', color: '#854D0E', fontStyle: 'italic', background: '#FEF08A', padding: '4px 6px', borderRadius: '4px', marginBottom: '2px' }}>"{a.selected_text}"</div>
                      )}
                      {a.note_text && (
                        <div style={{ fontSize: '13px', color: '#0E2D6E' }}>{a.note_text}</div>
                      )}
                    </Link>
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', background: '#F8F7F5', borderBottom: '1px solid rgba(14,45,110,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#0E2D6E', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{title}</span>
        <span style={{ fontSize: '11px', color: '#888780' }}>{count}</span>
      </div>
      {children}
    </div>
  )
}
