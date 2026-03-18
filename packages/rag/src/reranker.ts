// Reranker — composite scoring for retrieved chunks
// Score = similarity × recency × source_weight × client_boost × conflict_penalty

import type { RetrievedChunk, ScoredChunk, RAGConflict } from './types.js'

/** Weights for each scoring component */
const WEIGHTS = {
  similarity: 0.40,
  recency: 0.20,
  sourceWeight: 0.15,
  clientBoost: 0.15,
  conflictPenalty: 0.10,
} as const

/** Source type reliability weights */
const SOURCE_WEIGHTS: Record<string, number> = {
  GDRIVE: 0.9,
  UPLOAD: 0.85,
  WEB: 0.6,
  MANUAL: 0.7,
}

/** How many days until recency score reaches 0.5 */
const RECENCY_HALF_LIFE_DAYS = 90

/**
 * Reranker scores and sorts retrieved chunks using a composite formula:
 *
 *   finalScore = (similarity × W_sim) + (recency × W_rec) + (source_weight × W_src)
 *              + (client_boost × W_cli) - (conflict_penalty × W_con)
 *
 * This ensures we prioritise:
 * 1. Semantically relevant content (similarity)
 * 2. Fresh information (recency)
 * 3. Trusted sources (source weight)
 * 4. Client-specific data (client boost)
 * 5. Non-conflicting data (conflict penalty)
 */
export class Reranker {
  /**
   * Score and sort chunks. Returns top N after reranking.
   */
  rerank(
    chunks: RetrievedChunk[],
    options: {
      targetClientId: string | null
      conflicts: RAGConflict[]
      limit?: number | undefined
    }
  ): ScoredChunk[] {
    const conflictedSources = new Set<string>()
    for (const conflict of options.conflicts) {
      conflictedSources.add(conflict.sourceA)
      conflictedSources.add(conflict.sourceB)
    }

    const scored: ScoredChunk[] = chunks.map((chunk) => {
      const similarity = this.normaliseSimilarity(chunk.similarity)
      const recency = this.computeRecency(chunk.createdAt)
      const sourceWeight = this.computeSourceWeight(chunk.sourceType)
      const clientBoost = this.computeClientBoost(chunk.clientId, options.targetClientId)
      const conflictPenalty = conflictedSources.has(chunk.documentId) ? 1.0 : 0.0

      const finalScore =
        similarity * WEIGHTS.similarity +
        recency * WEIGHTS.recency +
        sourceWeight * WEIGHTS.sourceWeight +
        clientBoost * WEIGHTS.clientBoost -
        conflictPenalty * WEIGHTS.conflictPenalty

      return {
        ...chunk,
        finalScore: Math.max(0, Math.min(1, finalScore)),
        scoreBreakdown: {
          similarity,
          recency,
          sourceWeight,
          clientBoost,
          conflictPenalty,
        },
      }
    })

    // Sort by finalScore descending
    scored.sort((a, b) => b.finalScore - a.finalScore)

    // Return top N
    const limit = options.limit ?? 10
    return scored.slice(0, limit)
  }

  /**
   * Normalise similarity to 0-1 range.
   * Raw cosine similarity from pgvector is already 0-1,
   * but we apply a floor at threshold to spread the range.
   */
  private normaliseSimilarity(similarity: number): number {
    const floor = 0.72 // Our retrieval threshold
    if (similarity <= floor) return 0
    return (similarity - floor) / (1 - floor)
  }

  /**
   * Compute recency score using exponential decay.
   * Score = exp(-age_days × ln(2) / half_life)
   * Today = 1.0, 90 days ago = 0.5, 180 days ago = 0.25
   */
  private computeRecency(createdAt: string): number {
    const now = Date.now()
    const created = new Date(createdAt).getTime()
    const ageDays = (now - created) / (1000 * 60 * 60 * 24)

    if (ageDays <= 0) return 1.0
    return Math.exp(-ageDays * Math.LN2 / RECENCY_HALF_LIFE_DAYS)
  }

  /**
   * Source type reliability weight.
   */
  private computeSourceWeight(sourceType: string): number {
    return SOURCE_WEIGHTS[sourceType] ?? 0.5
  }

  /**
   * Boost chunks from the target client's documents.
   * 1.0 for matching client, 0.3 for general (null clientId), 0.0 for other clients.
   */
  private computeClientBoost(chunkClientId: string | null, targetClientId: string | null): number {
    if (!targetClientId) return 0.5 // No target client — neutral
    if (chunkClientId === targetClientId) return 1.0 // Exact match
    if (!chunkClientId) return 0.3 // General knowledge
    return 0.0 // Different client's data
  }
}
