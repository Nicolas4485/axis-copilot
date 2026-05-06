'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { deals, knowledge, sessions as sessionsApi, cimAnalysis, type Deal, type DealStage, type Priority } from '@/lib/api'
import {
  MessageSquare, FileText, AlertTriangle, BarChart2,
  ChevronRight, Building2, ArrowUpRight, Edit2, Check, X as XIcon, Zap,
} from 'lucide-react'

type TabId = 'overview' | 'conversations' | 'documents' | 'conflicts' | 'ic_memo'

const TABS: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
  { id: 'overview',       label: 'Overview',       icon: Building2     },
  { id: 'conversations',  label: 'Conversations',  icon: MessageSquare },
  { id: 'documents',      label: 'Documents',      icon: FileText      },
  { id: 'conflicts',      label: 'Conflicts',      icon: AlertTriangle },
  { id: 'ic_memo',        label: 'IC Memo',        icon: BarChart2     },
]

const STAGE_LABELS: Record<DealStage, string> = {
  SOURCING:    'Sourcing',
  SCREENING:   'Screening',
  DILIGENCE:   'Diligence',
  IC_MEMO:     'IC Memo',
  CLOSED_WON:  'Closed Won',
  CLOSED_LOST: 'Closed Lost',
  ON_HOLD:     'On Hold',
}

const STAGE_COLORS: Record<DealStage, string> = {
  SOURCING:    'rgba(148,163,184,0.15)',
  SCREENING:   'rgba(96,165,250,0.15)',
  DILIGENCE:   'rgba(251,191,36,0.15)',
  IC_MEMO:     'rgba(167,139,250,0.15)',
  CLOSED_WON:  'rgba(52,211,153,0.15)',
  CLOSED_LOST: 'rgba(248,113,113,0.12)',
  ON_HOLD:     'rgba(148,163,184,0.1)',
}

const STAGE_TEXT: Record<DealStage, string> = {
  SOURCING:    '#94a3b8',
  SCREENING:   '#60a5fa',
  DILIGENCE:   '#fbbf24',
  IC_MEMO:     '#a78bfa',
  CLOSED_WON:  '#34d399',
  CLOSED_LOST: '#f87171',
  ON_HOLD:     '#94a3b8',
}

const PRIORITY_COLORS: Record<Priority, string> = {
  HIGH:   '#ef4444',
  MEDIUM: '#f59e0b',
  LOW:    '#94a3b8',
}

const ALL_STAGES: DealStage[] = ['SOURCING', 'SCREENING', 'DILIGENCE', 'IC_MEMO', 'CLOSED_WON', 'CLOSED_LOST', 'ON_HOLD']

export default function DealWorkspacePage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const qc      = useQueryClient()

  const [activeTab,    setActiveTab]    = useState<TabId>('overview')
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue,   setNotesValue]   = useState('')
  const [savingNotes,  setSavingNotes]  = useState(false)
  const [stageUpdating, setStageUpdating] = useState(false)
  const [selectedCimDocId, setSelectedCimDocId] = useState<string>('')

  const { data: deal, isLoading } = useQuery({
    queryKey: ['deal', id],
    queryFn:  () => deals.get(id),
  })

  const { data: conflictData } = useQuery({
    queryKey: ['conflicts-deal', deal?.clientId],
    queryFn:  () => knowledge.getConflicts(deal!.clientId),
    enabled:  !!deal?.clientId && activeTab === 'conflicts',
    staleTime: 60_000,
  })

  const unresolvedCount = conflictData?.conflicts.filter((c) => c.status === 'UNRESOLVED').length ?? 0

  const { data: cimLatest } = useQuery({
    queryKey: ['cim-latest', id],
    queryFn: () => cimAnalysis.getLatest(id).catch(() => null),
    staleTime: 5 * 60_000,
    enabled: activeTab === 'documents',
  })

  const handleStageChange = async (stage: DealStage) => {
    if (!deal || stage === deal.stage) return
    setStageUpdating(true)
    try {
      await deals.updateStage(id, stage)
      await qc.invalidateQueries({ queryKey: ['deal', id] })
      await qc.invalidateQueries({ queryKey: ['deals-pipeline'] })
    } finally {
      setStageUpdating(false)
    }
  }

  const startEditNotes = () => {
    setNotesValue(deal?.notes ?? '')
    setEditingNotes(true)
  }

  const saveNotes = async () => {
    setSavingNotes(true)
    try {
      await deals.update(id, { notes: notesValue || null })
      await qc.invalidateQueries({ queryKey: ['deal', id] })
      setEditingNotes(false)
    } finally {
      setSavingNotes(false)
    }
  }

  const createSession = async (mode?: string) => {
    if (!deal) return
    const session = await sessionsApi.create({
      clientId: deal.clientId,
      title: `${deal.name} — ${mode ?? 'Chat'}`,
      ...(mode !== undefined ? { mode } : {}),
    })
    router.push(`/session/${session.id}`)
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <p className="text-[var(--text-muted)]">Loading deal…</p>
      </div>
    )
  }

  if (!deal) {
    return (
      <div className="p-6 text-center">
        <p className="text-[var(--text-muted)]">Deal not found.</p>
        <Link href="/pipeline" className="text-[var(--gold)] text-sm mt-2 inline-block">← Back to Pipeline</Link>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
        <Link href="/pipeline" className="hover:text-[var(--text-primary)] transition-colors">Pipeline</Link>
        <ChevronRight size={11} />
        <Link href={`/clients/${deal.clientId}`} className="hover:text-[var(--text-primary)] transition-colors">
          {deal.client.name}
        </Link>
        <ChevronRight size={11} />
        <span className="text-[var(--text-secondary)]">{deal.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-serif text-3xl text-[var(--text-primary)]">{deal.name}</h1>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Stage dropdown */}
            <div className="relative">
              <select
                value={deal.stage}
                onChange={(e) => { void handleStageChange(e.target.value as DealStage) }}
                disabled={stageUpdating}
                className="appearance-none pl-2.5 pr-6 py-1 rounded-full text-xs font-medium cursor-pointer border-0 outline-none"
                style={{
                  background: STAGE_COLORS[deal.stage],
                  color: STAGE_TEXT[deal.stage],
                }}
              >
                {ALL_STAGES.map((s) => (
                  <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                ))}
              </select>
            </div>

            {/* Priority badge */}
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ background: `${PRIORITY_COLORS[deal.priority]}18`, color: PRIORITY_COLORS[deal.priority] }}
            >
              {deal.priority[0] + deal.priority.slice(1).toLowerCase()} priority
            </span>

            {/* Metadata */}
            {deal.sector && (
              <span className="text-xs text-[var(--text-muted)]">{deal.sector}</span>
            )}
            {deal.dealSize && (
              <span className="text-xs text-[var(--text-muted)]">{deal.dealSize}</span>
            )}

            <Link
              href={`/clients/${deal.clientId}`}
              className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors"
            >
              <Building2 size={11} />
              {deal.client.name}
              <ArrowUpRight size={10} />
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-[rgba(255,255,255,0.06)] -mb-6 pb-0">
        {TABS.map((tab) => {
          const Icon    = tab.icon
          const active  = activeTab === tab.id
          const showBadge = tab.id === 'conflicts' && unresolvedCount > 0
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative flex items-center gap-1.5 px-4 py-2.5 text-sm transition-all duration-150"
              style={{
                color:       active ? 'var(--text-primary)' : 'var(--text-muted)',
                borderBottom: active ? '2px solid var(--gold)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              <Icon size={13} />
              {tab.label}
              {showBadge && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-500/20 text-red-400">
                  {unresolvedCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="pt-4">

        {/* ── Overview ── */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Left: Notes + metadata */}
            <div className="md:col-span-2 space-y-4">
              {/* Notes */}
              <div className="card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Notes</p>
                  {!editingNotes ? (
                    <button onClick={startEditNotes} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                      <Edit2 size={12} />
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={() => { void saveNotes() }} disabled={savingNotes} className="text-green-400 hover:text-green-300 transition-colors">
                        <Check size={12} />
                      </button>
                      <button onClick={() => setEditingNotes(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                        <XIcon size={12} />
                      </button>
                    </div>
                  )}
                </div>
                {editingNotes ? (
                  <textarea
                    value={notesValue}
                    onChange={(e) => setNotesValue(e.target.value)}
                    rows={4}
                    className="input w-full resize-none text-sm"
                    placeholder="Add notes about this deal…"
                    autoFocus
                  />
                ) : (
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed min-h-[3rem]">
                    {deal.notes ?? <span className="text-[var(--text-muted)] italic">No notes yet — click to add</span>}
                  </p>
                )}
              </div>

              {/* Deal details */}
              <div className="card p-4">
                <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">Deal Details</p>
                <div className="space-y-2">
                  {[
                    { label: 'Sector',       value: deal.sector    },
                    { label: 'Size',         value: deal.dealSize  },
                    { label: 'Target Close', value: deal.targetClose ? new Date(deal.targetClose).toLocaleDateString() : null },
                    { label: 'Priority',     value: deal.priority[0] + deal.priority.slice(1).toLowerCase() },
                  ].map(({ label, value }) => (
                    value ? (
                      <div key={label} className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-muted)]">{label}</span>
                        <span className="text-[var(--text-secondary)]">{value}</span>
                      </div>
                    ) : null
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Quick stats + links */}
            <div className="space-y-4">
              {/* Conflict warning */}
              {(deal.conflictCount ?? 0) > 0 && (
                <button
                  onClick={() => setActiveTab('conflicts')}
                  className="w-full card p-3 flex items-center gap-3 hover:border-red-500/30 transition-colors text-left"
                >
                  <AlertTriangle size={14} className="text-red-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-400">{deal.conflictCount} conflict{(deal.conflictCount ?? 0) !== 1 ? 's' : ''}</p>
                    <p className="text-xs text-[var(--text-muted)]">Review in Conflicts tab</p>
                  </div>
                </button>
              )}

              {/* Stats */}
              <div className="card p-4 space-y-3">
                <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Activity</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
                      <MessageSquare size={12} />
                      Sessions
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      {(deal as Deal & { _count?: { sessions: number } })._count?.sessions ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
                      <FileText size={12} />
                      Documents
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      {(deal as Deal & { _count?: { documents: number } })._count?.documents ?? 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick actions */}
              <div className="card p-4 space-y-2">
                <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">Quick Actions</p>
                <button
                  onClick={() => { void createSession() }}
                  className="w-full btn-secondary text-sm flex items-center justify-center gap-2"
                >
                  <MessageSquare size={13} />
                  New Session
                </button>
                <button
                  onClick={() => setActiveTab('ic_memo')}
                  className="w-full btn-ghost text-sm flex items-center justify-center gap-2"
                >
                  <BarChart2 size={13} />
                  IC Memo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Conversations ── */}
        {activeTab === 'conversations' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--text-muted)]">Sessions linked to this deal</p>
              <button
                onClick={() => { void createSession() }}
                className="btn-primary text-sm flex items-center gap-2"
              >
                <MessageSquare size={13} />
                New Session
              </button>
            </div>

            {((deal as Deal & { sessions?: Array<{ id: string; title: string | null; mode: string | null; status: string; updatedAt: string }> }).sessions ?? []).length === 0 ? (
              <div className="card text-center py-12">
                <MessageSquare size={24} className="text-[var(--text-muted)] mx-auto mb-2" />
                <p className="text-sm text-[var(--text-muted)]">No sessions yet</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Start a conversation to begin analysing this deal</p>
              </div>
            ) : (
              <div className="space-y-2">
                {((deal as Deal & { sessions?: Array<{ id: string; title: string | null; mode: string | null; status: string; updatedAt: string }> }).sessions ?? []).map((s) => (
                  <Link
                    key={s.id}
                    href={`/session/${s.id}`}
                    className="card flex items-center justify-between hover:border-[var(--gold)]/30 hover:bg-[var(--bg-hover)] transition-all duration-150 group"
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--gold)] transition-colors">
                        {s.title ?? 'Untitled session'}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {new Date(s.updatedAt).toLocaleDateString()}
                        {s.mode && ` · ${s.mode}`}
                      </p>
                    </div>
                    <ArrowUpRight size={14} className="text-[var(--text-muted)] group-hover:text-[var(--gold)] transition-colors shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Documents ── */}
        {activeTab === 'documents' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--text-muted)]">Documents linked to this deal</p>
              <Link
                href={`/deals/${id}/documents`}
                className="text-xs text-[var(--gold)] hover:opacity-80 transition-opacity flex items-center gap-1"
              >
                Open VDR
                <ArrowUpRight size={11} />
              </Link>
            </div>

            {/* CIM Analysis CTA — shown when at least one PDF is present */}
            {(() => {
              const docs = (deal as Deal & { documents?: Array<{ id: string; title: string; mimeType: string | null; createdAt: string }> }).documents ?? []
              const pdfs = docs.filter((d) => d.mimeType === 'application/pdf' || d.title.toLowerCase().endsWith('.pdf'))
              if (pdfs.length === 0) return null
              const defaultPdf = pdfs[0]!
              const hasExisting = !!cimLatest?.result
              const targetDocId = selectedCimDocId || defaultPdf.id
              return (
                <div className="rounded-xl border border-[rgba(99,102,241,0.25)] bg-[rgba(99,102,241,0.06)] p-4 flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[rgba(99,102,241,0.12)] flex items-center justify-center shrink-0">
                      <Zap size={14} className="text-[#6366F1]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {hasExisting ? 'CIM analysis available' : 'CIM detected — analysis in under 8 min'}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {hasExisting
                          ? `Last run: ${new Date(cimLatest.createdAt).toLocaleDateString()}`
                          : 'Structured snapshot, fit score, red flags, and management questions'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {pdfs.length > 1 && !hasExisting && (
                      <select
                        value={selectedCimDocId || defaultPdf.id}
                        onChange={(e) => setSelectedCimDocId(e.target.value)}
                        className="text-xs border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] text-[var(--text-primary)] rounded-lg px-2 py-1.5 outline-none"
                      >
                        {pdfs.map((d) => (
                          <option key={d.id} value={d.id}>{d.title}</option>
                        ))}
                      </select>
                    )}
                    <Link
                      href={`/deals/${id}/cim-analysis${hasExisting ? '' : `?documentId=${targetDocId}&autostart=true`}`}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1E3A8A] text-white text-xs font-semibold hover:bg-[#1e40af] transition-colors"
                    >
                      {hasExisting ? 'View Analysis →' : 'Run CIM Analysis →'}
                    </Link>
                  </div>
                </div>
              )
            })()}

            {((deal as Deal & { documents?: Array<{ id: string; title: string; mimeType: string | null; createdAt: string }> }).documents ?? []).length === 0 ? (
              <div className="card text-center py-12">
                <FileText size={24} className="text-[var(--text-muted)] mx-auto mb-2" />
                <p className="text-sm text-[var(--text-muted)]">No documents yet</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Upload a ZIP of documents in the VDR to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {((deal as Deal & { documents?: Array<{ id: string; title: string; mimeType: string | null; createdAt: string }> }).documents ?? []).map((doc) => (
                  <div key={doc.id} className="card flex items-center gap-3">
                    <FileText size={14} className="text-[var(--text-muted)] shrink-0" />
                    <div>
                      <p className="text-sm text-[var(--text-primary)]">{doc.title}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {new Date(doc.createdAt).toLocaleDateString()}
                        {doc.mimeType && ` · ${doc.mimeType}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Conflicts ── */}
        {activeTab === 'conflicts' && (
          <div className="space-y-3">
            {!conflictData ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
              </div>
            ) : conflictData.conflicts.length === 0 ? (
              <div className="card text-center py-12">
                <AlertTriangle size={24} className="text-[var(--text-muted)] mx-auto mb-2" />
                <p className="text-sm text-[var(--text-muted)]">No conflicts detected</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-[var(--text-muted)]">
                  {unresolvedCount} unresolved conflict{unresolvedCount !== 1 ? 's' : ''}
                </p>
                {conflictData.conflicts.map((c) => (
                  <div
                    key={c.id}
                    className="card p-4 space-y-2"
                    style={{ borderLeft: c.status === 'UNRESOLVED' ? '3px solid rgba(239,68,68,0.5)' : '3px solid rgba(52,211,153,0.3)' }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{c.entityName}</p>
                        <p className="text-xs text-[var(--text-muted)]">{c.property}</p>
                      </div>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                        style={{
                          background: c.status === 'UNRESOLVED' ? 'rgba(239,68,68,0.1)' : 'rgba(52,211,153,0.1)',
                          color: c.status === 'UNRESOLVED' ? '#f87171' : '#34d399',
                        }}
                      >
                        {c.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
                      <span className="font-mono">A: <span className="text-[var(--text-secondary)]">{c.valueA}</span></span>
                      <span className="opacity-50">vs</span>
                      <span className="font-mono">B: <span className="text-[var(--text-secondary)]">{c.valueB}</span></span>
                    </div>
                  </div>
                ))}
                <div className="pt-2">
                  <Link
                    href={`/clients/${deal.clientId}/conflicts`}
                    className="text-sm text-[var(--gold)] hover:underline flex items-center gap-1"
                  >
                    Manage all conflicts
                    <ArrowUpRight size={12} />
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── IC Memo ── */}
        {activeTab === 'ic_memo' && (
          <div className="space-y-4">
            <div className="card p-6 text-center space-y-4">
              <BarChart2 size={28} className="text-[var(--text-muted)] mx-auto" />
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Investment Committee Memo</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  9-section PE-standard memo generated from all deal documents and CIM analysis.
                  Sections can be regenerated individually.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Link
                  href={`/deals/${id}/memo`}
                  className="btn-primary flex items-center justify-center gap-2"
                >
                  <BarChart2 size={13} />
                  Open IC Memo Generator
                </Link>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
