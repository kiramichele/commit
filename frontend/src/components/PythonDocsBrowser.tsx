'use client'
import { useState, useEffect, useRef } from 'react'
import { PYTHON_DOCS } from '@/lib/pythonDocs'

interface Props {
  /** Optional initial search query (e.g. when called from an error panel). */
  initialSearch?: string
  /** Called when the user clicks 'try it in practice →' on an example.
   *  When not provided, the button is hidden. */
  onTryInPractice?: (code: string) => void
}

/**
 * Browseable Python reference — searchable, collapsible per-entry, copies
 * directly from the shared PYTHON_DOCS data. Shared between the lesson
 * docs tab, the standalone /docs page, and any future docs surface.
 */
export default function PythonDocsBrowser({ initialSearch = '', onTryInPractice }: Props) {
  const [search, setSearch] = useState(initialSearch)
  const [expanded, setExpanded] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // If an initial search was provided, expand the first match + scroll to it.
  useEffect(() => {
    if (!initialSearch) return
    setSearch(initialSearch)
    setTimeout(() => {
      const el = containerRef.current?.querySelector(`[data-docs-key="${initialSearch}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        ;(el as HTMLElement).click()
      }
    }, 250)
  }, [initialSearch])

  const filtered = PYTHON_DOCS.map(cat => ({
    ...cat,
    items: cat.items.filter(item =>
      !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.desc.toLowerCase().includes(search.toLowerCase()) ||
      item.syntax.toLowerCase().includes(search.toLowerCase())
    )
  })).filter(cat => cat.items.length > 0)

  return (
    <div ref={containerRef}>
      <div style={{ marginBottom: '1.25rem' }}>
        <input
          type="text"
          placeholder="search python docs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '10px 16px', borderRadius: '10px', border: '1.5px solid rgba(14,45,110,0.12)', fontSize: '14px', outline: 'none', background: 'white', fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', color: '#888780', fontSize: '14px' }}>
            no matches for "{search}"
          </div>
        ) : filtered.map(cat => (
          <div key={cat.category} style={{ background: 'white', borderRadius: '12px', border: '1px solid rgba(14,45,110,0.08)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 1.25rem', background: '#F8F7F5', borderBottom: '1px solid rgba(14,45,110,0.06)', fontSize: '12px', fontWeight: 700, color: '#0E2D6E', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {cat.category}
            </div>
            {cat.items.map((item, i) => {
              const key = `${cat.category}-${item.name}`
              const open = expanded === key
              return (
                <div key={item.name} data-docs-key={item.name} style={{ borderBottom: i < cat.items.length - 1 ? '1px solid rgba(14,45,110,0.05)' : 'none' }}>
                  <div
                    onClick={() => setExpanded(open ? null : key)}
                    style={{ padding: '10px 1.25rem', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flexWrap: 'wrap' }}
                  >
                    <code style={{ fontSize: '13px', fontFamily: "'DM Mono', monospace", color: '#1A56DB', background: '#EBF1FD', padding: '2px 8px', borderRadius: '4px', flexShrink: 0 }}>{item.syntax}</code>
                    <span style={{ fontSize: '13px', color: '#0E2D6E', fontWeight: 500 }}>{item.name}</span>
                    <span style={{ fontSize: '12px', color: '#888780', marginLeft: 'auto' }}>{item.desc}</span>
                    <span style={{ color: '#888780', fontSize: '12px', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
                  </div>
                  {open && (
                    <div style={{ padding: '0 1.25rem 12px' }}>
                      <pre style={{ margin: 0, background: '#1C1C1E', color: '#9FE1CB', fontFamily: "'DM Mono', monospace", fontSize: '13px', lineHeight: 1.8, padding: '12px 16px', borderRadius: '8px', whiteSpace: 'pre-wrap' }}>
                        {item.example}
                      </pre>
                      {onTryInPractice && (
                        <button
                          onClick={() => onTryInPractice(item.example)}
                          style={{ marginTop: '8px', padding: '5px 12px', background: '#EBF1FD', color: '#1A56DB', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                        >
                          try it in practice →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
