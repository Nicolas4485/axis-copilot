import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { DecomposedQuery } from '../types.js'

// ──────────────────────────────────────────────────────────────────────────────
// Hoisted mocks — must be declared before vi.mock() factory references them
// ──────────────────────────────────────────────────────────────────────────────

const { mockIsAvailable, mockFindRelated } = vi.hoisted(() => ({
  mockIsAvailable: vi.fn<[], boolean>().mockReturnValue(false),
  mockFindRelated: vi.fn().mockResolvedValue(null),
}))

vi.mock('@axis/knowledge-graph', () => ({
  Neo4jClient: vi.fn().mockImplementation(() => ({
    isAvailable: mockIsAvailable,
  })),
  GraphOperations: vi.fn().mockImplementation(() => ({
    findRelated: mockFindRelated,
  })),
}))

// Import AFTER vi.mock so the mock is in place
import { HybridRetriever } from '../hybrid-retriever.js'

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

interface VectorRow {
  chunk_id: string
  document_id: string
  content: string
  similarity: number
  source_title: string
  source_type: string
  client_id: string | null
  created_at: string
  metadata: string
}

function makeVectorRow(overrides: Partial<VectorRow> = {}): VectorRow {
  return {
    chunk_id:     overrides.chunk_id     ?? 'c1',
    document_id:  overrides.document_id  ?? 'doc-1',
    content:      overrides.content      ?? 'Test content.',
    similarity:   overrides.similarity   ?? 0.85,
    source_title: overrides.source_title ?? 'Test Source',
    source_type:  overrides.source_type  ?? 'UPLOAD',
    client_id:    overrides.client_id    !== undefined ? overrides.client_id : null,
    created_at:   overrides.created_at   ?? new Date().toISOString(),
    metadata:     overrides.metadata     ?? '{}',
  }
}

function makeGraphResult(entityName: string) {
  return {
    node: { name: entityName, label: 'Organization' },
    relationships: [
      {
        relationship: { type: 'COMPETES_WITH', fromId: 'n1', toId: 'n2' },
        targetNode:   { name: 'Competitor A', label: 'Organization' },
      },
    ],
  }
}

function makeQuery(overrides: Partial<DecomposedQuery> = {}): DecomposedQuery {
  return {
    original:       overrides.original       ?? 'test query',
    vectorQueries:  overrides.vectorQueries  ?? ['test query'],
    graphQueries:   overrides.graphQueries   ?? [],
    entityFocus:    overrides.entityFocus    ?? [],
    temporalFilter: overrides.temporalFilter ?? null,
  }
}

const mockQueryRawUnsafe = vi.fn()
const mockPrisma = { $queryRawUnsafe: mockQueryRawUnsafe } as unknown as PrismaClient

// ──────────────────────────────────────────────────────────────────────────────
// Vector search
// ──────────────────────────────────────────────────────────────────────────────

describe('HybridRetriever — vector search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAvailable.mockReturnValue(false)
  })

  it('returns chunk mapped from a VectorSearchRow', async () => {
    mockQueryRawUnsafe.mockResolvedValue([makeVectorRow({})])
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    const { chunks } = await retriever.retrieve(makeQuery(), 'user-1', null, [0.1, 0.2])
    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.chunkId).toBe('c1')
  })

  it('maps all VectorSearchRow fields to RetrievedChunk correctly', async () => {
    const row = makeVectorRow({
      chunk_id:     'x1',
      document_id:  'd1',
      content:      'Hello world.',
      similarity:   0.92,
      source_title: 'My Doc',
      source_type:  'GDRIVE',
      client_id:    'cl-1',
      created_at:   '2026-01-01T00:00:00Z',
      metadata:     '{"key":"val"}',
    })
    mockQueryRawUnsafe.mockResolvedValue([row])
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    const { chunks } = await retriever.retrieve(makeQuery(), 'user-1', null, [0.1])
    const c = chunks[0]!
    expect(c.chunkId).toBe('x1')
    expect(c.documentId).toBe('d1')
    expect(c.content).toBe('Hello world.')
    expect(c.similarity).toBe(0.92)
    expect(c.sourceTitle).toBe('My Doc')
    expect(c.sourceType).toBe('GDRIVE')
    expect(c.clientId).toBe('cl-1')
    expect(c.createdAt).toBe('2026-01-01T00:00:00Z')
    expect(c.metadata).toEqual({ key: 'val' })
  })

  it('deduplicates chunks with same chunkId across multiple vectorQueries', async () => {
    const row = makeVectorRow({ chunk_id: 'c1' })
    // Both vectorQuery calls return the same row
    mockQueryRawUnsafe.mockResolvedValue([row])
    const query = makeQuery({ vectorQueries: ['q1', 'q2'] })
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    const { chunks } = await retriever.retrieve(query, 'user-1', null, [0.1])
    expect(chunks).toHaveLength(1)
  })

  it('returns empty chunks when vector search throws (graceful degradation)', async () => {
    mockQueryRawUnsafe.mockRejectedValue(new Error('DB connection failed'))
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    const { chunks } = await retriever.retrieve(makeQuery(), 'user-1', null, [0.1])
    expect(chunks).toHaveLength(0)
  })

  it('applies client filter in SQL when clientId is provided', async () => {
    mockQueryRawUnsafe.mockResolvedValue([])
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    await retriever.retrieve(makeQuery(), 'user-1', 'client-abc', [0.1])
    const callArgs = mockQueryRawUnsafe.mock.calls[0] as [string, ...unknown[]]
    const [sql, ...params] = callArgs
    expect(sql).toContain('kd.client_id')
    expect(params).toContain('client-abc')
  })

  it('does not include client WHERE filter when clientId is null', async () => {
    mockQueryRawUnsafe.mockResolvedValue([])
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    await retriever.retrieve(makeQuery(), 'user-1', null, [0.1])
    const [sql] = mockQueryRawUnsafe.mock.calls[0] as [string, ...unknown[]]
    // kd.client_id appears in SELECT — check only for the WHERE filter clause
    expect(sql).not.toContain('AND kd.client_id =')
  })

  it('applies temporal after filter when set', async () => {
    mockQueryRawUnsafe.mockResolvedValue([])
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    const query = makeQuery({
      temporalFilter: { after: '2026-01-01', label: 'after Jan' },
    })
    await retriever.retrieve(query, 'user-1', null, [0.1])
    const callArgs = mockQueryRawUnsafe.mock.calls[0] as [string, ...unknown[]]
    const [sql, ...params] = callArgs
    expect(sql).toContain('dc.created_at >=')
    expect(params).toContain('2026-01-01')
  })

  it('applies temporal before filter when set', async () => {
    mockQueryRawUnsafe.mockResolvedValue([])
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    const query = makeQuery({
      temporalFilter: { before: '2026-03-01', label: 'before Mar' },
    })
    await retriever.retrieve(query, 'user-1', null, [0.1])
    const callArgs = mockQueryRawUnsafe.mock.calls[0] as [string, ...unknown[]]
    const [sql, ...params] = callArgs
    expect(sql).toContain('dc.created_at <=')
    expect(params).toContain('2026-03-01')
  })

  it('passes DEFAULT_VECTOR_LIMIT (20) as the last query parameter', async () => {
    mockQueryRawUnsafe.mockResolvedValue([])
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    await retriever.retrieve(makeQuery(), 'user-1', null, [0.1])
    const callArgs = mockQueryRawUnsafe.mock.calls[0] as unknown[]
    const lastParam = callArgs[callArgs.length - 1]
    expect(lastParam).toBe(20)
  })

  it('returns empty chunks when no vectorQueries provided', async () => {
    mockQueryRawUnsafe.mockResolvedValue([makeVectorRow({})])
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    const { chunks } = await retriever.retrieve(
      makeQuery({ vectorQueries: [] }),
      'user-1', null, [0.1]
    )
    expect(chunks).toHaveLength(0)
    expect(mockQueryRawUnsafe).not.toHaveBeenCalled()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Graph traversal
// ──────────────────────────────────────────────────────────────────────────────

describe('HybridRetriever — graph traversal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryRawUnsafe.mockResolvedValue([])
  })

  it('returns empty graphInsights when Neo4j is unavailable', async () => {
    mockIsAvailable.mockReturnValue(false)
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    const { graphInsights } = await retriever.retrieve(
      makeQuery({ graphQueries: [{ entityName: 'Acme', relationshipTypes: [], depth: 2 }] }),
      'user-1', null, [0.1]
    )
    expect(graphInsights).toHaveLength(0)
    expect(mockFindRelated).not.toHaveBeenCalled()
  })

  it('returns graphInsights when Neo4j is available and findRelated succeeds', async () => {
    mockIsAvailable.mockReturnValue(true)
    mockFindRelated.mockResolvedValue(makeGraphResult('Acme Corp'))
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    const { graphInsights } = await retriever.retrieve(
      makeQuery({ graphQueries: [{ entityName: 'Acme Corp', relationshipTypes: [], depth: 2 }] }),
      'user-1', null, [0.1]
    )
    expect(graphInsights).toHaveLength(1)
    expect(graphInsights[0]?.entityName).toBe('Acme Corp')
    expect(graphInsights[0]?.entityType).toBe('Organization')
  })

  it('maps relationship type, targetName, and targetType from graph result', async () => {
    mockIsAvailable.mockReturnValue(true)
    mockFindRelated.mockResolvedValue(makeGraphResult('Acme Corp'))
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    const { graphInsights } = await retriever.retrieve(
      makeQuery({ graphQueries: [{ entityName: 'Acme Corp', relationshipTypes: [], depth: 2 }] }),
      'user-1', null, [0.1]
    )
    const rel = graphInsights[0]?.relationships[0]!
    expect(rel.type).toBe('COMPETES_WITH')
    expect(rel.targetName).toBe('Competitor A')
    expect(rel.targetType).toBe('Organization')
  })

  it('skips graph query when findRelated throws (no crash)', async () => {
    mockIsAvailable.mockReturnValue(true)
    mockFindRelated.mockRejectedValue(new Error('Neo4j query failed'))
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    const { graphInsights } = await retriever.retrieve(
      makeQuery({ graphQueries: [{ entityName: 'Acme', relationshipTypes: [], depth: 2 }] }),
      'user-1', null, [0.1]
    )
    expect(graphInsights).toHaveLength(0)
  })

  it('skips duplicate entityFocus lookup when entity already found via graphQueries', async () => {
    mockIsAvailable.mockReturnValue(true)
    mockFindRelated.mockResolvedValue(makeGraphResult('Acme Corp'))
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    await retriever.retrieve(
      makeQuery({
        graphQueries: [{ entityName: 'Acme Corp', relationshipTypes: [], depth: 2 }],
        entityFocus:  ['Acme Corp'],
      }),
      'user-1', null, [0.1]
    )
    // Called once for graphQuery, NOT again for entityFocus since it's already in insights
    expect(mockFindRelated).toHaveBeenCalledTimes(1)
  })

  it('calls findRelated for entityFocus entities not in graphQueries', async () => {
    mockIsAvailable.mockReturnValue(true)
    mockFindRelated.mockResolvedValue(makeGraphResult('Beta Corp'))
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    const { graphInsights } = await retriever.retrieve(
      makeQuery({
        graphQueries: [],
        entityFocus:  ['Beta Corp'],
      }),
      'user-1', null, [0.1]
    )
    expect(mockFindRelated).toHaveBeenCalledTimes(1)
    expect(mockFindRelated).toHaveBeenCalledWith('Beta Corp', 2)
    expect(graphInsights).toHaveLength(1)
  })

  it('skips entityFocus entry when findRelated returns null', async () => {
    mockIsAvailable.mockReturnValue(true)
    mockFindRelated.mockResolvedValue(null)
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    const { graphInsights } = await retriever.retrieve(
      makeQuery({ entityFocus: ['Unknown Corp'] }),
      'user-1', null, [0.1]
    )
    expect(graphInsights).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Combined (vector + graph)
// ──────────────────────────────────────────────────────────────────────────────

describe('HybridRetriever — combined retrieval', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns both chunks and graphInsights when both paths succeed', async () => {
    mockIsAvailable.mockReturnValue(true)
    mockQueryRawUnsafe.mockResolvedValue([makeVectorRow({})])
    mockFindRelated.mockResolvedValue(makeGraphResult('Acme Corp'))
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    const { chunks, graphInsights } = await retriever.retrieve(
      makeQuery({
        graphQueries: [{ entityName: 'Acme Corp', relationshipTypes: [], depth: 2 }],
      }),
      'user-1', null, [0.1]
    )
    expect(chunks).toHaveLength(1)
    expect(graphInsights).toHaveLength(1)
  })

  it('vector-only when Neo4j unavailable: chunks present, graphInsights empty', async () => {
    mockIsAvailable.mockReturnValue(false)
    mockQueryRawUnsafe.mockResolvedValue([makeVectorRow({})])
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    const { chunks, graphInsights } = await retriever.retrieve(
      makeQuery({ graphQueries: [{ entityName: 'Acme', relationshipTypes: [], depth: 2 }] }),
      'user-1', null, [0.1]
    )
    expect(chunks).toHaveLength(1)
    expect(graphInsights).toHaveLength(0)
  })

  it('returns empty arrays when both vector throws and Neo4j unavailable', async () => {
    mockIsAvailable.mockReturnValue(false)
    mockQueryRawUnsafe.mockRejectedValue(new Error('DB down'))
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    const { chunks, graphInsights } = await retriever.retrieve(makeQuery(), 'user-1', null, [0.1])
    expect(chunks).toHaveLength(0)
    expect(graphInsights).toHaveLength(0)
  })

  it('runs vector and graph in parallel (both $queryRawUnsafe and findRelated called)', async () => {
    mockIsAvailable.mockReturnValue(true)
    mockQueryRawUnsafe.mockResolvedValue([])
    mockFindRelated.mockResolvedValue(null)
    const retriever = new HybridRetriever({ prisma: mockPrisma })
    await retriever.retrieve(
      makeQuery({
        vectorQueries: ['v1'],
        graphQueries:  [{ entityName: 'Acme', relationshipTypes: [], depth: 2 }],
      }),
      'user-1', null, [0.1]
    )
    expect(mockQueryRawUnsafe).toHaveBeenCalled()
    expect(mockFindRelated).toHaveBeenCalled()
  })
})
