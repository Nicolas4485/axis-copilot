'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, FolderOpen, RefreshCw, FileText,
  CheckCircle2, AlertCircle, Loader2, Sparkles, BookOpen,
} from 'lucide-react'

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'

type SyncStatus = 'PENDING' | 'PROCESSING' | 'INDEXED' | 'FAILED' | 'CONFLICT'

interface StyleDocument {
  id: string
  title: string | null
  sourceType: string
  syncStatus: SyncStatus
  chunkCount: number
  createdAt: string
}

interface MyStyleData {
  clientId: string
  docCount: number
  documents: StyleDocument[]
}

type PhaseType = 'scanning' | 'downloading' | 'ingesting' | 'done' | 'error'

interface SyncProgressEvent {
  type: 'progress' | 'done' | 'error'
  phase?: PhaseType
  totalFiles?: number
  processedFiles?: number
  currentFile?: string | null
  message?: string
  result?: {
    totalFiles: number
    ingested: number
    skipped: number
    failed: number
  }
}

function StatusBadge({ status }: { status: SyncStatus }) {
  const map: Record<SyncStatus, { label: string; cls: string }> = {
    INDEXED:    { label: 'Indexed',    cls: 'badge-green' },
    PROCESSING: { label: 'Processing', cls: 'badge-amber' },
    PENDING:    { label: 'Pending',    cls: 'badge-amber' },
    FAILED:     { label: 'Failed',     cls: 'badge-red'   },
    CONFLICT:   { label: 'Conflict',   cls: 'badge-red'   },
  }
  const { label, cls } = map[status] ?? { label: status, cls: '' }
  return <span className={`badge ${cls}`}>{label}</span>
}

export default function MyStylePage() {
  const [data, setData] = useState<MyStyleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [folderName, setFolderName] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncLog, setSyncLog] = useState<string[]>([])
  const [syncDone, setSyncDone] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/my-style`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json() as MyStyleData
      setData(json)
    } catch {
      setError('Failed to load My Style data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [syncLog])

  const startSync = useCallback(async () => {
    if (!folderName.trim() || syncing) return
    setSyncing(true)
    setSyncLog([`Starting sync of folder: "${folderName}"…`])
    setSyncDone(false)
    setSyncError(null)

    try {
      const res = await fetch(`${API_BASE}/api/my-style/sync`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderName: folderName.trim() }),
      })

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({ error: 'Sync failed' })) as { error?: string }
        setSyncError(json.error ?? 'Sync failed')
        setSyncing(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          try {
            const event = JSON.parse(part.slice(6)) as SyncProgressEvent

            if (event.type === 'progress') {
              const phase = event.phase ?? ''
              const current = event.currentFile ? ` — ${event.currentFile}` : ''
              const progress = event.totalFiles
                ? ` (${event.processedFiles ?? 0}/${event.totalFiles})`
                : ''
              setSyncLog(prev => [...prev, `[${phase}]${progress}${current}`])
            } else if (event.type === 'done') {
              const r = event.result
              setSyncLog(prev => [
                ...prev,
                r
                  ? `✅ Done! Ingested: ${r.ingested}, Skipped: ${r.skipped}, Failed: ${r.failed}`
                  : '✅ Sync complete',
              ])
              setSyncDone(true)
              void load()
            } else if (event.type === 'error') {
              setSyncError(event.message ?? 'Unknown error')
              setSyncLog(prev => [...prev, `❌ Error: ${event.message}`])
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      setSyncError(msg)
      setSyncLog(prev => [...prev, `❌ ${msg}`])
    } finally {
      setSyncing(false)
    }
  }, [folderName, syncing, load])

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
        <Link
          href="/knowledge"
          className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft size={13} />
          Knowledge
        </Link>
        <div className="w-px h-4 bg-[var(--border)]" />
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[var(--gold)]" />
          <h1 className="font-serif text-xl text-[var(--gold)]">My Style</h1>
        </div>
        <span className="text-xs text-[var(--text-muted)]">— Your personal writing style knowledge base</span>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* How it works card */}
        <div className="card border border-[var(--gold)]/20 bg-[var(--gold)]/5">
          <div className="flex items-start gap-3">
            <BookOpen size={16} className="text-[var(--gold)] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)] mb-1">How it works</p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Upload your past pitch decks, investment memos, and deal proposals from Google Drive.
                AXIS indexes your writing style, structure, and terminology. At generation time, your
                IC memos and CIM analyses will automatically reference your style — making outputs
                sound like <em>you</em> wrote them, not a generic AI.
              </p>
            </div>
          </div>
        </div>

        {/* Sync from Drive */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen size={16} className="text-[var(--text-muted)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Sync from Google Drive</h2>
          </div>

          <div className="flex gap-3 mb-4">
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void startSync() }}
              placeholder="Folder name (e.g. 'My IC Memos', 'Deal Proposals')"
              className="input flex-1 text-sm"
              disabled={syncing}
            />
            <button
              onClick={startSync}
              disabled={syncing || !folderName.trim()}
              className="btn-primary flex items-center gap-2 text-sm px-4 disabled:opacity-50"
            >
              {syncing ? (
                <><Loader2 size={14} className="animate-spin" /> Syncing…</>
              ) : (
                <><RefreshCw size={14} /> Sync Folder</>
              )}
            </button>
          </div>

          <p className="text-xs text-[var(--text-muted)]">
            Enter the exact name of a Google Drive folder. Make sure Google Drive is connected in{' '}
            <Link href="/settings" className="text-[var(--gold)] hover:underline">Settings</Link>.
          </p>

          {/* Sync log */}
          {syncLog.length > 0 && (
            <div className="mt-4">
              <div
                ref={logRef}
                className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg p-3 h-40 overflow-y-auto font-mono text-xs text-[var(--text-muted)] space-y-0.5"
              >
                {syncLog.map((line, i) => (
                  <div key={i} className={line.startsWith('✅') ? 'text-green-400' : line.startsWith('❌') ? 'text-red-400' : ''}>
                    {line}
                  </div>
                ))}
              </div>

              {syncDone && (
                <div className="flex items-center gap-2 mt-2 text-xs text-green-400">
                  <CheckCircle2 size={12} />
                  Sync complete — your style library has been updated
                </div>
              )}
              {syncError && (
                <div className="flex items-center gap-2 mt-2 text-xs text-red-400">
                  <AlertCircle size={12} />
                  {syncError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Document library */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-[var(--text-muted)]" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Style Library</h2>
              {data && (
                <span className="badge">{data.docCount} document{data.docCount !== 1 ? 's' : ''}</span>
              )}
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1.5"
            >
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-[var(--text-muted)]">
              <Loader2 size={16} className="animate-spin mr-2" />
              Loading…
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-red-400 text-sm">
              <AlertCircle size={14} className="mr-2" />
              {error}
            </div>
          ) : !data || data.documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
              <FolderOpen size={32} className="mb-3 opacity-30" />
              <p className="text-sm mb-1">No style documents indexed yet</p>
              <p className="text-xs">Use the sync form above to import your past work from Google Drive</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {data.documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 py-3">
                  <FileText size={14} className="text-[var(--text-muted)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] truncate">
                      {doc.title ?? 'Untitled'}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {doc.sourceType}
                      {doc.chunkCount > 0 ? ` · ${doc.chunkCount} chunks` : ''}
                      {' · '}
                      {new Date(doc.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <StatusBadge status={doc.syncStatus} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
