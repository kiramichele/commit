'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

interface ProfileData {
  id: string
  role: string
  display_name: string
  email: string
  school_name: string | null
  state: string | null
  avatar_url: string | null
  current_streak: number | null
  longest_streak: number | null
  last_activity_date: string | null
  created_at: string
}

interface ClassroomSummary {
  id: string
  name: string
  teacher_name: string | null
  weighted_average: number | null
  graded_count: number
  per_type_averages: Record<string, number>
}

interface ProfileResponse {
  profile: ProfileData
  classrooms: ClassroomSummary[]
}

const TYPE_LABELS: Record<string, string> = {
  code: 'coding',
  activity: 'activity',
  checkin: 'check-in',
  quiz: 'quiz',
  project: 'project',
}

export default function StudentProfilePage() {
  const { profile: viewer, loading } = useAuth()
  const router = useRouter()
  const params = useParams<{ student_id: string }>()

  const [data, setData] = useState<ProfileResponse | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [error, setError] = useState('')

  // Edit state (only enabled when viewing your own profile)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editAvatar, setEditAvatar] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const isSelf = viewer?.profile_id === params.student_id

  useEffect(() => {
    if (loading) return
    if (!viewer) router.push('/login')
  }, [viewer, loading, router])

  useEffect(() => {
    if (!viewer) return
    load()
  }, [viewer, params.student_id])

  const load = async () => {
    setPageLoading(true)
    setError('')
    try {
      const d = await api.get<ProfileResponse>(`/students/${params.student_id}/profile`)
      setData(d)
      setEditName(d.profile.display_name)
      setEditAvatar(d.profile.avatar_url)
    } catch (err: any) {
      setError(err.message || 'Could not load profile')
    } finally {
      setPageLoading(false)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8888'
      const token = typeof window !== 'undefined' ? localStorage.getItem('commit_access_token') : null
      const resp = await fetch(`${apiUrl}/classrooms/upload-avatar`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      })
      const result = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(result.detail || `Upload failed: ${resp.status}`)
      setEditAvatar(result.url)
    } catch (err: any) {
      alert(err.message || 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const saveEdits = async () => {
    if (!editName.trim()) {
      alert('Display name cannot be empty')
      return
    }
    setSaving(true)
    try {
      await api.patch('/students/me', {
        display_name: editName,
        avatar_url: editAvatar,
      })
      setEditing(false)
      load()
    } catch (err: any) {
      alert(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const cancelEdits = () => {
    if (!data) return
    setEditName(data.profile.display_name)
    setEditAvatar(data.profile.avatar_url)
    setEditing(false)
  }

  if (loading || !viewer) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ color: '#888780' }}>loading...</p>
    </div>
  )

  const card: React.CSSProperties = { background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden' }
  const btn = (primary: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    border: primary ? 'none' : '1.5px solid rgba(14,45,110,0.15)',
    background: primary ? '#1A56DB' : 'transparent',
    color: primary ? 'white' : '#5F5E5A',
    fontFamily: "'DM Sans', sans-serif",
  })

  const initials = (data?.profile.display_name || '?').split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase()

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 1.5rem', height: '56px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Link href={viewer.role === 'student' ? '/learn' : viewer.role === 'teacher' ? '/dashboard' : '/admin'} style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <div style={{ width: '28px', height: '28px', background: '#1A56DB', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'white' }}>{'>'}_</div>
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#0E2D6E' }}>commit</span>
        </Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        <span style={{ fontSize: '13px', color: '#0E2D6E', fontWeight: 500 }}>{isSelf ? 'my profile' : 'student profile'}</span>
      </nav>

      {pageLoading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: '#888780' }}>loading profile...</div>
      ) : error ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: '#991B1B' }}>{error}</div>
      ) : !data ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: '#888780' }}>profile not found</div>
      ) : (
        <div style={{ maxWidth: '880px', margin: '0 auto', padding: '2rem' }}>

          {/* HEADER */}
          <div style={{ ...card, padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                {(editing ? editAvatar : data.profile.avatar_url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={(editing ? editAvatar : data.profile.avatar_url) as string} alt={data.profile.display_name} style={{ width: '88px', height: '88px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #EBF1FD' }} />
                ) : (
                  <div style={{ width: '88px', height: '88px', borderRadius: '50%', background: '#EBF1FD', color: '#0C447C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 700, border: '3px solid #EBF1FD' }}>
                    {initials}
                  </div>
                )}
                {editing && (
                  <label style={{ position: 'absolute', bottom: '-4px', right: '-4px', width: '32px', height: '32px', borderRadius: '50%', background: '#1A56DB', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '14px', fontWeight: 700, border: '2px solid white' }} title="upload new avatar">
                    {uploading ? '⋯' : '📷'}
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
                  </label>
                )}
              </div>

              <div style={{ flex: 1, minWidth: '200px' }}>
                {editing ? (
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '20px', fontWeight: 700, color: '#0E2D6E', outline: 'none', background: '#FAFAF8', fontFamily: "'DM Sans', sans-serif", marginBottom: '6px' }}
                  />
                ) : (
                  <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#0E2D6E', letterSpacing: '-0.02em' }}>
                    {data.profile.display_name}
                  </h1>
                )}
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#5F5E5A' }}>{data.profile.email}</p>
                <div style={{ marginTop: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{data.profile.role}</span>
                  {data.profile.school_name && (
                    <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '99px', background: '#F1EFE8', color: '#5F5E5A' }}>{data.profile.school_name}{data.profile.state ? `, ${data.profile.state}` : ''}</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {isSelf && !editing && (
                  <button onClick={() => setEditing(true)} style={btn(false)}>edit profile</button>
                )}
                {isSelf && editing && (
                  <>
                    <button onClick={cancelEdits} style={btn(false)}>cancel</button>
                    <button onClick={saveEdits} disabled={saving} style={btn(true)}>{saving ? 'saving...' : 'save'}</button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* STATS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ ...card, padding: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#888780', marginBottom: '8px' }}>current streak</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#0E2D6E', fontFamily: "'DM Mono', monospace" }}>{data.profile.current_streak || 0}<span style={{ fontSize: '1rem', color: '#888780', marginLeft: '4px' }}>days</span></div>
            </div>
            <div style={{ ...card, padding: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#888780', marginBottom: '8px' }}>longest streak</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#0E2D6E', fontFamily: "'DM Mono', monospace" }}>{data.profile.longest_streak || 0}<span style={{ fontSize: '1rem', color: '#888780', marginLeft: '4px' }}>days</span></div>
            </div>
            <div style={{ ...card, padding: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#888780', marginBottom: '8px' }}>last active</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0E2D6E' }}>
                {data.profile.last_activity_date ? new Date(data.profile.last_activity_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </div>
            </div>
            <div style={{ ...card, padding: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#888780', marginBottom: '8px' }}>joined</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0E2D6E' }}>
                {new Date(data.profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </div>
            </div>
          </div>

          {/* CLASSROOMS + GRADES */}
          <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0E2D6E', letterSpacing: '0.02em' }}>classrooms & grades</h2>
            <span style={{ fontSize: '11px', color: '#888780' }}>weighted averages per classroom</span>
          </div>

          {data.classrooms.length === 0 ? (
            <div style={{ ...card, padding: '2.5rem', textAlign: 'center', color: '#888780', fontSize: '14px' }}>
              {data.profile.role === 'student' ? 'not in any classrooms yet' : 'this profile doesn’t belong to any visible classrooms'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {data.classrooms.map(c => (
                <div key={c.id} style={{ ...card, padding: '1.25rem 1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0E2D6E' }}>{c.name}</h3>
                      {c.teacher_name && <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#888780' }}>taught by {c.teacher_name}</p>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.06em' }}>weighted avg</div>
                      <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#0E2D6E', fontFamily: "'DM Mono', monospace" }}>
                        {c.weighted_average != null ? c.weighted_average : '—'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#888780' }}>based on {c.graded_count} graded</div>
                    </div>
                  </div>
                  {Object.keys(c.per_type_averages).length > 0 && (
                    <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                      {Object.entries(c.per_type_averages).map(([t, v]) => (
                        <div key={t} style={{ padding: '8px 12px', borderRadius: '8px', background: '#FAFAF8', border: '1px solid rgba(14,45,110,0.06)' }}>
                          <div style={{ fontSize: '10px', fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>{TYPE_LABELS[t] || t}</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0E2D6E', fontFamily: "'DM Mono', monospace" }}>{v.toFixed(1)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
