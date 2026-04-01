'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import GradingQueue from '@/components/GradingQueue'

interface Classroom {
  id: string
  name: string
  description: string
  join_code: string
  sequential_unlock: boolean
  collab_enabled: boolean
  archived: boolean
  created_at: string
  classroom_members: { count: number }[]
}

export default function DashboardPage() {
  const { profile, loading, logout } = useAuth()
  const router = useRouter()
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !profile) router.push('/login')
  }, [profile, loading])

  useEffect(() => {
    if (!profile) return
    api.get<Classroom[]>('/classrooms/')
      .then(setClassrooms)
      .catch(console.error)
      .finally(() => setDataLoading(false))
  }, [profile])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    setError('')
    try {
      const classroom = await api.post<Classroom>('/classrooms/', {
        name: newName.trim(),
        description: newDesc.trim() || null,
      })
      setClassrooms(prev => [classroom, ...prev])
      setShowNewModal(false)
      setNewName('')
      setNewDesc('')
    } catch (err: any) {
      setError(err.message || 'Could not create classroom.')
    } finally {
      setCreating(false)
    }
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const handleLogout = () => { logout(); router.push('/') }

  const studentCount = (c: Classroom) => c.classroom_members?.[0]?.count ?? 0

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <p style={{ color: '#888780' }}>loading...</p>
    </div>
  )

  const FREE_LIMIT = 3
  const atLimit = classrooms.length >= FREE_LIMIT

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* TOPBAR */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(14,45,110,0.08)',
        padding: '0 2rem', height: '60px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '30px', height: '30px', background: '#1A56DB', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'white', fontWeight: 500 }}>{'>'}_</div>
          <span style={{ fontWeight: 700, fontSize: '16px', color: '#0E2D6E', letterSpacing: '-0.02em' }}>commit</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <Link href="/curriculum" style={{ fontSize: '13px', color: '#5F5E5A', textDecoration: 'none', fontWeight: 500 }}>
            curriculum
          </Link>
          <span style={{ fontSize: '14px', color: '#5F5E5A' }}>hey, {profile.display_name.split(' ')[0]} 👋</span>
          <Link href="/settings" style={{ fontSize: '13px', color: '#5F5E5A', textDecoration: 'none' }}>settings</Link>
          <button onClick={handleLogout} style={{ fontSize: '13px', color: '#888780', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>sign out</button>
        </div>
      </nav>

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2.5rem 2rem' }}>

        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: '1.6rem', fontWeight: 700, color: '#0E2D6E', letterSpacing: '-0.03em' }}>your classrooms</h1>
            <p style={{ margin: 0, fontSize: '14px', color: '#888780' }}>
              {classrooms.length} of {FREE_LIMIT} classrooms used on free tier
            </p>
          </div>
          <button
            onClick={() => { if (!atLimit) setShowNewModal(true) }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
              border: 'none', cursor: atLimit ? 'not-allowed' : 'pointer',
              background: atLimit ? '#D3D1C7' : '#1A56DB',
              color: atLimit ? '#888780' : 'white',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            + new classroom
          </button>
        </div>

        {/* FREE TIER BAR */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ height: '6px', background: '#EBF1FD', borderRadius: '99px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(classrooms.length / FREE_LIMIT) * 100}%`, background: atLimit ? '#EF4444' : '#1A56DB', borderRadius: '99px', transition: 'width 0.3s' }} />
          </div>
          {atLimit && (
            <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#991B1B' }}>
              you've reached the free tier limit. <Link href="/upgrade" style={{ color: '#1A56DB', fontWeight: 500 }}>upgrade to teacher pro</Link> for unlimited classrooms.
            </p>
          )}
        </div>

        <GradingQueue />

        {/* CLASSROOM CARDS */}
        {dataLoading ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: '#888780', fontSize: '14px' }}>loading classrooms...</div>
        ) : classrooms.length === 0 ? (
          <div style={{ padding: '4rem', textAlign: 'center', background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>◎</div>
            <h3 style={{ margin: '0 0 0.5rem', color: '#0E2D6E', fontWeight: 600 }}>no classrooms yet</h3>
            <p style={{ margin: '0 0 1.5rem', color: '#888780', fontSize: '14px' }}>create your first classroom to get started</p>
            <button onClick={() => setShowNewModal(true)} style={{ padding: '10px 24px', background: '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '14px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              + create classroom
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
            {classrooms.map(c => (
              <div key={c.id} style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

                {/* CARD HEADER */}
                <div style={{ padding: '1.25rem 1.25rem 1rem', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0E2D6E', lineHeight: 1.3 }}>{c.name}</h3>
                    <span style={{ flexShrink: 0, fontSize: '12px', fontWeight: 500, color: '#5F5E5A', background: '#F1EFE8', padding: '3px 10px', borderRadius: '99px' }}>
                      {studentCount(c)} students
                    </span>
                  </div>
                  {c.description && (
                    <p style={{ margin: '0 0 1rem', fontSize: '13px', color: '#888780', lineHeight: 1.6 }}>{c.description}</p>
                  )}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {c.sequential_unlock && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C', fontWeight: 500 }}>sequential</span>}
                    {c.collab_enabled && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '99px', background: '#DCFCE7', color: '#166534', fontWeight: 500 }}>collab on</span>}
                  </div>
                </div>

                {/* JOIN CODE */}
                <div style={{ padding: '0.75rem 1.25rem', background: '#F8F7F5', borderTop: '1px solid rgba(14,45,110,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780', marginBottom: '2px' }}>join code</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '16px', fontWeight: 500, color: '#0E2D6E', letterSpacing: '0.08em' }}>{c.join_code}</div>
                  </div>
                  <button onClick={() => copyCode(c.join_code)} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, border: '1px solid rgba(14,45,110,0.15)', background: copiedCode === c.join_code ? '#DCFCE7' : 'white', color: copiedCode === c.join_code ? '#166534' : '#5F5E5A', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s' }}>
                    {copiedCode === c.join_code ? 'copied!' : 'copy'}
                  </button>
                </div>

                {/* ACTIONS */}
                <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid rgba(14,45,110,0.06)', display: 'flex', gap: '8px' }}>
                  <Link href={`/classroom/${c.id}`} style={{ flex: 1, padding: '8px', background: '#1A56DB', color: 'white', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textAlign: 'center', textDecoration: 'none' }}>
                    open classroom
                  </Link>
                  <Link href={`/classroom/${c.id}/gradebook`} style={{ padding: '8px 14px', background: 'transparent', color: '#5F5E5A', borderRadius: '8px', fontSize: '13px', fontWeight: 500, textDecoration: 'none', border: '1px solid rgba(14,45,110,0.12)' }}>
                    gradebook
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* NEW CLASSROOM MODAL */}
      {showNewModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,45,110,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={e => { if (e.target === e.currentTarget) setShowNewModal(false) }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '440px', boxShadow: '0 24px 64px rgba(14,45,110,0.2)' }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem', fontWeight: 700, color: '#0E2D6E' }}>new classroom</h2>
            <p style={{ margin: '0 0 1.5rem', fontSize: '14px', color: '#888780' }}>a join code will be generated automatically</p>

            {error && (
              <div style={{ background: '#FEE2E2', borderRadius: '8px', padding: '10px 14px', marginBottom: '1.25rem', fontSize: '13px', color: '#991B1B' }}>{error}</div>
            )}

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#0E2D6E', marginBottom: '6px' }}>classroom name</label>
                <input
                  autoFocus value={newName} onChange={e => setNewName(e.target.value)} required
                  placeholder="e.g. AP CSP — Period 2"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.15)', fontSize: '14px', outline: 'none', boxSizing: 'border-box', fontFamily: "'DM Sans', sans-serif" }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#0E2D6E', marginBottom: '6px' }}>description <span style={{ color: '#888780', fontWeight: 400 }}>(optional)</span></label>
                <input
                  value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  placeholder="e.g. Fall 2026 · Room 214"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.15)', fontSize: '14px', outline: 'none', boxSizing: 'border-box', fontFamily: "'DM Sans', sans-serif" }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowNewModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid rgba(14,45,110,0.15)', background: 'transparent', color: '#5F5E5A', fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>cancel</button>
                <button type="submit" disabled={creating} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: creating ? '#93C5FD' : '#1A56DB', color: 'white', fontWeight: 600, fontSize: '14px', cursor: creating ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                  {creating ? 'creating...' : 'create classroom'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}