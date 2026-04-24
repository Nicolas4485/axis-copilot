'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { health } from '@/lib/api'
import { CheckCircle, XCircle, ExternalLink, RefreshCw, FolderOpen, Mail, Github, Eye, EyeOff } from 'lucide-react'

interface IntegrationCardProps {
  name: string
  description: string
  icon: React.ElementType
  connected: boolean
  disconnecting?: boolean
  onConnect: () => void
  onDisconnect: () => void
}

function IntegrationCard({
  name,
  description,
  icon: Icon,
  connected,
  disconnecting,
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
            disabled={disconnecting}
            className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-50"
          >
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
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

// ─── GitHub PAT card ──────────────────────────────────────────

function GitHubCard({ connected, login, onSave, onDisconnect }: {
  connected: boolean
  login?: string
  onSave: (token: string) => Promise<void>
  onDisconnect: () => Promise<void>
}) {
  const [editing, setEditing]     = useState(!connected)
  const [token, setToken]         = useState('')
  const [show, setShow]           = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  async function handleSave() {
    if (!token.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave(token.trim())
      setToken('')
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save token')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-start gap-4">
        <div className={`p-2.5 rounded-xl shrink-0 ${connected ? 'bg-[var(--success)]/10' : 'bg-[var(--bg-tertiary)]'}`}>
          <Github size={20} className={connected ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-[var(--text-primary)]">GitHub</p>
            {connected ? (
              <span className="badge badge-green"><CheckCircle size={10} className="mr-1" />Connected{login ? ` · @${login}` : ''}</span>
            ) : (
              <span className="badge badge-red"><XCircle size={10} className="mr-1" />Not connected</span>
            )}
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Lets agents search your repos, list files, and read code. Requires a Personal Access Token with <code className="text-[var(--text-secondary)]">repo</code> scope.
          </p>
        </div>
        <div className="shrink-0">
          {connected ? (
            <div className="flex gap-2">
              <button onClick={() => setEditing(e => !e)} className="btn-secondary text-xs px-3 py-1.5">
                {editing ? 'Cancel' : 'Replace'}
              </button>
              <button onClick={() => void onDisconnect()} className="btn-secondary text-xs px-3 py-1.5 text-red-400 hover:text-red-300">
                Disconnect
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {(editing || !connected) && (
        <div className="flex gap-2 ml-12">
          <div className="relative flex-1">
            <input
              type={show ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSave() }}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--gold)] pr-9"
            />
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            >
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            onClick={() => void handleSave()}
            disabled={saving || !token.trim()}
            className="btn-primary text-xs px-4 py-2 disabled:opacity-50"
          >
            {saving ? 'Verifying…' : 'Save'}
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 ml-12">{error}</p>
      )}

      {!connected && (
        <p className="text-xs text-[var(--text-muted)] ml-12">
          Generate a token at <span className="text-[var(--gold)]">github.com → Settings → Developer settings → Personal access tokens</span>. Select <code className="text-[var(--text-secondary)]">repo</code> scope (read-only is fine).
        </p>
      )}
    </div>
  )
}

interface SyncStatusResponse {
  integrations: Array<{ provider: string; connected: boolean; tokenExpiry: string | null }>
  syncStatus: Record<string, number>
}

export function WorkspaceSettings() {
  const [connecting, setConnecting] = useState<string | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [githubLogin, setGithubLogin] = useState<string | undefined>()
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
      const res = await fetch(`${API_BASE}/api/integrations/google/sync-status`, {
        credentials: 'include',
      })
      if (!res.ok) return { integrations: [], syncStatus: {} }
      return res.json() as Promise<SyncStatusResponse>
    },
    refetchInterval: 30_000,
    retry: 1,
  })

  const handleGithubSave = async (token: string) => {
    const res = await fetch(`${API_BASE}/api/integrations/github/pat`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    const data = await res.json() as { ok?: boolean; login?: string; error?: string }
    if (!res.ok) throw new Error(data.error ?? 'Failed to save token')
    setGithubLogin(data.login)
    void refetchSync()
  }

  const handleGithubDisconnect = async () => {
    await fetch(`${API_BASE}/api/integrations/github/pat`, {
      method: 'DELETE',
      credentials: 'include',
    })
    setGithubLogin(undefined)
    void refetchSync()
  }

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
      const provider = PROVIDER_MAP[service]
      if (!provider) throw new Error(`Unknown service: ${service}`)

      const res = await fetch(`${API_BASE}/api/integrations/google/connect`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
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

  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [disconnectError, setDisconnectError] = useState<string | null>(null)

  const handleDisconnect = async (service: string) => {
    const provider = PROVIDER_MAP[service]
    if (!provider) return
    setDisconnecting(service)
    setDisconnectError(null)
    try {
      const res = await fetch(`${API_BASE}/api/integrations/google/${provider}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Disconnect failed' })) as { error: string }
        throw new Error(errData.error)
      }
      void refetchSync()
    } catch (err) {
      setDisconnectError(err instanceof Error ? err.message : 'Disconnect failed')
    } finally {
      setDisconnecting(null)
    }
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

      {disconnectError && (
        <div className="p-3 rounded-xl bg-[var(--error)]/5 border border-[var(--error)]/20">
          <p className="text-xs text-[var(--error)]">{disconnectError}</p>
        </div>
      )}

      <div className="space-y-3">
        <IntegrationCard
          name="Google Drive"
          description="Ingest documents, presentations, and spreadsheets from Drive. Webhooks keep knowledge up to date."
          icon={FolderOpen}
          connected={isConnected('GOOGLE_DRIVE')}
          disconnecting={disconnecting === 'google-drive'}
          onConnect={() => { void handleConnect('google-drive') }}
          onDisconnect={() => { void handleDisconnect('google-drive') }}
        />
        <IntegrationCard
          name="Gmail"
          description="Analyse email threads for client context, stakeholder mapping, and relationship intelligence."
          icon={Mail}
          connected={isConnected('GMAIL')}
          disconnecting={disconnecting === 'gmail'}
          onConnect={() => { void handleConnect('gmail') }}
          onDisconnect={() => { void handleDisconnect('gmail') }}
        />
        <GitHubCard
          connected={isConnected('GITHUB')}
          {...(githubLogin ? { login: githubLogin } : {})}
          onSave={handleGithubSave}
          onDisconnect={handleGithubDisconnect}
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
