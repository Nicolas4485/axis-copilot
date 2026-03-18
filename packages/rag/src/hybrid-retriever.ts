// Hybrid Retriever — parallel vector search + graph traversal
// Neo4j unavailable = automatic vector-only fallback

import { Neo4jClient, GraphOperations } from '@axis/knowledge-graph'
import type { DecomposedQuery, RetrievedChunk, GraphInsight } from './types.js'

const VECTOR_SIMILARITY_THRESHOLD = 0.72
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

  constructor(neo4jClient?: Neo4jClient) {
    this.neo4jClient = neo4jClient ?? new Neo4jClient()
    this.graphOps = new GraphOperations(this.neo4jClient)
  }

  /**
   * Retrieve relevant context from both vector store and knowledge graph.
   * Runs both in parallel for speed.
   */
  async retrieve(
    query: DecomposedQuery,
    userId: string,
    clientId: string | null,
    queryEmbedding: number[]
  ): Promise<{ chunks: RetrievedChunk[]; graphInsights: GraphInsight[] }> {
    // Run vector search and graph traversal in parallel
    const [chunks, graphInsights] = await Promise.all([
      this.vectorSearch(query, userId, clientId, queryEmbedding),
      this.graphTraversal(query),
    ])

    return { chunks, graphInsights }
  }

  /**
   * Vector search via pgvector cosine similarity.
   * Filters by userId, optionally by clientId and temporal range.
   */
  private async vectorSearch(
    query: DecomposedQuery,
    userId: string,
    clientId: string | null,
    queryEmbedding: number[]
  ): Promise<RetrievedChunk[]> {
    const allChunks: RetrievedChunk[] = []

    // Search for each decomposed vector query
    for (const vectorQuery of query.vectorQueries) {
      try {
        // TODO: Execute pgvector cosine similarity search
        // const result = await prisma.$queryRaw`
        //   SELECT
        //     dc.id AS chunk_id,
        //     dc."documentId" AS document_id,
        //     dc.content,
        //     1 - (dc.embedding <=> ${queryEmbedding}::vector) AS similarity,
        //     kd.title AS source_title,
        //     kd."sourceType" AS source_type,
        //     kd."clientId" AS client_id,
        //     dc."createdAt" AS created_at,
        //     dc.metadata
        //   FROM "DocumentChunk" dc
        //   JOIN "KnowledgeDocument" kd ON kd.id = dc."documentId"
        //   WHERE kd."userId" = ${userId}
        //   AND 1 - (dc.embedding <=> ${queryEmbedding}::vector) >= ${VECTOR_SIMILARITY_THRESHOLD}
        //   ${clientId ? Prisma.sql`AND kd."clientId" = ${clientId}` : Prisma.empty}
        //   ${query.temporalFilter?.after ? Prisma.sql`AND dc."createdAt" >= ${query.temporalFilter.after}` : Prisma.empty}
        //   ${query.temporalFilter?.before ? Prisma.sql`AND dc."createdAt" <= ${query.temporalFilter.before}` : Prisma.empty}
        //   ORDER BY similarity DESC
        //   LIMIT ${DEFAULT_VECTOR_LIMIT}
        // `

        // Placeholder — returns empty until Prisma queries are wired
        const rows: VectorSearchRow[] = []

        for (const row of rows) {
          // Deduplicate by chunk_id
          if (!allChunks.some((c) => c.chunkId === row.chunk_id)) {
            allChunks.push({
              chunkId: row.chunk_id,
              documentId: row.document_id,
              content: row.content,
              similarity: row.similarity,
              sourceTitle: row.source_title,
              sourceType: row.source_type,
              clientId: row.client_id,
              createdAt: row.created_at,
              metadata: row.metadata,
            })
          }
        }

        void vectorQuery
        void queryEmbedding
        void userId
        void clientId
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        console.error(`[HybridRetriever] Vector search failed: ${errorMsg}`)
      }
    }

    return allChunks
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
