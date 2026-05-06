'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { clients, type Client } from '@/lib/api'
import { Building2, Plus, Users, Globe, ChevronRight, Search, X } from 'lucide-react'

function NewClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Client) => void }) {
  const [name,     setName]     = useState('')
  const [industry, setIndustry] = useState('')
  const [size,     setSize]     = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const client = await clients.create({ name, industry, companySize: size })
      onCreated(client)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create client')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
         style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
      <div className="ax-card" style={{ width: '100%', maxWidth: 420, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>New Client</h2>
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
              <label className="ax-kpi-lbl" style={{ display: 'block', marginBottom: 6 }}>Company Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Corp" required className="input w-full" />
            </div>
            <div>
              <label className="ax-kpi-lbl" style={{ display: 'block', marginBottom: 6 }}>Industry</label>
              <input type="text" value={industry} onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. SaaS, Logistics" className="input w-full" />
            </div>
            <div>
              <label className="ax-kpi-lbl" style={{ display: 'block', marginBottom: 6 }}>Company Size (employees)</label>
              <input type="number" value={size} onChange={(e) => setSize(e.target.value)}
                placeholder="e.g. 500" min="1" className="input w-full" />
            </div>
            <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
              <button type="button" onClick={onClose} className="ax-btn" style={{ flex: 1, justifyContent: 'center' }}>
                Cancel
              </button>
              <button type="submit" disabled={loading || !name.trim()} className="ax-btn is-primary"
                style={{ flex: 1, justifyContent: 'center', opacity: (loading || !name.trim()) ? 0.4 : 1 }}>
                {loading ? 'Creating…' : 'Create Client'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ClientsPage() {
  const qc = useQueryClient()
  const [search,  setSearch]  = useState('')
  const [showNew, setShowNew] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => clients.list(),
  })

  const allClients = data?.clients ?? []
  const filtered   = search.trim()
    ? allClients.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.industry ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : allClients

  const handleCreated = async (newClient: Client) => {
    await qc.invalidateQueries({ queryKey: ['clients-list'] })
    setShowNew(false)
    window.location.href = `/clients/${newClient.id}`
  }

  return (
    <>
      {showNew && (
        <NewClientModal
          onClose={() => setShowNew(false)}
          onCreated={(c) => { void handleCreated(c) }}
        />
      )}

      <div className="h-full overflow-y-auto" style={{ background: 'var(--bg)' }}>
        <div className="ax-page animate-fade-up">

          {/* ── Page header ─── */}
          <div className="ax-page-head">
            <div className="ax-page-head-text">
              <div className="ax-eyebrow">Firm</div>
              <h1 className="ax-h1">Clients</h1>
              <p className="ax-sub">{allClients.length} client{allClients.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="ax-page-actions">
              {allClients.length > 0 && (
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={12} style={{ position: 'absolute', left: 10, color: 'var(--ink-4)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search clients…"
                    className="input"
                    style={{ paddingLeft: 28, height: 32, fontSize: 12.5, width: 180 }}
                  />
                </div>
              )}
              <button onClick={() => setShowNew(true)} className="ax-btn is-primary">
                <Plus size={13} />
                New Client
              </button>
            </div>
          </div>

          {/* ── Client list ─── */}
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton" style={{ height: 64, borderRadius: 10 }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="ax-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <Building2 size={28} style={{ color: 'var(--ink-4)', margin: '0 auto 12px' }} />
              <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', marginBottom: 4 }}>
                {search ? 'No clients match your search' : 'No clients yet'}
              </p>
              <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 16 }}>
                {search ? 'Try a different search term' : 'Add your first client to get started'}
              </p>
              {!search && (
                <button onClick={() => setShowNew(true)} className="ax-btn is-primary" style={{ margin: '0 auto' }}>
                  <Plus size={13} />
                  Add Client
                </button>
              )}
            </div>
          ) : (
            <div className="ax-card" style={{ padding: 0 }}>
              {filtered.map((client, i) => (
                <Link
                  key={client.id}
                  href={`/clients/${client.id}`}
                  className="ax-row is-clickable"
                  style={{ borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}
                >
                  <div className="ax-avatar" style={{ borderRadius: 9, width: 36, height: 36, fontSize: 13, flexShrink: 0 }}>
                    {client.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="ax-row-body">
                    <div className="ax-row-title">{client.name}</div>
                    <div className="ax-row-sub" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {client.industry && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Building2 size={10} />
                          {client.industry}
                        </span>
                      )}
                      {client.companySize && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Users size={10} />
                          {client.companySize.toLocaleString()} employees
                        </span>
                      )}
                      {client.website && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Globe size={10} />
                          {client.website.replace(/^https?:\/\//, '')}
                        </span>
                      )}
                    </div>
                  </div>
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
