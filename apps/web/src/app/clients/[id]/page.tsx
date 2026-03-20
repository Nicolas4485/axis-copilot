'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { clients, knowledge } from '@/lib/api'
import Link from 'next/link'
import {
  Building2, Globe, Users as UsersIcon, Edit, MessageSquare,
  FileText, HardDrive, Network, ArrowUpRight,
} from 'lucide-react'

type TabId = 'overview' | 'stakeholders' | 'knowledge' | 'drive' | 'sessions'

const TABS: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Overview', icon: Building2 },
  { id: 'stakeholders', label: 'Stakeholders', icon: UsersIcon },
  { id: 'knowledge', label: 'Knowledge', icon: FileText },
  { id: 'drive', label: 'Drive', icon: HardDrive },
  { id: 'sessions', label: 'Sessions', icon: MessageSquare },
]

export default function ClientProfilePage() {
  const { id } = useParams<{ id: string }>()
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [editing, setEditing] = useState(false)

  const { data: client } = useQuery({
    queryKey: ['client', id],
    queryFn: () => clients.get(id),
  })

  const { data: stakeholderData } = useQuery({
    queryKey: ['stakeholders', id],
    queryFn: () => clients.getStakeholders(id),
    enabled: activeTab === 'stakeholders',
  })

  const { data: orgChart } = useQuery({
    queryKey: ['orgchart', id],
    queryFn: () => clients.getOrgChart(id),
    enabled: activeTab === 'stakeholders',
  })

  const { data: graphData } = useQuery({
    queryKey: ['graph', id],
    queryFn: () => knowledge.getGraph(id),
    enabled: activeTab === 'knowledge',
  })

  const { data: conflictData } = useQuery({
    queryKey: ['conflicts', id],
    queryFn: () => knowledge.getConflicts(id),
    enabled: activeTab === 'knowledge',
  })

  if (!client) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <p className="text-[var(--text-muted)]">Loading client...</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl">{client.name}</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-[var(--text-secondary)]">
            {client.industry && (
              <span className="flex items-center gap-1">
                <Building2 size={14} />
                {client.industry}
              </span>
            )}
            {client.companySize && (
              <span className="flex items-center gap-1">
                <UsersIcon size={14} />
                {client.companySize} employees
              </span>
            )}
            {client.website && (
              <a
                href={client.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[var(--gold)] hover:underline"
              >
                <Globe size={14} />
                Website
                <ArrowUpRight size={12} />
              </a>
            )}
          </div>
        </div>
        <button onClick={() => setEditing(!editing)} className="btn-secondary flex items-center gap-1.5">
          <Edit size={14} />
          Edit
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-[var(--border)]">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`tab flex items-center gap-1.5 ${activeTab === t.id ? 'tab-active' : ''}`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 gap-6">
          {/* Notes */}
          <div className="card">
            <h3 className="font-serif text-sm text-[var(--text-secondary)] mb-2">Notes</h3>
            <p className="text-sm">{client.notes ?? 'No notes yet.'}</p>
          </div>

          {/* Tech Stack */}
          <div className="card">
            <h3 className="font-serif text-sm text-[var(--text-secondary)] mb-2">Tech Stack</h3>
            <div className="flex flex-wrap gap-2">
              {Array.isArray(client.techStack)
                ? (client.techStack as string[]).map((tech, i) => (
                    <span key={i} className="badge badge-gold">{tech}</span>
                  ))
                : <p className="text-sm text-[var(--text-muted)]">Not specified</p>
              }
            </div>
          </div>

          {/* Recent Contexts */}
          <div className="card col-span-2">
            <h3 className="font-serif text-sm text-[var(--text-secondary)] mb-2">Recent Client Contexts</h3>
            <p className="text-sm text-[var(--text-muted)]">Client contexts will appear here after intake sessions.</p>
          </div>
        </div>
      )}

      {activeTab === 'stakeholders' && (
        <div className="space-y-4">
          {/* Stakeholder Table */}
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Role</th>
                  <th className="pb-2 font-medium">Department</th>
                  <th className="pb-2 font-medium">Influence</th>
                  <th className="pb-2 font-medium">Interest</th>
                  <th className="pb-2 font-medium">Quadrant</th>
                </tr>
              </thead>
              <tbody>
                {stakeholderData?.stakeholders?.map((s) => {
                  const quadrant =
                    s.influence === 'HIGH' && s.interest === 'HIGH' ? 'Manage Closely' :
                    s.influence === 'HIGH' ? 'Keep Satisfied' :
                    s.interest === 'HIGH' ? 'Keep Informed' : 'Monitor'
                  return (
                    <tr key={s.id} className="border-b border-[var(--border)]/50">
                      <td className="py-2">{s.name}</td>
                      <td className="py-2 text-[var(--text-secondary)]">{s.role ?? '—'}</td>
                      <td className="py-2 text-[var(--text-secondary)]">{s.department ?? '—'}</td>
                      <td className="py-2"><span className={`badge ${s.influence === 'HIGH' ? 'badge-red' : s.influence === 'MEDIUM' ? 'badge-gold' : 'badge-green'}`}>{s.influence}</span></td>
                      <td className="py-2"><span className={`badge ${s.interest === 'HIGH' ? 'badge-red' : s.interest === 'MEDIUM' ? 'badge-gold' : 'badge-green'}`}>{s.interest}</span></td>
                      <td className="py-2 text-xs text-[var(--text-muted)]">{quadrant}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {(!stakeholderData?.stakeholders || stakeholderData.stakeholders.length === 0) && (
              <p className="text-sm text-[var(--text-muted)] py-4 text-center">No stakeholders mapped yet.</p>
            )}
          </div>

          {/* Org Chart placeholder */}
          <div className="card">
            <h3 className="font-serif text-sm text-[var(--text-secondary)] mb-2 flex items-center gap-2">
              <Network size={14} />
              Org Chart
            </h3>
            <p className="text-sm text-[var(--text-muted)]">
              {orgChart?.stakeholderCount
                ? `${orgChart.stakeholderCount} stakeholders mapped. D3 visualisation coming in frontend v2.`
                : 'Add stakeholders to generate the org chart.'}
            </p>
          </div>
        </div>
      )}

      {activeTab === 'knowledge' && (
        <div className="grid grid-cols-2 gap-6">
          <div className="card">
            <h3 className="font-serif text-sm text-[var(--text-secondary)] mb-2">Knowledge Graph</h3>
            <p className="text-sm text-[var(--text-muted)]">
              {graphData?.nodes
                ? `${(graphData.nodes as unknown[]).length} nodes, ${(graphData.relationships as unknown[]).length} relationships`
                : 'No graph data yet. Upload documents to build the knowledge graph.'}
            </p>
          </div>
          <div className="card">
            <h3 className="font-serif text-sm text-[var(--text-secondary)] mb-2">Conflicts</h3>
            <p className="text-sm text-[var(--text-muted)]">
              {conflictData?.count
                ? `${conflictData.count} unresolved conflict${conflictData.count > 1 ? 's' : ''}`
                : 'No conflicts detected.'}
            </p>
          </div>
        </div>
      )}

      {activeTab === 'drive' && (
        <div className="card">
          <h3 className="font-serif text-sm text-[var(--text-secondary)] mb-2">Google Drive</h3>
          <p className="text-sm text-[var(--text-muted)]">Connect Google Drive in Settings to sync documents automatically.</p>
        </div>
      )}

      {activeTab === 'sessions' && (
        <div className="space-y-2">
          {client.sessions && client.sessions.length > 0 ? (
            client.sessions.map((s) => (
              <Link
                key={s.id}
                href={`/session/${s.id}`}
                className="card flex items-center justify-between hover:border-[var(--gold)]/30 transition-colors"
              >
                <div>
                  <p className="text-sm">{s.title}</p>
                  <p className="text-xs text-[var(--text-muted)]">{new Date(s.createdAt).toLocaleDateString()}</p>
                </div>
                <span className={`badge ${s.status === 'ACTIVE' ? 'badge-green' : 'badge-gold'}`}>{s.status}</span>
              </Link>
            ))
          ) : (
            <div className="card text-center py-8">
              <p className="text-sm text-[var(--text-muted)]">No sessions yet for this client.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
