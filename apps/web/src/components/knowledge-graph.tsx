'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { knowledge } from '@/lib/api'
import { X, ZoomIn, ZoomOut, Maximize2, RefreshCw } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────

interface RawNode {
  id: string
  label: string
  type?: string
  properties?: Record<string, unknown>
}

interface RawRelationship {
  id?: string
  startNodeId?: string
  source?: string
  endNodeId?: string
  target?: string
  type?: string
  label?: string
}

interface SimNode extends RawNode {
  x: number
  y: number
  vx: number
  vy: number
}

interface SimEdge {
  id: string
  source: string
  target: string
  label: string
}

function isRawNode(v: unknown): v is RawNode {
  return (
    typeof v === 'object' &&
    v !== null &&
    'id' in v &&
    'label' in v &&
    typeof (v as Record<string, unknown>)['id'] === 'string' &&
    typeof (v as Record<string, unknown>)['label'] === 'string'
  )
}

function isRawRelationship(v: unknown): v is RawRelationship {
  return typeof v === 'object' && v !== null
}

// ─── Force simulation constants ───────────────────────────────

const REPULSION = 4000
const SPRING_LENGTH = 140
const SPRING_STRENGTH = 0.04
const DAMPING = 0.78
const CENTER_STRENGTH = 0.008

function simulateStep(
  nodes: SimNode[],
  edges: SimEdge[],
  width: number,
  height: number
): SimNode[] {
  const cx = width / 2
  const cy = height / 2
  const updated: SimNode[] = nodes.map((n) => ({ ...n }))

  // Repulsion between all pairs
  for (let i = 0; i < updated.length; i++) {
    for (let j = i + 1; j < updated.length; j++) {
      const a = updated[i]
      const b = updated[j]
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const distSq = dx * dx + dy * dy || 0.01
      const dist = Math.sqrt(distSq)
      const force = REPULSION / distSq
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      a.vx -= fx
      a.vy -= fy
      b.vx += fx
      b.vy += fy
    }
  }

  // Spring forces along edges
  for (const edge of edges) {
    const a = updated.find((n) => n.id === edge.source)
    const b = updated.find((n) => n.id === edge.target)
    if (!a || !b) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
    const stretch = dist - SPRING_LENGTH
    const force = SPRING_STRENGTH * stretch
    const fx = (dx / dist) * force
    const fy = (dy / dist) * force
    a.vx += fx
    a.vy += fy
    b.vx -= fx
    b.vy -= fy
  }

  // Center + integrate
  for (const node of updated) {
    node.vx += (cx - node.x) * CENTER_STRENGTH
    node.vy += (cy - node.y) * CENTER_STRENGTH
    node.vx *= DAMPING
    node.vy *= DAMPING
    node.x += node.vx
    node.y += node.vy
  }

  return updated
}

// ─── Node colour by entity type ───────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  Person: '#C8A96E',
  Organization: '#60A5FA',
  Product: '#4ADE80',
  Technology: '#A78BFA',
  Process: '#F87171',
  Concept: '#FBBF24',
  Location: '#34D399',
}

function nodeColor(type: string | undefined): string {
  if (!type) return '#9898A8'
  return TYPE_COLORS[type] ?? '#9898A8'
}

// ─── Props ────────────────────────────────────────────────────

interface KnowledgeGraphProps {
  clientId: string
}

// ─── Component ────────────────────────────────────────────────

export function KnowledgeGraph({ clientId }: KnowledgeGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const rafRef = useRef<number | null>(null)
  const nodesRef = useRef<SimNode[]>([])
  const edgesRef = useRef<SimEdge[]>([])

  const [nodes, setNodes] = useState<SimNode[]>([])
  const [edges, setEdges] = useState<SimEdge[]>([])
  const [selected, setSelected] = useState<SimNode | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const [svgSize, setSvgSize] = useState({ w: 800, h: 600 })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['knowledge-graph', clientId],
    queryFn: () => knowledge.getGraph(clientId),
    retry: 1,
  })

  // Initialise simulation nodes from API data
  useEffect(() => {
    if (!data) return

    const rawNodes = data.nodes.filter(isRawNode)
    const rawEdges = data.relationships.filter(isRawRelationship)

    const { w, h } = svgSize
    const simNodes: SimNode[] = rawNodes.map((n, i) => ({
      ...n,
      x: w / 2 + Math.cos((i / rawNodes.length) * Math.PI * 2) * 180,
      y: h / 2 + Math.sin((i / rawNodes.length) * Math.PI * 2) * 180,
      vx: 0,
      vy: 0,
    }))

    const simEdges: SimEdge[] = rawEdges.map((r, i) => ({
      id: r.id ?? String(i),
      source: r.startNodeId ?? r.source ?? '',
      target: r.endNodeId ?? r.target ?? '',
      label: r.type ?? r.label ?? '',
    }))

    nodesRef.current = simNodes
    edgesRef.current = simEdges
    setNodes(simNodes)
    setEdges(simEdges)
  }, [data, svgSize])

  // Measure SVG container
  useEffect(() => {
    const el = svgRef.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setSvgSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Run simulation loop
  useEffect(() => {
    let running = true
    let steps = 0
    const MAX_STEPS = 300

    function tick() {
      if (!running || steps >= MAX_STEPS) return
      nodesRef.current = simulateStep(nodesRef.current, edgesRef.current, svgSize.w, svgSize.h)
      setNodes([...nodesRef.current])
      steps++
      rafRef.current = requestAnimationFrame(tick)
    }

    if (nodesRef.current.length > 0) {
      rafRef.current = requestAnimationFrame(tick)
    }

    return () => {
      running = false
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [data, svgSize])

  // Zoom handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom((z) => Math.min(3, Math.max(0.2, z - e.deltaY * 0.001)))
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    setIsPanning(true)
    panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
  }, [pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return
    setPan({
      x: panStart.current.px + e.clientX - panStart.current.x,
      y: panStart.current.py + e.clientY - panStart.current.y,
    })
  }, [isPanning])

  const handleMouseUp = useCallback(() => setIsPanning(false), [])

  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
        Loading knowledge graph…
      </div>
    )
  }

  if (!data || nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-2">
        <p className="text-sm text-[var(--text-secondary)]">No entities found</p>
        <p className="text-xs text-[var(--text-muted)]">Ingest documents to populate the knowledge graph</p>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-[var(--bg-primary)] rounded-xl border border-[var(--border)]">
      {/* Controls */}
      <div className="absolute top-3 right-3 z-10 flex gap-1">
        <button
          onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
          className="p-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          title="Zoom in"
        >
          <ZoomIn size={14} />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.2, z - 0.2))}
          className="p-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          title="Zoom out"
        >
          <ZoomOut size={14} />
        </button>
        <button
          onClick={resetView}
          className="p-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          title="Reset view"
        >
          <Maximize2 size={14} />
        </button>
        <button
          onClick={() => { void refetch() }}
          className="p-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Node count */}
      <div className="absolute top-3 left-3 z-10 text-xs text-[var(--text-muted)]">
        {nodes.length} entities · {edges.length} relationships
      </div>

      {/* SVG canvas */}
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* Edges */}
          <g>
            {edges.map((edge) => {
              const src = nodes.find((n) => n.id === edge.source)
              const tgt = nodes.find((n) => n.id === edge.target)
              if (!src || !tgt) return null
              const mx = (src.x + tgt.x) / 2
              const my = (src.y + tgt.y) / 2
              return (
                <g key={edge.id}>
                  <line
                    x1={src.x}
                    y1={src.y}
                    x2={tgt.x}
                    y2={tgt.y}
                    stroke="var(--border)"
                    strokeWidth={1.5}
                    strokeOpacity={0.6}
                  />
                  {edge.label && (
                    <text
                      x={mx}
                      y={my - 4}
                      textAnchor="middle"
                      fill="var(--text-muted)"
                      fontSize={9}
                      style={{ userSelect: 'none', pointerEvents: 'none' }}
                    >
                      {edge.label}
                    </text>
                  )}
                </g>
              )
            })}
          </g>

          {/* Nodes */}
          <g>
            {nodes.map((node) => {
              const color = nodeColor(node.type)
              const isSelected = selected?.id === node.id
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelected(isSelected ? null : node)
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <circle
                    r={isSelected ? 20 : 14}
                    fill={color}
                    fillOpacity={isSelected ? 0.3 : 0.15}
                    stroke={color}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={color}
                    fontSize={9}
                    fontWeight="500"
                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                  >
                    {node.label.length > 12 ? `${node.label.slice(0, 11)}…` : node.label}
                  </text>
                  {node.type && (
                    <text
                      y={isSelected ? 28 : 22}
                      textAnchor="middle"
                      fill="var(--text-muted)"
                      fontSize={8}
                      style={{ userSelect: 'none', pointerEvents: 'none' }}
                    >
                      {node.type}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        </g>
      </svg>

      {/* Entity detail panel */}
      {selected && (
        <div className="absolute top-0 right-0 h-full w-64 bg-[var(--bg-secondary)] border-l border-[var(--border)] p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-serif text-sm text-[var(--gold)]">{selected.label}</h3>
            <button
              onClick={() => setSelected(null)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X size={14} />
            </button>
          </div>

          {selected.type && (
            <div className="mb-3">
              <span className="badge badge-gold">{selected.type}</span>
            </div>
          )}

          {selected.properties && Object.keys(selected.properties).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Properties</p>
              {Object.entries(selected.properties).map(([k, v]) => (
                <div key={k} className="text-xs">
                  <span className="text-[var(--text-secondary)]">{k}: </span>
                  <span className="text-[var(--text-primary)]">{String(v)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">Connected to</p>
            <div className="space-y-1">
              {edges
                .filter((e) => e.source === selected.id || e.target === selected.id)
                .slice(0, 8)
                .map((e) => {
                  const otherId = e.source === selected.id ? e.target : e.source
                  const other = nodes.find((n) => n.id === otherId)
                  if (!other) return null
                  return (
                    <button
                      key={e.id}
                      onClick={() => setSelected(other)}
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <span className="text-xs text-[var(--text-muted)]">{e.label} → </span>
                      <span className="text-xs text-[var(--text-primary)]">{other.label}</span>
                    </button>
                  )
                })}
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-2 max-w-xs">
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-[var(--text-muted)]">{type}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
