// Context Compressor — 5-level compression to target token count
// Outputs a ---KNOWLEDGE CONTEXT--- block with inline citations and conflict warnings

import type { ScoredChunk, GraphInsight, RAGConflict, Citation } from './types.js'

/** Approximate tokens from character count */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Compression levels, from least to most aggressive */
enum CompressionLevel {
  NONE = 0,          // Full chunks, all graph context
  TRIM_LOW = 1,      // Drop chunks below score threshold
  TRUNCATE = 2,      // Truncate long chunks to 300 chars
  SUMMARISE = 3,     // Merge related chunks into summaries
  AGGRESSIVE = 4,    // Key sentences only, minimal graph
}

/**
 * ContextCompressor assembles a ---KNOWLEDGE CONTEXT--- block that fits within
 * a target token budget. Uses 5 levels of progressive compression:
 *
 * Level 0: Full chunks + full graph context
 * Level 1: Drop chunks with finalScore < 0.3
 * Level 2: Truncate chunks to first 300 characters
 * Level 3: Merge related chunks into paragraph summaries
 * Level 4: Extract key sentences only, minimal graph
 */
export class ContextCompressor {
  /**
   * Compress retrieval results into a context block within the token budget.
   * Returns the formatted context and extracted citations.
   */
  compress(
    chunks: ScoredChunk[],
    graphInsights: GraphInsight[],
    conflicts: RAGConflict[],
    targetTokens: number = 4000
  ): { context: string; citations: Citation[]; tokensUsed: number } {
    // Try each compression level until we fit within budget
    for (let level = CompressionLevel.NONE; level <= CompressionLevel.AGGRESSIVE; level++) {
      const result = this.buildContext(chunks, graphInsights, conflicts, level)
      const tokens = estimateTokens(result.context)

      if (tokens <= targetTokens) {
        return { ...result, tokensUsed: tokens }
      }
    }

    // Even aggressive compression didn't fit — hard truncate
    const result = this.buildContext(chunks, graphInsights, conflicts, CompressionLevel.AGGRESSIVE)
    const truncated = result.context.slice(0, targetTokens * 4)
    return {
      context: truncated,
      citations: result.citations,
      tokensUsed: estimateTokens(truncated),
    }
  }

  private buildContext(
    chunks: ScoredChunk[],
    graphInsights: GraphInsight[],
    conflicts: RAGConflict[],
    level: CompressionLevel
  ): { context: string; citations: Citation[] } {
    const parts: string[] = []
    const citations: Citation[] = []

    parts.push('---KNOWLEDGE CONTEXT---')
    parts.push('')

    // Conflict warnings first (always included)
    if (conflicts.length > 0) {
      parts.push('⚠️ CONFLICTING INFORMATION:')
      for (const conflict of conflicts) {
        parts.push(
          `  - ${conflict.entityName}.${conflict.property}: ` +
          `"${conflict.valueA}" [${conflict.sourceA}] vs ` +
          `"${conflict.valueB}" [${conflict.sourceB}]`
        )
      }
      parts.push('')
    }

    // Graph insights
    const graphSection = this.buildGraphSection(graphInsights, level)
    if (graphSection) {
      parts.push(graphSection)
      parts.push('')
    }

    // Document chunks with inline citations
    const filteredChunks = this.filterChunks(chunks, level)
    if (filteredChunks.length > 0) {
      parts.push('RETRIEVED SOURCES:')
      parts.push('')

      for (let i = 0; i < filteredChunks.length; i++) {
        const chunk = filteredChunks[i]
        if (!chunk) continue
        const citationId = `[${i + 1}]`
        const content = this.formatChunkContent(chunk, level)

        parts.push(`${citationId} ${chunk.sourceTitle} (score: ${chunk.finalScore.toFixed(2)})`)
        parts.push(content)
        parts.push('')

        citations.push({
          chunkId: chunk.chunkId,
          documentId: chunk.documentId,
          sourceTitle: chunk.sourceTitle,
          content: chunk.content.slice(0, 200),
          relevanceScore: chunk.finalScore,
        })
      }
    }

    parts.push('---END KNOWLEDGE CONTEXT---')

    return { context: parts.join('\n'), citations }
  }

  private filterChunks(chunks: ScoredChunk[], level: CompressionLevel): ScoredChunk[] {
    switch (level) {
      case CompressionLevel.NONE:
        return chunks
      case CompressionLevel.TRIM_LOW:
        return chunks.filter((c) => c.finalScore >= 0.3)
      case CompressionLevel.TRUNCATE:
        return chunks.filter((c) => c.finalScore >= 0.3)
      case CompressionLevel.SUMMARISE:
        return chunks.filter((c) => c.finalScore >= 0.4).slice(0, 5)
      case CompressionLevel.AGGRESSIVE:
        return chunks.filter((c) => c.finalScore >= 0.5).slice(0, 3)
    }
  }

  private formatChunkContent(chunk: ScoredChunk, level: CompressionLevel): string {
    switch (level) {
      case CompressionLevel.NONE:
      case CompressionLevel.TRIM_LOW:
        return chunk.content

      case CompressionLevel.TRUNCATE:
        if (chunk.content.length > 300) {
          return chunk.content.slice(0, 300) + '...'
        }
        return chunk.content

      case CompressionLevel.SUMMARISE:
        // Extract first and last sentences
        return this.extractKeySentences(chunk.content, 3)

      case CompressionLevel.AGGRESSIVE:
        // Single most important sentence
        return this.extractKeySentences(chunk.content, 1)
    }
  }

  private buildGraphSection(
    insights: GraphInsight[],
    level: CompressionLevel
  ): string | null {
    if (insights.length === 0) return null

    const parts: string[] = ['KNOWLEDGE GRAPH:']

    const maxInsights = level >= CompressionLevel.AGGRESSIVE ? 2 :
      level >= CompressionLevel.SUMMARISE ? 3 : insights.length

    for (const insight of insights.slice(0, maxInsights)) {
      parts.push(`  ${insight.entityName} (${insight.entityType}):`)

      const maxRels = level >= CompressionLevel.AGGRESSIVE ? 3 :
        level >= CompressionLevel.SUMMARISE ? 5 : insight.relationships.length

      for (const rel of insight.relationships.slice(0, maxRels)) {
        parts.push(`    → ${rel.type} → ${rel.targetName} (${rel.targetType})`)
      }
    }

    return parts.join('\n')
  }

  private extractKeySentences(text: string, count: number): string {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 20)
    if (sentences.length <= count) return text
    return sentences.slice(0, count).join('. ').trim() + '.'
  }
}
