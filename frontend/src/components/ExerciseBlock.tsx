'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '@/lib/api'

// ── TYPES ────────────────────────────────────────────────────

export interface Exercise {
  type: 'coding' | 'free_response' | 'multiple_choice' | 'short_answer'
  // coding fields
  instructions?: string
  starter_code?: string
  min_commits?: number
  // free_response / short_answer fields
  prompt?: string
  min_words?: number
  max_words?: number
  // multiple_choice fields
  question?: string
  choices?: string[]
  correct?: string
}

interface SavedResponse {
  exercise_index: number
  exercise_type: string
  response_text?: string
  selected_choice?: string
  is_correct?: boolean
  word_count?: number
}

interface Props {
  exercise: Exercise
  exerciseIndex: number
  lessonId: string
  onRunCode?: (code: string) => void
  output?: string
  outputError?: boolean
  running?: boolean
}

// ── MAIN COMPONENT ───────────────────────────────────────────

export default function ExerciseBlock({
  exercise, exerciseIndex, lessonId, onRunCode, output, outputError, running
}: Props) {
  const [savedResponse, setSavedResponse] = useState<SavedResponse | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api.get<SavedResponse[]>(`/exercises/lesson/${lessonId}/my`)
      .then(data => {
        const mine = (data || []).find(r => r.exercise_index === exerciseIndex)
        if (mine) setSavedResponse(mine)
      })
      .catch(() => null)
      .finally(() => setLoaded(true))
  }, [lessonId, exerciseIndex])

  if (!loaded) return (
    <div style={{ padding: '1.5rem', background: '#F8F7F5', borderRadius: '10px', fontSize: '13px', color: '#888780' }}>
      loading...
    </div>
  )

  if (exercise.type === 'coding') {
    return (
      <CodingExercise
        exercise={exercise}
        exerciseIndex={exerciseIndex}
        lessonId={lessonId}
        onRunCode={onRunCode}
        output={output}
        outputError={outputError}
        running={running}
      />
    )
  }

  if (exercise.type === 'free_response') {
    return (
      <FreeResponseExercise
        exercise={exercise}
        exerciseIndex={exerciseIndex}
        lessonId={lessonId}
        initialResponse={savedResponse?.response_text || ''}
      />
    )
  }

  if (exercise.type === 'multiple_choice') {
    return (
      <MultipleChoiceExercise
        exercise={exercise}
        exerciseIndex={exerciseIndex}
        lessonId={lessonId}
        initialChoice={savedResponse?.selected_choice || null}
        initialCorrect={savedResponse?.is_correct}
      />
    )
  }

  return null
}

// ── CODING EXERCISE ──────────────────────────────────────────

function CodingExercise({ exercise, onRunCode, output, outputError, running }: Props) {
  const [code, setCode] = useState(exercise.starter_code || '')

  const handleTab = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const el = e.currentTarget
      const start = el.selectionStart
      const newCode = code.substring(0, start) + '    ' + code.substring(start)
      setCode(newCode)
      setTimeout(() => { el.selectionStart = el.selectionEnd = start + 4 }, 0)
    }
  }

  return (
    <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(14,45,110,0.08)' }}>
      {exercise.instructions && (
        <div style={{ padding: '1rem 1.25rem', background: '#242426', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '6px' }}>instructions</div>
          <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.8)', lineHeight: 1.7 }}>{exercise.instructions}</p>
        </div>
      )}

      <div style={{ position: 'relative', background: '#1C1C1E' }}>
        <div style={{ position: 'absolute', top: '10px', right: '1rem', zIndex: 10 }}>
          <button
            onClick={() => onRunCode?.(code)}
            disabled={running}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 16px', background: running ? '#166534' : '#22C55E', color: 'white', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}
          >
            {running ? '◌ running...' : '▶ run'}
          </button>
        </div>
        <textarea
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={handleTab}
          spellCheck={false}
          style={{ width: '100%', minHeight: '200px', background: '#1C1C1E', color: '#EBF1FD', fontFamily: "'DM Mono', monospace", fontSize: '14px', lineHeight: 1.8, padding: '1.5rem', border: 'none', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>

      {output !== undefined && (
        <div style={{ background: '#111113', borderTop: '1px solid rgba(255,255,255,0.06)', minHeight: '80px' }}>
          <div style={{ padding: '6px 1rem', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>output</div>
          <pre style={{ margin: 0, padding: '10px 1rem', fontFamily: "'DM Mono', monospace", fontSize: '13px', color: outputError ? '#F09595' : '#22C55E', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {output || <span style={{ color: 'rgba(255,255,255,0.2)' }}>run your code to see output</span>}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── FREE RESPONSE EXERCISE ───────────────────────────────────

function FreeResponseExercise({ exercise, exerciseIndex, lessonId, initialResponse }: {
  exercise: Exercise
  exerciseIndex: number
  lessonId: string
  initialResponse: string
}) {
  const [text, setText] = useState(initialResponse)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimer = useRef<NodeJS.Timeout | null>(null)

  const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length
  const minWords = exercise.min_words || 0
  const maxWords = exercise.max_words || 0
  const isTooShort = minWords > 0 && wordCount < minWords
  const isTooLong = maxWords > 0 && wordCount > maxWords

  const save = useCallback(async (value: string) => {
    setSaveStatus('saving')
    try {
      await api.post('/exercises/save', {
        lesson_id: lessonId,
        exercise_index: exerciseIndex,
        exercise_type: 'free_response',
        response_text: value,
        word_count: value.trim() === '' ? 0 : value.trim().split(/\s+/).length,
      })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('idle')
    }
  }, [lessonId, exerciseIndex])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setText(val)
    // Auto-save after 1.5 seconds of no typing
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(val), 1500)
  }

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  return (
    <div style={{ borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden', background: 'white' }}>
      {/* PROMPT */}
      <div style={{ padding: '1rem 1.25rem', background: '#EBF1FD', borderBottom: '1px solid rgba(26,86,219,0.1)' }}>
        <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0C447C', marginBottom: '6px' }}>free response</div>
        <p style={{ margin: 0, fontSize: '14px', color: '#0E2D6E', lineHeight: 1.7, fontWeight: 500 }}>{exercise.prompt}</p>
        {(minWords > 0 || maxWords > 0) && (
          <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#5F5E5A' }}>
            {minWords > 0 && `minimum ${minWords} words`}
            {minWords > 0 && maxWords > 0 && ' · '}
            {maxWords > 0 && `maximum ${maxWords} words`}
          </p>
        )}
      </div>

      {/* TEXT AREA */}
      <div style={{ position: 'relative' }}>
        <textarea
          value={text}
          onChange={handleChange}
          placeholder="Write your response here..."
          rows={6}
          style={{ width: '100%', padding: '1rem 1.25rem', border: 'none', outline: 'none', resize: 'vertical', fontSize: '14px', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.8, color: '#333', boxSizing: 'border-box', background: 'white' }}
        />
      </div>

      {/* FOOTER */}
      <div style={{ padding: '8px 1.25rem', background: '#F8F7F5', borderTop: '1px solid rgba(14,45,110,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: isTooShort ? '#991B1B' : isTooLong ? '#991B1B' : '#888780', fontWeight: isTooShort || isTooLong ? 600 : 400 }}>
            {wordCount} word{wordCount !== 1 ? 's' : ''}
            {isTooShort && ` — need ${minWords - wordCount} more`}
            {isTooLong && ` — ${wordCount - maxWords} over limit`}
          </span>
          {!isTooShort && !isTooLong && wordCount >= minWords && wordCount > 0 && (
            <span style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>✓ good length</span>
          )}
        </div>
        <span style={{ fontSize: '11px', color: saveStatus === 'saved' ? '#166534' : '#888780', fontWeight: saveStatus === 'saved' ? 600 : 400 }}>
          {saveStatus === 'saving' ? 'saving...' : saveStatus === 'saved' ? '✓ saved' : text ? 'auto-saves as you type' : ''}
        </span>
      </div>
    </div>
  )
}

// ── MULTIPLE CHOICE EXERCISE ─────────────────────────────────

function MultipleChoiceExercise({ exercise, exerciseIndex, lessonId, initialChoice, initialCorrect }: {
  exercise: Exercise
  exerciseIndex: number
  lessonId: string
  initialChoice: string | null
  initialCorrect?: boolean
}) {
  const [selected, setSelected] = useState<string | null>(initialChoice)
  const [revealed, setRevealed] = useState(!!initialChoice)
  const [saving, setSaving] = useState(false)

  const handleSelect = async (choice: string) => {
    if (revealed) return  // Don't allow changing after reveal
    setSelected(choice)
    setRevealed(true)
    setSaving(true)

    const isCorrect = choice === exercise.correct
    try {
      await api.post('/exercises/save', {
        lesson_id: lessonId,
        exercise_index: exerciseIndex,
        exercise_type: 'multiple_choice',
        selected_choice: choice,
        is_correct: isCorrect,
      })
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const getChoiceStyle = (choice: string) => {
    if (!revealed) {
      return {
        bg: 'white', border: 'rgba(14,45,110,0.12)',
        color: '#0E2D6E', cursor: 'pointer',
      }
    }
    if (choice === exercise.correct) {
      return { bg: '#DCFCE7', border: 'rgba(34,197,94,0.4)', color: '#166534', cursor: 'default' }
    }
    if (choice === selected && choice !== exercise.correct) {
      return { bg: '#FEE2E2', border: 'rgba(239,68,68,0.4)', color: '#991B1B', cursor: 'default' }
    }
    return { bg: '#F8F7F5', border: 'rgba(14,45,110,0.08)', color: '#888780', cursor: 'default' }
  }

  return (
    <div style={{ borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden', background: 'white' }}>
      {/* QUESTION */}
      <div style={{ padding: '1rem 1.25rem', background: '#F8F7F5', borderBottom: '1px solid rgba(14,45,110,0.06)' }}>
        <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888780', marginBottom: '6px' }}>multiple choice</div>
        <p style={{ margin: 0, fontSize: '14px', color: '#0E2D6E', lineHeight: 1.7, fontWeight: 500 }}>{exercise.question}</p>
      </div>

      {/* CHOICES */}
      <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {(exercise.choices || []).map((choice, i) => {
          const s = getChoiceStyle(choice)
          const isSelected = selected === choice
          const isCorrect = choice === exercise.correct
          const isWrong = revealed && isSelected && !isCorrect

          return (
            <div
              key={i}
              onClick={() => handleSelect(choice)}
              style={{ padding: '10px 14px', borderRadius: '8px', background: s.bg, border: `1.5px solid ${s.border}`, color: s.color, cursor: s.cursor, fontSize: '14px', fontWeight: revealed && (isCorrect || isSelected) ? 600 : 400, display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.15s', userSelect: 'none' }}
            >
              <span style={{ width: '20px', height: '20px', borderRadius: '50%', border: `2px solid ${s.border}`, background: isSelected || (revealed && isCorrect) ? s.border : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'white' }}>
                {revealed && isCorrect ? '✓' : revealed && isWrong ? '✗' : ''}
              </span>
              {choice}
            </div>
          )
        })}
      </div>

      {/* RESULT */}
      {revealed && (
        <div style={{ padding: '10px 1.25rem', borderTop: '1px solid rgba(14,45,110,0.06)', background: selected === exercise.correct ? '#DCFCE7' : '#FEE2E2' }}>
          <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: selected === exercise.correct ? '#166534' : '#991B1B' }}>
            {selected === exercise.correct
              ? '✓ correct!'
              : `✗ not quite — the correct answer is: ${exercise.correct}`
            }
          </p>
        </div>
      )}
    </div>
  )
}