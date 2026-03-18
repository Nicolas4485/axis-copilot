// RAG system type definitions

/** Decomposed query for multi-source retrieval */
export interface DecomposedQuery {
  /** Original user query */
  original: string
  /** Queries optimised for vector search */
  vectorQueries: string[]
  /** Queries optimised for graph traversal */
  graphQueries: GraphQuery[]
  /** Entities to focus retrieval on */
  entityFocus: string[]
  /** Temporal filter (e.g. "last 30 days", "Q1 2026") */
  temporalFilter: TemporalFilter | null
}

export interface GraphQuery {
  entityName: string
  relationshipTypes: string[]
  depth: number
}

export interface TemporalFilter {
  after?: string | undefined   // ISO 8601
  before?: string | undefined  // ISO 8601
  label: string    // human-readable: "last week", "Q1 2026"
}

/** A chunk retrieved from vector search */
export interface RetrievedChunk {
  chunkId: string
  documentId: string
  content: string
  similarity: number
  sourceTitle: string
  sourceType: string
  clientId: string | null
  createdAt: string
  metadata: Record<string, unknown>
}

/** Graph context from Neo4j traversal */
export interface GraphInsight {
  entityName: string
  entityType: string
  relationships: Array<{
    type: string
    targetName: string
    targetType: string
    properties: Record<string, unknown>
  }>
  readableText: string
}

/** A conflict detected between sources */
export interface RAGConflict {
  entityName: string
  property: string
  valueA: string
  valueB: string
  sourceA: string
  sourceB: string
}

/** Citation tracking a source back to its origin */
export interface Citation {
  chunkId: string
  documentId: string
  sourceTitle: string
  content: string
  relevanceScore: number
}

/** Scored and ranked retrieval result */
export interface ScoredChunk extends RetrievedChunk {
  /** Final composite score after reranking */
  finalScore: number
  /** Breakdown of score components */
  scoreBreakdown: {
    similarity: number
    recency: number
    sourceWeight: number
    clientBoost: number
    conflictPenalty: number
  }
}

/** Final RAG result returned to the agent */
export interface RAGResult {
  /** Compressed context block ready for agent consumption */
  context: string
  /** Source citations for attribution */
  citations: Citation[]
  /** Detected conflicts between sources */
  conflicts: RAGConflict[]
  /** Graph-derived insights */
  graphInsights: GraphInsight[]
  /** Token count of the assembled context */
  tokensUsed: number
  /** Retrieval metadata */
  metadata: {
    vectorChunksFound: number
    graphEntitiesFound: number
    totalChunksBeforeRerank: number
    totalChunksAfterRerank: number
    retrievalMs: number
  }
}
