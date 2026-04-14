'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
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

const PROVIDER_MAP: Record<string, string> = {
  'google-drive': 'GOOGLE_DRIVE',
  gmail: 'GMAIL',
}

interface SyncStatusResponse {
  integrations: Array<{ provider: string; connected: boolean; tokenExpiry: string | null }>
  syncStatus: Record<string, number>
}

export function WorkspaceSettings() {
  const [connecting, setConnecting] = useState<string | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const justConnected = searchParams.get('connected')

  const { data: healthData, refetch: refetchHealth, isRefetching } = useQuery({
    queryKey: ['health'],
    queryFn: () => health.check(),
    refetchInterval: 60_000,
    retry: 1,
  })

  const { data: syncData, refetch: refetchSync } = useQuery({
    queryKey: ['integrations-sync-status'],
    queryFn: async (): Promise<SyncStatusResponse> => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('axis_token') : null
      const res = await fetch(`${API_BASE}/api/integrations/google/sync-status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) return { integrations: [], syncStatus: {} }
      return res.json() as Promise<SyncStatusResponse>
    },
    refetchInterval: 30_000,
    retry: 1,
  })

  const handleRefresh = () => {
    void refetchHealth()
    void refetchSync()
  }

  const isConnected = (provider: string) =>
    syncData?.integrations.some((i) => i.provider === provider) ?? false

  const handleConnect = async (service: string) => {
    setConnecting(service)
    setConnectError(null)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('axis_token') : null
      if (!token) {
        setConnectError('Not authenticated — please log in first.')
        setConnecting(null)
        return
      }
      const provider = PROVIDER_MAP[service]
      if (!provider) throw new Error(`Unknown service: ${service}`)

      const res = await fetch(`${API_BASE}/api/integrations/google/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ provider }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Connection failed' })) as { error: string }
        throw new Error(errData.error)
      }

      const data = await res.json() as { authUrl: string }
      window.location.href = data.authUrl
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Connection failed')
      setConnecting(null)
    }
  }

  const handleDisconnect = (_service: string) => {
    alert('Disconnect not yet implemented — remove the OAuth token from the database directly.')
  }

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
          onClick={handleRefresh}
          disabled={isRefetching}
          className="p-1.5 border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={isRefetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {justConnected && (
        <div className="p-3 rounded-xl bg-[var(--success)]/5 border border-[var(--success)]/20">
          <p className="text-xs text-[var(--success)]">
            <CheckCircle size={12} className="inline mr-1.5" />
            {justConnected.replace(/_/g, ' ')} connected successfully.
          </p>
        </div>
      )}

      {!backendOnline && (
        <div className="p-3 rounded-xl bg-[var(--warning)]/5 border border-[var(--warning)]/20">
          <p className="text-xs text-[var(--warning)]">
            Backend is offline — connection status may be inaccurate
          </p>
        </div>
      )}

      {connectError && (
        <div className="p-3 rounded-xl bg-[var(--error)]/5 border border-[var(--error)]/20">
          <p className="text-xs text-[var(--error)]">{connectError}</p>
        </div>
      )}

      <div className="space-y-3">
        <IntegrationCard
          name="Google Drive"
          description="Ingest documents, presentations, and spreadsheets from Drive. Webhooks keep knowledge up to date."
          icon={FolderOpen}
          connected={isConnected('GOOGLE_DRIVE')}
          onConnect={() => { void handleConnect('google-drive') }}
          onDisconnect={() => handleDisconnect('google-drive')}
        />
        <IntegrationCard
          name="Gmail"
          description="Analyse email threads for client context, stakeholder mapping, and relationship intelligence."
          icon={Mail}
          connected={isConnected('GMAIL')}
          onConnect={() => { void handleConnect('gmail') }}
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
