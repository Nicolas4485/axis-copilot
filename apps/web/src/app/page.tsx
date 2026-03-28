'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { health, type HealthStatus } from '@/lib/api'
import { HealthIndicator } from '@/components/health-indicator'
import { Plus, MessageSquare, Users, Clock, ArrowRight, Mic } from 'lucide-react'

const START_OPTIONS = [
  { id: 'text', label: 'Chat with Aria', desc: 'Text-based conversation', icon: MessageSquare, href: '/session/new' },
  { id: 'live', label: 'Talk to Aria', desc: 'Voice, camera, screen share', icon: Mic, href: '/session/new?live=true' },
] as const

export default function Dashboard() {
  const { data: healthData } = useQuery<HealthStatus>({
    queryKey: ['health'],
    queryFn: () => health.check(),
    refetchInterval: 60_000,
  })

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl text-[var(--gold)]">Dashboard</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Welcome back. What are we working on?</p>
        </div>
        <HealthIndicator />
      </div>

      {/* Quick Start */}
      <section>
        <h2 className="font-serif text-lg mb-3">Talk to Aria</h2>
        <div className="grid grid-cols-2 gap-4 max-w-lg">
          {START_OPTIONS.map((opt) => (
            <Link
              key={opt.id}
              href={opt.href}
              className="card hover:border-[var(--gold)]/30 transition-colors group"
            >
              <div className="flex items-center gap-2 mb-2">
                <opt.icon size={16} className="text-[var(--gold)]" />
                <span className="text-sm font-medium">{opt.label}</span>
              </div>
              <p className="text-xs text-[var(--text-muted)]">{opt.desc}</p>
            </Link>
          ))}
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-3">
          Aria routes your requests to specialist agents (Product, Process, Competitive, Stakeholder) automatically.
        </p>
      </section>

      {/* Recent Sessions + Clients */}
      <div className="grid grid-cols-2 gap-6">
        {/* Recent Sessions */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-lg">Recent Sessions</h2>
            <Link href="/" className="text-xs text-[var(--gold)] hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            <EmptyState
              icon={<MessageSquare size={24} className="text-[var(--text-muted)]" />}
              message="No sessions yet"
              action="Start a new session above"
            />
          </div>
        </section>

        {/* Clients */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-lg">Clients</h2>
            <Link href="/" className="text-xs text-[var(--gold)] hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            <EmptyState
              icon={<Users size={24} className="text-[var(--text-muted)]" />}
              message="No clients yet"
              action="Clients are created during intake sessions"
            />
          </div>
        </section>
      </div>

      {/* System Status */}
      {healthData && (
        <section>
          <h2 className="font-serif text-lg mb-3">System Status</h2>
          <div className="card grid grid-cols-5 gap-4">
            <StatusItem label="Database" status={healthData.db} />
            <StatusItem label="Redis" status={healthData.redis} />
            <StatusItem label="Neo4j" status={healthData.neo4j} />
            <StatusItem label="Anthropic" status={healthData.anthropic} />
            <StatusItem label="Claude" status={healthData.anthropic === 'ok' ? 'ok' : 'unavailable'} />
          </div>
        </section>
      )}
    </div>
  )
}

function StatusItem({ label, status }: { label: string; status: string }) {
  const isOk = status === 'ok' || status === 'active'
  return (
    <div className="text-center">
      <div className={`w-2 h-2 rounded-full mx-auto mb-1 ${isOk ? 'bg-[var(--success)]' : 'bg-[var(--error)]'}`} />
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
      <p className={`text-xs ${isOk ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>{status}</p>
    </div>
  )
}

function EmptyState({ icon, message, action }: { icon: React.ReactNode; message: string; action: string }) {
  return (
    <div className="card flex flex-col items-center justify-center py-8 text-center">
      {icon}
      <p className="text-sm text-[var(--text-secondary)] mt-2">{message}</p>
      <p className="text-xs text-[var(--text-muted)] mt-1">{action}</p>
    </div>
  )
}
