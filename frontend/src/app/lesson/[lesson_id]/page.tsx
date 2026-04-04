'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import ReadAloud from '@/components/ReadAloud'
import ExerciseBlock from '@/components/ExerciseBlock'
import MarkCompleteButton from '@/components/MarkCompleteButton'
import LessonCompleteButton from '@/components/LessonCompleteButton'
import { StandardsBadgeList } from '@/components/Standards'

interface Exercise {
  type: 'coding' | 'free_response' | 'multiple_choice' | 'short_answer'
  instructions?: string
  starter_code?: string
  prompt?: string
  min_words?: number
  max_words?: number
  question?: string
  choices?: string[]
  correct?: string
}

interface Lesson {
  id: string
  title: string
  scaffold_level: string
  order_index: number
  units: { id: string; title: string; order_index: number }
  lesson_content: {
    html_file_path: string | null
    activity_file_path: string | null
    estimated_minutes: number
    has_coding_exercise: boolean
    coding_instructions: string
    coding_starter_code: string
    example_code?: string
    example_explanation?: string
    exercises?: Exercise[]
  } | null
}

type Tab = 'lesson' | 'activity' | 'example' | 'practice' | 'docs'

const PYTHON_DOCS = [
  {
    category: 'Output',
    items: [
      { name: 'print()', syntax: 'print(value)', desc: 'Prints value to the console', example: 'print("Hello!")\nprint(42)' },
      { name: 'print() with sep', syntax: 'print(a, b, sep=",")', desc: 'Print multiple values with separator', example: 'print("a", "b", sep=", ")' },
    ]
  },
  {
    category: 'Variables & Types',
    items: [
      { name: 'String', syntax: 'x = "text"', desc: 'Stores text', example: 'name = "Alex"\ngreeting = \'Hello\'' },
      { name: 'Integer', syntax: 'x = 42', desc: 'Whole number', example: 'age = 17\ncount = 0' },
      { name: 'Float', syntax: 'x = 3.14', desc: 'Decimal number', example: 'gpa = 3.9\nprice = 1.99' },
      { name: 'Boolean', syntax: 'x = True', desc: 'True or False', example: 'is_logged_in = True\ndone = False' },
      { name: 'type()', syntax: 'type(x)', desc: 'Returns the type of a variable', example: 'print(type(42))      # int\nprint(type("hi"))    # str' },
    ]
  },
  {
    category: 'String Operations',
    items: [
      { name: 'Concatenation', syntax: 'a + b', desc: 'Join two strings', example: 'first = "Hello"\nsecond = " World"\nprint(first + second)' },
      { name: 'f-string', syntax: 'f"text {variable}"', desc: 'Embed variable in string', example: 'name = "Alex"\nprint(f"Hello, {name}!")' },
      { name: 'len()', syntax: 'len(string)', desc: 'Length of string', example: 'word = "Python"\nprint(len(word))  # 6' },
      { name: '.upper() / .lower()', syntax: 'str.upper()', desc: 'Change case', example: 'print("hello".upper())  # HELLO' },
      { name: '.split()', syntax: 'str.split(",")', desc: 'Split into list', example: 'words = "a,b,c".split(",")\nprint(words)  # [\'a\', \'b\', \'c\']' },
    ]
  },
  {
    category: 'Input',
    items: [
      { name: 'input()', syntax: 'x = input("prompt")', desc: 'Gets user input as string', example: 'name = input("What is your name? ")\nprint(f"Hello, {name}!")' },
      { name: 'int(input())', syntax: 'x = int(input())', desc: 'Gets numeric input', example: 'age = int(input("Enter age: "))\nprint(age + 1)' },
    ]
  },
  {
    category: 'Conditionals',
    items: [
      { name: 'if / elif / else', syntax: 'if condition:', desc: 'Branches based on condition', example: 'x = 10\nif x > 5:\n    print("big")\nelif x == 5:\n    print("five")\nelse:\n    print("small")' },
      { name: 'Comparison ops', syntax: '== != > < >= <=', desc: 'Compare values', example: 'print(5 == 5)   # True\nprint(3 != 4)   # True\nprint(10 >= 10) # True' },
      { name: 'Logical ops', syntax: 'and, or, not', desc: 'Combine conditions', example: 'x = 7\nif x > 5 and x < 10:\n    print("between 5 and 10")' },
    ]
  },
  {
    category: 'Loops',
    items: [
      { name: 'for loop', syntax: 'for i in range(n):', desc: 'Repeat n times', example: 'for i in range(5):\n    print(i)  # 0 1 2 3 4' },
      { name: 'for in list', syntax: 'for item in list:', desc: 'Loop through items', example: 'fruits = ["apple","banana"]\nfor fruit in fruits:\n    print(fruit)' },
      { name: 'while loop', syntax: 'while condition:', desc: 'Repeat while true', example: 'count = 0\nwhile count < 3:\n    print(count)\n    count += 1' },
      { name: 'break', syntax: 'break', desc: 'Exit the loop early', example: 'for i in range(10):\n    if i == 5:\n        break\n    print(i)' },
      { name: 'continue', syntax: 'continue', desc: 'Skip to next iteration', example: 'for i in range(5):\n    if i == 2:\n        continue\n    print(i)' },
    ]
  },
  {
    category: 'Functions',
    items: [
      { name: 'def', syntax: 'def name(params):', desc: 'Define a function', example: 'def greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("Alex"))' },
      { name: 'return', syntax: 'return value', desc: 'Return a value', example: 'def add(a, b):\n    return a + b\n\nresult = add(3, 4)\nprint(result)  # 7' },
      { name: 'Default params', syntax: 'def f(x=default):', desc: 'Parameter with default', example: 'def greet(name="friend"):\n    print(f"Hi, {name}!")\n\ngreet()         # Hi, friend!\ngreet("Alex")   # Hi, Alex!' },
    ]
  },
  {
    category: 'Lists',
    items: [
      { name: 'Create list', syntax: 'x = [1, 2, 3]', desc: 'Create a list', example: 'nums = [1, 2, 3]\nnames = ["Alice", "Bob"]' },
      { name: 'Indexing', syntax: 'list[0]', desc: 'Access by index (0-based)', example: 'fruits = ["apple","banana","cherry"]\nprint(fruits[0])   # apple\nprint(fruits[-1])  # cherry' },
      { name: '.append()', syntax: 'list.append(x)', desc: 'Add to end', example: 'nums = [1, 2]\nnums.append(3)\nprint(nums)  # [1, 2, 3]' },
      { name: '.remove()', syntax: 'list.remove(x)', desc: 'Remove first match', example: 'nums = [1, 2, 3]\nnums.remove(2)\nprint(nums)  # [1, 3]' },
      { name: 'len()', syntax: 'len(list)', desc: 'Number of items', example: 'nums = [1, 2, 3, 4]\nprint(len(nums))  # 4' },
    ]
  },
]

export default function LessonPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const lessonId = params.lesson_id as string
  const classroomId = params.id as string
  const searchParams = useSearchParams()
  const assignmentId = searchParams.get('assignment_id')

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [lessonUrl, setLessonUrl] = useState<string | null>(null)
  const [lessonHtml, setLessonHtml] = useState<string | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('lesson')
  const [code, setCode] = useState('')
  const [output, setOutput] = useState('')
  const [outputError, setOutputError] = useState(false)
  const [running, setRunning] = useState(false)
  const [docSearch, setDocSearch] = useState('')
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null)
  const [lessonHint, setLessonHint] = useState<string | null>(null)
  const [exerciseOutput, setExerciseOutput] = useState<Record<number, string>>({})
  const [exerciseErrors, setExerciseErrors] = useState<Record<number, boolean>>({})
  const [runningExercise, setRunningExercise] = useState<number | null>(null)

  const handleExerciseRun = async (code: string, exerciseIndex: number) => {
    setRunningExercise(exerciseIndex)
    setExerciseOutput(prev => ({ ...prev, [exerciseIndex]: '' }))
    setExerciseErrors(prev => ({ ...prev, [exerciseIndex]: false }))
    try {
      const result = await api.post<{ output: string; stderr: string }>('/code/run', { code })
      if (result.stderr && !result.output) {
        setExerciseOutput(prev => ({ ...prev, [exerciseIndex]: result.stderr }))
        setExerciseErrors(prev => ({ ...prev, [exerciseIndex]: true }))
      } else {
        setExerciseOutput(prev => ({ ...prev, [exerciseIndex]: result.output || '(no output)' }))
      }
    } catch (e: any) {
      setExerciseOutput(prev => ({ ...prev, [exerciseIndex]: e.message || 'Execution failed.' }))
      setExerciseErrors(prev => ({ ...prev, [exerciseIndex]: true }))
    } finally {
      setRunningExercise(null)
    }
  }

  useEffect(() => {
    if (loading) return
    if (!profile) router.push('/login')
  }, [profile, loading])

  useEffect(() => {
    if (!profile || !lessonId) return
    fetchLesson()
  }, [profile, lessonId])

  useEffect(() => {
    const tab = searchParams.get('tab')
    const search = searchParams.get('search')
    const hint = searchParams.get('hint')

    if (tab) setActiveTab(tab as Tab)
    if (tab === 'docs' && search) {
      setDocSearch(search)
      setTimeout(() => {
        const el = document.querySelector(`[data-docs-key="${search}"]`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          ;(el as HTMLElement).click()
        }
      }, 300)
    }
    if (tab === 'lesson' && hint) {
      setLessonHint(hint)
    }
  }, [searchParams])

  const fetchLesson = async () => {
    setDataLoading(true)
    try {
      const [lessonData, urlData] = await Promise.all([
        api.get<Lesson>(`/curriculum/lessons/${lessonId}`),
        api.get<{ url: string }>(`/curriculum/lessons/${lessonId}/url?file_type=lesson`).catch(() => null),
      ])
      setLesson(lessonData)
      setCode(lessonData.lesson_content?.coding_starter_code || '')
      if (urlData) {
        setLessonUrl(urlData.url)
        fetch(urlData.url).then(r => r.text()).then(setLessonHtml).catch(() => {})
      }

    } catch (e) {
      console.error(e)
    } finally {
      setDataLoading(false)
    }
  }

  const handleRun = async () => {
    setRunning(true)
    setOutput('')
    setOutputError(false)
    try {
      const result = await api.post<{ output: string; stderr: string }>('/code/run', { code })
      if (result.stderr && !result.output) {
        setOutput(result.stderr); setOutputError(true)
      } else {
        setOutput(result.output || '(no output)'); setOutputError(false)
      }
    } catch (e: any) {
      setOutput(e.message || 'Execution failed.'); setOutputError(true)
    } finally {
      setRunning(false)
    }
  }

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

  const filteredDocs = PYTHON_DOCS.map(cat => ({
    ...cat,
    items: cat.items.filter(item =>
      !docSearch ||
      item.name.toLowerCase().includes(docSearch.toLowerCase()) ||
      item.desc.toLowerCase().includes(docSearch.toLowerCase()) ||
      item.syntax.toLowerCase().includes(docSearch.toLowerCase())
    )
  })).filter(cat => cat.items.length > 0)

  const hasActivity = !!lesson?.lesson_content?.activity_file_path
  const hasCoding = !!lesson?.lesson_content?.has_coding_exercise
  const hasExample = !!(lesson?.lesson_content?.example_code)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'lesson', label: '📄 lesson' },
    ...(hasActivity ? [{ id: 'activity' as Tab, label: '⚡ activity' }] : []),
    ...(hasExample ? [{ id: 'example' as Tab, label: '💡 example' }] : []),
    ...(hasCoding ? [{ id: 'practice' as Tab, label: '⌨ practice' }] : []),
    { id: 'docs', label: '📚 python docs' },
  ]

  const tabStyle = (id: Tab) => ({
    padding: '10px 18px',
    fontSize: '13px',
    fontWeight: 600 as const,
    border: 'none',
    borderBottom: `2px solid ${activeTab === id ? '#1A56DB' : 'transparent'}`,
    background: 'transparent',
    color: activeTab === id ? '#1A56DB' : '#888780',
    cursor: 'pointer' as const,
    fontFamily: "'DM Sans', sans-serif",
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  })

  if (loading || !profile) return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ color: '#888780' }}>loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* TOPBAR */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,247,245,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 1.5rem', height: '52px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Link href={classroomId ? `/learn/${classroomId}` : '/learn'} style={{ display: 'flex', alignItems: 'center', gap: '7px', textDecoration: 'none' }}>
          <div style={{ width: '26px', height: '26px', background: '#1A56DB', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'white' }}>{'>'}_</div>
        </Link>
        <span style={{ color: '#D3D1C7' }}>/</span>
        {lesson?.units && <span style={{ fontSize: '12px', color: '#888780' }}>Unit {lesson.units.order_index}</span>}
        <span style={{ color: '#D3D1C7' }}>/</span>
        <span style={{ fontSize: '13px', color: '#0E2D6E', fontWeight: 500 }}>{lesson?.title}</span>
        {(lesson as any)?.standards_tags?.length > 0 && (
          <StandardsBadgeList tags={(lesson as any).standards_tags} max={5} />
        )}
        {lesson?.lesson_content?.estimated_minutes && (
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#888780' }}>~{lesson.lesson_content.estimated_minutes} min</span>
        )}
      </nav>

      {/* TABS */}
      <div style={{ background: 'white', borderBottom: '1px solid rgba(14,45,110,0.08)', padding: '0 1.5rem', display: 'flex', gap: '0', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={tabStyle(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {dataLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#888780', fontSize: '14px' }}>loading lesson...</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* ── LESSON TAB ── */}
          {activeTab === 'lesson' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {lessonHint && (
                <div style={{ padding: '10px 16px', background: '#FEF9C3', borderBottom: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🔍</span>
                    <span style={{ fontSize: '13px', color: '#854D0E', fontWeight: 500 }}>look for content about: <strong>{lessonHint}</strong></span>
                  </div>
                  <button onClick={() => setLessonHint(null)} style={{ background: 'none', border: 'none', color: '#854D0E', cursor: 'pointer', fontSize: '16px' }}>×</button>
                </div>
              )}
              {lessonHtml ? (
                <iframe srcDoc={lessonHtml} style={{ width: '100%', height: '100%', border: 'none', minHeight: 'calc(100vh - 104px)' }} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" title={lesson?.title} />
              ) : (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#888780', fontSize: '14px' }}>
                  {lessonUrl ? 'loading lesson...' : 'no lesson content uploaded yet'}
                </div>
              )}
              {profile?.role === 'student' && lesson && (
                <LessonCompleteButton lessonId={lesson.id} lessonTitle={lesson.title} />
              )}
            </div>
          )}

          {/* ── ACTIVITY TAB ── */}
          {activeTab === 'activity' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '1.5rem' }}>
              {lesson?.lesson_content?.activity_file_path ? (
                <>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>◈</div>
                    <h2 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: '#0E2D6E' }}>
                      {lesson.title} — Activity
                    </h2>
                    <p style={{ margin: 0, fontSize: '14px', color: '#888780', maxWidth: '400px' }}>
                      This activity opens in a focused view so you can work through it step by step.
                    </p>
                  </div>
                  <Link
                    href={`/activity/${lesson.id}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '8px',
                      padding: '14px 28px',
                      background: '#1A56DB', color: 'white',
                      borderRadius: '10px', textDecoration: 'none',
                      fontSize: '15px', fontWeight: 700,
                      boxShadow: '0 4px 16px rgba(26,86,219,0.25)',
                      transition: 'all 0.15s',
                    }}
                  >
                    open activity →
                  </Link>
                  <p style={{ fontSize: '12px', color: '#888780' }}>
                    opens in this tab — use the back button to return to the lesson
                  </p>
                </>
              ) : (
                <p style={{ fontSize: '14px', color: '#888780' }}>no activity for this lesson yet</p>
              )}
              {profile?.role === 'student' && lesson && (
                <LessonCompleteButton lessonId={lesson.id} lessonTitle={lesson.title} />
              )}
            </div>
          )}

          {/* ── EXAMPLE TAB ── */}
          {activeTab === 'example' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#1C1C1E' }}>
              {lesson?.lesson_content?.example_explanation && (
                <div style={{ padding: '1.25rem 1.5rem', background: '#242426', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>example explanation</div>
                    <ReadAloud text={lesson.lesson_content.example_explanation} isPro={false} />
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.7 }}>
                    {lesson.lesson_content.example_explanation}
                  </p>
                </div>
              )}
              <pre style={{ flex: 1, margin: 0, padding: '1.5rem', fontFamily: "'DM Mono', monospace", fontSize: '14px', color: '#EBF1FD', lineHeight: 1.8, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                {lesson?.lesson_content?.example_code || '# no example code provided'}
              </pre>
              <div style={{ padding: '10px 1.5rem', background: '#2A2A2C', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button
                  onClick={() => { setCode(lesson?.lesson_content?.example_code || ''); setActiveTab('practice') }}
                  style={{ padding: '7px 16px', background: '#1A56DB', color: 'white', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                >
                  copy to practice →
                </button>
              </div>
            </div>
          )}

          {/* ── PRACTICE TAB ── */}
          {activeTab === 'practice' && (
            <div style={{ flex: 1, padding: '1.5rem 2rem', maxWidth: '860px', margin: '0 auto', width: '100%' }}>

              {lesson?.lesson_content?.exercises?.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {lesson.lesson_content.exercises.map((exercise, i) => (
                    <div key={i}>
                      {lesson.lesson_content!.exercises!.length > 1 && (
                        <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888780', marginBottom: '8px' }}>
                          exercise {i + 1} of {lesson.lesson_content!.exercises!.length}
                        </div>
                      )}
                      <ExerciseBlock
                        exercise={exercise}
                        exerciseIndex={i}
                        lessonId={lesson.id}
                        onRunCode={(code) => handleExerciseRun(code, i)}
                        output={exerciseOutput[i]}
                        outputError={exerciseErrors[i]}
                        running={runningExercise === i}
                      />
                    </div>
                  ))}
                </div>
              ) : lesson?.lesson_content?.has_coding_exercise ? (
                <div style={{ display: 'flex', flexDirection: 'column', background: '#1C1C1E', borderRadius: '12px', overflow: 'hidden' }}>
                  {lesson.lesson_content.coding_instructions && (
                    <div style={{ padding: '1.25rem 1.5rem', background: '#242426', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>instructions</div>
                        <ReadAloud text={lesson.lesson_content.coding_instructions} isPro={false} />
                      </div>
                      <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.7 }}>
                        {lesson.lesson_content.coding_instructions}
                      </p>
                    </div>
                  )}
                  <div style={{ flex: 1, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '10px', right: '1rem', zIndex: 10 }}>
                      <button onClick={handleRun} disabled={running} style={{ padding: '7px 16px', background: running ? '#166534' : '#22C55E', color: 'white', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                        {running ? '◌ running...' : '▶ run'}
                      </button>
                    </div>
                    <textarea value={code} onChange={e => setCode(e.target.value)} onKeyDown={handleTab} spellCheck={false} style={{ width: '100%', height: '300px', background: '#1C1C1E', color: '#EBF1FD', fontFamily: "'DM Mono', monospace", fontSize: '14px', lineHeight: 1.8, padding: '1.5rem', border: 'none', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ background: '#111113', borderTop: '1px solid rgba(255,255,255,0.06)', minHeight: '120px' }}>
                    <div style={{ padding: '8px 1rem', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>output</div>
                    <pre style={{ margin: 0, padding: '10px 1rem', fontFamily: "'DM Mono', monospace", fontSize: '13px', color: outputError ? '#F09595' : '#22C55E', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {output || <span style={{ color: 'rgba(255,255,255,0.2)' }}>run your code to see output here</span>}
                    </pre>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#888780', fontSize: '14px' }}>
                  no practice exercises for this lesson
                </div>
              )}
            </div>
          )}

          {/* ── DOCS TAB ── */}
          {activeTab === 'docs' && (
            <div style={{ flex: 1, maxWidth: '860px', margin: '0 auto', width: '100%', padding: '1.5rem 2rem 3rem' }}>
              <div style={{ marginBottom: '1.25rem' }}>
                <input
                  type="text"
                  placeholder="search python docs..."
                  value={docSearch}
                  onChange={e => setDocSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 16px', borderRadius: '10px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '14px', outline: 'none', background: 'white', fontFamily: "'DM Sans', sans-serif" }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredDocs.map(cat => (
                  <div key={cat.category} style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden' }}>
                    <div style={{ padding: '10px 1.25rem', background: '#F8F7F5', borderBottom: '1px solid rgba(14,45,110,0.06)', fontSize: '12px', fontWeight: 700, color: '#0E2D6E', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      {cat.category}
                    </div>
                    {cat.items.map((item, i) => (
                      <div key={item.name} data-docs-key={item.name} style={{ borderBottom: i < cat.items.length - 1 ? '1px solid rgba(14,45,110,0.05)' : 'none' }}>
                        <div
                          onClick={() => setExpandedDoc(expandedDoc === `${cat.category}-${item.name}` ? null : `${cat.category}-${item.name}`)}
                          style={{ padding: '10px 1.25rem', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                        >
                          <code style={{ fontSize: '13px', fontFamily: "'DM Mono', monospace", color: '#1A56DB', background: '#EBF1FD', padding: '2px 8px', borderRadius: '4px', flexShrink: 0 }}>{item.syntax}</code>
                          <span style={{ fontSize: '13px', color: '#0E2D6E', fontWeight: 500 }}>{item.name}</span>
                          <span style={{ fontSize: '12px', color: '#888780', marginLeft: 'auto' }}>{item.desc}</span>
                          <span style={{ color: '#888780', fontSize: '12px', flexShrink: 0, transform: expandedDoc === `${cat.category}-${item.name}` ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
                        </div>
                        {expandedDoc === `${cat.category}-${item.name}` && (
                          <div style={{ padding: '0 1.25rem 12px' }}>
                            <pre style={{ margin: 0, background: '#1C1C1E', color: '#9FE1CB', fontFamily: "'DM Mono', monospace", fontSize: '13px', lineHeight: 1.8, padding: '12px 16px', borderRadius: '8px', whiteSpace: 'pre-wrap' }}>
                              {item.example}
                            </pre>
                            <button
                              onClick={() => { setCode(item.example); setActiveTab('practice') }}
                              style={{ marginTop: '8px', padding: '5px 12px', background: '#EBF1FD', color: '#1A56DB', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                            >
                              try it in practice →
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {assignmentId && (
        <MarkCompleteButton assignmentId={assignmentId} />
      )}
    </div>
  )
}