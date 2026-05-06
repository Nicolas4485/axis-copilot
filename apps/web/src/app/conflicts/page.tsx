'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { clients, knowledge, type ConflictRecord } from '@/lib/api'
import { AlertTriangle, Download, Filter, CheckCircle2, X, ChevronDown } from 'lucide-react'

type FilterStatus = 'ALL' | 'UNRESOLVED' | 'RESOLVED_A' | 'RESOLVED_B' | 'CUSTOM'

const STATUS_LABEL: Record<ConflictRecord['status'], string> = {
  UNRESOLVED: 'Unresolved',
  RESOLVED_A: 'Resolved (A)',
  RESOLVED_B: 'Resolved (B)',
  CUSTOM:     'Resolved',
}

export default function ConflictsPage() {
  const qc = useQueryClient()
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL')
  const [resolving, setResolving] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: clientsData, isLoading: clientsLoading } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => clients.list(),
  })
  const clientList = clientsData?.clients ?? []

  useEffect(() => {
    if (clientList.length > 0 && !selectedClientId) {
      setSelectedClientId(clientList[0]!.id)
    }
  }, [clientList, selectedClientId])

  const { data: conflictsData, isLoading: conflictsLoading } = useQuery({
    queryKey: ['conflicts', selectedClientId],
    queryFn: () => knowledge.getConflicts(selectedClientId!),
    enabled: !!selectedClientId,
  })

  const allConflicts: ConflictRecord[] = conflictsData?.conflicts ?? []
  const filtered = filterStatus === 'ALL'
    ? allConflicts
    : allConflicts.filter((c) => c.status === filterStatus)
  const unresolvedCount = allConflicts.filter((c) => c.status === 'UNRESOLVED').length

  const resolve = async (conflictId: string, resolution: ConflictRecord['status']) => {
    if (!selectedClientId) return
    setResolving(conflictId)
    try {
      await knowledge.resolveConflict(conflictId, { resolution })
      await qc.invalidateQueries({ queryKey: ['conflicts', selectedClientId] })
    } finally {
      setResolving(null)
    }
  }

  const exportCsv = () => {
    if (!allConflicts.length) return
    const headers = ['Entity', 'Property', 'Value A', 'Source A', 'Value B', 'Source B', 'Detected', 'Status']
    const rows = allConflicts.map((c) => [
      c.entityName, c.property, c.valueA, c.sourceDocA, c.valueB, c.sourceDocB,
      new Date(c.createdAt).toLocaleDateString(), STATUS_LABEL[c.status],
    ])
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `conflicts-export.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg)' }}>
      <div className="ax-page animate-fade-up">

        {/* ── Page header ─── */}
        <div className="ax-page-head">
          <div className="ax-page-head-text">
            <div className="ax-eyebrow">Deal Intelligence</div>
            <h1 className="ax-h1">Conflicts</h1>
            <p className="ax-sub">
              {selectedClientId && !conflictsLoading
                ? unresolvedCount > 0
                  ? `${unresolvedCount} unresolved conflict${unresolvedCount !== 1 ? 's' : ''} detected`
                  : 'No unresolved conflicts'
                : 'Knowledge conflict detection'}
            </p>
          </div>
          <div className="ax-page-actions">
            {/* Client selector */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <select
                value={selectedClientId ?? ''}
                onChange={(e) => setSelectedClientId(e.target.value || null)}
                className="input"
                style={{ height: 32, fontSize: 12.5, paddingRight: 28, minWidth: 160 }}
                disabled={clientsLoading}
              >
                {clientList.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown size={12} style={{ position: 'absolute', right: 8, color: 'var(--ink-4)', pointerEvents: 'none' }} />
            </div>
            <button onClick={exportCsv} disabled={!allConflicts.length} className="ax-btn"
              style={{ opacity: !allConflicts.length ? 0.4 : 1 }}>
              <Download size={13} /> Export CSV
            </button>
          </div>
        </div>

        {/* ── Filter tabs ─── */}
        <div className="ax-tabs" style={{ marginBottom: 20 }}>
          {(['ALL', 'UNRESOLVED', 'RESOLVED_A', 'RESOLVED_B'] as FilterStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`ax-tab${filterStatus === s ? ' is-active' : ''}`}
            >
              {s === 'ALL' ? 'All' : s === 'UNRESOLVED' ? 'Unresolved' : s === 'RESOLVED_A' ? 'Resolved (A)' : 'Resolved (B)'}
              {s === 'UNRESOLVED' && unresolvedCount > 0 && (
                <span className="ax-tab-badge" style={{ marginLeft: 6 }}>{unresolvedCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Conflict list ─── */}
        {!selectedClientId || clientsLoading ? (
          <div className="ax-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Select a client to view conflicts</p>
          </div>
        ) : conflictsLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 10 }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="ax-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <CheckCircle2 size={28} style={{ color: 'var(--good)', margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', marginBottom: 4 }}>
              {filterStatus === 'ALL' ? 'No conflicts detected' : 'No conflicts in this category'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              {filterStatus === 'ALL'
                ? 'Knowledge entries are consistent across all documents.'
                : 'Try selecting a different filter.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((conflict) => {
              const isOpen = expanded === conflict.id
              const isUnresolved = conflict.status === 'UNRESOLVED'
              return (
                <div key={conflict.id} className={`ax-conflict${isOpen ? ' is-open' : ''}`}>
                  {/* Header */}
                  <div
                    className="ax-conflict-hd"
                    onClick={() => setExpanded(isOpen ? null : conflict.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <AlertTriangle
                      size={14}
                      style={{ color: isUnresolved ? 'var(--bad)' : 'var(--good)', flexShrink: 0, marginTop: 2 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="ax-conflict-claim">
                        {conflict.entityName} · {conflict.property}
                      </div>
                      <div className="ax-conflict-sub">
                        {conflict.sourceDocA} vs {conflict.sourceDocB} ·{' '}
                        {new Date(conflict.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <span
                      className="ax-chip"
                      style={{
                        flexShrink: 0,
                        background: isUnresolved ? 'var(--bad-soft)' : 'var(--good-soft)',
                        color: isUnresolved ? 'var(--bad)' : 'var(--good)',
                        borderColor: isUnresolved ? 'var(--bad-b)' : 'var(--good-b)',
                      }}
                    >
                      {STATUS_LABEL[conflict.status]}
                    </span>
                    <ChevronDown
                      size={13}
                      style={{
                        color: 'var(--ink-4)', flexShrink: 0,
                        transform: isOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform 150ms',
                      }}
                    />
                  </div>

                  {/* Body — expanded */}
                  {isOpen && (
                    <>
                      <div className="ax-conflict-bd">
                        <div className="ax-conflict-side">
                          <div style={{ fontSize: 11, color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                            Source A — {conflict.sourceDocA}
                          </div>
                          <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 500 }}>{conflict.valueA}</div>
                        </div>
                        <div className="ax-conflict-side">
                          <div style={{ fontSize: 11, color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                            Source B — {conflict.sourceDocB}
                          </div>
                          <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 500 }}>{conflict.valueB}</div>
                        </div>
                      </div>

                      {isUnresolved && (
                        <div className="ax-conflict-foot">
                          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Resolve as:</span>
                          <button
                            onClick={() => void resolve(conflict.id, 'RESOLVED_A')}
                            disabled={resolving === conflict.id}
                            className="ax-btn"
                            style={{ fontSize: 12, padding: '4px 10px' }}
                          >
                            <CheckCircle2 size={11} /> Use A
                          </button>
                          <button
                            onClick={() => void resolve(conflict.id, 'RESOLVED_B')}
                            disabled={resolving === conflict.id}
                            className="ax-btn"
                            style={{ fontSize: 12, padding: '4px 10px' }}
                          >
                            <CheckCircle2 size={11} /> Use B
                          </button>
                          <button
                            onClick={() => void resolve(conflict.id, 'CUSTOM')}
                            disabled={resolving === conflict.id}
                            className="ax-btn"
                            style={{ fontSize: 12, padding: '4px 10px' }}
                          >
                            <X size={11} /> Dismiss
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
