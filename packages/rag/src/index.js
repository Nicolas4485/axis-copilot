// RAG Engine — @axis/rag
// Orchestrates query decomposition, hybrid retrieval, relevance scoring, reranking,
// context compression, and citation tracking
import { InferenceEngine } from '@axis/inference';
import { QueryDecomposer } from './query-decomposer.js';
import { HybridRetriever } from './hybrid-retriever.js';
import { RelevanceScorer } from './relevance-scorer.js';
import { Reranker } from './reranker.js';
import { ContextCompressor } from './context-compressor.js';
import { CitationTracker } from './citation-tracker.js';
// Re-export components
export { QueryDecomposer } from './query-decomposer.js';
export { HybridRetriever } from './hybrid-retriever.js';
export { RelevanceScorer } from './relevance-scorer.js';
export { Reranker } from './reranker.js';
export { ContextCompressor } from './context-compressor.js';
export { CitationTracker } from './citation-tracker.js';
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
    decomposer;
    retriever;
    relevanceScorer;
    reranker;
    compressor;
    citationTracker;
    engine;
    constructor(options) {
        this.engine = options.engine ?? new InferenceEngine();
        this.decomposer = new QueryDecomposer(this.engine);
        this.retriever = new HybridRetriever({
            neo4jClient: options.neo4jClient,
            prisma: options.prisma,
        });
        this.relevanceScorer = new RelevanceScorer(this.engine);
        this.reranker = new Reranker();
        this.compressor = new ContextCompressor();
        this.citationTracker = new CitationTracker();
    }
    /**
     * Run the full RAG pipeline for a user query.
     *
     * Returns assembled context block, citations, conflicts, and graph insights
     * ready for agent consumption.
     */
    async query(userQuery, userId, clientId, options) {
        const startTime = Date.now();
        const targetTokens = options?.targetTokens ?? 4000;
        const maxChunks = options?.maxChunks ?? 10;
        // Step 1: Decompose query
        const decomposed = await this.decomposer.decompose(userQuery, {
            clientId: clientId ?? undefined,
            clientName: options?.clientName,
        });
        // Step 2: Generate query embedding via Voyage AI
        const queryEmbedding = await this.embedQuery(userQuery);
        // Step 3: Parallel vector + graph retrieval
        let { chunks, graphInsights } = await this.retriever.retrieve(decomposed, userId, clientId, queryEmbedding);
        // Step 4: Score chunks for passage-level relevance
        const relevantChunks = await this.relevanceScorer.scoreChunks(userQuery, chunks);
        console.log(`[RAGEngine] Relevance scoring: ${chunks.length} → ${relevantChunks.length} chunks`);
        chunks = relevantChunks;
        // Step 5: Detect conflicts between retrieved chunks
        const conflicts = this.detectConflicts(chunks);
        // Step 6: Rerank with composite scoring
        const rankedChunks = this.reranker.rerank(chunks, {
            targetClientId: clientId,
            conflicts,
            limit: maxChunks,
        });
        // Step 7: Compress context to fit token budget
        const { context, citations, tokensUsed } = this.compressor.compress(rankedChunks, graphInsights, conflicts, targetTokens);
        const retrievalMs = Date.now() - startTime;
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
        };
    }
    /** Get the citation tracker for post-processing responses */
    getCitationTracker() {
        return this.citationTracker;
    }
    /**
     * Targeted knowledge graph query for a specific entity.
     *
     * Used by memo sections to pull entity-specific relationship data
     * with explicit graph provenance — separate from the broad RAG context.
     *
     * Returns a formatted provenance block ready for prompt injection, or
     * empty string if Neo4j is unavailable or entity has no relationships.
     *
     * @param entityName - The entity to look up (e.g. company name, person name)
     * @param relationshipTypes - Optional filter (e.g. ['COMPETES_WITH', 'HAS_CUSTOMER'])
     * @param depth - Graph traversal depth (default 2)
     */
    async queryGraphForEntity(entityName, relationshipTypes, depth = 2) {
        const insights = await this.retriever.queryGraphEntity(entityName, relationshipTypes, depth);
        const formatted = this.formatGraphProvenanceBlock(insights, entityName);
        return { insights, formatted };
    }
    /**
     * Format a list of graph insights into a labeled provenance block
     * for prompt injection. Each relationship is tagged [Source: Knowledge Graph]
     * so the model can distinguish graph-derived facts from document chunks.
     */
    formatGraphProvenanceBlock(insights, entityName) {
        if (insights.length === 0)
            return '';
        const lines = [
            `KNOWLEDGE GRAPH PROVENANCE${entityName ? ` — ${entityName}` : ''}:`,
            `(The following entity relationships were extracted from indexed documents and stored in the knowledge graph.)`,
        ];
        for (const insight of insights) {
            if (insight.relationships.length === 0)
                continue;
            lines.push(``);
            lines.push(`  Entity: ${insight.entityName} [${insight.entityType}]`);
            for (const rel of insight.relationships) {
                lines.push(`    • [KG] ${insight.entityName} -[${rel.type}]→ ${rel.targetName} (${rel.targetType})`);
            }
        }
        lines.push('');
        return lines.join('\n');
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
    detectConflicts(chunks) {
        // Patterns: each extracts a single capture group — the property value
        const PATTERNS = [
            { property: 'revenue', source: String.raw `revenue\s*(?:is|was|of|:)\s*\$?([\d,.]+\s*(?:billion|million|thousand|[BMKbmk])?)` },
            { property: 'ARR', source: String.raw `(?:ARR|annual recurring revenue)\s*(?:is|of|:)\s*\$?([\d,.]+\s*(?:billion|million|[BMb])?)` },
            { property: 'valuation', source: String.raw `valuation\s*(?:of|is|:)\s*\$?([\d,.]+\s*(?:billion|million|[BMb])?)` },
            { property: 'funding', source: String.raw `(?:raised|total funding)\s+(?:of\s+)?\$?([\d,.]+\s*(?:billion|million|[BMb])?)` },
            { property: 'employees', source: String.raw `(?:has\s+)?([\d,]+)\s+employees` },
            { property: 'headcount', source: String.raw `headcount\s*(?:of|is:?|:)\s*([\d,]+)` },
            { property: 'CEO', source: String.raw `CEO\s*(?:is|was|:)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)` },
            { property: 'CTO', source: String.raw `CTO\s*(?:is|was|:)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)` },
            { property: 'CFO', source: String.raw `CFO\s*(?:is|was|:)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)` },
            { property: 'founder', source: String.raw `founded\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)` },
            { property: 'founded', source: String.raw `founded\s+in\s+(\d{4})` },
            { property: 'headquarters', source: String.raw `headquartered\s+in\s+([A-Za-z][a-zA-Z\s]+?)(?=\s*[.,\n])` },
        ];
        // Entity candidates: exactly two consecutive capitalised words (limits false positives
        // from property keywords like ARR/CEO/CTO being greedily included in entity names)
        const ENTITY_RE = /\b([A-Z][a-zA-Z]+\s+[A-Z][a-zA-Z]+)\b/g;
        const facts = [];
        for (const chunk of chunks) {
            // Collect entity candidate positions for this chunk
            const entityCandidates = [];
            const entityRe = new RegExp(ENTITY_RE.source, 'g');
            let em;
            while ((em = entityRe.exec(chunk.content)) !== null) {
                entityCandidates.push({ name: em[1], pos: em.index });
            }
            for (const { property, source } of PATTERNS) {
                const re = new RegExp(source, 'gi');
                let m;
                while ((m = re.exec(chunk.content)) !== null) {
                    const rawValue = m[1]?.trim();
                    if (!rawValue)
                        continue;
                    // Normalise: lowercase + strip thousands separators
                    const normValue = rawValue.toLowerCase().replace(/,/g, '');
                    // Find the closest preceding entity candidate within 300 chars
                    let entity = 'unnamed';
                    let bestDist = Infinity;
                    for (const candidate of entityCandidates) {
                        const dist = m.index - candidate.pos;
                        if (dist > 0 && dist < 300 && dist < bestDist) {
                            bestDist = dist;
                            entity = candidate.name;
                        }
                    }
                    facts.push({
                        entity: entity.toLowerCase(),
                        property,
                        value: normValue,
                        documentId: chunk.documentId,
                        sourceTitle: chunk.sourceTitle,
                    });
                }
            }
        }
        // Group facts by (entity, property), then by documentId (keep first per doc)
        const grouped = new Map();
        for (const fact of facts) {
            const key = `${fact.entity}::${fact.property}`;
            if (!grouped.has(key))
                grouped.set(key, new Map());
            const byDoc = grouped.get(key);
            // First occurrence per document wins
            if (!byDoc.has(fact.documentId))
                byDoc.set(fact.documentId, fact);
        }
        const conflicts = [];
        for (const [key, byDoc] of grouped) {
            const separatorIdx = key.indexOf('::');
            const entityName = key.slice(0, separatorIdx);
            const property = key.slice(separatorIdx + 2);
            const docFacts = [...byDoc.values()];
            for (let i = 0; i < docFacts.length; i++) {
                for (let j = i + 1; j < docFacts.length; j++) {
                    const a = docFacts[i];
                    const b = docFacts[j];
                    if (a.value === b.value)
                        continue;
                    // Avoid duplicate conflict entries for the same entity+property pair
                    const alreadyRecorded = conflicts.some((c) => c.entityName === entityName && c.property === property);
                    if (alreadyRecorded)
                        continue;
                    conflicts.push({
                        entityName,
                        property,
                        valueA: a.value,
                        valueB: b.value,
                        sourceA: a.sourceTitle,
                        sourceB: b.sourceTitle,
                        sourceValue: a.value,
                        conflictingValue: b.value,
                    });
                }
            }
        }
        return conflicts;
    }
    /** Embed a query string via Voyage AI for vector search */
    async embedQuery(query) {
        const voyageKey = process.env['VOYAGE_API_KEY'];
        if (!voyageKey) {
            console.warn('[RAGEngine] VOYAGE_API_KEY not set — vector search will fail');
            return new Array(512).fill(0);
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
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[RAGEngine] Voyage AI error ${response.status}: ${errorText}`);
                return new Array(512).fill(0);
            }
            const data = await response.json();
            return data.data[0]?.embedding ?? new Array(512).fill(0);
        }
        catch (err) {
            console.error(`[RAGEngine] Voyage AI failed: ${err instanceof Error ? err.message : 'Unknown'}`);
            return new Array(512).fill(0);
        }
    }
}
