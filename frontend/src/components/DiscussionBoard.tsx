'use client'
// ============================================================
// COMMIT PLATFORM — DiscussionBoard component
// ============================================================
// Used by both classroom-scoped discussion assignments and
// curriculum-level discussion assignments. The assignment id is
// the only thing that differs from the caller's perspective; the
// API resolves which table the assignment belongs to.
//
// Caller passes classroom_id so we can scope posts to that
// classroom even for curriculum-level discussions.
// ============================================================

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatDisplayName, NameDisplayMode } from '@/lib/nameDisplay'

interface DiscussionPost {
  id: string
  author_id: string
  author_display_name: string | null
  author_avatar_url: string | null
  author_role: string | null
  body: string
  created_at: string
  comment_count: number
  upvote_count: number
  upvoted_by_me: boolean
  is_mine: boolean
}

interface DiscussionComment {
  id: string
  author_id: string
  author_display_name: string | null
  author_avatar_url: string | null
  author_role: string | null
  body: string
  created_at: string
  is_mine: boolean
}

interface MyProgress {
  posts: number
  comments: number
  required_posts: number
  required_comments: number
}

interface PostsResponse {
  posts: DiscussionPost[]
  my_progress: MyProgress
}

interface Meta {
  assignment: {
    id: string
    title: string
    kind: 'classroom' | 'curriculum'
    discussion_min_posts: number
    discussion_min_comments: number
  }
  classroom: {
    id: string
    name: string
    name_display: NameDisplayMode
  }
}

interface Props {
  assignmentId: string
  classroomId: string
  viewerRole: 'student' | 'teacher' | 'admin'
  previewMode?: boolean
  previewNameMode?: NameDisplayMode
}

// Hardcoded sample posts used in preview mode. Designed to demonstrate
// the upvote, comment count, and name-display behavior without touching
// the API or requiring a real classroom.
const PREVIEW_NOW = Date.now()
const PREVIEW_POSTS: DiscussionPost[] = [
  {
    id: 'preview-post-1',
    author_id: 'preview-1',
    author_display_name: 'Maya Patel',
    author_avatar_url: null,
    author_role: 'student',
    body: 'I think the trickiest part of the lesson was figuring out when to use a for-loop vs a while-loop. The example with `range()` finally made it click for me — anyone else have a moment where it suddenly clicked?',
    created_at: new Date(PREVIEW_NOW - 1000 * 60 * 30).toISOString(),
    comment_count: 2,
    upvote_count: 4,
    upvoted_by_me: false,
    is_mine: false,
  },
  {
    id: 'preview-post-2',
    author_id: 'preview-2',
    author_display_name: 'Jordan Lee',
    author_avatar_url: null,
    author_role: 'student',
    body: 'Question: can you nest a for-loop inside a while-loop? I tried it and it worked but I want to make sure that\'s actually a valid pattern and not just luck.',
    created_at: new Date(PREVIEW_NOW - 1000 * 60 * 60 * 2).toISOString(),
    comment_count: 1,
    upvote_count: 2,
    upvoted_by_me: true,
    is_mine: false,
  },
]
const PREVIEW_COMMENTS: Record<string, DiscussionComment[]> = {
  'preview-post-1': [
    {
      id: 'preview-comment-1',
      author_id: 'preview-3',
      author_display_name: 'Sam Rodriguez',
      author_avatar_url: null,
      author_role: 'student',
      body: 'Same! I used to mix them up. The way I remember it now is: for-loop when you know how many times, while-loop when you only know the stop condition.',
      created_at: new Date(PREVIEW_NOW - 1000 * 60 * 20).toISOString(),
      is_mine: false,
    },
    {
      id: 'preview-comment-2',
      author_id: 'preview-4',
      author_display_name: 'Ms. Chen',
      author_avatar_url: null,
      author_role: 'teacher',
      body: 'Great explanation, Sam. Maya — try rewriting one of the lesson examples using the other loop type and see what changes.',
      created_at: new Date(PREVIEW_NOW - 1000 * 60 * 10).toISOString(),
      is_mine: false,
    },
  ],
  'preview-post-2': [
    {
      id: 'preview-comment-3',
      author_id: 'preview-3',
      author_display_name: 'Sam Rodriguez',
      author_avatar_url: null,
      author_role: 'student',
      body: 'Yes, nesting is totally valid. Just watch out for infinite loops — the inner one needs its own exit condition.',
      created_at: new Date(PREVIEW_NOW - 1000 * 60 * 90).toISOString(),
      is_mine: false,
    },
  ],
}

export default function DiscussionBoard({ assignmentId, classroomId, viewerRole, previewMode = false, previewNameMode = 'first_name' }: Props) {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [posts, setPosts] = useState<DiscussionPost[]>([])
  const [progress, setProgress] = useState<MyProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [newPostBody, setNewPostBody] = useState('')
  const [posting, setPosting] = useState(false)

  const [openPostId, setOpenPostId] = useState<string | null>(null)
  const [commentsByPost, setCommentsByPost] = useState<Record<string, DiscussionComment[]>>({})
  const [commentDraftByPost, setCommentDraftByPost] = useState<Record<string, string>>({})
  const [commentSavingByPost, setCommentSavingByPost] = useState<Record<string, boolean>>({})

  const loadAll = async () => {
    try {
      const [m, p] = await Promise.all([
        api.get<Meta>(`/discussions/${assignmentId}?classroom_id=${classroomId}`),
        api.get<PostsResponse>(`/discussions/${assignmentId}/posts?classroom_id=${classroomId}`),
      ])
      setMeta(m)
      setPosts(p.posts || [])
      setProgress(p.my_progress)
    } catch (err: any) {
      setError(err.message || 'Could not load discussion.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (previewMode) {
      // Static sample data — no network. Lets admins see what students
      // will experience without needing to log in as a real student.
      setMeta({
        assignment: {
          id: assignmentId,
          title: 'Sample discussion',
          kind: 'curriculum',
          discussion_min_posts: 1,
          discussion_min_comments: 2,
        },
        classroom: {
          id: 'preview',
          name: 'Sample classroom',
          name_display: previewNameMode,
        },
      })
      setPosts(PREVIEW_POSTS)
      setCommentsByPost(PREVIEW_COMMENTS)
      setProgress({ posts: 0, comments: 0, required_posts: 1, required_comments: 2 })
      setLoading(false)
      return
    }
    loadAll()
  }, [assignmentId, classroomId, previewMode, previewNameMode])

  const refreshPosts = async () => {
    const p = await api.get<PostsResponse>(`/discussions/${assignmentId}/posts?classroom_id=${classroomId}`)
    setPosts(p.posts || [])
    setProgress(p.my_progress)
  }

  const submitPost = async () => {
    const body = newPostBody.trim()
    if (!body) return
    if (previewMode) {
      const nowIso = new Date().toISOString()
      setPosts(prev => [{
        id: `preview-new-${Date.now()}`,
        author_id: 'preview-self',
        author_display_name: 'You',
        author_avatar_url: null,
        author_role: viewerRole,
        body,
        created_at: nowIso,
        comment_count: 0,
        upvote_count: 0,
        upvoted_by_me: false,
        is_mine: true,
      }, ...prev])
      setNewPostBody('')
      return
    }
    setPosting(true)
    try {
      await api.post(`/discussions/${assignmentId}/posts`, { classroom_id: classroomId, body })
      setNewPostBody('')
      await refreshPosts()
    } catch (err: any) {
      alert(err.message || 'Could not post.')
    } finally {
      setPosting(false)
    }
  }

  const toggleUpvote = async (postId: string) => {
    // Optimistic update
    setPosts(prev => prev.map(p => p.id === postId
      ? { ...p, upvoted_by_me: !p.upvoted_by_me, upvote_count: p.upvote_count + (p.upvoted_by_me ? -1 : 1) }
      : p
    ))
    if (previewMode) return
    try {
      const res = await api.post<{ upvoted: boolean; upvote_count: number }>(`/discussions/posts/${postId}/upvote`)
      setPosts(prev => prev.map(p => p.id === postId
        ? { ...p, upvoted_by_me: res.upvoted, upvote_count: res.upvote_count }
        : p
      ))
    } catch {
      // Revert on failure
      await refreshPosts()
    }
  }

  const openThread = async (postId: string) => {
    if (openPostId === postId) {
      setOpenPostId(null)
      return
    }
    setOpenPostId(postId)
    if (previewMode) return
    if (!commentsByPost[postId]) {
      try {
        const data = await api.get<DiscussionComment[]>(`/discussions/posts/${postId}/comments`)
        setCommentsByPost(prev => ({ ...prev, [postId]: data || [] }))
      } catch (err: any) {
        alert(err.message || 'Could not load comments.')
      }
    }
  }

  const submitComment = async (postId: string) => {
    const draft = (commentDraftByPost[postId] || '').trim()
    if (!draft) return
    if (previewMode) {
      const nowIso = new Date().toISOString()
      setCommentsByPost(prev => ({
        ...prev,
        [postId]: [...(prev[postId] || []), {
          id: `preview-comment-new-${Date.now()}`,
          author_id: 'preview-self',
          author_display_name: 'You',
          author_avatar_url: null,
          author_role: viewerRole,
          body: draft,
          created_at: nowIso,
          is_mine: true,
        }],
      }))
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p))
      setCommentDraftByPost(prev => ({ ...prev, [postId]: '' }))
      return
    }
    setCommentSavingByPost(prev => ({ ...prev, [postId]: true }))
    try {
      await api.post(`/discussions/posts/${postId}/comments`, { body: draft })
      setCommentDraftByPost(prev => ({ ...prev, [postId]: '' }))
      const data = await api.get<DiscussionComment[]>(`/discussions/posts/${postId}/comments`)
      setCommentsByPost(prev => ({ ...prev, [postId]: data || [] }))
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, comment_count: (data || []).length } : p))
      // Refresh progress for student.
      if (viewerRole === 'student') {
        const p = await api.get<PostsResponse>(`/discussions/${assignmentId}/posts?classroom_id=${classroomId}`)
        setProgress(p.my_progress)
      }
    } catch (err: any) {
      alert(err.message || 'Could not comment.')
    } finally {
      setCommentSavingByPost(prev => ({ ...prev, [postId]: false }))
    }
  }

  const deletePost = async (postId: string) => {
    if (previewMode) {
      setPosts(prev => prev.filter(p => p.id !== postId))
      return
    }
    if (!confirm('Delete this post and all its comments?')) return
    try {
      await api.delete(`/discussions/posts/${postId}`)
      setPosts(prev => prev.filter(p => p.id !== postId))
    } catch (err: any) {
      alert(err.message || 'Could not delete.')
    }
  }

  const deleteComment = async (postId: string, commentId: string) => {
    if (previewMode) {
      setCommentsByPost(prev => ({
        ...prev,
        [postId]: (prev[postId] || []).filter(c => c.id !== commentId),
      }))
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p))
      return
    }
    try {
      await api.delete(`/discussions/comments/${commentId}`)
      setCommentsByPost(prev => ({
        ...prev,
        [postId]: (prev[postId] || []).filter(c => c.id !== commentId),
      }))
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p))
    } catch (err: any) {
      alert(err.message || 'Could not delete.')
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#888780', fontFamily: "'DM Sans', sans-serif" }}>loading discussion...</div>
  }
  if (error || !meta) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#B91C1C', fontFamily: "'DM Sans', sans-serif" }}>{error || 'Discussion not found.'}</div>
  }

  const nameMode = meta.classroom.name_display
  const required = `${meta.assignment.discussion_min_posts} post${meta.assignment.discussion_min_posts === 1 ? '' : 's'} + ${meta.assignment.discussion_min_comments} comment${meta.assignment.discussion_min_comments === 1 ? '' : 's'} on others`
  const progressMet = progress
    && progress.posts >= progress.required_posts
    && progress.comments >= progress.required_comments

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '14px',
    outline: 'none', boxSizing: 'border-box', background: '#FAFAF8',
    fontFamily: "'DM Sans', sans-serif", resize: 'vertical' as const,
  }
  const btnPrimary: React.CSSProperties = {
    padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
    cursor: 'pointer', border: 'none', background: '#1A56DB', color: 'white',
    fontFamily: "'DM Sans', sans-serif",
  }
  const btnGhost: React.CSSProperties = {
    padding: '6px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
    cursor: 'pointer', border: '1.5px solid rgba(14,45,110,0.15)',
    background: 'transparent', color: '#5F5E5A', fontFamily: "'DM Sans', sans-serif",
  }

  const avatar = (name: string | null, url: string | null) => {
    if (url) return <img src={url} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    const initial = (name || '?').trim().charAt(0).toUpperCase()
    return (
      <div style={{
        width: '32px', height: '32px', borderRadius: '50%', background: '#EBF1FD',
        color: '#0E2D6E', fontSize: '13px', fontWeight: 700, display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{initial}</div>
    )
  }

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '1.5rem', fontFamily: "'DM Sans', sans-serif" }}>
      {/* Progress strip for students */}
      {viewerRole === 'student' && progress && (
        <div style={{
          background: progressMet ? '#DCFCE7' : 'white',
          border: '1px solid rgba(14,45,110,0.08)',
          borderRadius: '10px', padding: '10px 14px', marginBottom: '1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: '13px', color: progressMet ? '#166534' : '#5F5E5A' }}>
            {progressMet ? '✓ participation complete' : `to complete: ${required}`}
          </div>
          <div style={{ fontSize: '12px', color: '#888780' }}>
            you: {progress.posts}/{progress.required_posts} posts · {progress.comments}/{progress.required_comments} comments
          </div>
        </div>
      )}

      {/* New post box for students/teachers (admins read-only here) */}
      {viewerRole !== 'admin' && (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0E2D6E', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '8px' }}>new post</div>
          <textarea
            value={newPostBody}
            onChange={e => setNewPostBody(e.target.value)}
            placeholder="share your thoughts with the class..."
            rows={3}
            style={inputStyle}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button onClick={submitPost} disabled={posting || !newPostBody.trim()} style={{ ...btnPrimary, opacity: posting || !newPostBody.trim() ? 0.6 : 1 }}>
              {posting ? 'posting...' : 'post'}
            </button>
          </div>
        </div>
      )}

      {posts.length === 0 ? (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', padding: '2rem', textAlign: 'center', color: '#888780', fontSize: '14px' }}>
          no posts yet — be the first to start a thread.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {posts.map(post => {
            const name = formatDisplayName(post.author_display_name, nameMode)
            const teacherTag = post.author_role && post.author_role !== 'student'
            const isOpen = openPostId === post.id
            const comments = commentsByPost[post.id] || []
            return (
              <div key={post.id} style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    {avatar(post.author_display_name, post.author_avatar_url)}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: '#0E2D6E' }}>{name}</span>
                        {teacherTag && (
                          <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', background: '#FEF3C7', color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{post.author_role}</span>
                        )}
                        <span style={{ fontSize: '11px', color: '#888780' }}>{new Date(post.created_at).toLocaleString()}</span>
                      </div>
                      <div style={{ marginTop: '6px', fontSize: '14px', color: '#1F2937', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{post.body}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
                    <button onClick={() => toggleUpvote(post.id)} style={{
                      ...btnGhost,
                      borderColor: post.upvoted_by_me ? '#1A56DB' : 'rgba(14,45,110,0.15)',
                      color: post.upvoted_by_me ? '#1A56DB' : '#5F5E5A',
                      background: post.upvoted_by_me ? '#EBF1FD' : 'transparent',
                    }}>
                      ▲ {post.upvote_count}
                    </button>
                    <button onClick={() => openThread(post.id)} style={btnGhost}>
                      💬 {post.comment_count}
                    </button>
                    {(post.is_mine || viewerRole !== 'student') && (
                      <button onClick={() => deletePost(post.id)} style={{ ...btnGhost, marginLeft: 'auto', color: '#B91C1C', borderColor: 'rgba(185,28,28,0.25)' }}>
                        delete
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div style={{ borderTop: '1px solid rgba(14,45,110,0.06)', background: '#FAFAF8', padding: '12px 16px' }}>
                    {comments.length === 0 ? (
                      <div style={{ fontSize: '12px', color: '#888780', marginBottom: '10px' }}>no comments yet.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
                        {comments.map(c => {
                          const cname = formatDisplayName(c.author_display_name, nameMode)
                          const cTeacher = c.author_role && c.author_role !== 'student'
                          return (
                            <div key={c.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                              {avatar(c.author_display_name, c.author_avatar_url)}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 600, fontSize: '12px', color: '#0E2D6E' }}>{cname}</span>
                                  {cTeacher && (
                                    <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: '99px', background: '#FEF3C7', color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.author_role}</span>
                                  )}
                                  <span style={{ fontSize: '10px', color: '#888780' }}>{new Date(c.created_at).toLocaleString()}</span>
                                  {(c.is_mine || viewerRole !== 'student') && (
                                    <button onClick={() => deleteComment(post.id, c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', fontSize: '10px', padding: 0, marginLeft: 'auto' }}>delete</button>
                                  )}
                                </div>
                                <div style={{ marginTop: '3px', fontSize: '13px', color: '#1F2937', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.body}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {viewerRole !== 'admin' && (
                      <div>
                        <textarea
                          value={commentDraftByPost[post.id] || ''}
                          onChange={e => setCommentDraftByPost(prev => ({ ...prev, [post.id]: e.target.value }))}
                          placeholder="reply..."
                          rows={2}
                          style={{ ...inputStyle, fontSize: '13px' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                          <button
                            onClick={() => submitComment(post.id)}
                            disabled={commentSavingByPost[post.id] || !(commentDraftByPost[post.id] || '').trim()}
                            style={{ ...btnPrimary, padding: '6px 12px', fontSize: '12px', opacity: commentSavingByPost[post.id] ? 0.6 : 1 }}
                          >
                            {commentSavingByPost[post.id] ? 'replying...' : 'reply'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
