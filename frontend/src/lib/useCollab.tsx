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
  // Bumped every time we detect the channel went CLOSED — used as a
  // dep on the subscribe effect so it tears down + rebuilds the
  // channel automatically. Without this, a single network blip
  // permanently strands the channel and stops live sync.
  const [reconnectVersion, setReconnectVersion] = useState(0)
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

    const log = (...args: unknown[]) => console.log('[collab]', channelName, ...args)
    log('opening channel', { me: me.user_id })

    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
        presence: { key: me.user_id },
      },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as Record<string, Array<{ user_id?: string; display_name?: string; avatar_url?: string | null; joined_at?: number }>>
        // Log the *raw* state so we can tell if presence sync is even
        // firing and what shape it has. Empty state on every sync
        // means the other tab's track() didn't land.
        log('presence sync (raw)', state)
        const out: CollabMember[] = []
        for (const [key, arr] of Object.entries(state)) {
          if (!Array.isArray(arr)) continue
          for (const m of arr) {
            if (!m) continue
            // Fall back to the presence key when the inner payload is
            // missing user_id — supabase-realtime presence keys are
            // exactly the user_id we passed at channel-create time.
            const userId = (typeof m.user_id === 'string' && m.user_id) || key
            if (!userId) continue
            out.push({
              user_id: userId,
              display_name: m.display_name || 'Student',
              avatar_url: m.avatar_url ?? null,
              joined_at: m.joined_at ?? Date.now(),
            })
          }
        }
        // Deduplicate by user_id (in case of multiple tabs from same user).
        const byId = new Map<string, CollabMember>()
        for (const m of out) byId.set(m.user_id, m)
        const final = [...byId.values()]
        log('presence sync (deduped)', final.map(m => `${m.display_name} (${(m.user_id || '?????').slice(0, 8)})`))

        // Self-heal: if presence comes back empty but we're supposed
        // to be tracked, immediately re-track. Otherwise we'd wait
        // for the next 5s heartbeat to fix it.
        if (me.user_id) {
          const meAbsent = !final.some(m => m.user_id === me.user_id)
          if (meAbsent) {
            log('not in presence — re-tracking self')
            channel.track({
              user_id: me.user_id,
              display_name: me.display_name || 'Student',
              avatar_url: me.avatar_url ?? null,
              joined_at: Date.now(),
            }).then(r => log('re-track', r)).catch(e => log('re-track failed', e))
          }
        }

        setMembers(final)
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        log('presence JOIN', { key, newPresences })
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        log('presence LEAVE', { key, leftPresences })
      })
      // Event name is 'doc' rather than 'code' — Supabase Realtime
      // appears to silently drop broadcasts named 'code' (likely a
      // collision with internal naming on the realtime server). The
      // payload structure is unchanged.
      .on('broadcast', { event: 'doc' }, ({ payload }: { payload: { user_id: string; code: string } }) => {
        log('RECV doc', { from: payload?.user_id, length: payload?.code?.length })
        if (!payload) {
          log('  ↳ skipped: no payload')
          return
        }
        if (!onRemoteCodeRef.current) {
          log('  ↳ skipped: no onRemoteCode handler registered')
          return
        }
        if (payload.user_id === me.user_id) {
          log('  ↳ skipped: own broadcast (self filter)')
          return
        }
        log('  ↳ applying to local state', { length: payload.code.length })
        onRemoteCodeRef.current(payload.code, payload.user_id)
      })
      .on('broadcast', { event: 'caret' }, ({ payload }: { payload: RemoteCaret }) => {
        log('RECV caret', { from: payload?.user_id, start: payload?.selection_start })
        // Bare-minimum validation: payload exists, has a user_id, and
        // isn't from us. Type-strict checks were rejecting valid wire
        // payloads — the downstream renderer is already defensive
        // about missing offsets.
        if (!payload || !payload.user_id) return
        if (payload.user_id === me.user_id) return
        setCarets(prev => ({ ...prev, [payload.user_id]: { ...payload, updated_at: Date.now() } }))
      })
      .on('broadcast', { event: 'mouse' }, ({ payload }: { payload: RemoteMouse }) => {
        // Mouse fires constantly — only log occasionally.
        if (Math.floor(Date.now() / 1000) % 10 === 0) {
          log('RECV mouse', { from: payload?.user_id, x: payload?.x, y: payload?.y })
        }
        if (!payload || !payload.user_id) return
        if (payload.user_id === me.user_id) return
        setMice(prev => ({ ...prev, [payload.user_id]: { ...payload, updated_at: Date.now() } }))
      })
      .subscribe(async status => {
        log('subscribe status', status)
        if (status === 'SUBSCRIBED') {
          const trackResult = await channel.track({
            user_id: me.user_id,
            display_name: me.display_name,
            avatar_url: me.avatar_url,
            joined_at: Date.now(),
          })
          // Log whether track() actually succeeded — when this comes
          // back as anything other than 'ok' the user never appears
          // in the other peer's presence state, even though their
          // broadcasts go through.
          log('tracked self', { result: trackResult, user_id: me.user_id, display_name: me.display_name })
          setReady(true)
          // Pull the persisted snapshot so a late joiner sees what
          // everyone else has been typing instead of an empty buffer.
          if (groupId) {
            try {
              const snap = await api.get<{ code: string | null; updated_at: string | null; updated_by: string | null }>(
                `/groups/${groupId}/snapshot`
              )
              if (snap?.code && onRemoteCodeRef.current) {
                log('applied snapshot', { length: snap.code.length })
                onRemoteCodeRef.current(snap.code, snap.updated_by || 'snapshot')
              }
            } catch (e) {
              log('snapshot fetch failed', e)
            }
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[collab] channel not subscribed:', status, channelName)
          setReady(false)
          // Tear down + bump the reconnect counter so the subscribe
          // effect re-fires and rebuilds the channel from scratch.
          // A short delay so we don't busy-loop if the server is
          // throttling us.
          window.setTimeout(() => {
            setReconnectVersion(v => v + 1)
          }, 2000)
        }
      })

    channelRef.current = channel
    return () => {
      setReady(false)
      try { channel.unsubscribe() } catch {}
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [channelName, me?.user_id, reconnectVersion])

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

  // Presence heartbeat — re-track our own presence every few seconds
  // so the channel stays warm even if a transient empty presence-sync
  // wipes us out. Supabase considers a client gone after ~30s of no
  // presence updates; a heartbeat keeps us alive AND repopulates if
  // we somehow disappeared from the other peer's view.
  //
  // Also doubles as a liveness probe — if track() returns 'timed
  // out', the channel is gone in practice even if the subscribe
  // callback didn't fire CLOSED. Bump the reconnect counter so the
  // subscribe effect rebuilds it.
  useEffect(() => {
    if (!ready || !me) return
    const ch = channelRef.current
    if (!ch) return
    let stuck = 0
    const heartbeat = setInterval(() => {
      ch.track({
        user_id: me.user_id,
        display_name: me.display_name,
        avatar_url: me.avatar_url,
        joined_at: Date.now(),
      }).then(r => {
        console.log('[collab] heartbeat track', r)
        if (r === 'timed out' || r === 'error') {
          stuck += 1
          if (stuck >= 2) {
            console.warn('[collab] heartbeat stuck, triggering reconnect')
            stuck = 0
            setReconnectVersion(v => v + 1)
          }
        } else {
          stuck = 0
        }
      }).catch(e => console.warn('[collab] heartbeat failed', e))
    }, 5000)
    return () => clearInterval(heartbeat)
  }, [ready, me?.user_id])

  const sendCode = useCallback((code: string) => {
    const ch = channelRef.current
    if (!ch) {
      console.warn('[collab] sendCode skipped — no channel yet')
      return
    }
    if (!me) return
    console.log('[collab] SEND doc', { length: code.length })
    const result = ch.send({ type: 'broadcast', event: 'doc', payload: { user_id: me.user_id, code } })
    // .send() returns a Promise<RealtimeSendResult>. Await it via
    // .then() so a rejected broadcast is logged instead of being
    // silently dropped — that's a key diagnostic when the other
    // student's typing isn't appearing.
    Promise.resolve(result as unknown as Promise<unknown>).then(
      r => console.log('[collab] doc ack', r),
      e => console.warn('[collab] doc send failed', e),
    )
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
