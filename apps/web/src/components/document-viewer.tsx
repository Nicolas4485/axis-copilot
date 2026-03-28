'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { documents, type DocumentDetail, type DocumentEntity } from '@/lib/api'
import { FileText, Tag, X, ExternalLink, ChevronLeft } from 'lucide-react'

// ─── Entity type colours ──────────────────────────────────────

const ENTITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Person: { bg: 'rgba(200,169,110,0.15)', text: '#C8A96E', border: 'rgba(200,169,110,0.4)' },
  Organization: { bg: 'rgba(96,165,250,0.15)', text: '#60A5FA', border: 'rgba(96,165,250,0.4)' },
  Product: { bg: 'rgba(74,222,128,0.15)', text: '#4ADE80', border: 'rgba(74,222,128,0.4)' },
  Technology: { bg: 'rgba(167,139,250,0.15)', text: '#A78BFA', border: 'rgba(167,139,250,0.4)' },
  Process: { bg: 'rgba(248,113,113,0.15)', text: '#F87171', border: 'rgba(248,113,113,0.4)' },
  Concept: { bg: 'rgba(251,191,36,0.15)', text: '#FBBF24', border: 'rgba(251,191,36,0.4)' },
}

function entityStyle(type: string): { bg: string; text: string; border: string } {
  return ENTITY_COLORS[type] ?? { bg: 'rgba(152,152,168,0.15)', text: '#9898A8', border: 'rgba(152,152,168,0.4)' }
}

// ─── Highlighted content renderer ────────────────────────────

interface ContentSegment {
  text: string
  entity: DocumentEntity | null
}

function buildSegments(content: string, entities: DocumentEntity[]): ContentSegment[] {
  if (entities.length === 0) return [{ text: content, entity: null }]

  // Sort by start position
  const sorted = [...entities].sort((a, b) => a.start - b.start)
  const segments: ContentSegment[] = []
  let cursor = 0

  for (const entity of sorted) {
    if (entity.start < cursor) continue // overlapping — skip
    if (entity.start > cursor) {
      segments.push({ text: content.slice(cursor, entity.start), entity: null })
    }
    segments.push({ text: content.slice(entity.start, entity.end), entity })
    cursor = entity.end
  }

  if (cursor < content.length) {
    segments.push({ text: content.slice(cursor), entity: null })
  }

  return segments
}

// ─── Props ────────────────────────────────────────────────────

interface DocumentViewerProps {
  clientId?: string
  initialDocumentId?: string
}

// ─── Component ────────────────────────────────────────────────

export function DocumentViewer({ clientId, initialDocumentId }: DocumentViewerProps) {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(initialDocumentId ?? null)
  const [selectedEntity, setSelectedEntity] = useState<DocumentEntity | null>(null)
  const [activeEntityType, setActiveEntityType] = useState<string | null>(null)

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['documents', clientId],
    queryFn: () => documents.list(clientId),
    retry: 1,
  })

  const { data: docData, isLoading: docLoading } = useQuery({
    queryKey: ['document', selectedDocId],
    queryFn: () => documents.get(selectedDocId!),
    enabled: selectedDocId !== null,
    retry: 1,
  })

  const docList = listData?.documents ?? []

  const entityTypes = docData
    ? [...new Set(docData.entities.map((e) => e.entityType))]
    : []

  const filteredEntities = docData
    ? activeEntityType !== null
      ? docData.entities.filter((e) => e.entityType === activeEntityType)
      : docData.entities
    : []

  if (listLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--text-muted)] text-sm">
        Loading documents…
      </div>
    )
  }

  if (docList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-2">
        <FileText size={32} className="text-[var(--text-muted)]" />
        <p className="text-sm text-[var(--text-secondary)]">No documents ingested yet</p>
        <p className="text-xs text-[var(--text-muted)]">Upload documents via the ingestion pipeline</p>
      </div>
    )
  }

  // Document list view
  if (!selectedDocId) {
    return (
      <div className="space-y-2">
        {docList.map((doc) => (
          <button
            key={doc.id}
            onClick={() => setSelectedDocId(doc.id)}
            className="w-full card text-left hover:border-[var(--gold)]/30 transition-colors group"
          >
            <div className="flex items-start gap-3">
              <FileText size={16} className="text-[var(--text-muted)] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{doc.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-[var(--text-muted)]">{doc.mimeType}</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <ExternalLink
                size={14}
                className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              />
            </div>
          </button>
        ))}
      </div>
    )
  }

  // Document detail view
  return (
    <div className="flex gap-4 h-full">
      {/* Main document content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => { setSelectedDocId(null); setSelectedEntity(null) }}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <h3 className="font-serif text-base truncate">
            {docLoading ? 'Loading…' : (docData?.title ?? 'Document')}
          </h3>
          {docData && (
            <span className="badge badge-gold shrink-0">{docData.entities.length} entities</span>
          )}
        </div>

        {/* Entity type filter */}
        {entityTypes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            <button
              onClick={() => setActiveEntityType(null)}
              className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                activeEntityType === null
                  ? 'border-[var(--gold)] text-[var(--gold)] bg-[var(--gold)]/10'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-active)]'
              }`}
            >
              All
            </button>
            {entityTypes.map((type) => {
              const style = entityStyle(type)
              return (
                <button
                  key={type}
                  onClick={() => setActiveEntityType(activeEntityType === type ? null : type)}
                  className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                    activeEntityType === type ? 'opacity-100' : 'opacity-60 hover:opacity-80'
                  }`}
                  style={{
                    borderColor: style.border,
                    color: style.text,
                    backgroundColor: activeEntityType === type ? style.bg : 'transparent',
                  }}
                >
                  {type}
                </button>
              )
            })}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto card text-sm leading-7">
          {docLoading && (
            <p className="text-[var(--text-muted)]">Loading content…</p>
          )}
          {docData && (
            <p className="whitespace-pre-wrap">
              {buildSegments(docData.content, filteredEntities).map((seg, i) => {
                if (!seg.entity) {
                  return <span key={i} className="text-[var(--text-primary)]">{seg.text}</span>
                }
                const style = entityStyle(seg.entity.entityType)
                const isActive = selectedEntity?.id === seg.entity.id
                return (
                  <mark
                    key={i}
                    onClick={() => setSelectedEntity(isActive ? null : (seg.entity ?? null))}
                    style={{
                      background: style.bg,
                      color: style.text,
                      borderBottom: `1.5px solid ${style.border}`,
                      cursor: 'pointer',
                      borderRadius: '2px',
                      padding: '0 1px',
                      outline: isActive ? `1px solid ${style.border}` : 'none',
                    }}
                    title={`${seg.entity.entityType}: ${seg.entity.text}`}
                  >
                    {seg.text}
                  </mark>
                )
              })}
            </p>
          )}
        </div>
      </div>

      {/* Entity sidebar */}
      <div className="w-56 shrink-0 flex flex-col gap-2 overflow-y-auto">
        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
          {selectedEntity ? 'Selected Entity' : 'Entities'}
        </p>

        {selectedEntity ? (
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <span className="badge" style={{ color: entityStyle(selectedEntity.entityType).text, backgroundColor: entityStyle(selectedEntity.entityType).bg }}>
                {selectedEntity.entityType}
              </span>
              <button
                onClick={() => setSelectedEntity(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X size={12} />
              </button>
            </div>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-2">{selectedEntity.text}</p>
            {selectedEntity.nodeId && (
              <div className="flex items-center gap-1 text-xs text-[var(--gold)]">
                <Tag size={10} />
                <span>Linked to graph node</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {(activeEntityType !== null ? filteredEntities : docData?.entities ?? [])
              .slice(0, 20)
              .map((entity) => {
                const style = entityStyle(entity.entityType)
                return (
                  <button
                    key={entity.id}
                    onClick={() => setSelectedEntity(entity)}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: style.text }}
                      />
                      <span className="text-xs text-[var(--text-primary)] truncate">{entity.text}</span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] ml-3.5">{entity.entityType}</p>
                  </button>
                )
              })}
            {(docData?.entities.length ?? 0) > 20 && (
              <p className="text-xs text-[var(--text-muted)] px-2">
                +{(docData?.entities.length ?? 0) - 20} more
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
