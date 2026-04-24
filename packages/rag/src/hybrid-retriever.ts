// Hybrid Retriever — parallel vector search + graph traversal
// Neo4j unavailable = automatic vector-only fallback

import type { PrismaClient } from '@prisma/client'
import { Neo4jClient, GraphOperations } from '@axis/knowledge-graph'
import type { DecomposedQuery, RetrievedChunk, GraphInsight } from './types.js'

const VECTOR_SIMILARITY_THRESHOLD = 0.3  // Lowered from 0.72 — cosine similarity on short docs
const DEFAULT_VECTOR_LIMIT = 20
const DEFAULT_GRAPH_DEPTH = 2

/** pgvector query result shape */
interface VectorSearchRow {
  chunk_id: string
  document_id: string
  content: string
  similarity: number
  source_title: string
  source_type: string
  client_id: string | null
  created_at: string
  metadata: Record<string, unknown>
}

/**
 * HybridRetriever runs parallel vector + graph retrieval.
 *
 * Vector: pgvector cosine similarity with threshold 0.72
 * Graph: Neo4j traversal for entity context
 *
 * If Neo4j is unavailable, automatically falls back to vector-only.
 */
export class HybridRetriever {
  private neo4jClient: Neo4jClient
  private graphOps: GraphOperations
  private prisma: PrismaClient

  constructor(options: { neo4jClient?: Neo4jClient | undefined; prisma: PrismaClient }) {
    this.neo4jClient = options.neo4jClient ?? new Neo4jClient()
    this.graphOps = new GraphOperations(this.neo4jClient)
    this.prisma = options.prisma
  }

  /**
   * Retrieve relevant context from both vector store and knowledge graph.
   * Runs both in parallel for speed.
   */
  async retrieve(
    query: DecomposedQuery,
    userId: string,
    clientId: string | null,
    queryEmbedding: number[],
    dealId?: string | null
  ): Promise<{ chunks: RetrievedChunk[]; graphInsights: GraphInsight[] }> {
    // Run vector search and graph traversal in parallel
    const [chunks, graphInsights] = await Promise.all([
      this.vectorSearch(query, userId, clientId, queryEmbedding, dealId),
      this.graphTraversal(query),
    ])

    return { chunks, graphInsights }
  }

  /**
   * Vector search via pgvector cosine similarity.
   * Filters by userId, optionally by clientId, dealId, and temporal range.
   */
  private async vectorSearch(
    query: DecomposedQuery,
    userId: string,
    clientId: string | null,
    queryEmbedding: number[],
    dealId?: string | null
  ): Promise<RetrievedChunk[]> {
    const allChunks: RetrievedChunk[] = []

    // Search for each decomposed vector query
    for (const vectorQuery of query.vectorQueries) {
      try {
        const vectorStr = `[${queryEmbedding.join(',')}]`

        // Build query with optional client filter
        let sql = `
          SELECT
            dc.id AS chunk_id,
            dc.document_id,
            dc.content,
            1 - (dc.embedding <=> $1::vector) AS similarity,
            kd.title AS source_title,
            kd.source_type,
            kd.client_id,
            dc.created_at::text,
            dc.metadata::text
          FROM document_chunks dc
          JOIN knowledge_documents kd ON kd.id = dc.document_id
          WHERE kd.user_id = $2
          AND dc.embedding IS NOT NULL
          AND 1 - (dc.embedding <=> $1::vector) >= $3
        `
        const params: unknown[] = [vectorStr, userId, VECTOR_SIMILARITY_THRESHOLD]

        if (clientId) {
          sql += ` AND kd.client_id = $${params.length + 1}`
          params.push(clientId)
        } else {
          // Null clientId means unscoped session — only return unscoped documents.
          // Without this, a null clientId would return documents from ALL clients.
          sql += ` AND kd.client_id IS NULL`
        }

        if (dealId) {
          sql += ` AND kd.deal_id = $${params.length + 1}`
          params.push(dealId)
        }

        // Temporal filter — applied to document_chunks.created_at (timestamptz)
        // Uses parameterized placeholders to prevent SQL injection
        if (query.temporalFilter?.after !== undefined) {
          sql += ` AND dc.created_at >= $${params.length + 1}::timestamptz`
          params.push(query.temporalFilter.after)
        }
        if (query.temporalFilter?.before !== undefined) {
          sql += ` AND dc.created_at <= $${params.length + 1}::timestamptz`
          params.push(query.temporalFilter.before)
        }

        sql += ` ORDER BY similarity DESC LIMIT $${params.length + 1}`
        params.push(DEFAULT_VECTOR_LIMIT)

        const rows = await this.prisma.$queryRawUnsafe(sql, ...params) as VectorSearchRow[]

        for (const row of rows) {
          if (!allChunks.some((c) => c.chunkId === row.chunk_id)) {
            let metadata: Record<string, unknown> = {}
            try { metadata = JSON.parse(row.metadata as unknown as string) as Record<string, unknown> } catch { /* ignore */ }

            allChunks.push({
              chunkId: row.chunk_id,
              documentId: row.document_id,
              content: row.content,
              similarity: Number(row.similarity),
              sourceTitle: row.source_title,
              sourceType: row.source_type,
              clientId: row.client_id,
              createdAt: row.created_at,
              metadata,
            })
          }
        }

        void vectorQuery
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        console.error(`[HybridRetriever] Vector search failed: ${errorMsg}`)
      }
    }

    return allChunks
  }

  /**
   * Targeted graph query for a specific named entity.
   *
   * Used by RAGEngine.queryGraphForEntity() to pull entity-specific relationships
   * for knowledge graph provenance blocks in IC memo sections.
   *
   * Returns [] if Neo4j is unavailable (graceful degradation — never throws).
   */
  async queryGraphEntity(
    entityName: string,
    relationshipTypes?: string[],
    depth: number = 2
  ): Promise<GraphInsight[]> {
    if (!this.neo4jClient.isAvailable()) return []

    try {
      const result = await this.graphOps.findRelated(
        entityName,
        depth,
        relationshipTypes && relationshipTypes.length > 0
          ? relationshipTypes as Array<
              'COMPETES_WITH' | 'USES_TECHNOLOGY' | 'WORKS_AT' | 'MENTIONED_IN' |
              'DEPENDS_ON' | 'BLOCKS' | 'INFLUENCES' | 'CONFLICTS_WITH' |
              'PART_OF' | 'LEADS_TO' | 'REPORTS_TO'
            >
          : undefined
      )

      if (!result) return []

      const relationships = result.relationships.map((r) => ({
        type: r.relationship.type,
        targetName: r.targetNode.name,
        targetType: 'label' in r.targetNode
          ? (r.targetNode as { label: string }).label
          : 'Unknown',
        properties: Object.fromEntries(
          Object.entries(r.relationship).filter(
            ([k]) => !['type', 'fromId', 'toId'].includes(k)
          )
        ),
      }))

      return [{
        entityName: result.node.name,
        entityType: 'label' in result.node
          ? (result.node as { label: string }).label
          : 'Unknown',
        relationships,
        readableText: relationships
          .map((r) => `${result.node.name} -[${r.type}]-> ${r.targetName} (${r.targetType})`)
          .join('\n'),
      }]
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown'
      console.warn(`[HybridRetriever] queryGraphEntity("${entityName}") failed: ${errorMsg}`)
      return []
    }
  }

  /**
   * Graph traversal via Neo4j for entity context.
   * Returns empty array if Neo4j is unavailable (graceful degradation).
   */
  private async graphTraversal(query: DecomposedQuery): Promise<GraphInsight[]> {
    if (!this.neo4jClient.isAvailable()) {
      console.warn('[HybridRetriever] Neo4j unavailable — vector-only mode')
      return []
    }

    const insights: GraphInsight[] = []

    for (const gq of query.graphQueries) {
      try {
        const result = await this.graphOps.findRelated(
          gq.entityName,
          gq.depth || DEFAULT_GRAPH_DEPTH,
          gq.relationshipTypes.length > 0
            ? gq.relationshipTypes as Array<
                'COMPETES_WITH' | 'USES_TECHNOLOGY' | 'WORKS_AT' | 'MENTIONED_IN' |
                'DEPENDS_ON' | 'BLOCKS' | 'INFLUENCES' | 'CONFLICTS_WITH' |
                'PART_OF' | 'LEADS_TO' | 'REPORTS_TO'
              >
            : undefined
        )

        if (result) {
          const relationships = result.relationships.map((r) => ({
            type: r.relationship.type,
            targetName: r.targetNode.name,
            targetType: 'label' in r.targetNode
              ? (r.targetNode as { label: string }).label
              : 'Unknown',
            properties: Object.fromEntries(
              Object.entries(r.relationship).filter(
                ([k]) => !['type', 'fromId', 'toId'].includes(k)
              )
            ),
          }))

          const readableLines = relationships.map(
            (r) => `${result.node.name} -[${r.type}]-> ${r.targetName} (${r.targetType})`
          )

          insights.push({
            entityName: result.node.name,
            entityType: 'label' in result.node
              ? (result.node as { label: string }).label
              : 'Unknown',
            relationships,
            readableText: readableLines.join('\n'),
          })
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        console.warn(`[HybridRetriever] Graph query for "${gq.entityName}" failed: ${errorMsg}`)
      }
    }

    // Also look up focused entities that aren't in graph queries
    for (const entity of query.entityFocus) {
      if (insights.some((i) => i.entityName === entity)) continue

      try {
        const result = await this.graphOps.findRelated(entity, DEFAULT_GRAPH_DEPTH)
        if (result && result.relationships.length > 0) {
          insights.push({
            entityName: result.node.name,
            entityType: 'label' in result.node
              ? (result.node as { label: string }).label
              : 'Unknown',
            relationships: result.relationships.map((r) => ({
              type: r.relationship.type,
              targetName: r.targetNode.name,
              targetType: 'label' in r.targetNode
                ? (r.targetNode as { label: string }).label
                : 'Unknown',
              properties: {},
            })),
            readableText: result.relationships
              .map((r) => `${result.node.name} -[${r.relationship.type}]-> ${r.targetNode.name}`)
              .join('\n'),
          })
        }
      } catch {
        // Skip failed entity lookups
      }
    }

    return insights
  }
}
