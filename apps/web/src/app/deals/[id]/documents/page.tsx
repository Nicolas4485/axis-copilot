'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deals, knowledge, streamZipUpload, uploadSingleFile, SINGLE_FILE_ACCEPT,
  type DealDocument, type Deal, type ZipSSEEvent,
} from '@/lib/api'
import {
  FileText, AlertTriangle, CheckCircle, Clock, Loader2,
  Trash2, UploadCloud, Archive, ChevronRight, XCircle, RefreshCw, Pencil,
} from 'lucide-react'

// ─── types ────────────────────────────────────────────────────

type UploadState =
  | { phase: 'idle' }
  | { phase: 'extracting'; count: number }
  | { phase: 'ingesting'; done: number; total: number; errors: string[] }
  | { phase: 'done'; succeeded: number; failed: number }
  | { phase: 'error'; message: string }

// ─── helpers ──────────────────────────────────────────────────

const STATUS_ICON: Record<DealDocument['syncStatus'], React.ReactNode> = {
  INDEXED:    <CheckCircle size={13} className="text-emerald-400" />,
  PROCESSING: <Loader2    size={13} className="text-blue-400 animate-spin" />,
  PENDING:    <Clock      size={13} className="text-[var(--text-muted)]" />,
  FAILED:     <XCircle    size={13} className="text-red-400" />,
  CONFLICT:   <AlertTriangle size={13} className="text-amber-400" />,
}

const STATUS_LABEL: Record<DealDocument['syncStatus'], string> = {
  INDEXED:    'Indexed',
  PROCESSING: 'Processing',
  PENDING:    'Pending',
  FAILED:     'Failed',
  CONFLICT:   'Conflict',
}

function mimeIcon(mime: string | null): string {
  if (!mime) return '📄'
  if (mime.includes('pdf'))         return '📕'
  if (mime.includes('word') || mime.includes('docx')) return '📘'
  if (mime.includes('sheet') || mime.includes('xlsx')) return '📗'
  if (mime.includes('presentation') || mime.includes('pptx')) return '📙'
  return '📄'
}

function fmt(n: number, singular: string): string {
  return `${n} ${n === 1 ? singular : singular + 's'}`
}

// ─── page ─────────────────────────────────────────────────────

export default function DealDocumentsPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()

  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [deleting, setDeleting]       = useState<Set<string>>(new Set())
  const [upload, setUpload]           = useState<UploadState>({ phase: 'idle' })
  const [dragOver, setDragOver]       = useState(false)
  const [renamingId, setRenamingId]   = useState<string | null>(null)
  const [renameVal, setRenameVal]     = useState('')
  const [renaming, setRenaming]       = useState(false)
  const renameRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fileRef  = useRef<HTMLInputElement>(null)

  // Focus input when rename starts
  useEffect(() => {
    if (renamingId) renameRef.current?.select()
  }, [renamingId])

  const startRename = (docId: string, currentTitle: string) => {
    setRenamingId(docId)
    setRenameVal(currentTitle)
  }

  const commitRename = async (docId: string) => {
    const title = renameVal.trim()
    if (!title) { setRenamingId(null); return }
    setRenaming(true)
    try {
      await deals.renameDocument(docId, title)
      await qc.invalidateQueries({ queryKey: ['deal-documents', id] })
    } finally {
      setRenaming(false)
      setRenamingId(null)
    }
  }

  const onRenameKey = (e: React.KeyboardEvent, docId: string) => {
    if (e.key === 'Enter')  { e.preventDefault(); void commitRename(docId) }
    if (e.key === 'Escape') { setRenamingId(null) }
  }

  const { data: deal } = useQuery({
    queryKey: ['deal', id],
    queryFn:  () => deals.get(id),
  })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['deal-documents', id],
    queryFn:  () => deals.listDocuments(id),
    staleTime: 30_000,
  })

  const docs = data?.documents ?? []
  const allSelected = docs.length > 0 && docs.every((d) => selected.has(d.id))

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(docs.map((d) => d.id)))
  }

  const toggleOne = (docId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(docId) ? next.delete(docId) : next.add(docId)
      return next
    })
  }

  const deleteDoc = useCallback(async (docId: string) => {
    setDeleting((prev) => new Set(prev).add(docId))
    try {
      await deals.deleteDocument(id, docId)
      await qc.invalidateQueries({ queryKey: ['deal-documents', id] })
      await qc.invalidateQueries({ queryKey: ['deal', id] })
      setSelected((prev) => { const n = new Set(prev); n.delete(docId); return n })
    } finally {
      setDeleting((prev) => { const n = new Set(prev); n.delete(docId); return n })
    }
  }, [id, qc])

  const bulkDelete = async () => {
    if (selected.size === 0) return
    const ids = Array.from(selected)
    await Promise.allSettled(ids.map((docId) => deleteDoc(docId)))
    setSelected(new Set())
  }

  const handleUpload = useCallback((file: File) => {
    const opts = { dealId: id, ...(deal?.clientId ? { clientId: deal.clientId } : {}) }

    // ZIP → streaming bulk ingest
    if (file.name.toLowerCase().endsWith('.zip')) {
      abortRef.current?.abort()
      setUpload({ phase: 'extracting', count: 0 })
      abortRef.current = streamZipUpload(file, opts, (event: ZipSSEEvent) => {
        switch (event.type) {
          case 'extracted':
            setUpload({ phase: 'extracting', count: event.count })
            break
          case 'file_start':
            setUpload((prev) => ({
              phase: 'ingesting', done: 0, total: event.total,
              errors: prev.phase === 'ingesting' ? prev.errors : [],
            }))
            break
          case 'file_done':
            setUpload((prev) => ({
              phase: 'ingesting', done: event.index + 1, total: event.total,
              errors: prev.phase === 'ingesting' ? prev.errors : [],
            }))
            break
          case 'file_error':
            setUpload((prev) => ({
              phase: 'ingesting',
              done:  prev.phase === 'ingesting' ? prev.done : 0,
              total: event.total,
              errors: [...(prev.phase === 'ingesting' ? prev.errors : []), `${event.filename}: ${event.error}`],
            }))
            break
          case 'done':
            setUpload({ phase: 'done', succeeded: event.succeeded, failed: event.failed })
            void qc.invalidateQueries({ queryKey: ['deal-documents', id] })
            void qc.invalidateQueries({ queryKey: ['deal', id] })
            break
          case 'error':
            setUpload({ phase: 'error', message: event.message })
            break
        }
      })
      return
    }

    // Single file (PDF, DOCX, PPTX, etc.) → direct upload
    setUpload({ phase: 'ingesting', done: 0, total: 1, errors: [] })
    uploadSingleFile(file, opts)
      .then(() => {
        setUpload({ phase: 'done', succeeded: 1, failed: 0 })
        void qc.invalidateQueries({ queryKey: ['deal-documents', id] })
        void qc.invalidateQueries({ queryKey: ['deal', id] })
      })
      .catch((err: Error) => {
        setUpload({ phase: 'error', message: err.message })
      })
  }, [id, deal, qc])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }

  // ─── conflict counts via knowledge ─────────────────────────
  const { data: conflictData } = useQuery({
    queryKey: ['conflicts-deal', deal?.clientId],
    queryFn:  () => knowledge.getConflicts(deal!.clientId),
    enabled:  !!deal?.clientId,
    staleTime: 60_000,
  })
  const conflictByDoc = new Map<string, number>()
  conflictData?.conflicts.forEach((c) => {
    conflictByDoc.set(c.sourceDocA, (conflictByDoc.get(c.sourceDocA) ?? 0) + 1)
  })

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
        <Link href="/pipeline" className="hover:text-[var(--text-primary)] transition-colors">Pipeline</Link>
        <ChevronRight size={11} />
        <Link href={`/deals/${id}`} className="hover:text-[var(--text-primary)] transition-colors">
          {deal?.name ?? 'Deal'}
        </Link>
        <ChevronRight size={11} />
        <span className="text-[var(--text-secondary)]">Documents</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">VDR Documents</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {docs.length > 0 ? `${fmt(docs.length, 'document')} indexed` : 'No documents yet'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={() => { void bulkDelete() }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-red-400 border border-red-500/20 bg-red-500/05 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={12} />
              Delete {selected.size} selected
            </button>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 btn-primary text-sm"
          >
            <UploadCloud size={13} />
            Upload
          </button>
          <input ref={fileRef} type="file" accept={SINGLE_FILE_ACCEPT + ',.zip'} className="hidden" onChange={onFileChange} />
        </div>
      </div>

      {/* ZIP upload progress */}
      {upload.phase !== 'idle' && (
        <div
          className="rounded-xl border p-4 space-y-2"
          style={{
            borderColor: upload.phase === 'error' ? 'rgba(239,68,68,0.3)' : upload.phase === 'done' ? 'rgba(52,211,153,0.3)' : 'rgba(99,102,241,0.25)',
            background:  upload.phase === 'error' ? 'rgba(239,68,68,0.06)' : upload.phase === 'done' ? 'rgba(52,211,153,0.06)' : 'rgba(99,102,241,0.06)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {upload.phase === 'extracting' && <Loader2 size={14} className="text-[#6366F1] animate-spin" />}
              {upload.phase === 'ingesting'  && <Loader2 size={14} className="text-[#6366F1] animate-spin" />}
              {upload.phase === 'done'       && <CheckCircle size={14} className="text-emerald-400" />}
              {upload.phase === 'error'      && <XCircle size={14} className="text-red-400" />}
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {upload.phase === 'extracting' && `Extracting${upload.count ? ` — ${upload.count} files found` : '…'}`}
                {upload.phase === 'ingesting'  && `Ingesting ${upload.done} / ${upload.total}…`}
                {upload.phase === 'done'       && `Complete — ${fmt(upload.succeeded, 'document')} indexed${upload.failed > 0 ? `, ${upload.failed} failed` : ''}`}
                {upload.phase === 'error'      && `Upload failed`}
              </span>
            </div>
            {(upload.phase === 'done' || upload.phase === 'error') && (
              <button onClick={() => setUpload({ phase: 'idle' })} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                <XCircle size={14} />
              </button>
            )}
          </div>

          {upload.phase === 'ingesting' && (
            <div className="w-full bg-[rgba(255,255,255,0.06)] rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full bg-[#6366F1] transition-all duration-300"
                style={{ width: `${Math.round((upload.done / upload.total) * 100)}%` }}
              />
            </div>
          )}

          {upload.phase === 'ingesting' && upload.errors.length > 0 && (
            <div className="space-y-0.5">
              {upload.errors.slice(-3).map((e, i) => (
                <p key={i} className="text-xs text-red-400">{e}</p>
              ))}
            </div>
          )}

          {upload.phase === 'error' && (
            <p className="text-xs text-red-400">{upload.message}</p>
          )}
        </div>
      )}

      {/* Drop zone (shown when idle and no docs, or always as hint) */}
      {upload.phase === 'idle' && docs.length === 0 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className="rounded-xl border-2 border-dashed p-12 flex flex-col items-center gap-3 cursor-pointer transition-all duration-200"
          style={{
            borderColor: dragOver ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.08)',
            background:  dragOver ? 'rgba(99,102,241,0.06)' : 'transparent',
          }}
        >
          <UploadCloud size={28} className="text-[var(--text-muted)]" />
          <div className="text-center">
            <p className="text-sm font-medium text-[var(--text-secondary)]">Drop a file here or click to upload</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">PDF, DOCX, PPTX, XLSX, TXT — or a ZIP for bulk upload</p>
          </div>
        </div>
      )}

      {/* Document grid */}
      {docs.length > 0 && (
        <div className="card overflow-hidden">
          {/* Table header */}
          <div
            className="flex items-center gap-3 px-4 py-2.5 border-b text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="w-3.5 h-3.5 rounded accent-[#6366F1]"
            />
            <span className="flex-1">Document</span>
            <span className="w-24 text-center">Status</span>
            <span className="w-20 text-right">Chunks</span>
            <span className="w-20 text-right">Entities</span>
            <span className="w-20 text-right">Conflicts</span>
            <span className="w-8" />
          </div>

          {isLoading ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
              <Loader2 size={18} className="animate-spin mx-auto mb-2" />
              Loading documents…
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
              {docs.map((doc) => {
                const isDeleting = deleting.has(doc.id)
                const conflicts  = conflictByDoc.get(doc.id) ?? doc.conflictCount
                return (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-[rgba(255,255,255,0.02)] transition-colors group"
                    style={{ opacity: isDeleting ? 0.5 : 1 }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(doc.id)}
                      onChange={() => toggleOne(doc.id)}
                      className="w-3.5 h-3.5 rounded accent-[#6366F1]"
                    />
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <span className="text-base">{mimeIcon(doc.mimeType)}</span>
                      <div className="min-w-0 flex-1">
                        {renamingId === doc.id ? (
                          <input
                            ref={renameRef}
                            value={renameVal}
                            onChange={(e) => setRenameVal(e.target.value)}
                            onKeyDown={(e) => onRenameKey(e, doc.id)}
                            onBlur={() => { void commitRename(doc.id) }}
                            disabled={renaming}
                            className="w-full text-sm bg-transparent border-b border-[#6366F1] outline-none text-[var(--text-primary)] pb-0.5"
                          />
                        ) : (
                          <p
                            className="text-sm text-[var(--text-primary)] truncate cursor-default"
                            title={doc.title ?? undefined}
                          >
                            {doc.title || <span className="italic text-[var(--text-muted)]">(untitled)</span>}
                          </p>
                        )}
                        <p className="text-xs text-[var(--text-muted)]">
                          {doc.sourceType} · {new Date(doc.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="w-24 flex items-center justify-center gap-1.5">
                      {STATUS_ICON[doc.syncStatus]}
                      <span className="text-xs text-[var(--text-muted)]">{STATUS_LABEL[doc.syncStatus]}</span>
                    </div>

                    {/* Chunks */}
                    <div className="w-20 text-right text-xs text-[var(--text-muted)]">
                      {doc.chunkCount}
                    </div>

                    {/* Entities */}
                    <div className="w-20 text-right text-xs text-[var(--text-muted)]">
                      {doc.entityCount}
                    </div>

                    {/* Conflicts */}
                    <div className="w-20 text-right">
                      {conflicts > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                          <AlertTriangle size={11} />
                          {conflicts}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">—</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        title="Rename"
                        onClick={() => startRename(doc.id, doc.title ?? '')}
                        className="text-[var(--text-muted)] hover:text-[#6366F1] transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Pencil size={12} />
                      </button>
                      {doc.syncStatus === 'FAILED' ? (
                        <button
                          title="Retry"
                          className="text-[var(--text-muted)] hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100"
                          onClick={() => { void refetch() }}
                        >
                          <RefreshCw size={13} />
                        </button>
                      ) : (
                        <button
                          title="Delete"
                          disabled={isDeleting}
                          onClick={() => { void deleteDoc(doc.id) }}
                          className="text-[var(--text-muted)] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Footer: drag-to-add hint */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className="px-4 py-3 border-t flex items-center justify-between transition-colors"
            style={{
              borderColor: dragOver ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)',
              background:  dragOver ? 'rgba(99,102,241,0.04)' : 'transparent',
            }}
          >
            <p className="text-xs text-[var(--text-muted)]">Drop files to add more documents</p>
            <button
              onClick={() => { void refetch() }}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title="Refresh"
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Add more when already has docs */}
      {docs.length > 0 && upload.phase === 'idle' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className="rounded-xl border border-dashed p-4 flex items-center gap-3 cursor-pointer transition-colors"
          style={{
            borderColor: dragOver ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.06)',
          }}
          onClick={() => fileRef.current?.click()}
        >
          <Archive size={14} className="text-[var(--text-muted)]" />
          <p className="text-xs text-[var(--text-muted)]">Drop a file or ZIP to add more documents</p>
        </div>
      )}
    </div>
  )
}
