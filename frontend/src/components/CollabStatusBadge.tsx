'use client'
// ============================================================
// COMMIT PLATFORM — CollabStatusBadge
// ============================================================
// Always-visible pill that reports what the realtime channel is
// doing. Helps differentiate:
//
//   - "no group"           — student hasn't joined a group yet
//   - "connecting…"        — channel is mounting but hasn't subscribed
//   - "live · alone"       — channel subscribed but no peers present
//   - "live · 2 here"      — channel subscribed AND a peer is present
//
// Without this it's impossible to tell at a glance whether realtime
// is even attempting to connect.
// ============================================================

import { CollabMember } from '@/lib/useCollab'

interface Props {
  hasGroup: boolean
  ready: boolean
  members: CollabMember[]
  meUserId: string | null
}

export default function CollabStatusBadge({ hasGroup, ready, members, meUserId }: Props) {
  let label: string
  let dotColor: string
  let textColor: string
  let bg: string

  if (!hasGroup) {
    label = 'collab · no group'
    dotColor = '#D3D1C7'
    textColor = 'rgba(255,255,255,0.5)'
    bg = 'rgba(255,255,255,0.08)'
  } else if (!ready) {
    label = 'collab · connecting...'
    dotColor = '#F59E0B'
    textColor = '#FDE68A'
    bg = 'rgba(245,158,11,0.15)'
  } else {
    const peers = members.filter(m => m.user_id !== meUserId)
    if (peers.length === 0) {
      label = 'collab · live, alone'
      dotColor = '#22C55E'
      textColor = '#86EFAC'
      bg = 'rgba(34,197,94,0.15)'
    } else {
      label = `collab · live · ${peers.length} other${peers.length === 1 ? '' : 's'} here`
      dotColor = '#22C55E'
      textColor = '#86EFAC'
      bg = 'rgba(34,197,94,0.2)'
    }
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: '99px', background: bg, fontSize: '11px', fontWeight: 600, color: textColor, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: dotColor }} />
      {label}
    </div>
  )
}
