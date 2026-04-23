'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  health, sessions, clients, deals,
  type HealthStatus, type SessionListItem, type Client, type Deal,
} from '@/lib/api'
import {
  MessageSquare, Users, Activity, Plus, ChevronRight,
  Zap, FileText, AlertTriangle, CheckCircle2, XCircle,
  Clock, Building2, BarChart2,
} from 'lucide-react'

function timeAgo(date: string): string {
  const diffMs = Date.now() - new Date(date).getTime()
  const mins  = Math.floor(diffMs / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (days  > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (mins  > 0) return `${mins}m ago`
  return 'just now'
}

const STAGE_LABELS: Record<string, string> = {
  SOURCING:    'Sourcing',
  SCREENING:   'Screening',
  DILIGENCE:   'Diligence',
  IC_MEMO:     'IC Memo',
  CLOSED_WON:  'Won',
  CLOSED_LOST: 'Lost',
}

const STAGE_DOTS: Record<string, string> = {
  SOURCING:    '#94a3b8',
  SCREENING:   '#60a5fa',
  DILIGENCE:   '#fbbf24',
  IC_MEMO:     '#a78bfa',
  CLOSED_WON:  '#34d399',
  CLOSED_LOST: '#f87171',
}

/* ── KPI tile ─────────────────────────────────────────────────────────── */
function Kpi({
  label, value, delta, deltaVariant = 'good', loading = false,
}: {
  label: string
  value: string | number | null
  delta?: string
  deltaVariant?: 'good' | 'bad' | 'warn' | 'muted'
  loading?: boolean
}) {
  return (
    <div className="ax-kpi">
      <div className="ax-kpi-lbl">{label}</div>
      {loading ? (
        <div className="skeleton" style={{ height: 32, width: 80, marginTop: 6, borderRadius: 6 }} />
      ) : (
        <div className="ax-kpi-val">{value ?? '—'}</div>
      )}
      {delta && <div className={`ax-kpi-delta is-${deltaVariant}`}>{delta}</div>}
    </div>
  )
}

/* ── Card shell ───────────────────────────────────────────────────────── */
function Card({
  title, subtitle, action, children,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="ax-card">
      <div className="ax-card-hd">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>{title}</h3>
          {subtitle && <div className="ax-card-sub">{subtitle}</div>}
        </div>
        {action && <div className="ax-card-meta">{action}</div>}
      </div>
      <div className="ax-card-bd">{children}</div>
    </div>
  )
}

/* ── Session row ──────────────────────────────────────────────────────── */
function SessionRow({ session }: { session: SessionListItem }) {
  return (
    <Link href={`/session/${session.id}`} className="ax-row is-clickable">
      <div className="ax-row-icon">
        <MessageSquare size={13} />
      </div>
      <div className="ax-row-body">
        <div className="ax-row-title">{session.title || 'Untitled session'}</div>
        <div className="ax-row-sub">{session.client?.name ?? 'No client'} · {session.messageCount ?? 0} messages</div>
      </div>
      <div className="ax-row-time">{timeAgo(session.updatedAt ?? session.createdAt)}</div>
    </Link>
  )
}

/* ── Client row ───────────────────────────────────────────────────────── */
function ClientRow({ client }: { client: Client }) {
  const initials = client.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')

  return (
    <Link href={`/clients/${client.id}`} className="ax-row is-clickable">
      <div className="ax-avatar" style={{ borderRadius: 7, width: 28, height: 28, fontSize: 11 }}>
        {initials}
      </div>
      <div className="ax-row-body">
        <div className="ax-row-title">{client.name}</div>
        <div className="ax-row-sub">{client.industry ?? 'Client'}</div>
      </div>
      <ChevronRight size={13} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
    </Link>
  )
}

/* ── Deal row (priority deals table) ─────────────────────────────────── */
function DealRow({ deal }: { deal: Deal }) {
  const dot = STAGE_DOTS[deal.stage] ?? '#94a3b8'
  const stage = STAGE_LABELS[deal.stage] ?? deal.stage
  return (
    <Link href={`/deals/${deal.id}`} className="ax-row is-clickable">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        <div>
          <div className="ax-row-title">{deal.name}</div>
          <div className="ax-row-sub">{deal.sector ?? '—'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span className="ax-stage-dot" style={{ background: dot }} />
        <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{stage}</span>
      </div>
      {deal.dealSize && (
        <div className="ax-mono" style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600, flexShrink: 0 }}>
          {deal.dealSize}
        </div>
      )}
    </Link>
  )
}

/* ── Status item ──────────────────────────────────────────────────────── */
function StatusItem({ label, status }: { label: string; status: string }) {
  const ok = status === 'ok' || status === 'healthy' || status === 'connected'
  return (
    <div style={{
      padding: '12px 14px', borderRight: '1px solid var(--line)',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div className="ax-kpi-lbl">{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
        {ok
          ? <CheckCircle2 size={13} style={{ color: 'var(--good)' }} />
          : <XCircle     size={13} style={{ color: 'var(--bad)' }} />
        }
        <span style={{ fontSize: 12, color: ok ? 'var(--good)' : 'var(--bad)', fontWeight: 500 }}>
          {ok ? 'Online' : 'Offline'}
        </span>
      </div>
    </div>
  )
}

/* ── Pipeline snapshot ────────────────────────────────────────────────── */
function PipelineStrip({ dealList }: { dealList: Deal[] }) {
  const stages = ['SOURCING', 'SCREENING', 'DILIGENCE', 'IC_MEMO', 'CLOSED_WON', 'CLOSED_LOST'] as const
  const totalActive = dealList.filter(d => !d.stage.startsWith('CLOSED')).length

  return (
    <div className="ax-pipe-strip" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0,1fr))` }}>
      {stages.map((s) => {
        const count = dealList.filter(d => d.stage === s).length
        const pct = totalActive > 0 ? Math.round((count / dealList.length) * 100) : 0
        return (
          <Link key={s} href="/pipeline" className="ax-pipe-stage" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="ax-pipe-stage-name">{STAGE_LABELS[s]}</div>
            <div className="ax-pipe-stage-count">
              {count}
              <small>deals</small>
            </div>
            <div className="ax-pipe-bar"><i style={{ width: `${pct}%` }} /></div>
          </Link>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const { data: healthData } = useQuery<HealthStatus>({
    queryKey: ['health'],
    queryFn: () => health.check(),
    refetchInterval: 60_000,
  })
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['sessions-list'],
    queryFn: () => sessions.list(),
    refetchInterval: 30_000,
  })
  const { data: clientsData, isLoading: clientsLoading } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => clients.list(),
  })
  const { data: dealsData } = useQuery({
    queryKey: ['deals-list'],
    queryFn: () => deals.list(),
  })

  const recentSessions = sessionsData?.sessions ?? []
  const clientList     = clientsData?.clients  ?? []
  const dealList       = (dealsData as { deals?: Deal[] } | undefined)?.deals ?? []
  const totalMessages  = recentSessions.reduce((sum, s) => sum + (s.messageCount ?? 0), 0)
  const activeDeals    = dealList.filter(d => !d.stage.startsWith('CLOSED'))

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg)' }}>
      <div className="ax-page animate-fade-up">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="ax-page-head">
          <div className="ax-page-head-text">
            <div className="ax-eyebrow">Workspace</div>
            <h1 className="ax-h1">Dashboard</h1>
            <p className="ax-sub">
              {activeDeals.length > 0
                ? `${activeDeals.length} active deal${activeDeals.length !== 1 ? 's' : ''} in the pipeline`
                : 'Welcome to AXIS Co-pilot'}
            </p>
          </div>
          <div className="ax-page-actions">
            <Link href="/session/new" className="ax-btn is-primary">
              <Plus size={13} />
              <span>New session</span>
            </Link>
          </div>
        </div>

        {/* ── KPI strip ───────────────────────────────────────────────── */}
        <div className="ax-kpi-grid" style={{ marginBottom: 16 }}>
          <Kpi
            label="Sessions"
            value={sessionsLoading ? null : recentSessions.length}
            {...(recentSessions.length > 0 ? { delta: `${recentSessions.length} total` } : {})}
            deltaVariant="muted"
            loading={sessionsLoading}
          />
          <Kpi
            label="Clients"
            value={clientsLoading ? null : clientList.length}
            deltaVariant="muted"
            loading={clientsLoading}
          />
          <Kpi
            label="Messages"
            value={sessionsLoading ? null : totalMessages.toLocaleString()}
            deltaVariant="muted"
            loading={sessionsLoading}
          />
          <Kpi
            label="Active Deals"
            value={activeDeals.length}
            {...(activeDeals.filter(d => d.stage === 'DILIGENCE').length > 0
              ? { delta: `${activeDeals.filter(d => d.stage === 'DILIGENCE').length} in diligence` }
              : {})}
            deltaVariant="warn"
          />
        </div>

        {/* ── Pipeline snapshot ───────────────────────────────────────── */}
        {dealList.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <PipelineStrip dealList={dealList} />
          </div>
        )}

        {/* ── Main grid ───────────────────────────────────────────────── */}
        <div className="ax-grid ax-grid-2" style={{ marginBottom: 16 }}>

          {/* Recent sessions */}
          <Card
            title="Recent Sessions"
            subtitle={`${recentSessions.length} total`}
            action={
              <Link href="/session/new" className="ax-btn" style={{ fontSize: 11.5, padding: '4px 8px' }}>
                <Plus size={11} /> New
              </Link>
            }
          >
            {sessionsLoading ? (
              <div style={{ padding: 14 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 14, borderRadius: 4, marginBottom: 10, width: `${70 + (i % 3) * 10}%` }} />
                ))}
              </div>
            ) : recentSessions.length === 0 ? (
              <div style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
                No sessions yet — use "Talk to Aria" to start one.
              </div>
            ) : (
              recentSessions.slice(0, 8).map((s) => <SessionRow key={s.id} session={s} />)
            )}
          </Card>

          {/* Clients */}
          <Card
            title="Clients"
            subtitle={`${clientList.length} accounts`}
            action={
              <Link href="/clients" className="ax-link">View all →</Link>
            }
          >
            {clientsLoading ? (
              <div style={{ padding: 14 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 14, borderRadius: 4, marginBottom: 10, width: `${65 + (i % 3) * 12}%` }} />
                ))}
              </div>
            ) : clientList.length === 0 ? (
              <div style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
                No clients yet.
              </div>
            ) : (
              clientList.slice(0, 7).map((c) => <ClientRow key={c.id} client={c} />)
            )}
          </Card>
        </div>

        {/* ── Active deals (if any) ────────────────────────────────────── */}
        {dealList.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Card
              title="Active Deals"
              subtitle={`${activeDeals.length} in progress`}
              action={<Link href="/pipeline" className="ax-link">Pipeline →</Link>}
            >
              {activeDeals.length === 0 ? (
                <div style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
                  No active deals.
                </div>
              ) : (
                activeDeals.slice(0, 6).map((d) => <DealRow key={d.id} deal={d} />)
              )}
            </Card>
          </div>
        )}

        {/* ── Infrastructure health ────────────────────────────────────── */}
        {healthData && (
          <div>
            <div className="ax-eyebrow" style={{ marginBottom: 8 }}>Infrastructure</div>
            <div className="ax-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}>
              <StatusItem label="Database"  status={healthData.db}             />
              <StatusItem label="Redis"     status={healthData.redis}          />
              <StatusItem label="Neo4j"     status={healthData.neo4j}          />
              <StatusItem label="Anthropic" status={healthData.anthropic}      />
              <StatusItem label="AI Models" status={healthData.localInference} />
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
