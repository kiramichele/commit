'use client'
import { useState, useRef } from 'react'
import { api } from '@/lib/api'

interface Props {
  assignmentId: string
  currentHtmlPath: string | null
  onUploaded: () => void
}

export default function InstructionsUpload({ assignmentId, currentHtmlPath, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [removing, setRemoving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.html')) {
      setError('Only .html files are accepted.')
      return
    }

    setUploading(true)
    setError('')
    setSuccess(false)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const token = localStorage.getItem('commit_access_token')
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8888'}/assignments/${assignmentId}/upload-instructions`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Upload failed.')
      }
      setSuccess(true)
      onUploaded()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err.message || 'Upload failed.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    if (!confirm('Remove HTML instructions? The plain text summary will still show.')) return
    setRemoving(true)
    try {
      await api.delete(`/assignments/${assignmentId}/upload-instructions`)
      onUploaded()
    } catch (e) {
      console.error(e)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div style={{ marginTop: '1rem', padding: '1rem', background: '#F8F7F5', borderRadius: '10px', border: '1px solid rgba(14,45,110,0.08)' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: '#0E2D6E', marginBottom: '8px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        rich HTML instructions
      </div>

      {currentHtmlPath ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#DCFCE7', borderRadius: '7px', border: '1px solid rgba(34,197,94,0.25)' }}>
            <span style={{ fontSize: '13px' }}>✓</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>HTML uploaded</span>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            style={{ padding: '6px 14px', background: '#EBF1FD', color: '#0C447C', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
          >
            {uploading ? 'replacing...' : 'replace file'}
          </button>
          <button
            onClick={handleRemove}
            disabled={removing}
            style={{ padding: '6px 14px', background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
          >
            {removing ? 'removing...' : 'remove'}
          </button>
        </div>
      ) : (
        <div>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'white', border: '1.5px dashed rgba(14,45,110,0.2)', borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: '#5F5E5A', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
          >
            <span style={{ fontSize: '16px' }}>📄</span>
            {uploading ? 'uploading...' : 'upload instructions.html'}
          </button>
          <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#888780' }}>
            renders like a lesson — use the same HTML format as your lesson files
          </p>
        </div>
      )}

      {success && (
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#166534', fontWeight: 600 }}>✓ uploaded successfully!</p>
      )}
      {error && (
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#991B1B' }}>{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".html"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
    </div>
  )
}