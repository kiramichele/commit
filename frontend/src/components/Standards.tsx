'use client'
import { useState, useMemo } from 'react'
import { BIG_IDEAS, getStandardMeta } from '@/lib/apCspStandards'

// ── STANDARDS BADGE ──────────────────────────────────────────
// Shows a single standard tag anywhere in the UI

export function StandardsBadge({ code, showDescription = false }: { code: string; showDescription?: boolean }) {
  const meta = getStandardMeta(code)
  return (
    <span
      title={meta.description}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        fontSize: '11px', fontWeight: 700,
        padding: '2px 8px', borderRadius: '99px',
        background: meta.bg, color: meta.color,
        fontFamily: "'DM Mono', monospace",
        cursor: showDescription ? 'help' : 'default',
        whiteSpace: 'nowrap',
      }}
    >
      {code}
    </span>
  )
}

// ── STANDARDS BADGES LIST ────────────────────────────────────
// Renders a list of tags — use on assignment cards, lesson rows, etc.

export function StandardsBadgeList({ tags, max = 3 }: { tags: string[]; max?: number }) {
  if (!tags || tags.length === 0) return null
  const visible = tags.slice(0, max)
  const hidden = tags.length - max

  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
      {visible.map(tag => <StandardsBadge key={tag} code={tag} showDescription />)}
      {hidden > 0 && (
        <span style={{ fontSize: '11px', color: '#888780', fontWeight: 500 }}>+{hidden} more</span>
      )}
    </div>
  )
}

// ── STANDARDS PICKER ─────────────────────────────────────────
// Full picker for assignment create/edit modal

interface PickerProps {
  selected: string[]
  onChange: (tags: string[]) => void
}

export function StandardsPicker({ selected, onChange }: PickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedBigIdea, setExpandedBigIdea] = useState<string | null>(null)

  const toggle = (code: string) => {
    if (selected.includes(code)) {
      onChange(selected.filter(s => s !== code))
    } else {
      onChange([...selected, code])
    }
  }

  const filteredIdeas = useMemo(() => {
    if (!search) return BIG_IDEAS
    const q = search.toLowerCase()
    return BIG_IDEAS.map(idea => ({
      ...idea,
      objectives: idea.objectives.filter(
        o => o.code.toLowerCase().includes(q) || o.description.toLowerCase().includes(q)
      )
    })).filter(idea => idea.objectives.length > 0)
  }, [search])

  return (
    <div>
      {/* TRIGGER */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '9px 12px',
          borderRadius: '8px', border: '1.5px solid rgba(14,45,110,0.12)',
          background: 'white', textAlign: 'left', cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif", fontSize: '14px',
          color: selected.length > 0 ? '#0E2D6E' : '#888780',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span>
          {selected.length > 0
            ? `${selected.length} standard${selected.length !== 1 ? 's' : ''} selected`
            : 'select learning objectives...'
          }
        </span>
        <span style={{ color: '#888780', fontSize: '12px' }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* SELECTED TAGS */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '8px' }}>
          {selected.map(code => (
            <span
              key={code}
              onClick={() => toggle(code)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                fontSize: '11px', fontWeight: 700,
                padding: '3px 8px', borderRadius: '99px',
                background: getStandardMeta(code).bg,
                color: getStandardMeta(code).color,
                fontFamily: "'DM Mono', monospace",
                cursor: 'pointer',
              }}
            >
              {code} ×
            </span>
          ))}
        </div>
      )}

      {/* DROPDOWN */}
      {open && (
        <div style={{
          marginTop: '4px', background: 'white',
          border: '1.5px solid rgba(14,45,110,0.12)',
          borderRadius: '10px', overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(14,45,110,0.1)',
          maxHeight: '380px', overflowY: 'auto',
        }}>
          {/* SEARCH */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(14,45,110,0.06)', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search objectives..."
              style={{
                width: '100%', padding: '7px 10px',
                borderRadius: '6px', border: '1px solid rgba(14,45,110,0.12)',
                fontSize: '13px', outline: 'none',
                fontFamily: "'DM Sans', sans-serif",
                boxSizing: 'border-box' as const,
              }}
            />
          </div>

          {/* BIG IDEAS */}
          {filteredIdeas.map(idea => (
            <div key={idea.code}>
              {/* BIG IDEA HEADER */}
              <div
                onClick={() => setExpandedBigIdea(e => e === idea.code ? null : idea.code)}
                style={{
                  padding: '10px 14px', cursor: 'pointer',
                  background: expandedBigIdea === idea.code ? idea.bg : '#F8F7F5',
                  borderBottom: '1px solid rgba(14,45,110,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: idea.bg, color: idea.color, fontFamily: "'DM Mono', monospace" }}>
                    {idea.code}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#0E2D6E' }}>{idea.name}</span>
                  {idea.objectives.filter(o => selected.includes(o.code)).length > 0 && (
                    <span style={{ fontSize: '11px', fontWeight: 600, color: idea.color }}>
                      {idea.objectives.filter(o => selected.includes(o.code)).length} selected
                    </span>
                  )}
                </div>
                <span style={{ color: '#888780', fontSize: '11px' }}>
                  {expandedBigIdea === idea.code ? '▲' : '▼'}
                </span>
              </div>

              {/* OBJECTIVES */}
              {(expandedBigIdea === idea.code || search) && (
                <div>
                  {idea.objectives.map(obj => {
                    const isSelected = selected.includes(obj.code)
                    return (
                      <div
                        key={obj.code}
                        onClick={() => toggle(obj.code)}
                        style={{
                          padding: '9px 14px 9px 28px',
                          borderBottom: '1px solid rgba(14,45,110,0.04)',
                          cursor: 'pointer',
                          background: isSelected ? idea.bg : 'white',
                          display: 'flex', alignItems: 'flex-start', gap: '10px',
                          transition: 'background 0.1s',
                        }}
                      >
                        <div style={{
                          width: '16px', height: '16px', borderRadius: '4px',
                          border: `2px solid ${isSelected ? idea.color : '#D3D1C7'}`,
                          background: isSelected ? idea.color : 'white',
                          flexShrink: 0, marginTop: '1px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isSelected && (
                            <span style={{ color: 'white', fontSize: '9px', fontWeight: 700 }}>✓</span>
                          )}
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: idea.color, fontFamily: "'DM Mono', monospace", marginRight: '6px' }}>
                            {obj.code}
                          </span>
                          <span style={{ fontSize: '12px', color: '#5F5E5A', lineHeight: 1.5 }}>
                            {obj.description}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}