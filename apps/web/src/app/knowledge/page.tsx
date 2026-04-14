'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { clients } from '@/lib/api'
import { KnowledgeGraph } from '@/components/knowledge-graph'
import { DocumentViewer } from '@/components/document-viewer'
import { Network, FileText, ChevronDown } from 'lucide-react'

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
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
        <div>
          <h1 className="font-serif text-2xl text-[var(--gold)]">Knowledge</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Entities, relationships, and ingested documents
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Client selector */}
          <div className="relative">
            <select
              value={selectedClientId ?? ''}
              onChange={(e) => setSelectedClientId(e.target.value || null)}
              className="input pr-8 appearance-none cursor-pointer bg-[var(--bg-tertiary)] text-[var(--text-primary)] border-[var(--border)]"
              disabled={isLoading}
            >
              <option value="">All clients</option>
              {clientList.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 bg-[var(--bg-tertiary)] rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab('graph')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
                activeTab === 'graph'
                  ? 'bg-[var(--gold)] text-[var(--bg-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Network size={13} />
              Graph
            </button>
            <button
              onClick={() => setActiveTab('documents')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
                activeTab === 'documents'
                  ? 'bg-[var(--gold)] text-[var(--bg-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <FileText size={13} />
              Documents
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
            <div className="flex flex-col items-center justify-center h-full text-center gap-3">
              <Network size={40} className="text-[var(--text-muted)]" />
              <div>
                <p className="text-sm text-[var(--text-secondary)]">Select a client to view their knowledge graph</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Entities and relationships are extracted during sessions
                </p>
              </div>
              {clientList.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {clientList.slice(0, 6).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedClientId(c.id)}
                      className="badge badge-gold hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
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
