'use client'

import { useState, useRef } from 'react'
import { MessageCircle, X, Send, ChevronDown, ChevronRight } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────

export interface Annotation {
  id: string
  messageId: string
  author: string
  text: string
  createdAt: string
  resolved: boolean
}

interface AnnotationThreadProps {
  messageId: string
  annotations: Annotation[]
  onAdd: (messageId: string, text: string) => void
  onResolve: (id: string) => void
}

// ─── Thread ───────────────────────────────────────────────────

function AnnotationThread({ messageId, annotations, onAdd, onResolve }: AnnotationThreadProps) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const unresolved = annotations.filter((a) => !a.resolved)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    onAdd(messageId, input.trim())
    setInput('')
  }

  const handleOpen = () => {
    setOpen((o) => !o)
    if (!open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
      >
        <MessageCircle size={12} />
        {unresolved.length > 0 ? (
          <span className="text-[var(--gold)]">{unresolved.length} note{unresolved.length > 1 ? 's' : ''}</span>
        ) : (
          <span>Add note</span>
        )}
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>

      {open && (
        <div className="mt-2 ml-2 border-l border-[var(--border)] pl-3 space-y-2">
          {annotations.map((a) => (
            <div
              key={a.id}
              className={`text-xs ${a.resolved ? 'opacity-40' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--gold)]">{a.author}</span>
                <div className="flex items-center gap-1">
                  <span className="text-[var(--text-muted)]">
                    {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {!a.resolved && (
                    <button
                      onClick={() => onResolve(a.id)}
                      className="text-[var(--text-muted)] hover:text-[var(--success)] transition-colors"
                      title="Resolve"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              </div>
              <p className={`mt-0.5 ${a.resolved ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'}`}>
                {a.text}
              </p>
            </div>
          ))}

          <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Add a note…"
              className="flex-1 text-xs bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-2 py-1.5
                         text-[var(--text-primary)] placeholder-[var(--text-muted)]
                         focus:outline-none focus:border-[var(--gold)] transition-colors"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--gold)] disabled:opacity-30 transition-colors"
            >
              <Send size={12} />
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

// ─── Manager hook ─────────────────────────────────────────────

export function useAnnotations() {
  const [annotations, setAnnotations] = useState<Annotation[]>([])

  const addAnnotation = (messageId: string, text: string) => {
    const entry: Annotation = {
      id: crypto.randomUUID(),
      messageId,
      author: 'You',
      text,
      createdAt: new Date().toISOString(),
      resolved: false,
    }
    setAnnotations((prev) => [...prev, entry])
  }

  const resolveAnnotation = (id: string) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, resolved: true } : a))
    )
  }

  const getForMessage = (messageId: string) =>
    annotations.filter((a) => a.messageId === messageId)

  return { annotations, addAnnotation, resolveAnnotation, getForMessage }
}

// ─── Exports ──────────────────────────────────────────────────

export { AnnotationThread }
