# AXIS Co-Pilot — Senior Stakeholder Demo Guide
### Prepared for: Blackstone Stakeholder Presentation
### Version: 1.0 | Date: April 2026 | Confidential

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Demo Checklist](#pre-demo-checklist)
3. [Step-by-Step Demo Flow](#step-by-step-demo-flow)
4. [Suggested 30-Minute Run Order](#suggested-30-minute-run-order)
5. [Key Talking Points for a Blackstone Audience](#key-talking-points-for-a-blackstone-audience)
6. [Anticipated Questions and Answers](#anticipated-questions-and-answers)
7. [Demo Tips and Contingency Plans](#demo-tips-and-contingency-plans)

---

## Overview

**What AXIS Is**

AXIS is an AI co-pilot built specifically for private equity deal teams. It ingests a CIM, runs it through a multi-agent AI pipeline, extracts verified financial data from the source PDF, and produces a Blackstone-standard IC memo — in under three minutes. The memo then becomes a PowerPoint pitch deck with one click. Every output is traceable to source material, and every correction the analyst makes is learned by the system.

**Three-Sentence Elevator Pitch (PE Audience)**

> A senior analyst spends two to three days on the first pass of a CIM — reading, extracting financials, drafting red flags, and structuring the IC memo. AXIS compresses that to three minutes, using sector-calibrated benchmarks and real financial extraction from the PDF — not hallucinated numbers. The analyst shifts from data-gathering to judgment: they review, correct, and push to IC.

**Three Pre-Seeded Demo Deals**

| Deal | Sector | Revenue | Growth | Key Angle |
|---|---|---|---|---|
| Nexus DataOps | B2B SaaS / Data Infra | $42M ARR | 35% YoY | High NRR, platform stickiness |
| PrimeHealth Partners | Post-Acute Healthcare | $185M | 18% YoY | Reimbursement risk, aging population tailwind |
| Vertex Specialty Chemicals | Specialty Chemicals (carve-out) | $320M | 20% EBITDA margin | Carve-out complexity, pricing power |

---

## Pre-Demo Checklist

Complete this checklist no less than 30 minutes before the audience arrives. Do not skip items — a failed API call during a Blackstone demo is unrecoverable.

### Infrastructure

- [ ] `docker-compose up -d` — PostgreSQL, Redis, Neo4j all running
- [ ] `curl http://localhost:4000/api/health` returns `{ status: "ok" }` with all services green
- [ ] Ollama serving Qwen3 8B: `curl http://localhost:11434/api/tags` lists `qwen3:8b`
- [ ] Next.js frontend loads at `http://localhost:3000` (or HTTPS tunnel URL) without errors
- [ ] If using Cloudflare tunnel: confirm tunnel is active and URL is reachable from an external device

### Data

- [ ] Log in as the demo user account (not a personal account)
- [ ] All three demo deals visible on the Deal Pipeline board: Nexus DataOps, PrimeHealth Partners, Vertex Specialty Chemicals
- [ ] NorthStar Software Corp deal present (seeded by `seed-demo.ts`) — use this for any live upload demo
- [ ] CIM PDFs present in `/demo-data/`: `cim-nexus-dataops.pdf`, `cim-primehealth.pdf`, `cim-vertex-chemicals.pdf`
- [ ] Pre-generated IC memos confirmed on each deal workspace (so audience can see finished output immediately)
- [ ] Pre-generated PPTX decks present for at least one deal

### Browser

- [ ] Clear browser cache and cookies for `localhost:3000`
- [ ] Open the app, log in, confirm dashboard loads cleanly
- [ ] Open a second browser tab to `localhost:3000/pipeline` — have it ready
- [ ] Close all unrelated browser tabs; disable notifications
- [ ] Set browser zoom to 110% — readable at presentation distance

### Presentation Environment

- [ ] Screen mirroring or HDMI confirmed; resolution tested on external display
- [ ] Disable screensaver and sleep mode for the duration of the demo
- [ ] Phone on silent; close Slack, email, and all non-demo applications
- [ ] Have a backup: a screen recording of a complete CIM → IC memo → PPTX run saved locally
- [ ] Confirm internet connection if using Anthropic API for Claude Sonnet outputs

### Aria & Integrations

- [ ] Navigate to Settings → Integrations and confirm the Google Drive OAuth token is valid (green status). If it shows expired, reconnect before the audience arrives — Aria's deal pipeline tools require a valid token to list deals and run analysis
- [ ] Open an Aria session (`/session/new` or click **Talk to Aria** from the dashboard). Send the message: *"List my deals"* — confirm Aria responds with the three demo deals, not an error
- [ ] Confirm the Aria session page shows tool call cards in the activity timeline (not a blank sidebar)

### Final Sanity Check

- [ ] Run a full CIM analysis on Nexus DataOps once before the demo. Confirm the financial table renders, the fit score appears, and the radar chart loads. This also warms the cache for the live demo.
- [ ] Confirm the PPTX export button on the IC memo page downloads a `.pptx` file successfully

---

## Step-by-Step Demo Flow

### Step 1 — Login and Dashboard (1 min)

**Action:** Navigate to `http://localhost:3000`. Log in. The dashboard loads.

**What the audience sees:** A clean analyst dashboard. Deal count, recent activity, and a navigation sidebar showing Pipeline, Agents, Knowledge, and Admin.

**Say:**
> "This is where an analyst starts their day. The pipeline board shows every active deal by stage. AXIS is not a chatbot on top of a PDF reader — it's a deal workflow tool that happens to use AI."

**So what:** Establishes that this is purpose-built for PE, not a generic AI wrapper.

**Time:** 1 minute

---

### Step 2 — Deal Pipeline Board (2 min)

**Action:** Click **Pipeline** in the sidebar. The Kanban board loads with columns: Screening, Initial Review, Deep Dive, IC Prep, Closed / Passed.

**What the audience sees:** Three demo deals in various stages. Nexus DataOps in Deep Dive. PrimeHealth in Initial Review. Vertex Specialty Chemicals in Screening.

**Say:**
> "Every deal lives here from first screen to IC. Stage transitions are manual — the analyst decides. AXIS does not move deals automatically. What it does is eliminate the document work at each stage so the analyst can make that judgment faster."

**So what:** The board is familiar to any PE professional. It anchors AXIS as a tool that fits existing process, not a replacement for it.

**Time:** 2 minutes

---

### Step 3 — Open a Deal Workspace (1 min)

**Action:** Click on **Nexus DataOps** to open the deal workspace.

**What the audience sees:** The deal workspace — summary panel, tabs for Documents, CIM Analysis, IC Memo, and Knowledge Graph.

**Say:**
> "Each deal has a single workspace. All documents, analysis, and outputs live here — no version-controlled Word docs, no shared drives with 14 folders."

**So what:** Centralised deal workspace is a direct productivity argument. Senior analysts spend real time hunting for the right draft.

**Time:** 1 minute

---

### Step 4 — Upload a CIM (2 min)

**Action:** Go to the **Documents** tab. Drag and drop `cim-nexus-dataops.pdf` into the upload zone. Watch the SSE progress stream: Parsing → Chunking → Embedding → Indexing.

**What the audience sees:** A real-time progress feed. Chunk count, embedding progress, completion confirmation. The document appears in the document grid with metadata.

**Say:**
> "Upload takes 60 to 90 seconds for a 40-page CIM. It parses the PDF, chunks it semantically — not by page — builds vector embeddings, and indexes into the knowledge graph. From this point, every analysis is grounded in this specific document."

**So what:** This is the data ingestion step that every analyst does manually. Here it is automatic, structured, and auditable.

**Time:** 2 minutes

---

### Step 5 — Run CIM Analysis (3 min)

**Action:** Click **Analyse CIM**. The SSE stream begins. Show the live tool calls: Extract Financials → Sector Benchmark Lookup → Fit Scoring → Red Flag Detection → IC Question Generation.

**What the audience sees:**
- A radar chart populating with six axes: Market Position, Financial Quality, Management Depth, Scalability, Exit Optionality, Risk Profile
- A fit score out of 100
- A financial summary table (Revenue, EBITDA, margins, growth rates — extracted from the PDF with page references)
- Red flags listed with source citations
- IC questions generated for the investment committee

**Say:**
> "Two agents run in parallel here. Alex — the due diligence agent — is checking financials, market position, and red flags. Mel — the market context agent — is pulling in sector benchmarks: real EV/EBITDA multiples and operating benchmarks for B2B SaaS, calibrated to 2024/2025 data. The fit score is not a feeling — it is a structured output grounded in sector norms."

> "Notice the financial table. Those numbers are extracted from the actual PDF — specific page references included. We are not generating revenue figures from language model weights. The model reads the table, parses the values, and cites the source."

**So what:** This is the 2-3 days of analyst work. It just ran in under 3 minutes, with source citations. The fit score and red flags are immediately usable for a screening memo or IC prep call.

**Time:** 3 minutes

---

### Step 6 — Review the Financial Extraction Table (1 min)

**Action:** Scroll to the **Financial Extraction** panel. Point to the Revenue, EBITDA, and margin rows. Show the page reference column.

**What the audience sees:** A structured table with extracted values and their source page numbers in the original CIM.

**Say:**
> "Every number in this table points back to a page in the CIM. If an analyst disagrees with an extracted figure, they can open the document, verify, and correct it. That correction is written back into the system as a memory — the agent learns not to make the same extraction error again."

**So what:** Addresses the fundamental trust question about AI-generated financial data before the audience asks it.

**Time:** 1 minute

---

### Step 7 — Generate IC Memo (3 min)

**Action:** Click **Generate IC Memo**. The thirteen sections generate sequentially with a progress indicator.

**What the audience sees:** A thirteen-section PE-standard IC memo:
1. Executive Summary
2. Company Overview
3. Market Analysis
4. Financial Analysis
5. LBO Returns Analysis — bear / base / bull IRR and MOIC scenarios
6. Financing Structure — debt capacity, leverage rationale, capital structure
7. Investment Thesis
8. Key Risks & Mitigants
9. Exit Analysis — buyer universe, exit scenarios, precedent transactions
10. Management Assessment (scored on four dimensions: team depth, founder dependency, track record, succession risk)
11. Value Creation Plan — 100-day framework and EBITDA bridge entry → exit
12. Due Diligence Findings & Open Items
13. Investment Recommendation

Each section shows a **Regenerate** button. Any section marked `[DATA NEEDED]` explicitly flags a gap that requires additional VDR documents.

**Say:**
> "This is a thirteen-section IC memo structured to institutional PE standards. Section 5 runs three LBO scenarios — bear, base, bull — with IRR and MOIC outputs. Section 10 — management assessment — is scored on four dimensions using a dedicated model pass. Section 11 gives you a 100-day value creation plan with an EBITDA bridge. The system flags gaps explicitly with `[DATA NEEDED]` rather than hallucinating a confident answer. An analyst who submits a memo with unresolved markers is being told, in writing, exactly what diligence is still required."

**So what:** The memo is immediately usable as a first-draft starting point. The regenerate-per-section workflow means the analyst is editing, not writing. That is a 70-80% time reduction on memo creation.

**Time:** 3 minutes

---

### Step 8 — Export Pitch Deck (2 min)

**Action:** Click **Export to PowerPoint** from the IC memo toolbar. A `.pptx` file downloads in seconds. Open it.

**What the audience sees:** A 10-slide presentation in navy and gold:
- Slide 1: Deal title, sector, date
- Slides 2-8: One slide per major IC memo section (condensed)
- Slide 9: Financial summary table
- Slide 10: Investment recommendation and next steps

**Say:**
> "CIM in. IC memo out. Pitch deck out. That is the complete workflow — no competitor offers this as a single integrated tool. The deck is formatted and ready. An analyst might adjust a few slides, add proprietary data, and walk into the IC meeting. The 40 hours of document work is done."

**So what:** This is the differentiation argument in a single workflow. Start to finished pitch deck in under 10 minutes.

**Time:** 2 minutes

---

### Step 9 — Conflict Detection (2 min)

**Action:** Click **Conflicts** in the sidebar, or navigate to `/conflicts`. Show the conflict log.

**What the audience sees:** A list of detected entity conflicts across documents — for example, a revenue figure that appears differently in two documents, or a management name that has a different title in the CIM versus a prior filing.

**Say:**
> "When multiple documents reference the same entity differently, AXIS flags it. This catches the class of diligence error where the CIM says $42M ARR but the financial model has $39M — not because anyone lied, but because documents are produced at different points in time. The analyst sees the conflict before it reaches IC."

**So what:** Conflict detection is invisible analyst work. Catching a revenue discrepancy before IC is the difference between a clean process and an embarrassing question at the committee table.

**Time:** 2 minutes

---

### Step 10 — Knowledge Graph (2 min)

**Action:** Click the **Knowledge Graph** tab on the deal workspace. A graph visualization loads showing entity nodes and relationships.

**What the audience sees:** Nodes for the company, key management personnel, competitors, customers (if named in CIM), and market segments. Edges show relationships: "competes with," "founded by," "serves," "acquired by."

**Say:**
> "Every entity extracted from every document across all deals is stored in a knowledge graph. If Nexus DataOps competes with a company that appears in another deal's CIM, the system flags the relationship. Across a portfolio of 50 deals, this becomes your institutional memory — who the buyers are, where the competitors keep appearing, which management teams you have seen before."

**So what:** Institutional memory is a genuine competitive advantage in PE. Knowing that a management team you backed in 2019 is now running a target company changes the diligence calculus entirely. AXIS surfaces that automatically.

**Time:** 2 minutes

---

### Step 11 — Aria: Deal Coordinator and Voice Analyst (5 min)

**Action:** Click **Talk to Aria** from the dashboard, or navigate to `/session/new`. This opens the Aria chat and voice session panel. Start with text commands — switch to voice for the diligence Q&A portion.

**Part A — Aria as deal coordinator (2 min, text mode)**

Type the following commands one at a time. Show the activity timeline on the right side of the screen as each tool fires:

1. *"Show me all active deals"* — Aria calls `list_deals` and returns the pipeline with stage, sector, and revenue for each deal
2. *"Create a new deal for Meridian Health Group, a healthcare services company"* — Aria calls `create_deal`, confirms the deal was created in SOURCING stage, and returns the deal ID
3. *"Run the CIM analysis on Nexus DataOps"* — Aria calls `run_cim_analysis`. **It returns immediately** with: "Alex is running the full CIM analysis on Nexus DataOps. Results will appear in this chat in 3–5 minutes." The activity timeline shows the `run_cim_analysis` tool card.

**What the audience sees after step 3:** Within 3–5 minutes (or use the pre-cached result), a formatted result card appears directly in the Aria chat — fit score, red flags, top IC questions, financial snapshot, and a link to the full deal workspace. Aria did not require the analyst to open the deal workspace, click Analyse CIM, or wait at the screen.

**Say (after step 3):**
> "Notice what just happened. The analyst typed one sentence. Aria identified the deal, ran a full parallel multi-agent analysis — financial extraction, sector benchmark lookup, red flag detection, IC question generation — and the result lands here in the conversation. The analyst can keep doing other work. When Alex finishes, the result comes to them."

**Part B — Aria Q&A on deal content (2 min, voice mode)**

Switch to voice. Ask against the completed Nexus DataOps analysis:

- *"What is the net revenue retention for Nexus DataOps?"*
- *"How does the EBITDA margin compare to SaaS sector benchmarks?"*
- *"Generate the IC memo for Nexus DataOps"* — Aria calls `generate_ic_memo`, returns immediately: "Generating the 13-section IC memo now — results appear in this chat in 5–10 minutes."

**Say:**
> "Aria is a voice AI analyst who also owns the deal workflow. She reads the CIM, answers diligence questions from the source material, and can trigger the full CIM analysis or IC memo generation with a single voice command. This is what it looks like to have a junior analyst who has actually read every document, is always available, and can delegate the heavy analysis to specialist agents without opening a single menu."

**So what:** Aria removes the UI entirely for the common actions that happen dozens of times a day — checking deal status, kicking off analysis, asking a diligence question. The analyst speaks or types; the work gets done.

**Time:** 5 minutes

---

### Step 12 — Correction Feedback Loop (2 min)

**Action:** On the IC memo page, find the **Feedback** widget on any section. Click the thumbs down icon on a sentence. Type a correction: *"The EBITDA margin cited here is 22%, not 20% — see page 14 of the CIM."* Submit.

**What the audience sees:** A confirmation that the feedback was recorded. In the background, a `PROCEDURAL` memory is written to the agent's memory store with the correction, tagged to the agent and output type.

**Say:**
> "This is how the system learns. Every correction an analyst makes is stored as a procedural memory. The next time Alex — the due diligence agent — runs an analysis on a SaaS company, it will recall that analysts in this firm expect EBITDA margins to be cited from a specific page, not interpolated. The AI does not get worse over time with your data — it gets better."

**So what:** This is the answer to "what if it gets something wrong." It gets corrected, and it remembers the correction. This is a closed feedback loop that does not exist in any static AI tool.

**Time:** 2 minutes

---

### Step 13 — Index Past Work / Style Context (1 min)

**Action:** Navigate to `/knowledge/my-style`. Show the Google Drive sync interface.

**What the audience sees:** A panel where an analyst can connect a Google Drive folder containing past IC memos or investment papers. A sync button streams the folder into the "My Style" namespace.

**Say:**
> "Analysts and firms have house styles. Certain section structures, certain ways of framing risk, certain language at the IC table. AXIS can index your past memos and use them as style reference when generating new ones. The output starts to sound like your firm, not like a generic AI."

**So what:** Personalisation is the difference between a tool the team will actually use and one they will abandon after two weeks.

**Time:** 1 minute

---

### Step 14 — Audit Log (1 min)

**Action:** Navigate to `/admin/audit`. Show the audit log table.

**What the audience sees:** A chronological log of every action: document uploads, CIM analyses, memo generations, exports, logins, and feedback submissions — with timestamps and user attribution.

**Say:**
> "Every action is logged. Who uploaded which document, who ran which analysis, who exported which memo. For a regulated environment — which PE is — this is not optional. It is a compliance requirement, and it is built in."

**So what:** Compliance and data governance are real concerns at Blackstone scale. The audit log demonstrates that AXIS was built with institutional standards in mind, not retrofitted.

**Time:** 1 minute

---

### Step 15 — Close: The Workflow Summary (1 min)

**Action:** Return to the dashboard. No clicks needed — just talk.

**Say:**
> "Here is the before and after. Before AXIS: an analyst receives a CIM on Monday morning. By Wednesday afternoon, they have a first-draft IC memo, a financial model skeleton, and a list of diligence questions. Three days. After AXIS: they have the same outputs by Monday afternoon. The analyst spends Tuesday and Wednesday on what actually creates alpha — management calls, channel checks, building conviction. AXIS does not replace the analyst. It replaces the document work."

**Time:** 1 minute

---

## Suggested 30-Minute Run Order

| Time | Act | Steps | Content |
|---|---|---|---|
| 0:00 – 5:00 | **Act 1: Orientation** | 1, 2, 3 | Dashboard, pipeline board, deal workspace |
| 5:00 – 20:00 | **Act 2: Core Workflow** | 4, 5, 6, 7, 8 | Upload CIM → Analysis → Financials → IC Memo → PPTX |
| 20:00 – 27:00 | **Act 3: Intelligence Layer** | 9, 10, 11 | Conflict detection, knowledge graph, Aria as deal coordinator + voice analyst |
| 27:00 – 30:00 | **Act 4: Trust & Governance** | 12, 13, 14 | Feedback loop, style context, audit log |
| 30:00 – 31:00 | **Close** | 15 | Workflow summary, the before/after |
| 31:00 – 33:00 | **Buffer** | — | Q&A or rerun any step on request |

> **Note on timing:** Step 11 (Aria) expanded to 5 minutes to cover the deal coordinator workflow. The full run is now ~33 minutes. For a strict 30-minute slot, compress Step 11 Part B (voice Q&A) to one question and skip Step 13 (style context) — the core narrative still lands.

**Recommended deal to use for live workflow (Act 2):** Nexus DataOps. It is the most visually compelling — the radar chart reads well on SaaS metrics and the financial extraction is clean. PrimeHealth is better if the audience has a healthcare background. Vertex is best if they want to see carve-out handling.

**Pre-load the following before the audience enters the room:**
- Tab 1: Dashboard (`/`)
- Tab 2: Pipeline board (`/pipeline`)
- Tab 3: Nexus DataOps workspace (`/deals/[nexus-id]`)
- Tab 4: Completed IC memo for Nexus (for instant reference if analysis is slow)

---

## Key Talking Points for a Blackstone Audience

### Time Savings

A first-pass CIM analysis — reading the document, extracting financial KPIs, identifying red flags, structuring the IC memo — takes a senior analyst 2 to 3 working days. AXIS produces an equivalent first draft in under 10 minutes, including the PowerPoint.

At Blackstone's volume — evaluating hundreds of opportunities per year — this compounds. If 60% of CIMs are screened out before deep diligence, that is hundreds of analyst-days per year spent on documents that will never become deals. AXIS makes that screening process 10x faster without reducing its quality.

### Output Quality

- **Sector benchmarks** are sourced from real PE data: EV/EBITDA and EV/Revenue ranges for 8 sectors, operating benchmarks, public comps, red flag indicators — calibrated to 2024/2025 conditions.
- **Financial extraction** reads the numbers from the PDF. Page references are included in every extracted figure. No language model is generating a revenue figure from memory.
- **Management scoring** is a structured pass: four dimensions, scored by a dedicated model call, not embedded in a paragraph of prose.
- **IC questions** are generated from the actual content of the CIM — not a generic list. The system asks about the specific risks it found in this document.

### The Feedback Loop

AXIS is not a static tool. Every analyst correction — "this number is wrong," "this risk is understated," "this section needs to be restructured" — is written as a procedural memory. The agent that made the error will not repeat it for that analyst or deal type. Over time, the system calibrates to the firm's standards.

### What AXIS Does Not Replace

Be explicit on this point. It is a trust-builder with a senior Blackstone audience.

- **Judgment on whether to invest.** AXIS does not make investment recommendations in the sense of "buy or pass." It produces a fit score and a structured memo. The IC team decides.
- **Management evaluation.** AXIS scores management based on what is in the CIM. It cannot replace a management call, a reference check, or reading a CEO's body language.
- **Relationship-driven sourcing.** The best deals are not in CIMs. Proprietary sourcing is a human function.
- **Negotiation.** Pricing, terms, structure — entirely human.

AXIS owns the document layer so the humans can own the judgment layer.

---

## Anticipated Questions and Answers

### "How accurate is the financial data?"

The financial data is extracted directly from the source PDF using a parser that reads tables and text, then applies pattern recognition to identify revenue, EBITDA, margins, and growth rates. Every extracted figure includes a page reference. The system does not generate financial figures from model weights — it reads them from the document. If the CIM has a number, AXIS finds it. If the CIM does not have a number, AXIS marks it `[DATA NEEDED]`.

### "What if the AI gets something wrong?"

Two mechanisms handle this. First, every output is reviewed by an analyst before it goes anywhere — AXIS is a drafting tool, not an autonomous agent. Second, the feedback widget on every output creates a correction that is stored as a procedural memory. The agent learns from the correction. The audit log records who corrected what and when.

### "Who else has this?"

No competitor currently offers CIM → IC memo → PowerPoint deck as a single integrated workflow with sector-calibrated benchmarks, PDF financial extraction, conflict detection, and a knowledge graph. Generic AI tools (ChatGPT, Claude.ai, Gemini) can assist with writing but cannot ingest a CIM, ground the output in the specific document, run multi-agent analysis in parallel, or produce a structured IC memo with cited financial data. Purpose-built PE tools (Kira, Luminance) focus on contract review, not investment analysis.

### "How does it handle confidential data?"

Architecture is designed for data residency and confidentiality:

- **Pipeline tasks** (chunking, embedding, entity extraction, structuring) are handled by Qwen3 8B — a local model running on your own infrastructure. No CIM content is sent to any external API for these steps.
- **User-facing outputs** (IC memo sections, summaries) use Claude Sonnet via the Anthropic API. Only the structured context — not the raw CIM — is sent, and only for generation of final prose.
- **All data** — documents, embeddings, knowledge graph, memos — stays in your database infrastructure (PostgreSQL, Neo4j, Redis). Nothing is stored externally.
- For a fully air-gapped deployment, Sonnet can be replaced with a locally hosted model. The inference layer is abstracted.

### "What's the integration story?"

Live integrations today:

- **Google Drive** — index past memos and deal documents via OAuth connection; syncs on demand or on schedule
- **VDR upload** — bulk ZIP drag-and-drop with SSE progress streaming; supports any document type
- **REST API** — every function is available via REST endpoint with camelCase JSON; can integrate with existing deal management systems
- **Webhook support** — document ingestion can be triggered programmatically

Planned integrations (post-deployment): Intralinks, Datasite, DealCloud, Salesforce for sourcing pipeline.

### "Why should we trust the management scoring?"

The management assessment in Section 10 is a dedicated model pass — not prose written by the same agent that wrote the financial analysis. It scores four dimensions: team depth, founder dependency, track record, and succession risk. Each dimension is scored on a structured rubric applied to the CIM content. The scores are shown alongside the evidence. If the CIM has limited management information, the scores will be low and the section will flag `[DATA NEEDED]`. The system does not fabricate a confident management assessment from thin source material.

### "Can it handle a 200-page VDR, not just a CIM?"

Yes. The bulk document ingestion pipeline accepts ZIP archives, processes each document in parallel, and indexes everything into the deal's knowledge namespace. Aria and the RAG retriever query across all indexed documents — not just the CIM. A question about a specific customer contract will retrieve the relevant clause from the correct document in the VDR.

### "What can Aria do without the analyst touching the UI?"

Aria handles the full deal pipeline through conversation — no UI navigation required. In text or voice, she can: list all active deals with stage and sector; create a new deal record; look up a deal's status including whether a CIM analysis and IC memo exist; trigger a full CIM analysis (fire-and-forget — result returns to the chat in 3–5 minutes); generate the 13-section IC memo (result returns in 5–10 minutes); and move a deal to the next pipeline stage. For a senior analyst running multiple deals, this means actions that previously required navigating to a specific deal workspace and clicking a button can now be delegated in a single sentence.

### "Can Aria run the full CIM-to-memo workflow end to end without the analyst?"

Yes, in sequence. The analyst can say: *"Create a deal for Apex Logistics, run the CIM analysis using the file I just uploaded to Drive, and generate the IC memo when it's done."* Aria will create the deal, run the CIM analysis, and — because the IC memo prompt follows — queue the memo generation after the analysis completes. The analyst receives three result cards in the chat conversation, each with a link to the full output in the deal workspace. They never open the Pipeline board. This is what "removing manual work" means in practice.

### "Is Aria just a wrapper on ChatGPT?"

No. Aria is a purpose-built orchestration agent running on Claude Sonnet, with a tool registry of 14 PE-specific functions: deal pipeline management, CIM analysis, IC memo generation, Google Drive search, Gmail search, calendar booking, knowledge base retrieval, and knowledge graph queries. When Aria receives a request, she selects which tools to call, in what order, handles auth errors gracefully, and formats the results for a deal professional — not a generic knowledge worker. The underlying model capability is Claude, but the product layer — the tools, the PE workflow knowledge, the specialist agents Aria delegates to — is AXIS.

### "What does deployment look like at our scale?"

AXIS runs on standard cloud infrastructure: PostgreSQL 16 with pgvector, Redis 7, Neo4j 5.18, and a Node.js API server. It can be deployed on AWS, Azure, or GCP behind your existing VPN. For a Blackstone deployment, the recommended path is a dedicated instance per deal team or business unit, with a shared knowledge graph for cross-portfolio entity matching. The infrastructure team at your firm would own the deployment; we provide the application stack and documentation.

---

## Demo Tips and Contingency Plans

### Things to Avoid

- **Do not demo a live CIM upload without having run it once already.** PDF parsing has variable latency. Always pre-warm the demo deal.
- **Do not let the audience drive.** Offer to run any specific query they want, but keep control of the keyboard. Unexpected inputs can surface edge cases that derail the narrative.
- **Do not apologise for load times.** If a step takes longer than expected, fill the silence with a talking point about what the system is doing. "While the agents are running in parallel, I want to point out..." is a productive sentence.
- **Do not overclaim on accuracy.** The system is very good. It is not infallible. The feedback loop and analyst review exist for a reason. Saying "95% accurate" without qualification is a trap — a Blackstone MD will immediately ask how you measured it.
- **Do not show the admin or audit log before establishing value.** Lead with outputs, end with governance. Showing audit logs first signals defensiveness.

### Handling Slow API Responses

If CIM analysis takes longer than 90 seconds during the live demo:

1. Switch to the pre-generated analysis for Nexus DataOps (Tab 4). Say: "Let me pull up a completed analysis so we can see the full output while that processes in the background."
2. Walk through the completed IC memo and PPTX export while the live analysis finishes.
3. Return to the live analysis when it completes to show the real-time output.

### If the API is Down

1. Open the screen recording backup (have this ready as a local `.mp4`).
2. Say: "I want to make sure we use our time well — let me walk you through a recorded run while the infrastructure team resolves a connectivity issue. Every step you are about to see is what you just saw set up live."
3. Run the recording. Stop it at relevant moments to narrate.
4. Do not attempt live demos of broken functionality.

### If Aria (Voice) Fails

Aria depends on a live microphone connection. If voice fails:

1. Switch to the text query interface on the same page.
2. Type the same question you would have asked verbally.
3. Say: "Aria works by voice or text — same underlying system. Let me show you the text interface, which some analysts prefer for audit trail reasons anyway."

### If Aria's Deal Pipeline Tools Return an Error

If `list_deals` or `run_cim_analysis` returns an error (most likely cause: expired Google OAuth token):

1. Do not troubleshoot live. Say: "Let me pull that up in the deal workspace directly."
2. Navigate to the pre-loaded deal workspace tab and show the completed CIM analysis and IC memo there.
3. After the demo, check Settings → Integrations and reconnect Google Drive. This clears all pipeline tool auth errors.
4. For the **list_deals** command specifically: if the error persists, Aria can still answer deal-specific questions from the knowledge base — the deal pipeline tools (list/create/move) require Google auth, but RAG queries do not.

### If the Audience Goes Off-Script

If a stakeholder asks about a deal that is not in the demo dataset:

- Do not attempt to upload a real document on the fly.
- Say: "Great question — let me show you how we would handle that document type with the Vertex carve-out CIM, which has similar characteristics."
- Redirect to the closest pre-seeded deal.

If they ask to see a specific IC section regenerated with different parameters:

- Use the per-section **Regenerate** button on the IC memo page.
- This is a strength, not a risk — demonstrate it confidently.

### Pacing

The 30-minute run order is calibrated for a senior audience with limited patience for setup. If the stakeholder is engaged and asking questions, slow down — that is a buying signal. If they are checking their phone, skip Steps 13 and 14 and go straight to the workflow summary and Q&A.

The strongest moment in the demo is the transition from raw CIM upload to completed IC memo. If you have limited time, prioritise Steps 4 through 8. Everything else is supporting context.

---

*Document prepared for internal demo use only. Not for distribution. For questions, contact the AXIS team.*

---

# PART II — REAL ESTATE DEMO EXTENSION

## Summit Ridge Portfolio — PE Real Estate Demo Track

This section extends the demo for audiences with a real estate PE focus or mixed mandate funds. Use it after the core tech demo (Nexus DataOps) to show that AXIS is asset-class agnostic, or as a standalone track for a REPE-focused audience.

**Why this matters for a PE real estate audience:** Real estate IC memos are structurally different from corporate buyout memos. They lead with NOI, cap rate, and DSCR — not EBITDA and EV/Revenue. A system that produces a Blackstone-standard IC memo for a software company but can't handle a multifamily portfolio is not a firm-wide tool. AXIS handles both.

---

## The Real Estate Deal — Summit Ridge Portfolio

| Field | Detail |
|---|---|
| Deal Name | Summit Ridge Portfolio |
| Asset Class | Class B Value-Add Multifamily |
| Geography | Atlanta · Tampa · Charlotte · Nashville · Austin |
| Units | 2,847 units across 14 properties |
| Target EV | $473M ($166,070 / unit) |
| In-Place NOI | $24.6M (LTM) |
| In-Place Cap Rate | 5.2% |
| Stabilised Cap Rate | 4.7% (Year 3 target) |
| Financing | 60% LTV, SOFR + 190 bps; 3-year rate cap |
| Equity Check | ~$189M |
| Target Gross IRR | 18.5% base / 22.3% bull |
| Target MOIC | 2.2x base / 2.7x bull |
| Hold Period | 5 years (2025–2030) |

**CIM file:** `demo-data/cim-summit-ridge.pdf`
**Pitch deck:** `demo-data/pitch-summit-ridge.pptx`

---

## Pre-Demo Additions for the Real Estate Track

Add the following to the core pre-demo checklist:

- [ ] Summit Ridge Portfolio deal exists on the Pipeline board (create it if needed: deal name "Summit Ridge Portfolio", sector "Real Estate")
- [ ] `cim-summit-ridge.pdf` is available in `/demo-data/`
- [ ] `pitch-summit-ridge.pptx` is available in `/demo-data/`
- [ ] (Optional) Pre-run the CIM analysis on Summit Ridge and cache the IC memo so the REPE demo can jump straight to the output review

---

## Real Estate Demo Flow (15-Minute Track)

### RE Step 1 — Introduce the Asset Class Switch (30 sec)

**Action:** On the Pipeline board, show both the Nexus DataOps deal and the Summit Ridge deal side by side.

**Say:**
> "I want to show you one more thing. Nexus is a B2B SaaS company — but we also have a real estate deal in the pipeline. The IC memo format and the metrics are completely different. NOI instead of EBITDA, cap rate instead of EV/Revenue, DSCR instead of interest coverage. Let me show you how AXIS handles that."

**So what:** Demonstrates asset-class versatility — AXIS is not a software-company-only tool.

---

### RE Step 2 — Upload the CIM (1 min)

**Action:** Navigate to the Summit Ridge deal workspace. Click **Upload CIM**. Upload `cim-summit-ridge.pdf`.

**Say:**
> "The CIM for Summit Ridge is a 10-section real estate investment memorandum — portfolio overview, market fundamentals, NOI bridge, capital structure, returns sensitivity. The kind of document a broker would send you before an LOI deadline."

**What the audience sees:** The file upload progress bar. The document appears in the deal's VDR.

**So what:** Shows the same upload UX works for any document type — corporate or real estate.

---

### RE Step 3 — Run CIM Analysis (1.5 min)

**Action:** Click **Analyse CIM** and let the pipeline run.

**What the audience sees:** The SSE stream of agent steps — financial extraction, DD agent analysis, fit score, radar chart.

**Point out during the run:**
> "The financial extractor is looking for NOI rather than EBITDA. It will pull the in-place cap rate, the debt coverage ratios, the renovation cost per unit. These are real estate metrics — not the same extraction pass as the software company."

**What appears:** A radar chart with axes for Financial Quality, Market Position, Management, Deal Structure, and Return Profile. The fit score (expected 78–84 for Summit Ridge based on strong financials offset by floating rate exposure).

**Say:**
> "The DD agent has flagged the floating rate debt and the Sun Belt insurance inflation as the top two risks — which is exactly right. It pulled those from the capital structure section of the CIM, cross-referenced against sector norms, and flagged them as HIGH severity without being prompted."

**So what:** The AI correctly reads real estate risk categories, not just generic corporate risks.

---

### RE Step 4 — Review the IC Memo Sections (3 min)

**Action:** Navigate to the IC memo on the Summit Ridge deal. Walk through three sections:

**Section: Financial Analysis**
- Show the NOI bridge table (In-Place $24.6M → Stabilised $31.6M)
- Point out: "It's showing mark-to-market rent uplift, renovation premium, property management consolidation savings, and insurance headwinds as separate line items — exactly how a real estate analyst would structure the bridge."
- Highlight the per-unit NOI: $8,643 LTM → $11,100 stabilised target

**Section: LBO Returns Analysis**
- Show the three-scenario returns table (Bear 12.4% / Base 18.5% / Bull 24.7%)
- Show the exit cap rate sensitivity table
- Say: "The system built this from the NOI projections and the entry terms. It applies a cap rate range instead of an exit EV/EBITDA multiple — correct real estate mechanic, not borrowed from the corporate model."

**Section: Key Risks**
- Show the risk register with Interest Rate Risk and Insurance Inflation flagged HIGH
- Say: "It even noted that the DSCR at close drops to 1.08x if SOFR rises 100bps above the rate cap — that's a specific, quantified risk, not a generic 'rising rates could affect the business.'"

**So what:** Proves the IC memo quality holds for real estate deals — not just corporate buyouts.

---

### RE Step 5 — Generate the Pitch Deck (1 min)

**Action:** Click **Export → PowerPoint**. The PPTX generates and downloads.

**Say:**
> "Same one-click workflow as the software deal. 12 slides — cover, deal snapshot, investment highlights, portfolio map, market fundamentals, financial performance, value-add business plan, capital structure, returns analysis, risk factors, management team, next steps. Navy and gold palette."

**What the audience sees:** The download prompt; optionally open the file to show the first three slides.

**So what:** The full CIM → IC memo → pitch deck pipeline works identically for real estate.

---

### RE Step 6 — Knowledge Graph for Real Estate (1.5 min)

**Action:** Navigate to the Knowledge Graph page. Search for "Summit Ridge" or "Axis Capital Advisors."

**Say:**
> "After the CIM is ingested, the knowledge graph extracts entities and relationships. For a real estate deal, that's markets, operators, lenders, comparable transactions, and the management team. So if you later ask Aria 'who manages the Tampa assets?' or 'what are the comparable multifamily transactions in Atlanta?' — the graph has that structured."

**What the audience sees:** Entity nodes for the company, markets, key executives, and any comparable transactions mentioned in the CIM. Relationship edges connecting them.

**If a REPE investor asks:** "Can it track relationships across deals — like if the same operator shows up in multiple portfolio companies?"
> "Yes. If we ingest two CIMs that both involve Greystar as a property manager, the graph connects them. You'd see Greystar appear as a node with relationships to both deals — which is useful for operator reference checks and concentration tracking."

---

### RE Step 7 — Aria: Ask a Real Estate Question (1 min)

**Action:** Open the Aria voice interface or text chat. Ask:

> "What is the break-even occupancy for the Summit Ridge portfolio at a 100 basis point SOFR increase above the rate cap?"

**What the audience sees:** Aria retrieves from the CIM context and responds with "81.2% at current rates, rising to an estimated 83.8% under the stress scenario" (based on the modelled figures in the CIM).

**Say:**
> "That is a live query against the indexed CIM — not a pre-programmed answer. It pulled the DSCR covenant, the debt service figure, the NOI, and computed the break-even. An analyst would take 15 minutes with a spreadsheet to get to the same number."

**So what:** Shows Aria handles quantitative real estate reasoning, not just narrative summarisation.

---

## Real Estate Talking Points for a REPE Audience

**"How is this different from Argus?"**
> "Argus is a cash flow modelling tool — you put your assumptions in, it projects forward. AXIS reads the CIM the broker sends you and tells you what the assumptions should be, before you've built a model. It compresses the front-end analysis, not the modelling itself. The two are complementary."

**"Can it handle different property types — office, industrial, hotels?"**
> "The financial extraction and IC memo generation are asset-class aware. Multifamily uses NOI/cap rate mechanics. We can extend the sector benchmark library to include industrial cap rate comps, office lease maturity risk, or hotel RevPAR sensitivity. The framework is there — it's a data extension, not a re-architecture."

**"What about rent rolls and REIT filings?"**
> "The ingestion pipeline handles PDFs and structured documents of any type. A rent roll as a PDF is a structured table — the extractor picks up tenant names, lease expiry, and in-place rents. REIT 10-Ks are longer but standard — same ingestion pathway. We handle ZIP uploads for VDR packages, so a broker package with 40 documents is a single drag-and-drop."

**"Does it understand cap rate compression thesis vs. value-add vs. core?"**
> "Yes — the sector benchmark library includes multifamily-specific mechanics: typical leverage by strategy (core: 50–55% LTV vs. value-add: 60–65%), IRR expectations by hold period, exit path prioritisation, and precedent transaction comps. When the CIM is ingested, the system identifies the strategy type and applies the appropriate benchmark set."

**"What if the CIM is mostly photos and maps with minimal text?"**
> "That's a real limitation — heavily image-based documents reduce extraction accuracy. The system will flag [DATA NEEDED] markers in sections where it cannot extract figures, rather than hallucinating them. For those deals, the analyst still manually supplements the data, but the memo structure and risk framework are pre-built."

---

## Transition Back to Core Demo

After the real estate track, close the loop with:

> "So you've seen AXIS handle a B2B SaaS deal with ARR and NRR metrics, and a Sun Belt multifamily portfolio with NOI, cap rates, and DSCR. The pipeline is the same — ingest the CIM, extract financials, run the DD agent, generate the IC memo, export the deck. The system adapts to the asset class. For a multi-strategy fund, that means one tool across your deal team instead of separate workflows for each vertical."

Then return to the Q&A section of the core demo guide.

---

*Real estate demo extension added April 2026. Summit Ridge Portfolio is a fictional deal created for demonstration purposes. All financial figures are illustrative.*
