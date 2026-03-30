'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']

export default function SignupPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '', display_name: '', school_name: '', state: '', application_notes: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirmPassword) { setError('Passwords do not match.'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    try {
      await api.post('/auth/teacher/signup', {
        email: form.email,
        password: form.password,
        display_name: form.display_name,
        school_name: form.school_name,
        state: form.state,
        application_notes: form.application_notes,
      })
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: '8px',
    border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '14px',
    outline: 'none', boxSizing: 'border-box' as const,
    background: '#FAFAF8', fontFamily: "'DM Sans', sans-serif",
  }

  const labelStyle = { display: 'block' as const, fontSize: '13px', fontWeight: 500 as const, color: '#0E2D6E', marginBottom: '6px' }

  if (submitted) return (
    <main style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <div style={{ textAlign: 'center', maxWidth: '480px' }}>
        <div style={{ width: '64px', height: '64px', background: '#DCFCE7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', fontSize: '28px' }}>✓</div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0E2D6E', letterSpacing: '-0.03em', margin: '0 0 1rem' }}>application submitted!</h1>
        <p style={{ color: '#5F5E5A', lineHeight: 1.7, marginBottom: '2rem' }}>
          Thanks for applying to Commit. We'll review your application and send you an email at <strong>{form.email}</strong> when your account is approved — usually within 1–2 business days.
        </p>
        <Link href="/login" style={{ display: 'inline-block', background: '#1A56DB', color: 'white', textDecoration: 'none', padding: '12px 28px', borderRadius: '8px', fontWeight: 600, fontSize: '15px' }}>
          back to sign in
        </Link>
      </div>
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* NAV */}
      <nav style={{ padding: '0 2.5rem', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(26,86,219,0.08)', background: 'rgba(248,247,245,0.95)' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
          <div style={{ width: '32px', height: '32px', background: '#1A56DB', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '12px', color: 'white', fontWeight: 500 }}>{'>'}_</div>
          <span style={{ fontWeight: 700, fontSize: '16px', color: '#0E2D6E', letterSpacing: '-0.02em' }}>commit</span>
        </Link>
        <Link href="/login" style={{ fontSize: '14px', color: '#5F5E5A', textDecoration: 'none', fontWeight: 500 }}>already have an account? sign in</Link>
      </nav>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 64px)' }}>

        {/* LEFT PANEL */}
        <div style={{ display: 'none', flex: '0 0 380px', background: '#0E2D6E', padding: '3rem', flexDirection: 'column', justifyContent: 'center' }} className="signup-left">
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '28px', color: '#1A56DB', marginBottom: '1.5rem' }}>{'>'}_</div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'white', letterSpacing: '-0.03em', lineHeight: 1.2, margin: '0 0 1rem' }}>free for your<br />whole classroom.</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', lineHeight: 1.7, marginBottom: '2rem' }}>Commit is free for teachers and students. No credit card required. Apply for your account and we'll review it within 1–2 business days.</p>
          {['Full AP CSP curriculum included', 'Python editor with version control', 'Up to 3 classrooms, 45 students each', 'Upgrade anytime for unlimited access'].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ width: '20px', height: '20px', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: '#22C55E', fontSize: '11px' }}>✓</span>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px' }}>{item}</span>
            </div>
          ))}
        </div>

        {/* FORM */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '3rem 2rem', overflowY: 'auto' }}>
          <div style={{ width: '100%', maxWidth: '480px' }}>
            <div style={{ marginBottom: '2rem' }}>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0E2D6E', letterSpacing: '-0.03em', margin: '0 0 0.5rem' }}>apply as a teacher</h1>
              <p style={{ color: '#888780', fontSize: '14px', margin: 0 }}>free account · reviewed within 1–2 business days</p>
            </div>

            <div style={{ background: 'white', borderRadius: '14px', padding: '2rem', border: '1px solid rgba(14,45,110,0.08)', boxShadow: '0 4px 24px rgba(14,45,110,0.06)' }}>

              {error && (
                <div style={{ background: '#FEE2E2', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '12px 16px', marginBottom: '1.25rem', fontSize: '14px', color: '#991B1B' }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                <div>
                  <label style={labelStyle}>full name</label>
                  <input type="text" value={form.display_name} onChange={set('display_name')} required placeholder="Ms. Shinn" style={inputStyle} />
                </div>

                <div>
                  <label style={labelStyle}>email address</label>
                  <input type="email" value={form.email} onChange={set('email')} required placeholder="you@school.edu" style={inputStyle} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={labelStyle}>school name</label>
                    <input type="text" value={form.school_name} onChange={set('school_name')} required placeholder="Lincoln High School" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>state</label>
                    <select value={form.state} onChange={set('state')} required style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="">select...</option>
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ height: '1px', background: 'rgba(14,45,110,0.06)' }} />

                <div>
                  <label style={labelStyle}>password</label>
                  <input type="password" value={form.password} onChange={set('password')} required minLength={8} placeholder="at least 8 characters" style={inputStyle} />
                </div>

                <div>
                  <label style={labelStyle}>confirm password</label>
                  <input type="password" value={form.confirmPassword} onChange={set('confirmPassword')} required placeholder="same as above" style={inputStyle} />
                </div>

                <div style={{ height: '1px', background: 'rgba(14,45,110,0.06)' }} />

                <div>
                  <label style={labelStyle}>
                    anything you'd like us to know? <span style={{ color: '#888780', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <textarea
                    value={form.application_notes} onChange={set('application_notes')}
                    placeholder="e.g. I teach AP CSP at a Title I school and am looking for a free alternative to ProjectStem..."
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.6 }}
                  />
                </div>

                <button
                  type="submit" disabled={loading}
                  style={{ width: '100%', padding: '13px', background: loading ? '#93C5FD' : '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '15px', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                >
                  {loading ? 'submitting...' : 'submit application →'}
                </button>

                <p style={{ fontSize: '12px', color: '#888780', textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
                  By applying you agree to our terms of service and privacy policy. Student data is FERPA compliant and never shared with advertisers.
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
