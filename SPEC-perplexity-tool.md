# PRD: Perplexity Search Tool Integration

**Status:** Ready for implementation  
**Priority:** P1 — Next sprint  
**Stack:** Node.js / TypeScript / Express  
**Estimated effort:** 2–3 days

---

## Problem Statement

AXIS agents currently use `web_search` (backed by Anthropic's tool API), which returns raw URLs and snippets. For PE-grade research — competitive analysis, company due diligence, stakeholder background — this produces shallow results that require multiple follow-up fetches, often hit paywalls, and do not include citations that can be verified in deliverables. Analysts using Kevin, Alex, and Anjie need sourced, synthesised answers from live web data in a single call.

---

## Goals

1. Kevin (CompetitiveAgent) produces competitive briefs sourced from live web data with verifiable citations, not training-data reasoning.
2. Alex (DueDiligenceAgent) can validate company claims against current web sources during DD analysis.
3. Anjie (StakeholderAgent) can research stakeholder backgrounds and public statements before drafting communications.
4. Sean (ProductAgent) can pull current SaaS benchmarks and competitor feature comparisons.
5. Citations appear automatically in formal deliverables (IC memos, competitive briefs, reports) and are omitted in casual conversation — no manual toggling required.

---

## Non-Goals

- **sonar-deep-research** (async, 10–30 min research reports) — separate spec, different UX pattern required (async job + notification).
- **Replacing `web_search` entirely** — keep `web_search` as fallback when `PERPLEXITY_API_KEY` is not set.
- **Streaming Perplexity responses** — return full response; streaming is not needed for tool calls.
- **Perplexity for Aria or the ProcessAgent** — Aria handles scheduling/comms, Process handles workflow analysis; web research is not their primary job.
- **User-facing Perplexity settings UI** — model selection (sonar vs sonar-pro) is decided by the agent based on context, not the user.

---

## User Stories

### Kevin (CompetitiveAgent)

- As Kevin, I want to call `perplexity_search` with a company or market query so that I return a synthesised competitive brief grounded in current web sources, not training data.
- As Kevin, I want to include citations (source name + URL + date) in competitive brief outputs so that Nicolas can verify claims before using them in client deliverables.
- As Kevin, I want to use `sonar-pro` automatically when producing a formal output (competitive brief, market analysis) and `sonar` for quick conversational lookups.

### Alex (DueDiligenceAgent)

- As Alex, I want to cross-reference a company's stated ARR or market position against current web sources so that I can flag discrepancies in the DD report.
- As Alex, I want citations surfaced in the IC memo sections I contribute to so that the investment committee can trace each data point.

### Anjie (StakeholderAgent)

- As Anjie, I want to research a stakeholder's career history, public statements, and recent news before drafting a communication so that the message is relevant and well-informed.

### Sean (ProductAgent)

- As Sean, I want to look up current NRR benchmarks, ARR multiples, or competitor feature lists so that my product assessments use live data.

---

## Requirements

### P0 — Must Have (cannot ship without)

#### 1. New tool: `perplexity_search`

**File:** `packages/tools/src/perplexity-search.ts`

```typescript
export interface PerplexitySearchInput {
  query: string
  mode?: 'fast' | 'deep'     // 'fast' → sonar, 'deep' → sonar-pro
  outputContext?: 'chat' | 'deliverable'  // controls citation rendering
}
```

**Behaviour:**
- `mode: 'fast'` (default) → uses model `sonar`. ~3 seconds. Good for conversational lookups.
- `mode: 'deep'` → uses model `sonar-pro`. ~8 seconds. Used for formal competitive and DD outputs.
- `outputContext: 'deliverable'` → response includes a `citations` array with `{ title, url, date }` objects.
- `outputContext: 'chat'` (default) → citations omitted from returned data; agent prose does not include sources.
- Returns `{ success, data: { answer, citations?, model, durationMs }, error }` — consistent with `ToolResult`.

**API call:**
```
POST https://api.perplexity.ai/chat/completions
Authorization: Bearer $PERPLEXITY_API_KEY
Content-Type: application/json

{
  "model": "sonar" | "sonar-pro",
  "messages": [{ "role": "user", "content": "<query>" }],
  "return_citations": true,
  "return_images": false,
  "search_recency_filter": "month"  // only for sonar-pro; omit for sonar
}
```

**Acceptance criteria:**
- [ ] Returns a synthesised answer string and `citations[]` when `outputContext: 'deliverable'`
- [ ] Returns only the answer string when `outputContext: 'chat'`
- [ ] Uses `sonar` model when `mode: 'fast'` or unspecified
- [ ] Uses `sonar-pro` model when `mode: 'deep'`
- [ ] Returns `{ success: false, error }` with meaningful message if `PERPLEXITY_API_KEY` is missing
- [ ] Returns `{ success: false, error }` with HTTP status + body if Perplexity API errors
- [ ] Tool call completes in under 15 seconds (sonar-pro) or 5 seconds (sonar) p95
- [ ] Redis cache: 1-hour TTL keyed on `perplexity:sha256(query+mode)` — same pattern as `web_search` TODO (implement now)

#### 2. Register tool in `packages/tools/src/index.ts`

Add export:
```typescript
export { perplexitySearch, perplexitySearchDefinition } from './perplexity-search.js'
```

#### 3. Register in `ToolRegistry`

**File:** `packages/agents/src/tool-registry.ts`

Add `perplexity_search` to the registry using the same pattern as `web_search`:
```typescript
registry.register('perplexity_search', perplexitySearchDefinition, perplexitySearch)
```

#### 4. Add to agent configs

**File:** `packages/agents/src/specialists/competitive-agent.ts`
```typescript
tools: ['perplexity_search', 'web_search', 'search_knowledge_base', 'get_graph_context', 'save_competitor', 'generate_comparison_matrix', 'flag_for_review']
// perplexity_search first — Kevin should prefer it over web_search
```

**File:** `packages/agents/src/specialists/due-diligence-agent.ts`
```typescript
tools: ['search_knowledge_base', 'get_graph_context', 'perplexity_search', 'web_search', 'get_market_context', 'get_competitive_context', 'save_analysis', 'flag_for_review']
```

**File:** `packages/agents/src/specialists/stakeholder-agent.ts`
```typescript
tools: ['search_gmail', 'read_email', 'search_knowledge_base', 'get_org_chart', 'get_graph_context', 'perplexity_search', 'web_search', 'draft_email', 'book_meeting', 'save_stakeholder', 'update_stakeholder_influence', 'flag_for_review']
```

**File:** `packages/agents/src/specialists/product-agent.ts`
```typescript
tools: ['search_knowledge_base', 'get_graph_context', 'perplexity_search', 'web_search', 'get_market_context', 'get_competitive_context', 'save_analysis', 'flag_for_review']
```

#### 5. Update system prompts in `packages/inference/src/prompt-library.ts`

**AGENT_COMPETITIVE (Kevin)** — add these rules:
```
RESEARCH PROTOCOL:
1. Use perplexity_search (mode:'deep') for all competitive briefs and market analyses — it returns cited web sources.
2. Use perplexity_search (mode:'fast') for quick lookups mid-conversation.
3. Fall back to web_search only if Perplexity is unavailable.
4. In deliverables: include citations as "Source: [Title], [URL], [Date]" after each cited claim.
5. In chat: omit citations from prose — keep answers clean.
```

**AGENT_DUE_DILIGENCE (Alex)** — add:
```
For company and market validation, use perplexity_search to cross-reference claims against current web sources.
Set outputContext:'deliverable' when contributing to IC memo sections.
```

**AGENT_STAKEHOLDER (Anjie)** — add:
```
Before drafting any communication, use perplexity_search to research the primary stakeholder's career history,
recent public statements, and any news relevant to the deal context.
```

#### 6. Environment variable

**File:** `.env` (and `.env.example`)
```
PERPLEXITY_API_KEY=pplx-...
```

Add to the API startup health check: log a warning (not error) if `PERPLEXITY_API_KEY` is missing — agents fall back to `web_search`.

### P1 — Nice to Have

#### 7. Model selection logic in the tool itself

When `mode` is not specified, the tool infers it:
- If `query` length > 200 chars or contains words like "analysis", "compare", "landscape" → use `sonar-pro`
- Otherwise → use `sonar`

This lets agents call `perplexity_search({ query })` without worrying about model selection.

#### 8. Citation formatting helper

**File:** `packages/tools/src/perplexity-search.ts`

Export a `formatCitations(citations)` helper that formats citations as:
```
Sources:
[1] TechCrunch — "SaaS valuations rebound in Q1 2025" (techcrunch.com, Jan 2025)
[2] G2 Crowd — "DataOps category leaders" (g2.com, Mar 2025)
```

Agents call this at the end of a deliverable section, not inline. Keeps prose clean.

#### 9. Sync to DB

After updating agent configs in TypeScript, run the sync script (`apps/api/src/scripts/sync-agents.ts`) to upsert tools arrays into the `agent_definition` table so the UI reflects the change immediately.

### P2 — Future

- `sonar-deep-research` as an async job (separate spec) — fires and returns a job ID, notifies when done.
- Perplexity search history logged to `AgentMemory` so Kevin can avoid re-researching the same company.
- User-visible "research confidence" indicator on competitive briefs showing how many Perplexity sources were consulted.

---

## Success Metrics

**Leading (within 1 week of deploy):**
- Kevin's competitive brief responses include ≥3 cited sources per output — target: 100% of formal briefs
- `perplexity_search` tool is called in ≥80% of Kevin's analysis sessions
- Tool error rate < 5% (Perplexity API uptime SLA is 99.9%)

**Lagging (within 1 month):**
- Reduction in "hallucinated" company facts flagged via the correction feedback loop (OutputFeedback model)
- IC memo quality scores (from RAG eval) improve for market position and competitive sections

---

## Open Questions

| Question | Owner | Blocking? |
|---|---|---|
| Does Perplexity Sonar access LinkedIn profiles or is it blocked? | Engineering (test manually) | No — fallback to web_search for LinkedIn |
| Should citations be stored in the IC memo DB record or only in the response? | Nicolas | No — start with response-only |
| Rate limits: Perplexity free tier is 5 req/min. What plan? | Nicolas | Yes before production load |

---

## Implementation Order

1. `packages/tools/src/perplexity-search.ts` — tool file with fetch + citation parsing
2. `packages/tools/src/index.ts` — export
3. `packages/agents/src/tool-registry.ts` — register
4. `.env` / `.env.example` — add key
5. Agent config files — add `perplexity_search` to tools arrays
6. `packages/inference/src/prompt-library.ts` — add research protocol rules to Kevin, Alex, Anjie, Sean
7. `apps/api/src/scripts/sync-agents.ts` — run to sync DB
8. Manual test: ask Kevin "who are Nexus DataOps' main competitors?" and verify citations appear in response

---

## File Change Summary

| File | Change |
|---|---|
| `packages/tools/src/perplexity-search.ts` | **CREATE** — new tool |
| `packages/tools/src/index.ts` | Add export |
| `packages/agents/src/tool-registry.ts` | Register `perplexity_search` |
| `packages/agents/src/specialists/competitive-agent.ts` | Add `perplexity_search` first in tools array |
| `packages/agents/src/specialists/due-diligence-agent.ts` | Add `perplexity_search` |
| `packages/agents/src/specialists/stakeholder-agent.ts` | Add `perplexity_search` |
| `packages/agents/src/specialists/product-agent.ts` | Add `perplexity_search` |
| `packages/inference/src/prompt-library.ts` | Add research protocol instructions to 4 agent prompts |
| `.env` / `.env.example` | Add `PERPLEXITY_API_KEY` |
