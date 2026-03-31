// ============================================================
// COMMIT PLATFORM — Accessibility Utilities
// src/lib/a11y.ts
// ============================================================
// Helpers for screen reader support throughout the app.
// Use these when building new components.
// ============================================================

/**
 * Announces a message to screen readers via an aria-live region.
 * Use for dynamic updates: "Code submitted", "Help request sent", etc.
 */
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
  if (typeof document === 'undefined') return

  const id = `sr-announce-${priority}`
  let el = document.getElementById(id)

  if (!el) {
    el = document.createElement('div')
    el.id = id
    el.setAttribute('aria-live', priority)
    el.setAttribute('aria-atomic', 'true')
    el.setAttribute('role', priority === 'assertive' ? 'alert' : 'status')
    el.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden'
    document.body.appendChild(el)
  }

  // Clear then set to trigger re-announcement
  el.textContent = ''
  setTimeout(() => { if (el) el.textContent = message }, 100)
}

/**
 * Returns aria props for a button that toggles something on/off.
 */
export function toggleAria(label: string, pressed: boolean) {
  return {
    'aria-label': label,
    'aria-pressed': pressed,
    role: 'button' as const,
  }
}

/**
 * Returns aria props for a loading state.
 */
export function loadingAria(isLoading: boolean, loadingLabel = 'loading') {
  return {
    'aria-busy': isLoading,
    'aria-label': isLoading ? loadingLabel : undefined,
  }
}

/**
 * Skip to main content link — renders a visually hidden link
 * that becomes visible on focus for keyboard users.
 * Add this at the top of layout.tsx.
 */
export function SkipToMain() {
  return (
    <a
      href="#main-content"
      style={{
        position: 'absolute',
        left: '-10000px',
        top: 'auto',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
      }}
      onFocus={e => {
        const el = e.currentTarget
        el.style.cssText = 'position:fixed;top:8px;left:8px;width:auto;height:auto;padding:8px 16px;background:#1A56DB;color:white;borderRadius:8px;fontWeight:600;fontSize:14px;zIndex:9999;overflow:visible'
      }}
      onBlur={e => {
        const el = e.currentTarget
        el.style.cssText = 'position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden'
      }}
    >
      skip to main content
    </a>
  )
}

/**
 * Screen-reader-only text. Use for icons that need labels.
 * Example: <button><IconRun /><SROnly>Run code</SROnly></button>
 */
export function SROnly({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      position: 'absolute',
      left: '-10000px',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
    }}>
      {children}
    </span>
  )
}