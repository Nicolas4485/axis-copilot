// RAG Engine — @axis/rag
// Orchestrates query decomposition, hybrid retrieval, reranking,
// context compression, and citation tracking

import { InferenceEngine } from '@axis/inference'
import { Neo4jClient } from '@axis/knowledge-graph'
import { QueryDecomposer } from './query-decomposer.js'
import { HybridRetriever } from './hybrid-retriever.js'
import { Reranker } from './reranker.js'
import { ContextCompressor } from './context-compressor.js'
import { CitationTracker } from './citation-tracker.js'
import type { RAGResult, RAGConflict } from './types.js'

// Re-export types
export type {
  DecomposedQuery,
  GraphQuery,
  TemporalFilter,
  RetrievedChunk,
  GraphInsight,
  RAGConflict,
  Citation,
  ScoredChunk,
  RAGResult,
} from './types.js'

// Re-export components
export { QueryDecomposer } from './query-decomposer.js'
export { HybridRetriever } from './hybrid-retriever.js'
export { Reranker } from './reranker.js'
export { ContextCompressor } from './context-compressor.js'
export { CitationTracker } from './citation-tracker.js'
export type { MessageCitationMetadata } from './citation-tracker.js'

/**
 * RAGEngine — full retrieval-augmented generation pipeline.
 *
 * query() flow:
 * 1. Decompose query into vector + graph + temporal components
 * 2. Generate query embedding
 * 3. Parallel: vector search (pgvector) + graph traversal (Neo4j)
 * 4. Detect conflicts between sources
 * 5. Rerank with composite scoring
 * 6. Compress context to fit token budget
 * 7. Return context, citations, conflicts, graph insights
 */
export class RAGEngine {
  private decomposer: QueryDecomposer
  private retriever: HybridRetriever
  private reranker: Reranker
  private compressor: ContextCompressor
  private citationTracker: CitationTracker
  private engine: InferenceEngine

  constructor(options?: {
    engine?: InferenceEngine | undefined
    neo4jClient?: Neo4jClient | undefined
  }) {
    this.engine = options?.engine ?? new InferenceEngine()
    this.decomposer = new QueryDecomposer(this.engine)
    this.retriever = new HybridRetriever(options?.neo4jClient)
    this.reranker = new Reranker()
    this.compressor = new ContextCompressor()
    this.citationTracker = new CitationTracker()
  }

  /**
   * Run the full RAG pipeline for a user query.
   *
   * Returns assembled context block, citations, conflicts, and graph insights
   * ready for agent consumption.
   */
  async query(
    userQuery: string,
    userId: string,
    clientId: string | null,
    options?: {
      targetTokens?: number | undefined
      maxChunks?: number | undefined
      clientName?: string | undefined
    }
  ): Promise<RAGResult> {
    const startTime = Date.now()
    const targetTokens = options?.targetTokens ?? 4000
    const maxChunks = options?.maxChunks ?? 10

    // Step 1: Decompose query
    const decomposed = await this.decomposer.decompose(userQuery, {
      clientId: clientId ?? undefined,
      clientName: options?.clientName,
    })

    // Step 2: Generate query embedding
    // TODO: Call Voyage AI for query embedding
    // const embedding = await voyageClient.embed({ input: [userQuery], model: 'voyage-3-lite' })
    const queryEmbedding = new Array(1536).fill(0) as number[] // Placeholder

    // Step 3: Parallel vector + graph retrieval
    const { chunks, graphInsights } = await this.retriever.retrieve(
      decomposed,
      userId,
      clientId,
      queryEmbedding
    )

    // Step 4: Detect conflicts between retrieved chunks
    const conflicts = this.detectConflicts(chunks)

    // Step 5: Rerank with composite scoring
    const rankedChunks = this.reranker.rerank(chunks, {
      targetClientId: clientId,
      conflicts,
      limit: maxChunks,
    })

    // Step 6: Compress context to fit token budget
    const { context, citations, tokensUsed } = this.compressor.compress(
      rankedChunks,
      graphInsights,
      conflicts,
      targetTokens
    )

    const retrievalMs = Date.now() - startTime

    return {
      context,
      citations,
      conflicts,
      graphInsights,
      tokensUsed,
      metadata: {
        vectorChunksFound: chunks.length,
        graphEntitiesFound: graphInsights.length,
        totalChunksBeforeRerank: chunks.length,
        totalChunksAfterRerank: rankedChunks.length,
        retrievalMs,
      },
    }
  }

  /** Get the citation tracker for post-processing responses */
  getCitationTracker(): CitationTracker {
    return this.citationTracker
  }

  /**
   * Detect conflicts between retrieved chunks.
   * Looks for chunks from different sources that mention the same entity
   * with contradicting information.
   */
  private detectConflicts(
    chunks: Array<{
      documentId: string
      sourceTitle: string
      content: string
    }>
  ): RAGConflict[] {
    // TODO: Implement sophisticated conflict detection
    // For now, basic deduplication check — full implementation will use
    // entity extraction + property comparison across chunks
    //
    // Strategy:
    // 1. Extract entities from each chunk
    // 2. Group by entity name
    // 3. Compare properties across chunks from different sources
    // 4. Flag contradictions
    void chunks
    return []
  }
}
