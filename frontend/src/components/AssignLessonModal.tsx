'use client'
import { useState } from 'react'
import { api } from '@/lib/api'

interface Classroom {
  id: string
  name: string
}

interface Lesson {
  id: string
  title: string
  lesson_content: {
    activity_file_path: string | null
    has_coding_exercise: boolean
    exercises?: any[]
  } | null
}

interface Props {
  lesson: Lesson
  classrooms: Classroom[]
  selectedClassroomId: string
  onClose: () => void
  onAssigned: () => void
}

type AssignmentType = 'lesson' | 'activity' | 'exercises' | 'full'

const TYPE_OPTIONS: { id: AssignmentType; label: string; desc: string; emoji: string }[] = [
  { id: 'lesson',    label: 'Read the lesson',   desc: 'Students read the HTML lesson content',          emoji: '📖' },
  { id: 'activity',  label: 'Complete activity',  desc: 'Students complete the interactive activity',    emoji: '◈' },
  { id: 'exercises', label: 'Do the exercises',   desc: 'Students complete coding + written exercises',  emoji: '✏️' },
  { id: 'full',      label: 'All of the above',   desc: 'Lesson + activity + exercises',                 emoji: '📚' },
]

export default function AssignLessonModal({ lesson, classrooms, selectedClassroomId, onClose, onAssigned }: Props) {
  const [classroomId, setClassroomId] = useState(selectedClassroomId || classrooms[0]?.id || '')
  const [type, setType] = useState<AssignmentType>('activity')
  const [isGraded, setIsGraded] = useState(true)
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const hasActivity = !!lesson.lesson_content?.activity_file_path
  const hasExercises = !!(lesson.lesson_content?.exercises?.length || lesson.lesson_content?.has_coding_exercise)

  const availableTypes = TYPE_OPTIONS.filter(t => {
    if (t.id === 'activity' && !hasActivity) return false
    if (t.id === 'exercises' && !hasExercises) return false
    if (t.id === 'full' && (!hasActivity || !hasExercises)) return false
    return true
  })

  const handleAssign = async () => {
    if (!classroomId) { setError('Please select a classroom.'); return }
    setSaving(true)
    setError('')
    try {
      const typeLabel = TYPE_OPTIONS.find(t => t.id === type)?.label || type
      await api.post('/assignments/', {
        classroom_id: classroomId,
        lesson_id: lesson.id,
        assignment_type: type,
        title: `${lesson.title} — ${typeLabel}`,
        instructions: `Complete the ${typeLabel.toLowerCase()} for "${lesson.title}".`,
        is_graded: isGraded,
        due_date: dueDate || null,
        min_commits: 0,
        scaffold_level: 'typed_python',
      })
      onAssigned()
      onClose()
    } catch (e: any) {
      setError(e.message || 'Could not create assignment.')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: '8px',
    border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '14px',
    outline: 'none', fontFamily: "'DM Sans', sans-serif",
    background: 'white', boxSizing: 'border-box' as const,
  }

  return (
    <>
      {/* BACKDROP */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(14,45,110,0.15)', backdropFilter: 'blur(4px)', zIndex: 100 }}
      />

      {/* MODAL */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'white', borderRadius: '16px',
        boxShadow: '0 24px 64px rgba(14,45,110,0.18)',
        width: '100%', maxWidth: '520px',
        zIndex: 101, overflow: 'hidden',
        maxHeight: '90vh', overflowY: 'auto',
      }}>

        {/* HEADER */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(14,45,110,0.08)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780', marginBottom: '4px' }}>assign curriculum</div>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0E2D6E' }}>{lesson.title}</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#888780', cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>

        {/* BODY */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* CLASSROOM */}
          {classrooms.length > 1 && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#0E2D6E', marginBottom: '6px' }}>classroom</label>
              <select
                value={classroomId}
                onChange={e => setClassroomId(e.target.value)}
                style={{ ...inputStyle }}
              >
                {classrooms.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* WHAT TO ASSIGN */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#0E2D6E', marginBottom: '8px' }}>what to assign</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {availableTypes.map(t => (
                <div
                  key={t.id}
                  onClick={() => setType(t.id)}
                  style={{
                    padding: '10px 14px', borderRadius: '8px', cursor: 'pointer',
                    border: `1.5px solid ${type === t.id ? 'rgba(26,86,219,0.4)' : 'rgba(14,45,110,0.1)'}`,
                    background: type === t.id ? '#EBF1FD' : '#F8F7F5',
                    display: 'flex', alignItems: 'center', gap: '10px',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: '18px', flexShrink: 0 }}>{t.emoji}</span>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: type === t.id ? '#0E2D6E' : '#5F5E5A' }}>{t.label}</div>
                    <div style={{ fontSize: '11px', color: '#888780' }}>{t.desc}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${type === t.id ? '#1A56DB' : '#D3D1C7'}`, background: type === t.id ? '#1A56DB' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {type === t.id && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'white' }} />}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* GRADED TOGGLE */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#F8F7F5', borderRadius: '8px', border: '1px solid rgba(14,45,110,0.08)' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0E2D6E' }}>graded assignment</div>
              <div style={{ fontSize: '11px', color: '#888780' }}>appears in gradebook and student grades view</div>
            </div>
            <div
              onClick={() => setIsGraded(g => !g)}
              style={{ width: '40px', height: '22px', borderRadius: '99px', background: isGraded ? '#1A56DB' : '#D3D1C7', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s' }}
            >
              <div style={{ position: 'absolute', top: '3px', left: isGraded ? '21px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
            </div>
          </div>

          {/* DUE DATE */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#0E2D6E', marginBottom: '6px' }}>
              due date <span style={{ fontWeight: 400, color: '#888780' }}>(optional)</span>
            </label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: '#FEE2E2', borderRadius: '8px', fontSize: '13px', color: '#991B1B' }}>
              {error}
            </div>
          )}

          {/* ACTIONS */}
          <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
            <button
              onClick={onClose}
              style={{ flex: 1, padding: '11px', background: '#F1EFE8', color: '#5F5E5A', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
            >
              cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={saving}
              style={{ flex: 2, padding: '11px', background: saving ? '#93C5FD' : '#1A56DB', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}
            >
              {saving ? 'assigning...' : 'assign to students →'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}