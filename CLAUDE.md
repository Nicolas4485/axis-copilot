# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## PROJECT
Name: axis-copilot
Purpose: AI consulting co-pilot for private equity — agentic RAG, knowledge graph, multi-agent system
Stack: Next.js 14 App Router, Express + TypeScript, PostgreSQL 16 + pgvector,
       Redis 7, Neo4j 5.18, Ollama Qwen3 8B (local), Anthropic API
Package manager: pnpm (workspaces + turborepo). Node: 24.x

## STRUCTURE
```
apps/web          — Next.js 14 frontend (port 3001)
apps/api          — Express backend (port 4747)
packages/agents   — Aria orchestrator + 5 PE specialist agents
packages/inference — InferenceEngine: model routing + cost tracking
packages/ingestion — 15-step document ingestion pipeline + parsers
packages/knowledge-graph — Neo4j client + graph operations
packages/rag      — Hybrid retriever + reranker + compressor + citations
packages/memory   — 5-tier Infinite Memory manager
packages/tools    — Agent tool definitions (~20 tools)
packages/types    — Shared TS interfaces + encryption + extension protocol
prisma/           — Schema + migrations (never edit migrations directly)
docs/             — EXTENSION-PROTOCOL.md, EXTENSION-CHAT-STREAMING-SPEC.md
demo-data/        — 4 PE demo deals (CIMs + pitch decks) + DEMO-GUIDE.md
```

## COMMANDS

```bash
# Development
pnpm dev                    # Start all apps in parallel (turbo)
pnpm build                  # Build all packages
pnpm typecheck              # Type-check all packages
pnpm lint                   # Lint all packages
pnpm test                   # Run all tests
pnpm test:watch             # Watch mode

# Run a single test file
pnpm --filter @axis/api vitest run src/routes/auth.test.ts
pnpm --filter @axis/rag vitest run src/reranker.test.ts

# Database
pnpm db:migrate             # Deploy migrations (production)
pnpm db:migrate:dev         # Create + run a new migration (development)
pnpm db:seed                # Standard seed
pnpm --filter @axis/api tsx src/scripts/seed-demo.ts   # Seed PE demo dataset

# Infra
docker-compose up -d        # Start PostgreSQL, Redis, Neo4j
ollama pull qwen3:8b && ollama serve   # Start local model

# Health / Ops
curl http://localhost:4747/api/health
pnpm eval:rag               # Run 60-question RAG evaluation suite
```

## CRITICAL ARCHITECTURE RULES
- ALL model calls go through `packages/inference/src/engine.ts` (`InferenceEngine`) — never call Anthropic SDK or Ollama directly from agent code
- Model routing is defined in `packages/inference/src/router.ts` (`ROUTING_TABLE`)
  - **Claude Haiku**: classify, entity_extract, doc_type_detect, relevance_score, rag_plan, rag_reflect, session_summary
  - **Claude Sonnet**: user_response, agent_response, user_report, context_compress, user_email
  - **Qwen3 (local)**: fallback for ingestion/pipeline tasks when Claude unavailable
- System prompt tier limits (tokens): MICRO ≤ 150 · TASK ≤ 400 · AGENT ≤ 800
  Dynamic context always goes in the USER turn, not the system prompt
- All Claude calls use `cache_control: ephemeral` (prompt caching on every request)
- `packages/inference/src/prompt-library.ts` — do not modify without discussion

## ARCHITECTURE

### Chat Request Flow
```
Browser → POST /api/sessions/:id/messages
  → authenticate middleware (JWT from httpOnly cookie)
  → Aria.handleTextMessage(sessionId, userId, clientId, message)
      → assemble 5-tier memory context
      → classify intent (conversational vs analytical)
      → if analytical: RAGEngine.query() → decompose → parallel vector+graph → rerank → compress
      → choose agent (Aria or delegate to specialist)
      → agent tool loop (max 6 iterations)
  → SSE stream: {type:'progress'} … {type:'response', content, citations}
```

### RAG Pipeline (`packages/rag/`)
1. `QueryDecomposer` — splits query into vectorQueries + graphQueries + entityFocus + temporalFilter
2. `HybridRetriever` — **parallel**: pgvector similarity search + Neo4j entity traversal (depth ≤ 4)
3. `RelevanceScorer` — binary: is this chunk relevant? (Haiku call)
4. `Reranker` — composite score: similarity×0.40 + recency×0.20 + source_weight×0.15 + client_boost×0.15 − conflict_penalty×0.10
5. `ContextCompressor` — 5 levels (none→trim→truncate→summarise→aggressive), target 4000 tokens
6. `CitationTracker` — inline `[N]` citation tracking

**Known stubs:** `detectConflicts()` is not yet implemented; temporal WHERE clause is defined but not wired.

### 5-Tier Memory (`packages/memory/infinite-memory.ts`)
| Tier | Store | Token Budget | Status |
|------|-------|-------------|--------|
| 1 Working | Redis | 10k | Stub (returns empty) |
| 2 Summary | Prisma | 2k | Live |
| 3 Episodic | pgvector | 2k | Live (keyword-only, no vector search yet) |
| 4 Semantic | Neo4j | 1k | Live |
| 5 Archival | Prisma | 500 | Stub (returns null) |

### InferenceEngine (`packages/inference/`)
- `engine.ts` — `InferenceEngine.route(task, prompt, options)` — single entry point
- `router.ts` — `ROUTING_TABLE`: `InferenceTask → { model, maxTokens, fallback }`
- `claude-client.ts` — Anthropic SDK wrapper (all calls include cache_control)
- `gemini-client.ts` — Gemini REST wrapper (Aria text mode)
- `local-client.ts` — Ollama wrapper (JSON mode: add `format:'json'` to body, not prompt)
- `cost-tracker.ts` — In-memory session/task cost log (TODO: persist to Redis)

### Agents (`packages/agents/`)
- `aria.ts` — Conversational orchestrator; handles text + voice; delegates to workers
- `base-agent.ts` — Core loop: plan → retrieve → reflect (≤2 cycles) → synthesize
- `cim-analyst.ts` — CIM analysis: financial extraction, sector benchmarks, fit scoring
- `memo-writer.ts` — 13-section PE IC memo generation (incl. LBO, exit analysis, value creation)
- `lbo-calculator.ts` — IRR/MOIC bear/base/bull scenarios
- `sector-benchmarks.ts` — 8 sectors, EV/EBITDA ranges, precedent transactions, LBO metrics

### Ingestion Pipeline (`packages/ingestion/pipeline.ts`)
15 steps: fetch → checksum → parse → classify → chunk (400–600 tokens, 50 overlap) → embed (Voyage AI `voyage-3`) → store → extract_entities → verify → detect_conflicts → update_records → episodic_memory → publish → finalise

Entity confidence thresholds: >0.8 auto-accept · 0.4–0.8 verify with Haiku · <0.4 drop

Parsers: GDoc, GSheet, GSlides, PDF, DOCX, PPTX, Code, Transcript

### Prisma Models (Key)
`User · Client · Session · Deal · Message · ClientContext`
`KnowledgeDocument · DocumentChunk (embedding: pgvector(512)) · ConflictRecord`
`AgentMemory (embedding: pgvector(512)) · AgentDefinition`
`CostRecord · Analysis · CompetitorEntry · ProcessStep`
`AuditLog · OutputFeedback · PitchDeckTemplate · Integration`

### Auth Flow
- Dev mode: POST `/api/auth/login` → auto-creates dev user, sets httpOnly JWT cookie (7-day)
- Production: Google OAuth → HMAC-signed state (CSRF) → upsert user → JWT cookie
- `authenticate` middleware: reads cookie OR Bearer header → sets `req.userId`
- Rate limits: 100 req/min (general) · 20 req/min (messages) · 30 req/min (writes)

## CONVENTIONS
- API: REST, camelCase JSON, `{ error, code, requestId }` on errors
- Database: snake_case columns, PascalCase Prisma models
- OAuth tokens encrypted at rest (AES-256-GCM via `packages/types/src/`)
- SSE events: `{ type: "token"|"tool_start"|"tool_result"|"conflict_warning"|"done" }`
- Co-locate tests: `auth.ts` → `auth.test.ts` in same folder; E2E in `e2e/`

## ENVIRONMENT VARIABLES
See `apps/api/src/lib/env.ts` for Zod validation and defaults.

**Required (no defaults):**
- `DATABASE_URL` — PostgreSQL with pgvector
- `REDIS_URL`
- `JWT_SECRET`
- `ENCRYPTION_KEY` — 64 hex chars (32 bytes)

**Optional (key ones):**
- `PORT` — default 4747
- `ANTHROPIC_API_KEY` — omit for local-only mode
- `GEMINI_API_KEY` — Aria live audio/video
- `VOYAGE_API_KEY` — pgvector embeddings (falls back to zero vectors)
- `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` — OAuth
- `NEO4J_URI/USER/PASSWORD` — defaults to `bolt://localhost:7687`
- `OLLAMA_BASE_URL` — default `http://localhost:11434`
- `EXTENSION_API_KEY` + `EXTENSION_USER_ID` — Chrome extension bearer auth

Frontend: `NEXT_PUBLIC_API_URL` (default `http://localhost:4747`)

## KNOWN GOTCHAS
- pgvector: embedding column uses raw SQL (not Prisma field syntax)
- Neo4j unavailable: fall back to vector-only RAG — never crash API
- APOC `mergeNodes()` may not be available — `GraphOperations` needs fallback
- Drive webhooks expire every 7 days; renewal cron at 23:00 UTC
- Pitch deck ESM/CJS interop: `(PptxGenJSModule.default ?? PptxGenJSModule)`
- Extension API port is **4747** — not 3001 (that's Next.js)
- Extension uses static bearer token (not JWT) — service workers can't read cookies
- `chrome.runtime.sendMessage` web→extension requires origin in both `manifest.json` `externally_connectable.matches` AND `axis-bridge.js` `ALLOWED_ORIGINS`

## PHASE 2 — Browser Agent ✅ extension side complete, AXIS side in progress

### Extension (axis-ext) — fully working
9 files written, end-to-end tested. See `axis-ext/CLAUDE.md`. Smoke test:
open the side panel's DevTools console (right-click side panel → Inspect),
type `allow pasting`, then run:
```js
chrome.runtime.sendMessage({ command: 'GET_BROWSER_STATE' }, console.log)
```

### AXIS side — Phase A done, Phase B pending

**Phase A — client-side BrowserAgent for user-triggered research:**
- `apps/web/src/lib/chrome-extension-bridge.ts` — typed transport wrapping `chrome.runtime.sendMessage`. Singleton via `getExtensionBridge()`.
- `apps/web/src/lib/browser-agent.ts` — high-level `visit/scrape/fill/see/scrollToLoad/runPlan`. Emits `AGENT_PLAN_*` so the side-panel progress bar updates.
- `apps/web/src/components/research-prompt.tsx` — chat-inline UI affordance. Used inside Aria/Mel/Sean responses when browser access is needed.
- `apps/web/src/app/research/page.tsx` — manual smoke-test page at `/research`. Becomes legacy once Aria's chat surface auto-renders ResearchPrompt cards inline.
- `axis-ext/background/axis-bridge.js` — added relay for `AGENT_PLAN_*` notifications (web → extension → side panel).
- `apps/web/.env.local` — added `NEXT_PUBLIC_AXIS_EXTENSION_ID` placeholder. Paste the unpacked extension ID from `chrome://extensions`.

**Phase B — server-agent-triggered (NOT YET BUILT):**
Mel/Sean/Aria call browser tools mid-reasoning, API pushes commands directly to the extension over WebSocket, agents continue with results. Doesn't require `apps/web` to be open.

Architecture: WebSocket FROM extension TO API. Extension's service worker opens a WS to API on startup with bearer auth, server pushes commands directly. Reuses existing WS infra (`aria-live-ws`).

Build sequence:
1. `apps/api/src/routes/extension-ws.ts` — WS route. Auth via `EXTENSION_API_KEY`. `Map<userId, WebSocket>` connection registry.
2. `axis-ext/utils/api-websocket.js` — service worker WS client with `chrome.alarms` keepalive (25s, under MV3's 30s idle kill) + auto-reconnect with exponential backoff.
3. `axis-ext/background/service-worker.js` — boot WS on startup; wire `chrome.runtime.onInstalled` and `onStartup`.
4. `apps/api/src/lib/browser-agent-rpc.ts` — server-side dispatch. `sendBrowserCommand(userId, command, payload)` correlates by request id over the WS.
5. `packages/agents/src/tools/browser-tools.ts` — tool definitions: `browser_visit`, `browser_scrape`, `browser_screenshot`, `browser_fill`, `browser_click`, `browser_scroll`. Each calls the RPC dispatch.
6. `packages/agents/src/tool-registry.ts` — register the tools.
7. `packages/agents/src/specialists/competitive-agent.ts` (Mel) — add `browser_scrape`/`browser_visit` to tools list.
8. `packages/agents/src/specialists/product-agent.ts` (Sean) — add `browser_*` for Miro/Mixpanel/Docs.
9. `packages/agents/src/aria.ts` — if a specialist needs browser access AND WS is not connected, surface a `<ResearchPrompt>` in Aria's reply (user-triggered fallback path).

**Phase C — knowledge graph integration (NOT YET BUILT):**
`/api/extension/research` endpoint that runs the full ingestion pipeline (parse → chunk → embed → KnowledgeDocument → Neo4j entities). Browser-gathered data lands in the KG, not just AgentMemory.

**Future browser commands (after Phase B):**
- `DRAG_ELEMENT` — Miro flowchart drawing
- `KEY_PRESS` — generic keyboard shortcuts
- `UPLOAD_FILE` — drag-drop file uploads

## DO NOT TOUCH
- `prisma/migrations/` — never edit; only `pnpm db:migrate:dev` to add new ones
- `.env` files — read only
- Aura Commodities client data — live client, never use for testing (use "Demo Corp")

## EXTENSION INTEGRATION (axis-ext)
Sister project at `C:\Users\sakrn\OneDrive\المستندات\Axi_Copilot_Extension\axis-copilot-extension\axis-ext`

Protocol source of truth: `packages/types/src/extension-protocol.ts`
JSON mirror (for extension plain-JS): `packages/types/src/extension-protocol.json`
→ also copied to `axis-ext/utils/protocol-shared.json` — sync manually when changed

Extension routes at `/api/extension/*` are mounted **before** global `authenticate` middleware.

**Open extension work (priority order):**
1. Hook `extensionRouter` into `auditMiddleware`
2. Add `/api/extension/chat` SSE endpoint (spec: `docs/EXTENSION-CHAT-STREAMING-SPEC.md`)
3. Build Phase 2 browser agent (spec: `AXIS_PE_SPEC.md`) — build sequence in that doc
4. Token rotation: replace static `EXTENSION_API_KEY` with short-lived tokens from `/api/extension/pair`

## PHASE STATUS
- **Phase 1** (Critical Fixes): ✅ Complete
- **Phase 2** (PE Core Workflow — CIM→memo→pitch deck pipeline): ✅ Complete
- **Phase 3** (Demo-ready + Quality Engine): ✅ Complete
  - Audit log, demo seeder, pitch deck generator, style indexing, feedback loop,
    sector benchmarks, financial extraction, management scoring, RAG eval framework
- **Phase 4** (Team Collaboration — multi-user, SSO): Planned post-hire
