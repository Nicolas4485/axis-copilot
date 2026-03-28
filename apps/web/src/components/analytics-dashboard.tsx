'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { analytics, type CostAnalytics, type AgentMetric } from '@/lib/api'
import { TrendingUp, DollarSign, Zap, Users, BarChart2, RefreshCw } from 'lucide-react'

// ─── Chart primitives ─────────────────────────────────────────

interface BarChartData {
  label: string
  value: number
  color?: string
}

function BarChart({
  data,
  height = 120,
  valueFormatter,
}: {
  data: BarChartData[]
  height?: number
  valueFormatter?: (v: number) => string
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const barAreaHeight = height - 28
  const barWidth = data.length > 0 ? Math.floor(100 / data.length) : 10

  return (
    <svg width="100%" height={height} className="overflow-visible">
      {data.map((d, i) => {
        const bh = (d.value / max) * barAreaHeight
        const x = `${i * barWidth + 1}%`
        const bw = `${barWidth - 2}%`
        const y = barAreaHeight - bh
        const color = d.color ?? 'var(--gold)'
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={bw}
              height={bh}
              fill={color}
              fillOpacity={0.7}
              rx={2}
            />
            <text
              x={`${i * barWidth + barWidth / 2}%`}
              y={barAreaHeight + 14}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize={9}
            >
              {d.label.length > 8 ? `${d.label.slice(0, 7)}…` : d.label}
            </text>
            <title>{`${d.label}: ${valueFormatter ? valueFormatter(d.value) : d.value}`}</title>
          </g>
        )
      })}
    </svg>
  )
}

function LineChart({
  data,
  height = 100,
  color = 'var(--gold)',
  valueFormatter,
}: {
  data: Array<{ x: string; y: number }>
  height?: number
  color?: string
  valueFormatter?: (v: number) => string
}) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-xs text-[var(--text-muted)]">Insufficient data</p>
      </div>
    )
  }

  const max = Math.max(...data.map((d) => d.y), 1)
  const plotH = height - 20
  const step = 100 / (data.length - 1)

  const points = data.map((d, i) => ({
    px: i * step,
    py: plotH - (d.y / max) * plotH,
    label: d.x,
    value: d.y,
  }))

  const polyline = points.map((p) => `${p.px}%,${p.py}`).join(' ')

  // Area fill path
  const area = [
    `M ${points[0]!.px}%,${plotH}`,
    ...points.map((p) => `L ${p.px}%,${p.py}`),
    `L ${points[points.length - 1]!.px}%,${plotH}`,
    'Z',
  ].join(' ')

  return (
    <svg width="100%" height={height} className="overflow-visible">
      <defs>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lineGrad)" />
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle key={i} cx={`${p.px}%`} cy={p.py} r={3} fill={color}>
          <title>{`${p.label}: ${valueFormatter ? valueFormatter(p.value) : p.value}`}</title>
        </circle>
      ))}
      {/* X axis labels — show first and last */}
      {points[0] && (
        <text x={`${points[0].px}%`} y={height - 2} fill="var(--text-muted)" fontSize={9}>
          {points[0].label}
        </text>
      )}
      {points[points.length - 1] && (
        <text
          x={`${points[points.length - 1]!.px}%`}
          y={height - 2}
          textAnchor="end"
          fill="var(--text-muted)"
          fontSize={9}
        >
          {points[points.length - 1]!.label}
        </text>
      )}
    </svg>
  )
}

// ─── Metric card ──────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
}) {
  return (
    <div className="card flex items-start gap-3">
      <div className="p-2 bg-[var(--gold)]/10 rounded-lg shrink-0">
        <Icon size={16} className="text-[var(--gold)]" />
      </div>
      <div>
        <p className="text-xs text-[var(--text-muted)]">{label}</p>
        <p className="text-lg font-medium text-[var(--text-primary)] leading-tight">{value}</p>
        {sub && <p className="text-xs text-[var(--text-secondary)]">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Period selector ──────────────────────────────────────────

const PERIODS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const

// ─── Agent metrics section ────────────────────────────────────

function AgentMetricsSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-agents'],
    queryFn: () => analytics.getAgentMetrics(),
    retry: 1,
  })

  const metrics: AgentMetric[] = data?.metrics ?? []

  if (isLoading) {
    return <div className="card h-40 animate-pulse bg-[var(--bg-tertiary)]" />
  }

  if (metrics.length === 0) {
    return (
      <div className="card flex items-center justify-center h-40">
        <p className="text-sm text-[var(--text-muted)]">No agent data yet</p>
      </div>
    )
  }

  return (
    <div className="card">
      <h3 className="text-sm font-medium mb-4">Agent Usage</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-[var(--text-muted)] mb-2">Queries per agent</p>
          <BarChart
            data={metrics.map((m) => ({ label: m.agent, value: m.queryCount }))}
            valueFormatter={(v) => `${v} queries`}
          />
        </div>
        <div>
          <p className="text-xs text-[var(--text-muted)] mb-2">Avg response time (ms)</p>
          <BarChart
            data={metrics.map((m) => ({
              label: m.agent,
              value: m.avgResponseMs,
              color: 'var(--success)',
            }))}
            valueFormatter={(v) => `${v}ms`}
          />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {metrics.map((m) => (
          <div key={m.agent} className="p-2 bg-[var(--bg-tertiary)] rounded-lg">
            <p className="text-xs text-[var(--text-muted)] truncate">{m.agent}</p>
            <p className="text-sm font-medium text-[var(--text-primary)]">{m.queryCount} calls</p>
            <div className="mt-1 h-1 bg-[var(--border)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--success)] rounded-full"
                style={{ width: `${m.successRate * 100}%` }}
              />
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {Math.round(m.successRate * 100)}% success
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Cost analytics section ───────────────────────────────────

function CostAnalyticsSection({ days }: { days: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-costs', days],
    queryFn: () => analytics.getCosts(days),
    retry: 1,
  })

  const costData: CostAnalytics | undefined = data

  if (isLoading) {
    return <div className="card h-52 animate-pulse bg-[var(--bg-tertiary)]" />
  }

  return (
    <div className="card">
      <h3 className="text-sm font-medium mb-4">Cost Tracking</h3>
      {!costData ? (
        <p className="text-sm text-[var(--text-muted)]">No cost data available</p>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-2">Spend over time</p>
            <LineChart
              data={(costData.byDay ?? []).map((d) => ({ x: d.date.slice(5), y: d.costUsd }))}
              valueFormatter={(v) => `$${v.toFixed(4)}`}
            />
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-2">Spend by model</p>
            <BarChart
              data={(costData.byModel ?? []).map((m) => ({
                label: m.model.replace('claude-', '').replace('qwen3', 'Qwen3'),
                value: m.costUsd,
                color: 'var(--warning)',
              }))}
              valueFormatter={(v) => `$${v.toFixed(4)}`}
            />
          </div>
          <div className="col-span-2">
            <p className="text-xs text-[var(--text-muted)] mb-2">Top sessions by spend</p>
            <div className="space-y-1.5">
              {(costData.bySession ?? []).slice(0, 5).map((s) => (
                <div key={s.sessionId} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-[var(--text-primary)] truncate">{s.title}</span>
                      <span className="text-xs text-[var(--warning)] shrink-0 ml-2">
                        ${s.costUsd.toFixed(4)}
                      </span>
                    </div>
                    <div className="h-1 bg-[var(--border)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(s.costUsd / (costData.totalUsd || 1)) * 100}%`,
                          backgroundColor: 'var(--warning)',
                          opacity: 0.6,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────

export function AnalyticsDashboard() {
  const [period, setPeriod] = useState<7 | 30 | 90>(30)

  const { data: costData, refetch, isRefetching } = useQuery({
    queryKey: ['analytics-costs-summary', period],
    queryFn: () => analytics.getCosts(period),
    retry: 1,
  })

  const totalUsd = costData?.totalUsd ?? 0
  const totalCalls = (costData?.byModel ?? []).reduce((sum, m) => sum + m.callCount, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl text-[var(--gold)]">Analytics</h2>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Usage, cost, and performance metrics</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex gap-0.5 bg-[var(--bg-tertiary)] rounded-lg p-0.5">
            {PERIODS.map(({ label, days }) => (
              <button
                key={label}
                onClick={() => setPeriod(days)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  period === days
                    ? 'bg-[var(--gold)] text-[var(--bg-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => { void refetch() }}
            disabled={isRefetching}
            className="p-1.5 border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={isRefetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard
          label="Total spend"
          value={`$${totalUsd.toFixed(4)}`}
          sub={`Last ${period} days`}
          icon={DollarSign}
        />
        <MetricCard
          label="API calls"
          value={totalCalls.toLocaleString()}
          sub="All models"
          icon={Zap}
        />
        <MetricCard
          label="Avg cost / call"
          value={totalCalls > 0 ? `$${(totalUsd / totalCalls).toFixed(5)}` : '—'}
          sub="Across all models"
          icon={TrendingUp}
        />
        <MetricCard
          label="Models active"
          value={String((costData?.byModel ?? []).filter((m) => m.costUsd > 0).length)}
          sub="Routing active"
          icon={BarChart2}
        />
      </div>

      {/* Cost over time */}
      <CostAnalyticsSection days={period} />

      {/* Agent metrics */}
      <AgentMetricsSection />

      {/* Client engagement placeholder */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} className="text-[var(--gold)]" />
          <h3 className="text-sm font-medium">Client Engagement</h3>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Client-level engagement metrics are aggregated from session activity.
          Navigate to a client profile to see individual metrics.
        </p>
      </div>
    </div>
  )
}
