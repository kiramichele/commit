// ============================================================
// COMMIT PLATFORM — Collab Color Assignment
// ============================================================
// Maps a user id → a stable HSL color used to tint that user's
// caret + mouse cursor + presence avatar. Same id always gets the
// same color so it persists across reconnects.
// ============================================================

const PALETTE_HUES = [4, 24, 48, 92, 152, 196, 222, 268, 312, 340]

function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h
}

export function colorForUser(userId: string): { hue: number; fg: string; bg: string } {
  const hue = PALETTE_HUES[fnv1a(userId) % PALETTE_HUES.length]
  return {
    hue,
    fg: `hsl(${hue}, 80%, 38%)`,
    bg: `hsl(${hue}, 70%, 88%)`,
  }
}
