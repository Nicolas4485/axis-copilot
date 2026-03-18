// Query Decomposer — breaks a user query into vector, graph, and temporal components
// Uses Qwen3 via InferenceEngine for intelligent decomposition

import { InferenceEngine } from '@axis/inference'
import type { DecomposedQuery, GraphQuery, TemporalFilter } from './types.js'

/**
 * Decomposes a natural language query into structured retrieval targets.
 *
 * Example: "What did Acme Corp's CTO say about React migration in our last meeting?"
 * → vectorQueries: ["Acme Corp CTO React migration", "React migration discussion"]
 * → graphQueries: [{ entityName: "Acme Corp", relationshipTypes: ["WORKS_AT"], depth: 2 }]
 * → entityFocus: ["Acme Corp", "React"]
 * → temporalFilter: { label: "most recent meeting" }
 */
export class QueryDecomposer {
  private engine: InferenceEngine

  constructor(engine?: InferenceEngine) {
    this.engine = engine ?? new InferenceEngine()
  }

  /**
   * Decompose a query into retrieval-optimised components.
   * Falls back to simple vector query if decomposition fails.
   */
  async decompose(
    query: string,
    context?: { clientId?: string | undefined; clientName?: string | undefined }
  ): Promise<DecomposedQuery> {
    try {
      const response = await this.engine.route('classify', {
        systemPromptKey: 'MICRO_CLASSIFY',
        messages: [{
          role: 'user',
          content: `Decompose this query for a RAG retrieval system. Return JSON:
{
  "vectorQueries": ["query1", "query2"],
  "graphQueries": [{"entityName": "...", "relationshipTypes": ["..."], "depth": 2}],
  "entityFocus": ["entity1", "entity2"],
  "temporalFilter": {"after": "ISO date or null", "before": "ISO date or null", "label": "description"} or null
}

${context?.clientName ? `Current client: ${context.clientName}` : ''}
Query: ${query}`,
        }],
        maxTokens: 300,
      })

      const text = response.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('')

      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch?.[0]) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          vectorQueries?: string[]
          graphQueries?: Array<{ entityName: string; relationshipTypes: string[]; depth: number }>
          entityFocus?: string[]
          temporalFilter?: { after?: string; before?: string; label: string } | null
        }

        return {
          original: query,
          vectorQueries: parsed.vectorQueries ?? [query],
          graphQueries: (parsed.graphQueries ?? []) as GraphQuery[],
          entityFocus: parsed.entityFocus ?? [],
          temporalFilter: parsed.temporalFilter
            ? this.normaliseTemporalFilter(parsed.temporalFilter)
            : null,
        }
      }
    } catch {
      // Decomposition failed — fall through to simple fallback
    }

    return this.simpleFallback(query)
  }

  /** Simple fallback: use the query as-is for vector search, extract obvious entities */
  private simpleFallback(query: string): DecomposedQuery {
    const entityFocus = this.extractObviousEntities(query)

    return {
      original: query,
      vectorQueries: [query],
      graphQueries: entityFocus.map((name) => ({
        entityName: name,
        relationshipTypes: [],
        depth: 2,
      })),
      entityFocus,
      temporalFilter: null,
    }
  }

  /** Extract capitalised multi-word names as likely entities */
  private extractObviousEntities(query: string): string[] {
    const entities: string[] = []
    // Match capitalised multi-word names (e.g. "Acme Corp", "John Smith")
    const pattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g
    let match: RegExpExecArray | null
    while ((match = pattern.exec(query)) !== null) {
      if (match[1]) entities.push(match[1])
    }
    return entities
  }

  /** Normalise temporal filter, handling relative dates */
  private normaliseTemporalFilter(
    raw: { after?: string; before?: string; label: string }
  ): TemporalFilter {
    return {
      ...(raw.after ? { after: raw.after } : {}),
      ...(raw.before ? { before: raw.before } : {}),
      label: raw.label,
    }
  }
}
