'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'
import { deals, clients, type Deal, type DealStage, type Priority, type Client } from '@/lib/api'
import {
  Plus, X, MessageSquare, FileText, AlertTriangle,
  Building2, Search, Filter,
} from 'lucide-react'

// ─── Stage config ─────────────────────────────────────────────

const STAGES: { id: DealStage; label: string; dot: string }[] = [
  { id: 'SOURCING',    label: 'Sourcing',    dot: '#94a3b8' },
  { id: 'SCREENING',   label: 'Screening',   dot: '#60a5fa' },
  { id: 'DILIGENCE',   label: 'Diligence',   dot: '#fbbf24' },
  { id: 'IC_MEMO',     label: 'IC Memo',     dot: '#a78bfa' },
  { id: 'ON_HOLD',     label: 'On Hold',     dot: '#f59e0b' },
  { id: 'CLOSED_WON',  label: 'Closed Won',  dot: '#34d399' },
  { id: 'CLOSED_LOST', label: 'Closed Lost', dot: '#f87171' },
]

// ─── New Deal Modal ────────────────────────────────────────────

function NewDealModal({
  initialStage,
  onClose,
  onCreated,
}: {
  initialStage: DealStage
  onClose: () => void
  onCreated: (deal: Deal) => void
}) {
  const [name,     setName]     = useState('')
  const [clientId, setClientId] = useState('')
  const [sector,   setSector]   = useState('')
  const [dealSize, setDealSize] = useState('')
  const [priority, setPriority] = useState<Priority>('MEDIUM')
  const [stage,    setStage]    = useState<DealStage>(initialStage)
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
      const deal = await deals.create({
        name, clientId, priority, stage,
        ...(sector   ? { sector }   : {}),
        ...(dealSize ? { dealSize } : {}),
      })
      onCreated(deal)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create deal')
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
          <h2 style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>New Deal</h2>
          <button
            onClick={onClose}
            className="ax-icon-btn"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {error && (
          <div style={{
            marginBottom: 16, padding: '10px 14px',
            background: 'var(--bad-soft)', border: '1px solid var(--bad-b)',
            borderRadius: 8,
          }}>
            <p style={{ fontSize: 13, color: 'var(--bad)', margin: 0 }}>{error}</p>
          </div>
        )}

        <form onSubmit={(e) => { void handleSubmit(e) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="ax-kpi-lbl" style={{ display: 'block', marginBottom: 6 }}>Deal Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Project Falcon"
                required
                className="input w-full"
              />
            </div>

            <div>
              <label className="ax-kpi-lbl" style={{ display: 'block', marginBottom: 6 }}>Company (Client)</label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
                className="input w-full"
              >
                <option value="">Select a client…</option>
                {allClients.map((c: Client) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="ax-kpi-lbl" style={{ display: 'block', marginBottom: 6 }}>Stage</label>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value as DealStage)}
                  className="input w-full"
                >
                  {STAGES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="ax-kpi-lbl" style={{ display: 'block', marginBottom: 6 }}>Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  className="input w-full"
                >
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="ax-kpi-lbl" style={{ display: 'block', marginBottom: 6 }}>Sector</label>
                <input
                  type="text"
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  placeholder="e.g. SaaS"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="ax-kpi-lbl" style={{ display: 'block', marginBottom: 6 }}>Deal Size</label>
                <input
                  type="text"
                  value={dealSize}
                  onChange={(e) => setDealSize(e.target.value)}
                  placeholder="e.g. $50M–$100M"
                  className="input w-full"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
              <button type="button" onClick={onClose} className="ax-btn" style={{ flex: 1, justifyContent: 'center' }}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !name.trim() || !clientId}
                className="ax-btn is-primary"
                style={{ flex: 1, justifyContent: 'center', opacity: (loading || !name.trim() || !clientId) ? 0.4 : 1 }}
              >
                {loading ? 'Creating…' : 'Create Deal'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Deal Card ────────────────────────────────────────────────

function DealCard({ deal, isDragging = false }: { deal: Deal; isDragging?: boolean }) {
  const priClass = deal.priority === 'HIGH' ? 'pri-high' : deal.priority === 'MEDIUM' ? 'pri-med' : 'pri-low'
  return (
    <div className={`ax-deal ${priClass}${isDragging ? ' is-dragging' : ''}`}>
      <div className="ax-deal-name">{deal.client.name}</div>
      <div className="ax-deal-sub">{deal.name}</div>

      {(deal.sector ?? deal.dealSize) && (
        <div className="ax-deal-tags">
          {deal.sector && (
            <span className="ax-chip">{deal.sector}</span>
          )}
          {deal.dealSize && (
            <span className="ax-chip" style={{ background: 'var(--surface-alt)', color: 'var(--ink-3)', borderColor: 'var(--line)' }}>
              {deal.dealSize}
            </span>
          )}
        </div>
      )}

      <div className="ax-deal-foot">
        <span className="ic-inline">
          <MessageSquare size={10} />
          {deal.sessionCount ?? 0}
        </span>
        <span className="ic-inline">
          <FileText size={10} />
          {deal.documentCount ?? 0}
        </span>
        {(deal.conflictCount ?? 0) > 0 && (
          <span className="ic-inline" style={{ color: 'var(--bad)', marginLeft: 'auto' }}>
            <AlertTriangle size={10} />
            {deal.conflictCount}
          </span>
        )}
        {deal.dealSize && (
          <div className="ax-deal-amt">{deal.dealSize}</div>
        )}
      </div>
    </div>
  )
}

// ─── Draggable Card ───────────────────────────────────────────

function DraggableCard({ deal }: { deal: Deal }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
    data: { deal },
  })

  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 100, position: 'relative' }
    : {}

  return (
    <Link href={`/deals/${deal.id}`} onClick={(e) => { if (isDragging) e.preventDefault() }} style={{ display: 'block' }}>
      <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
        <DealCard deal={deal} isDragging={isDragging} />
      </div>
    </Link>
  )
}

// ─── Droppable Column ─────────────────────────────────────────

function Column({
  stage,
  dealsInColumn,
  onAddDeal,
}: {
  stage: typeof STAGES[number]
  dealsInColumn: Deal[]
  onAddDeal: (stageId: DealStage) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })

  return (
    <div ref={setNodeRef} className={`ax-col${isOver ? ' is-drop-target' : ''}`}>
      {/* Column header */}
      <div className="ax-col-hd">
        <span className="ax-stage-dot" style={{ background: stage.dot }} />
        <span className="ax-col-name">{stage.label}</span>
        <span className="ax-col-count">{dealsInColumn.length}</span>
        <button
          className="ax-col-add"
          onClick={() => onAddDeal(stage.id)}
          title={`Add deal to ${stage.label}`}
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Cards drop zone */}
      <div className="ax-col-bd" style={{ minHeight: 80 }}>
        {dealsInColumn.map((deal) => (
          <DraggableCard key={deal.id} deal={deal} />
        ))}
        {dealsInColumn.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--ink-4)', fontSize: 12 }}>
            Drop here
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Pipeline Page ────────────────────────────────────────────

export default function PipelinePage() {
  const router      = useRouter()
  const qc          = useQueryClient()
  const [search,    setSearch]    = useState('')
  const [showNew,   setShowNew]   = useState(false)
  const [newStage,  setNewStage]  = useState<DealStage>('SOURCING')
  const [filterPriority, setFilterPriority] = useState<Priority | ''>('')
  const [filterSector,   setFilterSector]   = useState('')
  const [activeId,  setActiveId]  = useState<string | null>(null)

  const activeDealRef = useRef<Deal | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['deals-pipeline'],
    queryFn: () => deals.list(),
  })

  const allDeals = (data as { deals?: Deal[] } | undefined)?.deals ?? []

  const filtered = allDeals.filter((d) => {
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) &&
        !d.client.name.toLowerCase().includes(search.toLowerCase())) return false
    if (filterPriority && d.priority !== filterPriority) return false
    if (filterSector && !(d.sector ?? '').toLowerCase().includes(filterSector.toLowerCase())) return false
    return true
  })

  const byStage = (stageId: DealStage) => filtered.filter((d) => d.stage === stageId)
  const activeCount = allDeals.filter((d) => d.stage !== 'CLOSED_WON' && d.stage !== 'CLOSED_LOST').length

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
    activeDealRef.current = (event.active.data.current as { deal: Deal }).deal
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null)
    activeDealRef.current = null
    const { active, over } = event
    if (!over || !active) return

    const dealId      = active.id as string
    const newStageDrop = over.id as DealStage
    const deal        = allDeals.find((d) => d.id === dealId)
    if (!deal || deal.stage === newStageDrop) return

    // Optimistic update
    qc.setQueryData<{ deals: Deal[] }>(['deals-pipeline'], (old) => {
      if (!old) return old
      return {
        deals: old.deals.map((d) =>
          d.id === dealId ? { ...d, stage: newStageDrop } : d
        ),
      }
    })

    try {
      await deals.updateStage(dealId, newStageDrop)
    } catch {
      await qc.invalidateQueries({ queryKey: ['deals-pipeline'] })
    }
  }

  const handleCreated = async (deal: Deal) => {
    await qc.invalidateQueries({ queryKey: ['deals-pipeline'] })
    setShowNew(false)
    router.push(`/deals/${deal.id}`)
  }

  const sectors = [...new Set(allDeals.map((d) => d.sector).filter(Boolean))] as string[]

  return (
    <>
      {showNew && (
        <NewDealModal
          initialStage={newStage}
          onClose={() => setShowNew(false)}
          onCreated={(d) => { void handleCreated(d) }}
        />
      )}

      <div className="h-full overflow-y-auto" style={{ background: 'var(--bg)' }}>
        <div className="ax-page animate-fade-up" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* ── Page header ─── */}
          <div className="ax-page-head">
            <div className="ax-page-head-text">
              <div className="ax-eyebrow">Deal Management</div>
              <h1 className="ax-h1">Pipeline</h1>
              <p className="ax-sub">
                {activeCount} active deal{activeCount !== 1 ? 's' : ''} in progress
              </p>
            </div>
            <div className="ax-page-actions">
              {/* Filters */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={12} style={{ position: 'absolute', left: 10, color: 'var(--ink-4)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search deals…"
                  className="input"
                  style={{ paddingLeft: 28, height: 32, fontSize: 12.5, width: 160 }}
                />
              </div>

              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Filter size={12} style={{ position: 'absolute', left: 10, color: 'var(--ink-4)', pointerEvents: 'none' }} />
                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value as Priority | '')}
                  className="input"
                  style={{ paddingLeft: 28, height: 32, fontSize: 12.5 }}
                >
                  <option value="">All priorities</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>

              {sectors.length > 0 && (
                <select
                  value={filterSector}
                  onChange={(e) => setFilterSector(e.target.value)}
                  className="input"
                  style={{ height: 32, fontSize: 12.5 }}
                >
                  <option value="">All sectors</option>
                  {sectors.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}

              <button
                onClick={() => { setNewStage('SOURCING'); setShowNew(true) }}
                className="ax-btn is-primary"
              >
                <Plus size={13} />
                New Deal
              </button>
            </div>
          </div>

          {/* ── Kanban board ─── */}
          {isLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(220px, 1fr))', gap: 12, padding: '0 20px 20px', overflowX: 'auto' }}>
              {STAGES.map((s) => (
                <div key={s.id} className="skeleton" style={{ height: 280, borderRadius: 10 }} />
              ))}
            </div>
          ) : (
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={(e) => { void handleDragEnd(e) }}>
              <div className="ax-board-wrap" style={{ flex: 1, overflowY: 'visible' }}>
                <div className="ax-board ax-board-6">
                  {STAGES.map((stage) => (
                    <Column
                      key={stage.id}
                      stage={stage}
                      dealsInColumn={byStage(stage.id)}
                      onAddDeal={(id) => { setNewStage(id); setShowNew(true) }}
                    />
                  ))}
                </div>
              </div>

              <DragOverlay>
                {activeId && activeDealRef.current ? (
                  <DealCard deal={activeDealRef.current} isDragging />
                ) : null}
              </DragOverlay>
            </DndContext>
          )}

          {/* ── Empty state ─── */}
          {!isLoading && allDeals.length === 0 && (
            <div className="ax-card" style={{ textAlign: 'center', padding: '48px 24px', margin: '0 20px' }}>
              <Building2 size={28} style={{ color: 'var(--ink-4)', margin: '0 auto 12px' }} />
              <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', marginBottom: 4 }}>No deals yet</p>
              <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 16 }}>
                Add your first deal to start tracking the pipeline
              </p>
              <button
                onClick={() => { setNewStage('SOURCING'); setShowNew(true) }}
                className="ax-btn is-primary"
                style={{ margin: '0 auto' }}
              >
                <Plus size={13} />
                Add Deal
              </button>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
