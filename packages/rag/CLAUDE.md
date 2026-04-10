# RAG Package Rules

## Architecture
This package implements Advanced RAG + Graph RAG hybrid retrieval.
- Primary: pgvector semantic search via Prisma raw SQL
- Secondary: Neo4j entity traversal (graceful fallback to vector-only)
- Query decomposition splits into: vectorQueries, graphQueries, entityFocus, temporalFilter
- Reranking uses composite scoring: similarity(0.40) + recency(0.20) + source_weight(0.15) + client_boost(0.15) - conflict_penalty(0.10)
- Context compression: 5 levels (none/trim/truncate/summarise/aggressive) with token budgeting

## Key patterns
- All vector searches use parameterized SQL (never string concatenation)
- Similarity floor is 0.3 for pgvector, normalization floor 0.72
- Recency decay: 90-day half-life
- Source weights: GDRIVE=0.9, UPLOAD=0.8, WEB=0.6
- Always include inline citations [N] in compressed context

## Known gaps (as of April 2026)
- detectConflicts() needs real implementation (currently being fixed)
- Temporal filter defined but needs SQL WHERE clause (currently being fixed)
- No passage-level relevance scoring yet
- No query expansion (synonyms/variants)
- Single rerank pass (ideal: rerank at each stage)
