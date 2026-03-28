'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, FileText, AlertTriangle, Wrench } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────

export interface ContextSource {
  sourceTitle: string
  content: string
  relevanceScore: number
}

export interface ToolActivity {
  tool: string
  status: 'running' | 'completed' | 'error'
}

export interface ContextConflict {
  description?: string
  [key: string]: unknown
}

interface ContextPanelProps {
  sources: ContextSource[]
  toolActivity: ToolActivity[]
  conflicts: ContextConflict[]
}

// ─── Component ────────────────────────────────────────────────

export function ContextPanel({ sources, toolActivity, conflicts }: ContextPanelProps) {
  const [showSources, setShowSources] = useState(false)
  const [showTools, setShowTools] = useState(true)

  const hasContent = sources.length > 0 || toolActivity.length > 0 || conflicts.length > 0

  if (!hasContent) return null

  return (
    <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)]">
      {/* Conflicts */}
      {conflicts.length > 0 && (
        <div className="px-4 py-2 bg-[var(--warning)]/5 border-b border-[var(--warning)]/15">
          <div className="flex items-center gap-2 text-xs text-[var(--warning)]">
            <AlertTriangle size={13} />
            <span>
              {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} detected — verify data before relying on it
            </span>
          </div>
        </div>
      )}

      {/* Tool activity */}
      {toolActivity.length > 0 && (
        <div className="border-b border-[var(--border)]">
          <button
            onClick={() => setShowTools((s) => !s)}
            className="flex items-center gap-2 px-4 py-2 w-full text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            {showTools ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <Wrench size={13} />
            <span>Tools used</span>
            <span className="ml-auto text-[var(--text-muted)]">
              {toolActivity.filter((t) => t.status === 'completed').length}/{toolActivity.length}
            </span>
          </button>
          {showTools && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {toolActivity.map((t, i) => (
                <span
                  key={i}
                  className={`badge ${
                    t.status === 'completed'
                      ? 'badge-green'
                      : t.status === 'error'
                      ? 'badge-red'
                      : 'badge-gold'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full mr-1.5 inline-block ${
                      t.status === 'running' ? 'animate-pulse bg-[var(--gold)]' : 'bg-current'
                    }`}
                  />
                  {t.tool}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RAG Sources */}
      {sources.length > 0 && (
        <div>
          <button
            onClick={() => setShowSources((s) => !s)}
            className="flex items-center gap-2 px-4 py-2 w-full text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            {showSources ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <FileText size={13} />
            <span>{sources.length} source{sources.length > 1 ? 's' : ''} retrieved</span>
            <span className="ml-auto text-[var(--text-muted)]">
              Top: {Math.round((sources[0]?.relevanceScore ?? 0) * 100)}%
            </span>
          </button>
          {showSources && (
            <div className="px-4 pb-3 space-y-2">
              {sources.map((s, i) => (
                <div key={i} className="card text-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[var(--gold)] font-medium">[{i + 1}] {s.sourceTitle}</span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <div className="w-12 h-1 bg-[var(--border)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--gold)] rounded-full"
                          style={{ width: `${s.relevanceScore * 100}%` }}
                        />
                      </div>
                      <span className="text-[var(--text-muted)]">{Math.round(s.relevanceScore * 100)}%</span>
                    </div>
                  </div>
                  <p className="text-[var(--text-muted)] leading-relaxed line-clamp-3">{s.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
