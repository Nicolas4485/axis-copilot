'use client'

import { useQuery } from '@tanstack/react-query'
import { health } from '@/lib/api'
import { Cpu, HardDrive, Wifi } from 'lucide-react'

export function HealthIndicator() {
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: () => health.check(),
    refetchInterval: 60_000,
  })

  if (!data) return null

  const anthropicOk = data.anthropic === 'ok'
  const services = [data.db, data.redis, data.neo4j, data.anthropic].filter((s) => s === 'ok').length

  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="flex items-center gap-1.5" title={`Anthropic: ${data.anthropic}`}>
        <Cpu size={14} className={anthropicOk ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'} />
        <span className={anthropicOk ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}>
          Claude {anthropicOk ? 'Active' : 'Off'}
        </span>
      </div>
      <div className="flex items-center gap-1.5" title={`Services: ${services}/4 online`}>
        <Wifi size={14} className={services === 4 ? 'text-[var(--success)]' : 'text-[var(--warning)]'} />
        <span className="text-[var(--text-muted)]">{services}/4</span>
      </div>
      <div className="flex items-center gap-1.5" title={`Version: ${data.version}`}>
        <HardDrive size={14} className="text-[var(--text-muted)]" />
        <span className="text-[var(--text-muted)]">v{data.version}</span>
      </div>
    </div>
  )
}
