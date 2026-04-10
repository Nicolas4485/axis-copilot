# Agents Package Rules

## Architecture
Multi-agent system with orchestrator delegation pattern.
- Aria = conversational router (user-facing)
- Sean = product strategy specialist
- Kevin = process optimization specialist
- Mel = competitive analysis specialist
- Anjie = stakeholder communication specialist
- Orchestrator routes based on query intent classification

## Key patterns
- BaseAgent implements the agentic loop: plan -> retrieve -> tool_use -> evaluate -> respond
- All agents share: InferenceEngine (model routing), RAG (retrieval), InfiniteMemory (5-tier)
- Tool execution is sandboxed with max 5 iterations per loop
- Agent context includes: clientId, sessionId, memory tiers, RAG results
- Citations must be tracked via CitationTracker for every agent response

## Rules
- Never let an agent respond without RAG context when knowledge-base docs exist
- Always route through InferenceEngine.route() — never call models directly
- Conflict warnings from RAG must surface in agent responses
- clientId scoping is critical — agents must not leak cross-client data
- Known gap: clientId is currently always null in orchestrator context (TODO)
