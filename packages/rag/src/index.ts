// RAG Engine — @axis/rag
// Orchestrates query decomposition, hybrid retrieval, relevance scoring, reranking,
// context compression, and citation tracking

import { InferenceEngine } from '@axis/inference'
import { Neo4jClient } from '@axis/knowledge-graph'
import { QueryDecomposer } from './query-decomposer.js'
import { HybridRetriever } from './hybrid-retriever.js'
import { RelevanceScorer } from './relevance-scorer.js'
import { Reranker } from './reranker.js'
import { ContextCompressor } from './context-compressor.js'
import { CitationTracker } from './citation-tracker.js'
import type { RAGResult, RAGConflict, RetrievedChunk } from './types.js'

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
export { RelevanceScorer } from './relevance-scorer.js'
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
 * 4. Score chunks for relevance to query (binary classifier)
 * 5. Detect conflicts between sources
 * 6. Rerank with composite scoring
 * 7. Compress context to fit token budget
 * 8. Return context, citations, conflicts, graph insights
 */
export class RAGEngine {
  private decomposer: QueryDecomposer
  private retriever: HybridRetriever
  private relevanceScorer: RelevanceScorer
  private reranker: Reranker
  private compressor: ContextCompressor
  private citationTracker: CitationTracker
  private engine: InferenceEngine

  constructor(options: {
    engine?: InferenceEngine | undefined
    neo4jClient?: Neo4jClient | undefined
    prisma: import('@prisma/client').PrismaClient
  }) {
    this.engine = options.engine ?? new InferenceEngine()
    this.decomposer = new QueryDecomposer(this.engine)
    this.retriever = new HybridRetriever({
      neo4jClient: options.neo4jClient,
      prisma: options.prisma,
    })
    this.relevanceScorer = new RelevanceScorer(this.engine)
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

    // Step 2: Generate query embedding via Voyage AI
    const queryEmbedding = await this.embedQuery(userQuery)

    // Step 3: Parallel vector + graph retrieval
    let { chunks, graphInsights } = await this.retriever.retrieve(
      decomposed,
      userId,
      clientId,
      queryEmbedding
    )

    // Step 4: Score chunks for passage-level relevance
    const relevantChunks = await this.relevanceScorer.scoreChunks(userQuery, chunks)
    console.log(`[RAGEngine] Relevance scoring: ${chunks.length} → ${relevantChunks.length} chunks`)
    chunks = relevantChunks

    // Step 5: Detect conflicts between retrieved chunks
    const conflicts = this.detectConflicts(chunks)

    // Step 6: Rerank with composite scoring
    const rankedChunks = this.reranker.rerank(chunks, {
      targetClientId: clientId,
      conflicts,
      limit: maxChunks,
    })

    // Step 7: Compress context to fit token budget
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
   *
   * Strategy:
   * 1. Run regex patterns against each chunk to extract (property, value) pairs
   * 2. Associate each fact with the nearest entity mention (multi-word proper noun)
   * 3. Group facts by (entity, property) across all chunks
   * 4. Flag contradictions where the same entity+property has different values
   *    from different document sources
   */
  private detectConflicts(chunks: RetrievedChunk[]): RAGConflict[] {
    // Patterns: each extracts a single capture group — the property value
    const PATTERNS: ReadonlyArray<{ readonly property: string; readonly source: string }> = [
      { property: 'revenue',     source: String.raw`revenue\s*(?:is|was|of|:)\s*\$?([\d,.]+\s*(?:billion|million|thousand|[BMKbmk])?)` },
      { property: 'ARR',         source: String.raw`(?:ARR|annual recurring revenue)\s*(?:is|of|:)\s*\$?([\d,.]+\s*(?:billion|million|[BMb])?)` },
      { property: 'valuation',   source: String.raw`valuation\s*(?:of|is|:)\s*\$?([\d,.]+\s*(?:billion|million|[BMb])?)` },
      { property: 'funding',     source: String.raw`(?:raised|total funding)\s+(?:of\s+)?\$?([\d,.]+\s*(?:billion|million|[BMb])?)` },
      { property: 'employees',   source: String.raw`(?:has\s+)?([\d,]+)\s+employees` },
      { property: 'headcount',   source: String.raw`headcount\s*(?:of|is|:)\s*([\d,]+)` },
      { property: 'CEO',         source: String.raw`CEO\s*(?:is|was|:)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)` },
      { property: 'CTO',         source: String.raw`CTO\s*(?:is|was|:)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)` },
      { property: 'CFO',         source: String.raw`CFO\s*(?:is|was|:)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)` },
      { property: 'founder',     source: String.raw`founded\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)` },
      { property: 'founded',     source: String.raw`founded\s+in\s+(\d{4})` },
      { property: 'headquarters', source: String.raw`headquartered\s+in\s+([A-Za-z][a-zA-Z\s]+?)(?=\s*[.,\n])` },
    ]

    // Entity candidates: two or more consecutive capitalised words
    const ENTITY_RE = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,4})\b/g

    interface ChunkFact {
      entity: string
      property: string
      value: string
      documentId: string
      sourceTitle: string
    }

    const facts: ChunkFact[] = []

    for (const chunk of chunks) {
      // Collect entity candidate positions for this chunk
      const entityCandidates: Array<{ name: string; pos: number }> = []
      const entityRe = new RegExp(ENTITY_RE.source, 'g')
      let em: RegExpExecArray | null
      while ((em = entityRe.exec(chunk.content)) !== null) {
        entityCandidates.push({ name: em[1] as string, pos: em.index })
      }

      for (const { property, source } of PATTERNS) {
        const re = new RegExp(source, 'gi')
        let m: RegExpExecArray | null
        while ((m = re.exec(chunk.content)) !== null) {
          const rawValue = m[1]?.trim()
          if (!rawValue) continue
          // Normalise: lowercase + strip thousands separators
          const normValue = rawValue.toLowerCase().replace(/,/g, '')

          // Find the closest preceding entity candidate within 300 chars
          let entity = 'unnamed'
          let bestDist = Infinity
          for (const candidate of entityCandidates) {
            const dist = m.index - candidate.pos
            if (dist > 0 && dist < 300 && dist < bestDist) {
              bestDist = dist
              entity = candidate.name
            }
          }

          facts.push({
            entity: entity.toLowerCase(),
            property,
            value: normValue,
            documentId: chunk.documentId,
            sourceTitle: chunk.sourceTitle,
          })
        }
      }
    }

    // Group facts by (entity, property), then by documentId (keep first per doc)
    const grouped = new Map<string, Map<string, ChunkFact>>()
    for (const fact of facts) {
      const key = `${fact.entity}::${fact.property}`
      if (!grouped.has(key)) grouped.set(key, new Map<string, ChunkFact>())
      const byDoc = grouped.get(key) as Map<string, ChunkFact>
      // First occurrence per document wins
      if (!byDoc.has(fact.documentId)) byDoc.set(fact.documentId, fact)
    }

    const conflicts: RAGConflict[] = []

    for (const [key, byDoc] of grouped) {
      const separatorIdx = key.indexOf('::')
      const entityName = key.slice(0, separatorIdx)
      const property = key.slice(separatorIdx + 2)
      const docFacts = [...byDoc.values()]

      for (let i = 0; i < docFacts.length; i++) {
        for (let j = i + 1; j < docFacts.length; j++) {
          const a = docFacts[i] as ChunkFact
          const b = docFacts[j] as ChunkFact
          if (a.value === b.value) continue

          // Avoid duplicate conflict entries for the same entity+property pair
          const alreadyRecorded = conflicts.some(
            (c) => c.entityName === entityName && c.property === property
          )
          if (alreadyRecorded) continue

          conflicts.push({
            entityName,
            property,
            valueA: a.value,
            valueB: b.value,
            sourceA: a.sourceTitle,
            sourceB: b.sourceTitle,
            sourceValue: a.value,
            conflictingValue: b.value,
          })
        }
      }
    }

    return conflicts
  }

  /** Embed a query string via Voyage AI for vector search */
  private async embedQuery(query: string): Promise<number[]> {
    const voyageKey = process.env['VOYAGE_API_KEY']
    if (!voyageKey) {
      console.warn('[RAGEngine] VOYAGE_API_KEY not set — vector search will fail')
      return new Array(512).fill(0) as number[]
    }

    try {
      const response = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${voyageKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: [query],
          model: 'voyage-3-lite',
          input_type: 'query',
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[RAGEngine] Voyage AI error ${response.status}: ${errorText}`)
        return new Array(512).fill(0) as number[]
      }

      const data = await response.json() as {
        data: Array<{ embedding: number[] }>
      }

      return data.data[0]?.embedding ?? new Array(512).fill(0) as number[]
    } catch (err) {
      console.error(`[RAGEngine] Voyage AI failed: ${err instanceof Error ? err.message : 'Unknown'}`)
      return new Array(512).fill(0) as number[]
    }
  }
}
