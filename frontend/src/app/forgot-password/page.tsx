'use client'
import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email })
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
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

          {submitted ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>&#9993;</div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0E2D6E', margin: '0 0 0.5rem' }}>check your email</h1>
              <p style={{ color: '#888780', fontSize: '14px', margin: '0 0 2rem', lineHeight: 1.6 }}>
                if an account exists for <strong style={{ color: '#0E2D6E' }}>{email}</strong>, we&apos;ve sent a link to reset your password. it may take a minute to arrive.
              </p>
              <Link
                href="/login"
                style={{ display: 'inline-block', padding: '12px 28px', background: '#1A56DB', color: 'white', borderRadius: '8px', fontWeight: 600, fontSize: '15px', textDecoration: 'none' }}
              >
                back to sign in
              </Link>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0E2D6E', letterSpacing: '-0.03em', margin: '0 0 0.5rem' }}>forgot your password?</h1>
                <p style={{ color: '#888780', fontSize: '14px', margin: 0 }}>enter your email and we&apos;ll send you a reset link</p>
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

                  <button
                    type="submit" disabled={loading}
                    style={{ width: '100%', padding: '12px', background: loading ? '#93C5FD' : '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '15px', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                  >
                    {loading ? 'sending...' : 'send reset link →'}
                  </button>
                </form>
              </div>

              <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '14px', color: '#888780' }}>
                remembered it? <Link href="/login" style={{ color: '#1A56DB', textDecoration: 'none', fontWeight: 500 }}>back to sign in</Link>
              </p>
            </>
          )}

        </div>
      </div>
    </main>
  )
}
