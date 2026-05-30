'use client'
// ============================================================
// COMMIT PLATFORM — CollabPresence
// ============================================================
// Tiny avatar pile shown above the editor: who's currently in
// the collab session. Each avatar gets a ring tinted with the
// user's stable collab color so it lines up with their caret +
// mouse cursor.
// ============================================================

import { CollabMember } from '@/lib/useCollab'
import { colorForUser } from '@/lib/collabColors'

interface Props {
  members: CollabMember[]
  meUserId: string | null
}

export default function CollabPresence({ members, meUserId }: Props) {
  if (members.length === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
        live · {members.length}
      </span>
      <div style={{ display: 'flex' }}>
        {members.map(m => {
          const color = colorForUser(m.user_id)
          const isMe = m.user_id === meUserId
          const initial = (m.display_name || '?').trim().charAt(0).toUpperCase()
          return (
            <div
              key={m.user_id}
              title={isMe ? `${m.display_name} (you)` : m.display_name}
              style={{
                width: '24px', height: '24px', borderRadius: '50%',
                background: m.avatar_url ? 'transparent' : color.bg,
                color: color.fg,
                border: `2px solid ${color.fg}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '11px',
                marginLeft: '-6px', overflow: 'hidden', boxSizing: 'border-box',
              }}
            >
              {m.avatar_url
                ? <img src={m.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initial}
            </div>
          )
        })}
      </div>
    </div>
  )
}
