'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload, Trash2, CheckCircle, FileText, AlertCircle } from 'lucide-react'

interface TemplateInfo {
  id: string
  name: string
  createdAt: string
  themeJson: {
    colors: { primary: string; secondary: string; accent: string }
    fonts:  { heading: string; body: string }
  }
}

export function PitchDeckTemplateSettings() {
  const [template, setTemplate]   = useState<TemplateInfo | null>(null)
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void fetchTemplate()
  }, [])

  async function fetchTemplate() {
    try {
      const res = await fetch('/api/pitch-deck/template', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json() as { template: TemplateInfo | null }
        setTemplate(data.template)
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload(file: File) {
    if (!file.name.toLowerCase().endsWith('.pptx')) {
      setError('Only .pptx files are accepted — PDF cannot be used as a template.')
      return
    }

    setUploading(true)
    setError(null)
    setSuccess(null)

    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch('/api/pitch-deck/template', {
        method: 'POST',
        credentials: 'include',
        body: form,
      })

      const data = await res.json() as { template?: TemplateInfo; error?: string; details?: string }

      if (!res.ok) {
        setError(data.error ?? 'Upload failed')
        return
      }

      setTemplate(data.template ?? null)
      setSuccess(`Template uploaded — ${data.template?.name}. Brand colours and fonts extracted.`)
    } catch {
      setError('Network error — check your connection and try again.')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/pitch-deck/template', {
        method: 'DELETE',
        credentials: 'include',
      })

      if (res.ok) {
        setTemplate(null)
        setSuccess('Template removed — decks will use default AXIS styling.')
      } else {
        setError('Failed to remove template.')
      }
    } catch {
      setError('Network error — check your connection and try again.')
    } finally {
      setDeleting(false)
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void handleUpload(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) void handleUpload(file)
  }

  if (loading) {
    return <div className="h-32 rounded-xl bg-[var(--bg-secondary)] animate-pulse" />
  }

  return (
    <div className="space-y-4">
      {/* Current template */}
      {template ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--gold)]/10 flex items-center justify-center shrink-0">
                <FileText size={16} className="text-[var(--gold)]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{template.name}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Uploaded {new Date(template.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <button
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              <Trash2 size={13} />
              {deleting ? 'Removing…' : 'Remove'}
            </button>
          </div>

          {/* Extracted theme preview */}
          <div className="space-y-2">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Extracted theme</p>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(template.themeJson.colors).map(([key, hex]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div
                    className="w-5 h-5 rounded border border-[var(--border)]"
                    style={{ backgroundColor: `#${hex}` }}
                  />
                  <span className="text-xs text-[var(--text-muted)] capitalize">{key}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Heading: <span className="text-[var(--text-secondary)]">{template.themeJson.fonts.heading}</span>
              {' · '}
              Body: <span className="text-[var(--text-secondary)]">{template.themeJson.fonts.body}</span>
            </p>
          </div>

          {/* Replace button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full py-2 rounded-lg border border-dashed border-[var(--border)] text-xs text-[var(--text-muted)] hover:border-[var(--gold)] hover:text-[var(--gold)] transition-colors disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : 'Replace template (.pptx only)'}
          </button>
        </div>
      ) : (
        /* Drop zone — no template yet */
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="rounded-xl border-2 border-dashed border-[var(--border)] p-8 text-center cursor-pointer hover:border-[var(--gold)] hover:bg-[var(--gold)]/5 transition-colors group"
        >
          <div className="w-12 h-12 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center mx-auto mb-3 group-hover:bg-[var(--gold)]/10 transition-colors">
            <Upload size={20} className="text-[var(--text-muted)] group-hover:text-[var(--gold)] transition-colors" />
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
            {uploading ? 'Uploading…' : 'Drop your .pptx template here'}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            or click to browse · .pptx only · PDF cannot be used
          </p>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        className="hidden"
        onChange={onFileChange}
      />

      {/* Feedback */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <CheckCircle size={14} className="text-green-400 mt-0.5 shrink-0" />
          <p className="text-xs text-green-300">{success}</p>
        </div>
      )}
    </div>
  )
}
