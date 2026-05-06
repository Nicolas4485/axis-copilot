# SPEC: Sector-Specific Fit Score Weights

**Run order:** PHASE 1 (parallel with SPEC-lbo-calculator.md)  
**Estimated effort:** 1 day  
**Safe to run alongside SPEC-lbo-calculator.md** — no overlapping file edits except a different section of `prompt-library.ts`

> ⚠️ If running in parallel with SPEC-lbo-calculator.md, coordinate on `prompt-library.ts`:
> - This spec modifies the `CIM_FIT_SCORE` constant
> - That spec adds a new `LBO_DATA_UNAVAILABLE` constant
> - These are different variables — merge both changes, do not overwrite each other

---

## Problem

The fit score that drives the PASS / PROCEED / STRONG PROCEED recommendation uses fixed weights across all sectors:

```
businessQuality 30% + financialQuality 25% + managementStrength 20% + marketDynamics 15% + dealStructure 10%
```

These weights are wrong for most sectors. Examples:
- **Vertical SaaS:** Financial quality (NRR, retention, ARR growth) should be 35% — it IS the business quality for a recurring revenue model. They're redundant dimensions at equal weight.
- **Healthcare Services / Healthcare IT:** Regulatory risk (reimbursement, CMS rate changes, Stark Law) is not captured in business quality — marketDynamics should be weighted higher to capture this exposure.
- **Industrial & Manufacturing / carve-outs:** Management strength is the key risk (new team, carve-out execution) and should outweigh dealStructure.
- **Distribution & Logistics:** Thin margins mean financial quality discipline is the primary gating factor — it should be weighted at 30%.
- **Financial Services:** Compliance moat and recurring transaction revenue dominate — financialQuality should be elevated.

A wrong weighting produces a misleading recommendation. A 75/100 SaaS score with weak NRR should not get `STRONG_PROCEED`.

---

## What to Build

### 1. Add `fitScoreWeights` to `SectorBenchmark` interface in `packages/agents/src/sector-benchmarks.ts`

**Add to the `SectorBenchmark` interface:**

```typescript
/** Dimension weights for fit scoring — must sum to 1.0 */
fitScoreWeights: {
  businessQuality: number    // moat, pricing power, product differentiation
  financialQuality: number   // margin quality, FCF, revenue composition, retention metrics
  managementStrength: number // team depth, track record, founder dependency, succession
  marketDynamics: number     // TAM, growth, competitive intensity, secular trends
  dealStructure: number      // entry multiple, leverage, covenants, pricing vs. comps
}
```

**Add `fitScoreWeights` to all 8 existing sector benchmark objects.** Use the values below. Verify each sector's weights sum to exactly 1.0.

The actual 8 sectors in `sector-benchmarks.ts` are (use these exact `sector` field strings to locate each object):

| Sector (exact `sector` field value) | businessQuality | financialQuality | managementStrength | marketDynamics | dealStructure |
|---|---|---|---|---|---|
| `Vertical SaaS` | 0.25 | 0.35 | 0.15 | 0.15 | 0.10 |
| `Healthcare IT` | 0.25 | 0.30 | 0.15 | 0.20 | 0.10 |
| `Business Services` | 0.25 | 0.25 | 0.25 | 0.10 | 0.15 |
| `Industrial & Manufacturing` | 0.25 | 0.20 | 0.25 | 0.15 | 0.15 |
| `Healthcare Services` | 0.20 | 0.20 | 0.20 | 0.25 | 0.15 |
| `Education & Training` | 0.25 | 0.20 | 0.20 | 0.25 | 0.10 |
| `Distribution & Logistics` | 0.20 | 0.30 | 0.20 | 0.15 | 0.15 |
| `Financial Services` | 0.25 | 0.30 | 0.15 | 0.20 | 0.10 |

Weight rationale:
- **Vertical SaaS**: financialQuality elevated because NRR and ARR retention ARE the business moat
- **Healthcare IT**: marketDynamics elevated for reimbursement / regulatory exposure; financialQuality high for recurring revenue model
- **Business Services**: managementStrength elevated — human capital is the product; dealStructure slightly higher (leverage matters in margin-thin services)
- **Industrial & Manufacturing**: managementStrength elevated for carve-out execution risk; equal businessQuality for proprietary IP/aftermarket moat
- **Healthcare Services**: marketDynamics elevated to capture CMS reimbursement rate risk and payor mix dynamics
- **Education & Training**: marketDynamics elevated for regulatory risk (Title IV, DoE) and accreditation moat
- **Distribution & Logistics**: financialQuality elevated — thin margins mean financial discipline is the gating factor
- **Financial Services**: financialQuality elevated for recurring transaction revenue; marketDynamics for regulatory compliance moat

**Also add a default weights export** for cases where no sector benchmark is found:

```typescript
export const DEFAULT_FIT_WEIGHTS = {
  businessQuality: 0.30,
  financialQuality: 0.25,
  managementStrength: 0.20,
  marketDynamics: 0.15,
  dealStructure: 0.10,
}
```

---

### 2. Modify `packages/agents/src/cim-analyst.ts`

The fit scoring step (Step 4) currently sends all inputs to `CIM_FIT_SCORE` which uses its own hardcoded weights. Change it to:

1. Extract the sector benchmark's weights (or fall back to defaults)
2. Pass the weights into the scoring prompt via the user message

**Find the `CIM_FIT_SCORE` call in Step 4 and modify the user message content:**

```typescript
// Import DEFAULT_FIT_WEIGHTS at top of file
import { findSectorBenchmark, formatBenchmarkForPrompt, DEFAULT_FIT_WEIGHTS } from './sector-benchmarks.js'

// In Step 4, before the scoreResponse call:
const weights = sectorBenchmark?.fitScoreWeights ?? DEFAULT_FIT_WEIGHTS

const weightBlock = `
SCORING WEIGHTS FOR THIS SECTOR (${sectorBenchmark?.sector ?? 'General / Unknown'}):
businessQuality:    ${(weights.businessQuality * 100).toFixed(0)}%
financialQuality:   ${(weights.financialQuality * 100).toFixed(0)}%
managementStrength: ${(weights.managementStrength * 100).toFixed(0)}%
marketDynamics:     ${(weights.marketDynamics * 100).toFixed(0)}%
dealStructure:      ${(weights.dealStructure * 100).toFixed(0)}%
Sum: 100% — use EXACTLY these weights to compute overallFit.`

const scoreResponse = await this.engine.route('user_report', {
  systemPromptKey: 'CIM_FIT_SCORE',
  messages: [{
    role: 'user',
    content: `Score this deal across 5 dimensions. Return ONLY valid JSON.\n\n${scoringContext}${financialBlock}${benchmarkBlock}\n\n${weightBlock}`,
  }],
  maxTokens: 1500,
  userId,
})
```

---

### 3. Modify `packages/inference/src/prompt-library.ts` — update `CIM_FIT_SCORE`

**Find the `CIM_FIT_SCORE` constant and replace its `prompt` string** with this updated version that explicitly handles dynamic weights:

```typescript
const CIM_FIT_SCORE: PromptEntry = {
  key: 'CIM_FIT_SCORE',
  tier: 'TASK',
  prompt: `Score a PE deal opportunity across 5 dimensions (0-100 each). Return ONLY valid JSON:
{"businessQuality":{"score":0,"rationale":"","evidence":""},"financialQuality":{"score":0,"rationale":"","evidence":""},"managementStrength":{"score":0,"rationale":"","evidence":""},"marketDynamics":{"score":0,"rationale":"","evidence":""},"dealStructure":{"score":0,"rationale":"","evidence":""},"overallFit":0,"weightsUsed":{"businessQuality":0,"financialQuality":0,"managementStrength":0,"marketDynamics":0,"dealStructure":0},"recommendation":"PASS|PROCEED|STRONG_PROCEED","redFlags":[{"flag":"","severity":"HIGH|MEDIUM|LOW","pageRef":""}],"keyQuestions":[]}

CRITICAL: overallFit = weighted average using the SCORING WEIGHTS provided in the user message.
If weights are not provided, use: businessQuality 30%, financialQuality 25%, managementStrength 20%, marketDynamics 15%, dealStructure 10%.
Score honestly. Flag missing data as 0 with rationale "Insufficient data". Echo the weights used in weightsUsed field.
Recommendation thresholds: overallFit < 55 → PASS; 55–74 → PROCEED; 75+ → STRONG_PROCEED.`,
}
```

Key changes from the existing prompt:
- Added `weightsUsed` field to the JSON output — so we can display in the UI which weights were applied
- Added the `CRITICAL` instruction to use provided weights
- Made recommendation thresholds explicit (they were implicit before)

⚠️ `CIM_FIT_SCORE` **already exists** in the `PROMPT_REGISTRY` object at the bottom of the file. Do NOT add a new entry. Only replace the `prompt` string within the existing `const CIM_FIT_SCORE` definition. The registry entry `CIM_FIT_SCORE,` is already present.

---

### 4. Display weights in the CIM analysis UI (optional but recommended)

**File:** `apps/web/src/app/deals/[id]/page.tsx` (or wherever the CIM analysis result is rendered)

In the fit score / radar chart section, add a small footnote below the radar chart:

```
Scored using [sector] weights: Business Quality [X]% · Financial Quality [X]% · Management [X]% · Market [X]% · Deal Structure [X]%
```

Pull this from `fitScore.rationale` or from the `weightsUsed` field in the parsed fit score JSON — whichever is easier to thread through from the API response to the UI.

This is low priority — the core scoring fix works without the UI change. Mark with a `// TODO: display weights` comment if skipping in the first pass.

---

## Acceptance Criteria

- [ ] All 8 sector benchmark objects in `sector-benchmarks.ts` have a `fitScoreWeights` field and the weights sum to exactly 1.0 for each sector
- [ ] `DEFAULT_FIT_WEIGHTS` is exported and sums to 1.0
- [ ] Running CIM analysis on a Distribution & Logistics deal produces a fit score where `financialQuality` weight = 30% — verify by checking the scoring prompt sent to Qwen3 (add a `console.log(weightBlock)` temporarily to confirm)
- [ ] Running CIM analysis on a SaaS deal (e.g. Nexus DataOps) produces a fit score where `financialQuality` weight = 35% and sector resolves to "Vertical SaaS"
- [ ] The `overallFit` number in the returned JSON is a weighted average using the sector weights, not a flat average — verify: manually compute the weighted average from the 5 dimension scores and confirm it matches `overallFit` within 1 point
- [ ] The `weightsUsed` field is present in the fit score JSON and contains the weights that were applied
- [ ] When no sector benchmark matches (unknown sector), `DEFAULT_FIT_WEIGHTS` is used and the scoring still returns valid JSON
- [ ] `pnpm typecheck` passes — `fitScoreWeights` must be non-optional on `SectorBenchmark` so TypeScript enforces it on all 8 objects
- [ ] `pnpm build` succeeds

---

## File Change Summary

| File | Change |
|---|---|
| `packages/agents/src/sector-benchmarks.ts` | Add `fitScoreWeights` to interface; add weights to all 8 sector objects; export `DEFAULT_FIT_WEIGHTS` |
| `packages/agents/src/cim-analyst.ts` | Extract weights from benchmark; inject as `weightBlock` into CIM_FIT_SCORE user message |
| `packages/inference/src/prompt-library.ts` | Update `CIM_FIT_SCORE` prompt to handle dynamic weights + add `weightsUsed` to output JSON |
| `apps/web/src/app/deals/[id]/page.tsx` | (Optional) Display sector weights below radar chart |
