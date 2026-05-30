'use client'
// ============================================================
// COMMIT PLATFORM — useCollab hook
// ============================================================
// Wraps a Supabase Realtime channel for a single collaboration
// group. Handles three message types:
//
//   - code-state   : full document snapshot (debounced ~150ms)
//   - caret        : { selection_start, selection_end, length }
//   - mouse        : { x, y } relative to a parent container
//
// Plus presence tracking via channel.presenceState() so we always
// know who's in the session.
//
// We send full snapshots instead of OT/CRDT diffs because the
// editor is a textarea and conflict windows are rare for the kind
// of pair-programming this targets. If conflicts become painful
// later we can swap the transport without touching the consumers.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'

export interface CollabMember {
  user_id: string
  display_name: string
  avatar_url: string | null
  joined_at: number
}

export interface RemoteCaret {
  user_id: string
  selection_start: number
  selection_end: number
  length: number
  updated_at: number
}

export interface RemoteMouse {
  user_id: string
  x: number
  y: number
  updated_at: number
}

interface UseCollabArgs {
  channelName: string | null
  me: {
    user_id: string
    display_name: string
    avatar_url: string | null
  } | null
  onRemoteCode?: (code: string, fromUserId: string) => void
  // When set, the hook fetches the persisted snapshot for this group
  // as soon as the channel is ready and replays it as if it were a
  // remote code event. While the local user types, sendCode also
  // debounces a PUT back to the same group so late joiners see the
  // freshest possible state instead of waiting on the next
  // broadcast.
  groupId?: string | null
}

interface UseCollabResult {
  ready: boolean
  members: CollabMember[]
  carets: Record<string, RemoteCaret>
  mice: Record<string, RemoteMouse>
  sendCode: (code: string) => void
  sendCaret: (selectionStart: number, selectionEnd: number, length: number) => void
  sendMouse: (x: number, y: number) => void
}

export function useCollab({ channelName, me, onRemoteCode, groupId }: UseCollabArgs): UseCollabResult {
  const [members, setMembers] = useState<CollabMember[]>([])
  const [carets, setCarets] = useState<Record<string, RemoteCaret>>({})
  const [mice, setMice] = useState<Record<string, RemoteMouse>>({})
  const [ready, setReady] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const onRemoteCodeRef = useRef(onRemoteCode)
  onRemoteCodeRef.current = onRemoteCode
  // Debounce snapshot saves so a typing burst is one PUT instead of
  // dozens. Fires ~2.5s after the most recent sendCode call.
  const snapshotSaveTimer = useRef<number | null>(null)
  const latestCodeRef = useRef<string>('')

  // Subscribe / unsubscribe.
  useEffect(() => {
    if (!channelName || !me) {
      setReady(false)
      return
    }

    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
        presence: { key: me.user_id },
      },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as Record<string, Array<{ user_id: string; display_name: string; avatar_url: string | null; joined_at: number }>>
        const out: CollabMember[] = []
        for (const arr of Object.values(state)) {
          for (const m of arr) {
            out.push({
              user_id: m.user_id,
              display_name: m.display_name,
              avatar_url: m.avatar_url,
              joined_at: m.joined_at,
            })
          }
        }
        // Deduplicate by user_id (in case of multiple tabs from same user).
        const byId = new Map<string, CollabMember>()
        for (const m of out) byId.set(m.user_id, m)
        setMembers([...byId.values()])
      })
      .on('broadcast', { event: 'code' }, ({ payload }: { payload: { user_id: string; code: string } }) => {
        if (!payload || !onRemoteCodeRef.current) return
        if (payload.user_id === me.user_id) return
        onRemoteCodeRef.current(payload.code, payload.user_id)
      })
      .on('broadcast', { event: 'caret' }, ({ payload }: { payload: RemoteCaret }) => {
        if (!payload || payload.user_id === me.user_id) return
        setCarets(prev => ({ ...prev, [payload.user_id]: { ...payload, updated_at: Date.now() } }))
      })
      .on('broadcast', { event: 'mouse' }, ({ payload }: { payload: RemoteMouse }) => {
        if (!payload || payload.user_id === me.user_id) return
        setMice(prev => ({ ...prev, [payload.user_id]: { ...payload, updated_at: Date.now() } }))
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: me.user_id,
            display_name: me.display_name,
            avatar_url: me.avatar_url,
            joined_at: Date.now(),
          })
          setReady(true)
          // Pull the persisted snapshot so a late joiner sees what
          // everyone else has been typing instead of an empty buffer.
          if (groupId) {
            try {
              const snap = await api.get<{ code: string | null; updated_at: string | null; updated_by: string | null }>(
                `/groups/${groupId}/snapshot`
              )
              if (snap?.code && onRemoteCodeRef.current) {
                onRemoteCodeRef.current(snap.code, snap.updated_by || 'snapshot')
              }
            } catch {
              // Non-fatal — no snapshot just means the group's brand new.
            }
          }
        }
      })

    channelRef.current = channel
    return () => {
      setReady(false)
      try { channel.unsubscribe() } catch {}
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [channelName, me?.user_id])

  // Stale-mouse / stale-caret cleanup. We don't get an explicit
  // "stopped moving" event, so we age out anything older than 6s.
  useEffect(() => {
    if (!ready) return
    const t = setInterval(() => {
      const cutoff = Date.now() - 6000
      setMice(prev => {
        const next: Record<string, RemoteMouse> = {}
        for (const [k, v] of Object.entries(prev)) {
          if (v.updated_at >= cutoff) next[k] = v
        }
        return next
      })
    }, 2000)
    return () => clearInterval(t)
  }, [ready])

  const sendCode = useCallback((code: string) => {
    const ch = channelRef.current
    if (!ch || !me) return
    ch.send({ type: 'broadcast', event: 'code', payload: { user_id: me.user_id, code } })
    // Mirror the latest local edit into the persisted snapshot so a
    // student who joins the group later loads what's actually on
    // screen, not what was there hours ago. Debounced to keep the
    // PUT volume sane during typing bursts.
    if (groupId) {
      latestCodeRef.current = code
      if (snapshotSaveTimer.current) window.clearTimeout(snapshotSaveTimer.current)
      snapshotSaveTimer.current = window.setTimeout(() => {
        api.put(`/groups/${groupId}/snapshot`, { code: latestCodeRef.current }).catch(() => {})
      }, 2500) as unknown as number
    }
  }, [me?.user_id, groupId])

  const sendCaret = useCallback((selection_start: number, selection_end: number, length: number) => {
    const ch = channelRef.current
    if (!ch || !me) return
    ch.send({
      type: 'broadcast',
      event: 'caret',
      payload: {
        user_id: me.user_id,
        selection_start,
        selection_end,
        length,
        updated_at: Date.now(),
      },
    })
  }, [me?.user_id])

  const sendMouse = useCallback((x: number, y: number) => {
    const ch = channelRef.current
    if (!ch || !me) return
    ch.send({
      type: 'broadcast',
      event: 'mouse',
      payload: { user_id: me.user_id, x, y, updated_at: Date.now() },
    })
  }, [me?.user_id])

  return { ready, members, carets, mice, sendCode, sendCaret, sendMouse }
}
