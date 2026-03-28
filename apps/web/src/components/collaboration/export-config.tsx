'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { documentExports } from '@/lib/api'
import { Download, FileText, FileJson, FileCode, X, Check, Loader } from 'lucide-react'

type ExportFormat = 'pdf' | 'markdown' | 'json'

interface Section {
  id: string
  label: string
  defaultEnabled: boolean
}

const SECTIONS: Section[] = [
  { id: 'summary', label: 'Executive Summary', defaultEnabled: true },
  { id: 'transcript', label: 'Full Transcript', defaultEnabled: true },
  { id: 'entities', label: 'Extracted Entities', defaultEnabled: true },
  { id: 'sources', label: 'RAG Sources & Citations', defaultEnabled: true },
  { id: 'cost', label: 'Cost Breakdown', defaultEnabled: false },
  { id: 'metadata', label: 'Session Metadata', defaultEnabled: false },
]

const FORMAT_OPTIONS: Array<{ id: ExportFormat; label: string; desc: string; icon: React.ElementType }> = [
  { id: 'pdf', label: 'PDF', desc: 'Formatted report with branding', icon: FileText },
  { id: 'markdown', label: 'Markdown', desc: 'Plain text, easy to paste', icon: FileCode },
  { id: 'json', label: 'JSON', desc: 'Structured data for integrations', icon: FileJson },
]

interface ExportConfigProps {
  sessionId: string
  sessionTitle?: string
  onClose: () => void
}

export function ExportConfig({ sessionId, sessionTitle, onClose }: ExportConfigProps) {
  const [format, setFormat] = useState<ExportFormat>('markdown')
  const [enabledSections, setEnabledSections] = useState<Set<string>>(
    new Set(SECTIONS.filter((s) => s.defaultEnabled).map((s) => s.id))
  )
  const [exported, setExported] = useState<{ url: string; id: string } | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      documentExports.create({
        sessionId,
        format,
        sections: [...enabledSections],
      }),
    onSuccess: (result) => {
      setExported({ url: result.url, id: result.id })
    },
  })

  const toggleSection = (id: string) => {
    setEnabledSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl w-full max-w-md p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-serif text-lg text-[var(--gold)]">Export Session</h2>
            {sessionTitle && (
              <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{sessionTitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {exported ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--success)]/5 border border-[var(--success)]/20">
              <Check size={16} className="text-[var(--success)] shrink-0" />
              <p className="text-sm text-[var(--success)]">Export ready</p>
            </div>
            <a
              href={exported.url}
              download
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Download size={14} />
              Download {format.toUpperCase()}
            </a>
            <button
              onClick={() => setExported(null)}
              className="btn-secondary w-full"
            >
              Export again
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Format */}
            <div>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">Format</p>
              <div className="grid grid-cols-3 gap-2">
                {FORMAT_OPTIONS.map(({ id, label, desc, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setFormat(id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-colors ${
                      format === id
                        ? 'border-[var(--gold)] bg-[var(--gold)]/5'
                        : 'border-[var(--border)] hover:border-[var(--border-active)]'
                    }`}
                  >
                    <Icon size={18} className={format === id ? 'text-[var(--gold)]' : 'text-[var(--text-muted)]'} />
                    <span className={`text-xs font-medium ${format === id ? 'text-[var(--gold)]' : 'text-[var(--text-primary)]'}`}>
                      {label}
                    </span>
                    <span className="text-xs text-[var(--text-muted)] leading-tight">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Sections */}
            <div>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">Sections</p>
              <div className="space-y-1.5">
                {SECTIONS.map((section) => (
                  <label
                    key={section.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={enabledSections.has(section.id)}
                      onChange={() => toggleSection(section.id)}
                      className="accent-[var(--gold)]"
                    />
                    <span className="text-sm text-[var(--text-primary)]">{section.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Action */}
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || enabledSections.size === 0}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {mutation.isPending ? (
                <>
                  <Loader size={14} className="animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Download size={14} />
                  Generate Export
                </>
              )}
            </button>

            {mutation.isError && (
              <p className="text-xs text-[var(--error)] text-center">
                Export failed — check API connection
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
