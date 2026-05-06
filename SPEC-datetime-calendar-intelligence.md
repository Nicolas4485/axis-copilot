# PRD: Date/Time Awareness + Calendar Intelligence

**Status:** Ready for implementation  
**Priority:** P1 — Next sprint (parallel with Perplexity spec)  
**Stack:** Node.js / TypeScript / Express / Prisma / Google Calendar API  
**Estimated effort:** 4–6 days  
**Dependencies:** Google Calendar MCP connected ✅, Gmail MCP connected ✅, Granola MCP connected ✅

---

## Problem Statement

AXIS agents do not have reliable access to the current date and time at runtime. The date is injected once into `CLAUDE.md` per session but is not available dynamically during agent execution — meaning agents cannot compute deadlines, flag urgency, or reason about how many days remain until a deliverable is due. Additionally, when a deadline or task is mentioned in any conversation — or detected in an email, meeting note, or uploaded document — there is no mechanism to capture it and create a Google Calendar event. Time-sensitive information is routinely lost between sessions.

---

## Goals

1. All 6 agents know the current date and time at the moment of every inference call — not from a cached session value but injected dynamically at runtime.
2. Any agent can detect a deadline or task commitment mentioned in conversation and surface it to Nicolas before taking any calendar action.
3. When Nicolas is offline, detected tasks queue and Aria surfaces them on next AXIS open, plus an email notification is sent with Confirm/Skip CTAs.
4. Background scanning of new Gmail threads, Granola meeting notes, and ingested documents surfaces time-sensitive items without Nicolas having to explicitly process them.
5. Aria is the single agent responsible for creating Google Calendar events — other agents detect and hand off to Aria, they do not create events themselves.

---

## Non-Goals

- **Real-time push notifications to mobile** — out of scope; email is the offline channel for now.
- **Task management system integration** (Todoist, Notion tasks, Linear) — Google Calendar only in v1; task systems are a separate spec.
- **Recurring event creation** — one-off events only; recurring patterns are too ambiguous to automate safely.
- **Autonomous calendar management** — agents never create, modify, or delete calendar events without Nicolas confirming. Always ask first.
- **Multi-timezone support** — use Nicolas's local timezone (inferred from Google Calendar settings) only.
- **NLP training / fine-tuning** — deadline detection uses prompt-based extraction, not a custom ML model.

---

## User Stories

### All Agents — Date/Time Awareness

- As any AXIS agent, I want to know the exact current date and time when I'm generating a response so that I can calculate days-to-deadline, flag urgency, and reference dates accurately in deliverables.
- As Kevin, when I produce a competitive brief dated today, I want the date to be accurate — not a stale session value.
- As Alex, when a CIM states a management presentation is in 3 weeks, I want to flag it as a live deadline with the exact number of days remaining.

### All Agents — Deadline Detection in Conversation

- As any AXIS agent, when Nicolas says "I need to send the IC memo to the committee by Friday" mid-conversation, I want to surface a confirmation prompt: "I noticed a deadline — send IC memo to committee by [date]. Add to calendar?" — before taking any action.
- As Nicolas, I want to be able to say "yes" or "skip" without leaving the conversation.

### Aria — Calendar Creation

- As Aria, when a detected task is confirmed by Nicolas (in-session or via email CTA), I want to create a Google Calendar event with a relevant title, correct date/time, and an optional description linking it to the deal or client.
- As Aria, when I open a new AXIS session and there are queued pending tasks from previous conversations, I want to surface them immediately: "I found 2 tasks from your last conversations — shall I add them to your calendar?"

### Background Scanning

- As Nicolas, when I receive an email with a deadline ("please respond by Thursday"), I want Aria to detect it in the background and queue it for my review — without me having to forward the email to an agent.
- As Nicolas, when a Granola meeting note contains an action item with a date, I want it captured automatically.
- As Nicolas, when I upload a CIM or document that mentions management presentation dates, regulatory deadlines, or LOI timelines, I want them extracted during ingestion and queued.

### Offline Handling

- As Nicolas, when a deadline is detected while I'm offline, I want to receive an email with:
  - What was detected ("IC memo due — Friday 25 April 2026")
  - Where it came from ("Detected in: email from John Smith, 21 April")
  - Two CTA buttons: **Add to Calendar** / **Skip**
- As Nicolas, when I return to AXIS, I want Aria to show a summary of any pending calendar items before I start working.

---

## Requirements

### P0 — Must Have

---

#### 1. Dynamic date/time injection into all agent inference calls

**Where to change:** `packages/agents/src/base-agent.ts` (the `run()` or `buildMessages()` method that constructs the user-turn message before inference).

**What to change:**

In the method that assembles the messages array sent to the `InferenceEngine`, prepend a date/time block to the user-turn content:

```typescript
const now = new Date()
const dateTimeBlock = `[SYSTEM CONTEXT — injected at ${now.toISOString()}]
Current date: ${now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Current time: ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
[END SYSTEM CONTEXT]`
```

This goes in the **user turn**, not the system prompt — consistent with the AXIS architecture rule (dynamic context in user turn, not system prompt).

**Acceptance criteria:**
- [ ] Every inference call from any of the 6 agents includes the current ISO timestamp in the user turn
- [ ] The date/time block is prepended before the user's actual query — not appended after
- [ ] The block format is consistent across all agents
- [ ] Changing timezone on the server updates the output correctly
- [ ] Does not increase system prompt token count (stays in user turn per architecture rules)

---

#### 2. New tool: `detect_deadline`

**File:** `packages/tools/src/detect-deadline.ts`

This tool is called by agents internally when they identify candidate deadline text in a conversation or document. It normalises the raw text into a structured deadline object.

```typescript
export interface DetectDeadlineInput {
  rawText: string           // The phrase that looks like a deadline, e.g. "IC memo due Friday"
  sourceType: 'conversation' | 'email' | 'document' | 'meeting_note'
  sourceRef?: string        // e.g. email thread ID, document title, deal name
  contextSnippet?: string   // surrounding text for disambiguation
}

export interface DetectedDeadline {
  title: string             // Clean task title, e.g. "Send IC memo to investment committee"
  isoDate: string           // ISO 8601 date, e.g. "2026-04-25T00:00:00"
  confidence: 'high' | 'medium' | 'low'
  sourceType: string
  sourceRef?: string
  rawText: string
}
```

**Behaviour:** Calls Qwen3 (via `InferenceEngine`) with a TASK-tier prompt (`DEADLINE_EXTRACT`) to parse the raw text into a `DetectedDeadline`. Returns `null` if confidence is low and the agent should not surface it.

**Acceptance criteria:**
- [ ] Correctly parses relative dates: "by Friday", "in 3 weeks", "end of month", "EOD tomorrow"
- [ ] Correctly parses absolute dates: "April 25", "25/04/2026", "Q2 close"
- [ ] Returns `confidence: 'low'` and does not queue if the text is ambiguous with no date
- [ ] Uses current date (from Step 1 injection) as the reference for relative date resolution
- [ ] Returns `null` for clearly non-deadline phrases

---

#### 3. New prompt: `DEADLINE_EXTRACT` in `packages/inference/src/prompt-library.ts`

**Tier:** TASK (≤400 tokens)

```
Extract a deadline or task commitment from the provided text.
Return JSON: { "title": string, "isoDate": string | null, "confidence": "high"|"medium"|"low" }
- title: clean, action-oriented task name (under 60 chars)
- isoDate: ISO 8601 date. If only a date is mentioned (no time), use T09:00:00 as default.
- confidence: high if date is explicit, medium if relative and unambiguous, low if unclear.
Return { "title": null, "isoDate": null, "confidence": "low" } if no clear deadline exists.
Today's date will be provided in the user turn.
```

---

#### 4. New Prisma model: `PendingCalendarTask`

**File:** `prisma/schema.prisma` — add model, then `pnpm db:migrate`

```prisma
model PendingCalendarTask {
  id           String   @id @default(cuid())
  userId       String
  title        String
  isoDate      String
  sourceType   String   // 'conversation' | 'email' | 'document' | 'meeting_note'
  sourceRef    String?  // email thread ID, doc title, deal name
  rawText      String   // original text for display
  status       String   @default("pending") // 'pending' | 'confirmed' | 'skipped'
  calendarEventId String? // Google Calendar event ID after confirmation
  createdAt    DateTime @default(now())
  confirmedAt  DateTime?

  user         User     @relation(fields: [userId], references: [id])

  @@map("pending_calendar_tasks")
}
```

---

#### 5. Deadline detection in all 6 agent system prompts

**File:** `packages/inference/src/prompt-library.ts`

Add to ALL 6 agent prompts (Aria, Sean, Kevin, Mel, Anjie, Alex) — in the RULES or CRITICAL RULES section:

```
DEADLINE DETECTION:
When the user mentions a deadline, due date, commitment, or time-sensitive task — even casually —
call detect_deadline with the relevant phrase. If confidence is high or medium, surface it:
"I noticed a deadline: [task] by [date]. Shall I add this to your calendar?"
Wait for explicit confirmation before calling create_calendar_event.
Never create calendar events without confirmation.
```

Add `detect_deadline` to tools for all 6 agents.  
Add `create_calendar_event` to Aria's tools only.

---

#### 6. New tool: `create_calendar_event`

**File:** `packages/tools/src/create-calendar-event.ts`

Aria calls this only after explicit confirmation. Creates the Google Calendar event via the existing OAuth token mechanism (same pattern as `book_meeting` in `calendar-task-tools.ts`).

```typescript
export interface CreateCalendarEventInput {
  pendingTaskId: string   // PendingCalendarTask.id — marks it confirmed
  title: string
  isoDate: string
  description?: string   // e.g. "From AXIS — Nexus DataOps deal. Source: email from John Smith"
  durationMinutes?: number  // default 30 for task reminders, 60 for meetings
}
```

**Behaviour:**
1. Create Google Calendar event via `CALENDAR_API` (same auth flow as `book_meeting`)
2. Update `PendingCalendarTask.status = 'confirmed'` and store `calendarEventId`
3. Return event link for confirmation message to user

**Acceptance criteria:**
- [ ] Event appears in Google Calendar within 5 seconds of confirmation
- [ ] `PendingCalendarTask` is marked `confirmed` with the event ID
- [ ] Event description includes source context ("Detected in conversation, 21 Apr 2026")
- [ ] If Google Calendar API errors, return `{ success: false, error }` and keep task as `pending`
- [ ] Aria confirms to Nicolas: "Done — added '[title]' to your calendar for [date]. [View event →]"

---

#### 7. Aria session-start pending task surface

**Where:** Aria's `run()` method, or as a startup hook in the session initialization.

**Behaviour:** When Aria is invoked (any conversation with Aria), before responding to the user's message, query `PendingCalendarTask` for `{ userId, status: 'pending' }`. If count > 0, prepend to Aria's response:

```
📅 I found {N} pending task{s} from your recent conversations. Shall I add them to your calendar?

1. "Send IC memo to committee" — Friday 25 April 2026 (from: conversation, 21 Apr)
2. "Call John re: Nexus LOI" — Monday 28 April 2026 (from: email thread, 20 Apr)

[Yes, add all] [Review one by one] [Skip for now]
```

The UI renders these as action buttons (existing SSE pattern with `type: 'action_prompt'`).

**Acceptance criteria:**
- [ ] Appears on Aria's first response in a new session when pending tasks exist
- [ ] Does not appear if no pending tasks
- [ ] "Yes, add all" calls `create_calendar_event` for each pending task in sequence
- [ ] "Skip for now" marks all as `status: 'skipped'`
- [ ] "Review one by one" presents each task individually for confirmation

---

#### 8. Email notification for offline-detected tasks

**Where:** New service `apps/api/src/services/notification-email.ts`

**Trigger:** When a `PendingCalendarTask` is created and the user has not been active in AXIS in the last 15 minutes (check `Session.updatedAt` or a last-seen timestamp).

**Email format:**
```
Subject: AXIS — 1 pending task needs your attention

Hi Nicolas,

I found a time-sensitive item while you were away:

📌 Send IC memo to investment committee
   Due: Friday, 25 April 2026
   Detected in: Email from John Smith (20 Apr 2026)
   Original text: "Please ensure the memo is with us by Friday"

[Add to Calendar]  [Skip]

---
This email was sent by AXIS. Reply to this email or open AXIS to manage your tasks.
```

**CTA links** point to:
- `GET /api/calendar-tasks/{id}/confirm?token={jwt}` — creates the event and redirects to AXIS
- `GET /api/calendar-tasks/{id}/skip?token={jwt}` — marks skipped and redirects to AXIS

Both endpoints require a signed JWT (short-lived, 48h) generated at email-send time — no login required to action the CTA.

**Acceptance criteria:**
- [ ] Email sent within 2 minutes of task creation when user is offline
- [ ] "Add to Calendar" CTA creates the Google Calendar event without requiring AXIS login
- [ ] "Skip" CTA marks task skipped without requiring AXIS login
- [ ] JWT expires after 48 hours — expired links show a friendly error and prompt to open AXIS
- [ ] Only one email per batch of tasks detected in the same 5-minute window (debounce)
- [ ] Uses existing email sending infrastructure (or Nodemailer if none exists)

---

#### 9. API endpoints for CTA handling

**File:** `apps/api/src/routes/calendar-tasks.ts` (new file)

```
GET  /api/calendar-tasks                        — list pending tasks for current user
POST /api/calendar-tasks/:id/confirm            — confirm + create calendar event (authenticated)
POST /api/calendar-tasks/:id/skip               — skip task (authenticated)
GET  /api/calendar-tasks/:id/confirm?token=JWT  — CTA from email (JWT auth, no session)
GET  /api/calendar-tasks/:id/skip?token=JWT     — CTA from email (JWT auth, no session)
```

---

### P1 — Nice to Have

#### 10. Background scanning: Gmail

**File:** `apps/api/src/jobs/scan-gmail-deadlines.ts`

A cron job (runs every 30 minutes via existing cron infrastructure) that:
1. Calls `search_gmail` with queries like `"by Friday" OR "due date" OR "deadline" OR "please respond by"` for threads from the last 24 hours
2. For each matching thread, calls `detect_deadline` on the relevant snippet
3. Creates `PendingCalendarTask` rows for high/medium confidence results
4. Deduplicates: does not re-process the same `sourceRef` (email thread ID)

**Acceptance criteria:**
- [ ] Runs on schedule, logs results
- [ ] Does not create duplicate pending tasks for the same email thread
- [ ] Only processes emails from the last 24 hours (avoid re-scanning old mail)
- [ ] Errors in Gmail API are caught and logged — job does not crash

#### 11. Background scanning: Granola meeting notes

**File:** `apps/api/src/jobs/scan-granola-deadlines.ts`

Same pattern as Gmail scanner but calls `list_meetings` from Granola MCP, processes transcripts for action items with dates from meetings in the last 48 hours.

#### 12. Background scanning: document ingestion

**File:** `packages/ingestion/src/pipeline.ts`

During CIM/document ingestion, after chunking, run a pass looking for date patterns (LOI deadline, management presentation date, exclusivity period end, regulatory approval date). Create `PendingCalendarTask` rows for any found, with `sourceType: 'document'` and `sourceRef: document.title`.

#### 13. Agent urgency flagging

When an agent's response references a `PendingCalendarTask` with fewer than 3 days remaining, prepend a ⚠️ urgency flag to the agent's response:

```
⚠️ Deadline in 2 days: "Send IC memo to committee" — Friday 25 April
```

This is computed by Aria at session start or whenever a relevant deal is discussed.

---

### P2 — Future

- Slack/Teams integration for deadline notifications (alternative to email).
- Deal-level deadline board: a view in `/deals/[id]` showing all pending and confirmed deadlines for that deal.
- Recurring task patterns: "every Monday, remind me to check deal pipeline" — requires NLP pattern matching + recurring Google Calendar event creation.
- Smart snooze: "remind me again on Wednesday" from the email CTA.
- Integration with Google Tasks (parallel to Calendar events for lightweight to-dos).

---

## Success Metrics

**Leading (within 1 week):**
- Date/time appears correctly in all agent responses that reference dates — verified by manual test across all 6 agents
- At least 1 `PendingCalendarTask` created and confirmed to Google Calendar in a real session
- Email CTA tested end-to-end: task created → email received → CTA clicked → event in Calendar

**Lagging (within 1 month):**
- Zero missed deadlines from AXIS-handled deals (subjective, tracked by Nicolas)
- Aria's session-start pending task surface used in ≥50% of sessions where pending tasks exist

---

## Open Questions

| Question | Owner | Blocking? |
|---|---|---|
| What email infrastructure is already in the API? (Nodemailer, SendGrid, SES?) | Engineering | Yes — determines how to implement notification-email.ts |
| What timezone should be used as default for date resolution? | Nicolas | Yes — "Europe/London"? Check Nicolas's Google Calendar settings |
| Should the 15-minute offline threshold for email notification be configurable? | Nicolas | No — hardcode 15 min initially |
| Granola MCP: does `get_meeting_transcript` return action items already extracted, or raw transcript? | Engineering (test MCP) | Yes — determines how much parsing is needed in the scanner |
| Should background scanning run for all users or only the primary user (Nicolas)? | Nicolas | No — single-user for now |

---

## Implementation Order

1. **Step 1** — Dynamic date/time injection in `base-agent.ts` — 2 hours, highest value, safest change
2. **Step 2** — `DEADLINE_EXTRACT` prompt in `prompt-library.ts` — 1 hour
3. **Step 3** — `detect-deadline.ts` tool — 3 hours
4. **Step 4** — `PendingCalendarTask` Prisma model + migration — 1 hour
5. **Step 5** — `create-calendar-event.ts` tool — 3 hours (reuse `book_meeting` auth pattern)
6. **Step 6** — Update all 6 agent prompts with deadline detection rules — 2 hours
7. **Step 7** — Add `detect_deadline` to all agent tool arrays; `create_calendar_event` to Aria only — 1 hour
8. **Step 8** — Aria session-start pending task surface — 3 hours (UI + SSE action prompt)
9. **Step 9** — API routes for calendar task confirm/skip — 2 hours
10. **Step 10** — Email notification service + JWT CTA links — 4 hours
11. **Step 11** (P1) — Gmail background scanner cron — 3 hours
12. **Step 12** (P1) — Granola background scanner cron — 2 hours
13. **Step 13** (P1) — Document ingestion deadline extraction — 2 hours

---

## File Change Summary

| File | Change |
|---|---|
| `packages/agents/src/base-agent.ts` | Inject current ISO date/time into user turn before every inference call |
| `packages/inference/src/prompt-library.ts` | Add `DEADLINE_EXTRACT` prompt; add deadline detection rules to all 6 agent prompts |
| `packages/tools/src/detect-deadline.ts` | **CREATE** — new tool |
| `packages/tools/src/create-calendar-event.ts` | **CREATE** — new tool (Aria only) |
| `packages/tools/src/index.ts` | Export both new tools |
| `packages/agents/src/tool-registry.ts` | Register `detect_deadline` and `create_calendar_event` |
| `packages/agents/src/specialists/*.ts` | Add `detect_deadline` to all 6 agents; `create_calendar_event` to Aria only |
| `prisma/schema.prisma` | Add `PendingCalendarTask` model |
| `prisma/migrations/` | New migration for `pending_calendar_tasks` table |
| `apps/api/src/routes/calendar-tasks.ts` | **CREATE** — confirm/skip endpoints |
| `apps/api/src/services/notification-email.ts` | **CREATE** — offline notification sender |
| `apps/api/src/jobs/scan-gmail-deadlines.ts` | **CREATE** (P1) — Gmail background scanner |
| `apps/api/src/jobs/scan-granola-deadlines.ts` | **CREATE** (P1) — Granola background scanner |
| `packages/ingestion/src/pipeline.ts` | Add deadline extraction pass during ingestion (P1) |
