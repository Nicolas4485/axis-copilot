'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { appSettings, type ModelSettings } from '@/lib/api'
import { Save, RotateCcw } from 'lucide-react'

const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', tier: 'cloud' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', tier: 'cloud' },
  { id: 'qwen3:8b', label: 'Qwen3 8B (local)', tier: 'local' },
] as const

const ROUTING_MODES = [
  { id: 'auto', label: 'Auto', desc: 'Route by task complexity — Qwen3 for pipeline, Sonnet for outputs' },
  { id: 'local', label: 'Local only', desc: 'Use Qwen3 8B for all tasks (free, slower)' },
  { id: 'cloud', label: 'Cloud only', desc: 'Use Claude for all tasks (paid, faster)' },
] as const

const DEFAULT_SETTINGS: ModelSettings = {
  defaultModel: 'claude-sonnet-4-6',
  temperature: 0.7,
  maxTokens: 4096,
  routingMode: 'auto',
  useCache: true,
}

export function ModelConfig() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ModelSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)

  const { data } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => appSettings.get(),
    retry: 1,
  })

  useEffect(() => {
    if (data?.model) {
      setForm(data.model)
    }
  }, [data])

  const mutation = useMutation({
    mutationFn: (model: ModelSettings) => appSettings.update({ model }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['app-settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(form)
  }

  const handleReset = () => setForm(DEFAULT_SETTINGS)

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Routing mode */}
      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
          Routing Mode
        </label>
        <div className="space-y-2">
          {ROUTING_MODES.map((mode) => (
            <label
              key={mode.id}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                form.routingMode === mode.id
                  ? 'border-[var(--gold)] bg-[var(--gold)]/5'
                  : 'border-[var(--border)] hover:border-[var(--border-active)]'
              }`}
            >
              <input
                type="radio"
                name="routingMode"
                value={mode.id}
                checked={form.routingMode === mode.id}
                onChange={() => setForm((f) => ({ ...f, routingMode: mode.id }))}
                className="mt-0.5 accent-[var(--gold)]"
              />
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{mode.label}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{mode.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Default model */}
      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
          Default Output Model
        </label>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Used for user-facing responses when routing mode is &quot;auto&quot;
        </p>
        <select
          value={form.defaultModel}
          onChange={(e) => setForm((f) => ({ ...f, defaultModel: e.target.value }))}
          className="input"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Temperature */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-[var(--text-primary)]">
            Temperature
          </label>
          <span className="text-sm text-[var(--gold)]">{form.temperature.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={form.temperature}
          onChange={(e) => setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) }))}
          className="w-full accent-[var(--gold)]"
        />
        <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1">
          <span>Precise (0.0)</span>
          <span>Creative (1.0)</span>
        </div>
      </div>

      {/* Max tokens */}
      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
          Max Tokens
        </label>
        <input
          type="number"
          min={256}
          max={32768}
          step={256}
          value={form.maxTokens}
          onChange={(e) => setForm((f) => ({ ...f, maxTokens: parseInt(e.target.value, 10) }))}
          className="input"
        />
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Maximum output tokens per response. Higher values cost more.
        </p>
      </div>

      {/* Prompt caching */}
      <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--border)]">
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Prompt Caching</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Cache system prompts with Anthropic — reduces cost by up to 90%
          </p>
        </div>
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, useCache: !f.useCache }))}
          className={`w-10 h-5 rounded-full transition-colors relative ${
            form.useCache ? 'bg-[var(--gold)]' : 'bg-[var(--border)]'
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              form.useCache ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          <Save size={14} />
          {saved ? 'Saved!' : mutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="btn-secondary flex items-center gap-2"
        >
          <RotateCcw size={14} />
          Reset Defaults
        </button>
        {mutation.isError && (
          <p className="text-xs text-[var(--error)]">Failed to save settings</p>
        )}
      </div>
    </form>
  )
}
