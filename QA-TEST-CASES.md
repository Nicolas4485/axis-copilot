# AXIS AI Co-pilot — QA Test Case Document

**Project:** axis-copilot  
**Version:** Phase 3C  
**Date:** 2026-04-19  
**Audience:** QA Engineer / Developer self-testing before PE demo  
**Scope:** Full application — all pages, APIs, edge cases, and failure modes

---

## Risk Legend

| Symbol | Severity | Definition |
|--------|----------|------------|
| 🔴 | HIGH RISK | Data loss, auth bypass, broken core workflow — must pass before any demo |
| 🟡 | MEDIUM RISK | Degraded experience, incorrect output, non-critical workflow broken |
| 🟢 | LOW RISK | UI polish, minor UX issues, cosmetic defects |

---

## Table of Contents

1. [Auth — Login & Register](#1-auth--login--register)
2. [Dashboard](#2-dashboard)
3. [Pipeline — Deal Board](#3-pipeline--deal-board)
4. [Deal Workspace](#4-deal-workspace)
5. [VDR / Document Upload](#5-vdr--document-upload)
6. [CIM Analysis](#6-cim-analysis)
7. [IC Memo Generator](#7-ic-memo-generator)
8. [Sessions — Aria Chat](#8-sessions--aria-chat)
9. [Knowledge Base](#9-knowledge-base)
10. [My Style](#10-my-style)
11. [Conflicts](#11-conflicts)
12. [Analytics](#12-analytics)
13. [Agents](#13-agents)
14. [Audit Log](#14-audit-log)
15. [RAG Evaluation](#15-rag-evaluation)
16. [Settings](#16-settings)
17. [API — Cross-cutting Concerns](#17-api--cross-cutting-concerns)
18. [Inference Engine](#18-inference-engine)
19. [Aria — Deal Pipeline Tools](#19-aria--deal-pipeline-tools)

---

## 1. Auth — Login & Register

### TC-001 🔴 — Successful Login

**Title:** User can log in with valid credentials and is redirected to dashboard

**Preconditions:**
- App is running (frontend port 3000, API port 4000)
- At least one user account exists in the database

**Steps:**
1. Navigate to `http://localhost:3000/login`
2. Enter a valid registered email address
3. Enter the correct password
4. Click the "Sign In" button

**Expected Result:**
- API returns 200 with a `Set-Cookie` header containing `token` as an httpOnly cookie
- User is redirected to `/` (dashboard)
- Dashboard renders with user's name or email visible in the nav/header
- No JWT visible in localStorage or sessionStorage (httpOnly enforced)

**Notes / Edge Cases:**
- Inspect browser DevTools → Application → Cookies: `token` must be `HttpOnly: true` and `SameSite: Lax` or `Strict`

---

### TC-002 🔴 — Login with Invalid Password

**Title:** Login fails gracefully with incorrect password

**Preconditions:** User account exists

**Steps:**
1. Navigate to `/login`
2. Enter valid email, wrong password
3. Click "Sign In"

**Expected Result:**
- API returns 401
- UI shows an error message (e.g., "Invalid email or password")
- No cookie is set
- User stays on `/login`

**Notes / Edge Cases:**
- Error message must NOT reveal whether the email exists (avoid user enumeration)

---

### TC-003 🔴 — Login with Non-existent Email

**Title:** Login fails gracefully with unknown email

**Preconditions:** None

**Steps:**
1. Navigate to `/login`
2. Enter `notexist@example.com` and any password
3. Click "Sign In"

**Expected Result:**
- API returns 401
- Same generic error message as TC-002 (no user enumeration)
- No cookie set

---

### TC-004 🟡 — Login with Empty Fields

**Title:** Form validation prevents submission with empty credentials

**Preconditions:** None

**Steps:**
1. Navigate to `/login`
2. Leave both fields empty
3. Click "Sign In"

**Expected Result:**
- Client-side or server-side validation triggers
- "Email is required" and/or "Password is required" messages displayed
- No API call made (or API returns 400 if client-side validation is bypassed)

---

### TC-005 🔴 — Successful Registration

**Title:** New user can register and is immediately authenticated

**Preconditions:** Email is not already registered

**Steps:**
1. Navigate to `/register`
2. Fill in name, email (`newuser_test@example.com`), password (min 8 chars)
3. Click "Create Account"

**Expected Result:**
- API creates user, returns 201 or 200 with cookie set
- User is redirected to `/` (dashboard)
- User record visible in database (`SELECT * FROM "User" WHERE email = '...'`)

---

### TC-006 🟡 — Register with Duplicate Email

**Title:** Registration fails when email already exists

**Preconditions:** User with the target email already exists

**Steps:**
1. Navigate to `/register`
2. Enter an already-registered email and valid password
3. Submit

**Expected Result:**
- API returns 409 or 400
- UI shows "An account with this email already exists" or similar
- No duplicate user created in DB

---

### TC-007 🔴 — Route Protection — Unauthenticated Access

**Title:** Unauthenticated users are redirected to login for all protected routes

**Preconditions:** No auth cookie present (use incognito or clear cookies)

**Steps:**
1. Without logging in, navigate directly to:
   - `/`
   - `/pipeline`
   - `/deals/any-id`
   - `/session`
   - `/admin/audit`
2. Note the response for each

**Expected Result:**
- Each route redirects to `/login`
- No protected data is exposed in the HTML or API response
- After login, user is taken back to the originally-requested page (optional but ideal)

---

### TC-008 🔴 — Logout / Cookie Expiry

**Title:** Logging out clears the auth cookie

**Preconditions:** User is logged in

**Steps:**
1. Log in as a valid user
2. Click the logout button/link (if present) OR manually call `POST /api/auth/logout`
3. Attempt to navigate to `/pipeline`

**Expected Result:**
- Cookie is cleared (maxAge=0 or deleted)
- Navigating to `/pipeline` redirects to `/login`
- API returns 401 for any subsequent authenticated requests

---

### TC-009 🟡 — Login Form — SQL/XSS Injection Attempt

**Title:** Login form is hardened against injection

**Preconditions:** None

**Steps:**
1. In the email field, enter: `' OR '1'='1`
2. In the password field, enter: `<script>alert(1)</script>`
3. Submit

**Expected Result:**
- API returns 401 or 400 (no SQL injection bypass)
- Script tag is not executed in the UI
- No server error (500) returned

---

## 2. Dashboard

### TC-010 🟡 — Dashboard Loads for Authenticated User

**Title:** Dashboard displays key metrics and quick actions

**Preconditions:** User is logged in; at least one deal exists

**Steps:**
1. Navigate to `/`

**Expected Result:**
- Page loads within 3 seconds
- Shows recent sessions list (or "No sessions yet")
- Shows deal count (total deals for the logged-in user)
- Quick action buttons are visible (e.g., "New Deal", "New Session")
- No JavaScript console errors

---

### TC-011 🟢 — Dashboard Empty State

**Title:** Dashboard shows helpful empty states for a brand-new user

**Preconditions:** User has no deals, no sessions

**Steps:**
1. Register a brand-new account
2. Navigate to `/`

**Expected Result:**
- "No deals yet — create your first deal" or equivalent empty state
- No null-pointer errors, no broken layout
- Quick action CTA is prominent

---

## 3. Pipeline — Deal Board

### TC-012 🔴 — Pipeline Board Loads with All Stages

**Title:** Kanban board renders all six stages

**Preconditions:** User is logged in

**Steps:**
1. Navigate to `/pipeline`

**Expected Result:**
- Six columns visible: SOURCING, SCREENING, DILIGENCE, IC MEMO, CLOSED WON, CLOSED LOST
- Each column has a header with stage name and deal count
- Existing deals appear in the correct column

---

### TC-013 🔴 — Create New Deal

**Title:** User can create a deal and it appears on the board

**Preconditions:** User is on `/pipeline`

**Steps:**
1. Click "New Deal" or equivalent CTA
2. Fill in: Name = "Demo Corp", Sector = "Software", Size = "$50M", Priority = HIGH
3. Submit

**Expected Result:**
- Deal created via `POST /api/deals`
- API returns 201 with the new deal object
- Deal card appears in the SOURCING column immediately (optimistic update or refresh)
- Deal card shows name, sector, and priority badge
- Navigating to `/pipeline` again still shows the deal

---

### TC-014 🟡 — Create Deal with Missing Required Fields

**Title:** Deal creation validates required fields

**Preconditions:** User is on `/pipeline`

**Steps:**
1. Open the new deal form
2. Submit with an empty "Name" field

**Expected Result:**
- Validation error displayed ("Deal name is required")
- No API call made, or API returns 400
- Form stays open

---

### TC-015 🟡 — Drag Deal Card Between Stages

**Title:** Dragging a deal card to a new stage updates its status

**Preconditions:** At least one deal exists on the board

**Steps:**
1. Drag a deal card from SOURCING to SCREENING
2. Release on the SCREENING column

**Expected Result:**
- API call made: `PATCH /api/deals/:id` with `{ stage: "SCREENING" }`
- API returns 200
- Card now appears under SCREENING
- If page is refreshed, deal is still in SCREENING (persistence confirmed)

---

### TC-016 🔴 — Click Deal Card Opens Deal Workspace

**Title:** Clicking a deal card navigates to the deal workspace

**Preconditions:** At least one deal exists

**Steps:**
1. Click any deal card on the Kanban board

**Expected Result:**
- Browser navigates to `/deals/[id]` where `[id]` is the deal's ID
- Deal workspace page loads without errors

---

### TC-017 🟢 — Pipeline — Deal Count per Stage

**Title:** Stage headers show accurate deal counts

**Preconditions:** Multiple deals distributed across stages

**Steps:**
1. Navigate to `/pipeline`
2. Count deals visually in each column
3. Compare to the count badge in each column header

**Expected Result:**
- Count badge matches the actual number of deal cards per column

---

## 4. Deal Workspace

### TC-018 🔴 — Deal Workspace Loads All Tabs

**Title:** All tabs in the deal workspace are accessible

**Preconditions:** A deal exists with at least one document uploaded

**Steps:**
1. Navigate to `/deals/[id]`
2. Click each tab: Overview, Conversations, Documents, Conflicts, IC Memo

**Expected Result:**
- Each tab loads without error
- Overview shows deal name, notes field, and activity summary (session count, document count)
- Documents tab shows link to VDR or document list
- No 404 or 500 errors

---

### TC-019 🟡 — Deal Notes Field — Save and Persist

**Title:** Notes entered in the Overview tab are saved and reload correctly

**Preconditions:** Deal workspace open on Overview tab

**Steps:**
1. Click into the notes text area
2. Type "This is a test note for QA"
3. Save (via button or auto-save)
4. Refresh the page

**Expected Result:**
- Note text persists after refresh
- `PATCH /api/deals/:id` called with updated notes
- API returns 200

---

### TC-020 🟡 — Deal Workspace — Invalid Deal ID

**Title:** Navigating to a non-existent deal shows a 404 error page

**Preconditions:** None

**Steps:**
1. Navigate to `/deals/nonexistent-deal-id-12345`

**Expected Result:**
- API returns 404 from `GET /api/deals/:id`
- Frontend shows "Deal not found" or equivalent error page
- No unhandled JavaScript exception

---

## 5. VDR / Document Upload

### TC-021 🔴 — ZIP Upload — Success Path

**Title:** A ZIP file containing documents is uploaded, extracted, and indexed

**Preconditions:**
- Deal exists
- A ZIP file containing 2–5 PDFs/DOCXs is available
- Ingestion pipeline is running

**Steps:**
1. Navigate to `/deals/[id]/documents`
2. Drag and drop the ZIP file onto the upload zone
3. Watch the SSE progress stream

**Expected Result:**
- Upload accepted: API returns 200/202
- SSE events stream in real time: file names appear as they are processed
- After completion, each document appears in the document list with status INDEXED
- Document count on the deal workspace Overview tab increments

---

### TC-022 🔴 — Document Status States

**Title:** Document list shows correct status badges for each document state

**Preconditions:** Documents in various states exist (INDEXED, PROCESSING, PENDING, FAILED, CONFLICT)

**Steps:**
1. Navigate to `/deals/[id]/documents`
2. Observe each document's status badge

**Expected Result:**
- INDEXED: green badge
- PROCESSING: spinner or blue badge
- PENDING: gray badge
- FAILED: red badge
- CONFLICT: amber/orange badge
- Status text is human-readable and matches the state

---

### TC-023 🟡 — Upload Non-ZIP File

**Title:** Uploading a non-ZIP file (e.g., a single PDF) is handled gracefully

**Preconditions:** User is on the documents page

**Steps:**
1. Drag a single PDF (not a ZIP) onto the upload zone

**Expected Result:**
- Either: file is accepted as a single document and processed correctly
- Or: UI shows "Please upload a ZIP file" error message
- No server crash (no 500 error)

---

### TC-024 🟡 — Bulk Select and Delete

**Title:** Multiple documents can be selected and deleted at once

**Preconditions:** At least 3 documents exist in the VDR

**Steps:**
1. Select checkboxes for 2 documents
2. Click "Delete Selected"
3. Confirm the deletion prompt

**Expected Result:**
- `DELETE /api/documents` (batch) called with selected IDs
- API returns 200
- Selected documents removed from the list
- Document count on deal workspace decrements correctly

---

### TC-025 🔴 — Delete Document — Data Integrity

**Title:** Deleting a document removes it from the vector store, not just the UI

**Preconditions:** A document has been indexed (status = INDEXED)

**Steps:**
1. Note the document ID
2. Delete the document via the UI
3. Start a new chat session referencing content from that document
4. Ask Aria a question that only that document could answer

**Expected Result:**
- Document is removed from `Document` table in PostgreSQL
- Vector embeddings are deleted from pgvector
- Aria's answer does not reference content from the deleted document

---

### TC-026 🟢 — Refresh Button

**Title:** Refresh button updates the document list without a full page reload

**Preconditions:** User is on the documents page

**Steps:**
1. Click the "Refresh" button
2. Observe the document list

**Expected Result:**
- `GET /api/deals/:id/documents` is called
- List updates with latest status values
- No full page navigation occurs

---

### TC-027 🟡 — Upload Empty ZIP

**Title:** Uploading an empty ZIP file is handled gracefully

**Preconditions:** An empty `.zip` file is available

**Steps:**
1. Upload the empty ZIP to the VDR

**Expected Result:**
- API or ingestion pipeline returns a meaningful error ("ZIP file contains no documents")
- No documents added with broken state
- SSE error event displayed in UI

---

## 6. CIM Analysis

### TC-028 🔴 — CIM Analysis — Upload PDF and Run

**Title:** Uploading a PDF CIM triggers full analysis pipeline with SSE progress

**Preconditions:**
- Deal exists
- A PDF CIM file (≥ 10 pages, containing financial tables) is available
- Ollama (Qwen3) and Anthropic API are reachable

**Steps:**
1. Navigate to `/deals/[id]/cim-analysis`
2. Upload the PDF CIM via the file picker or drag-drop
3. Click "Analyze"
4. Watch SSE progress

**Expected Result:**
- SSE events stream step names as they complete (e.g., "Extracting text", "Scoring fit", "Identifying red flags")
- On completion, the following sections populate:
  - Company snapshot (name, sector, description)
  - Fit score radar chart with 5 dimensions (each scored 0–10)
  - Red flags list (at least one if document contains risk language)
  - Key IC questions list
  - Agent insights panel
- No "undefined" or "[object Object]" appears in the rendered output

---

### TC-029 🔴 — Fit Score Radar Chart — Data Validity

**Title:** Radar chart dimensions are all populated with numeric scores

**Preconditions:** CIM analysis completed (TC-028)

**Steps:**
1. Inspect the radar chart after analysis
2. Hover over each dimension to see the numeric score

**Expected Result:**
- All 5 dimensions have a score between 0 and 10 (not null, not NaN)
- Chart is visually balanced (no missing segments)
- Dimension labels are readable

---

### TC-030 🔴 — Extracted Financials Table

**Title:** Financial data extracted from PDF is displayed in the financials table

**Preconditions:** CIM PDF contains financial tables (revenue, EBITDA)

**Steps:**
1. Run CIM analysis on a PDF with financial tables
2. Scroll to the "Extracted Financials" section

**Expected Result:**
- Table shows Revenue, EBITDA, and margins with values (not placeholders)
- Page references are shown (e.g., "p. 12")
- If no financial tables detected, section shows "No financial data extracted" — not an empty table

---

### TC-031 🟡 — CIM Analysis — Use Existing Document

**Title:** Analysis can be triggered from an already-indexed document (no re-upload)

**Preconditions:** A CIM document is already indexed in the deal's VDR

**Steps:**
1. Navigate to `/deals/[id]/cim-analysis`
2. Select the existing indexed document from the dropdown/list
3. Click "Analyze"

**Expected Result:**
- Analysis runs without requiring a new upload
- Same quality of results as TC-028
- No duplicate document created in the database

---

### TC-032 🟡 — CIM Analysis — Export as PDF

**Title:** CIM analysis results can be exported as a PDF

**Preconditions:** CIM analysis is complete

**Steps:**
1. Click "Export PDF" on the CIM analysis page

**Expected Result:**
- Browser opens a print dialog or downloads a PDF file
- PDF contains the company snapshot, fit scores, red flags, and IC questions
- PDF is legible and not truncated

---

### TC-033 🟡 — CIM Feedback Widget — Thumbs Up

**Title:** Positive feedback is recorded and stored

**Preconditions:** CIM analysis is complete

**Steps:**
1. Click the thumbs-up icon on the CIM analysis feedback widget
2. Optionally add a comment "Great analysis"
3. Submit

**Expected Result:**
- `POST /api/feedback` called with `{ type: "positive", outputType: "cim_analysis", dealId }`
- API returns 201
- PROCEDURAL AgentMemory row created in database with tags including `["cim_analysis", "user_correction"]` (or positive equivalent)
- UI confirms submission ("Thanks for your feedback")

---

### TC-034 🟡 — CIM Feedback Widget — Thumbs Down with Comment

**Title:** Negative feedback with correction comment is stored as procedural memory

**Preconditions:** CIM analysis is complete

**Steps:**
1. Click thumbs-down
2. Enter comment: "Red flags section missed the customer concentration risk on page 8"
3. Submit

**Expected Result:**
- OutputFeedback row created in DB
- PROCEDURAL AgentMemory created with the correction text stored
- Future analyses may incorporate this correction (not tested here, but memory row confirmed)

---

### TC-035 🟢 — CIM Analysis — Sector Benchmark Injection

**Title:** Sector benchmarks appear in the analysis output when sector is recognized

**Preconditions:** CIM is for a Software company

**Steps:**
1. Run CIM analysis on a Software company CIM
2. Review the fit score and summary sections

**Expected Result:**
- Analysis references sector-appropriate EV/EBITDA ranges (e.g., "Software sector typically 15–25x EBITDA")
- Benchmarks from `sector-benchmarks.ts` are visible in context, not fabricated
- If sector is unrecognized, analysis still completes without error

---

## 7. IC Memo Generator

### TC-036 🔴 — Generate Full IC Memo

**Title:** Full 13-section IC memo is generated via SSE streaming

**Preconditions:**
- Deal exists with at least one indexed document
- CIM analysis has been run (recommended for context richness)

**Steps:**
1. Navigate to `/deals/[id]/memo`
2. Click "Generate Memo"
3. Observe SSE streaming

**Expected Result:**
- SSE events stream section names as they complete
- POST call to `/api/deals/:id/generate-memo`
- All 13 sections appear in the left sidebar upon completion:
  1. Executive Summary, 2. Company Overview, 3. Market Analysis, 4. Financial Analysis,
  5. LBO Returns Analysis, 6. Financing Structure, 7. Investment Thesis, 8. Key Risks & Mitigants,
  9. Exit Analysis, 10. Management Assessment, 11. Value Creation Plan, 12. DD Findings & Open Items, 13. Recommendation
- Each section has substantive content (not just a header and empty body)
- Sections with missing data show `[DATA NEEDED]` marker, not blank or "undefined"
- No section is skipped or shows an error state

---

### TC-037 🔴 — IC Memo — Section Navigation

**Title:** Clicking a section in the left sidebar scrolls to / displays that section

**Preconditions:** IC Memo has been generated (13 sections)

**Steps:**
1. On `/deals/[id]/memo`, click each of the 13 sections in the left sidebar

**Expected Result:**
- Right panel updates to show the selected section's content
- Active section is highlighted in the sidebar
- Content is readable and correctly formatted (headings, bullet points, tables)
- New sections present and navigable: LBO Returns Analysis (5), Financing Structure (6), Exit Analysis (9), Value Creation Plan (11)

---

### TC-038 🔴 — Per-Section Regenerate

**Title:** Individual memo sections can be regenerated without affecting other sections

**Preconditions:** IC Memo fully generated

**Steps:**
1. Note the current content of section 3 (e.g., "Market Analysis")
2. Click the "Regenerate" button on section 3
3. Wait for the SSE stream to complete
4. Compare old and new content

**Expected Result:**
- POST call to `/api/deals/:id/memo/section` with body `{ sectionId: "market_analysis" }` (or equivalent)
- API returns 200 and streams new content
- Section 3 content updates in the UI
- Sections 1, 2, 4–13 remain unchanged
- New content is not identical to the previous version (unless deterministic — acceptable)

---

### TC-039 🔴 — IC Memo — Export as Markdown

**Title:** Memo can be exported as a Markdown file

**Preconditions:** IC Memo generated

**Steps:**
1. Click "Export Markdown"

**Expected Result:**
- Browser downloads a `.md` file
- File contains all 13 sections with proper Markdown heading hierarchy (`# Section`, `## Subsection`)
- No raw SSE event data or JSON artifacts in the file

---

### TC-040 🔴 — IC Memo — Export as PDF

**Title:** Memo can be printed/exported as PDF

**Preconditions:** IC Memo generated

**Steps:**
1. Click "Export PDF"

**Expected Result:**
- Browser opens print dialog with the memo formatted for printing
- All 13 sections are visible in the print preview
- Content is not cut off at page breaks

---

### TC-041 🔴 — IC Memo — Export as PowerPoint (.pptx)

**Title:** Memo is exported as a 10-slide .pptx file with correct formatting

**Preconditions:** IC Memo generated and saved

**Steps:**
1. Click "Export PowerPoint" or equivalent
2. `GET /api/deals/:id/memo/export/pptx` is called

**Expected Result:**
- HTTP 200 response with `Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation`
- Browser downloads a `.pptx` file
- File is ≥ 100KB (310KB expected per spec)
- Opening in PowerPoint/LibreOffice shows 10 slides with navy/gold color scheme
- Slides contain content from the memo (not placeholder text)

**Notes / Edge Cases:**
- ESM/CJS interop: verify `(PptxGenJSModule.default ?? PptxGenJSModule)` pattern is used — if export fails with "is not a constructor", this is the likely cause

---

### TC-042 🟡 — IC Memo — [DATA NEEDED] Markers

**Title:** Sections with insufficient source data show [DATA NEEDED] markers

**Preconditions:** Deal with minimal documents (e.g., only a 2-page summary, no financials)

**Steps:**
1. Run IC Memo generation on the thin-document deal

**Expected Result:**
- Sections requiring data not present in documents (e.g., financial projections) show `[DATA NEEDED]`
- Markers are clearly visible and not mistaken for content
- Other sections with available data generate normally

---

### TC-043 🟡 — IC Memo — LBO Returns Analysis

**Title:** Section 5 (LBO Returns Analysis) includes bear/base/bull scenarios with IRR and MOIC

**Preconditions:** CIM or documents contain financial data

**Steps:**
1. Generate IC Memo
2. Navigate to Section 5 (LBO Returns Analysis)

**Expected Result:**
- Three scenarios present: Bear, Base, Bull
- Each scenario shows IRR (%) and MOIC (x) values
- Values are plausible (Base IRR 15–25% for a typical PE deal; not 0% or 100%)
- If financial data is thin, section shows `[DATA NEEDED]` for specific figures rather than fabricating them

---

### TC-043b 🟡 — IC Memo — Management Assessment Score

**Title:** Section 10 (Management Assessment) includes scored dimensions

**Preconditions:** CIM or documents contain management team information

**Steps:**
1. Generate IC Memo
2. Navigate to Section 10 (Management Assessment)

**Expected Result:**
- Scored dimensions visible: Team Depth, Founder Dependency, Track Record, Succession Risk
- Each dimension has a numeric or descriptive score
- Scores are contextually appropriate (not all perfect 10s for a founder-led company)

---

### TC-043c 🟡 — IC Memo — Value Creation Plan

**Title:** Section 11 (Value Creation Plan) contains a 100-day framework and EBITDA bridge

**Preconditions:** IC Memo generated with at least moderate document coverage

**Steps:**
1. Generate IC Memo
2. Navigate to Section 11 (Value Creation Plan)

**Expected Result:**
- 100-day framework with specific initiatives (not generic bullet points)
- EBITDA bridge showing entry EBITDA → exit EBITDA with identified levers
- If data is insufficient, `[DATA NEEDED]` markers appear — no fabricated numbers

---

### TC-043d 🟡 — IC Memo — Exit Analysis

**Title:** Section 9 (Exit Analysis) identifies buyer universe and precedent transactions

**Preconditions:** IC Memo generated

**Steps:**
1. Generate IC Memo
2. Navigate to Section 9 (Exit Analysis)

**Expected Result:**
- Buyer universe categorized: strategic buyers, financial sponsors, IPO
- At least one exit scenario with implied EV/EBITDA multiple
- Sector-appropriate precedent transactions referenced (from sector-benchmarks.ts data)

---

### TC-044 🟡 — IC Memo — Feedback Per Section

**Title:** Feedback widget appears per section and records submission

**Preconditions:** IC Memo generated

**Steps:**
1. Navigate to a section (e.g., "Executive Summary")
2. Click thumbs-down on that section's feedback widget
3. Enter "The revenue CAGR calculation is wrong" as comment
4. Submit

**Expected Result:**
- `POST /api/feedback` called with section-specific context
- OutputFeedback row created in DB
- PROCEDURAL AgentMemory created with the correction
- UI confirms submission

---

### TC-045 🔴 — IC Memo — GET Latest Memo Route

**Title:** Latest memo is fetched via the correct API route

**Preconditions:** A memo has been generated and saved for a deal

**Steps:**
1. Navigate to `/deals/[id]/memo`
2. Observe the network tab for the initial data fetch

**Expected Result:**
- API call made to `GET /api/deals/:id/memo/latest`
- Response contains the full memo JSON with all sections
- No calls to any deprecated route (e.g., `/api/memo/latest` without dealId)

---

## 8. Sessions — Aria Chat

### TC-046 🔴 — Session List Loads

**Title:** Past sessions are listed on the sessions page

**Preconditions:** User has at least 2 prior sessions

**Steps:**
1. Navigate to `/session`

**Expected Result:**
- List of sessions displayed with title/date
- Each session shows client context (if set)
- Clicking a session navigates to `/session/[id]`

---

### TC-047 🔴 — Create New Session

**Title:** User can start a new chat session with client context

**Preconditions:** At least one client/deal exists

**Steps:**
1. Navigate to `/session`
2. Click "New Session"
3. Select a client context (e.g., "Demo Corp")
4. Submit

**Expected Result:**
- `POST /api/sessions` called with clientId
- New session created in DB
- User is navigated to `/session/[id]`
- Chat interface is displayed

---

### TC-048 🔴 — Chat Message — Basic Response

**Title:** Sending a message to Aria returns a streamed response

**Preconditions:** Session is open

**Steps:**
1. In a session, type: "What is private equity?"
2. Press Enter or click Send

**Expected Result:**
- Message appears in the chat with user's avatar
- SSE stream begins — tokens appear progressively in Aria's response bubble
- Response is coherent and relevant
- No `[object Object]` or raw JSON in the response

---

### TC-049 🔴 — Chat — Tool Call Visibility

**Title:** When Aria uses a tool, the tool call is visible in the chat

**Preconditions:** Session open with deal context containing indexed documents

**Steps:**
1. Type: "What does the CIM say about customer concentration?"
2. Send the message

**Expected Result:**
- SSE event `{ type: "tool_start" }` triggers a visible "tool call" indicator in the UI
- After tool completes, SSE event `{ type: "tool_result" }` shown
- Final response references content from the documents
- Tool name is displayed (e.g., "Searching knowledge base...")

---

### TC-050 🟡 — Chat — Conflict Warning in Stream

**Title:** Conflict warnings surface in the chat when detected

**Preconditions:** Two clients exist with a known conflict (competing companies)

**Steps:**
1. Start a session with one of the conflicting clients
2. Ask a question that triggers the conflict detection

**Expected Result:**
- SSE event `{ type: "conflict_warning" }` received
- Yellow/amber warning banner appears in the chat
- Warning message describes the conflict clearly

---

### TC-051 🟡 — Session History Persistence

**Title:** Chat history is persisted and reloaded on revisit

**Preconditions:** A session with multiple messages exists

**Steps:**
1. Navigate to `/session/[id]`
2. Confirm messages load
3. Send one more message
4. Refresh the page
5. Navigate back to `/session/[id]`

**Expected Result:**
- All previous messages are shown in order (including the one sent in step 3)
- Scroll position is at the bottom (most recent)

---

### TC-052 🟢 — Live Voice Mode — Gemini Unavailable State

**Title:** When Gemini Live is unavailable, UI shows an appropriate disabled state

**Preconditions:** Gemini API is not configured or is unreachable

**Steps:**
1. Open a chat session
2. Click the voice/microphone button

**Expected Result:**
- Button is disabled or shows "Voice unavailable" tooltip
- No uncaught JavaScript error
- Chat still functions normally via text

---

## 9. Knowledge Base

### TC-053 🟡 — Knowledge Base — Indexed Document List

**Title:** All indexed documents appear in the knowledge base

**Preconditions:** Multiple documents have been uploaded and indexed

**Steps:**
1. Navigate to `/knowledge`

**Expected Result:**
- List of documents with name, client/deal context, status, and date
- INDEXED documents have a green status indicator
- FAILED documents are visible with red status

---

### TC-054 🟡 — Knowledge Base — Search

**Title:** Searching the knowledge base returns relevant documents

**Preconditions:** At least 5 documents are indexed

**Steps:**
1. Navigate to `/knowledge`
2. Type "revenue" in the search field
3. Press Enter or wait for live search

**Expected Result:**
- Results filtered to documents containing "revenue" in name or metadata
- Zero results show "No documents found" state
- Results are returned within 2 seconds

---

### TC-055 🟡 — Knowledge Base — Google Drive Sync

**Title:** Syncing with Google Drive imports documents

**Preconditions:** Google Drive OAuth is connected in Settings; a Drive folder contains at least 1 document

**Steps:**
1. Navigate to `/knowledge`
2. Click "Sync Google Drive"

**Expected Result:**
- OAuth flow completes (or uses stored token)
- Documents imported from Drive appear in the list
- Sync progress is shown (loading indicator or count)
- Tokens are stored encrypted (AES-256-GCM) — verify in DB: `OAuthToken` table, `encryptedToken` column is not plaintext

---

## 10. My Style

### TC-056 🟡 — My Style — Sync Past Work

**Title:** Syncing a Google Drive folder streams style chunks into "My Style" namespace

**Preconditions:** Google Drive OAuth connected; folder with past memos/reports selected

**Steps:**
1. Navigate to `/knowledge/my-style`
2. Enter or select the Drive folder path
3. Click "Sync"
4. Watch SSE progress

**Expected Result:**
- SSE events stream file names as they are processed
- On completion, indexed style chunks appear in the list
- Chunks are stored in the "My Style" client namespace (verify: `SELECT * FROM "Document" WHERE "clientId" = 'my-style-...'`)

---

### TC-057 🟡 — My Style — Influence on Memo Generation

**Title:** Style chunks from "My Style" are injected into IC Memo generation prompts

**Preconditions:** My Style sync completed with at least 3 documents

**Steps:**
1. Generate an IC Memo for any deal
2. Inspect the API request payload or server logs during generation

**Expected Result:**
- Server logs show `MemoWriter.getStyleContext()` returning style chunks
- Generated memo reflects stylistic patterns from the synced documents (e.g., bullet length, tone)
- If no style chunks, generation still completes normally

---

## 11. Conflicts

### TC-058 🔴 — Conflict List per Client

**Title:** Conflict list shows all detected conflicts for a client

**Preconditions:** Conflicts have been detected (two competing clients in the system)

**Steps:**
1. Navigate to `/clients/[id]/conflicts`

**Expected Result:**
- Conflict list rendered with severity badges (HIGH/MEDIUM/LOW)
- Each conflict shows: description, counterparty name, detected date
- HIGH severity conflicts appear at the top

---

### TC-059 🔴 — Conflict Severity Badges

**Title:** HIGH, MEDIUM, and LOW severity conflicts display correct visual treatment

**Preconditions:** Conflicts of each severity level exist

**Steps:**
1. Navigate to `/clients/[id]/conflicts`
2. Identify one conflict of each severity

**Expected Result:**
- HIGH: Red badge/icon (🔴 or equivalent CSS class)
- MEDIUM: Amber/yellow badge
- LOW: Green badge
- Badges are consistent with the severity legend in the UI

---

### TC-060 🟡 — Conflict Detail View

**Title:** Clicking a conflict opens the detail view

**Preconditions:** At least one conflict exists

**Steps:**
1. Click on a conflict entry

**Expected Result:**
- Detail panel or modal opens
- Shows full conflict description, affected clients, severity rationale
- No broken layout or missing data

---

## 12. Analytics

### TC-061 🟡 — Analytics Page Loads

**Title:** Analytics page renders usage stats and cost breakdown

**Preconditions:** User has made at least 5 API calls and one model inference call

**Steps:**
1. Navigate to `/analytics`

**Expected Result:**
- Usage stats visible (e.g., total API calls, sessions, documents)
- Cost breakdown shows model usage (Qwen3 vs Claude Haiku vs Claude Sonnet)
- Charts/graphs render without error
- Data matches actual usage (spot-check one metric)

---

### TC-062 🟢 — Analytics — Empty State

**Title:** Analytics page handles zero data gracefully

**Preconditions:** Brand-new user account with no activity

**Steps:**
1. Register new account
2. Navigate to `/analytics`

**Expected Result:**
- Page renders with zero values or empty charts
- No division-by-zero errors, no NaN displayed
- Charts show baseline (e.g., $0.00 cost)

---

## 13. Agents

### TC-063 🟡 — Agents List Page

**Title:** Agent definitions are listed with key metadata

**Preconditions:** At least the default agents exist (Alex/DueDiligenceAgent, Mel)

**Steps:**
1. Navigate to `/agents`

**Expected Result:**
- List of agent definitions with: name, description, tools enabled
- Each agent has an "Edit" action

---

### TC-064 🟡 — Edit Agent Prompt

**Title:** Editing an agent's system prompt persists the change

**Preconditions:** An agent definition exists

**Steps:**
1. Click "Edit" on an agent
2. Modify the system prompt (add "UPDATED_FOR_QA" to the end)
3. Save

**Expected Result:**
- `PUT /api/agents/:id` or `PATCH /api/agents/:id` called
- API returns 200
- Refreshing the agents list shows the updated prompt
- Prompt token count is within tier limits (AGENT ≤ 800 tokens) — warn if exceeded

---

### TC-065 🟡 — Edit Agent Tools

**Title:** Toggling tools on/off for an agent saves correctly

**Preconditions:** An agent definition exists with at least 2 tools

**Steps:**
1. Open agent edit view
2. Disable one tool (uncheck it)
3. Save
4. Re-open the agent

**Expected Result:**
- Tool is shown as disabled
- When the agent is invoked, it does not use the disabled tool (verify via tool call events in chat)

---

### TC-066 🟢 — AI-Generate New Agent

**Title:** Using the AI-generate feature creates a new AgentDefinition

**Preconditions:** Anthropic API is accessible

**Steps:**
1. Navigate to `/agents`
2. Click "Generate Agent with AI"
3. Enter a description: "An agent that summarizes quarterly earnings reports"
4. Submit

**Expected Result:**
- API call made to generate agent definition
- New agent appears in the list with auto-populated name, prompt, and tools
- AgentDefinition row created in DB

---

## 14. Audit Log

### TC-067 🔴 — Audit Log — All Actions Recorded

**Title:** Every API call is recorded in the audit log

**Preconditions:** Audit middleware is active

**Steps:**
1. Perform 5 distinct actions (create deal, upload document, generate memo, login, fetch sessions)
2. Navigate to `/admin/audit`

**Expected Result:**
- All 5 actions appear in the audit log table
- Each row shows: userId, method (GET/POST/PATCH/DELETE), path, HTTP status code, latency (ms), timestamp
- No actions are missing from the log

---

### TC-068 🟡 — Audit Log — Filter by Method

**Title:** Audit log can be filtered by HTTP method

**Preconditions:** Audit log has mixed GET/POST/DELETE entries

**Steps:**
1. Navigate to `/admin/audit`
2. Filter by method = POST
3. Filter by method = DELETE

**Expected Result:**
- Only POST entries shown when POST filter active
- Only DELETE entries shown when DELETE filter active
- Row count changes with each filter
- Clearing filter restores full list

---

### TC-069 🟡 — Audit Log — Filter by Path

**Title:** Audit log can be filtered by API path

**Preconditions:** Multiple different API paths recorded

**Steps:**
1. Navigate to `/admin/audit`
2. Enter `/api/deals` in the path filter

**Expected Result:**
- Only rows with path matching `/api/deals` (or containing it) are shown
- Results update within 1 second

---

### TC-070 🟢 — Audit Log — Latency Column

**Title:** Latency values in audit log are realistic

**Preconditions:** Multiple API calls recorded

**Steps:**
1. Navigate to `/admin/audit`
2. Review the latency column

**Expected Result:**
- Latency values are in milliseconds (integers or floats)
- No negative values
- SSE/streaming endpoints may show higher latencies (expected — note in log)
- Simple GET requests are < 500ms

---

## 15. RAG Evaluation

### TC-071 🔴 — RAG Eval — Run Evaluation

**Title:** RAG evaluation runs successfully and streams results

**Preconditions:**
- At least 10 documents indexed
- The 80-question test set is loaded (5 categories: financial-figures, risk-flags, company-facts, lbo-analysis, pe-workflow)

**Steps:**
1. Navigate to `/admin/rag-eval`
2. Select category: "financial-figures"
3. Set max questions to 10
4. Click "Run Evaluation"

**Expected Result:**
- SSE stream begins
- Questions appear one by one with their scores
- On completion, aggregate metrics displayed:
  - Context Precision score (bar shows value, with 85% target line)
  - Answer Faithfulness score (90% target)
  - Answer Relevance score (80% target)
- Results persisted to AgentMemory (verify: `SELECT * FROM "AgentMemory" WHERE type = 'PROCEDURAL' ORDER BY "createdAt" DESC LIMIT 5`)

---

### TC-072 🟡 — RAG Eval — All Five Categories

**Title:** All five question categories can be evaluated

**Preconditions:** Documents covering financial, risk, company facts, LBO, and PE workflow data are indexed

**Steps:**
1. Run evaluation for "financial-figures" category (20 questions)
2. Run evaluation for "risk-flags" category (20 questions)
3. Run evaluation for "company-facts" category (20 questions)
4. Run evaluation for "lbo-analysis" category (10 questions — IRR, MOIC, leverage, exit multiples)
5. Run evaluation for "pe-workflow" category (10 questions — fit scores, IC memo sections, red flag severity)

**Expected Result:**
- All five complete without error
- Each shows per-category breakdown in results
- Scores differ between categories (validates categories are distinct)
- `lbo-analysis` and `pe-workflow` categories are recognized by the eval engine (no "unknown category" error)

---

### TC-073 🟡 — RAG Eval — Show Failing Only Filter

**Title:** "Show failing only" filter hides passing questions

**Preconditions:** RAG evaluation has been run with at least some failing questions

**Steps:**
1. Complete a RAG evaluation
2. Toggle "Show failing only" filter

**Expected Result:**
- Only questions that did not meet threshold are shown
- Passing questions are hidden
- Count label updates to reflect filtered count

---

### TC-074 🟡 — RAG Eval — Metric Bars Accuracy

**Title:** Metric bars accurately reflect calculated scores

**Preconditions:** Evaluation complete

**Steps:**
1. Note the numeric score for Context Precision (e.g., 87%)
2. Observe the progress bar fill level

**Expected Result:**
- Bar fill corresponds to the numeric value (87% fill for 87% score)
- Colors indicate pass/fail: green if above threshold, red if below
- Threshold lines are visible at 85%, 90%, and 80% respectively

---

### TC-075 🟢 — RAG Eval — SSE Disconnect Resilience

**Title:** If SSE connection drops mid-evaluation, partial results are preserved

**Preconditions:** A long evaluation is running (20+ questions)

**Steps:**
1. Start an evaluation with max questions = 20
2. After 10 questions stream in, disable network for 5 seconds
3. Re-enable network

**Expected Result:**
- UI shows partial results (10 questions)
- Either: evaluation resumes, or a clear error message explains it was interrupted
- No data corruption in AgentMemory

---

## 16. Settings

### TC-076 🟡 — Settings — User Profile Update

**Title:** User can update their profile information

**Preconditions:** User is logged in

**Steps:**
1. Navigate to `/settings`
2. Change display name to "QA Test User"
3. Save

**Expected Result:**
- `PATCH /api/users/me` called
- API returns 200
- Updated name visible in the nav header immediately
- Refreshing the page shows the updated name

---

### TC-077 🟡 — Settings — Google Drive OAuth Connection

**Title:** Connecting Google Drive stores OAuth token encrypted

**Preconditions:** Google OAuth credentials configured in environment

**Steps:**
1. Navigate to `/settings`
2. Click "Connect Google Drive"
3. Complete the OAuth flow (authorize access)

**Expected Result:**
- `OAuthToken` record created in DB
- `encryptedToken` column contains ciphertext (not plaintext JSON)
- Settings page shows "Google Drive: Connected"
- Drive sync features become available

---

### TC-078 🟡 — Settings — Google Drive Disconnect

**Title:** Disconnecting Google Drive revokes token

**Preconditions:** Google Drive is connected

**Steps:**
1. Navigate to `/settings`
2. Click "Disconnect Google Drive"
3. Confirm

**Expected Result:**
- `OAuthToken` record deleted or invalidated
- Settings page shows "Google Drive: Not connected"
- Sync features show "Connect Drive first" prompt

---

## 17. API — Cross-cutting Concerns

### TC-079 🔴 — API — clientId Scoping

**Title:** Users cannot access other users' deals or documents via API

**Preconditions:** Two user accounts exist, each with distinct deals

**Steps:**
1. Log in as User A
2. Note the dealId of User A's deal
3. Log in as User B (different session/browser)
4. Attempt: `GET /api/deals/[User-A-deal-id]`

**Expected Result:**
- API returns 403 or 404
- No deal data for User A is returned to User B
- clientId scoping enforced at the query level (not just UI)

---

### TC-080 🔴 — API — No Direct Anthropic SDK Calls from Agent Code

**Title:** All model calls go through InferenceEngine, not direct SDK

**Preconditions:** Codebase access to verify

**Steps:**
1. Search codebase: `grep -r "new Anthropic(" packages/agents packages/rag packages/memory`
2. Search: `grep -r "anthropic.messages.create" packages/agents`

**Expected Result:**
- Zero direct Anthropic SDK instantiations in agent/rag/memory packages
- All calls route through `packages/inference/src/index.ts`

---

### TC-081 🔴 — API — Error Response Format

**Title:** All API errors return `{ error, code, requestId }` format

**Preconditions:** None

**Steps:**
1. Trigger a 404 error: `GET /api/deals/nonexistent-id`
2. Trigger a 401 error: call any protected endpoint without cookie
3. Trigger a 400 error: `POST /api/deals` with missing body

**Expected Result:**
- All responses contain JSON body with keys: `error` (string), `code` (string), `requestId` (string/UUID)
- HTTP status codes are correct (404, 401, 400 respectively)
- No stack traces exposed in production-mode error responses

---

### TC-082 🟡 — API — SSE Event Format

**Title:** SSE endpoints emit events in the correct format

**Preconditions:** A streaming endpoint is available (e.g., CIM analysis, memo generation)

**Steps:**
1. Trigger an SSE endpoint
2. Inspect raw SSE events in the network tab

**Expected Result:**
- Events have format: `data: {"type":"token","content":"..."}` or `{"type":"tool_start","..."}` etc.
- Valid types: `token`, `tool_start`, `tool_result`, `conflict_warning`, `done`
- Final event is `{ type: "done" }` followed by `data: [DONE]` or connection close
- No malformed JSON in any event

---

### TC-083 🟡 — API — Neo4j Unavailable Fallback

**Title:** API continues to function when Neo4j is unavailable

**Preconditions:** Neo4j can be stopped via Docker

**Steps:**
1. Stop the Neo4j container: `docker stop [neo4j-container-name]`
2. Trigger a CIM analysis or chat session with RAG
3. Observe behavior

**Expected Result:**
- API falls back to vector-only RAG (pgvector)
- No 500 error returned to the client
- Log message: "Neo4j unavailable, falling back to vector-only RAG"
- Response is slower but still returns valid output

---

### TC-084 🟡 — API — Drive Webhook Renewal

**Title:** Drive webhooks are renewed before expiry

**Preconditions:** Google Drive sync active; check cron job configuration

**Steps:**
1. Inspect cron job configuration for webhook renewal
2. Verify cron is scheduled at 23:00 UTC daily
3. Check logs for most recent webhook renewal

**Expected Result:**
- Cron job defined at `0 23 * * *` UTC
- Log shows successful renewal within the last 24 hours
- No expired webhook errors in the API logs

---

## 18. Inference Engine

### TC-085 🔴 — InferenceEngine — Model Routing

**Title:** Correct models are used for each task type

**Preconditions:** Debug logging enabled for inference engine

**Steps:**
1. Trigger an entity extraction task (should use Qwen3)
2. Trigger a session summarisation (should use Claude Haiku)
3. Trigger an IC memo section generation (should use Claude Sonnet)

**Expected Result:**
- Qwen3 (Ollama) handles pipeline tasks
- Claude Haiku handles entity verification and session summarization only
- Claude Sonnet handles user-facing outputs (responses, memos, reports)
- No cross-model contamination (e.g., Sonnet not called for pipeline tasks)

---

### TC-086 🔴 — InferenceEngine — Prompt Caching

**Title:** All Claude API calls include cache_control for prompt caching

**Preconditions:** Anthropic API call made (memo generation or chat)

**Steps:**
1. Enable verbose request logging
2. Trigger a Claude Sonnet call (e.g., generate memo section)
3. Inspect the raw API request payload

**Expected Result:**
- Request body contains `cache_control: { type: "ephemeral" }` on at least the system prompt message
- Second identical request shows `cache_read_input_tokens > 0` in the API response (cache hit)
- Cost tracker records the cached vs uncached token counts

---

### TC-087 🔴 — InferenceEngine — System Prompt Token Limits

**Title:** System prompts stay within tier token limits

**Preconditions:** Codebase access

**Steps:**
1. Count tokens for MICRO prompts (should be ≤ 150 tokens)
2. Count tokens for TASK prompts (should be ≤ 400 tokens)
3. Count tokens for AGENT prompts (should be ≤ 800 tokens)

**Expected Result:**
- All prompts in `packages/inference/src/prompt-library.ts` respect their tier limits
- CI check or unit test enforces these limits (if not, add one)

**Notes / Edge Cases:**
- Dynamic context must be injected in the USER turn, not the system prompt — verify this pattern in generated payloads

---

### TC-088 🟡 — InferenceEngine — Ollama JSON Mode

**Title:** Qwen3 pipeline tasks use JSON mode via format parameter

**Preconditions:** Verbose Ollama request logging enabled

**Steps:**
1. Trigger a Qwen3 pipeline task (e.g., entity extraction)
2. Inspect the Ollama HTTP request body

**Expected Result:**
- Request body contains `"format": "json"` as a top-level field (not in the prompt text)
- Response is valid JSON parseable without errors

---

### TC-089 🟡 — InferenceEngine — Cost Tracker

**Title:** Token costs are tracked per model and aggregated

**Preconditions:** At least one Claude API call made

**Steps:**
1. Make one Claude Sonnet call (e.g., generate a memo section)
2. Query the cost tracker: `GET /api/analytics` or check the Analytics page

**Expected Result:**
- Token count (input + output) attributed to Claude Sonnet
- Cost in USD calculated using current model pricing
- Cumulative cost visible in Analytics page
- Cost tracker does not double-count cached tokens

---

## 19. Aria — Deal Pipeline Tools

### TC-093 🔴 — Aria Lists Active Deals

**Title:** Aria calls `list_deals` and returns the current deal pipeline

**Preconditions:**
- User is logged in and has at least 2 deals in the pipeline
- A chat session is open (navigate to `/session/[id]` or create new)

**Steps:**
1. Type: "Show me all my active deals" or "List deals"
2. Send the message

**Expected Result:**
- Activity timeline shows `list_deals` tool card firing
- Aria's response includes each deal with: company name, stage (SOURCING/SCREENING/IC_MEMO etc.), sector, and revenue if available
- Response is formatted as a readable list, not raw JSON
- No "tool not found" or "unknown tool" error

---

### TC-094 🔴 — Aria Creates a New Deal

**Title:** Aria calls `create_deal` and the deal appears on the Pipeline board

**Preconditions:** Session open

**Steps:**
1. Type: "Create a new deal for Meridian Health Group, a healthcare services company"
2. Send the message
3. Navigate to `/pipeline` in another tab

**Expected Result:**
- Activity timeline shows `create_deal` tool card
- Aria confirms: deal name, deal ID, stage = SOURCING
- Deal "Meridian Health Group" visible on the pipeline board under SOURCING
- DB record created: `SELECT * FROM "Deal" WHERE company = 'Meridian Health Group'`

---

### TC-095 🔴 — Aria Triggers CIM Analysis (Fire-and-Forget)

**Title:** Aria calls `run_cim_analysis`, returns immediately, result appears in chat 3–5 minutes later

**Preconditions:**
- A deal with an indexed CIM document exists (or a Drive file ID is available)
- Session open

**Steps:**
1. Type: "Run the CIM analysis on [deal name]"
2. Send and observe the immediate response
3. Wait 3–5 minutes without sending any other message

**Expected Result:**
- **Immediate response** (< 5 seconds): "Alex is running the full CIM analysis on [company]. Results will appear in this chat in 3–5 minutes."
- Activity timeline shows `run_cim_analysis` tool card
- Within 3–5 minutes, a second message appears in the chat automatically (via polling) containing:
  - Fit Score: [n]/100 · Recommendation: PASS/PROCEED/STRONG_PROCEED
  - Financial snapshot (revenue, EBITDA, margin)
  - Red flags list with severity tags
  - Top IC questions
  - Link to full analysis: `/deals/[id]/cim-analysis`
- No `undefined`, `[object Object]`, or raw JSON in the result message

---

### TC-096 🔴 — Aria Triggers IC Memo Generation (Fire-and-Forget)

**Title:** Aria calls `generate_ic_memo`, returns immediately, 13-section memo link appears in chat 5–10 minutes later

**Preconditions:**
- A deal exists (ideally with a completed CIM analysis for best output quality)
- Session open

**Steps:**
1. Type: "Generate the IC memo for [deal name]"
2. Send and observe the immediate response
3. Wait 5–10 minutes

**Expected Result:**
- **Immediate response** (< 5 seconds): "Generating the IC memo for [company] now — all 13 sections including LBO returns, exit analysis, and investment recommendation. This takes 5–10 minutes."
- Activity timeline shows `generate_ic_memo` tool card
- Within 5–10 minutes, a result message appears in the chat containing:
  - Section count generated (e.g., "13/13 sections generated")
  - Excerpt from the Recommendation section
  - Collapsible list of all sections generated
  - Link: `[→ View Full IC Memo](/deals/[id]/memo)`
- Navigating to the memo link shows the full 13-section memo

---

### TC-097 🟡 — Aria Handles Expired Google OAuth Gracefully

**Title:** When Google Drive token is expired, Aria gives a clear reconnect instruction rather than crashing

**Preconditions:** Google Drive OAuth token is expired or missing (remove from Settings to simulate)

**Steps:**
1. Disconnect Google Drive in Settings
2. In an Aria session, type: "Run the CIM analysis on Nexus DataOps using the CIM in my Drive"

**Expected Result:**
- Aria does NOT return a 500 error or raw error stack
- Aria responds with a clear message: "Your Google Drive connection has expired. Please reconnect at Settings → Integrations, then try again."
- If a documentId exists in the database already, Aria can optionally proceed using the existing indexed document instead

---

### TC-098 🔴 — Aria Result Card Renders in Chat

**Title:** The fire-and-forget result message renders correctly in the session page

**Preconditions:** TC-095 has been run and the CIM analysis result message exists in the session

**Steps:**
1. Navigate to the session page where `run_cim_analysis` was triggered
2. Scroll to the result message that appeared after analysis completed

**Expected Result:**
- Message role = ASSISTANT
- `metadata.agentType = "pe_workflow"` (check DevTools Network tab on message fetch)
- Message renders with Markdown formatting: bold headers, bullet lists, and the link to `/deals/[id]/cim-analysis`
- No raw `**` or `##` symbols visible (Markdown is rendered, not displayed as raw text)
- The activity timeline on the right side shows the tool call card (not an empty sidebar)

---

## End-to-End Workflow Tests

### TC-090 🔴 — Full PE Workflow: CIM to IC Memo to Pitch Deck

**Title:** Complete workflow from CIM upload to exported PowerPoint

**Preconditions:**
- Deal "Demo Corp" exists
- A PDF CIM file (realistic, ≥ 15 pages) is available
- All services running (Ollama, Postgres, Redis)

**Steps:**
1. Create deal "Demo Corp" on the pipeline board
2. Navigate to `/deals/[id]/documents` and upload the CIM as a ZIP
3. Navigate to `/deals/[id]/cim-analysis` and run the analysis
4. Verify: company snapshot, fit score (all 5 dimensions), red flags, financials table
5. Navigate to `/deals/[id]/memo` and generate the full 13-section IC memo
6. Verify: all 13 sections populated, no `undefined`; check LBO Returns (Section 5), Exit Analysis (Section 9), Value Creation Plan (Section 11) for content vs. `[DATA NEEDED]`
7. Click "Export PowerPoint"
8. Open the downloaded `.pptx` file

**Expected Result:**
- Each step completes without error
- The `.pptx` file opens with 10 slides, navy/gold theme, content from the memo
- Total elapsed time for the full workflow is under 5 minutes
- No data from other clients appears in the output (clientId scoping verified)

---

### TC-091 🔴 — Demo Corp vs Aura Commodities Isolation

**Title:** Demo Corp deal data does not bleed into Aura Commodities client context

**Preconditions:** Both Demo Corp and Aura Commodities exist as clients

**Steps:**
1. Generate IC Memo for Demo Corp
2. Start a new chat session with Aura Commodities context
3. Ask Aria: "What was discussed in the Demo Corp IC Memo?"

**Expected Result:**
- Aria does not surface Demo Corp data in the Aura Commodities session
- RAG retrieval is scoped to Aura Commodities clientId
- Response either says it doesn't have that context, or correctly redirects without leaking data

---

### TC-092 🟡 — Feedback → Memory → Improved Output Loop

**Title:** Correction feedback affects future outputs

**Preconditions:** At least one OutputFeedback record exists with a correction

**Steps:**
1. Submit negative feedback on a memo section: "The market size estimate should be $2.3B not $1.8B"
2. Verify PROCEDURAL AgentMemory is created (DB check)
3. Regenerate the same memo section

**Expected Result:**
- PROCEDURAL memory row exists with the correction text
- The regenerated section may (ideally) incorporate the correction
- At minimum, the memory is available for the next agent invocation

---

## Appendix: Test Environment Checklist

Before running tests, verify:

- [ ] `docker-compose up -d` — PostgreSQL, Redis, Neo4j all healthy
- [ ] `ollama serve` running with `qwen3:8b` model pulled
- [ ] `ANTHROPIC_API_KEY` set in `.env`
- [ ] `pnpm dev` running (port 3000 + 4000)
- [ ] `curl http://localhost:4000/api/health` returns `{ "status": "ok" }`
- [ ] At least one user account exists (or run `pnpm db:seed`)
- [ ] Demo dataset seeded: `pnpm db:seed` creates NorthStar Software Corp deal
- [ ] Aura Commodities client exists and must NOT be used for test data injection

---

*Document covers 101 test cases across 19 feature areas. All HIGH RISK (🔴) tests must pass before any PE demo. Re-run TC-090 (full workflow) and TC-095–TC-096 (Aria fire-and-forget) after every significant code change.*
