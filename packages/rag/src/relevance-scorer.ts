// Relevance Scorer — binary classifier for passage relevance to query
// Uses Claude Haiku to score whether each chunk answers the query

import { InferenceEngine } from '@axis/inference'
import type { RetrievedChunk, ScoredChunk } from './types.js'

/**
 * RelevanceScorer scores each chunk with a binary classifier:
 * "Does this chunk answer the query? Yes/No"
 * 
 * Filters out chunks that score No, keeping only highly relevant passages.
 */
export class RelevanceScorer {
  private engine: InferenceEngine

  constructor(engine?: InferenceEngine) {
    this.engine = engine ?? new InferenceEngine()
  }

  /**
   * Score chunks for relevance to the query.
   * Filters out chunks that don't answer the query.
   */
  async scoreChunks(
    query: string,
    chunks: RetrievedChunk[]
  ): Promise<RetrievedChunk[]> {
    const relevantChunks: RetrievedChunk[] = []

    for (const chunk of chunks) {
      try {
        const isRelevant = await this.scoreChunk(query, chunk)
        if (isRelevant) {
          relevantChunks.push(chunk)
        } else {
          console.log(`[RelevanceScorer] Filtered out chunk ${chunk.chunkId} (not relevant)`)
        }
      } catch (err) {
        console.warn(`[RelevanceScorer] Failed to score chunk ${chunk.chunkId}: ${err instanceof Error ? err.message : 'Unknown'}`)
        // On error, include the chunk (conservative approach)
        relevantChunks.push(chunk)
      }
    }

    return relevantChunks
  }

  /**
   * Score a single chunk for relevance to the query.
   * Returns true if Claude thinks the chunk answers the query.
   */
  private async scoreChunk(query: string, chunk: RetrievedChunk): Promise<boolean> {
    const response = await this.engine.route('relevance_score', {
      systemPromptKey: 'ENTITY_VERIFY', // Reuse simple prompt
      messages: [{
        role: 'user',
        content: `Does this chunk answer the following query? Reply YES or NO.

Query: ${query}

Chunk: ${chunk.content.slice(0, 500)}`,
      }],
      maxTokens: 10,
    })

    const text = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
      .toUpperCase()

    return text.includes('YES')
  }
}
