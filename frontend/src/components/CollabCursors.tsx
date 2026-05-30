'use client'
// ============================================================
// COMMIT PLATFORM — CollabCursors overlay
// ============================================================
// Renders other users' carets + mouse cursors on top of an editor
// container. The container must be position:relative and contain
// the textarea. We render two layers:
//
//   - mouse dots: floating colored arrows + name tag, positioned
//     from a (x, y) tuple relative to the container.
//   - caret bars: vertical colored bars positioned at the line/col
//     of each remote user's caret. Requires the textarea to be
//     monospace (we measure one character once and stride).
//
// All overlay layers are pointer-events:none so they don't steal
// clicks from the textarea underneath.
// ============================================================

import { RefObject, useEffect, useState } from 'react'
import { CollabMember, RemoteCaret, RemoteMouse } from '@/lib/useCollab'
import { colorForUser } from '@/lib/collabColors'

interface Props {
  containerRef: RefObject<HTMLElement | null>
  textareaRef: RefObject<HTMLTextAreaElement | null>
  code: string
  members: CollabMember[]
  carets: Record<string, RemoteCaret>
  mice: Record<string, RemoteMouse>
}

interface CaretMetrics {
  charWidth: number
  lineHeight: number
  paddingTop: number
  paddingLeft: number
}

function offsetToLineCol(code: string, offset: number): { line: number; col: number } {
  let line = 0
  let lastBreak = -1
  const upTo = Math.min(offset, code.length)
  for (let i = 0; i < upTo; i++) {
    if (code.charCodeAt(i) === 10 /* \n */) {
      line += 1
      lastBreak = i
    }
  }
  return { line, col: upTo - (lastBreak + 1) }
}

export default function CollabCursors({ containerRef, textareaRef, code, members, carets, mice }: Props) {
  const [metrics, setMetrics] = useState<CaretMetrics | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  const memberById = new Map(members.map(m => [m.user_id, m]))

  // Measure once after mount and on resize. For a monospace font in
  // a textarea, character width is constant.
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return

    const measure = () => {
      const style = window.getComputedStyle(ta)
      const probe = document.createElement('span')
      probe.style.font = style.font
      probe.style.fontFamily = style.fontFamily
      probe.style.fontSize = style.fontSize
      probe.style.fontWeight = style.fontWeight
      probe.style.letterSpacing = style.letterSpacing
      probe.style.position = 'absolute'
      probe.style.visibility = 'hidden'
      probe.style.whiteSpace = 'pre'
      probe.textContent = 'M'.repeat(20)
      document.body.appendChild(probe)
      const charWidth = probe.getBoundingClientRect().width / 20
      document.body.removeChild(probe)
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5
      const paddingTop = parseFloat(style.paddingTop) || 0
      const paddingLeft = parseFloat(style.paddingLeft) || 0
      setMetrics({ charWidth, lineHeight, paddingTop, paddingLeft })
    }
    measure()

    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [textareaRef])

  // Keep our caret overlays anchored to the same row+col as the
  // user types, by tracking the textarea's scroll.
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    const onScroll = () => {
      setScrollTop(ta.scrollTop)
      setScrollLeft(ta.scrollLeft)
    }
    ta.addEventListener('scroll', onScroll)
    return () => ta.removeEventListener('scroll', onScroll)
  }, [textareaRef])

  return (
    <>
      {/* CARET OVERLAYS — colored bars inside the textarea pane. */}
      {metrics && Object.values(carets).map(caret => {
        const member = memberById.get(caret.user_id)
        const color = colorForUser(caret.user_id)
        const { line, col } = offsetToLineCol(code, caret.selection_start)
        const top = metrics.paddingTop + line * metrics.lineHeight - scrollTop
        const left = metrics.paddingLeft + col * metrics.charWidth - scrollLeft
        // Only render if in the visible area.
        return (
          <div
            key={`caret-${caret.user_id}`}
            style={{
              position: 'absolute',
              top, left,
              width: '2px',
              height: `${metrics.lineHeight}px`,
              background: color.fg,
              pointerEvents: 'none',
              zIndex: 5,
              transition: 'top 80ms linear, left 80ms linear',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: `-${Math.max(14, metrics.lineHeight - 2)}px`,
                left: 0,
                padding: '1px 6px',
                borderRadius: '4px 4px 4px 0',
                background: color.fg,
                color: 'white',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '10px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              {member?.display_name || 'student'}
            </div>
          </div>
        )
      })}

      {/* MOUSE CURSOR OVERLAYS — colored arrow + name tag. */}
      {Object.values(mice).map(m => {
        const member = memberById.get(m.user_id)
        const color = colorForUser(m.user_id)
        return (
          <div
            key={`mouse-${m.user_id}`}
            style={{
              position: 'absolute',
              top: m.y,
              left: m.x,
              pointerEvents: 'none',
              zIndex: 10,
              transform: 'translate(-2px, -2px)',
              transition: 'top 80ms linear, left 80ms linear',
            }}
          >
            {/* Arrow */}
            <svg width="14" height="20" viewBox="0 0 14 20" style={{ display: 'block', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }}>
              <path d="M0 0 L0 16 L4 12 L7 19 L9 18 L6 11 L11 11 Z" fill={color.fg} stroke="white" strokeWidth="0.75" />
            </svg>
            <div
              style={{
                marginTop: '2px',
                marginLeft: '8px',
                padding: '1px 6px',
                borderRadius: '4px 4px 4px 0',
                background: color.fg,
                color: 'white',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '10px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                display: 'inline-block',
              }}
            >
              {member?.display_name || 'student'}
            </div>
          </div>
        )
      })}
    </>
  )
}
