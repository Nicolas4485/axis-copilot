'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { appSettings } from '@/lib/api'
import { Save, Globe } from 'lucide-react'

export function TeamSettings() {
  const queryClient = useQueryClient()
  const [teamName, setTeamName] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [saved, setSaved] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => appSettings.get(),
    retry: 1,
  })

  useEffect(() => {
    if (data) {
      setTeamName(data.teamName ?? '')
      setWebhookUrl(data.webhookUrl ?? '')
    }
  }, [data])

  const mutation = useMutation({
    mutationFn: () =>
      appSettings.update({
        teamName: teamName.trim() || null,
        webhookUrl: webhookUrl.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['app-settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate()
  }

  if (isLoading) {
    return <div className="h-40 animate-pulse bg-[var(--bg-tertiary)] rounded-xl" />
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Team name */}
      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
          Organisation Name
        </label>
        <input
          type="text"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="e.g. Acme Consulting"
          className="input"
          maxLength={100}
        />
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Shown in export headers and report branding
        </p>
      </div>

      {/* Webhook */}
      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
          <Globe size={14} className="inline mr-1.5 align-middle" />
          Outbound Webhook URL
        </label>
        <input
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://hooks.example.com/axis"
          className="input"
        />
        <p className="text-xs text-[var(--text-muted)] mt-1">
          AXIS will POST session completion events here (JSON). Leave blank to disable.
        </p>
      </div>

      {/* Data retention note */}
      <div className="p-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border)]">
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          <strong>Data stored:</strong> session transcripts, extracted entities, embeddings,
          and uploaded documents. All data is stored locally in your PostgreSQL and Neo4j
          instances. Nothing is sent to Anthropic except the content of individual API calls.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          <Save size={14} />
          {saved ? 'Saved!' : mutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
        {mutation.isError && (
          <p className="text-xs text-[var(--error)]">Failed to save — check API connection</p>
        )}
      </div>
    </form>
  )
}
