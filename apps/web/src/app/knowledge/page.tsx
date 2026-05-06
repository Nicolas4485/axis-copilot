'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { clients } from '@/lib/api'
import { KnowledgeGraph } from '@/components/knowledge-graph'
import { DocumentViewer } from '@/components/document-viewer'
import Link from 'next/link'
import { Network, FileText, ChevronDown, Upload } from 'lucide-react'

type KnowledgeTab = 'graph' | 'documents'

function KnowledgePageContent() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const docParam = searchParams.get('doc')
  const [activeTab, setActiveTab] = useState<KnowledgeTab>(
    tabParam === 'documents' ? 'documents' : 'graph'
  )
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)

  // Sync tab when URL changes (e.g. sidebar link navigates here)
  useEffect(() => {
    if (tabParam === 'documents') setActiveTab('documents')
    else if (tabParam === 'graph') setActiveTab('graph')
  }, [tabParam])

  const { data: clientsData, isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clients.list(),
  })

  const clientList = clientsData?.clients ?? []

  useEffect(() => {
    if (clientList.length > 0 && !selectedClientId) {
      setSelectedClientId(clientList[0]!.id)
    }
  }, [clientList, selectedClientId])

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', borderBottom: '1px solid var(--line)',
        background: 'var(--surface)', flexShrink: 0,
      }}>
        <div>
          <div className="ax-eyebrow">Firm</div>
          <h1 style={{ fontWeight: 700, fontSize: 18, color: 'var(--ink)', marginTop: 2 }}>Knowledge Graph</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Client selector */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <select
              value={selectedClientId ?? ''}
              onChange={(e) => setSelectedClientId(e.target.value || null)}
              className="input"
              style={{ height: 32, fontSize: 12.5, paddingRight: 28, minWidth: 160 }}
              disabled={isLoading}
            >
              <option value="">All clients</option>
              {clientList.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronDown size={12} style={{ position: 'absolute', right: 8, color: 'var(--ink-4)', pointerEvents: 'none' }} />
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--surface-sunk)', borderRadius: 8, padding: 3 }}>
            <button
              onClick={() => setActiveTab('graph')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 500,
                background: activeTab === 'graph' ? 'var(--surface)' : 'transparent',
                color: activeTab === 'graph' ? 'var(--ink)' : 'var(--ink-3)',
                border: activeTab === 'graph' ? '1px solid var(--line)' : '1px solid transparent',
                boxShadow: activeTab === 'graph' ? 'var(--shadow-1)' : 'none',
                cursor: 'pointer', transition: 'all 150ms',
              }}
            >
              <Network size={13} /> Graph
            </button>
            <button
              onClick={() => setActiveTab('documents')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 500,
                background: activeTab === 'documents' ? 'var(--surface)' : 'transparent',
                color: activeTab === 'documents' ? 'var(--ink)' : 'var(--ink-3)',
                border: activeTab === 'documents' ? '1px solid var(--line)' : '1px solid transparent',
                boxShadow: activeTab === 'documents' ? 'var(--shadow-1)' : 'none',
                cursor: 'pointer', transition: 'all 150ms',
              }}
            >
              <FileText size={13} /> Documents
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-4">
        {activeTab === 'graph' ? (
          selectedClientId ? (
            <KnowledgeGraph clientId={selectedClientId} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', gap: 12 }}>
              <Network size={40} style={{ color: 'var(--ink-4)' }} />
              <div>
                <p style={{ fontSize: 13, color: 'var(--ink-2)' }}>Select a client to view their knowledge graph</p>
                <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
                  Entities and relationships are extracted during sessions and document ingestion
                </p>
              </div>
              {clientList.length > 0 ? (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 }}>
                    {clientList.slice(0, 6).map((c) => (
                      <button key={c.id} onClick={() => setSelectedClientId(c.id)} className="ax-btn">
                        {c.name}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setActiveTab('documents')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
                      padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 500,
                      background: 'var(--surface)', border: '1px solid var(--line)',
                      color: 'var(--ink-2)', cursor: 'pointer',
                    }}
                  >
                    <Upload size={13} /> Upload documents
                  </button>
                </>
              ) : (
                <Link
                  href="/clients"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
                    padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                    background: 'var(--primary)', color: '#fff', textDecoration: 'none',
                  }}
                >
                  <Upload size={13} /> Create your first deal to get started
                </Link>
              )}
            </div>
          )
        ) : (
          <div className="h-full overflow-y-auto">
            <DocumentViewer
              {...(selectedClientId !== null ? { clientId: selectedClientId } : {})}
              {...(docParam !== null ? { initialDocumentId: docParam } : {})}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default function KnowledgePage() {
  return (
    <Suspense fallback={null}>
      <KnowledgePageContent />
    </Suspense>
  )
}
