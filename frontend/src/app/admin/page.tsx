'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

type Tab = 'applications' | 'classrooms'
type Filter = 'pending' | 'approved' | 'rejected' | 'all'

interface Application {
  id: string
  display_name: string
  email: string
  school_name: string
  state: string
  application_notes: string
  approval_status: string
  created_at: string
}

interface Stats {
  teachers: { total: number; pending: number; approved: number }
  students: { total: number }
  classrooms: { total: number }
  submissions: { total: number }
  commits: { total: number }
}

interface Classroom {
  id: string
  name: string
  join_code: string
  created_at: string
  profiles: { display_name: string; email: string; school_name: string }
}

interface StudentProgress {
  student_id: string
  student_name: string
  assignments_total: number
  assignments_submitted: number
  assignments_late: number
  open_help_request: boolean
  last_commit_at: string | null
}

interface Assignment {
  id: string
  title: string
  due_date: string | null
  min_commits: number
  scaffold_level: string
}

export default function AdminPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>('applications')
  const [filter, setFilter] = useState<Filter>('pending')
  const [applications, setApplications] = useState<Application[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [peeking, setPeeking] = useState<Classroom | null>(null)
  const [peekStudents, setPeekStudents] = useState<StudentProgress[]>([])
  const [peekAssignments, setPeekAssignments] = useState<Assignment[]>([])
  const [peekLoading, setPeekLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    if (loading) return
    if (!profile || profile.role !== 'admin') router.push('/login')
}, [profile, loading])

  useEffect(() => {
    if (!profile || profile.role !== 'admin') return
    fetchStats()
    if (tab === 'applications') fetchApplications()
    if (tab === 'classrooms') fetchClassrooms()
  }, [profile, tab, filter])

  const fetchStats = async () => {
    try { setStats(await api.get<Stats>('/admin/stats')) } catch {}
  }

  const fetchApplications = async () => {
    setDataLoading(true)
    try {
      setApplications(await api.get<Application[]>(`/admin/applications${filter !== 'all' ? `?status=${filter}` : ''}`))
    } catch {} finally { setDataLoading(false) }
  }

  const fetchClassrooms = async () => {
    setDataLoading(true)
    try {
      setClassrooms(await api.get<Classroom[]>('/admin/classrooms'))
    } catch {} finally { setDataLoading(false) }
  }

  const handleAction = async (id: string, action: 'approved' | 'rejected') => {
    setActionLoading(id)
    try {
      await api.patch(`/admin/applications/${id}`, { action })
      setApplications(prev => prev.filter(a => a.id !== id))
      fetchStats()
    } catch {} finally { setActionLoading(null) }
  }

  const peekClassroom = async (c: Classroom) => {
    setPeeking(c)
    setPeekLoading(true)
    try {
      const [students, assignments] = await Promise.all([
        api.get<StudentProgress[]>(`/admin/classrooms/${c.id}/students`),
        api.get<Assignment[]>(`/admin/classrooms/${c.id}/assignments`),
      ])
      setPeekStudents(students)
      setPeekAssignments(assignments)
    } catch {} finally { setPeekLoading(false) }
  }

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const timeAgo = (iso: string | null) => {
    if (!iso) return 'never'
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <p style={{ color: '#888780' }}>loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* TOPBAR */}
      <div style={{ background: '#0E2D6E', padding: '0 2rem', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '28px', height: '28px', background: '#1A56DB', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'white' }}>{'>'}_</div>
          <span style={{ color: 'white', fontWeight: 700, fontSize: '15px', letterSpacing: '-0.02em' }}>commit</span>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>/</span>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>admin</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <a href="/dashboard" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>teacher view →</a>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>{profile.email}</span>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem' }}>

        {/* STATS */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {[
              { label: 'pending applications', value: stats.teachers.pending, warn: stats.teachers.pending > 0 },
              { label: 'approved teachers', value: stats.teachers.approved },
              { label: 'students', value: stats.students.total },
              { label: 'active classrooms', value: stats.classrooms.total },
              { label: 'total commits', value: stats.commits.total },
            ].map((s, i) => (
              <div key={i} style={{ background: 'white', borderRadius: '12px', padding: '1.25rem', border: `1px solid ${s.warn ? 'rgba(245,158,11,0.3)' : 'rgba(14,45,110,0.08)'}` }}>
                <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#888780', marginBottom: '8px' }}>{s.label}</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: s.warn ? '#854D0E' : '#0E2D6E', letterSpacing: '-0.03em' }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* TABS */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '1.5rem', background: 'white', padding: '4px', borderRadius: '10px', border: '1px solid rgba(14,45,110,0.08)', width: 'fit-content' }}>
          {(['applications', 'classrooms'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 20px', borderRadius: '7px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", background: tab === t ? '#1A56DB' : 'transparent', color: tab === t ? 'white' : '#5F5E5A', transition: 'all 0.15s' }}>
              {t}
            </button>
          ))}
        </div>

        {/* ── APPLICATIONS TAB ── */}
        {tab === 'applications' && (
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(14,45,110,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0E2D6E' }}>teacher applications</h2>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['pending', 'approved', 'rejected', 'all'] as Filter[]).map(f => (
                  <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', borderRadius: '99px', fontSize: '13px', fontWeight: 500, border: '1.5px solid', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", background: filter === f ? '#1A56DB' : 'transparent', borderColor: filter === f ? '#1A56DB' : 'rgba(14,45,110,0.15)', color: filter === f ? 'white' : '#5F5E5A' }}>{f}</button>
                ))}
              </div>
            </div>

            {dataLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#888780', fontSize: '14px' }}>loading...</div>
            ) : applications.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✓</div>
                <p style={{ color: '#888780', fontSize: '14px', margin: 0 }}>{filter === 'pending' ? "no pending applications — you're all caught up!" : `no ${filter} applications.`}</p>
              </div>
            ) : (
              applications.map((app, i) => (
                <div key={app.id} style={{ padding: '1.25rem 1.5rem', borderBottom: i < applications.length - 1 ? '1px solid rgba(14,45,110,0.06)' : 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px', color: '#0E2D6E' }}>{app.display_name}</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 10px', borderRadius: '99px', background: app.approval_status === 'pending' ? '#FEF9C3' : app.approval_status === 'approved' ? '#DCFCE7' : '#FEE2E2', color: app.approval_status === 'pending' ? '#854D0E' : app.approval_status === 'approved' ? '#166534' : '#991B1B' }}>{app.approval_status}</span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#5F5E5A', marginBottom: '2px' }}>{app.email}</div>
                    <div style={{ fontSize: '13px', color: '#888780' }}>{app.school_name} · {app.state} · applied {formatDate(app.created_at)}</div>
                    {app.application_notes && (
                      <div style={{ marginTop: '8px', padding: '10px 12px', background: '#F8F7F5', borderRadius: '8px', fontSize: '13px', color: '#5F5E5A', lineHeight: 1.6, borderLeft: '3px solid #EBF1FD' }}>{app.application_notes}</div>
                    )}
                  </div>
                  {app.approval_status === 'pending' && (
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button onClick={() => handleAction(app.id, 'rejected')} disabled={actionLoading === app.id} style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: '1.5px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#991B1B', fontFamily: "'DM Sans', sans-serif" }}>reject</button>
                      <button onClick={() => handleAction(app.id, 'approved')} disabled={actionLoading === app.id} style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: 'none', background: '#1A56DB', color: 'white', fontFamily: "'DM Sans', sans-serif" }}>{actionLoading === app.id ? '...' : 'approve'}</button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── CLASSROOMS TAB ── */}
        {tab === 'classrooms' && (
          <div style={{ display: 'grid', gridTemplateColumns: peeking ? '1fr 1fr' : '1fr', gap: '1.5rem', alignItems: 'start' }}>

            {/* CLASSROOM LIST */}
            <div style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(14,45,110,0.06)' }}>
                <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0E2D6E' }}>all classrooms ({classrooms.length})</h2>
              </div>
              {dataLoading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#888780', fontSize: '14px' }}>loading...</div>
              ) : classrooms.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#888780', fontSize: '14px' }}>no classrooms yet</div>
              ) : (
                classrooms.map((c, i) => (
                  <div key={c.id} onClick={() => peekClassroom(c)} style={{ padding: '1rem 1.5rem', borderBottom: i < classrooms.length - 1 ? '1px solid rgba(14,45,110,0.05)' : 'none', cursor: 'pointer', background: peeking?.id === c.id ? '#EBF1FD' : 'transparent', transition: 'background 0.1s' }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#0E2D6E', marginBottom: '3px' }}>{c.name}</div>
                    <div style={{ fontSize: '12px', color: '#888780' }}>{c.profiles?.display_name} · {c.profiles?.school_name}</div>
                    <div style={{ fontSize: '12px', color: '#888780', marginTop: '2px' }}>created {formatDate(c.created_at)} · code: <span style={{ fontFamily: "'DM Mono', monospace", color: '#1A56DB' }}>{c.join_code}</span></div>
                  </div>
                ))
              )}
            </div>

            {/* PEEK PANEL */}
            {peeking && (
              <div style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(14,45,110,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <h2 style={{ margin: '0 0 2px', fontSize: '15px', fontWeight: 700, color: '#0E2D6E' }}>{peeking.name}</h2>
                    <p style={{ margin: 0, fontSize: '12px', color: '#888780' }}>{peeking.profiles?.display_name} · {peeking.profiles?.email}</p>
                  </div>
                  <button onClick={() => setPeeking(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#888780', lineHeight: 1 }}>×</button>
                </div>

                {peekLoading ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#888780', fontSize: '14px' }}>loading...</div>
                ) : (
                  <div>
                    {/* STUDENTS */}
                    <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(14,45,110,0.06)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#888780', marginBottom: '10px' }}>students ({peekStudents.length})</div>
                      {peekStudents.length === 0 ? (
                        <p style={{ fontSize: '13px', color: '#888780', margin: 0 }}>no students yet</p>
                      ) : (
                        peekStudents.map(s => (
                          <div key={s.student_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(14,45,110,0.04)' }}>
                            <div>
                              <span style={{ fontSize: '13px', fontWeight: 500, color: '#0E2D6E' }}>{s.student_name}</span>
                              {s.open_help_request && <span style={{ marginLeft: '8px', fontSize: '11px', background: '#FEF9C3', color: '#854D0E', padding: '1px 8px', borderRadius: '99px', fontWeight: 600 }}>help</span>}
                            </div>
                            <div style={{ fontSize: '12px', color: '#888780' }}>{s.assignments_submitted}/{s.assignments_total} · {timeAgo(s.last_commit_at)}</div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* ASSIGNMENTS */}
                    <div style={{ padding: '1rem 1.5rem' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#888780', marginBottom: '10px' }}>assignments ({peekAssignments.length})</div>
                      {peekAssignments.length === 0 ? (
                        <p style={{ fontSize: '13px', color: '#888780', margin: 0 }}>no assignments yet</p>
                      ) : (
                        peekAssignments.map(a => (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(14,45,110,0.04)' }}>
                            <span style={{ fontSize: '13px', fontWeight: 500, color: '#0E2D6E' }}>{a.title}</span>
                            <span style={{ fontSize: '12px', color: '#888780' }}>{a.due_date ? formatDate(a.due_date) : 'no due date'}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
