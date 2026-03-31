'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

interface Classroom {
  classroom_id: string
  classrooms: {
    id: string
    name: string
    description: string
    join_code: string
    teacher_id: string
  }
}

interface Assignment {
  id: string
  title: string
  due_date: string | null
  min_commits: number
  scaffold_level: string
  classroom_id: string
  classroom_name: string
  submitted: boolean
  commit_count: number
  is_late: boolean
}

export default function LearnPage() {
  const { profile, loading, logout } = useAuth()
  const router = useRouter()
  const [classrooms, setClassrooms] = useState<any[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
  if (loading) return
  if (!profile) router.push('/login')
  if (profile?.role === 'teacher') router.push('/dashboard')
  if (profile?.role === 'admin') router.push('/admin')
}, [profile, loading])

  useEffect(() => {
    if (!profile || profile.role !== 'student') return
    api.get<any[]>('/classrooms/')
      .then(data => setClassrooms(data || []))
      .catch(console.error)
      .finally(() => setDataLoading(false))
  }, [profile])

  const handleLogout = () => { logout(); router.push('/') }

  const formatDue = (iso: string | null) => {
    if (!iso) return null
    const d = new Date(iso)
    const now = new Date()
    const diff = d.getTime() - now.getTime()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    if (diff < 0) return { label: 'overdue', color: '#991B1B', bg: '#FEE2E2' }
    if (days === 0) return { label: 'due today', color: '#854D0E', bg: '#FEF9C3' }
    if (days === 1) return { label: 'due tomorrow', color: '#854D0E', bg: '#FEF9C3' }
    return { label: `due in ${days}d`, color: '#5F5E5A', bg: '#F1EFE8' }
  }

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <p style={{ color: '#888780' }}>loading...</p>
    </div>
  )

  const allClassrooms = classrooms.map(c => c.classrooms || c).filter(Boolean)

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* NAV */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 2rem', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', background: '#1A56DB', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'white' }}>{'>'}_</div>
          <span style={{ fontWeight: 700, fontSize: '15px', color: '#0E2D6E', letterSpacing: '-0.02em' }}>commit</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '14px', color: '#5F5E5A' }}>hey, {profile.display_name.split(' ')[0]} 👋</span>
          <button onClick={handleLogout} style={{ fontSize: '13px', color: '#888780', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>sign out</button>
        </div>
      </nav>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2.5rem 2rem' }}>

        {dataLoading ? (
          <p style={{ color: '#888780', fontSize: '14px' }}>loading your classrooms...</p>
        ) : allClassrooms.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>◎</div>
            <h3 style={{ margin: '0 0 0.5rem', color: '#0E2D6E', fontWeight: 600 }}>no classrooms yet</h3>
            <p style={{ margin: 0, color: '#888780', fontSize: '14px' }}>your teacher will share a join code with you</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {allClassrooms.map(c => (
              <Link key={c.id} href={`/learn/${c.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.5rem', transition: 'border-color 0.15s, box-shadow 0.15s', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0E2D6E' }}>{c.name}</h2>
                    <span style={{ fontSize: '12px', color: '#1A56DB', fontWeight: 600 }}>open →</span>
                  </div>
                  {c.description && <p style={{ margin: 0, fontSize: '13px', color: '#888780' }}>{c.description}</p>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
