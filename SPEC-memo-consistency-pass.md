# SPEC: IC Memo Cross-Section Consistency Pass

**Run order:** PHASE 2 — run this AFTER both SPEC-lbo-calculator.md and SPEC-sector-fit-weights.md are complete  
**Estimated effort:** 1–2 days  
**DO NOT run in parallel with SPEC-lbo-calculator.md** — both modify `memo-writer.ts`

---

## Problem

The IC memo's 13 sections are generated sequentially. Each section has its own RAG query and Claude Sonnet call — they share context via the initial broad RAG result, but there is no pass that checks the sections against each other for consistency.

This produces a class of error that is embarrassing in an IC setting: the EBITDA figure cited in the Financial Analysis section (Section 4) can differ from the EBITDA used in the LBO entry assumptions (Section 5). The management team's tenure in Section 9 (Management Assessment) can contradict what was mentioned in Section 2 (Company Overview). The recommendation in Section 13 can say "PROCEED" while Section 8 (Key Risks) lists three HIGH-severity risks with no credible mitigant — internally inconsistent.

A real associate reads the full memo before submitting it and catches these. AXIS needs to do the same.

---

## What to Build

### 1. Add prompt to `packages/inference/src/prompt-library.ts`

Add a new TASK-tier prompt. Insert it near the other IC memo prompts (`IC_MEMO_SECTION`):

```typescript
const MEMO_CONSISTENCY_CHECK: PromptEntry = {
  key: 'MEMO_CONSISTENCY_CHECK',
  tier: 'TASK',
  prompt: `You are a senior PE associate doing a final consistency review of an IC memo before IC submission.

Check the memo for the following specific inconsistencies. Return ONLY valid JSON:
{
  "issues": [
    {
      "severity": "HIGH|MEDIUM|LOW",
      "type": "number_mismatch|recommendation_conflict|fact_contradiction|logic_gap",
      "description": "<one sentence — what is inconsistent and where>",
      "sectionA": "<section id>",
      "sectionB": "<section id>",
      "suggestedFix": "<one sentence — what the corrected statement should say>"
    }
  ],
  "isConsistent": true|false,
  "summaryNote": "<one sentence summary for the analyst>"
}

Checks to perform:
1. NUMBER MISMATCH: Does the Revenue, EBITDA, or entry EV/EBITDA cited in lbo_analysis match what appears in financial_analysis? Flag any difference >5%.
2. RECOMMENDATION CONFLICT: If key_risks has 2+ HIGH severity risks with weak mitigants, does the recommendation section still say STRONG_PROCEED? That is a logic conflict.
3. MANAGEMENT CONTRADICTION: Does the management verdict in management_assessment (EXCEPTIONAL/STRONG/ADEQUATE/WEAK) align with what investment_thesis says about management quality?
4. EXIT CONSISTENCY: Do the exit multiples in exit_analysis align with the base case exit multiple in lbo_analysis?
5. EBITDA BRIDGE: Does the EBITDA at exit in value_creation_plan approximately match the exit EBITDA implied by lbo_analysis base case?

Return an empty issues array if no meaningful inconsistencies are found. Only flag genuine conflicts — do not flag stylistic differences or minor rounding.`,
}
```

Add it to the `PROMPT_REGISTRY` object (the `Record<string, PromptEntry>` constant near the bottom of the file):
```typescript
MEMO_CONSISTENCY_CHECK,
```

---

### 2. Modify `packages/agents/src/memo-writer.ts`

#### 2a. Add a consistency check method

Add a private method to `MemoWriter` class:

```typescript
private async runConsistencyCheck(
  sections: MemoSection[],
  companyName: string,
  userId: string
): Promise<{ issues: ConsistencyIssue[]; isConsistent: boolean; summaryNote: string }> {
  try {
    // Build a compact representation of all sections for the check
    // Only send the first 600 chars of each section to stay within token budget
    const sectionSummaries = sections.map((s) => 
      `## ${s.title} [${s.id}]\n${s.content.substring(0, 600)}${s.content.length > 600 ? '...[truncated]' : ''}`
    ).join('\n\n---\n\n')

    const response = await this.engine.route('agent_response', {
      systemPromptKey: 'MEMO_CONSISTENCY_CHECK',
      messages: [{
        role: 'user',
        content: `Review this IC memo for ${companyName} for internal consistency. Return ONLY valid JSON.\n\n${sectionSummaries}`,
      }],
      maxTokens: 1000,
      userId,
    })

    const text = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text).join('')

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { issues: [], isConsistent: true, summaryNote: 'Consistency check completed.' }

    return JSON.parse(jsonMatch[0]) as {
      issues: ConsistencyIssue[]
      isConsistent: boolean
      summaryNote: string
    }
  } catch {
    return { issues: [], isConsistent: true, summaryNote: 'Consistency check skipped.' }
  }
}
```

#### 2b. Add the `ConsistencyIssue` type

Add near the top of the file, with the other exported types:

```typescript
export interface ConsistencyIssue {
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  type: 'number_mismatch' | 'recommendation_conflict' | 'fact_contradiction' | 'logic_gap'
  description: string
  sectionA: string
  sectionB: string
  suggestedFix: string
}

export interface ConsistencyResult {
  issues: ConsistencyIssue[]
  isConsistent: boolean
  summaryNote: string
}
```

#### 2c. Update `MemoResult` to include consistency results

Add to the `MemoResult` interface:
```typescript
export interface MemoResult {
  dealId: string
  companyName: string
  version: number
  sections: MemoSection[]
  generatedAt: string
  durationMs: number
  consistency?: ConsistencyResult   // ← ADD THIS (optional — not present when regenerating a single section)
}
```

#### 2d. Call the consistency check after all sections are generated

In the `generate()` method, after the section loop completes and sections are sorted, but **before** calling `persistResult`, add:

```typescript
// Run consistency check — only for full memo generation (not single-section regenerate)
let consistencyResult: ConsistencyResult | undefined
if (!sectionId) {
  onProgress({
    type: 'section_start',
    sectionId: 'consistency_check',
    sectionTitle: 'Consistency Review',
    progress: 92,
    message: 'Running consistency review across all sections...',
  })

  consistencyResult = await this.runConsistencyCheck(generatedSections, companyName, userId)

  onProgress({
    type: 'section_done',
    sectionId: 'consistency_check',
    sectionTitle: 'Consistency Review',
    progress: 96,
    message: consistencyResult.isConsistent
      ? 'No inconsistencies detected'
      : `${consistencyResult.issues.length} issue(s) flagged`,
  })
}
```

Then update the `result` object to include it:
```typescript
const result: MemoResult = {
  dealId,
  companyName,
  version: prevVersion + (sectionId ? 0 : 1),
  sections: generatedSections,
  generatedAt: new Date().toISOString(),
  durationMs: Date.now() - startTime,
  consistency: consistencyResult,   // ← ADD
}
```

#### 2e. Add the `MemoProgressEvent` type for the consistency step

The existing `MemoProgressEvent` type already uses `sectionId` and `sectionTitle` as optional fields, so `consistency_check` as a `sectionId` will flow through correctly without type changes.

---

### 3. Surface consistency issues in the IC memo API response

**File:** `apps/api/src/routes/deals.ts` (or wherever the memo generation SSE endpoint is)

The `MemoResult` is already serialised and returned via SSE. Since `consistency` is now part of `MemoResult`, it will be included in the final `done` event payload automatically. No route changes needed.

However, check that the SSE `done` event sends the full result object. If it only sends a subset of fields, add `consistency: result.consistency` to the payload.

---

### 4. Display consistency issues in the IC memo UI

**File:** `apps/web/src/app/deals/[id]/memo/page.tsx` (or wherever the IC memo is rendered)

After the memo sections render, if `consistency.issues.length > 0`, display a collapsible banner:

```
⚠️  Consistency Review — [N] issue(s) found

[HIGH] number_mismatch — EBITDA in Financial Analysis ($8.2M) differs from LBO entry assumption ($7.9M) in LBO Returns Analysis. Suggested fix: Align both sections to $8.2M (source: p.14 of CIM).

[MEDIUM] recommendation_conflict — Two HIGH-severity risks in Key Risks have no credible mitigant, but Recommendation section reads STRONG PROCEED. Consider revising recommendation to PROCEED pending QoE.

[Dismiss all]  [Copy issues to clipboard]
```

If `consistency.isConsistent === true`, display nothing (no green banner needed — keep the UI clean).

**Implementation details:**
- The banner should appear at the top of the memo view, above Section 1
- Each issue should show: severity badge, type label, description, suggested fix
- Issues should be sorted HIGH → MEDIUM → LOW
- The `[Dismiss all]` button sets a local state flag that hides the banner for this session (no DB persistence needed)
- Style: yellow/amber background for MEDIUM issues, red/rose for HIGH issues — consistent with the existing conflict detection banner style

---

## Acceptance Criteria

- [ ] After generating a full IC memo for Nexus DataOps, the response payload includes a `consistency` field with `isConsistent` and `issues` array
- [ ] When generating a **single section** (regenerate button), the consistency check does NOT run — `consistency` is undefined in the result
- [ ] The SSE stream shows a `section_start` event for `consistency_check` after section 13 completes, then a `section_done` event
- [ ] A memo where Section 4 (Financial Analysis) cites EBITDA $8.2M but Section 5 (LBO) uses $7.9M is flagged as `number_mismatch` with `severity: HIGH` — create a test by temporarily hardcoding a mismatched figure in a test run
- [ ] A memo where all financial figures are consistent across sections returns `isConsistent: true` and an empty `issues` array
- [ ] The consistency check never blocks memo delivery — if `runConsistencyCheck` throws, `consistency` is undefined and memo is returned normally
- [ ] Progress reaches 96% after the consistency check (before 100% persist step)
- [ ] The UI displays the consistency banner when issues exist
- [ ] The UI displays nothing when `isConsistent === true`
- [ ] `pnpm typecheck` passes — `MemoResult.consistency` must be typed as `ConsistencyResult | undefined`
- [ ] `pnpm build` succeeds

---

## Why This Must Run After SPEC-lbo-calculator.md

`SPEC-lbo-calculator.md` substantially modifies `memo-writer.ts`:
- Adds an LBO computation block before the section loop
- Injects the computed `lboBlock` into two sections' prompts
- Imports from `lbo-calculator.ts`

This spec also modifies `memo-writer.ts`:
- Adds a private method `runConsistencyCheck`
- Adds types `ConsistencyIssue` and `ConsistencyResult`
- Updates `MemoResult` interface
- Adds a consistency call block after the section loop

If both run simultaneously, both agents will be editing the same function and the same interface. One agent's changes will overwrite or conflict with the other's.

**Correct sequence:** Complete Spec 1 (lbo-calculator) → `git commit` or confirm changes → then run this spec. The Claude Code agent implementing this spec should read the updated `memo-writer.ts` as its starting point.

---

## File Change Summary

| File | Change |
|---|---|
| `packages/inference/src/prompt-library.ts` | Add `MEMO_CONSISTENCY_CHECK` prompt (TASK tier) |
| `packages/agents/src/memo-writer.ts` | Add `ConsistencyIssue` + `ConsistencyResult` types; update `MemoResult`; add `runConsistencyCheck()` method; call it after section loop in `generate()` |
| `apps/api/src/routes/deals.ts` | Verify `consistency` field flows through SSE done payload (likely no change needed) |
| `apps/web/src/app/deals/[id]/memo/page.tsx` | Add consistency issues banner above Section 1 |
