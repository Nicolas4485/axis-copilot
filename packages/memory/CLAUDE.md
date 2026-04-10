# Memory Package Rules

## Architecture
5-tier Infinite Memory system:
- Tier 1: Working Memory (current session, 10000 token budget) — Redis
- Tier 2: Summary Memory (prior sessions, 2000 tokens) — Prisma/Postgres
- Tier 3: Episodic Memory (vector-searchable past interactions, 2000 tokens) — pgvector
- Tier 4: Semantic Memory (knowledge graph entities, 1000 tokens) — Neo4j
- Tier 5: Archival Memory (reference documents, 500 tokens) — Prisma

## Key patterns
- Memory assembly respects token budgets per tier
- Working memory uses Redis (currently stubbed — addToWorkingMemory is a no-op)
- Episodic search is keyword-only (should be vector similarity — known gap)
- Archival memory always returns null (stubbed)
- Memory tiers are assembled in order: working first, archival last

## Known gaps
- Redis working memory not implemented (stub)
- Episodic memory search needs pgvector (currently keyword matching)
- Archival tier returns null
- Token budgets are fixed — should be query-adaptive
