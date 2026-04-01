'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

export default function SettingsPage() {
  const { profile, loading, logout } = useAuth()
  const router = useRouter()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords don\'t match.')
      return
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from your current password.')
      return
    }

    setSaving(true)
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setError(err.message || 'Could not change password. Make sure your current password is correct.')
    } finally {
      setSaving(false)
    }
  }

  const homeLink = profile?.role === 'student'
    ? '/learn'
    : profile?.role === 'teacher'
    ? '/dashboard'
    : '/admin'

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

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <p style={{ color: '#888780' }}>loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* NAV */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 2rem', height: '56px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link href={homeLink} style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <div style={{ width: '28px', height: '28px', background: '#1A56DB', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'white' }}>{'>'}_</div>
          <span style={{ fontWeight: 700, fontSize: '15px', color: '#0E2D6E', letterSpacing: '-0.02em' }}>commit</span>
        </Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        <span style={{ fontSize: '14px', color: '#5F5E5A', fontWeight: 500 }}>settings</span>
      </nav>

      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '2.5rem 2rem' }}>

        {/* PROFILE INFO */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.5rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#EBF1FD', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
              {profile.display_name?.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px', color: '#0E2D6E' }}>{profile.display_name}</div>
            <div style={{ fontSize: '13px', color: '#888780' }}>{profile.email}</div>
            <div style={{ fontSize: '11px', fontWeight: 600, padding: '1px 8px', borderRadius: '99px', background: '#EBF1FD', color: '#0C447C', display: 'inline-block', marginTop: '4px' }}>{profile.role}</div>
          </div>
        </div>

        {/* PASSWORD CHANGE */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.5rem' }}>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '15px', fontWeight: 700, color: '#0E2D6E' }}>change password</h2>
          <p style={{ margin: '0 0 1.5rem', fontSize: '13px', color: '#888780' }}>
            {profile.role === 'student' ? 'update the temporary password your teacher set for you' : 'update your account password'}
          </p>

          {success && (
            <div style={{ background: '#DCFCE7', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', padding: '12px 16px', marginBottom: '1.25rem', fontSize: '14px', color: '#166534', fontWeight: 500 }}>
              ✓ password changed successfully!
            </div>
          )}

          {error && (
            <div style={{ background: '#FEE2E2', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '12px 16px', marginBottom: '1.25rem', fontSize: '14px', color: '#991B1B' }}>
              {error}
            </div>
          )}

          <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>current password</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="your current password"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>new password</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="at least 8 characters"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>confirm new password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="same password again"
                style={inputStyle}
              />
            </div>

            {/* PASSWORD STRENGTH INDICATOR */}
            {newPassword.length > 0 && (
              <div>
                <div style={{ height: '4px', background: '#EBF1FD', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: newPassword.length < 8 ? '25%' : newPassword.length < 12 ? '60%' : '100%',
                    background: newPassword.length < 8 ? '#EF4444' : newPassword.length < 12 ? '#F59E0B' : '#22C55E',
                    borderRadius: '99px',
                    transition: 'all 0.3s',
                  }} />
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: newPassword.length < 8 ? '#991B1B' : newPassword.length < 12 ? '#854D0E' : '#166534' }}>
                  {newPassword.length < 8 ? 'too short' : newPassword.length < 12 ? 'good' : 'strong'}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              style={{ width: '100%', padding: '12px', background: saving ? '#93C5FD' : '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '14px', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif", marginTop: '0.25rem' }}
            >
              {saving ? 'saving...' : 'update password'}
            </button>
          </form>
        </div>

        {/* SIGN OUT */}
        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          <button
            onClick={() => { logout(); router.push('/') }}
            style={{ fontSize: '13px', color: '#888780', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
          >
            sign out
          </button>
        </div>

      </div>
    </div>
  )
}