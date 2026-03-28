'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiKeys, type ApiKeyEntry } from '@/lib/api'
import { Plus, Trash2, Copy, Check, Eye, EyeOff } from 'lucide-react'

function KeyRow({
  entry,
  onRevoke,
}: {
  entry: ApiKeyEntry
  onRevoke: (id: string) => void
}) {
  const [copied, setCopied] = useState(false)

  const copyPrefix = () => {
    void navigator.clipboard.writeText(entry.prefix + '…')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[var(--border)] last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--text-primary)]">{entry.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <code className="text-xs text-[var(--text-muted)] font-mono">{entry.prefix}…</code>
          <button
            onClick={copyPrefix}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            title="Copy prefix"
          >
            {copied ? <Check size={11} className="text-[var(--success)]" /> : <Copy size={11} />}
          </button>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-[var(--text-muted)]">
          Created {new Date(entry.createdAt).toLocaleDateString()}
        </p>
        {entry.lastUsedAt && (
          <p className="text-xs text-[var(--text-muted)]">
            Last used {new Date(entry.lastUsedAt).toLocaleDateString()}
          </p>
        )}
      </div>
      <button
        onClick={() => onRevoke(entry.id)}
        className="p-1.5 text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
        title="Revoke key"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

interface NewKeyReveal {
  name: string
  secret: string
}

export function ApiKeyManager() {
  const queryClient = useQueryClient()
  const [newKeyName, setNewKeyName] = useState('')
  const [revealedKey, setRevealedKey] = useState<NewKeyReveal | null>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [copied, setCopied] = useState(false)
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiKeys.list(),
    retry: 1,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => apiKeys.create({ name }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      setRevealedKey({ name: result.key.name, secret: result.secret })
      setNewKeyName('')
      setCreating(false)
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiKeys.revoke(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKeyName.trim()) return
    createMutation.mutate(newKeyName.trim())
  }

  const handleCopySecret = () => {
    if (!revealedKey) return
    void navigator.clipboard.writeText(revealedKey.secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const keyList: ApiKeyEntry[] = data?.keys ?? []

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">API Keys</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Use these keys to authenticate programmatic access to the AXIS API.
          Keys are shown only once — store them securely.
        </p>
      </div>

      {/* Newly created key reveal */}
      {revealedKey && (
        <div className="p-4 rounded-xl border border-[var(--success)]/30 bg-[var(--success)]/5">
          <p className="text-xs font-medium text-[var(--success)] mb-2">
            Key created: {revealedKey.name}
          </p>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Copy this key now — it will not be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-[var(--bg-tertiary)] rounded-lg px-3 py-2 font-mono text-[var(--text-primary)] overflow-hidden">
              {showSecret ? revealedKey.secret : '•'.repeat(Math.min(revealedKey.secret.length, 40))}
            </code>
            <button
              onClick={() => setShowSecret((s) => !s)}
              className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              onClick={handleCopySecret}
              className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              {copied ? <Check size={14} className="text-[var(--success)]" /> : <Copy size={14} />}
            </button>
          </div>
          <button
            onClick={() => setRevealedKey(null)}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] mt-3"
          >
            I've copied the key — dismiss
          </button>
        </div>
      )}

      {/* Existing keys */}
      <div className="card">
        {isLoading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading keys…</p>
        ) : keyList.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No API keys yet</p>
        ) : (
          <div>
            {keyList.map((key) => (
              <KeyRow
                key={key.id}
                entry={key}
                onRevoke={(id) => {
                  if (confirm('Revoke this API key? This cannot be undone.')) {
                    revokeMutation.mutate(id)
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create new key */}
      {creating ? (
        <form onSubmit={handleCreate} className="flex items-center gap-2">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. CI pipeline)"
            className="input flex-1"
            autoFocus
          />
          <button
            type="submit"
            disabled={!newKeyName.trim() || createMutation.isPending}
            className="btn-primary disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="btn-secondary"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="btn-secondary flex items-center gap-2"
        >
          <Plus size={14} />
          Create API Key
        </button>
      )}

      {createMutation.isError && (
        <p className="text-xs text-[var(--error)]">Failed to create key — check API logs</p>
      )}
    </div>
  )
}
