'use client'
import { useMemo } from 'react'
import { diffLines, Change } from 'diff'

interface Props {
  oldCode: string
  newCode: string
  oldLabel?: string
  newLabel?: string
}

export default function DiffViewer({ oldCode, newCode, oldLabel = 'before', newLabel = 'after' }: Props) {
  const changes = useMemo(() => diffLines(oldCode, newCode), [oldCode, newCode])

  const added = changes.filter(c => c.added).reduce((n, c) => n + (c.count || 0), 0)
  const removed = changes.filter(c => c.removed).reduce((n, c) => n + (c.count || 0), 0)

  return (
    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '13px', lineHeight: 1.7 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* STATS BAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 1rem', background: '#2A2A2C', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>{oldLabel}</span>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>→</span>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>{newLabel}</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
          {added > 0 && (
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#22C55E' }}>+{added} line{added !== 1 ? 's' : ''}</span>
          )}
          {removed > 0 && (
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#F09595' }}>-{removed} line{removed !== 1 ? 's' : ''}</span>
          )}
          {added === 0 && removed === 0 && (
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>no changes</span>
          )}
        </div>
      </div>

      {/* DIFF LINES */}
      <div style={{ overflowX: 'auto' }}>
        {changes.map((change: Change, i: number) => {
          const lines = change.value.split('\n').filter((_, idx, arr) => idx < arr.length - 1 || change.value.endsWith('\n') ? true : idx < arr.length - 1)
          const bg = change.added ? 'rgba(34,197,94,0.12)' : change.removed ? 'rgba(240,149,149,0.12)' : 'transparent'
          const borderColor = change.added ? 'rgba(34,197,94,0.4)' : change.removed ? 'rgba(240,149,149,0.4)' : 'transparent'
          const textColor = change.added ? '#9FE1CB' : change.removed ? '#F09595' : 'rgba(255,255,255,0.75)'
          const prefix = change.added ? '+' : change.removed ? '-' : ' '

          return lines.map((line, j) => (
            <div key={`${i}-${j}`} style={{ display: 'flex', background: bg, borderLeft: `3px solid ${borderColor}` }}>
              <span style={{ minWidth: '28px', padding: '0 8px', color: change.added ? '#22C55E' : change.removed ? '#F09595' : 'rgba(255,255,255,0.2)', userSelect: 'none', flexShrink: 0, textAlign: 'center' }}>
                {prefix}
              </span>
              <span style={{ color: textColor, padding: '0 8px 0 4px', whiteSpace: 'pre', flex: 1 }}>
                {line || ' '}
              </span>
            </div>
          ))
        })}
      </div>
    </div>
  )
}