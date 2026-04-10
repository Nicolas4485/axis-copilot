# Skill: Agent Development for Axis Copilot

When working on agents (packages/agents):

## Before making changes
1. Read packages/agents/CLAUDE.md for routing rules
2. Understand which specialist handles which domain:
   - Sean = product strategy
   - Kevin = process optimization
   - Mel = competitive analysis
   - Anjie = stakeholder communication
3. Check that changes maintain the delegation pattern (Aria routes, specialists execute)

## Agent loop rules
- Max 5 tool execution iterations per agentic loop
- Every agent response must include RAG context when knowledge-base exists
- Citations must be tracked via CitationTracker
- Memory must be assembled from all 5 tiers before agent starts reasoning
- Agent must surface conflict warnings from RAG in responses

## Testing agent changes
1. Run `pnpm --filter @axis/agents test`
2. Verify orchestrator routing: each query type goes to the right specialist
3. Verify tool execution doesn't exceed iteration limit
4. Test with mock RAG results to verify citation flow
