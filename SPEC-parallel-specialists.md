# SPEC: Parallel Specialist Analysis — Commercial & Risk Pre-Pass

**Run order:** PHASE 3 — run AFTER both SPEC-lbo-calculator.md AND SPEC-memo-consistency-pass.md are complete  
**Estimated effort:** 1–2 days  
**DO NOT run in parallel with any spec that modifies `memo-writer.ts`**

---

## Problem

The IC memo's 13 sections are written sequentially. Each section receives the same broad RAG context and produces prose directly — simultaneously analyzing the deal and writing the narrative. This conflates two cognitively distinct tasks: structured analysis (what does the data say?) and narrative writing (how do I communicate it?).

The result: sections like `market_analysis`, `key_risks`, and `investment_thesis` produce generic prose that hedges because the model is reasoning and writing at the same time. A real PE associate reads the CIM first, builds a structured view, then writes. AXIS should do the same.

**What already works via this pattern (do not duplicate):**
- `management_assessment` → `getManagementScore()` pre-computes a structured score block, injected as ground truth
- `lbo_analysis` / `financing_structure` → `lboBlock` pre-computes IRR/MOIC table, injected as ground truth

**The gap:** No equivalent structured pre-pass exists for commercial analysis (market position, growth drivers, buyer universe) or risk analysis (risk register, deal-breakers). These sections write from raw RAG context rather than pre-computed structured findings.

---

## What to Build

### Architecture

Run two specialist analysis functions in **parallel** immediately after the broad RAG query, before the section loop:

```
RAG query (broad) ─────────────────────────────────────────┐
                                                            │
        ┌─── runCommercialAnalysis() ──→ CommercialAnalysis │
        │           [Qwen3, TASK tier]                      │
        │                                                   │
        ├─── runRiskAnalysis()      ──→ RiskAnalysis        │
        │           [Qwen3, TASK tier]                      │
        │                                                   │
  Promise.all([commercial, risk])                           │
        │                                                   │
        └─────────────────────────────────────────────────  │
                                                            │
  Section loop (13 sections, sequential)                    │
    market_analysis    ← commercialBlock injected           │
    investment_thesis  ← commercialBlock injected           │
    exit_analysis      ← commercialBlock injected           │
    key_risks          ← riskBlock injected                 │
    executive_summary  ← commercialBlock + riskBlock        │
    recommendation     ← riskBlock injected                 │
    all other sections ← no change                         │
```

Both specialists receive the same broad RAG context already retrieved — no additional RAG calls, no additional latency on the retrieval side.

---

### 1. New file: `packages/agents/src/specialists/commercial-specialist.ts`

```typescript
import { InferenceEngine } from '@axis/inference'

export interface CommercialAnalysis {
  marketPosition: {
    assessment: 'LEADER' | 'CHALLENGER' | 'FOLLOWER' | 'NICHE'
    rationale: string
    keyDifferentiators: string[]
  }
  revenueQuality: {
    recurringPct: string              // e.g. "~85%" or "unknown"
    topCustomerConcentration: string  // e.g. "top 3 = 42% of ARR" or "unknown"
    nrrSignal: string                 // e.g. ">110%" or "unknown"
    qualityRating: 'HIGH' | 'MEDIUM' | 'LOW'
    flags: string[]                   // specific revenue quality concerns
  }
  growthDrivers: Array<{
    driver: string
    magnitude: 'HIGH' | 'MEDIUM' | 'LOW'
    evidence: string                  // specific data point from CIM
  }>
  competitiveThreats: Array<{
    competitor: string
    threatLevel: 'HIGH' | 'MEDIUM' | 'LOW'
    mechanism: string                 // how exactly they could take share
  }>
  exitBuyerUniverse: Array<{
    buyer: string
    type: 'STRATEGIC' | 'FINANCIAL' | 'IPO'
    rationale: string
  }>
  overallCommercialStrength: 'STRONG' | 'ADEQUATE' | 'WEAK'
}

export function formatCommercialBlock(analysis: CommercialAnalysis): string {
  const pos = analysis.marketPosition
  const rev = analysis.revenueQuality

  const drivers = analysis.growthDrivers
    .map((d) => `  [${d.magnitude}] ${d.driver} — ${d.evidence}`)
    .join('\n')

  const threats = analysis.competitiveThreats
    .map((t) => `  [${t.threatLevel}] ${t.competitor}: ${t.mechanism}`)
    .join('\n')

  const buyers = analysis.exitBuyerUniverse
    .map((b) => `  [${b.type}] ${b.buyer}: ${b.rationale}`)
    .join('\n')

  const revFlags = rev.flags.length > 0
    ? `\n  ⚠ ${rev.flags.join('\n  ⚠ ')}`
    : ''

  return `COMMERCIAL ANALYSIS (pre-computed structured findings — use as ground truth):

Market Position: ${pos.assessment} — ${pos.rationale}
Key Differentiators: ${pos.keyDifferentiators.join(' | ')}

Revenue Quality [${rev.qualityRating}]:
  Recurring Revenue: ${rev.recurringPct}
  Customer Concentration: ${rev.topCustomerConcentration}
  NRR Signal: ${rev.nrrSignal}${revFlags}

Top Growth Drivers:
${drivers}

Competitive Threats:
${threats}

Exit Buyer Universe:
${buyers}

Overall Commercial Strength: ${analysis.overallCommercialStrength}`
}

/**
 * Run commercial analysis against the deal's RAG context.
 * Uses Qwen3 (agent_response route) — pipeline task, not user-facing.
 * Returns null on failure — never blocks memo generation.
 */
export async function runCommercialAnalysis(
  companyName: string,
  ragContext: string,
  userId: string,
  engine: InferenceEngine
): Promise<CommercialAnalysis | null> {
  try {
    const response = await engine.route('agent_response', {
      systemPromptKey: 'COMMERCIAL_ANALYSIS',
      messages: [{
        role: 'user',
        content: `Analyze the commercial position of ${companyName}. Return ONLY valid JSON.\n\nDeal context:\n${ragContext.substring(0, 8000)}`,
      }],
      maxTokens: 1200,
      userId,
    })

    const text = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    return JSON.parse(jsonMatch[0]) as CommercialAnalysis
  } catch {
    return null  // Never block memo generation
  }
}
```

---

### 2. New file: `packages/agents/src/specialists/risk-specialist.ts`

```typescript
import { InferenceEngine } from '@axis/inference'

export interface RiskItem {
  title: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  category: 'OPERATIONAL' | 'FINANCIAL' | 'MARKET' | 'REGULATORY' | 'EXECUTION' | 'LEVERAGE'
  description: string    // specific, quantified where possible
  mitigant: string       // "No credible mitigation identified" if none exists
  residualRisk: 'HIGH' | 'MEDIUM' | 'LOW'
}

export interface RiskAnalysis {
  risks: RiskItem[]
  overallRiskRating: 'HIGH' | 'MEDIUM' | 'LOW'
  topThreeRisks: string[]   // titles only, severity-ordered
  dealBreakers: string[]    // titles of risks that would cause PASS without resolution
}

export function formatRiskBlock(analysis: RiskAnalysis): string {
  const header = `RISK ANALYSIS (pre-computed risk register — use as ground truth for all risk-related sections):

Overall Risk Rating: ${analysis.overallRiskRating}
Deal-Breakers (resolve before LOI): ${analysis.dealBreakers.length > 0 ? analysis.dealBreakers.join('; ') : 'None identified'}

Risk Register:`

  const rows = analysis.risks.map((r, i) =>
    `\n[${i + 1}] [${r.severity}] ${r.title} — ${r.category}
  Issue: ${r.description}
  Mitigant: ${r.mitigant}
  Residual: ${r.residualRisk}`
  ).join('\n')

  return header + rows
}

/**
 * Run risk analysis against the deal's RAG context.
 * Uses Qwen3 (agent_response route) — pipeline task, not user-facing.
 * Returns null on failure — never blocks memo generation.
 */
export async function runRiskAnalysis(
  companyName: string,
  ragContext: string,
  userId: string,
  engine: InferenceEngine
): Promise<RiskAnalysis | null> {
  try {
    const response = await engine.route('agent_response', {
      systemPromptKey: 'RISK_ANALYSIS',
      messages: [{
        role: 'user',
        content: `Identify and score all material risks for ${companyName}. Return ONLY valid JSON.\n\nDeal context:\n${ragContext.substring(0, 8000)}`,
      }],
      maxTokens: 1200,
      userId,
    })

    const text = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    return JSON.parse(jsonMatch[0]) as RiskAnalysis
  } catch {
    return null  // Never block memo generation
  }
}
```

---

### 3. Add prompts to `packages/inference/src/prompt-library.ts`

Add both constants. Both are TASK tier. Add both to the `PROMPT_REGISTRY` object.

#### `COMMERCIAL_ANALYSIS`

```typescript
const COMMERCIAL_ANALYSIS: PromptEntry = {
  key: 'COMMERCIAL_ANALYSIS',
  tier: 'TASK',
  prompt: `You are a PE commercial diligence analyst. Analyze the deal context and return ONLY valid JSON with this exact structure:
{"marketPosition":{"assessment":"LEADER|CHALLENGER|FOLLOWER|NICHE","rationale":"","keyDifferentiators":[]},"revenueQuality":{"recurringPct":"","topCustomerConcentration":"","nrrSignal":"","qualityRating":"HIGH|MEDIUM|LOW","flags":[]},"growthDrivers":[{"driver":"","magnitude":"HIGH|MEDIUM|LOW","evidence":""}],"competitiveThreats":[{"competitor":"","threatLevel":"HIGH|MEDIUM|LOW","mechanism":""}],"exitBuyerUniverse":[{"buyer":"","type":"STRATEGIC|FINANCIAL|IPO","rationale":""}],"overallCommercialStrength":"STRONG|ADEQUATE|WEAK"}

Rules: Base every field on evidence in the context. Use exact figures where available. Set unknown fields to "unknown". Max 4 growthDrivers, 4 competitiveThreats, 5 exitBuyerUniverse entries. Customer concentration >20% = flag it. NRR <100% = flag it. qualityRating HIGH = >80% recurring + NRR >110%. qualityRating LOW = <50% recurring OR top customer >30%.`,
}
```

#### `RISK_ANALYSIS`

```typescript
const RISK_ANALYSIS: PromptEntry = {
  key: 'RISK_ANALYSIS',
  tier: 'TASK',
  prompt: `You are a PE risk analyst. Analyze the deal context and return ONLY valid JSON with this exact structure:
{"risks":[{"title":"","severity":"HIGH|MEDIUM|LOW","category":"OPERATIONAL|FINANCIAL|MARKET|REGULATORY|EXECUTION|LEVERAGE","description":"","mitigant":"","residualRisk":"HIGH|MEDIUM|LOW"}],"overallRiskRating":"HIGH|MEDIUM|LOW","topThreeRisks":[],"dealBreakers":[]}

Rules: Identify 5–8 specific risks. Every HIGH risk description must be quantified — cite the specific figure or fact. Automatic HIGH severity: customer concentration >20%, unaudited financials, leverage coverage <2.0x EBITDA/interest, single-product revenue >80%. mitigant = "No credible mitigation identified" when none exists — do not soften. dealBreakers = risk titles that would cause PASS without resolution. topThreeRisks = titles of 3 most severe risks, severity-ordered.`,
}
```

---

### 4. Modify `packages/agents/src/memo-writer.ts`

Read the current file before making any changes.

#### 4a. Add imports at top of file

```typescript
import { runCommercialAnalysis, formatCommercialBlock } from './specialists/commercial-specialist.js'
import type { CommercialAnalysis } from './specialists/commercial-specialist.js'
import { runRiskAnalysis, formatRiskBlock } from './specialists/risk-specialist.js'
import type { RiskAnalysis } from './specialists/risk-specialist.js'
```

#### 4b. Run specialists in parallel inside `generate()`

After the `styleContext` and `conflicts` are retrieved, but **before** the section loop, add:

```typescript
// Run commercial and risk specialist analysis in parallel
// Both receive the already-retrieved RAG context — no extra retrieval latency
// Failures are handled inside each function — never block memo generation
onProgress({
  type: 'section_start',
  sectionId: 'specialist_analysis',
  sectionTitle: 'Specialist Analysis',
  progress: 8,
  message: 'Running commercial and risk analysis...',
})

const [commercialAnalysis, riskAnalysis] = await Promise.all([
  runCommercialAnalysis(companyName, ragContext.context, userId, this.engine),
  runRiskAnalysis(companyName, ragContext.context, userId, this.engine),
])

onProgress({
  type: 'section_done',
  sectionId: 'specialist_analysis',
  sectionTitle: 'Specialist Analysis',
  progress: 9,
  message: commercialAnalysis && riskAnalysis
    ? 'Specialist analysis complete'
    : 'Specialist analysis partial — continuing with available data',
})
```

#### 4c. Inject specialist outputs into relevant sections inside the section loop

Inside the section loop, alongside the existing `lboInjection`, `managementScoreBlock`, and `graphProvenanceBlock`, add:

```typescript
// Commercial analysis — injected into market, thesis, exit, and executive summary
const commercialBlock = (
  ['market_analysis', 'investment_thesis', 'exit_analysis', 'executive_summary'].includes(section.id)
  && commercialAnalysis
) ? `\n${formatCommercialBlock(commercialAnalysis)}\n` : ''

// Risk analysis — injected into key risks, recommendation, and executive summary
const riskBlock = (
  ['key_risks', 'recommendation', 'executive_summary'].includes(section.id)
  && riskAnalysis
) ? `\n${formatRiskBlock(riskAnalysis)}\n` : ''
```

Then include `commercialBlock` and `riskBlock` in the `userMessage` construction:

```typescript
const userMessage = `SECTION: ${section.title}

INSTRUCTIONS: ${section.instructions}
${styleContext ? `\nSTYLE GUIDE (match this writing style):\n${styleContext}\n` : ''}
${managementScoreBlock ? `\nSTRUCTURED MANAGEMENT SCORES (use as ground truth):\n${managementScoreBlock}\n` : ''}
${lboInjection}
${commercialBlock}
${riskBlock}
${graphProvenanceBlock ? `\nKNOWLEDGE GRAPH PROVENANCE:\n${graphProvenanceBlock}\n` : ''}
DEAL CONTEXT:
Company: ${companyName}
${deal?.notes ? `Notes: ${deal.notes}\n` : ''}
${ragContext.context}${conflictSummary}

Write the "${section.title}" section of the IC memo now.`
```

⚠️ The exact `userMessage` construction may have changed since this spec was written (Agents 1–3 all modified it). Read the actual current file and insert `commercialBlock` and `riskBlock` in the appropriate place — after structured data blocks, before raw RAG context.

---

### 5. Export from `packages/agents/src/index.ts`

```typescript
export { runCommercialAnalysis, formatCommercialBlock } from './specialists/commercial-specialist.js'
export type { CommercialAnalysis } from './specialists/commercial-specialist.js'
export { runRiskAnalysis, formatRiskBlock } from './specialists/risk-specialist.js'
export type { RiskAnalysis, RiskItem } from './specialists/risk-specialist.js'
```

---

## Progress Events

The specialist analysis emits `section_start` at progress 8 and `section_done` at progress 9, before the section loop begins at progress 10. This means the SSE stream shows:

```
→ section_start: specialist_analysis (8%)    ← NEW
→ section_done:  specialist_analysis (9%)    ← NEW
→ section_start: executive_summary (10%)
→ section_done:  executive_summary (16%)
→ ...
→ section_start: consistency_check (92%)
→ section_done:  consistency_check (96%)
```

The `MemoProgressEvent` type already uses optional `sectionId` and `sectionTitle` fields, so `specialist_analysis` flows through without type changes.

---

## Acceptance Criteria

- [ ] `runCommercialAnalysis` and `runRiskAnalysis` run in parallel (Promise.all) — verify by checking that both log start at the same time
- [ ] A memo generated for Nexus DataOps includes a `commercialBlock` in the `market_analysis` section userMessage — add a temporary `console.log` to verify
- [ ] `key_risks` section receives the full pre-computed risk register — verify the section's output lists the same risk titles the specialist identified
- [ ] `executive_summary` receives BOTH commercial and risk blocks — it should have the richest context of any section
- [ ] `financial_analysis`, `lbo_analysis`, `financing_structure` receive NEITHER block — they already have their own ground truth injection
- [ ] If `runCommercialAnalysis` throws, `commercialAnalysis` is null, no sections receive the block, and memo generation continues normally
- [ ] If `runRiskAnalysis` throws, `riskAnalysis` is null, no sections receive the block, and memo generation continues normally
- [ ] Progress event `section_start` for `specialist_analysis` fires at progress 8 before the first memo section starts
- [ ] `pnpm typecheck` passes — `CommercialAnalysis` and `RiskAnalysis` must be properly typed
- [ ] `pnpm build` succeeds

---

## Why This Must Run After SPEC-memo-consistency-pass.md

Both this spec and SPEC-memo-consistency-pass.md modify `memo-writer.ts`. Running them simultaneously will cause one agent's changes to overwrite the other's.

Correct sequence:
1. SPEC-lbo-calculator.md → commit/confirm
2. SPEC-memo-consistency-pass.md → commit/confirm  
3. **This spec** → the implementing agent must read the fully updated `memo-writer.ts` (with LBO block and consistency check) as its starting point

---

## File Change Summary

| File | Change |
|---|---|
| `packages/agents/src/specialists/commercial-specialist.ts` | **CREATE** — `CommercialAnalysis` interface, `runCommercialAnalysis()`, `formatCommercialBlock()` |
| `packages/agents/src/specialists/risk-specialist.ts` | **CREATE** — `RiskAnalysis` + `RiskItem` interfaces, `runRiskAnalysis()`, `formatRiskBlock()` |
| `packages/agents/src/memo-writer.ts` | Import specialists; run both in parallel before section loop; inject blocks into 6 specific sections |
| `packages/inference/src/prompt-library.ts` | Add `COMMERCIAL_ANALYSIS` and `RISK_ANALYSIS` prompts (TASK tier); add both to `PROMPT_REGISTRY` |
| `packages/agents/src/index.ts` | Export new types and functions from both specialist files |
