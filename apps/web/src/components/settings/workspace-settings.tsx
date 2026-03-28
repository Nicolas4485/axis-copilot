'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { health } from '@/lib/api'
import { CheckCircle, XCircle, ExternalLink, RefreshCw, FolderOpen, Mail } from 'lucide-react'

interface IntegrationCardProps {
  name: string
  description: string
  icon: React.ElementType
  connected: boolean
  onConnect: () => void
  onDisconnect: () => void
}

function IntegrationCard({
  name,
  description,
  icon: Icon,
  connected,
  onConnect,
  onDisconnect,
}: IntegrationCardProps) {
  return (
    <div className="card flex items-start gap-4">
      <div
        className={`p-2.5 rounded-xl shrink-0 ${
          connected ? 'bg-[var(--success)]/10' : 'bg-[var(--bg-tertiary)]'
        }`}
      >
        <Icon size={20} className={connected ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-[var(--text-primary)]">{name}</p>
          {connected ? (
            <span className="badge badge-green">
              <CheckCircle size={10} className="mr-1" />
              Connected
            </span>
          ) : (
            <span className="badge badge-red">
              <XCircle size={10} className="mr-1" />
              Not connected
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--text-muted)]">{description}</p>
      </div>
      <div className="shrink-0">
        {connected ? (
          <button
            onClick={onDisconnect}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={onConnect}
            className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1"
          >
            <ExternalLink size={12} />
            Connect
          </button>
        )}
      </div>
    </div>
  )
}

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'

export function WorkspaceSettings() {
  const [connecting, setConnecting] = useState<string | null>(null)

  const { data: healthData, refetch, isRefetching } = useQuery({
    queryKey: ['health'],
    queryFn: () => health.check(),
    refetchInterval: 60_000,
    retry: 1,
  })

  const handleConnect = (service: string) => {
    setConnecting(service)
    // OAuth redirect — the API handles the callback
    window.location.href = `${API_BASE}/api/integrations/${service}/connect`
  }

  const handleDisconnect = (_service: string) => {
    // In a real implementation this would call DELETE /api/integrations/:service
    // For now show a placeholder
    alert('Disconnect not yet implemented — remove the OAuth token from the database directly.')
  }

  // Drive and Gmail connectivity are reflected in health check if the API tracks it
  // Using health.neo4j as proxy for whether the backend is reachable
  const backendOnline = healthData?.status === 'ok'

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-[var(--text-primary)]">Google Workspace</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Connect your Google account to enable Drive and Gmail integrations
          </p>
        </div>
        <button
          onClick={() => { void refetch() }}
          disabled={isRefetching}
          className="p-1.5 border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={isRefetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {!backendOnline && (
        <div className="p-3 rounded-xl bg-[var(--warning)]/5 border border-[var(--warning)]/20">
          <p className="text-xs text-[var(--warning)]">
            Backend is offline — connection status may be inaccurate
          </p>
        </div>
      )}

      <div className="space-y-3">
        <IntegrationCard
          name="Google Drive"
          description="Ingest documents, presentations, and spreadsheets from Drive. Webhooks keep knowledge up to date."
          icon={FolderOpen}
          connected={false}
          onConnect={() => handleConnect('google-drive')}
          onDisconnect={() => handleDisconnect('google-drive')}
        />
        <IntegrationCard
          name="Gmail"
          description="Analyse email threads for client context, stakeholder mapping, and relationship intelligence."
          icon={Mail}
          connected={false}
          onConnect={() => handleConnect('gmail')}
          onDisconnect={() => handleDisconnect('gmail')}
        />
      </div>

      {connecting && (
        <div className="p-3 rounded-xl bg-[var(--gold)]/5 border border-[var(--gold)]/20">
          <p className="text-xs text-[var(--gold)]">
            Redirecting to Google OAuth for {connecting}…
          </p>
        </div>
      )}

      <div className="card bg-[var(--bg-tertiary)]">
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          <strong className="text-[var(--text-secondary)]">About Drive webhooks:</strong>{' '}
          Google Drive push notifications expire every 7 days. AXIS renews them automatically
          via a daily cron job at 23:00 UTC. If documents stop syncing, check the API logs.
        </p>
      </div>
    </div>
  )
}
