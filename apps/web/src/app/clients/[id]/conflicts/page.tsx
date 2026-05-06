'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { knowledge, type ConflictRecord } from '@/lib/api'
import Link from 'next/link'
import { ArrowLeft, Download, CheckCircle2, X, AlertTriangle, Filter } from 'lucide-react'

type FilterStatus = 'ALL' | 'UNRESOLVED' | 'RESOLVED_A' | 'RESOLVED_B' | 'CUSTOM'

const STATUS_LABEL: Record<ConflictRecord['status'], string> = {
  UNRESOLVED: 'Unresolved',
  RESOLVED_A: 'Resolved (A)',
  RESOLVED_B: 'Resolved (B)',
  CUSTOM:     'Resolved',
}

const STATUS_CLASS: Record<ConflictRecord['status'], string> = {
  UNRESOLVED: 'badge-red',
  RESOLVED_A: 'badge-green',
  RESOLVED_B: 'badge-green',
  CUSTOM:     'badge-muted',
}

export default function ConflictsPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL')
  const [resolving, setResolving] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['conflicts', id],
    queryFn: () => knowledge.getConflicts(id),
  })

  const conflicts: ConflictRecord[] = (data?.conflicts ?? [])
  const filtered = filterStatus === 'ALL'
    ? conflicts
    : conflicts.filter((c) => c.status === filterStatus)

  const resolve = async (conflictId: string, resolution: ConflictRecord['status']) => {
    setResolving(conflictId)
    try {
      await knowledge.resolveConflict(conflictId, { resolution })
      await qc.invalidateQueries({ queryKey: ['conflicts', id] })
    } catch {
      // Keep existing state on error
    } finally {
      setResolving(null)
    }
  }

  const exportCsv = () => {
    const headers = ['Entity', 'Property', 'Value A', 'Source A', 'Value B', 'Source B', 'Detected', 'Status']
    const rows = conflicts.map((c) => [
      c.entityName, c.property, c.valueA, c.sourceDocA, c.valueB, c.sourceDocB,
      new Date(c.createdAt).toLocaleDateString(), STATUS_LABEL[c.status],
    ])
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `conflicts-${id}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const unresolvedCount = conflicts.filter((c) => c.status === 'UNRESOLVED').length

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/clients/${id}`}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]
                           hover:bg-[var(--bg-hover)] transition-colors">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="font-serif text-2xl text-[var(--text-primary)]">Conflict Detection</h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 font-mono">
              {unresolvedCount > 0
                ? `${unresolvedCount} unresolved conflict${unresolvedCount !== 1 ? 's' : ''}`
                : 'No unresolved conflicts'}
            </p>
          </div>
        </div>
        <button onClick={exportCsv} disabled={conflicts.length === 0}
                className="btn-ghost flex items-center gap-2 disabled:opacity-30 text-sm">
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border)]">
        <Filter size={13} className="text-[var(--text-muted)] mr-1" />
        {(['ALL', 'UNRESOLVED', 'RESOLVED_A', 'RESOLVED_B', 'CUSTOM'] as FilterStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`tab text-xs ${filterStatus === s ? 'tab-active' : ''}`}
          >
            {s === 'ALL' ? 'All' : STATUS_LABEL[s as ConflictRecord['status']]}
            {s === 'UNRESOLVED' && unresolvedCount > 0 && (
              <span className="ml-1.5 badge badge-red text-[10px] px-1.5 py-0">{unresolvedCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <AlertTriangle size={24} className="text-[var(--text-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--text-muted)]">
            {filterStatus === 'ALL'
              ? 'No conflicts detected for this client. Upload documents to run conflict detection.'
              : `No ${STATUS_LABEL[filterStatus as ConflictRecord['status']].toLowerCase()} conflicts.`}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--gold)]/[0.04]">
                {['Entity', 'Property', 'Value A', 'Source A', 'Value B', 'Source B', 'Detected', 'Status', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold
                                         tracking-widest uppercase text-[var(--gold)]
                                         border-b border-[var(--border)]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-hover)] transition-colors">
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{c.entityName}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)] font-mono text-xs">{c.property}</td>
                  <td className="px-4 py-3 text-[var(--text-primary)] max-w-[140px] truncate" title={c.valueA}>{c.valueA}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)] text-xs max-w-[120px] truncate" title={c.sourceDocA}>{c.sourceDocA}</td>
                  <td className="px-4 py-3 text-[var(--text-primary)] max-w-[140px] truncate" title={c.valueB}>{c.valueB}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)] text-xs max-w-[120px] truncate" title={c.sourceDocB}>{c.sourceDocB}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)] text-xs font-mono whitespace-nowrap">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${STATUS_CLASS[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                  </td>
                  <td className="px-4 py-3">
                    {c.status === 'UNRESOLVED' && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => void resolve(c.id, 'RESOLVED_A')}
                          disabled={resolving === c.id}
                          title="Mark resolved"
                          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--success)]
                                     hover:bg-[var(--success)]/10 transition-colors disabled:opacity-40"
                        >
                          <CheckCircle2 size={14} />
                        </button>
                        <button
                          onClick={() => void resolve(c.id, 'CUSTOM')}
                          disabled={resolving === c.id}
                          title="Dismiss"
                          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--error)]
                                     hover:bg-[var(--error)]/10 transition-colors disabled:opacity-40"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
