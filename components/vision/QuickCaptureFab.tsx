'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface ParentOption {
  id: string
  label: string
}

interface QuickCaptureFabProps {
  sessionId: string
  parentOptions?: ParentOption[]
  onCreated?: (node: { id: string; label: string }) => void
}

export default function QuickCaptureFab({
  sessionId,
  parentOptions = [],
  onCreated,
}: QuickCaptureFabProps) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [parentId, setParentId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus input when panel opens
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const reset = useCallback(() => {
    setLabel('')
    setParentId('')
    setError(null)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = label.trim()
    if (!trimmed) return

    setSubmitting(true)
    setError(null)

    try {
      const body: Record<string, unknown> = {
        session_id: sessionId,
        label: trimmed,
        node_type: 'idea',
      }

      const res = await fetch('/api/vision/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Failed to create (${res.status})`)
      }

      const { data: node } = await res.json()

      // If parent selected, create a hierarchy edge
      if (parentId) {
        await fetch('/api/vision/edges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            source_node_id: parentId,
            target_node_id: node.id,
            edge_type: 'hierarchy',
          }),
        })
      }

      onCreated?.(node)
      reset()
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="quick-capture-fab" style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000 }}>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Quick capture"
          style={{
            position: 'absolute',
            bottom: 64,
            right: 0,
            width: 320,
            background: 'var(--bg-surface, #fff)',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 12,
            boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
            padding: 16,
          }}
        >
          <form onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Capture an idea…"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={submitting}
              maxLength={200}
              aria-label="Idea title"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 15,
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: 8,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />

            {parentOptions.length > 0 && (
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                disabled={submitting}
                aria-label="Parent node"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  marginTop: 8,
                  fontSize: 14,
                  border: '1px solid var(--border, #e2e8f0)',
                  borderRadius: 8,
                  background: 'var(--bg-surface, #fff)',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">No parent</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            )}

            {error && (
              <p role="alert" style={{ color: '#e53e3e', fontSize: 13, margin: '8px 0 0' }}>
                {error}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => { reset(); setOpen(false) }}
                disabled={submitting}
                style={{
                  padding: '8px 16px',
                  fontSize: 14,
                  borderRadius: 8,
                  border: '1px solid var(--border, #e2e8f0)',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !label.trim()}
                style={{
                  padding: '8px 16px',
                  fontSize: 14,
                  borderRadius: 8,
                  border: 'none',
                  background: submitting || !label.trim() ? '#a0aec0' : '#3182ce',
                  color: '#fff',
                  cursor: submitting || !label.trim() ? 'default' : 'pointer',
                }}
              >
                {submitting ? 'Saving…' : 'Capture'}
              </button>
            </div>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close quick capture' : 'Quick capture new idea'}
        aria-expanded={open}
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          background: '#3182ce',
          color: '#fff',
          fontSize: 28,
          lineHeight: 1,
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(49,130,206,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s, background 0.2s',
          transform: open ? 'rotate(45deg)' : 'none',
        }}
      >
        +
      </button>
    </div>
  )
}
