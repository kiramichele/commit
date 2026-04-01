'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    // Supabase puts the recovery token in the URL hash
    // The JS client auto-detects it and sets the session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords don\'t match.')
      return
    }

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })
      if (updateError) throw updateError
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'Could not update password.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: '8px',
    border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '14px',
    outline: 'none', boxSizing: 'border-box' as const,
    fontFamily: "'DM Sans', sans-serif", background: '#FAFAF8',
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

          {success ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>&#10003;</div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0E2D6E', margin: '0 0 0.5rem' }}>password updated</h1>
              <p style={{ color: '#888780', fontSize: '14px', margin: '0 0 2rem' }}>you can now sign in with your new password</p>
              <button
                onClick={() => router.push('/login')}
                style={{ width: '100%', padding: '12px', background: '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '15px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
              >
                sign in
              </button>
            </div>
          ) : !sessionReady ? (
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0E2D6E', margin: '0 0 0.5rem' }}>reset your password</h1>
              <p style={{ color: '#888780', fontSize: '14px', margin: 0 }}>verifying your reset link...</p>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0E2D6E', letterSpacing: '-0.03em', margin: '0 0 0.5rem' }}>set a new password</h1>
                <p style={{ color: '#888780', fontSize: '14px', margin: 0 }}>choose a new password for your account</p>
              </div>

              <div style={{ background: 'white', borderRadius: '14px', padding: '2rem', border: '1px solid rgba(14,45,110,0.08)', boxShadow: '0 4px 24px rgba(14,45,110,0.06)' }}>
                {error && (
                  <div style={{ background: '#FEE2E2', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '12px 16px', marginBottom: '1.25rem', fontSize: '14px', color: '#991B1B' }}>
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#0E2D6E', marginBottom: '6px' }}>new password</label>
                    <input
                      type="password" value={password} onChange={e => setPassword(e.target.value)} required
                      placeholder="at least 8 characters"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#0E2D6E', marginBottom: '6px' }}>confirm password</label>
                    <input
                      type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required
                      placeholder="same password again"
                      style={inputStyle}
                    />
                  </div>
                  <button
                    type="submit" disabled={loading}
                    style={{ width: '100%', padding: '12px', background: loading ? '#93C5FD' : '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '15px', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                  >
                    {loading ? 'updating...' : 'update password'}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
