// Query Decomposer — breaks a user query into vector, graph, and temporal components
// Uses Claude via InferenceEngine for intelligent decomposition
import { InferenceEngine } from '@axis/inference';
/**
 * Decomposes a natural language query into structured retrieval targets.
 *
 * Example: "What did Acme Corp's CTO say about React migration in our last meeting?"
 * → vectorQueries: ["Acme Corp CTO React migration", "React migration discussion", "CTO migration discussion", ...]
 * → graphQueries: [{ entityName: "Acme Corp", relationshipTypes: ["WORKS_AT"], depth: 2 }]
 * → entityFocus: ["Acme Corp", "React"]
 * → temporalFilter: { label: "most recent meeting" }
 */
export class QueryDecomposer {
    engine;
    constructor(engine) {
        this.engine = engine ?? new InferenceEngine();
    }
    /**
     * Decompose a query into retrieval-optimised components.
     * Falls back to simple vector query if decomposition fails.
     */
    async decompose(query, context) {
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
            });
            const text = response.content
                .filter((b) => b.type === 'text')
                .map((b) => b.text)
                .join('');
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch?.[0]) {
                const parsed = JSON.parse(jsonMatch[0]);
                // Expand vector queries with synonyms/variants
                let vectorQueries = parsed.vectorQueries ?? [query];
                vectorQueries = await this.expandQueryVariants(vectorQueries);
                return {
                    original: query,
                    vectorQueries,
                    graphQueries: (parsed.graphQueries ?? []),
                    entityFocus: parsed.entityFocus ?? [],
                    temporalFilter: parsed.temporalFilter
                        ? this.normaliseTemporalFilter(parsed.temporalFilter)
                        : null,
                };
            }
        }
        catch {
            // Decomposition failed — fall through to simple fallback
        }
        return this.simpleFallback(query);
    }
    /** Expand each vector query with 2-3 semantic variants using Claude */
    async expandQueryVariants(queries) {
        const expanded = [];
        expanded.push(...queries); // Keep original queries
        for (const query of queries) {
            try {
                const response = await this.engine.route('query_expansion', {
                    systemPromptKey: 'MICRO_CLASSIFY',
                    messages: [{
                            role: 'user',
                            content: `Generate 2-3 semantic synonyms or alternative phrasings of this query for vector similarity search. Reply with one query per line, no numbering.

Query: ${query}`,
                        }],
                    maxTokens: 150,
                });
                const variants = response.content
                    .filter((b) => b.type === 'text')
                    .map((b) => b.text)
                    .join('')
                    .split('\n')
                    .map((v) => v.trim())
                    .filter((v) => v.length > 3)
                    .slice(0, 3); // Limit to 3 variants per query
                expanded.push(...variants);
            }
            catch (err) {
                console.warn(`[QueryDecomposer] Failed to expand query "${query}": ${err instanceof Error ? err.message : 'Unknown'}`);
                // Continue with unexpanded query
            }
        }
        // Remove duplicates while preserving order
        return Array.from(new Set(expanded));
    }
    /** Simple fallback: use the query as-is for vector search, extract obvious entities */
    simpleFallback(query) {
        const entityFocus = this.extractObviousEntities(query);
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
        };
    }
    /** Extract capitalised multi-word names as likely entities */
    extractObviousEntities(query) {
        const entities = [];
        // Match capitalised multi-word names (e.g. "Acme Corp", "John Smith")
        const pattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
        let match;
        while ((match = pattern.exec(query)) !== null) {
            if (match[1])
                entities.push(match[1]);
        }
        return entities;
    }
    /** Normalise temporal filter, handling relative dates */
    normaliseTemporalFilter(raw) {
        return {
            ...(raw.after ? { after: raw.after } : {}),
            ...(raw.before ? { before: raw.before } : {}),
            label: raw.label,
        };
    }
}
