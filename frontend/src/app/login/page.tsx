'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

export default function LoginPage() {
  const router = useRouter()
  const { login: authLogin } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const profile = await authLogin(email, password)

      if (profile.role === 'admin') router.push('/admin')
      else if (profile.role === 'teacher') router.push('/dashboard')
      else router.push('/learn')
    } catch (err: any) {
      setError(err.message || 'Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <nav style={{ padding: '0 2.5rem', height: '64px', display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(26,86,219,0.08)' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
          <div style={{ width: '32px', height: '32px', background: '#1A56DB', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '12px', color: 'white', fontWeight: 500 }}>{'>'}_</div>
          <span style={{ fontWeight: 700, fontSize: '16px', color: '#0E2D6E', letterSpacing: '-0.02em' }}>commit</span>
        </Link>
      </nav>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>

          <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0E2D6E', letterSpacing: '-0.03em', margin: '0 0 0.5rem' }}>welcome back</h1>
            <p style={{ color: '#888780', fontSize: '14px', margin: 0 }}>sign in to your commit account</p>
          </div>

          <div style={{ background: 'white', borderRadius: '14px', padding: '2rem', border: '1px solid rgba(14,45,110,0.08)', boxShadow: '0 4px 24px rgba(14,45,110,0.06)' }}>

            {error && (
              <div style={{ background: '#FEE2E2', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '12px 16px', marginBottom: '1.25rem', fontSize: '14px', color: '#991B1B' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#0E2D6E', marginBottom: '6px' }}>email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="you@school.edu"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: '#FAFAF8', fontFamily: "'DM Sans', sans-serif" }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#0E2D6E', marginBottom: '6px' }}>password</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder="••••••••"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: '#FAFAF8', fontFamily: "'DM Sans', sans-serif" }}
                />
              </div>

              <button
                type="submit" disabled={loading}
                style={{ width: '100%', padding: '12px', background: loading ? '#93C5FD' : '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '15px', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}
              >
                {loading ? 'signing in...' : 'sign in →'}
              </button>
            </form>
          </div>

          <p>are you a teacher? <Link href="/signup">apply for an account</Link></p>
          <p>are you a student? <Link href="/join">join a classroom →</Link></p>

        </div>
      </div>
    </main>
  )
}