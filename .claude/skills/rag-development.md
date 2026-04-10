# Skill: RAG Development for Axis Copilot

When working on the RAG pipeline (packages/rag, packages/ingestion, packages/knowledge-graph, packages/memory):

## Before making changes
1. Read the package-level CLAUDE.md in the target package
2. Check the known gaps section — the change might already be documented
3. Run `pnpm --filter @axis/rag typecheck` to get a baseline

## Architecture rules
- Vector search is PRIMARY, graph is SUPPLEMENTARY
- All vector queries must use parameterized SQL (Prisma.raw)
- All retrievals must go through HybridRetriever — never query pgvector directly
- Reranking is mandatory — never return raw similarity scores to agents
- Context compression must respect token budgets
- Always include inline citations [N] in assembled context

## Testing RAG changes
1. Run `pnpm --filter @axis/rag test` after any change
2. For retrieval changes: verify both vector-only AND hybrid (vector+graph) paths
3. For reranking changes: verify composite score formula is preserved
4. For compression changes: verify citation indices are maintained after compression
5. Always test the graceful degradation path (Neo4j unavailable)

## Quality checklist
- [ ] No raw SQL string concatenation (SQL injection risk)
- [ ] Similarity threshold applied (0.3 floor)
- [ ] Client scoping applied (no cross-client data leaks)
- [ ] Temporal filter applied if present in decomposed query
- [ ] Conflict warnings surfaced in context block
