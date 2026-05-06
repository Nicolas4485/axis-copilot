# Axis Copilot — Mid-Market PE Edition
## Product Requirements Document + Target Firm Research
**Version:** 1.0 | **Date:** April 2026 | **Author:** Nicolas Sakr

---

## Executive Summary

Axis Copilot is being repositioned as the AI analyst platform for mid-market private equity firms ($1B–$10B AUM). The core thesis: these firms process 100–300 deals per year with small teams (15–40 investment professionals), rely heavily on manual CIM analysis and document review, and have no dedicated AI engineering capability to build what they need internally.

The existing Axis architecture (multi-agent, hybrid RAG, conflict detection, 5-tier memory) is technically well-suited for this market. The gap is product fit: PE firms don't need a "chat assistant" — they need an AI analyst that ingests a CIM, surfaces contradictions, and produces a first-draft IC memo before the associate finishes their coffee.

This spec defines what to build, in what order, to reach a demoable product that closes a pilot within 60 days.

---

## User Research Findings

### Who You're Building For

**Primary persona: The Associate (analyst of record on a deal)**
- 2–5 years of experience, MBA or finance background
- Responsible for initial CIM screening, financial model, and first-draft IC memo
- Spends 60–100 hours per deal on document analysis before management meetings
- Currently uses Excel, PowerPoint, and generic AI (ChatGPT/Copilot) with no institutional memory
- Pain: "I've read 40 healthcare services CIMs and every time I start from scratch."

**Secondary persona: The VP / Deal Lead (owns the deal, manages the associate)**
- Reviews associate work, pushes back on diligence, attends management meetings
- Wants a "red flags up front" view — what's worth digging into before committing time
- Pain: "I spend 3 hours reviewing a 200-page VDR before I can even tell if this is worth pursuing."

**Economic buyer: The COO / Operating Partner (budget and strategy)**
- Responsible for firm-wide technology adoption and operational efficiency
- Cares about: deal velocity, IC memo quality, analyst time savings, competitive edge in deal sourcing
- Pain: "My best associates are spending 70% of their time on work that shouldn't require their judgment."

### Core Jobs-to-be-Done

1. **When** a new CIM lands in my inbox, **I want to** know within 30 minutes whether this deal is worth pursuing, **so I can** stop wasting 40 hours on deals that should have been screened out.

2. **When** I'm doing full due diligence, **I want to** surface every contradiction between what management says and what the financials show, **so I can** prepare the right questions for the management meeting.

3. **When** I'm writing the IC memo, **I want to** have a structured first draft pulled from all my diligence work, **so I can** spend my time on judgment calls rather than document assembly.

4. **When** I'm looking at a new deal in a sector we've done before, **I want to** instantly pull what we learned from previous deals in that sector, **so I can** apply institutional knowledge instead of starting from zero.

5. **When** my Managing Director asks for a deal update, **I want to** generate a current status summary in 60 seconds, **so I can** stay focused on the analysis rather than status reporting.

### Key Research Findings (Validated by Industry Data)

- **83% of PE leaders** acknowledge their due diligence practices remain outdated (manual processes dominant)
- **AI reduces deal cycles by 30–50%** and deal costs by 20% — the ROI case is already made
- **Current tools (Hebbia, Brightwave) have critical gaps:**
  - Document search only — no synthesis into PE-specific deliverables (IC memo, battlecard, management assessment)
  - No institutional memory across deals — each engagement starts fresh
  - No contradiction/conflict detection across document sources
  - Heavy IT implementation (months) — no self-serve onboarding
  - No multi-agent parallel analysis
- **74% of dealmakers already use some AI** but mostly generic tools — the gap is PE-specific workflows
- **Insight velocity** — firms that structure internal deal data into real-time signals outperform on sourcing
- **Middle-market is underserved** — vendor focus has been on mega-fund PE (Blackstone, Apollo) where budget is largest but procurement cycles are longest

### What Mid-Market PE Firms Have Today

| Tool Category | What They Use | Gap |
|---|---|---|
| CRM / Deal Flow | Salesforce, Affinity, DealCloud | No AI analysis layer, no document synthesis |
| Document Analysis | Hebbia, Brightwave, or nothing | No conflict detection, no IC memo output |
| Communication | Gmail / Outlook | No integration with deal context |
| Collaboration | Notion, Confluence, or SharePoint | No deal-specific structure |
| Financial Modeling | Excel (always) | No AI extraction from source documents |
| VDR | Datasite, Intralinks, Box | Manual download and review |
| Market Research | Third Bridge, AlphaSense, manual | Expensive per-report, no institutional memory |

---

## Build Order: 4 Phases

```
Phase 1 (Weeks 1–2):  Fix what's broken → get to a working demo
Phase 2 (Weeks 3–6):  PE core workflow → CIM-to-memo pipeline
Phase 3 (Weeks 7–10): Team collaboration → multi-user firm deployment  
Phase 4 (Weeks 11–16): Intelligence layer → institutional memory advantage
```

---

## Phase 1: Critical Fixes (Demo-Blockers)

**Goal:** A clean, working demo that doesn't break or leak data. Nothing else matters until this is done.

---

### 1.1 — Fix Client/Deal Data Isolation

**Problem:** `clientId` is passed as `null` throughout the Aria context, RAG retrieval, and Neo4j graph operations. This means every user's data is mixed together in the knowledge graph. This is a catastrophic data leakage risk for any enterprise client.

**⚠️ PERSONAL USE SAFETY — READ BEFORE IMPLEMENTING:**
The owner uses this app personally and has existing sessions, documents, and memories
with null clientId. A naive fix that adds `WHERE client_id = $clientId` will make all
existing personal data invisible to Aria. The fix MUST handle this safely:

1. **Run a migration first** — find the owner's userId, look up or create a Client record
   named "Personal" for that user, then backfill all existing records that have null clientId
   (sessions, documents, document_chunks, agent_memories, stakeholders, cost_records,
   conflict_records) to point to that Personal client's id. Do this BEFORE adding any filters.

2. **Implement a "Personal" default** — if a session has no clientId set, the app should
   automatically resolve it to the user's Personal client rather than throwing or returning
   null. Never let clientId be null in agent context.

3. **Verify personal use still works** — after the fix, open the app as the owner, confirm
   existing sessions load correctly and Aria can still access previously ingested documents.

**What to build:**
- Run backfill migration to assign existing null-clientId records to a "Personal" client
- Ensure `clientId` is extracted from the session record and passed to every agent, RAG query, and Neo4j operation
- All pgvector queries must include `WHERE client_id = $clientId` scoping
- All Neo4j queries must scope to the client subgraph via relationship traversal from the Client node
- All Redis memory keys must include `clientId` in the namespace: `memory:{userId}:{clientId}:{sessionId}`
- Validate: create two clients, ingest a document for each, confirm a session for Client A cannot retrieve content from Client B

**Acceptance criteria:**
- [ ] Backfill migration runs cleanly — zero records left with null clientId
- [ ] Existing personal sessions still load and Aria responds correctly after the fix
- [ ] `clientId` is never null in any agent context object
- [ ] pgvector search results only return chunks belonging to the active client
- [ ] Neo4j graph traversal is scoped to the active client's node cluster
- [ ] Redis working memory is namespaced per client
- [ ] Integration test: two clients, isolated document retrieval confirmed

**Files to change:**
- `prisma/migrations/` — new migration: create Personal client + backfill null clientIds
- `packages/agents/src/aria.ts` — extract clientId from session before building agent context
- `packages/rag/src/retriever.ts` — add clientId filter to all vector queries
- `packages/knowledge-graph/src/operations.ts` — scope all queries to client subgraph
- `packages/memory/src/infinite-memory.ts` — namespace Redis keys with clientId
- `apps/api/src/routes/sessions.ts` — pass clientId when building Aria context

---

### 1.2 — Build Proper Auth & Registration Flow

**Problem:** The app assumes pre-issued JWTs. There is no login page that actually works, no registration, and no session management that would survive a real demo.

**What to build:**
- `/login` page: Google OAuth button that triggers `/api/auth/google` → OAuth callback → JWT issuance → redirect to dashboard
- `/register` page: email + name → creates User record → issues JWT → redirect to onboarding
- JWT stored in httpOnly cookie (not localStorage)
- Auth middleware on all API routes: extract JWT from cookie, attach `req.user`
- Logout: clear cookie, redirect to `/login`
- Protected route wrapper in Next.js: redirect unauthenticated users to `/login`

**Acceptance criteria:**
- [ ] User can sign in with Google OAuth from a fresh browser session
- [ ] User can register with email/name (for firms not using Google Workspace)
- [ ] JWT is stored in httpOnly cookie, not accessible from JavaScript
- [ ] All API routes return 401 if no valid JWT
- [ ] Refreshing the browser after login keeps the user logged in
- [ ] Logout clears session and redirects to login

**Files to change / create:**
- `apps/web/src/app/login/page.tsx` — Login UI with Google OAuth button
- `apps/web/src/app/register/page.tsx` — Registration form
- `apps/web/src/middleware.ts` — Next.js middleware to protect routes
- `apps/api/src/routes/auth.ts` — OAuth callback, JWT issuance, logout
- `apps/api/src/middleware/auth.ts` — JWT verification middleware

---

### 1.3 — Fix Gemini Live Voice Mode

**Problem:** The Gemini Live model name in `apps/api/src/routes/aria-live-ws.ts` is set to `'gemini-3.1-flash-live-preview'` which does not exist. Voice mode will fail on first use.

**What to build:**
- Update model name to current Gemini Live model: `'gemini-2.0-flash-live-001'` (verify against Google AI SDK)
- Add error handling: if Gemini Live connection fails, return a clear error message to the frontend rather than a silent WebSocket disconnect
- Add a `/api/aria/live-health` endpoint that tests the Gemini Live connection and returns status
- Frontend: show a "Voice mode unavailable" state if the health check fails, rather than a broken spinner

**Acceptance criteria:**
- [ ] Voice session initiates without errors
- [ ] Audio is transmitted and responses are received
- [ ] Failed connection shows a human-readable error in the UI
- [ ] Health endpoint returns model status correctly

---

### 1.4 — Conflict Detection Dashboard UI

**Problem:** The conflict detection engine is fully built in the backend (regex-based contradiction detection between document sources) but there is no UI to surface these findings. This is the single most valuable feature for PE due diligence — it needs to be visible.

**What to build:**

**Conflict Alert Banner in Sessions:**
- When a session has active conflicts for the current client, show a dismissable banner: "⚠️ 3 data conflicts detected in your documents — [Review]"
- Clicking Review opens the Conflict Detail view

**Conflict Detail View (`/clients/[id]/conflicts`):**
- Table showing all unresolved conflicts for this client
- Columns: Entity | Property | Value A | Source A | Value B | Source B | Date Detected | Status
- Example row: Company | Gross Margin | 40% | Management Presentation (p.12) | 31% | Audited Financials (p.8) | Apr 14 | Unresolved
- Each row: [Mark Resolved] [Flag for Follow-up] [Dismiss] actions
- Filter by: All | Unresolved | Flagged | Resolved
- Export conflicts as CSV or include in IC memo

**Inline Conflict Warnings in Chat:**
- When an agent response includes data that contradicts a known conflict, show inline warning under the message: "⚠️ Note: This figure conflicts with Audited Financials (p.8) which shows 31%"

**Acceptance criteria:**
- [ ] All conflicts detected during document ingestion appear in the Conflict Detail view
- [ ] Conflicts are scoped to the active client (no cross-client leakage)
- [ ] User can mark conflicts as resolved, flagged, or dismissed
- [ ] SSE `conflict_warning` events render as inline warnings in the chat
- [ ] Conflict count shown in client sidebar navigation

**Files to create/change:**
- `apps/web/src/app/clients/[id]/conflicts/page.tsx` — Conflict Detail view
- `apps/web/src/components/conflict-banner.tsx` — Session conflict banner
- `apps/web/src/components/chat/conflict-inline.tsx` — Inline conflict warning
- `apps/api/src/routes/clients.ts` — Add `GET /api/clients/:id/conflicts` endpoint

---

## Phase 2: PE Core Workflow

**Goal:** The CIM-to-IC-memo pipeline. A PE associate should be able to drop a CIM in and get a structured preliminary analysis + first-draft IC memo in under 10 minutes.

---

### 2.1 — Deal Pipeline Board

**Why this first:** PE firms think in deal pipelines, not "clients." Every session should live inside a deal. Restructuring the information architecture around deals is what makes everything else feel native to PE.

**Schema change needed:**

Add a `Deal` model in Prisma sitting between `Client` (the company being analyzed) and `Session` (conversations about it):

```
Client (Company) → Deal (specific transaction/engagement) → Session (conversations)
```

```prisma
model Deal {
  id          String   @id @default(cuid())
  clientId    String
  userId      String
  name        String   // e.g. "Project Falcon - Initial Screening"
  stage       DealStage // SOURCING | SCREENING | DILIGENCE | IC_MEMO | CLOSED_WON | CLOSED_LOST | ON_HOLD
  priority    Priority // HIGH | MEDIUM | LOW
  targetClose DateTime?
  sector      String?
  dealSize    String?  // e.g. "$50M-$100M"
  notes       String?
  assigneeId  String?  // which analyst owns this deal
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  client      Client   @relation(fields: [clientId], references: [id])
  sessions    Session[]
  documents   KnowledgeDocument[]
}

enum DealStage {
  SOURCING
  SCREENING
  DILIGENCE
  IC_MEMO
  CLOSED_WON
  CLOSED_LOST
  ON_HOLD
}
```

**Pipeline Board UI (`/pipeline`):**
- Kanban board with columns: Sourcing → Screening → Diligence → IC Memo → Closed
- Each deal card shows: company name, sector, deal size, assigned analyst, last activity date, # documents ingested, # unresolved conflicts
- Drag-and-drop to move deals between stages
- Click deal card → opens deal workspace (sessions, documents, conflicts, memo)
- Filter by: Analyst | Sector | Deal Size | Date Added
- Sort by: Last Activity | Stage | Priority
- "New Deal" button → create deal modal (company name, sector, deal size, stage, assign analyst)

**Deal Workspace (`/deals/[id]`):**
- Tabs: Overview | Conversations | Documents | Conflicts | IC Memo
- Overview tab: deal card with stage, key stats, recent activity feed
- All other tabs scoped to this deal

**Acceptance criteria:**
- [ ] Pipeline board renders all active deals in correct stage columns
- [ ] Deals can be moved between stages via drag-and-drop
- [ ] Deal creation modal works and creates Deal + Client records
- [ ] Deal workspace tabs all navigate correctly
- [ ] All existing sessions/documents are associated with a deal

**Files to create/change:**
- `prisma/migrations/` — new migration adding Deal model
- `apps/web/src/app/pipeline/page.tsx` — Pipeline board
- `apps/web/src/app/deals/[id]/page.tsx` — Deal workspace
- `apps/api/src/routes/deals.ts` — CRUD for deals
- Update `sessions.ts` and `knowledge.ts` routes to scope by dealId

---

### 2.2 — CIM Quick Analysis (The Demo-Closing Feature)

**Why this matters:** This is the 10-minute demo that closes pilots. Drop a CIM in, click "Analyze," and within 5–8 minutes have a structured preliminary analysis with every red flag surfaced. No associate in the world can do this in under 2 hours manually.

**What to build:**

**CIM Upload Trigger:**
- On the Documents tab of any Deal, add a prominent "Run CIM Analysis" button that appears when a PDF is uploaded
- This triggers a specialized pipeline, not the standard ingestion

**CIM Analysis Pipeline (new endpoint: `POST /api/deals/:id/cim-analysis`):**

The pipeline runs these steps in order and streams progress via SSE:

1. **Ingest & Parse** — Run existing 15-step ingestion pipeline on the uploaded CIM
2. **Structure Extraction** — Use Claude Sonnet to extract structured fields:
   - Company overview (name, HQ, founding year, employees, revenue, EBITDA, margins)
   - Business description (products/services, customers, channels)
   - Financial summary (last 3 years revenue, EBITDA, growth rates)
   - Management team (names, titles, tenures)
   - Key risks (as stated by management)
   - Growth initiatives
3. **Conflict Detection Pass** — Cross-reference all extracted figures against each other within the CIM (does EBITDA on p.3 match the EBITDA in the financial appendix?)
4. **Red Flag Analysis** — Sean (Product Agent) + Kevin (Process Agent) run in parallel analyzing:
   - Sean: "Is this business model durable? What are the product/market risks?"
   - Kevin: "What are the operational risks and process dependencies?"
5. **Competitive Context** — Mel (Competitive Agent) runs: "Who are the main competitors and how is this company positioned?"
6. **Preliminary Scoring** — Generate a preliminary fit score across 5 dimensions: Market Quality, Business Quality, Financial Quality, Management Quality, Deal Quality (1–10 each with rationale)
7. **Summary Generation** — Produce a structured 2-page preliminary analysis

**CIM Analysis Output View:**
- Structured card view (not raw chat) showing:
  - **Company Snapshot** — extracted key fields in a clean summary card
  - **Preliminary Fit Score** — 5-dimension spider/radar chart
  - **Red Flags** — numbered list, each with source reference ("p.14 states X, but p.42 shows Y")
  - **Key Questions** — auto-generated list of questions to ask management
  - **Agent Insights** — expandable cards for Sean, Kevin, Mel findings
- Export as PDF or copy to IC Memo

**Acceptance criteria:**
- [ ] CIM upload triggers "Run CIM Analysis" prompt
- [ ] Analysis completes within 8 minutes for a 50-page CIM
- [ ] Progress streamed via SSE with step-by-step status updates
- [ ] Structured extraction captures all key financial figures
- [ ] Conflicts within the CIM itself are surfaced
- [ ] Red flags are specific with source page references
- [ ] Output can be exported as PDF

**New files to create:**
- `apps/api/src/routes/cim-analysis.ts` — CIM analysis endpoint + SSE streaming
- `packages/agents/src/cim-analyst.ts` — Specialized CIM analysis orchestrator
- `packages/inference/src/prompt-library.ts` — Add CIM extraction and scoring prompts
- `apps/web/src/app/deals/[id]/cim-analysis/page.tsx` — CIM analysis output view
- `apps/web/src/components/cim/fit-score-radar.tsx` — Radar chart component

**⚠️ Enhancement: Multimodal Chart Extraction (add inside Step 1 of the CIM pipeline)**

A typical 50-page CIM contains 15–20 charts and tables rendered as images — revenue trend lines, market size visuals, competitive positioning maps, org charts. The standard PDF text parser extracts zero data from these. This means the conflict detection engine and agents are blind to visual financial data, which is exactly where discrepancies hide.

**What to add to the ingestion pipeline (`packages/ingestion/src/pipeline.ts`):**

After the PDF parse step, add a new step: `extractPageImages`.

For each page in the PDF that contains an embedded image or a page that renders as primarily non-text:
1. Render the page as a PNG using `pdf2pic` or `pdfjs-dist` canvas output
2. Send the image to Claude Sonnet vision with this prompt:
   > "You are analyzing a page from a private equity CIM. Describe any charts, tables, or figures on this page in structured text. For each chart: state the chart type, the metric shown, the time period, and all visible data points or ranges. For tables: extract all rows and columns as structured text. If this page is primarily text with no charts, respond with null."
3. Store the vision-extracted text as an additional chunk for that page, tagged with metadata `{ sourceType: "chart_extraction", pageNumber: N }`
4. Include these chunks in the conflict detection pass — a chart showing 28% EBITDA margin when the text claims 40% is a red flag

**Additional acceptance criteria for 2.2:**
- [ ] PDF pages with charts are detected and rendered to images during ingestion
- [ ] Claude vision describes each chart as structured text (metric, period, values)
- [ ] Chart-extracted chunks are stored in pgvector alongside text chunks
- [ ] Conflict detection compares chart data against text figures
- [ ] CIM analysis output view shows "Extracted from chart — p.12" as a source reference

**Additional files to create/change:**
- `packages/ingestion/src/pipeline.ts` — Add `extractPageImages` step after PDF parse
- `packages/ingestion/src/parsers/chart-extractor.ts` — pdf2pic rendering + Claude vision call
- `packages/inference/src/prompt-library.ts` — Add `chart_extraction` prompt (TASK tier, ≤400 tokens)

**Note on cost:** Claude Sonnet vision costs ~$0.003 per image. A 50-page CIM with 20 chart pages = ~$0.06 extra per CIM ingestion. Negligible.

---

### 2.3 — Investment Committee Memo Generator

**Why this matters:** Writing the IC memo is the most time-consuming deliverable in PE. It synthesizes all diligence work into a structured document that goes to the Investment Committee. A first draft that's 70% there saves 15–20 hours per deal.

**What to build:**

**IC Memo Template (PE standard structure):**
```
1. Executive Summary (1 page)
   - Investment thesis in 3 bullet points
   - Deal overview (size, structure, price)
   - Recommendation (Proceed / Pass / More Diligence)

2. Company Overview
   - Business description
   - Products/services and revenue breakdown
   - Customer base and concentration
   - Geographic footprint

3. Market Analysis
   - Market size and growth
   - Competitive landscape
   - Company positioning

4. Financial Analysis
   - Historical performance (3 years)
   - Revenue and EBITDA trends
   - Unit economics
   - Working capital dynamics

5. Investment Thesis
   - Value creation levers (3–5 specific drivers)
   - Upside case scenario
   - Base case scenario

6. Key Risks
   - Risk | Probability | Impact | Mitigation
   (table format, at least 5 risks)

7. Management Assessment
   - Key personnel
   - Track record
   - Retention risks

8. Due Diligence Findings
   - Confirmed positives
   - Open items / red flags
   - Data conflicts identified

9. Recommendation & Next Steps
```

**Memo Generator Endpoint (`POST /api/deals/:id/generate-memo`):**
- Pull all sessions, analyses, documents, and conflicts for the deal
- Use Claude Sonnet (streaming) to generate each section using available context
- Where data is missing, mark with `[DATA NEEDED: description]` placeholder
- Preserve all source citations from RAG retrieval

**Memo Editor UI (`/deals/[id]/memo`):**
- Rich text editor (use existing Markdown renderer or add Tiptap)
- Left panel: section navigator
- Right panel: "Context Panel" showing source documents and agent analyses for each section
- "Regenerate Section" button per section (re-runs Claude on that section with updated context)
- Export options: PDF, Word (.docx), Markdown
- Version history: save snapshots when significant changes made

**Acceptance criteria:**
- [ ] Memo generates from deal context in under 3 minutes
- [ ] All 9 sections populated (with `[DATA NEEDED]` placeholders where data is missing)
- [ ] Each claim in the memo links to source document + page
- [ ] Individual sections can be regenerated without regenerating the full memo
- [ ] Memo exports as PDF and Markdown correctly
- [ ] Version history shows at least last 5 saves

**New files to create:**
- `apps/api/src/routes/memo.ts` — Memo generation endpoint
- `packages/agents/src/memo-writer.ts` — Memo generation orchestrator
- `apps/web/src/app/deals/[id]/memo/page.tsx` — Memo editor
- `apps/web/src/components/memo/section-editor.tsx` — Per-section edit + regenerate
- `apps/web/src/components/memo/context-panel.tsx` — Source context sidebar

---

### 2.4 — VDR & Bulk Document Ingestion

**Why this matters:** PE associates receive deal materials in VDRs (Datasite, Intralinks) or Box folders containing hundreds of documents. The existing upload (50MB, one file at a time) doesn't fit this workflow.

**What to build:**

**Box Integration (highest priority — most PE firms use Box):**
- OAuth connect flow for Box (add to Integrations settings page)
- `POST /api/sync/box` — list all folders in a connected Box workspace, let user select a deal folder, bulk ingest all PDFs/Docs inside it
- Progress SSE stream showing per-file status
- Estimated completion time shown in UI

**Zip Upload (fastest to build, immediate value):**
- Allow zip file upload in addition to individual files
- Backend: extract zip, enumerate all supported file types, run ingestion pipeline on each
- Progress: `{completed: N, total: M, currentFile: "filename.pdf"}`
- Reject: password-protected files, unsupported types

**Enhanced Bulk Ingestion UI:**
- Grid view of all documents in a deal (not just a list)
- Status badges: Queued | Ingesting | Complete | Failed
- Conflict count per document (how many contradictions were found involving this doc)
- "Re-ingest" button for failed documents
- Bulk select + delete

**Datasite / Intralinks (Phase 4 — these require custom API agreements):**
- Stub the routes now, document as future integration
- For now: users export from Datasite as zip → upload to Axis

**Acceptance criteria:**
- [ ] Zip file containing 50 PDFs ingests successfully without timeout
- [ ] Each file in a zip shows individual progress in the UI
- [ ] Box OAuth connect flow works end-to-end
- [ ] Box folder sync ingests all supported file types
- [ ] Failed ingestions show clear error reason and "Retry" button
- [ ] Bulk ingestion doesn't block the API for other requests (queue-based)

**Files to create/change:**
- `apps/api/src/routes/integrations.ts` — Add Box OAuth routes
- `apps/api/src/routes/knowledge.ts` — Add zip upload handler
- `packages/ingestion/src/bulk-processor.ts` — Parallel bulk ingestion with queue
- `apps/web/src/app/deals/[id]/documents/page.tsx` — Enhanced document grid

---

## Phase 3: Team Collaboration

**Goal:** Turn Axis from a single-user tool into a firm-wide platform. A single pilot user should be able to invite their team.

---

### 3.1 — Multi-User with Role Hierarchy

**Schema additions:**

```prisma
model Organization {
  id        String   @id @default(cuid())
  name      String   // "Riverside Capital"
  domain    String?  // "riverside.com" for auto-provisioning
  plan      OrgPlan  @default(TRIAL)
  createdAt DateTime @default(now())
  members   OrgMember[]
  deals     Deal[]
}

model OrgMember {
  id             String   @id @default(cuid())
  orgId          String
  userId         String
  role           OrgRole  // PARTNER | VP | ASSOCIATE | ANALYST | ADMIN
  createdAt      DateTime @default(now())
  org            Organization @relation(...)
  user           User     @relation(...)
}

enum OrgRole {
  PARTNER        // Read all, approve IC memos, manage firm settings
  VP             // Read all deals, manage deal assignments
  ASSOCIATE      // Lead assigned deals, manage analysts on deals
  ANALYST        // Work on assigned deals only
  ADMIN          // Manage org settings, billing, user provisioning
}
```

**Invite Flow:**
- Settings → Team → "Invite Member" → enter email → select role → send invite email
- Invite link sends to email with a JWT-encoded invite token (7-day expiry)
- Recipient clicks link → creates account → joins org with assigned role
- Admin can resend, revoke, and change roles

**Role-Based Access Control:**
- PARTNER and VP: see all deals in the pipeline board
- ASSOCIATE and ANALYST: see only deals they're assigned to
- All roles: can only access documents and sessions within their visible deals
- ADMIN: full access to org settings, no deal access unless explicitly assigned

**Acceptance criteria:**
- [ ] Org admin can invite members via email
- [ ] Invited users join with correct role
- [ ] Pipeline board shows correct deals per role
- [ ] Analysts cannot see deals they're not assigned to
- [ ] Partners can see and access all deals

---

### 3.2 — Shared Deal Workspace

**What to build:**

**Deal Assignment:**
- Each deal has a "Team" section: Deal Lead (Associate/VP) + Supporting Analysts
- Partner is always a viewer of all deals
- Deal assignment notifications sent to assignees

**Shared Sessions:**
- Sessions in a deal are visible to all team members assigned to that deal
- Indicator showing who else is "active" in a session (presence awareness)
- Each message shows the avatar of the user who sent it

**Annotations:**
- Any agent response can be annotated: highlight text → add comment
- Comments are visible to all deal team members
- Comments resolve/unresolve workflow (same as GitHub PR review)
- Notification sent to deal team when a new annotation is added

**Activity Feed (on Deal Overview tab):**
- Chronological feed of all activity on the deal: documents ingested, sessions started, conflicts detected, memo updated, annotations added
- Filterable by: All | Documents | Conflicts | Memo | Comments

**Acceptance criteria:**
- [ ] Multiple users can be assigned to a deal
- [ ] Assigned users see the same deal workspace
- [ ] Messages show correct user avatars
- [ ] Annotations persist and notify deal team members
- [ ] Activity feed accurately reflects deal history

---

### 3.3 — Partner Review & Approval Workflow

**What to build:**

**IC Memo Review Workflow:**
- Associate submits memo for review: "Submit for Review" button → memo status changes to `UNDER_REVIEW`
- System notifies the Deal Lead (VP) and any assigned Partners
- Reviewer sees memo with comment/annotation tools active
- Reviewer can: Approve ("Ready for IC"), Request Changes, or Reject
- On approval: memo status changes to `APPROVED`, notification sent to associate
- On request changes: reviewer adds comments, memo returns to `IN_PROGRESS`

**Approval Trail:**
- All review actions logged with reviewer name, timestamp, and comment
- IC memo PDF export includes approval trail footer

**Acceptance criteria:**
- [ ] Associate can submit memo for review
- [ ] Reviewer receives in-app and email notification
- [ ] Reviewer can approve, reject, or request changes with comments
- [ ] All decisions logged in audit trail
- [ ] Approved memo export includes approval trail

---

## Phase 4: Intelligence Differentiation

**Goal:** Features that no competitor offers — these create switching costs and justify premium pricing.

---

### 4.1 — Financial Data Extraction Engine

**What to build:**

- Specialized ingestion mode for financial documents (income statement, balance sheet, cash flow)
- Extract structured financial data into a `FinancialSnapshot` table:
  - Company, period (year/quarter), revenue, EBITDA, EBITDA margin, net income, cash, debt, capex
- Auto-populate the Financial Analysis section of the IC memo from extracted data
- Trend visualization: revenue and EBITDA chart rendered from extracted data
- Cross-document validation: if the CIM states $45M revenue but the audited financials show $42M — flag immediately

**Why this matters:** Associates currently build the financial model manually from CIM tables. Auto-extracting these figures into structured data saves 4–6 hours per deal and eliminates transcription errors.

---

### 4.2 — Sector Knowledge Base (Compounding Institutional Memory)

**What to build:**

- Tag each deal with a sector (healthcare services, software, industrial, financial services, etc.)
- When analyzing a new deal, automatically surface: "You've analyzed 7 healthcare services deals in the past 18 months. Key patterns: [X, Y, Z]"
- "Sector Briefing" feature: for any sector, generate a synthesis of everything the firm has learned from previous deals in that sector
- Comparable deal analysis: "How does this deal's unit economics compare to the 3 healthcare services deals you've done?"

**Why this matters:** This is the feature that makes Axis irreplaceable. Every deal analyzed makes the next deal smarter. Hebbia and Brightwave can't do this — they don't have multi-deal institutional memory.

---

### 4.3 — Management Assessment Framework

**What to build:**

- Anjie (Stakeholder Agent) extended with a management assessment mode
- Input: management team bios, meeting notes, reference call notes
- Output: structured assessment per executive:
  - Role and tenure
  - Track record summary
  - Strengths and development areas
  - Key motivations (equity upside, role expansion, operational stability)
  - Retention risk (High/Medium/Low with rationale)
  - Recommended engagement approach
- Overall management team assessment: strong/adequate/weak with deal implication
- Pre-populates the Management Assessment section of the IC memo

---

### 4.4 — Deal Sourcing Intelligence

**What to build:**

- Track companies in the "Sourcing" pipeline stage with regular monitoring
- Daily digest: "3 updates on your tracked companies — [Riverside Industrial] filed new regulatory documents, [ProjectFalcon target] announced a leadership change"
- Competitor M&A tracker: when a tracked company's competitor gets acquired, flag as a signal
- Requires web search integration (already built in `packages/tools/src/web.ts`)

---

### 4.5 — RAG Quality Evaluation Framework

**Why this matters:** Right now the RAG pipeline has zero measurable quality signal. You don't know if the retriever is surfacing the right chunks, whether answers are faithful to source documents, or whether context compression is silently dropping critical financial figures. Before walking into a PE firm and claiming accuracy on deal-critical data, you need to be able to prove it — and continuously catch regressions as the pipeline evolves.

This is the one gap identified from a deep review of production RAG practices (specifically the RAGAS evaluation framework). Every other RAG technique in Axis already matches or exceeds industry standards — this is the missing quality gate.

**What to build:**

**Test Set (`packages/rag/src/eval/test-sets/`):**

Create a curated set of 60 PE-specific question-answer pairs across 3 categories:

- `financial-figures.json` (20 QA pairs) — questions about specific numbers extracted from documents. Example: `{ "question": "What was the company's EBITDA in FY2023?", "expected_answer": "$12.4M", "source_doc": "sample-cim.pdf", "source_page": 8 }`
- `risk-flags.json` (20 QA pairs) — questions about risks, contradictions, and management claims. Example: `{ "question": "Does the CIM mention any customer concentration risk?", "expected_answer": "Yes — top 3 customers represent 67% of revenue (p.14)", ... }`
- `company-facts.json` (20 QA pairs) — questions about company structure, management, and operations

Use the existing `google-2023-environmental-report.pdf` in the repo as a safe test document for initial setup (it's already used across multiple chapters of the reference book). Then seed PE-specific test cases using a sanitized sample CIM.

**Evaluation Runner (`packages/rag/src/eval/runner.ts`):**

Implement four RAGAS-aligned metrics without depending on the RAGAS Python library (keep everything in TypeScript):

```typescript
interface RAGEvalResult {
  questionId:        string
  contextPrecision:  number  // 0–1: are retrieved chunks relevant to the question?
  contextRecall:     number  // 0–1: does the retrieved context contain the answer?
  answerFaithfulness: number // 0–1: does the answer only claim things in the context?
  answerRelevance:   number  // 0–1: does the answer actually address the question?
  passed:            boolean // contextRecall > 0.8 && answerFaithfulness > 0.85
}
```

Each metric is computed by a Claude Haiku call (cheap, fast) with a binary or 0–1 scoring prompt. This keeps evaluation cost low (~$0.002 per question, $0.12 for the full 60-question suite).

**Eval CLI command:**

```bash
pnpm eval:rag
# Output:
# Context Precision:   0.84  ✅
# Context Recall:      0.79  ⚠️  (target: >0.80)
# Answer Faithfulness: 0.91  ✅
# Answer Relevance:    0.88  ✅
# Pass rate: 47/60 (78%)     ⚠️  (target: >85%)
```

**Regression guard:**
- Add eval run to CI pipeline: `pnpm eval:rag` runs on every PR that touches `packages/rag/`, `packages/ingestion/`, or `packages/inference/`
- PR fails if pass rate drops below 80% or any individual metric drops more than 5 points from baseline
- Baseline stored in `packages/rag/src/eval/baseline.json`, updated manually when intentional improvements are made

**Eval Results Dashboard (lightweight, internal only):**
- Add `/admin/rag-eval` page showing latest eval run results
- Trend chart of pass rate over last 10 runs
- Drill-down: which questions failed, what context was retrieved, what the answer was vs. expected
- Accessible only to users with `role: ADMIN`

**Acceptance criteria:**
- [ ] 60-question test set created and committed to repo
- [ ] `pnpm eval:rag` runs end-to-end and outputs all 4 metrics
- [ ] Baseline pass rate established (target: ≥85% before first firm demo)
- [ ] CI gate blocks PRs that degrade RAG quality
- [ ] `/admin/rag-eval` page renders last run results

**Files to create:**
- `packages/rag/src/eval/runner.ts` — Evaluation orchestrator
- `packages/rag/src/eval/metrics.ts` — Four RAGAS-aligned metric functions
- `packages/rag/src/eval/test-sets/financial-figures.json` — 20 QA pairs
- `packages/rag/src/eval/test-sets/risk-flags.json` — 20 QA pairs
- `packages/rag/src/eval/test-sets/company-facts.json` — 20 QA pairs
- `packages/rag/src/eval/baseline.json` — Baseline scores (auto-generated on first run)
- `apps/web/src/app/admin/rag-eval/page.tsx` — Internal eval dashboard
- `apps/api/src/routes/admin.ts` — Eval results endpoint
- Add `"eval:rag": "tsx packages/rag/src/eval/runner.ts"` to root `package.json`

**Why Claude Haiku for evaluation (not a Python RAGAS library):**
The existing stack is TypeScript. Pulling in Python + RAGAS creates a separate runtime dependency and deployment complexity. Implementing the four core metrics as Haiku calls keeps everything in one language, costs ~$0.12 per full suite run, and integrates cleanly with the existing `InferenceEngine`. The scoring accuracy is equivalent for these binary/scalar judgments.

---

## Success Metrics

### Phase 1 Success (end of week 2)
- Zero data leakage between clients in integration tests
- Login flow works end-to-end with Google OAuth
- Voice mode initiates without error
- Conflict detection visible in UI

### Phase 2 Success (end of week 6)
- CIM analysis pipeline completes in < 8 minutes for 50-page document
- IC memo generation produces all 9 sections in < 3 minutes
- VDR zip upload supports 50+ files in a single batch
- Demo closes at least 1 pilot conversation

### Phase 3 Success (end of week 10)
- Firm of 5 users can collaborate on deals with correct role isolation
- Associate → Partner review workflow completes without errors
- All deal activity visible in activity feed

### Phase 4 Success (end of week 16)
- Financial data extracted from statements with > 90% accuracy
- Sector knowledge base surfaces relevant prior deals in new deal analysis
- Management assessment generates complete output from meeting notes

---

## Open Questions

| # | Question | Owner | Blocking? |
|---|---|---|---|
| 1 | Should deals and clients be separate records, or should "Client = Deal"? One company can have multiple deal attempts over time. | Nicolas | Yes — affects schema |
| 2 | What VDRs do target firms actually use? Box vs. Datasite vs. SharePoint? | Research | Yes — affects Phase 2 priority |
| 3 | Does the IC memo template need to be configurable per firm? Some firms have proprietary templates. | Nicolas | No — v1 uses standard template |
| 4 | Should financial data extraction use Claude or a specialized financial extraction model (FinBERT, etc.)? | Engineering | No — can start with Claude Sonnet |
| 5 | What's the self-serve pricing model for pilot firms? | Nicolas | No — not needed for first pilot |

---

## Non-Goals (v1)

- **CRM integration (Salesforce, Affinity, DealCloud):** High value but high complexity. Not in v1 — firms will use Axis alongside their CRM, not instead of it.
- **SSO/SAML:** Required for enterprise procurement but not for a pilot. Google OAuth covers early adopters.
- **Financial model generation (Excel):** Structurally different capability (quantitative modeling vs. document analysis). Out of scope.
- **Datasite/Intralinks native API:** Both require enterprise partnership agreements. Use zip export as bridge.
- **SOC 2 certification:** Required for formal procurement but a pilot can proceed under a signed NDA/DPA. Start the process in parallel with Phase 3.
- **Mobile app:** PE associates work on laptops. Not needed.

---

## Target Firms: Research + Approach Strategy

### Why Mid-Market PE (Not Mega-Funds, Not Micro-Funds)

**Mega-funds (Blackstone, Apollo, KKR):**
- Have dedicated AI engineering teams already building
- Procurement cycle: 6–12 months
- CISO review alone takes 3 months
- Skip these until you have a track record and a SOC 2

**Micro-funds (<$500M AUM):**
- Budget constrained — can't afford $15K+/month
- Often single GP/LP structure — decision maker is also the analyst
- Not enough deal volume to show ROI quickly

**Mid-market sweet spot ($1B–$10B AUM):**
- 15–40 investment professionals — big enough to need AI, small enough to decide fast
- COO/Operating Partner has budget authority ($50K–$200K/year) without board approval
- High deal volume (50–200 screened per year) means clear AI ROI
- Almost none have a dedicated AI engineer
- Active deal cycle means they feel the pain right now

---

### Top 10 Target Firms

**Tier 1 — Highest Priority (approach first)**

---

**1. Audax Private Equity**
- AUM: ~$39B (but lower-mid-market focus, high deal volume)
- HQ: Boston, MA
- Why: Top 5 most active U.S. PE firm by deal count — they screen MORE deals than almost anyone. AI deal screening ROI is immediate and obvious. They're known for process discipline.
- Signal: No public AI hiring for internal tools. Their technology investments are portfolio companies, not internal ops.
- Who to contact: **Chief Operating Officer** or **Head of Operations** — Audax has a strong operations function
- Approach: "You close 40+ platform and add-on deals per year. I've built a system that cuts initial CIM review from 40 hours to 45 minutes. I want to deploy it at Audax and run it."
- LinkedIn search: "Audax Private Equity" + "Operations" + "COO" or "Chief of Staff"

---

**2. The Riverside Company**
- AUM: ~$13B
- HQ: Cleveland, OH (with offices globally)
- Why: Known for operational excellence and value creation at lower-middle-market companies. They already think in systems — they'll immediately understand the ROI framing. 200+ active portfolio companies means institutional memory is critical.
- Signal: Strong operations team, but no public AI initiatives for internal deal tools.
- Who to contact: **Operating Partner** or **Director of Portfolio Operations**
- Approach: "Your institutional knowledge across 200 portfolio companies is sitting in emails, spreadsheets, and people's heads. I've built the system that captures and resurfaces it for every new deal."
- LinkedIn search: "Riverside Company" + "Portfolio Operations" or "Operating Partner"

---

**3. LLR Partners**
- AUM: ~$8B
- HQ: Philadelphia, PA
- Why: Growth equity focus on tech and services — they're more tech-savvy than traditional buyout PE. Small deal team (~25 investment professionals) means each person carries heavy analytical load. Perfect size for a "Head of AI" hire.
- Signal: Investment in technology-driven businesses, but no internal AI team visible.
- Who to contact: **Managing Director** (LLR is flat, MDs own deal flow decisions) or **Head of Finance/Operations**
- Approach: "Your team is analyzing 100+ software and services deals per year. I've built an AI analyst that does the first 40 pages of every CIM in 45 minutes and flags every contradiction it finds."
- LinkedIn search: "LLR Partners" + "Managing Director" or "Chief of Staff"

---

**4. HGGC**
- AUM: ~$6.9B
- HQ: Palo Alto, CA
- Why: Silicon Valley location means they're AI-fluent and won't need convincing on the technology. Focus on tech-enabled businesses means they understand product value. Their deal team is small (~20 professionals) for their AUM.
- Signal: One of the few mid-market PE firms that actively publishes technology thought leadership.
- Who to contact: **Partner** (HGGC partners are directly involved in operations) or **Chief of Staff to Managing Partners**
- Approach: Silicon Valley framing — "I've built the infrastructure layer for PE deal analysis. Multi-agent, knowledge graph, conflict detection. Let me demo it."
- LinkedIn search: "HGGC" + "Partner" or "Vice President"

---

**5. Genstar Capital**
- AUM: ~$5B
- HQ: San Francisco, CA
- Why: Software-focused investing means they understand SaaS value and recurring revenue. Their sector focus (software, financial services, industrial tech, healthcare) is narrow and deep — perfect for building sector-specific institutional memory.
- Signal: No dedicated AI engineering team visible. Recent activity focused on financial services and software portfolio expansion.
- Who to contact: **Managing Director of Financial Services or Software practice** or **COO**
- Approach: "You invest in software companies for a living. The tool you're using to analyze them should be as sophisticated as the products you buy."
- LinkedIn search: "Genstar Capital" + "Managing Director" or "Operating Partner"

---

**Tier 2 — Second Wave (approach after first pilot secured)**

---

**6. Comvest Partners**
- AUM: ~$7B | HQ: West Palm Beach, FL
- Why: Southeast-based, less saturated by AI vendors who focus on NYC/Boston/SF. Mid-size team, active deal flow, operational value creation focus. COO-level decisions happen faster outside major financial centers.
- Who to contact: COO or Director of Business Development
- Approach angle: "Most of the AI tools for PE are designed for NYC mega-funds. I built something for firms like Comvest — operationally focused, high deal volume, small team."

---

**7. Trive Capital**
- AUM: ~$6B | HQ: Dallas, TX
- Why: Texas-based, similar logic to Comvest — faster decisions, less vendor competition. Operationally intensive sectors (services, manufacturing, healthcare) where process analysis agent (Kevin) is directly relevant.
- Who to contact: Operating Partner or VP Operations
- Approach angle: "Your sectors are process-heavy. The most value I've seen is in operational due diligence — mapping current state processes and identifying automation before you close."

---

**8. Renovus Capital Partners**
- AUM: ~$1.5B | HQ: Philadelphia, PA
- Why: Focuses on knowledge economy businesses (professional services, education, workforce). This is PERFECT domain fit — knowledge management IS their investment thesis. The pitch almost writes itself: "You invest in knowledge businesses. Your internal tools should reflect that."
- Who to contact: Managing Partner or COO (small firm, direct access)
- Approach angle: Direct pitch to Managing Partners — the firm is small enough that they'll see the demo themselves.

---

**9. Mainsail Partners**
- AUM: ~$2.5B | HQ: San Francisco, CA
- Why: Bootstrapped software companies exclusively. Every deal involves a founder who has never raised PE before — stakeholder and management assessment is critical. Gemini Live voice mode for founder discovery sessions is a compelling demo.
- Who to contact: Managing Director or VP (flat structure)
- Approach angle: "Your deals are founder-led. The hardest part is reading the room in the first management meeting. I've built a tool that helps with exactly that."

---

**10. Blue Point Capital Partners**
- AUM: ~$2.5B | HQ: Cleveland, OH
- Why: Lower-middle-market, industrials and services focus. Traditional sector where AI adoption is low — they're behind and know it. Cleveland proximity to Riverside (another Cleveland firm) means if one adopts, you get social proof in the same market.
- Who to contact: Partner or Director of Operations
- Approach angle: "Industrial and services PE has been the slowest sector to adopt AI tools. That's a window for you to get ahead of peers."

---

### Outreach Playbook

**Step 1 — Find the right person (15 min per firm)**
- LinkedIn: search "[Firm Name]" + "COO" or "Operating Partner" or "Chief of Staff"
- If no COO, go to the most senior operations or business development person
- Avoid: Investment Associates and Analysts (no budget authority), IR teams (wrong department), HR (they'll route you to a procurement process)

**Step 2 — The connection message (LinkedIn or email)**
Keep it to 4 sentences max:
> "Hi [Name] — I've spent the last year building an AI analyst system specifically for PE due diligence: multi-agent CIM analysis, conflict detection across documents, and IC memo generation. I'm looking to deploy it at one firm and join as Head of AI to scale it. Given [Firm]'s deal volume and operational focus, I think there's a strong fit. Would you be open to a 20-minute demo this week?"

**Step 3 — The demo (20 minutes)**
- Minute 0–2: "Here's a real CIM from a public deal. I'm going to drop it in right now."
- Minute 2–8: Watch CIM analysis pipeline run in real time. Say nothing. Let the tool work.
- Minute 8–12: Walk through conflict detection output. Point to one specific contradiction.
- Minute 12–17: Show the draft IC memo that was auto-generated from the analysis.
- Minute 17–20: "This is what I want to deploy for your firm, and I want to run it."

**Step 4 — The close**
You're not selling software. You're pitching a hire. The close is:
> "I'm not looking for a vendor agreement. I want to join [Firm] as your Head of AI, bring this infrastructure, and build it out for your specific workflow. What would the next step look like on your end?"

---

## Competitive Positioning

| Feature | Axis Copilot | Hebbia | Brightwave | Generic AI (ChatGPT/Copilot) |
|---|---|---|---|---|
| Multi-agent parallel analysis | ✅ | ❌ | ❌ | ❌ |
| Cross-document conflict detection | ✅ | ❌ | ❌ | ❌ |
| IC memo generation | ✅ | ❌ | ❌ | Partial |
| Deal pipeline management | ✅ | ❌ | ❌ | ❌ |
| Institutional memory (cross-deal) | ✅ | ❌ | ❌ | ❌ |
| Live voice discovery sessions | ✅ | ❌ | ❌ | ❌ |
| Knowledge graph (entity relationships) | ✅ | ❌ | ❌ | ❌ |
| Self-serve onboarding | ✅ | ❌ | Partial | ✅ |
| PE-specific output formats | ✅ | Partial | Partial | ❌ |
| Local model option (data privacy) | ✅ | ❌ | ❌ | ❌ |

**Positioning statement:**
*"Axis is the only AI analyst built for PE deal teams — not a document search tool, not a general chat assistant. It analyzes CIMs in minutes, surfaces contradictions no associate would catch, and generates first-draft IC memos from your full diligence work. Every deal you run makes the next deal smarter."*

---

*Document prepared April 2026. Use this directly in Claude Code as the source of truth for feature implementation. Phases are ordered by dependency — do not start Phase 2 before Phase 1 is complete.*
