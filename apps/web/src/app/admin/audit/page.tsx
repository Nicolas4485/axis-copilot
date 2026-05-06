'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Shield, AlertTriangle, Activity, Clock, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

interface AuditLog {
  id: string
  userEmail: string | null
  action: string
  resource: string
  method: string
  path: string
  statusCode: number
  ipAddress: string | null
  durationMs: number | null
  createdAt: string
}

interface AuditStats {
  totalRequests: number
  errorCount: number
  errorRate: string
  topResources: { resource: string; count: number }[]
  recentActivity: { userEmail: string | null; action: string; statusCode: number; createdAt: string }[]
}

const METHOD_COLOURS: Record<string, string> = {
  GET:    'rgba(52,211,153,0.15)',
  POST:   'rgba(96,165,250,0.15)',
  PATCH:  'rgba(251,191,36,0.15)',
  DELETE: 'rgba(248,113,113,0.15)',
}
const METHOD_TEXT: Record<string, string> = {
  GET: '#34d399', POST: '#60a5fa', PATCH: '#fbbf24', DELETE: '#f87171',
}

function statusColour(code: number): string {
  if (code < 300) return '#34d399'
  if (code < 400) return '#fbbf24'
  if (code < 500) return '#fb923c'
  return '#f87171'
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function AuditPage() {
  const [page, setPage]           = useState(1)
  const [resource, setResource]   = useState<string>('')

  const { data: stats } = useQuery({
    queryKey: ['audit-stats'],
    queryFn:  () => api<AuditStats>('/api/audit/stats'),
    refetchInterval: 30000,
  })

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit-logs', page, resource],
    queryFn:  () => api<{ logs: AuditLog[]; total: number; pages: number }>(
      `/api/audit?page=${page}&limit=50${resource ? `&resource=${resource}` : ''}`
    ),
    refetchInterval: 15000,
  })

  return (
    <div className="h-full overflow-y-auto p-6" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--gold-sub)' }}>
          <Shield size={16} style={{ color: 'var(--gold)' }} />
        </div>
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-playfair)' }}>
            Audit Log
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            All API access — last 7 days
          </p>
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Requests (7d)', value: stats.totalRequests.toLocaleString(), icon: Activity, colour: '#60a5fa' },
            { label: 'Errors (7d)',   value: stats.errorCount.toLocaleString(),    icon: AlertTriangle, colour: '#f87171' },
            { label: 'Error Rate',   value: `${stats.errorRate}%`,                icon: AlertTriangle, colour: stats.errorRate > '5' ? '#f87171' : '#34d399' },
            { label: 'Top Resource', value: stats.topResources[0]?.resource ?? '—', icon: Activity, colour: 'var(--gold)' },
          ].map(({ label, value, icon: Icon, colour }) => (
            <div key={label} className="rounded-xl p-4"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Icon size={13} style={{ color: colour }} />
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
              </div>
              <p className="text-lg font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Filter by resource:</span>
        {['', 'deals', 'sessions', 'agents', 'documents', 'feedback'].map((r) => (
          <button key={r}
            onClick={() => { setResource(r); setPage(1) }}
            className="px-2.5 py-1 rounded-lg text-xs transition-colors"
            style={{
              background: resource === r ? 'var(--gold-sub)' : 'transparent',
              color: resource === r ? 'var(--gold)' : 'var(--text-muted)',
              border: `1px solid ${resource === r ? 'var(--border-active)' : 'transparent'}`,
            }}>
            {r || 'All'}
          </button>
        ))}
      </div>

      {/* Log table */}
      <div className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        {/* Table header */}
        <div className="grid grid-cols-[80px_1fr_120px_70px_70px_90px] gap-3 px-4 py-2.5 text-[10px] font-medium uppercase tracking-widest"
          style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <span>Method</span>
          <span>Path</span>
          <span>User</span>
          <span>Status</span>
          <span>Duration</span>
          <span>Time</span>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        )}

        {logs?.logs.map((log) => (
          <div key={log.id}
            className="grid grid-cols-[80px_1fr_120px_70px_70px_90px] gap-3 px-4 py-2.5 text-xs border-b hover:bg-white/[0.02] transition-colors"
            style={{ borderColor: 'var(--border)' }}>
            <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded self-center"
              style={{
                background: METHOD_COLOURS[log.method] ?? 'rgba(148,163,184,0.1)',
                color: METHOD_TEXT[log.method] ?? 'var(--text-secondary)',
              }}>
              {log.method}
            </span>
            <span className="font-mono truncate self-center" style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
              {log.path}
            </span>
            <span className="truncate self-center" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
              {log.userEmail?.split('@')[0] ?? '—'}
            </span>
            <span className="font-mono font-semibold self-center" style={{ color: statusColour(log.statusCode) }}>
              {log.statusCode}
            </span>
            <span className="font-mono self-center" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
              {log.durationMs != null ? `${log.durationMs}ms` : '—'}
            </span>
            <div className="flex items-center gap-1 self-center" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
              <Clock size={10} />
              {timeAgo(log.createdAt)}
            </div>
          </div>
        ))}

        {logs?.logs.length === 0 && !isLoading && (
          <div className="py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            No audit logs yet
          </div>
        )}
      </div>

      {/* Pagination */}
      {logs && logs.pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {logs.total.toLocaleString()} total entries
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-30 transition-colors">
              <ChevronLeft size={14} style={{ color: 'var(--text-muted)' }} />
            </button>
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              {page} / {logs.pages}
            </span>
            <button onClick={() => setPage((p) => Math.min(logs.pages, p + 1))} disabled={page === logs.pages}
              className="p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-30 transition-colors">
              <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
