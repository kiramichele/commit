// ============================================================
// COMMIT PLATFORM — Name Display Helper
// ============================================================
// Per-classroom setting controls how much of a student's name shows
// up next to their posts/comments on the discussion board.
//
// Profiles only have a single display_name field, so we split on
// whitespace: first word is the first name, last word is the last
// name. A single-word name returns as-is for every mode.
// ============================================================

export type NameDisplayMode = 'first_name' | 'first_last_initial' | 'full_name'

export function formatDisplayName(
  displayName: string | null | undefined,
  mode: NameDisplayMode,
): string {
  const name = (displayName || '').trim()
  if (!name) return 'Student'
  const parts = name.split(/\s+/)
  if (parts.length === 1) return name
  if (mode === 'full_name') return name
  if (mode === 'first_last_initial') {
    const last = parts[parts.length - 1]
    return `${parts[0]} ${last[0]?.toUpperCase() || ''}.`
  }
  return parts[0]
}
