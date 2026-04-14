'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import * as d3 from 'd3'
import { knowledge, type EntityDetailsResponse } from '@/lib/api'
import { X, ZoomIn, ZoomOut, Maximize2, RefreshCw, FileText, MessageCircle } from 'lucide-react'
import { useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawNode {
  id: string
  label: string   // Neo4j label = entity type
  name?: string   // Actual entity name
  [key: string]: unknown
}

interface RawRelationship {
  fromId?: string
  toId?: string
  startNodeId?: string
  endNodeId?: string
  source?: string
  target?: string
  type?: string
}

// d3 simulation node — extends RawNode with simulation coords
interface SimNode extends d3.SimulationNodeDatum {
  id: string
  label: string
  name?: string
  fx?: number | null
  fy?: number | null
  [key: string]: unknown
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string
  relType: string
}

function isRawNode(v: unknown): v is RawNode {
  return typeof v === 'object' && v !== null && 'id' in v && 'label' in v
}

// ─── Colour by label ──────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  Person:     '#C8A96E',
  Client:     '#C8A96E',
  Competitor: '#60A5FA',
  Technology: '#A78BFA',
  Process:    '#F87171',
  Concept:    '#FBBF24',
  Industry:   '#34D399',
  Document:   '#6B7280',
  Meeting:    '#4ADE80',
  Decision:   '#FB923C',
}
const DEFAULT_COLOR = '#9898A8'

function nodeColor(label: string | undefined) {
  return label ? (TYPE_COLORS[label] ?? DEFAULT_COLOR) : DEFAULT_COLOR
}

const NODE_RADIUS = 18

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByType<T extends { type: string }>(items: T[]): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    ;(acc[item.type] ??= []).push(item)
    return acc
  }, {})
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface KnowledgeGraphProps {
  clientId: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function KnowledgeGraph({ clientId }: KnowledgeGraphProps) {
  const router      = useRouter()
  const svgRef      = useRef<SVGSVGElement>(null)
  const gRef        = useRef<SVGGElement>(null)           // zoom target <g>
  const zoomRef     = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const simRef      = useRef<d3.Simulation<SimNode, SimLink> | null>(null)
  const nodesRef    = useRef<Map<string, SimNode>>(new Map())

  const [selected, setSelected] = useState<RawNode | null>(null)

  // Details for the selected entity (relationships + source documents)
  const { data: details, isLoading: detailsLoading } = useQuery<EntityDetailsResponse>({
    queryKey: ['entity-details', selected?.id],
    queryFn:  () => knowledge.getEntityDetails(selected!.id),
    enabled:  !!selected?.id,
    staleTime: 30_000,
  })

  // Pan to a node and select it (used by Connected Entities list clicks)
  const selectNodeById = useCallback((nodeId: string) => {
    const node = nodesRef.current.get(nodeId)
    if (!node) return
    setSelected(node as unknown as RawNode)
    if (!svgRef.current || !zoomRef.current || node.x == null || node.y == null) return
    const svgEl = svgRef.current
    const svgW  = svgEl.clientWidth  || 800
    const svgH  = svgEl.clientHeight || 600
    const k     = d3.zoomTransform(svgEl).k
    zoomRef.current.transform(
      d3.select(svgEl).transition().duration(400),
      d3.zoomIdentity.translate(svgW / 2 - node.x * k, svgH / 2 - node.y * k).scale(k),
    )
  }, [])

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['knowledge-graph', clientId],
    queryFn: () => knowledge.getGraph(clientId),
    retry: 1,
  })

  // ─── Build / rebuild simulation whenever data changes ──────────────────────

  useEffect(() => {
    if (!data || !svgRef.current || !gRef.current) return

    const svgEl  = svgRef.current
    const gEl    = gRef.current
    const width  = svgEl.clientWidth  || 800
    const height = svgEl.clientHeight || 600

    // Parse nodes
    const rawNodes  = (data.nodes ?? []).filter(isRawNode)
    const rawEdges  = (data.relationships ?? []) as RawRelationship[]

    const nodes: SimNode[] = rawNodes.map((n) => ({ ...n }))
    const nodeById = new Map(nodes.map((n) => [n.id, n]))
    nodesRef.current = nodeById

    const links: SimLink[] = rawEdges
      .map((r, i) => {
        const srcId = r.fromId ?? r.startNodeId ?? r.source ?? ''
        const tgtId = r.toId   ?? r.endNodeId   ?? r.target ?? ''
        return {
          id:      String(i),
          source:  srcId,
          target:  tgtId,
          relType: r.type ?? '',
        }
      })
      .filter((l) => nodeById.has(l.source as string) && nodeById.has(l.target as string))

    // Clear previous render
    d3.select(gEl).selectAll('*').remove()

    // Stop any running sim
    simRef.current?.stop()

    // ── Simulation ──────────────────────────────────────────────────────────
    const sim = d3.forceSimulation<SimNode>(nodes)
      .force('link',   d3.forceLink<SimNode, SimLink>(links)
                          .id((d) => d.id)
                          .distance(110)
                          .strength(0.4))
      .force('charge', d3.forceManyBody().strength(-350))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<SimNode>(NODE_RADIUS + 8))

    simRef.current = sim

    const g = d3.select(gEl)

    // ── Edge layer ──────────────────────────────────────────────────────────
    const linkGroup = g.append('g').attr('class', 'links')

    const linkEls = linkGroup.selectAll<SVGGElement, SimLink>('g')
      .data(links)
      .join('g')

    linkEls.append('line')
      .attr('stroke', 'var(--border, #333)')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.55)

    linkEls.append('text')
      .attr('class', 'edge-label')
      .text((d) => d.relType)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-muted, #666)')
      .attr('font-size', 8)
      .attr('pointer-events', 'none')
      .attr('user-select', 'none')

    // ── Node layer ──────────────────────────────────────────────────────────
    const nodeGroup = g.append('g').attr('class', 'nodes')

    const nodeEls = nodeGroup.selectAll<SVGGElement, SimNode>('g')
      .data(nodes, (d) => d.id)
      .join('g')
      .attr('cursor', 'grab')
      .on('click', (_event, d) => {
        setSelected((prev) => prev?.id === d.id ? null : (d as unknown as RawNode))
      })

    nodeEls.append('circle')
      .attr('r', NODE_RADIUS)
      .attr('fill',         (d) => nodeColor(d.label as string))
      .attr('fill-opacity', 0.18)
      .attr('stroke',       (d) => nodeColor(d.label as string))
      .attr('stroke-width', 1.8)

    // Entity name inside the circle
    nodeEls.append('text')
      .attr('class', 'node-name')
      .text((d) => {
        const name = (d.name as string | undefined) ?? (d.label as string)
        return name.length > 14 ? name.slice(0, 13) + '…' : name
      })
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill',        (d) => nodeColor(d.label as string))
      .attr('font-size', 9)
      .attr('font-weight', 500)
      .attr('pointer-events', 'none')
      .attr('user-select', 'none')

    // Entity type below the circle
    nodeEls.append('text')
      .attr('class', 'node-type')
      .text((d) => d.label as string)
      .attr('text-anchor', 'middle')
      .attr('y', NODE_RADIUS + 11)
      .attr('fill', 'var(--text-muted, #888)')
      .attr('font-size', 7)
      .attr('pointer-events', 'none')
      .attr('user-select', 'none')

    // ── Drag behaviour ──────────────────────────────────────────────────────
    const drag = d3.drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        event.sourceEvent.stopPropagation()
        if (!event.active) sim.alphaTarget(0.3).restart()
        d.fx = d.x ?? null
        d.fy = d.y ?? null
        d3.select(event.currentTarget).attr('cursor', 'grabbing')
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) sim.alphaTarget(0)
        // Keep node pinned where the user dropped it
        d3.select(event.currentTarget).attr('cursor', 'grab')
      })

    nodeEls.call(drag)

    // ── Tick ────────────────────────────────────────────────────────────────
    sim.on('tick', () => {
      linkEls.select<SVGLineElement>('line')
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0)

      linkEls.select<SVGTextElement>('text')
        .attr('x', (d) => (((d.source as SimNode).x ?? 0) + ((d.target as SimNode).x ?? 0)) / 2)
        .attr('y', (d) => (((d.source as SimNode).y ?? 0) + ((d.target as SimNode).y ?? 0)) / 2 - 4)

      nodeEls.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    // ── Zoom behaviour ──────────────────────────────────────────────────────
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.08, 8])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        const { transform: t } = event
        d3.select(gEl).attr('transform', t.toString())

        // Counter-scale text so labels stay constant screen size regardless of zoom
        const k = t.k
        d3.select(gEl).selectAll<SVGTextElement, unknown>('.node-name')
          .attr('font-size', 9 / k)
        d3.select(gEl).selectAll<SVGTextElement, unknown>('.node-type')
          .attr('font-size', 7 / k)
          .attr('y', (NODE_RADIUS + 11) / k)
        d3.select(gEl).selectAll<SVGTextElement, unknown>('.edge-label')
          .attr('font-size', 8 / k)
      })

    zoomRef.current = zoom
    d3.select(svgEl).call(zoom)

    // Prevent zoom from firing on node drag
    d3.select(svgEl).on('dblclick.zoom', null)

    return () => {
      sim.stop()
      d3.select(svgEl).on('.zoom', null)
    }
  }, [data])

  // ─── Zoom button handlers ─────────────────────────────────────────────────

  const zoomIn = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return
    zoomRef.current.scaleBy(
      d3.select(svgRef.current).transition().duration(300),
      1.5,
    )
  }, [])

  const zoomOut = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return
    zoomRef.current.scaleBy(
      d3.select(svgRef.current).transition().duration(300),
      1 / 1.5,
    )
  }, [])

  const fitView = useCallback(() => {
    if (!svgRef.current || !zoomRef.current || !gRef.current) return
    const svgEl = svgRef.current
    const gEl   = gRef.current
    const svgW  = svgEl.clientWidth  || 800
    const svgH  = svgEl.clientHeight || 600
    const bbox  = gEl.getBBox()
    if (!bbox.width || !bbox.height) return
    const scale = Math.min(0.85 * svgW / bbox.width, 0.85 * svgH / bbox.height, 2)
    const tx    = (svgW - scale * (2 * bbox.x + bbox.width))  / 2
    const ty    = (svgH - scale * (2 * bbox.y + bbox.height)) / 2
    zoomRef.current.transform(
      d3.select(svgEl).transition().duration(500),
      d3.zoomIdentity.translate(tx, ty).scale(scale),
    )
  }, [])

  // ─── Render ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
        Loading knowledge graph…
      </div>
    )
  }

  if (!data || !data.nodes?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-2">
        <p className="text-sm text-[var(--text-secondary)]">No entities found</p>
        <p className="text-xs text-[var(--text-muted)]">Ingest documents to populate the knowledge graph</p>
      </div>
    )
  }

  const activeLegendTypes = Array.from(new Set((data.nodes as RawNode[]).map((n) => n.label)))

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-[var(--bg-primary)] rounded-xl border border-[var(--border)]"
      onWheel={(e) => e.stopPropagation()}
    >

      {/* Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex gap-1">
        <button onClick={zoomIn}
          className="p-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          title="Zoom in">
          <ZoomIn size={14} />
        </button>
        <button onClick={zoomOut}
          className="p-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          title="Zoom out">
          <ZoomOut size={14} />
        </button>
        <button onClick={fitView}
          className="p-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          title="Fit view">
          <Maximize2 size={14} />
        </button>
        <button onClick={() => { void refetch() }}
          className="p-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Node count */}
      <div className="absolute top-3 left-3 z-10 text-xs text-[var(--text-muted)]">
        {data.nodes.length} entities · {data.relationships?.length ?? 0} relationships
      </div>

      {/* SVG — d3 owns all children via gRef */}
      <svg ref={svgRef} width="100%" height="100%" style={{ touchAction: 'none', display: 'block' }}>
        <g ref={gRef} />
      </svg>

      {/* Selected entity panel */}
      {selected && (
        <div className="absolute top-0 right-0 h-full w-72 bg-[var(--bg-secondary)] border-l border-[var(--border)] p-4 overflow-y-auto z-20 flex flex-col gap-0">

          {/* ── Header ── */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-serif text-sm text-[var(--gold)] truncate pr-2">
              {(selected.name as string | undefined) ?? selected.label}
            </h3>
            <button onClick={() => setSelected(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0">
              <X size={14} />
            </button>
          </div>

          {/* ── Type badge + properties ── */}
          <div className="mb-3">
            <span className="badge badge-gold">{selected.label}</span>
          </div>
          {Object.entries(selected)
            .filter(([k]) => !['id','label','name','x','y','vx','vy','fx','fy','index',
              'sourceDocIds','createdAt','updatedAt','embeddingId','clientId'].includes(k))
            .filter(([, v]) => v !== null && v !== undefined && v !== '')
            .map(([k, v]) => (
              <div key={k} className="text-xs mt-1">
                <span className="text-[var(--text-secondary)]">{k}: </span>
                <span className="text-[var(--text-primary)]">{String(v)}</span>
              </div>
            ))
          }

          {/* ── Details (loaded via API) ── */}
          <div className="mt-4">
            <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-2">
              Connected Entities
            </p>
            {detailsLoading ? (
              <p className="text-xs text-[var(--text-muted)]">Loading…</p>
            ) : details && details.relationships.length > 0 ? (
              Object.entries(groupByType(details.relationships)).map(([type, rels]) => (
                <div key={type} className="mb-3">
                  <p className="text-[10px] text-[var(--text-muted)] mb-1">{type} ({rels.length})</p>
                  {rels.map((rel) => (
                    <button
                      key={`${rel.type}-${rel.other.id}-${rel.direction}`}
                      onClick={() => selectNodeById(rel.other.id)}
                      className="flex items-center gap-1.5 w-full text-left text-xs py-1 px-2 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                      <span
                        className="shrink-0 w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: nodeColor(rel.other.label) }}
                      />
                      <span className="truncate text-[var(--text-primary)]">{rel.other.name}</span>
                      <span className="ml-auto text-[var(--text-muted)] shrink-0 text-[10px]">
                        {rel.direction === 'outbound' ? '→' : '←'}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            ) : (
              <p className="text-xs text-[var(--text-muted)]">No connected entities</p>
            )}
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-2">
              Source Documents
            </p>
            {detailsLoading ? (
              <p className="text-xs text-[var(--text-muted)]">Loading…</p>
            ) : details && details.documents.length > 0 ? (
              details.documents.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => router.push(`/knowledge?tab=documents&doc=${doc.id}`)}
                  className="flex items-center gap-1.5 text-xs py-1 px-2 rounded hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-primary)] w-full text-left"
                >
                  <FileText size={11} className="text-[var(--text-muted)] shrink-0" />
                  <span className="truncate">{doc.title}</span>
                </button>
              ))
            ) : (
              <p className="text-xs text-[var(--text-muted)]">No source documents linked yet</p>
            )}
          </div>

          {/* ── Ask Aria ── */}
          <div className="mt-auto pt-4 border-t border-[var(--border)]">
            <button
              onClick={() => {
                const name = (selected.name as string | undefined) ?? selected.label
                const prompt = `Tell me about ${name} and its connections.`
                router.push(`/session/new?prompt=${encodeURIComponent(prompt)}`)
              }}
              className="flex items-center justify-center gap-1.5 w-full py-2 px-3 text-xs bg-[var(--gold)]/10 border border-[var(--gold)]/30 text-[var(--gold)] rounded-lg hover:bg-[var(--gold)]/20 transition-colors"
            >
              <MessageCircle size={12} />
              Ask Aria about this
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-2 max-w-sm">
        {activeLegendTypes.map((type) => (
          <div key={type} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: nodeColor(type) }} />
            <span className="text-xs text-[var(--text-muted)]">{type}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
