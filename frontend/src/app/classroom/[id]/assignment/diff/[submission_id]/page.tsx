'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import DiffViewer from '@/components/DiffViewer'

interface Commit {
  id: string
  message: string
  line_count: number
  committed_at: string
  code_snapshot?: string
}

export default function DiffPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const classroomId = params.id as string
  const assignmentId = params.assignment_id as string
  const submissionId = params.submission_id as string

  const [commits, setCommits] = useState<Commit[]>([])
  const [selectedA, setSelectedA] = useState<Commit | null>(null)
  const [selectedB, setSelectedB] = useState<Commit | null>(null)
  const [codeA, setCodeA] = useState<string | null>(null)
  const [codeB, setCodeB] = useState<string | null>(null)
  const [loadingCode, setLoadingCode] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [selectingFor, setSelectingFor] = useState<'A' | 'B' | null>('A')

  useEffect(() => {
    if (loading) return
    if (!profile) router.push('/login')
  }, [profile, loading])

  useEffect(() => {
    if (!profile || !submissionId) return
    api.get<Commit[]>(`/code/${submissionId}/commits`)
      .then(data => {
        setCommits(data || [])
        // Auto-select first and last commits
        if (data && data.length >= 2) {
          setSelectedA(data[0])
          setSelectedB(data[data.length - 1])
        } else if (data && data.length === 1) {
          setSelectedA(data[0])
        }
      })
      .catch(console.error)
      .finally(() => setDataLoading(false))
  }, [profile, submissionId])

  useEffect(() => {
    if (!selectedA || !selectedB) return
    loadCodes()
  }, [selectedA, selectedB])

  const loadCodes = async () => {
    if (!selectedA || !selectedB) return
    setLoadingCode(true)
    try {
      const [a, b] = await Promise.all([
        api.get<{ code_snapshot: string }>(`/code/${submissionId}/commits/${selectedA.id}/code`),
        api.get<{ code_snapshot: string }>(`/code/${submissionId}/commits/${selectedB.id}/code`),
      ])
      setCodeA(a.code_snapshot)
      setCodeB(b.code_snapshot)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingCode(false)
    }
  }

  const handleSelectCommit = (commit: Commit) => {
    if (selectingFor === 'A') {
      setSelectedA(commit)
      setSelectingFor('B')
    } else {
      setSelectedB(commit)
      setSelectingFor(null)
    }
  }

  const formatTime = (iso: string) => new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  })

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', background: '#1C1C1E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#888780', fontFamily: "'DM Sans', sans-serif" }}>loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#1C1C1E', fontFamily: "'DM Sans', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* TOPBAR */}
      <nav style={{ background: '#2A2A2C', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 1.5rem', height: '52px', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <Link href={`/classroom/${classroomId}/assignment/${assignmentId}`} style={{ display: 'flex', alignItems: 'center', gap: '7px', textDecoration: 'none' }}>
          <div style={{ width: '26px', height: '26px', background: '#1A56DB', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'white' }}>{'>'}_</div>
        </Link>
        <span style={{ color: 'rgba(255,255,255,0.3)' }}>/</span>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>compare versions</span>
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
          {commits.length} commits total
        </div>
      </nav>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: 0 }}>

        {/* LEFT — COMMIT LIST */}
        <div style={{ background: '#242426', borderRight: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* SELECTION GUIDE */}
          <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '10px' }}>
              compare versions
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div
                onClick={() => setSelectingFor('A')}
                style={{ padding: '8px 10px', borderRadius: '7px', border: `1px solid ${selectingFor === 'A' ? '#1A56DB' : 'rgba(255,255,255,0.1)'}`, cursor: 'pointer', background: selectingFor === 'A' ? 'rgba(26,86,219,0.15)' : 'transparent' }}
              >
                <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: selectingFor === 'A' ? '#1A56DB' : 'rgba(255,255,255,0.3)', marginBottom: '2px' }}>version A</div>
                <div style={{ fontSize: '12px', color: selectedA ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedA ? selectedA.message : 'click to select'}
                </div>
              </div>
              <div style={{ textAlign: 'center', fontSize: '14px', color: 'rgba(255,255,255,0.2)' }}>↓</div>
              <div
                onClick={() => setSelectingFor('B')}
                style={{ padding: '8px 10px', borderRadius: '7px', border: `1px solid ${selectingFor === 'B' ? '#22C55E' : 'rgba(255,255,255,0.1)'}`, cursor: 'pointer', background: selectingFor === 'B' ? 'rgba(34,197,94,0.1)' : 'transparent' }}
              >
                <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: selectingFor === 'B' ? '#22C55E' : 'rgba(255,255,255,0.3)', marginBottom: '2px' }}>version B</div>
                <div style={{ fontSize: '12px', color: selectedB ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedB ? selectedB.message : 'click to select'}
                </div>
              </div>
            </div>
          </div>

          {/* COMMIT LIST */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {dataLoading ? (
              <div style={{ padding: '1rem', color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>loading...</div>
            ) : commits.length === 0 ? (
              <div style={{ padding: '1rem', color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>no commits yet</div>
            ) : (
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '22px', top: '12px', bottom: '12px', width: '1.5px', background: 'rgba(26,86,219,0.3)' }} />
                {commits.map((commit, i) => {
                  const isA = selectedA?.id === commit.id
                  const isB = selectedB?.id === commit.id
                  const isSelected = isA || isB
                  return (
                    <div
                      key={commit.id}
                      onClick={() => handleSelectCommit(commit)}
                      style={{
                        display: 'flex', gap: '10px', padding: '10px 1rem',
                        cursor: 'pointer', position: 'relative',
                        background: isA ? 'rgba(26,86,219,0.15)' : isB ? 'rgba(34,197,94,0.1)' : 'transparent',
                        borderLeft: isA ? '3px solid #1A56DB' : isB ? '3px solid #22C55E' : '3px solid transparent',
                        transition: 'background 0.1s',
                      }}
                    >
                      <div style={{
                        width: '14px', height: '14px', borderRadius: '50%', flexShrink: 0, marginTop: '3px', zIndex: 1, position: 'relative',
                        background: isA ? '#1A56DB' : isB ? '#22C55E' : '#2A2A2C',
                        border: `2px solid ${isA ? '#1A56DB' : isB ? '#22C55E' : 'rgba(26,86,219,0.5)'}`,
                        boxShadow: isSelected ? `0 0 0 3px ${isA ? 'rgba(26,86,219,0.2)' : 'rgba(34,197,94,0.2)'}` : 'none',
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: isSelected ? 600 : 400, color: isSelected ? 'white' : 'rgba(255,255,255,0.7)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {commit.message}
                          {isA && <span style={{ marginLeft: '6px', fontSize: '10px', background: '#1A56DB', color: 'white', padding: '1px 5px', borderRadius: '3px' }}>A</span>}
                          {isB && <span style={{ marginLeft: '6px', fontSize: '10px', background: '#22C55E', color: 'white', padding: '1px 5px', borderRadius: '3px' }}>B</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Mono', monospace" }}>
                          {commit.line_count}L · {formatTime(commit.committed_at)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* INSTRUCTIONS */}
          <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '11px', color: 'rgba(255,255,255,0.25)', lineHeight: 1.6 }}>
            click a version label above, then click a commit to select it. green lines were added, red lines were removed.
          </div>
        </div>

        {/* RIGHT — DIFF VIEW */}
        <div style={{ background: '#1C1C1E', overflowY: 'auto' }}>
          {!selectedA || !selectedB ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', padding: '3rem' }}>
              <div style={{ fontSize: '2rem', opacity: 0.3 }}>◎</div>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '14px', textAlign: 'center', margin: 0 }}>
                select two versions from the left to compare them
              </p>
            </div>
          ) : loadingCode ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>loading diff...</p>
            </div>
          ) : codeA !== null && codeB !== null ? (
            <DiffViewer
              oldCode={codeA}
              newCode={codeB}
              oldLabel={selectedA.message}
              newLabel={selectedB.message}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}