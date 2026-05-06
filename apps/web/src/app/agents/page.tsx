'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bot, Plus, Pencil, Trash2, Wand2, ChevronDown, ChevronUp,
  Save, X, Shield, Wrench, FileText, Loader2, Check, AlertTriangle,
} from 'lucide-react'

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...((options.headers as Record<string, string>) ?? {}) },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `Request failed: ${res.status}`)
  }
  return res.json()
}

// ─── Types ────────────────────────────────────────────────────

interface AgentDefinition {
  id: string
  key: string
  name: string
  persona: string
  tier: 'MICRO' | 'TASK' | 'AGENT'
  systemPromptText: string
  tools: string[]
  mdManifest: string | null
  isBuiltIn: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface GeneratedAgent {
  key: string
  name: string
  persona: string
  tier: string
  systemPromptText: string
  tools: string[]
  mdManifest: string
}

// ─── Agent card colours ──────────────────────────────────────

const AGENT_COLOURS: Record<string, string> = {
  AGENT_INTAKE:         '#0B2545',  // navy — Aria (brand accent)
  AGENT_PRODUCT:        '#60a5fa',  // blue — Sean
  AGENT_PROCESS:        '#22c55e',  // green — Kevin
  AGENT_COMPETITIVE:    '#f472b6',  // pink — Mel
  AGENT_STAKEHOLDER:    '#a78bfa',  // purple — Anjie
  AGENT_DUE_DILIGENCE: '#fb923c',  // orange — Alex
}

function agentColour(key: string): string {
  return AGENT_COLOURS[key] ?? 'var(--ink-3)'
}

// ─── Token counter (rough: 4 chars ≈ 1 token) ────────────────

function tokenCount(text: string): number {
  return Math.ceil(text.length / 4)
}

const TIER_LIMITS = { MICRO: 150, TASK: 400, AGENT: 800 }

// ─── Tool pill ────────────────────────────────────────────────

function ToolPill({ name }: { name: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono"
      style={{ background: 'var(--surface-sunk)', color: 'var(--ink-2)' }}
    >
      {name}
    </span>
  )
}

// ─── Edit Panel ───────────────────────────────────────────────

function EditPanel({
  agent,
  onClose,
  onSaved,
}: {
  agent: AgentDefinition
  onClose: () => void
  onSaved: () => void
}) {
  const [name,   setName]   = useState(agent.name)
  const [persona, setPersona] = useState(agent.persona)
  const [prompt,  setPrompt]  = useState(agent.systemPromptText)
  const [tools,   setTools]   = useState(agent.tools.join(', '))
  const [manifest, setManifest] = useState(agent.mdManifest ?? '')
  const [tab, setTab] = useState<'prompt' | 'tools' | 'manifest'>('prompt')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [saved, setSaved]   = useState(false)

  const tokens   = tokenCount(prompt)
  const limit    = TIER_LIMITS[agent.tier]
  const overLimit = tokens > limit

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await apiRequest(`/api/agents/${agent.key}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          persona,
          systemPromptText: prompt,
          tools: tools.split(',').map((t) => t.trim()).filter(Boolean),
          mdManifest: manifest || null,
        }),
      })
      setSaved(true)
      setTimeout(() => { setSaved(false); onSaved() }, 1000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--line-strong)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4"
          style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ background: `${agentColour(agent.key)}22`, color: agentColour(agent.key) }}>
              {agent.name[0]}
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                Edit {agent.name}
              </h2>
              <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                {agent.key} · {agent.tier}
                {agent.isBuiltIn && (
                  <span className="ml-2 inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                    <Shield size={10} /> Built-in
                  </span>
                )}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors">
            <X size={15} style={{ color: 'var(--ink-3)' }} />
          </button>
        </div>

        <div className="px-6 pt-4 space-y-3">
          {/* Name + Persona */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--ink-3)' }}>Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--ink-3)' }}>Persona</label>
              <input
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                className="input w-full text-sm"
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="ax-tabs" style={{ paddingTop: 4 }}>
            {[
              { id: 'prompt',   label: 'System Prompt', icon: Bot    },
              { id: 'tools',    label: 'Tools',          icon: Wrench },
              { id: 'manifest', label: 'Manifest (.md)', icon: FileText },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id as typeof tab)}
                className={`ax-tab${tab === id ? ' is-active' : ''}`}
              >
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>

          {/* Prompt tab */}
          {tab === 'prompt' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-medium" style={{ color: 'var(--ink-3)' }}>System prompt</label>
                <span className="text-[11px] font-mono" style={{ color: overLimit ? 'var(--bad)' : 'var(--ink-3)' }}>
                  {tokens} / {limit} tokens {overLimit ? '⚠ over limit' : ''}
                </span>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={14}
                className="input w-full text-sm font-mono resize-none"
                style={{
                  borderColor: overLimit ? 'var(--bad)' : undefined,
                  lineHeight: '1.6',
                }}
              />
            </div>
          )}

          {/* Tools tab */}
          {tab === 'tools' && (
            <div>
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--ink-3)' }}>
                Tools (comma-separated)
              </label>
              <textarea
                value={tools}
                onChange={(e) => setTools(e.target.value)}
                rows={4}
                className="input w-full text-sm font-mono resize-none"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tools.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                  <ToolPill key={t} name={t} />
                ))}
              </div>
            </div>
          )}

          {/* Manifest tab */}
          {tab === 'manifest' && (
            <div>
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--ink-3)' }}>
                Markdown capability manifest (optional)
              </label>
              <textarea
                value={manifest}
                onChange={(e) => setManifest(e.target.value)}
                rows={12}
                placeholder="# Agent Name — Title&#10;&#10;## Role&#10;...&#10;&#10;## Capabilities&#10;- ...&#10;&#10;## Output Schema&#10;..."
                className="input w-full text-sm font-mono resize-none"
              />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
              style={{ background: 'var(--bad-soft)', color: 'var(--bad)', border: '1px solid var(--bad-b)' }}>
              <AlertTriangle size={12} /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 mt-2"
          style={{ borderTop: '1px solid var(--line)' }}>
          <button onClick={onClose} className="ax-btn">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || overLimit}
            className="ax-btn is-primary"
            style={{
              background: saved ? 'var(--good-soft)' : undefined,
              color: saved ? 'var(--good)' : undefined,
              opacity: overLimit ? 0.5 : 1,
            }}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <Save size={13} />}
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create Agent Panel ───────────────────────────────────────

function CreateAgentPanel({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [tab, setTab] = useState<'generate' | 'manual'>('generate')
  const [description, setDescription] = useState('')
  const [generating, setGenerating]   = useState(false)
  const [generated, setGenerated]     = useState<GeneratedAgent | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)

  // manual form fields
  const [manualKey,    setManualKey]    = useState('')
  const [manualName,   setManualName]   = useState('')
  const [manualPersona, setManualPersona] = useState('')
  const [manualPrompt, setManualPrompt] = useState('')
  const [manualTools,  setManualTools]  = useState('')

  async function handleGenerate() {
    if (!description.trim()) return
    setGenerating(true)
    setError(null)
    setGenerated(null)
    try {
      const data = await apiRequest<{ generated: GeneratedAgent }>('/api/agents/generate', {
        method: 'POST',
        body: JSON.stringify({ description }),
      })
      setGenerated(data.generated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  async function handleCreate(agent: { key: string; name: string; persona: string; systemPromptText: string; tools: string[]; mdManifest?: string }) {
    setSaving(true)
    setError(null)
    try {
      await apiRequest('/api/agents', {
        method: 'POST',
        body: JSON.stringify(agent),
      })
      setSaved(true)
      setTimeout(() => { setSaved(false); onCreated() }, 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--line-strong)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4"
          style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="flex items-center gap-2">
            <Plus size={16} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Create Agent</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors">
            <X size={15} style={{ color: 'var(--ink-3)' }} />
          </button>
        </div>

        {/* Tabs */}
        <div className="ax-tabs px-6 pt-4">
          {[
            { id: 'generate', label: 'AI Generate', icon: Wand2 },
            { id: 'manual',   label: 'Manual',       icon: Pencil },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id as typeof tab)}
              className={`ax-tab${tab === id ? ' is-active' : ''}`}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* AI Generate tab */}
          {tab === 'generate' && (
            <>
              <div>
                <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  Describe the agent you need
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="e.g. A financial analysis agent that extracts KPIs from earnings reports, compares them to sector benchmarks, and flags anomalies for IC review..."
                  className="input w-full text-sm resize-none"
                />
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating || !description.trim()}
                className="ax-btn is-primary"
                style={{ opacity: generating || !description.trim() ? 0.5 : 1 }}
              >
                {generating ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                {generating ? 'Generating…' : 'Generate with AI'}
              </button>

              {/* Generated preview */}
              {generated && (
                <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
                  <div className="flex items-center gap-2 pt-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                      {generated.name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                        {generated.name} <span className="font-mono text-[11px] ml-1" style={{ color: 'var(--ink-3)' }}>{generated.key}</span>
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>{generated.persona}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-medium mb-1" style={{ color: 'var(--ink-3)' }}>System Prompt Preview</p>
                    <pre className="text-[11px] font-mono p-3 rounded-lg overflow-auto max-h-40 whitespace-pre-wrap"
                      style={{ background: 'var(--surface-sunk)', color: 'var(--ink-2)', lineHeight: '1.5' }}>
                      {generated.systemPromptText}
                    </pre>
                  </div>

                  <div>
                    <p className="text-[11px] font-medium mb-1" style={{ color: 'var(--ink-3)' }}>Tools</p>
                    <div className="flex flex-wrap gap-1.5">
                      {generated.tools.map((t) => <ToolPill key={t} name={t} />)}
                    </div>
                  </div>

                  <button
                    onClick={() => handleCreate({
                      key: generated.key,
                      name: generated.name,
                      persona: generated.persona,
                      systemPromptText: generated.systemPromptText,
                      tools: generated.tools,
                      mdManifest: generated.mdManifest,
                    })}
                    disabled={saving || saved}
                    className="ax-btn is-primary"
                    style={saved ? { background: 'var(--good-soft)', color: 'var(--good)' } : {}}
                  >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <Plus size={13} />}
                    {saved ? 'Created!' : saving ? 'Creating…' : 'Create this Agent'}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Manual tab */}
          {tab === 'manual' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--ink-3)' }}>Key (SCREAMING_SNAKE_CASE)</label>
                  <input
                    value={manualKey}
                    onChange={(e) => setManualKey(e.target.value.toUpperCase().replace(/[^A-Z_]/g, ''))}
                    placeholder="AGENT_MY_SPECIALIST"
                    className="input w-full text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--ink-3)' }}>Name</label>
                  <input
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="Jordan"
                    className="input w-full text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--ink-3)' }}>Persona</label>
                <input
                  value={manualPersona}
                  onChange={(e) => setManualPersona(e.target.value)}
                  placeholder="One-sentence description of the agent's role"
                  className="input w-full text-sm"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium" style={{ color: 'var(--ink-3)' }}>System Prompt</label>
                  <span className="text-[11px] font-mono" style={{ color: tokenCount(manualPrompt) > 800 ? 'var(--bad)' : 'var(--ink-3)' }}>
                    {tokenCount(manualPrompt)} / 800 tokens
                  </span>
                </div>
                <textarea
                  value={manualPrompt}
                  onChange={(e) => setManualPrompt(e.target.value)}
                  rows={10}
                  placeholder="You are [Name], the [role] specialist on the AXIS team..."
                  className="input w-full text-sm font-mono resize-none"
                  style={{ lineHeight: '1.6' }}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--ink-3)' }}>Tools (comma-separated)</label>
                <input
                  value={manualTools}
                  onChange={(e) => setManualTools(e.target.value)}
                  placeholder="search_knowledge_base, web_search, save_analysis"
                  className="input w-full text-sm font-mono"
                />
              </div>

              <button
                onClick={() => handleCreate({
                  key: manualKey,
                  name: manualName,
                  persona: manualPersona,
                  systemPromptText: manualPrompt,
                  tools: manualTools.split(',').map((t) => t.trim()).filter(Boolean),
                })}
                disabled={saving || saved || !manualKey || !manualName || !manualPrompt}
                className="ax-btn is-primary"
                style={{
                  ...(saved ? { background: 'var(--good-soft)', color: 'var(--good)' } : {}),
                  opacity: !manualKey || !manualName || !manualPrompt ? 0.5 : 1,
                }}
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <Plus size={13} />}
                {saved ? 'Created!' : saving ? 'Creating…' : 'Create Agent'}
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
              style={{ background: 'var(--bad-soft)', color: 'var(--bad)', border: '1px solid var(--bad-b)' }}>
              <AlertTriangle size={12} /> {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Agent Card ───────────────────────────────────────────────

function AgentCard({
  agent,
  onEdit,
  onDelete,
}: {
  agent: AgentDefinition
  onEdit: (agent: AgentDefinition) => void
  onDelete: (key: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const colour = agentColour(agent.key)
  const tokens = tokenCount(agent.systemPromptText)
  const limit  = TIER_LIMITS[agent.tier]

  return (
    <div
      className="ax-card rounded-xl overflow-hidden transition-all duration-200"
      style={{ border: `1px solid ${expanded ? `${colour}30` : 'var(--line)'}` }}
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
            style={{ background: `${colour}18`, color: colour }}
          >
            {agent.name[0]}
          </div>

          {/* Info */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{agent.name}</span>
              {agent.isBuiltIn && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  <Shield size={9} /> Built-in
                </span>
              )}
              {!agent.isActive && (
                <span className="px-1.5 py-0.5 rounded text-[10px]"
                  style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>
                  Inactive
                </span>
              )}
            </div>
            <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>
              {agent.persona}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] font-mono mr-2" style={{ color: 'var(--ink-4)' }}>
            {agent.tier} · {tokens}/{limit}t
          </span>
          <button
            onClick={() => onEdit(agent)}
            className="ax-icon-btn"
            title="Edit agent"
          >
            <Pencil size={13} />
          </button>
          {!agent.isBuiltIn && (
            <button
              onClick={() => onDelete(agent.key)}
              className="ax-icon-btn"
              style={{ color: 'var(--bad)' }}
              title="Delete agent"
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="ax-icon-btn"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3" style={{ borderTop: '1px solid var(--line)' }}>
          {/* Tools */}
          {agent.tools.length > 0 && (
            <div className="pt-3">
              <p className="text-[10px] font-medium mb-2" style={{ color: 'var(--ink-4)' }}>TOOLS</p>
              <div className="flex flex-wrap gap-1.5">
                {agent.tools.map((t) => <ToolPill key={t} name={t} />)}
              </div>
            </div>
          )}

          {/* Prompt preview */}
          <div>
            <p className="text-[10px] font-medium mb-2" style={{ color: 'var(--ink-4)' }}>SYSTEM PROMPT</p>
            <pre
              className="text-[11px] font-mono p-3 rounded-lg overflow-auto max-h-32 whitespace-pre-wrap"
              style={{ background: 'var(--surface-sunk)', color: 'var(--ink-3)', lineHeight: '1.5' }}
            >
              {agent.systemPromptText.slice(0, 500)}{agent.systemPromptText.length > 500 ? '…' : ''}
            </pre>
          </div>

          {/* Manifest */}
          {agent.mdManifest && (
            <div>
              <p className="text-[10px] font-medium mb-2" style={{ color: 'var(--ink-4)' }}>MANIFEST</p>
              <pre
                className="text-[11px] font-mono p-3 rounded-lg overflow-auto max-h-24 whitespace-pre-wrap"
                style={{ background: 'var(--surface-sunk)', color: 'var(--ink-3)', lineHeight: '1.5' }}
              >
                {agent.mdManifest.slice(0, 300)}{agent.mdManifest.length > 300 ? '…' : ''}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────

export default function AgentsPage() {
  const queryClient = useQueryClient()
  const [editingAgent, setEditingAgent] = useState<AgentDefinition | null>(null)
  const [showCreate, setShowCreate]     = useState(false)
  const [filter, setFilter]             = useState<'all' | 'consulting' | 'pe'>('all')

  const { data, isLoading, error } = useQuery({
    queryKey: ['agents'],
    queryFn:  () => apiRequest<{ agents: AgentDefinition[] }>('/api/agents'),
  })

  const deleteMutation = useMutation({
    mutationFn: (key: string) => apiRequest(`/api/agents/${key}`, { method: 'DELETE' }),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  })

  const agents = data?.agents ?? []

  const consultingKeys = new Set(['AGENT_INTAKE', 'AGENT_PRODUCT', 'AGENT_PROCESS', 'AGENT_COMPETITIVE', 'AGENT_STAKEHOLDER'])
  const peKeys         = new Set(['AGENT_DUE_DILIGENCE'])

  const filtered = agents.filter((a) => {
    if (filter === 'consulting') return consultingKeys.has(a.key) || !peKeys.has(a.key)
    if (filter === 'pe')         return peKeys.has(a.key) || (!consultingKeys.has(a.key) && !a.isBuiltIn)
    return true
  })

  const builtIn  = filtered.filter((a) => a.isBuiltIn)
  const custom   = filtered.filter((a) => !a.isBuiltIn)

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg)' }}>
    <div className="ax-page animate-fade-up" style={{ maxWidth: 860 }}>
      {/* Page header */}
      <div className="ax-page-head">
        <div className="ax-page-head-text">
          <div className="ax-eyebrow">Firm</div>
          <h1 className="ax-h1">Agents</h1>
          <p className="ax-sub">
            {agents.length} agent{agents.length !== 1 ? 's' : ''} · Edit prompts, tools, and manifests
          </p>
        </div>
        <div className="ax-page-actions">
          <button onClick={() => setShowCreate(true)} className="ax-btn is-primary">
            <Plus size={13} /> New Agent
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="ax-tabs" style={{ marginBottom: 20 }}>
        {[
          { id: 'all',        label: 'All Agents'    },
          { id: 'consulting', label: 'Consulting'     },
          { id: 'pe',         label: 'PE / Diligence' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setFilter(id as typeof filter)}
            className={`ax-tab${filter === id ? ' is-active' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--ink-3)' }} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm p-4 rounded-xl"
          style={{ background: 'var(--bad-soft)', color: 'var(--bad)', border: '1px solid var(--bad-b)' }}>
          <AlertTriangle size={14} /> Failed to load agents
        </div>
      )}

      {/* Built-in agents */}
      {builtIn.length > 0 && (
        <div className="mb-6">
          <p className="text-[11px] font-medium uppercase tracking-widest mb-3"
            style={{ color: 'var(--ink-4)' }}>
            Built-in
          </p>
          <div className="space-y-2">
            {builtIn.map((agent) => (
              <AgentCard
                key={agent.key}
                agent={agent}
                onEdit={setEditingAgent}
                onDelete={(key) => deleteMutation.mutate(key)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Custom agents */}
      {custom.length > 0 && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest mb-3"
            style={{ color: 'var(--ink-4)' }}>
            Custom
          </p>
          <div className="space-y-2">
            {custom.map((agent) => (
              <AgentCard
                key={agent.key}
                agent={agent}
                onEdit={setEditingAgent}
                onDelete={(key) => deleteMutation.mutate(key)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty custom state */}
      {!isLoading && custom.length === 0 && (
        <div className="mt-4 flex flex-col items-center gap-3 py-12 rounded-xl"
          style={{ border: '1px dashed var(--line)' }}>
          <Bot size={28} style={{ color: 'var(--ink-4)' }} />
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>No custom agents yet</p>
          <button
            onClick={() => setShowCreate(true)}
            className="ax-btn"
          >
            <Wand2 size={12} /> Create one with AI
          </button>
        </div>
      )}

      {/* Modals */}
      {editingAgent && (
        <EditPanel
          agent={editingAgent}
          onClose={() => setEditingAgent(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['agents'] })
            setEditingAgent(null)
          }}
        />
      )}

      {showCreate && (
        <CreateAgentPanel
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['agents'] })
            setShowCreate(false)
          }}
        />
      )}
    </div>
    </div>
  )
}
