'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { sessions, clients, type SessionListItem, type Client } from '@/lib/api'
import { MessageSquare, Plus, Search, X, Building2, ChevronRight, Mic } from 'lucide-react'

function timeAgo(date: string): string {
  const diffMs = Date.now() - new Date(date).getTime()
  const secs   = Math.floor(diffMs / 1000)
  const mins   = Math.floor(secs  / 60)
  const hours  = Math.floor(mins  / 60)
  const days   = Math.floor(hours / 24)
  if (days  > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (mins  > 0) return `${mins}m ago`
  return 'just now'
}

function NewSessionModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [title,    setTitle]    = useState('')
  const [clientId, setClientId] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const { data: clientsData } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => clients.list(),
  })
  const allClients = clientsData?.clients ?? []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const trimmed = title.trim()
      const session = await sessions.create({
        ...(trimmed ? { title: trimmed } : {}),
        ...(clientId ? { clientId } : {}),
      })
      onCreated(session.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
    >
      <div className="ax-card" style={{ width: '100%', maxWidth: 420, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>New Session</h2>
          <button onClick={onClose} className="ax-icon-btn" aria-label="Close">
            <X size={14} />
          </button>
        </div>

        {error && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--bad-soft)', border: '1px solid var(--bad-b)', borderRadius: 8 }}>
            <p style={{ fontSize: 13, color: 'var(--bad)', margin: 0 }}>{error}</p>
          </div>
        )}

        <form onSubmit={(e) => { void handleSubmit(e) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="ax-kpi-lbl" style={{ display: 'block', marginBottom: 6 }}>Title (optional)</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Initial intake call" className="input w-full" />
            </div>
            <div>
              <label className="ax-kpi-lbl" style={{ display: 'block', marginBottom: 6 }}>Client (optional)</label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="input w-full">
                <option value="">No client</option>
                {allClients.map((c: Client) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
              <button type="button" onClick={onClose} className="ax-btn" style={{ flex: 1, justifyContent: 'center' }}>
                Cancel
              </button>
              <button type="submit" disabled={loading} className="ax-btn is-primary"
                style={{ flex: 1, justifyContent: 'center', opacity: loading ? 0.4 : 1 }}>
                {loading ? 'Creating…' : 'Start Session'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function SessionsPage() {
  const router  = useRouter()
  const qc      = useQueryClient()
  const [search,  setSearch]  = useState('')
  const [showNew, setShowNew] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['sessions-list'],
    queryFn: () => sessions.list(),
    refetchInterval: 30_000,
  })

  const allSessions = data?.sessions ?? []
  const filtered    = search.trim()
    ? allSessions.filter((s) =>
        (s.title ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (s.client?.name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : allSessions

  const handleCreated = async (id: string) => {
    await qc.invalidateQueries({ queryKey: ['sessions-list'] })
    setShowNew(false)
    router.push(`/session/${id}`)
  }

  return (
    <>
      {showNew && (
        <NewSessionModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => { void handleCreated(id) }}
        />
      )}

      <div className="h-full overflow-y-auto" style={{ background: 'var(--bg)' }}>
        <div className="ax-page animate-fade-up">

          {/* ── Page header ─── */}
          <div className="ax-page-head">
            <div className="ax-page-head-text">
              <div className="ax-eyebrow">Workspace</div>
              <h1 className="ax-h1">Sessions</h1>
              <p className="ax-sub">{allSessions.length} session{allSessions.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="ax-page-actions">
              {allSessions.length > 0 && (
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={12} style={{ position: 'absolute', left: 10, color: 'var(--ink-4)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search sessions…"
                    className="input"
                    style={{ paddingLeft: 28, height: 32, fontSize: 12.5, width: 180 }}
                  />
                </div>
              )}
              <Link href="/session/new?live=true&automic=true" className="ax-btn">
                <Mic size={13} />
                Talk to Aria
              </Link>
              <button onClick={() => setShowNew(true)} className="ax-btn is-primary">
                <Plus size={13} />
                New Session
              </button>
            </div>
          </div>

          {/* ── Session list ─── */}
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton" style={{ height: 56, borderRadius: 10 }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="ax-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <MessageSquare size={28} style={{ color: 'var(--ink-4)', margin: '0 auto 12px' }} />
              <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', marginBottom: 4 }}>
                {search ? 'No sessions match your search' : 'No sessions yet'}
              </p>
              <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 16 }}>
                {search ? 'Try a different search term' : 'Start a conversation with Aria to get going'}
              </p>
              {!search && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                  <button onClick={() => setShowNew(true)} className="ax-btn is-primary">
                    <Plus size={13} /> New Session
                  </button>
                  <Link href="/session/new?live=true&automic=true" className="ax-btn">
                    <Mic size={13} /> Talk to Aria
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="ax-card" style={{ padding: 0 }}>
              {filtered.map((s: SessionListItem, i) => (
                <Link
                  key={s.id}
                  href={`/session/${s.id}`}
                  className="ax-row is-clickable"
                  style={{ borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}
                >
                  <div className="ax-row-icon">
                    <MessageSquare size={13} />
                  </div>
                  <div className="ax-row-body">
                    <div className="ax-row-title">{s.title ?? 'Untitled session'}</div>
                    <div className="ax-row-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {s.client && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Building2 size={10} />
                          {s.client.name}
                        </span>
                      )}
                      <span>{s.messageCount} msg{s.messageCount !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="ax-row-time">{timeAgo(s.updatedAt ?? s.createdAt)}</div>
                  <ChevronRight size={13} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
                </Link>
              ))}
            </div>
          )}

        </div>
      </div>
    </>
  )
}
