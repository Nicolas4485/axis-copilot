'use client'

import { useQuery } from '@tanstack/react-query'
import { health } from '@/lib/api'

export function HealthIndicator() {
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: () => health.check(),
    refetchInterval: 60_000,
  })

  if (!data) return null

  const services = [
    { label: 'DB',       status: data.db        },
    { label: 'Redis',    status: data.redis      },
    { label: 'Neo4j',    status: data.neo4j      },
    { label: 'AI',       status: data.anthropic  },
  ]

  const okCount = services.filter((s) => s.status === 'ok').length
  const allOk   = okCount === services.length

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--border)]
                 bg-[var(--bg-secondary)] cursor-default"
      title={services.map((s) => `${s.label}: ${s.status}`).join(' · ')}
    >
      {/* Aggregate dot */}
      <div className="relative flex items-center justify-center">
        <div className={`w-1.5 h-1.5 rounded-full ${allOk ? 'bg-[var(--success)]' : 'bg-[var(--warning)]'}`} />
        {allOk && (
          <div className="absolute w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-ping opacity-40" />
        )}
      </div>
      <span className="text-[11px] font-mono text-[var(--text-muted)]">
        {okCount}/{services.length} services
      </span>
      <span className="text-[var(--border)]">·</span>
      <span className="text-[11px] font-mono text-[var(--text-muted)]">v{data.version}</span>
    </div>
  )
}
