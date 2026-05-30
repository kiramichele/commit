'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import CollabOverrideCard, { CollabOverrides } from '@/components/CollabOverrideCard'

interface CurriculumAssignment {
  id: string
  unit_id: string
  order_index: number
  title: string
  instructions: string
  starter_code: string
  assignment_type: string
  min_commits: number
  scaffold_level: string
  allow_collab: boolean
  standards_tags: string[] | null
  hints_enabled: boolean
  hint_1: string | null
  hint_2: string | null
  is_published: boolean
  html_file_path: string | null
  html_body?: string | null
  checkin_format?: string | null
  source_curriculum_assignment_id?: string | null
  pairing_strategy?: string | null
  discussion_min_posts?: number | null
  discussion_min_comments?: number | null
  test_cases?: TestCase[] | null
  default_comparison?: string | null
  collab_enabled?: boolean | null
  collab_group_size?: number | null
  collab_strategy?: 'random' | 'similar_grade' | 'opposite_grade' | 'manual' | 'student_choice' | null
  collab_allow_student_choice?: boolean | null
  collab_allow_solo?: boolean | null
}

type Comparison = 'exact' | 'strip_trailing_whitespace' | 'case_insensitive' | 'contains'

interface TestCase {
  id: string
  description: string
  stdin: string
  expected_stdout: string
  weight: number
  hidden: boolean
  comparison?: Comparison | ''
}

const COMPARISON_OPTIONS: Array<{ value: Comparison; label: string }> = [
  { value: 'strip_trailing_whitespace', label: 'strip trailing whitespace' },
  { value: 'exact',                     label: 'exact match' },
  { value: 'case_insensitive',          label: 'case-insensitive' },
  { value: 'contains',                  label: 'contains (substring)' },
]

interface CurriculumAssignmentRow {
  id: string
  title: string
  assignment_type: string
  unit_id: string
}

const CHECKIN_FORMAT_OPTIONS = [
  { value: 'short_answer', label: 'Short answer', desc: 'Plain prompt → textarea response' },
  { value: 'rating',       label: '1–5 rating',   desc: 'Plain prompt → 1–5 scale response' },
  { value: 'coding',       label: 'Coding',       desc: 'Plain prompt → code snippet response' },
  { value: 'html',         label: 'HTML form',    desc: 'Full HTML page with embedded inputs (uses Commit.submit SDK)' },
]

const TYPE_OPTIONS = [
  { value: 'code',         label: 'Coding' },
  { value: 'activity',     label: 'Interactive activity' },
  { value: 'checkin',      label: 'Check-in' },
  { value: 'quiz',         label: 'Quiz' },
  { value: 'project',      label: 'Project' },
  { value: 'code_review',  label: 'Code review' },
  { value: 'discussion',   label: 'Discussion board' },
]
const SCAFFOLD_LEVELS = ['typed_python', 'pseudocode', 'block_python', 'free_python']
const PAIRING_OPTIONS = [
  { value: 'random',          label: 'Randomly',                      desc: 'Default. Shuffle students, pair each with the next.' },
  { value: 'similar_grade',   label: 'By grade (similar)',            desc: 'Pair students with the closest scores on the source assignment.' },
  { value: 'opposite_grade',  label: 'By grade (opposite)',           desc: 'Pair top scorers with bottom scorers — peer teaching.' },
  { value: 'manual',          label: 'Manually (teacher picks)',      desc: 'Teacher sets every pair by hand (UI coming — phase 2).' },
]

export default function CurriculumAssignmentEditor() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams<{ assignment_id: string }>()

  const [assignment, setAssignment] = useState<CurriculumAssignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState('')
  const [assignmentType, setAssignmentType] = useState('code')
  const [scaffoldLevel, setScaffoldLevel] = useState('typed_python')
  const [minCommits, setMinCommits] = useState(1)
  const [standardsText, setStandardsText] = useState('')
  const [isPublished, setIsPublished] = useState(false)
  const [allowCollab, setAllowCollab] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [starterCode, setStarterCode] = useState('')
  const [hintsEnabled, setHintsEnabled] = useState(true)
  const [hint1, setHint1] = useState('')
  const [hint2, setHint2] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [uploading, setUploading] = useState(false)

  const [checkinFormat, setCheckinFormat] = useState<string>('short_answer')
  const [sourceCurriculumAssignmentId, setSourceCurriculumAssignmentId] = useState<string>('')
  const [pairingStrategy, setPairingStrategy] = useState<string>('random')
  const [availableSources, setAvailableSources] = useState<CurriculumAssignmentRow[]>([])
  const [discussionMinPosts, setDiscussionMinPosts] = useState(1)
  const [discussionMinComments, setDiscussionMinComments] = useState(2)

  const [collab, setCollab] = useState<CollabOverrides>({
    collab_enabled: false,
    collab_group_size: null,
    collab_strategy: null,
    collab_allow_student_choice: null,
    collab_allow_solo: null,
  })

  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [defaultComparison, setDefaultComparison] = useState<Comparison>('strip_trailing_whitespace')
  const [showImportModal, setShowImportModal] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState('')
  const [testCaseErrors, setTestCaseErrors] = useState<string[]>([])

  const isCoding = assignmentType === 'code'
  const isActivity = assignmentType === 'activity'
  const isQuiz = assignmentType === 'quiz'
  const isCheckin = assignmentType === 'checkin'
  const isCodeReview = assignmentType === 'code_review'
  const isDiscussion = assignmentType === 'discussion'
  // Check-ins with html or coding format need the same field surfaces as
  // activity / code types. Compute these once.
  const checkinIsHtml = isCheckin && checkinFormat === 'html'
  const checkinIsCoding = isCheckin && checkinFormat === 'coding'
  // HTML body is used for:
  //   - activity-type   → the full activity page
  //   - checkin (html)  → full activity-style page
  //   - code-type       → instructions HTML rendered in the left pane next to the editor
  const showHtmlBody = isActivity || checkinIsHtml || isCoding
  const showStarterCode = isCoding || checkinIsCoding

  const [quizQuestions, setQuizQuestions] = useState<Array<{
    id: string
    order_index: number
    question_type: 'multiple_choice' | 'constructed_response'
    question_text: string
    code_block: string | null
    choice_a: string | null
    choice_b: string | null
    choice_c: string | null
    choice_d: string | null
    correct_answer: string | null
  }>>([])
  const [uploadingCsv, setUploadingCsv] = useState(false)
  const [csvErrors, setCsvErrors] = useState<string[]>([])

  useEffect(() => {
    if (authLoading) return
    if (!profile || profile.role !== 'admin') router.push('/login')
  }, [profile, authLoading, router])

  useEffect(() => {
    if (profile?.role === 'admin') load()
  }, [profile])

  const load = async () => {
    try {
      const data = await api.get<CurriculumAssignment>(`/admin/curriculum/assignments/${params.assignment_id}`)
      setAssignment(data)
      setTitle(data.title)
      setAssignmentType(data.assignment_type)
      setScaffoldLevel(data.scaffold_level)
      setMinCommits(data.min_commits)
      setStandardsText((data.standards_tags || []).join(', '))
      setIsPublished(data.is_published)
      setAllowCollab(data.allow_collab)
      setInstructions(data.instructions || '')
      setStarterCode(data.starter_code || '')
      setHintsEnabled(data.hints_enabled)
      setHint1(data.hint_1 || '')
      setHint2(data.hint_2 || '')
      setHtmlBody(data.html_body || '')
      setCheckinFormat(data.checkin_format || 'short_answer')
      setSourceCurriculumAssignmentId(data.source_curriculum_assignment_id || '')
      setPairingStrategy(data.pairing_strategy || 'random')
      setDiscussionMinPosts(data.discussion_min_posts ?? 1)
      setDiscussionMinComments(data.discussion_min_comments ?? 2)
      setCollab({
        collab_enabled: !!data.collab_enabled,
        collab_group_size: data.collab_group_size ?? null,
        collab_strategy: data.collab_strategy ?? null,
        collab_allow_student_choice: data.collab_allow_student_choice ?? null,
        collab_allow_solo: data.collab_allow_solo ?? null,
      })
      setDefaultComparison((data.default_comparison as Comparison) || 'strip_trailing_whitespace')
      setTestCases((data.test_cases || []).map(tc => ({
        id: tc.id,
        description: tc.description,
        stdin: tc.stdin ?? '',
        expected_stdout: tc.expected_stdout ?? '',
        weight: tc.weight ?? 1,
        hidden: !!tc.hidden,
        comparison: (tc.comparison as Comparison | undefined) || '',
      })))

      // Fetch all curriculum assignments in this unit so the author can pick
      // one as the code-review source.
      try {
        const all = await api.get<CurriculumAssignmentRow[]>(`/admin/curriculum/units/${data.unit_id}/assignments`)
        setAvailableSources((all || []).filter(a => a.id !== data.id))
      } catch {}

      // Fetch quiz questions if applicable
      if (data.assignment_type === 'quiz') {
        try {
          const qs = await api.get<any[]>(`/admin/curriculum/assignments/${data.id}/questions`)
          setQuizQuestions(qs || [])
        } catch {}
      }
    } catch (err: any) {
      alert(err.message || 'Failed to load assignment')
    } finally {
      setLoading(false)
    }
  }

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingCsv(true)
    setCsvErrors([])
    try {
      const formData = new FormData()
      formData.append('file', file)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8888'
      const token = typeof window !== 'undefined' ? localStorage.getItem('commit_access_token') : null
      const response = await fetch(`${apiUrl}/admin/curriculum/assignments/${params.assignment_id}/questions/upload-csv`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result.detail || `Upload failed: ${response.status}`)
      }
      const qs = await api.get<any[]>(`/admin/curriculum/assignments/${params.assignment_id}/questions`)
      setQuizQuestions(qs || [])
      setCsvErrors(result.errors || [])
      alert(`${result.inserted} question(s) imported${result.errors?.length ? ` with ${result.errors.length} row(s) skipped` : ''}`)
    } catch (err: any) {
      alert(err.message || 'CSV upload failed')
    } finally {
      setUploadingCsv(false)
      e.target.value = ''
    }
  }

  const deleteQuizQuestion = async (qid: string) => {
    if (!confirm('Delete this question?')) return
    try {
      await api.delete(`/admin/curriculum/assignments/${params.assignment_id}/questions/${qid}`)
      setQuizQuestions(qs => qs.filter(q => q.id !== qid))
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const text = await file.text()
      setHtmlBody(text)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const validateTestCases = (cases: TestCase[]): string[] => {
    const errs: string[] = []
    const seen = new Set<string>()
    cases.forEach((tc, i) => {
      const id = (tc.id || '').trim()
      if (!id) errs.push(`Test case #${i + 1}: id is required.`)
      else if (seen.has(id)) errs.push(`Test case #${i + 1}: duplicate id "${id}".`)
      else seen.add(id)
      if (!tc.description.trim()) errs.push(`Test case #${i + 1}: description is required.`)
      if (tc.expected_stdout === undefined || tc.expected_stdout === null) errs.push(`Test case #${i + 1}: expected_stdout is required.`)
      if (tc.weight < 0 || !Number.isFinite(tc.weight)) errs.push(`Test case #${i + 1}: weight must be a non-negative number.`)
    })
    return errs
  }

  const addTestCase = () => {
    const nextNum = testCases.length + 1
    setTestCases(prev => [...prev, {
      id: `tc_${nextNum}`,
      description: '',
      stdin: '',
      expected_stdout: '',
      weight: 1,
      hidden: false,
      comparison: '',
    }])
  }

  const updateTestCase = (idx: number, patch: Partial<TestCase>) => {
    setTestCases(prev => prev.map((tc, i) => i === idx ? { ...tc, ...patch } : tc))
  }

  const deleteTestCase = (idx: number) => {
    setTestCases(prev => prev.filter((_, i) => i !== idx))
  }

  const applyImport = (rawText: string) => {
    setImportError('')
    let parsed: any
    try {
      parsed = JSON.parse(rawText)
    } catch (e: any) {
      setImportError(`Invalid JSON: ${e.message}`)
      return
    }
    if (!parsed || typeof parsed !== 'object') {
      setImportError('JSON must be an object.')
      return
    }
    if (!Array.isArray(parsed.test_cases) || parsed.test_cases.length === 0) {
      setImportError('JSON must include a non-empty "test_cases" array.')
      return
    }
    const imported: TestCase[] = []
    const seen = new Set<string>()
    for (let i = 0; i < parsed.test_cases.length; i++) {
      const tc = parsed.test_cases[i]
      if (!tc || typeof tc !== 'object') {
        setImportError(`test_cases[${i}] is not an object.`)
        return
      }
      const id = String(tc.id || '').trim()
      if (!id) { setImportError(`test_cases[${i}].id is required.`); return }
      if (seen.has(id)) { setImportError(`Duplicate test case id: "${id}".`); return }
      seen.add(id)
      const description = String(tc.description || '').trim()
      if (!description) { setImportError(`test_cases[${i}].description is required.`); return }
      if (tc.expected_stdout === undefined || tc.expected_stdout === null) {
        setImportError(`test_cases[${i}].expected_stdout is required.`)
        return
      }
      const comparison = tc.comparison
      if (comparison && !['exact', 'strip_trailing_whitespace', 'case_insensitive', 'contains'].includes(comparison)) {
        setImportError(`test_cases[${i}].comparison invalid: "${comparison}".`)
        return
      }
      imported.push({
        id,
        description,
        stdin: tc.stdin ?? '',
        expected_stdout: String(tc.expected_stdout),
        weight: Number.isFinite(tc.weight) ? tc.weight : 1,
        hidden: !!tc.hidden,
        comparison: (comparison as Comparison | undefined) || '',
      })
    }
    if (parsed.default_comparison) {
      if (!['exact', 'strip_trailing_whitespace', 'case_insensitive', 'contains'].includes(parsed.default_comparison)) {
        setImportError(`default_comparison invalid: "${parsed.default_comparison}".`)
        return
      }
      setDefaultComparison(parsed.default_comparison)
    }
    if (parsed.title && parsed.title !== title) {
      // Don't overwrite, just notify visually via a non-blocking alert.
      console.warn(`Imported title "${parsed.title}" differs from current assignment title "${title}" — not changing the title.`)
    }
    setTestCases(imported)
    setTestCaseErrors([])
    setShowImportModal(false)
    setImportText('')
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setImportText(text)
    e.target.value = ''
  }

  const save = async () => {
    if (!title.trim()) return alert('Title is required')
    if (isCoding && testCases.length > 0) {
      const errs = validateTestCases(testCases)
      if (errs.length) {
        setTestCaseErrors(errs)
        alert('Fix the test case errors before saving.')
        return
      }
    }
    setTestCaseErrors([])
    setSaving(true)
    try {
      const standardsList = standardsText.split(',').map(s => s.trim()).filter(Boolean)
      // order_index intentionally omitted — reordering happens via the up/
      // down arrows in the curriculum admin list.
      await api.patch(`/admin/curriculum/assignments/${params.assignment_id}`, {
        title,
        assignment_type: assignmentType,
        scaffold_level: scaffoldLevel,
        min_commits: showStarterCode ? minCommits : 0,
        standards_tags: standardsList.length ? standardsList : null,
        is_published: isPublished,
        allow_collab: allowCollab,
        instructions,
        starter_code: showStarterCode ? starterCode : '',
        hints_enabled: hintsEnabled,
        hint_1: hint1 || null,
        hint_2: hint2 || null,
        html_body: showHtmlBody ? htmlBody : null,
        checkin_format: isCheckin ? checkinFormat : null,
        source_curriculum_assignment_id: isCodeReview ? (sourceCurriculumAssignmentId || null) : null,
        pairing_strategy: isCodeReview ? pairingStrategy : null,
        discussion_min_posts: isDiscussion ? Math.max(0, discussionMinPosts) : null,
        discussion_min_comments: isDiscussion ? Math.max(0, discussionMinComments) : null,
        collab_enabled: !!collab.collab_enabled,
        collab_group_size: collab.collab_group_size,
        collab_strategy: collab.collab_strategy,
        collab_allow_student_choice: collab.collab_allow_student_choice,
        collab_allow_solo: collab.collab_allow_solo,
        test_cases: isCoding ? testCases.map(tc => {
          const out: Record<string, unknown> = {
            id: tc.id.trim(),
            description: tc.description.trim(),
            stdin: tc.stdin,
            expected_stdout: tc.expected_stdout,
            weight: tc.weight,
            hidden: tc.hidden,
          }
          if (tc.comparison) out.comparison = tc.comparison
          return out
        }) : null,
        default_comparison: isCoding ? defaultComparison : null,
      })
      alert('Saved')
    } catch (err: any) {
      alert(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || !profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5' }}>
      <p style={{ color: '#888780', fontFamily: "'DM Sans', sans-serif" }}>loading...</p>
    </div>
  )

  const card: React.CSSProperties = { background: 'white', borderRadius: '14px', border: '1px solid rgba(14,45,110,0.08)', padding: '1.5rem', marginBottom: '1rem' }
  const label: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#0E2D6E', marginBottom: '6px' }
  const input: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: '#FAFAF8', fontFamily: "'DM Sans', sans-serif" }
  const textareaStyle: React.CSSProperties = { ...input, fontFamily: "'DM Mono', monospace", fontSize: '12px', lineHeight: 1.5, resize: 'vertical' as const }
  const btn = (primary: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    border: primary ? 'none' : '1.5px solid rgba(14,45,110,0.15)',
    background: primary ? '#1A56DB' : 'transparent',
    color: primary ? 'white' : '#5F5E5A',
    fontFamily: "'DM Sans', sans-serif",
  })

  return (
    <div style={{ minHeight: '100vh', background: '#F8F7F5', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <div style={{ background: '#0E2D6E', padding: '0 2rem', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '28px', height: '28px', background: '#1A56DB', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'white' }}>{'>'}_</div>
          <span style={{ color: 'white', fontWeight: 700, fontSize: '15px' }}>commit</span>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>/</span>
          <Link href="/admin" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', textDecoration: 'none' }}>admin</Link>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>/</span>
          <Link href="/admin/curriculum" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', textDecoration: 'none' }}>curriculum</Link>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>/</span>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>assignment: {title || '...'}</span>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>{profile.email}</span>
      </div>

      {loading || !assignment ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: '#888780' }}>loading assignment...</div>
      ) : (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem' }}>

          {/* META */}
          <div style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={label}>title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} style={input} />
              </div>
              <div>
                <label style={label}>type</label>
                <select value={assignmentType} onChange={e => setAssignmentType(e.target.value)} style={input}>
                  {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: showStarterCode ? '1fr 1fr 120px 120px' : '1fr 120px', gap: '12px', alignItems: 'end' }}>
              {showStarterCode && (
                <div>
                  <label style={label}>scaffold level</label>
                  <select value={scaffoldLevel} onChange={e => setScaffoldLevel(e.target.value)} style={input}>
                    {SCAFFOLD_LEVELS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={label}>standards (comma-separated)</label>
                <input value={standardsText} onChange={e => setStandardsText(e.target.value)} placeholder="CRD-1.A" style={input} />
              </div>
              {showStarterCode && (
                <div>
                  <label style={label}>min commits</label>
                  <input type="number" value={minCommits} onChange={e => setMinCommits(parseInt(e.target.value, 10) || 0)} style={input} />
                </div>
              )}
              <div>
                <label style={label}>published</label>
                <button onClick={() => setIsPublished(p => !p)} style={{ ...input, textAlign: 'left' as const, cursor: 'pointer', background: isPublished ? '#DCFCE7' : '#FEF9C3', color: isPublished ? '#166534' : '#854D0E', fontWeight: 600 }}>
                  {isPublished ? '● live' : '○ draft'}
                </button>
              </div>
            </div>
          </div>

          {/* CODE REVIEW SETTINGS */}
          {isCodeReview && (
            <div style={card}>
              <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>code review settings</h3>
              <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#888780' }}>
                Students will review the code submissions from another classroom assignment.
                Pairings are generated per-classroom when a teacher hits "generate pairings".
              </p>

              <label style={label}>source assignment (code submissions to review)</label>
              <select
                value={sourceCurriculumAssignmentId}
                onChange={e => setSourceCurriculumAssignmentId(e.target.value)}
                style={{ ...input, marginBottom: '14px' }}
              >
                <option value="">— pick a code/check-in assignment from this unit —</option>
                {availableSources
                  .filter(a => a.assignment_type === 'code' || a.assignment_type === 'checkin')
                  .map(a => (
                    <option key={a.id} value={a.id}>{a.title} ({a.assignment_type})</option>
                  ))}
              </select>

              <label style={label}>pairing strategy</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                {PAIRING_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setPairingStrategy(opt.value)}
                    style={{
                      padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                      border: pairingStrategy === opt.value ? '2px solid #1A56DB' : '2px solid rgba(14,45,110,0.1)',
                      background: pairingStrategy === opt.value ? '#EBF1FD' : 'white',
                      color: '#0E2D6E',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px' }}>{opt.label}</div>
                    <div style={{ fontSize: '11px', color: '#888780', lineHeight: 1.5 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* DISCUSSION SETTINGS */}
          {isDiscussion && (
            <div style={card}>
              <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>discussion settings</h3>
              <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#888780', lineHeight: 1.55 }}>
                Students must hit both thresholds to count as complete. Posts and comments are scoped to each classroom; per-classroom name display is controlled in classroom settings.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={label}>required posts (own threads)</label>
                  <input type="number" min={0} value={discussionMinPosts} onChange={e => setDiscussionMinPosts(parseInt(e.target.value, 10) || 0)} style={input} />
                </div>
                <div>
                  <label style={label}>required comments (on others)</label>
                  <input type="number" min={0} value={discussionMinComments} onChange={e => setDiscussionMinComments(parseInt(e.target.value, 10) || 0)} style={input} />
                </div>
              </div>
            </div>
          )}

          {/* CHECK-IN FORMAT PICKER */}
          {isCheckin && (
            <div style={card}>
              <label style={label}>check-in format</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', marginTop: '4px' }}>
                {CHECKIN_FORMAT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setCheckinFormat(opt.value)}
                    style={{
                      padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                      border: checkinFormat === opt.value ? '2px solid #1A56DB' : '2px solid rgba(14,45,110,0.1)',
                      background: checkinFormat === opt.value ? '#EBF1FD' : 'white',
                      color: '#0E2D6E',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px' }}>{opt.label}</div>
                    <div style={{ fontSize: '11px', color: '#888780' }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* INSTRUCTIONS + CODE */}
          <div style={card}>
            <label style={label}>{showStarterCode ? 'instructions' : assignmentType === 'quiz' || isCheckin ? 'prompt' : 'instructions'}</label>
            <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={6} placeholder="What the student needs to do." style={{ ...input, fontFamily: "'DM Sans', sans-serif", fontSize: '13px', marginBottom: showStarterCode ? '12px' : '0' }} />

            {showStarterCode && (
              <>
                <label style={label}>starter code</label>
                <textarea value={starterCode} onChange={e => setStarterCode(e.target.value)} rows={8} placeholder="# starter code here" style={textareaStyle} />
              </>
            )}
          </div>

          {/* QUIZ QUESTIONS — only for quiz type */}
          {isQuiz && (
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3 style={{ margin: '0 0 2px', fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>questions ({quizQuestions.length})</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#888780' }}>upload a CSV to replace the current set</p>
                </div>
                <label style={{ ...btn(true), padding: '7px 14px', fontSize: '12px', display: 'inline-block' }}>
                  {uploadingCsv ? 'uploading...' : '+ upload .csv'}
                  <input type="file" accept=".csv,text/csv" onChange={handleCsvUpload} style={{ display: 'none' }} />
                </label>
              </div>

              <div style={{ padding: '10px 14px', background: '#F8F7F5', borderRadius: '8px', fontSize: '12px', color: '#5F5E5A', lineHeight: 1.6, marginBottom: '12px' }}>
                <strong style={{ color: '#0E2D6E' }}>CSV columns:</strong> <code style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px' }}>question_type, question, code, a, b, c, d, correct_answer</code>
                <br />
                <span style={{ color: '#888780' }}>
                  <code style={{ fontFamily: "'DM Mono', monospace" }}>question_type</code> = <code>multiple_choice</code> or <code>constructed_response</code>.
                  For multiple choice, fill choices a-d and set <code>correct_answer</code> to one of <code>a/b/c/d</code>.
                  For constructed response, leave choices and correct_answer empty (graded later by AI or teacher).
                  Optional <code>code</code> column shows as a formatted code block under the question.
                </span>
              </div>

              {csvErrors.length > 0 && (
                <div style={{ padding: '10px 14px', background: '#FEE2E2', borderRadius: '8px', fontSize: '12px', color: '#991B1B', marginBottom: '12px' }}>
                  <strong>skipped rows:</strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {csvErrors.slice(0, 10).map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}

              {quizQuestions.length === 0 ? (
                <p style={{ margin: 0, padding: '1rem', textAlign: 'center', color: '#888780', fontSize: '13px' }}>no questions yet — upload a CSV above</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {quizQuestions.map((q, i) => (
                    <div key={q.id} style={{ padding: '10px 14px', border: '1px solid rgba(14,45,110,0.08)', borderRadius: '8px', background: '#FAFAF8' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: '#888780' }}>{i + 1}</span>
                          <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: q.question_type === 'multiple_choice' ? '#EBF1FD' : '#FEF3C7', color: q.question_type === 'multiple_choice' ? '#0C447C' : '#92400E', textTransform: 'uppercase' }}>
                            {q.question_type === 'multiple_choice' ? 'MC' : 'constructed'}
                          </span>
                        </div>
                        <button onClick={() => deleteQuizQuestion(q.id)} style={{ ...btn(false), padding: '3px 8px', fontSize: '11px', borderColor: 'rgba(239,68,68,0.3)', color: '#991B1B' }}>delete</button>
                      </div>
                      <div style={{ fontSize: '13px', color: '#0E2D6E', fontWeight: 500, marginBottom: '6px' }}>{q.question_text}</div>
                      {q.code_block && (
                        <pre style={{ margin: '0 0 8px', padding: '8px 10px', background: '#1C1C1E', color: '#EBF1FD', borderRadius: '6px', fontFamily: "'DM Mono', monospace", fontSize: '12px', lineHeight: 1.6, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{q.code_block}</pre>
                      )}
                      {q.question_type === 'multiple_choice' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '12px', color: '#5F5E5A' }}>
                          {(['a', 'b', 'c', 'd'] as const).map(letter => {
                            const choice = (q as any)[`choice_${letter}`]
                            if (!choice) return null
                            const correct = q.correct_answer === letter
                            return (
                              <div key={letter} style={{ color: correct ? '#166534' : '#5F5E5A', fontWeight: correct ? 600 : 400 }}>
                                {letter}) {choice} {correct && <span style={{ color: '#166534' }}>✓</span>}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* HTML BODY — for activities and html check-ins */}
          {showHtmlBody && (
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <label style={{ ...label, marginBottom: 0 }}>
                  {isActivity ? 'activity html body'
                    : isCoding ? 'instructions html (optional)'
                    : 'check-in html prompt'}
                </label>
                <label style={{ ...btn(false), padding: '5px 10px', fontSize: '12px', display: 'inline-block' }}>
                  {uploading ? 'reading...' : '+ upload .html'}
                  <input type="file" accept=".html" onChange={handleFileUpload} style={{ display: 'none' }} />
                </label>
              </div>
              <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#888780', lineHeight: 1.5 }}>
                {isCoding
                  ? <>Optional. When set, this HTML renders in the left pane next to the IDE + console, replacing the plain-text instructions field. Use it when your directions need rich formatting (lists, images, code blocks, links).</>
                  : <>Renders as a standalone HTML page; students answer the embedded form inputs and submit using the <code style={{ background: '#EBF1FD', padding: '1px 5px', borderRadius: '4px', fontFamily: "'DM Mono', monospace" }}>Commit.submit(responses)</code> SDK from your own submit button. See the lesson editor for an activity template that demonstrates the full SDK (submit, getPriorResponses, status events).</>}
              </p>
              <textarea value={htmlBody} onChange={e => setHtmlBody(e.target.value)} rows={14} placeholder="<h1>Title</h1>&#10;<p>Body HTML...</p>" style={textareaStyle} />
            </div>
          )}

          {/* HINTS — coding only */}
          {showStarterCode && (
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>hints</h3>
                <button onClick={() => setHintsEnabled(h => !h)} style={{ ...btn(false), padding: '5px 10px', fontSize: '12px', background: hintsEnabled ? '#DCFCE7' : '#FEF9C3', color: hintsEnabled ? '#166534' : '#854D0E', border: 'none' }}>
                  {hintsEnabled ? 'enabled' : 'disabled'}
                </button>
              </div>
              <label style={label}>hint 1</label>
              <textarea value={hint1} onChange={e => setHint1(e.target.value)} rows={2} placeholder="nudge students toward the right idea" style={{ ...input, fontFamily: "'DM Sans', sans-serif", fontSize: '13px', marginBottom: '10px' }} />
              <label style={label}>hint 2 (deeper)</label>
              <textarea value={hint2} onChange={e => setHint2(e.target.value)} rows={2} placeholder="more direct hint" style={{ ...input, fontFamily: "'DM Sans', sans-serif", fontSize: '13px' }} />
            </div>
          )}

          {/* TEST CASES — coding only */}
          {isCoding && (
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3 style={{ margin: '0 0 2px', fontSize: '14px', fontWeight: 700, color: '#0E2D6E' }}>test cases ({testCases.length})</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#888780' }}>
                    Auto-graded against student code via Judge0. Each case is run with its <code style={{ fontFamily: "'DM Mono', monospace" }}>stdin</code> and its output compared to <code style={{ fontFamily: "'DM Mono', monospace" }}>expected_stdout</code>.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => { setImportError(''); setImportText(''); setShowImportModal(true) }} style={{ ...btn(false), padding: '7px 12px', fontSize: '12px' }}>
                    ⇪ import JSON
                  </button>
                  <button onClick={addTestCase} style={{ ...btn(true), padding: '7px 12px', fontSize: '12px' }}>
                    + add test case
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'end', marginTop: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={label}>default comparison</label>
                  <select value={defaultComparison} onChange={e => setDefaultComparison(e.target.value as Comparison)} style={input}>
                    {COMPARISON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div style={{ fontSize: '11px', color: '#888780', padding: '8px 0' }}>
                  Each test case may override this. Total weight {testCases.reduce((s, tc) => s + (Number.isFinite(tc.weight) ? tc.weight : 0), 0)} pt(s).
                </div>
              </div>

              {testCaseErrors.length > 0 && (
                <div style={{ padding: '10px 14px', background: '#FEE2E2', borderRadius: '8px', fontSize: '12px', color: '#991B1B', marginBottom: '12px' }}>
                  <strong>fix before saving:</strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {testCaseErrors.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}

              {testCases.length === 0 ? (
                <p style={{ margin: 0, padding: '1.5rem', textAlign: 'center', color: '#888780', fontSize: '13px', background: '#FAFAF8', borderRadius: '8px' }}>
                  no test cases — add one or import a JSON file
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {testCases.map((tc, i) => (
                    <div key={i} style={{ padding: '12px 14px', border: '1px solid rgba(14,45,110,0.12)', borderRadius: '10px', background: '#FAFAF8' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 90px 90px auto', gap: '8px', alignItems: 'end', marginBottom: '10px' }}>
                        <div>
                          <label style={label}>id</label>
                          <input value={tc.id} onChange={e => updateTestCase(i, { id: e.target.value })} style={{ ...input, fontFamily: "'DM Mono', monospace" }} />
                        </div>
                        <div>
                          <label style={label}>description</label>
                          <input value={tc.description} onChange={e => updateTestCase(i, { description: e.target.value })} placeholder="what this case checks" style={input} />
                        </div>
                        <div>
                          <label style={label}>weight</label>
                          <input type="number" min={0} value={tc.weight} onChange={e => updateTestCase(i, { weight: parseInt(e.target.value, 10) || 0 })} style={input} />
                        </div>
                        <div>
                          <label style={label}>hidden</label>
                          <button onClick={() => updateTestCase(i, { hidden: !tc.hidden })} style={{ ...input, textAlign: 'left' as const, cursor: 'pointer', background: tc.hidden ? '#FEE2E2' : 'white', color: tc.hidden ? '#991B1B' : '#5F5E5A', fontWeight: 600 }}>
                            {tc.hidden ? '● hidden' : '○ shown'}
                          </button>
                        </div>
                        <button onClick={() => deleteTestCase(i)} style={{ ...btn(false), padding: '6px 10px', fontSize: '11px', borderColor: 'rgba(239,68,68,0.3)', color: '#991B1B', alignSelf: 'end' }}>
                          delete
                        </button>
                      </div>
                      <div style={{ marginBottom: '10px' }}>
                        <label style={label}>comparison (override default)</label>
                        <select value={tc.comparison || ''} onChange={e => updateTestCase(i, { comparison: (e.target.value as Comparison) || '' })} style={input}>
                          <option value="">— use default ({COMPARISON_OPTIONS.find(o => o.value === defaultComparison)?.label}) —</option>
                          {COMPARISON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={label}>stdin <span style={{ fontWeight: 400, color: '#888780' }}>(\n for newlines)</span></label>
                          <textarea value={tc.stdin} onChange={e => updateTestCase(i, { stdin: e.target.value })} rows={4} placeholder="" style={textareaStyle} />
                        </div>
                        <div>
                          <label style={label}>expected_stdout</label>
                          <textarea value={tc.expected_stdout} onChange={e => updateTestCase(i, { expected_stdout: e.target.value })} rows={4} placeholder="" style={textareaStyle} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* COLLAB — new override card. Classroom defaults are
              applied at runtime per classroom; this admin form has no
              specific classroom to read defaults from, so we leave the
              defaults panel empty. */}
          <CollabOverrideCard
            value={collab}
            onChange={next => {
              setCollab(next)
              setAllowCollab(!!next.collab_enabled)
            }}
          />

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <Link href="/admin/curriculum" style={{ ...btn(false), textDecoration: 'none' }}>← back</Link>
            <button onClick={save} disabled={saving} style={btn(true)}>{saving ? 'saving...' : 'save changes'}</button>
          </div>

        </div>
      )}

      {/* IMPORT JSON MODAL */}
      {showImportModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(14,45,110,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) setShowImportModal(false) }}
        >
          <div style={{ background: 'white', borderRadius: '14px', padding: '1.75rem', width: '100%', maxWidth: '640px' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: '#0E2D6E' }}>import test cases</h2>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#888780', lineHeight: 1.55 }}>
              Paste a JSON object matching the test-case schema, or upload a <code style={{ fontFamily: "'DM Mono', monospace" }}>.json</code> file. Replaces the current list. Required fields per case: <code style={{ fontFamily: "'DM Mono', monospace" }}>id</code>, <code style={{ fontFamily: "'DM Mono', monospace" }}>description</code>, <code style={{ fontFamily: "'DM Mono', monospace" }}>expected_stdout</code>.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ ...label, marginBottom: 0 }}>JSON</label>
              <label style={{ ...btn(false), padding: '5px 10px', fontSize: '12px', display: 'inline-block' }}>
                + upload .json
                <input type="file" accept=".json,application/json" onChange={handleImportFile} style={{ display: 'none' }} />
              </label>
            </div>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              rows={14}
              placeholder='{"exercise_id":"ex_2_1","title":"Hello, varied","default_comparison":"strip_trailing_whitespace","test_cases":[{"id":"tc_1","description":"Prints exactly","stdin":"","expected_stdout":"Hello, world!\n","weight":1,"hidden":false}]}'
              style={textareaStyle}
            />

            {importError && (
              <div style={{ marginTop: '12px', padding: '10px 14px', background: '#FEE2E2', borderRadius: '8px', fontSize: '12px', color: '#991B1B' }}>
                {importError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
              <button onClick={() => setShowImportModal(false)} style={btn(false)}>cancel</button>
              <button onClick={() => applyImport(importText)} disabled={!importText.trim()} style={{ ...btn(true), opacity: importText.trim() ? 1 : 0.5 }}>
                import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
