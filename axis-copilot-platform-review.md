# AXIS Copilot — Full Platform Review
**Date:** 2026-04-10  
**Scope:** All files in `apps/` and `packages/`  
**Type:** Read-only audit — no changes made

---

## 1. HOW THE PLATFORM WORKS END-TO-END

### Architecture Overview

```
Browser (Next.js 14)
    │
    ├── Text mode → POST /api/sessions/:id/messages (SSE)
    │                    └── Aria.handleTextMessage()
    │                            ├── memory.buildAgentContext()   [5 tiers]
    │                            ├── rag.query()                  [pgvector + Neo4j]
    │                            ├── Gemini/Claude agentic loop   [max 8 iterations]
    │                            │       └── toolRegistry.executeTool()
    │                            │       └── aria.delegate() [async → worker agents]
    │                            └── SSE events: token, tool_start, conflict_warning, done
    │
    └── Voice mode → POST /api/aria/session-token → raw Gemini API key → client connects directly to Gemini Live
                     Tool calls → POST /api/aria/tool-call
                     Transcript → POST /api/aria/save-transcript
```

### Step-by-step user flow

**Step 1 — Auth**  
No login page exists in the frontend. JWT is expected to arrive pre-issued. There is no `/api/auth/login` route, no registration endpoint, no session creation for users. The `users` table exists in Prisma schema but no route populates it. Auth is `authenticate` middleware (`apps/api/src/middleware/auth.ts:37`) that validates an incoming Bearer token.

**Step 2 — Dashboard (`/`)**  
Loads recent sessions and clients via `GET /api/sessions` and `GET /api/clients`. Fetches health status from `GET /api/health`.

**Step 3 — Create session**  
`POST /api/sessions` with optional `clientId`. Returns session ID. User is redirected to `/session/[id]`.

**Step 4 — Chat (text mode)**  
User types a message → `POST /api/sessions/:id/messages` → SSE stream opens.

Inside the API:
1. Message stored in `messages` table (role: USER)
2. `Aria.handleTextMessage()` called
3. `InfiniteMemory.buildAgentContext()` assembles context from 5 tiers (Redis → Prisma summaries → episodic keyword search → Neo4j → archival count)
4. `RAGEngine.query()` runs hybrid retrieval (Voyage AI embed → pgvector cosine search + Neo4j graph traversal in parallel → rerank → compress)
5. Gemini `generateContent()` called (fallback: Claude Sonnet via InferenceEngine)
6. Agentic loop (max 8 iterations): tool calls executed, delegations fired async
7. Delegations (`delegate()`) call worker agents (Sean/Kevin/Mel/Anjie) in background, store results in `AgentMemory` table
8. Response streamed as SSE events: `tool_start`, `tool_result`, `delegation`, `conflict_warning`, `token`, `sources`, `done`
9. Assistant message stored to `messages` table

**Step 5 — Chat (voice/video mode)**  
1. Client calls `POST /api/aria/session-token` → receives raw Gemini API key + system instruction
2. Client connects directly to Gemini Live WebSocket using that key
3. Tool calls (function calls from Gemini) relayed to `POST /api/aria/tool-call`
4. After session ends, transcript saved via `POST /api/aria/save-transcript`

**Step 6 — Client management**  
CRUD on `/api/clients`. Stakeholders added via `POST /api/clients/:id/stakeholders`. Org chart rendered via `GET /api/clients/:id/orgchart` (builds D3 tree in-memory from stakeholder `reportsToId` relations).

**Step 7 — Knowledge upload**  
`POST /api/knowledge/upload` → multer (50MB limit) → `IngestionPipeline.ingestDocument()` (15 steps: parse → chunk → embed via Voyage AI → store → entity extract → conflict detect → Neo4j update). Returns `chunkCount`, `entityCount`, `conflicts`.

**Step 8 — Drive/GitHub sync**  
`POST /api/sync/drive` → SSE progress stream → `syncDriveFolder()` → per-file pipeline worker in separate Node process.  
`POST /api/sync/github` → SSE progress stream → GitHub tree API → batch download → pipeline.

**Step 9 — Export**  
`POST /api/exports/:id` → GDOC/GSHEET/EMAIL/MARKDOWN/JSON. PDF via `GET /api/exports/:id/pdf` (PDFKit streamed).

**Step 10 — Analytics/Cost**  
`GET /api/cost/summary` returns per-model token and cost breakdown. Data sourced from `cost_records` table.

---

## 2. WHAT IS CURRENTLY BROKEN OR STUBBED

### CRITICAL — Completely non-functional

| # | File | Line | Issue | Impact |
|---|------|------|-------|--------|
| B1 | `packages/ingestion/src/webhook-handler.ts` | 107–134 | `processFileChange()` never fetches real file content. `fileMetadata` is hardcoded placeholder, `content = Buffer.from('')`, `userId = ''`. Calling `ingestDocument()` with empty content and empty userId will fail or ingest garbage. | Drive webhook receives a notification and does nothing useful. Real-time sync is completely broken. |
| B2 | `packages/ingestion/src/webhook-handler.ts` | 173–202 | `registerChannel()` never calls Google Drive API. The `driveClient.files.watch()` call is commented out. Returns a fake `WebhookChannel` object. | Drive push notifications are never actually registered with Google. Webhook endpoint receives nothing. |
| B3 | `packages/ingestion/src/webhook-handler.ts` | 212–244 | `renewExpiringChannels()` always returns `{ renewed: 0, failed: 0 }`. The DB query for expiring channels is `expiringChannels: WebhookChannel[] = []` (hardcoded empty). | Channels would expire every 7 days even if registration worked. No renewal mechanism exists. |
| B4 | `apps/api/src/routes/sessions.ts` | 264 | `POST /api/sessions/:id/distribute` returns `{ distributed: true }` with a `TODO` comment: "Look up stakeholder emails, generate formatted content, send via Gmail/GDocs". No actual distribution happens. | Stakeholder distribution feature is a no-op that returns fake success to the caller. |
| B5 | `packages/agents/src/base-agent.ts` | 246–258 | `triggerReRetrieval()` is a stub that returns `currentRagResult` unchanged. Comment says "In a full implementation, this would analyze why context was insufficient…" | Re-retrieval loop (called when RAG context is deemed insufficient) never actually re-retrieves anything. The LLM evaluates context, finds it insufficient, but nothing improves. |

### HIGH — Partial implementations with meaningful side effects

| # | File | Line | Issue | Impact |
|---|------|------|-------|--------|
| B6 | `packages/agents/src/aria.ts` | 93–94 | `clientId: null` is hardcoded in `handleTextMessage()` context. `const context: AgentContext = { sessionId, clientId: null, ... }`. Even when a session has a `clientId` in the DB, the agent context never has it. | All RAG queries, Neo4j graph lookups, and tool calls run without client scoping. Cross-client data leakage is possible. Worker agents store delegation results under `clientId: null`. |
| B7 | `packages/agents/src/aria.ts` | 291 | Model name `'gemini-3.1-flash-live-preview'` is fictional. Current Gemini Live model is `gemini-2.0-flash-live`. | Live voice/video mode will fail to connect with an "model not found" error from the Gemini API. |
| B8 | `packages/ingestion/src/pipeline.ts` | 762–766 | Step 14 (`publishEvent`) logs to console only. Redis pub/sub is commented out with `// TODO: Wire Redis pub/sub`. | No real-time notifications when documents finish ingesting. Frontend has no way to know ingestion completed unless polling. |
| B9 | `packages/memory/src/infinite-memory.ts` | 399–460 | Tier 3 episodic search is keyword matching (`searchEpisodicMemory`), not vector similarity. Fetches latest 10 records, scores by word overlap, returns up to 5. The `embedding` column exists on `AgentMemory` but is never used here. | Past interactions are not semantically searched. Unrelated memories may surface while relevant ones are missed. |
| B10 | `apps/api/src/routes/aria.ts` | 334–368 | `GET /api/aria/delegation-status` fetches up to 50 `AgentMemory` rows then filters client-side in JS for session tag match (`tags?.includes(sessionId)`). For users with many memories, this pulls 50 rows but returns far fewer. | O(N) memory growth: as memories accumulate, this query degrades. Will silently miss delegations if >50 memories exist. |

### MEDIUM — Stubbed with graceful fallback

| # | File | Line | Issue | Impact |
|---|------|------|-------|--------|
| B11 | `packages/memory/src/infinite-memory.ts` | 482–494 | Tier 5 archival memory returns only a count string ("X archived session exports available"). Never fetches actual content. | Archival tier provides no useful context — just tells the agent exports exist. |
| B12 | `packages/inference/src/engine.ts` | 166–218 | `executeLocal()` method exists and handles Ollama, but `route()` (line 74-78) bypasses it completely — always calls `executeClaude()`. The router also confirms: `isLocalTask()` returns `false`, `getFallback()` returns `null`. | Ollama/Qwen3 is wired up (`LocalClient` class is complete) but never actually called. All tasks hit Anthropic API. The CLAUDE.md rule "Qwen3 handles ALL pipeline tasks" is not implemented. |
| B13 | `packages/ingestion/src/pipeline.ts` | 750–760 | Step 14 `publishEvent()` comment says Redis pub/sub "will be wired when we add real-time updates". | No event bus for downstream consumers. |

---

## 3. WHAT WORKS CORRECTLY

### Fully functional backend routes

| Route | File | Status |
|-------|------|--------|
| `GET /api/health` | `routes/health.ts` | Works — parallel checks for DB, Redis, Neo4j, Anthropic, Ollama |
| `GET/POST /api/sessions` | `routes/sessions.ts` | Works — full CRUD with Zod validation |
| `GET /api/sessions/:id` | `routes/sessions.ts` | Works — includes messages and client |
| `POST /api/sessions/:id/messages` | `routes/sessions.ts` | Works — SSE streaming, Aria agentic loop, tool events |
| `GET/POST /api/clients` | `routes/clients.ts` | Works — full CRUD |
| `PATCH /api/clients/:id` | `routes/clients.ts` | Works — partial update |
| `POST /api/clients/:id/stakeholders` | `routes/clients.ts` | Works |
| `GET /api/clients/:id/orgchart` | `routes/clients.ts` | Works — builds D3 tree |
| `POST /api/exports/:id` (GDOC/GSHEET/EMAIL) | `routes/exports.ts` | Works when Google is connected |
| `POST /api/exports/:id` (MARKDOWN/JSON) | `routes/exports.ts` | Works — returns inline content |
| `GET /api/exports/:id/pdf` | `routes/exports.ts` | Works — PDFKit streaming |
| `POST /api/knowledge/upload` | `routes/knowledge.ts` | Works — multer + full pipeline |
| `GET /api/knowledge/conflicts/:clientId` | `routes/knowledge.ts` | Works |
| `POST /api/knowledge/conflicts/:id/resolve` | `routes/knowledge.ts` | Works |
| `GET /api/knowledge/graph/:clientId` | `routes/knowledge.ts` | Works — gracefully degrades if Neo4j down |
| `POST /api/integrations/google/connect` | `routes/integrations.ts` | Works — returns OAuth URL |
| `GET /api/integrations/google/callback` | `routes/integrations.ts` | Works — stores encrypted tokens |
| `POST /api/sync/github` | `routes/sync.ts` | Works — SSE progress, batch download, full pipeline |
| `POST /api/sync/gmail` | `routes/sync.ts` | Works — searches, downloads, embeds Gmail threads |
| `GET /api/sync/status` | `routes/sync.ts` | Works |
| `POST /api/sync/drive` | `routes/sync.ts` | Works — download and pipeline per file |
| `POST /api/aria/messages` | `routes/aria.ts` | Works — same as sessions/:id/messages |
| `POST /api/aria/delegate` | `routes/aria.ts` | Works — synchronous delegation |
| `POST /api/aria/tool-call` | `routes/aria.ts` | Works — executes tool in live session context |
| `POST /api/aria/save-transcript` | `routes/aria.ts` | Works |
| `POST /api/aria/memory-refresh` | `routes/aria.ts` | Works |
| `GET /api/cost/summary` | `routes/cost.ts` | Works |

### Fully functional packages

| Package | What works |
|---------|-----------|
| `packages/types` | `encrypt()`/`decrypt()` — correct AES-256-GCM with random IV, auth tag verification |
| `packages/inference` | `ClaudeClient`, `CostTracker`, `getRoute()` routing table, `GeminiClient`, prompt library — all complete |
| `packages/agents` | `Aria.handleTextMessage()`, `Aria.delegate()`, `Aria.executeTool()`, all 4 worker agents (`ProductAgent`, `ProcessAgent`, `CompetitiveAgent`, `StakeholderAgent`), `BaseAgent.run()` agentic loop, `ToolRegistry` dispatch |
| `packages/rag` | `HybridRetriever` (vector + graph parallel), `QueryDecomposer`, `Reranker`, `ContextCompressor`, `CitationTracker`, `RelevanceScorer` |
| `packages/ingestion` | Full 15-step pipeline (steps 1–13 functional), all parsers (PDF, DOCX, GDoc, GSheet, GSlides, code, transcript), `DriveDiscovery`, `BatchProcessor` queue setup |
| `packages/knowledge-graph` | `Neo4jClient` connection + health, `GraphOperations` (CRUD, traversal, subgraph, toReadableText) |
| `packages/memory` | Tiers 1–4 functional (Redis working memory, Prisma session summaries, keyword episodic search, Neo4j semantic), `addToWorkingMemory`, `storeEpisodicMemory`, `summariseSession` |
| `packages/tools` | All 20+ tools implemented: `searchKnowledgeBase`, `getGraphContext`, `webSearch`, `saveClientContext`, `saveAnalysis`, `draftEmail`, `analyzeImage`, `ingestDocument`, `scheduleAriaMeeting`, all Google Workspace tools (Docs/Sheets/Drive/Gmail/Calendar), GitHub tools |
| `apps/api` | Server setup, Helmet + CORS + rate limiting, graceful shutdown, environment validation, request ID injection, structured JSON logging |
| `apps/web` | All 7 pages + 30+ components, React Query, SSE event stream consumption |

---

## 4. SECURITY AUDIT

### CRITICAL severity

**SEC-1: Raw Gemini API key sent to browser**  
`apps/api/src/routes/aria.ts:75-82`
```typescript
res.json({
  apiKey: geminiKey,   // ← live production key sent to any authenticated browser
  systemInstruction: config.systemInstruction,
  ...
})
```
Any user can extract this key from browser devtools and use it to make unlimited Gemini API calls at your expense. The code has a comment acknowledging this: "In production, use ephemeral tokens instead." This is **not production-safe under any circumstances**.  
**Fix:** Use Gemini's ephemeral token endpoint or proxy all Gemini Live traffic through the backend WebSocket relay.

**SEC-2: OAuth state parameter is not signed — CSRF possible**  
`apps/api/src/routes/integrations.ts:62-89`
```typescript
const stateData = JSON.parse(Buffer.from(state, 'base64url').toString()) as {
  userId: string
  provider: string
}
// No HMAC verification — attacker can forge state with any userId
await prisma.integration.upsert({
  where: { id: `${stateData.userId}_${stateData.provider}` },
  ...
```
The OAuth `state` is base64-encoded JSON with no HMAC signature. An attacker can craft a state that encodes `userId` of another user, then complete the flow with their own Google account, causing the victim's user record to be linked to the attacker's Google credentials. This is a standard OAuth CSRF attack.  
**Fix:** Sign the state with HMAC-SHA256 using `JWT_SECRET`. Verify signature before trusting `stateData.userId`.

**SEC-3: Drive webhook has no request signature verification**  
`apps/api/src/routes/integrations.ts:102-126`  
Google sends push notifications to `POST /api/integrations/google/drive-webhook`. The handler reads headers and calls `webhookHandler.handleNotification()` with no verification that the request actually came from Google. Anyone who knows the webhook URL can send fabricated notifications.  
**Fix:** Verify the `X-Goog-Channel-Token` header or use a secret channel token per registration.

**SEC-4: Integration ID is predictable and forgeable from the OAuth callback**  
`apps/api/src/routes/integrations.ts:73-74`
```typescript
where: { id: `${stateData.userId}_${stateData.provider}` },
```
Since `stateData` is attacker-controlled (SEC-2), the `id` is predictable. This is compounded by SEC-2.

### HIGH severity

**SEC-5: CORS is open wildcard**  
`apps/api/src/index.ts:27`
```typescript
app.use(cors())
```
`cors()` with no options allows requests from any origin. In production this should be restricted to the frontend domain.  
**Fix:** `app.use(cors({ origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? 'http://localhost:3000' }))`

**SEC-6: Drive folder search interpolates user input into Google API query string**  
`apps/api/src/lib/drive-sync.ts:145-146`
```typescript
query: `name contains '${folderName.split('-')[0] ?? folderName}' and mimeType = 'application/vnd.google-apps.folder'`
```
`folderName` comes from `req.body.folderName` (user input). If a user passes `' or '1'='1`, the Drive query filter could be manipulated. This is a Google Drive API injection vulnerability. It won't execute arbitrary SQL but can enumerate files the user shouldn't access.  
**Fix:** Sanitize by escaping single quotes: `folderName.replace(/'/g, "\\'")`

**SEC-7: File type validation only checks MIME type, not content**  
`apps/api/src/routes/knowledge.ts:14-19`  
Multer's `fileFilter` trusts the `Content-Type` header from the client. An attacker can upload a `.exe` with `Content-Type: application/pdf` and it will be accepted, chunked, embedded, and stored.  
**Fix:** Add magic byte validation (e.g., `file-type` npm package) after parsing the buffer.

**SEC-8: Health endpoint leaks infrastructure details publicly**  
`apps/api/src/routes/health.ts` — `GET /api/health` is a public route (no auth). It returns the status of DB, Redis, Neo4j, Anthropic, and Ollama. An attacker can use this to enumerate which services are running and identify attack surface.  
**Fix:** Return only `{ status: "ok" | "degraded" }` publicly. Move detailed status behind auth.

**SEC-9: JWT secret reads from env at call time, not at startup**  
`apps/api/src/middleware/auth.ts:45-48`
```typescript
const secret = process.env['JWT_SECRET']
if (!secret) {
  throw new Error('JWT_SECRET env var is required')
}
```
This throws a 500 error at request time if the env var is somehow unset after startup, rather than failing at startup. The `env.ts` validation marks `JWT_SECRET` as required, so this is defense in depth — but the behavior under failure is a thrown exception rather than a clean error response.

### MEDIUM severity

**SEC-10: `$queryRawUnsafe` used in vector search**  
`packages/rag/src/hybrid-retriever.ts:119`
```typescript
const rows = await this.prisma.$queryRawUnsafe(sql, ...params) as VectorSearchRow[]
```
The SQL string is built with string concatenation but all user-controlled values (`userId`, `clientId`, `temporalFilter`) are passed as numbered parameters (`$1`, `$2`, etc.). This is parameterized correctly and is **not** a SQL injection risk in its current form. However, `$queryRawUnsafe` should be audited any time the SQL string changes, as future contributors may not realize the risk.  
**Recommendation:** Document the parameterization explicitly with a comment.

**SEC-11: `$executeRawUnsafe` for embedding update**  
`packages/ingestion/src/pipeline.ts:519-521`  
`packages/ingestion/src/routes/sync.ts:541-543`
```typescript
await this.prisma.$executeRawUnsafe(
  `UPDATE document_chunks SET embedding = $1::vector WHERE id = $2`,
  vectorStr, created.id
)
```
`vectorStr` is constructed from `embedding.join(',')` where embedding is a `number[]` from the Voyage AI response. If the Voyage AI response is compromised or tampered, the vector string could potentially inject characters. The `$1` parameterization should protect against injection here, but `$executeRawUnsafe` should still be audited.

**SEC-12: Delegation results stored with session tags — userId scoping gap**  
`packages/agents/src/aria.ts:188-194`  
When delegation completes, results are stored in `AgentMemory` tagged with the `sessionId`. The `/api/aria/delegation-status` route fetches these by `userId` and filters by `sessionId` tag client-side. However, there is no check that the session actually belongs to the authenticated user in this path — the session tag is used as the only filter. If two users happen to have the same session ID (UUID collision is negligible but the pattern is fragile), or if a session ID is guessable, results from one user could be visible to another.

**SEC-13: Email HTML body is not sanitized beyond simple entity escaping**  
`apps/api/src/routes/exports.ts:184-187`
```typescript
const htmlBody = `<pre style="...">
  ${markdownContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
</pre>`
```
This escaping is correct for the message content. However, if an attacker controls the session title (`exportTitle`) which is used as the email `subject`, it is passed unescaped. Email subjects don't render HTML so this is not XSS, but should be noted.

---

## 5. PERFORMANCE CONCERNS

### HIGH impact

**PERF-1: Drive sync is fully sequential — no concurrency**  
`apps/api/src/lib/drive-sync.ts:262-314`  
Files are processed one at a time in a `for` loop. Each file spawns a new Node child process (`runPipelineWorker`), waits for it to finish, then moves to the next. A Drive folder with 100 files runs 100 sequential child processes.  
**Estimated cost:** 100 files × ~10s each = ~16 minutes for a mid-size Drive sync.  
**Fix:** Process 3–5 files concurrently using `Promise.allSettled()` with a concurrency limit.

**PERF-2: Ingestion pipeline stores chunks serially in a loop**  
`packages/ingestion/src/pipeline.ts:502-525`  
```typescript
for (let i = 0; i < chunks.length; i++) {
  const created = await this.prisma.documentChunk.create(...)
  await this.prisma.$executeRawUnsafe(...)  // embedding update
}
```
For a 50-chunk document: 100 sequential DB round trips.  
**Fix:** Batch insert with `createMany()`, then batch-update embeddings with a single `$executeRawUnsafe` with unnested array.

**PERF-3: Contextual retrieval calls Claude Haiku once per chunk**  
`packages/ingestion/src/pipeline.ts:386-429`  
For a document with 50 chunks, this fires 50 sequential Haiku API calls. At ~0.5s each = 25 seconds per document just for contextual retrieval, before entity extraction.  
**Fix:** Batch up to 20 chunks per Haiku call using structured output.

**PERF-4: Entity extraction loops over chunk groups serially**  
`packages/ingestion/src/pipeline.ts:529-583`  
Each group triggers a separate Haiku call. Up to 3 groups = 3 sequential calls. These could run in parallel.

**PERF-5: Delegation-status does full table scan + client-side filter**  
`apps/api/src/routes/aria.ts:334-368`
```typescript
const results = await prisma.agentMemory.findMany({
  where: { userId: req.userId!, memoryType: 'EPISODIC' },
  take: 50,
})
// Filter client-side for session tag match (Json column limitation)
const sessionResults = results.filter((r) => {
  const tags = r.tags as string[] | null
  return tags?.includes(sessionId)
})
```
Fetches 50 rows and filters in JS. Any user with >50 episodic memories will never see delegations beyond the first 50.  
**Fix:** Use `prisma.$queryRaw` with a Postgres JSON array contains operator: `WHERE tags @> $1::jsonb`.

**PERF-6: Gmail sync inserts chunks one at a time**  
`apps/api/src/routes/sync.ts:518-527`  
Creates a `KnowledgeDocument` then a `DocumentChunk` then runs an embedding update as three separate DB round trips per email. For 50 emails = 150 DB calls.

**PERF-7: Vector search runs per-query instead of batched**  
`packages/rag/src/hybrid-retriever.ts:76-145`  
A loop runs one SQL query per item in `query.vectorQueries`. A decomposed query with 3 sub-queries runs 3 sequential pgvector searches. Since they all use the same query embedding, they could be deduped to a single query.

**PERF-8: InferenceEngine spawns a new `Neo4j` driver instance on every health check**  
`apps/api/src/routes/health.ts:29-46`  
`checkNeo4j()` creates a new `neo4j.driver()` on every health check request. The health endpoint is called frequently (every ~30s from the frontend dashboard). Each call opens and closes a connection pool.  
**Fix:** Reuse the `Neo4jClient` singleton from `@axis/knowledge-graph`.

**PERF-9: Missing pagination on session messages**  
`apps/api/src/routes/sessions.ts:85-89`  
`GET /api/sessions/:id` includes all messages with no pagination. A long session with 500+ messages loads everything in one query.  
**Fix:** Add `cursor`-based pagination.

**PERF-10: No database connection pool configuration**  
Prisma uses default connection pool settings. Under concurrent AI requests (each request runs 4-8 DB queries), the default pool (10 connections) will exhaust quickly.  
**Fix:** Set `connection_limit` in `DATABASE_URL` or configure Prisma's `pool` settings.

---

## 6. PRIORITIZED FIX LIST

### P0 — Fix before any production traffic

| # | Issue | Fix | Effort |
|---|-------|-----|--------|
| F1 | **SEC-1: Gemini API key exposed to browser** | Replace with server-side proxy WebSocket or Gemini ephemeral token API | 1–2 days |
| F2 | **SEC-2: OAuth state not signed** | Add HMAC-SHA256 signature to state param, verify on callback | 2 hours |
| F3 | **B6: clientId always null in agent context** | In `aria.ts:handleTextMessage()`, look up `session.clientId` from Prisma before building context | 30 min |
| F4 | **B7: Wrong Gemini model name** | Change `'gemini-3.1-flash-live-preview'` → `'gemini-2.0-flash-live'` in `aria.ts:291` | 5 min |
| F5 | **SEC-5: CORS wildcard** | Pass `origin` option to `cors()` in `apps/api/src/index.ts:27` | 15 min |
| F6 | **SEC-3: Webhook not verified** | Require and verify `X-Goog-Channel-Token` header on Drive webhook | 2 hours |

### P1 — Fix before first user

| # | Issue | Fix | Effort |
|---|-------|-----|--------|
| F7 | **B1–B3: Webhook handler is a full stub** | Implement `processFileChange()` with real Drive API calls, wire `registerChannel()` and renewal cron | 3–5 days |
| F8 | **B4: Distribute endpoint is a no-op** | Implement actual email/Docs distribution via Google tools or remove from UI | 1–2 days |
| F9 | **Missing auth flow** | Add `POST /api/auth/login` (Google OAuth or email/password), `POST /api/auth/logout`, user creation on first login | 2–3 days |
| F10 | **PERF-1: Sequential Drive sync** | Add concurrency (3–5 parallel workers) in `syncDriveFolder()` | 4 hours |
| F11 | **PERF-2: Serial chunk insertion** | Replace loop in `storeChunks()` with batch insert + single embedding update query | 3 hours |
| F12 | **SEC-6: Drive query injection** | Sanitize `folderName` before interpolating into Google Drive query | 30 min |
| F13 | **SEC-8: Health endpoint leaks infra details** | Gate detailed health behind auth, return only `{status}` publicly | 1 hour |

### P2 — Fix within first sprint

| # | Issue | Fix | Effort |
|---|-------|-----|--------|
| F14 | **B9: Episodic search is keyword-only** | Replace `searchEpisodicMemory()` with pgvector cosine search on `AgentMemory.embedding` | 1 day |
| F15 | **B10: delegation-status O(N) scan** | Use Postgres JSON array contains in the query instead of client-side filter | 2 hours |
| F16 | **B12: Ollama/Qwen3 never called** | Fix `route()` to call `executeLocal()` for `classify`, `entity_extract`, `entity_verify` tasks per routing table intent | 4 hours |
| F17 | **PERF-3: Contextual retrieval = N API calls** | Batch chunks in groups of 20 per Haiku call | 3 hours |
| F18 | **PERF-8: Neo4j driver created per health check** | Reuse `Neo4jClient` singleton from `@axis/knowledge-graph` | 1 hour |
| F19 | **SEC-7: File type validated by MIME only** | Add `file-type` magic byte check after multer upload | 2 hours |

### P3 — Fix within first month

| # | Issue | Fix | Effort |
|---|-------|-----|--------|
| F20 | **B5: Re-retrieval is a no-op stub** | Implement actual re-retrieval with expanded/refined queries in `triggerReRetrieval()` | 2–3 days |
| F21 | **B8: No pub/sub for ingestion events** | Wire Redis pub/sub in `publishEvent()`, consume in frontend for real-time progress | 1–2 days |
| F22 | **PERF-5: No session message pagination** | Add cursor-based pagination to `GET /api/sessions/:id` | 3 hours |
| F23 | **PERF-10: No DB connection pool config** | Add `?connection_limit=20&pool_timeout=30` to `DATABASE_URL`, configure Prisma for production | 1 hour |
| F24 | **B11: Archival tier returns only a count** | Fetch summaries of most recent exports from `ExportRecord` table | 1 day |
| F25 | **Tier 2 summary: raw messages, not LLM summaries** | Replace `getSessionSummary()` snippet logic with actual `summariseSession()` persisted results | 1 day |

---

## Summary

**What's solid:** The architecture is well-designed. The InferenceEngine, RAG pipeline, tool registry, encryption, and most API routes are clean, properly validated, and production-quality. The 15-step ingestion pipeline, GitHub/Gmail sync, and PDF/Google export all work correctly.

**What's dangerous right now:** The Gemini API key is sent to the browser (F1), OAuth lacks CSRF protection (F2), and the Drive webhook is unverified (F6). These three issues mean the system cannot accept real users in its current state.

**What's misleading:** The `distribute` endpoint, the webhook handler, and the re-retrieval loop all return success responses while doing nothing. These will silently fail in user testing without errors being surfaced.

**Biggest architectural gap:** `clientId: null` throughout the agent context chain (B6) means client-scoped RAG, Neo4j queries, and tool calls are all currently unscoped. This is a data isolation risk that needs to be fixed before onboarding multiple consulting clients.
