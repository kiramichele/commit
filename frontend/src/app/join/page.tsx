'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, saveSession } from '@/lib/api'

type Step = 'code' | 'details' | 'welcome'

interface ClassroomPreview {
  id: string
  name: string
  teacher_name: string
  student_count: number
}

export default function JoinPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('code')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1
  const [joinCode, setJoinCode] = useState('')
  const [classroom, setClassroom] = useState<ClassroomPreview | null>(null)

  // Step 2
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  // Step 3
  const [studentName, setStudentName] = useState('')

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api.get<ClassroomPreview>(
        `/classrooms/preview/${joinCode.trim().toUpperCase()}`
      )
      setClassroom(data)
      setStep('details')
    } catch (err: any) {
      setError('That join code doesn\'t look right. Check with your teacher and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setError('Photo must be under 5MB.')
      return
    }
    setPhoto(file)
    const reader = new FileReader()
    reader.onload = () => setPhotoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords don\'t match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      const data = await api.post<{
        access_token: string
        refresh_token: string
        profile: { display_name: string; role: string }
      }>('/classrooms/join', {
        join_code: joinCode.trim().toUpperCase(),
        display_name: displayName.trim(),
        email: email.trim().toLowerCase(),
        password,
      })

      saveSession(data.access_token, data.refresh_token)
      setStudentName(data.profile.display_name)
      setStep('welcome')
    } catch (err: any) {
      setError(err.message || 'Could not create your account. That email may already be in use.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '11px 14px', borderRadius: '8px',
    border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '14px',
    outline: 'none', boxSizing: 'border-box' as const,
    fontFamily: "'DM Sans', sans-serif", background: '#FAFAF8',
  }

  const labelStyle = {
    display: 'block' as const, fontSize: '13px',
    fontWeight: 500 as const, color: '#0E2D6E', marginBottom: '6px',
  }

  return (
    <main style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* NAV */}
      <nav style={{ padding: '0 2.5rem', height: '64px', display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(26,86,219,0.08)' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
          <div style={{ width: '32px', height: '32px', background: '#1A56DB', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '12px', color: 'white', fontWeight: 500 }}>{'>'}_</div>
          <span style={{ fontWeight: 700, fontSize: '16px', color: '#0E2D6E', letterSpacing: '-0.02em' }}>commit</span>
        </Link>
      </nav>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: '440px' }}>

          {/* ── STEP 1: ENTER JOIN CODE ── */}
          {step === 'code' && (
            <>
              <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🎒</div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0E2D6E', letterSpacing: '-0.03em', margin: '0 0 0.5rem' }}>join a classroom</h1>
                <p style={{ color: '#888780', fontSize: '14px', margin: 0 }}>enter the join code your teacher gave you</p>
              </div>

              <div style={{ background: 'white', borderRadius: '14px', padding: '2rem', border: '1px solid rgba(14,45,110,0.08)', boxShadow: '0 4px 24px rgba(14,45,110,0.06)' }}>
                {error && (
                  <div style={{ background: '#FEE2E2', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '12px 16px', marginBottom: '1.25rem', fontSize: '14px', color: '#991B1B' }}>
                    {error}
                  </div>
                )}

                <form onSubmit={handleCodeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div>
                    <label style={labelStyle}>join code</label>
                    <input
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      required
                      maxLength={6}
                      placeholder="e.g. 6G28SX"
                      style={{
                        ...inputStyle,
                        fontFamily: "'DM Mono', monospace",
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        letterSpacing: '0.2em',
                        textAlign: 'center',
                        color: '#0E2D6E',
                        textTransform: 'uppercase',
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || joinCode.length < 4}
                    style={{ width: '100%', padding: '12px', background: loading || joinCode.length < 4 ? '#93C5FD' : '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '15px', cursor: loading || joinCode.length < 4 ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                  >
                    {loading ? 'checking...' : 'continue →'}
                  </button>
                </form>
              </div>

              <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '14px', color: '#888780' }}>
                already have an account?{' '}
                <Link href="/login" style={{ color: '#1A56DB', fontWeight: 500, textDecoration: 'none' }}>sign in</Link>
              </p>
            </>
          )}

          {/* ── STEP 2: ACCOUNT DETAILS ── */}
          {step === 'details' && classroom && (
            <>
              <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#EBF1FD', padding: '8px 16px', borderRadius: '99px', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '16px' }}>✓</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#0C447C' }}>joining {classroom.name}</span>
                </div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0E2D6E', letterSpacing: '-0.03em', margin: '0 0 0.5rem' }}>create your account</h1>
                <p style={{ color: '#888780', fontSize: '14px', margin: 0 }}>set up your profile to get started</p>
              </div>

              <div style={{ background: 'white', borderRadius: '14px', padding: '2rem', border: '1px solid rgba(14,45,110,0.08)', boxShadow: '0 4px 24px rgba(14,45,110,0.06)' }}>
                {error && (
                  <div style={{ background: '#FEE2E2', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '12px 16px', marginBottom: '1.25rem', fontSize: '14px', color: '#991B1B' }}>
                    {error}
                  </div>
                )}

                {/* PHOTO UPLOAD */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <div
                    onClick={() => fileRef.current?.click()}
                    style={{ width: '80px', height: '80px', borderRadius: '50%', background: photoPreview ? 'transparent' : '#EBF1FD', border: `2px dashed ${photoPreview ? 'transparent' : 'rgba(26,86,219,0.3)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: '8px', transition: 'all 0.15s' }}
                  >
                    {photoPreview ? (
                      <img src={photoPreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: '1.5rem' }}>📷</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    style={{ fontSize: '12px', color: '#1A56DB', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, fontFamily: "'DM Sans', sans-serif" }}
                  >
                    {photoPreview ? 'change photo' : 'add profile photo (optional)'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />
                </div>

                <form onSubmit={handleDetailsSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={labelStyle}>your name</label>
                    <input required value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Alex Johnson" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>email</label>
                    <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="alex@school.edu" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>password</label>
                    <input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="at least 8 characters" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>confirm password</label>
                    <input required type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="same password again" style={inputStyle} />
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '0.25rem' }}>
                    <button
                      type="button"
                      onClick={() => { setStep('code'); setError('') }}
                      style={{ flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid rgba(14,45,110,0.15)', background: 'transparent', color: '#5F5E5A', fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                    >
                      ← back
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      style={{ flex: 2, padding: '11px', background: loading ? '#93C5FD' : '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                    >
                      {loading ? 'creating account...' : 'join classroom →'}
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}

          {/* ── STEP 3: WELCOME ── */}
          {step === 'welcome' && classroom && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3.5rem', marginBottom: '1rem', animation: 'bounceIn 0.5s ease' }}>🎉</div>
              <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#0E2D6E', letterSpacing: '-0.03em', margin: '0 0 0.75rem' }}>
                welcome, {studentName.split(' ')[0]}!
              </h1>
              <p style={{ color: '#5F5E5A', fontSize: '15px', margin: '0 0 2rem', lineHeight: 1.7 }}>
                you've joined <strong style={{ color: '#0E2D6E' }}>{classroom.name}</strong>.<br />
                your teacher can see you're here. time to code!
              </p>

              <div style={{ background: 'white', borderRadius: '14px', padding: '1.5rem', border: '1px solid rgba(14,45,110,0.08)', marginBottom: '1.5rem', textAlign: 'left' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780', marginBottom: '12px' }}>what you can do in commit</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    ['⌨', 'Write and run Python code in your browser'],
                    ['◎', 'Save versions of your work with commit messages'],
                    ['📄', 'Read lessons and complete interactive activities'],
                    ['✋', 'Raise your hand when you need help'],
                  ].map(([icon, text]) => (
                    <div key={text as string} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '18px', width: '24px', textAlign: 'center', flexShrink: 0 }}>{icon}</span>
                      <span style={{ fontSize: '13px', color: '#5F5E5A' }}>{text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => router.push('/learn')}
                style={{ width: '100%', padding: '14px', background: '#1A56DB', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '16px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", letterSpacing: '-0.01em' }}
              >
                let's go →
              </button>

              <style>{`
                @keyframes bounceIn {
                  0% { transform: scale(0.5); opacity: 0; }
                  70% { transform: scale(1.1); }
                  100% { transform: scale(1); opacity: 1; }
                }
              `}</style>
            </div>
          )}

        </div>
      </div>
    </main>
  )
}