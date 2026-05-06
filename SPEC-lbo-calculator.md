# SPEC: LBO Calculator — Computed IRR/MOIC in IC Memo

**Run order:** PHASE 1 (parallel with SPEC-sector-fit-weights.md)  
**Estimated effort:** 2–3 days  
**DO NOT run this at the same time as SPEC-memo-consistency-pass.md** — both modify `memo-writer.ts`

---

## Problem

The IC memo's LBO Returns Analysis (Section 5) and Financing Structure (Section 6) currently ask Claude Sonnet to *estimate* IRR and MOIC from prose context. The model reasons directionally but does not compute from first principles — no debt amortisation, no cash flow build, no actual IRR function. A real PE associate builds this in Excel. We need to compute it in code and inject the verified numbers as ground truth into the section prompt, so the model writes the narrative around real math.

---

## What to Build

### 1. New file: `packages/agents/src/lbo-calculator.ts`

A pure TypeScript module with no external dependencies. Do not import from any `@axis/*` package. All functions are pure (no DB, no LLM calls, no side effects).

#### Interfaces

```typescript
export interface LBOInputs {
  ltmRevenue: number        // $M
  ltmEbitda: number         // $M
  entryEvEbitda: number     // entry multiple (e.g. 12.5)
  entryEv: number           // enterprise value $M (= ltmEbitda × entryEvEbitda)
  equityPct: number         // equity as % of EV (0–1), e.g. 0.45
  debtPct: number           // debt as % of EV (= 1 - equityPct)
  interestRatePct: number   // annual interest rate on debt (0–1), e.g. 0.07
  holdYears: number         // assumed hold period, default 5
  // Growth scenarios
  scenarios: {
    bear: ScenarioInputs
    base: ScenarioInputs
    bull: ScenarioInputs
  }
}

export interface ScenarioInputs {
  revenueCAGR: number       // annual revenue growth rate (0–1)
  exitEbitdaMargin: number  // EBITDA margin at exit year (0–1)
  exitEvEbitda: number      // exit multiple
}

export interface ScenarioResult {
  name: 'Bear' | 'Base' | 'Bull'
  revenueCAGR: string       // formatted "12.5%"
  exitEbitdaMargin: string  // formatted "22%"
  exitEvEbitda: string      // formatted "11.0x"
  exitEbitda: number        // $M
  exitEv: number            // $M
  grossIRR: string          // formatted "21.4%"
  moic: string              // formatted "2.3x"
  holdYears: number
}

export interface LBOResult {
  // Entry
  entryEv: number
  entryEquity: number
  entryDebt: number
  entryLeverage: string             // "X.Xx Net Debt/EBITDA"
  interestCoverage: string          // "X.Xx (EBITDA/Interest)"
  annualInterestBurden: number      // $M/year
  // Scenarios
  scenarios: {
    bear: ScenarioResult
    base: ScenarioResult
    bull: ScenarioResult
  }
  // Value creation attribution (base case)
  valueCreation: {
    ebitdaGrowthContribution: string   // % of total value created
    multipleExpansionContribution: string
    debtPaydownContribution: string
  }
  // Pass/fail vs PE hurdle
  meetsHurdle: boolean         // base case IRR >= 20%
  hurdleNote: string           // e.g. "Base case 21.4% IRR exceeds 20% hurdle"
  // Pre-formatted block for prompt injection
  formattedBlock: string
}
```

#### Functions to implement

**`computeIRR(cashFlows: number[]): number`**

Solve for the discount rate `r` such that `NPV(r, cashFlows) = 0`. Use Newton-Raphson iteration (max 100 iterations, tolerance 1e-7). `cashFlows[0]` is the initial equity investment (negative). Returns the annual IRR as a decimal (e.g. 0.214 for 21.4%).

```typescript
// Newton-Raphson IRR
function computeIRR(cashFlows: number[]): number {
  let r = 0.15  // initial guess
  for (let i = 0; i < 100; i++) {
    const npv = cashFlows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + r, t), 0)
    const dnpv = cashFlows.reduce((sum, cf, t) => sum - t * cf / Math.pow(1 + r, t + 1), 0)
    if (Math.abs(dnpv) < 1e-12) break
    const rNew = r - npv / dnpv
    if (Math.abs(rNew - r) < 1e-7) return rNew
    r = rNew
  }
  return r
}
```

**`computeScenario(inputs: LBOInputs, scenario: ScenarioInputs, name: 'Bear'|'Base'|'Bull'): ScenarioResult`**

1. Entry equity = `entryEv × equityPct`
2. Entry debt = `entryEv × debtPct`
3. Exit EBITDA = `ltmEbitda × (1 + scenario.revenueCAGR)^holdYears × (scenario.exitEbitdaMargin / (ltmEbitda/ltmRevenue))`
   - More precisely: Exit Revenue = `ltmRevenue × (1 + revenueCAGR)^holdYears`; Exit EBITDA = `exitRevenue × exitEbitdaMargin`
4. Exit EV = `exitEbitda × exitEvEbitda`
5. Assume simple debt paydown: annual FCF = `ltmEbitda × 0.6` (conservative FCF conversion); debt at exit = `max(0, entryDebt - annualFCF × holdYears)`. Cap paydown at entry debt.
6. Exit equity = `exitEv - debtAtExit`
7. MOIC = `exitEquity / entryEquity`
8. Cash flows for IRR: `[-entryEquity, 0, 0, 0, 0, exitEquity]` (negative initial, zero intermediate, positive exit — simple 5-year hold)
9. IRR = `computeIRR(cashFlows)`

**`computeLBO(inputs: LBOInputs): LBOResult`**

1. Compute all three scenarios
2. Compute value creation attribution for base case:
   - EBITDA growth contribution: % of total exit equity gain attributable to EBITDA growth (hold exit EV/EBITDA constant at entry, compute equity — difference is growth contribution)
   - Multiple expansion contribution: % attributable to multiple change
   - Debt paydown contribution: remainder
3. Compute interest coverage: `ltmEbitda / (entryDebt × interestRatePct)`
4. Set `meetsHurdle`: base case IRR >= 0.20
5. Build `formattedBlock` — see format below

**`extractLBOInputs(snapshot: CompanySnapshot, benchmark: SectorBenchmark | null): LBOInputs | null`**

Extracts LBO inputs from the company snapshot. Returns `null` if insufficient data (missing revenue or EBITDA). Import `CompanySnapshot` from `./cim-analyst.js` and `SectorBenchmark` from `./sector-benchmarks.js`.

```typescript
export function extractLBOInputs(
  snapshot: CompanySnapshot,
  benchmark: SectorBenchmark | null
): LBOInputs | null {
  // Parse revenue and EBITDA — return null if either is missing
  const revenue = parseFloat((snapshot.revenue ?? '').replace(/[^0-9.]/g, ''))
  const ebitda = parseFloat((snapshot.ebitda ?? '').replace(/[^0-9.]/g, ''))
  if (!revenue || !ebitda || ebitda <= 0) return null

  // Entry multiple: use proposedEVEBITDA if available, else sector median, else 10x
  const entryMultiple = snapshot.proposedEVEBITDA
    ?? benchmark?.evEbitda.median
    ?? 10

  const entryEv = ebitda * entryMultiple

  // Leverage: use sector ceiling (capped at 60% of EV for safety), else 50%
  const maxLeverage = benchmark?.lboMetrics.leverageCeiling ?? 5.0
  const maxDebt = Math.min(ebitda * maxLeverage, entryEv * 0.60)
  const debtPct = maxDebt / entryEv
  const equityPct = 1 - debtPct

  // Growth scenarios: derive from sector benchmarks or conservative defaults
  const medianGrowth = (benchmark?.revenueGrowth.median ?? 15) / 100
  const medianMargin = (benchmark?.ebitdaMargin.median ?? 20) / 100

  return {
    ltmRevenue: revenue,
    ltmEbitda: ebitda,
    entryEvEbitda: entryMultiple,
    entryEv,
    equityPct,
    debtPct,
    interestRatePct: 0.075,  // 7.5% blended cost of debt (SOFR + spread, 2025)
    holdYears: benchmark?.lboMetrics.typicalHoldYears ?? 5,
    scenarios: {
      bear: {
        revenueCAGR: Math.max(medianGrowth * 0.5, 0.03),          // 50% of median, min 3%
        exitEbitdaMargin: Math.max(medianMargin * 0.9, ebitda / revenue * 0.9),
        exitEvEbitda: Math.max(entryMultiple - 1.5, 7.0),          // slight de-rating
      },
      base: {
        revenueCAGR: medianGrowth,
        exitEbitdaMargin: Math.max(medianMargin, ebitda / revenue),  // maintain or improve
        exitEvEbitda: entryMultiple,                                  // hold multiple flat
      },
      bull: {
        revenueCAGR: medianGrowth * 1.5,
        exitEbitdaMargin: Math.min(medianMargin * 1.15, 0.40),
        exitEvEbitda: Math.min(entryMultiple + 1.5, benchmark?.evEbitda.high ?? entryMultiple + 2),
      },
    },
  }
}
```

**`formatLBOBlock(result: LBOResult): string`**

Returns a pre-formatted markdown string for injection into the section prompt as ground truth:

```
COMPUTED LBO ANALYSIS (verified math — use these numbers verbatim in the section):

Entry:
- Enterprise Value: $[X]M at [X.X]x LTM EBITDA
- Equity check: $[X]M ([X]% of EV)
- Debt: $[X]M ([X]% of EV) at 7.5% blended cost
- Leverage at close: [X.X]x Net Debt/EBITDA
- Interest coverage: [X.X]x (EBITDA/Annual Interest) — [flag if <2.5x: ⚠️ COVENANT RISK]

Returns Scenarios:
| Scenario | Rev CAGR | EBITDA Margin | Exit Multiple | Gross IRR | MOIC |
|----------|----------|--------------|---------------|-----------|------|
| Bear     | X%       | X%           | X.Xx          | XX.X%     | X.Xx |
| Base     | X%       | X%           | X.Xx          | XX.X%     | X.Xx |
| Bull     | X%       | X%           | X.Xx          | XX.X%     | X.Xx |

Value Creation Attribution (Base Case):
- EBITDA Growth: [X]% of total equity value created
- Multiple Expansion/Compression: [X]%
- Debt Paydown: [X]%

Hurdle Check: [Base case XX.X% IRR MEETS / DOES NOT MEET the 20% IRR hurdle]

NOTE: These figures are model-derived from extracted CIM financials. Analyst must verify 
LTM EBITDA, confirm entry multiple against LOI/asking price, and build full debt schedule
before IC submission. Mark any assumptions that differ from disclosed terms.
```

---

### 2. Modify `packages/agents/src/memo-writer.ts`

**Add import at top:**
```typescript
import { extractLBOInputs, computeLBO, formatLBOBlock } from './lbo-calculator.js'
```

**In the `generate()` method, after the `ragContext` and `styleContext` are retrieved but before the section loop, add:**

```typescript
// Compute LBO if we have enough financial data from the latest CIM analysis
let lboBlock = ''
try {
  const latestCim = await this.prisma.agentMemory.findFirst({
    where: {
      userId,
      memoryType: 'SEMANTIC',
      content: { contains: dealId },
      NOT: { content: { contains: '"type":"ic_memo"' } },
    },
    orderBy: { createdAt: 'desc' },
    select: { content: true },
  })
  if (latestCim) {
    const parsed = JSON.parse(latestCim.content) as Record<string, unknown>
    const snapshot = parsed['companySnapshot'] as CompanySnapshot | undefined
    if (snapshot && parsed['dealId'] === dealId) {
      // Resolve sector benchmark for this company
      const { findSectorBenchmark } = await import('./sector-benchmarks.js')
      const sectorHint = snapshot.primaryMarket ?? snapshot.businessModel ?? ''
      const benchmark = findSectorBenchmark(sectorHint, snapshot.name)
      const inputs = extractLBOInputs(snapshot, benchmark)
      if (inputs) {
        const result = computeLBO(inputs)
        lboBlock = result.formattedBlock
      }
    }
  }
} catch {
  // Never block memo generation over LBO computation failure
}
```

**In the section loop, for sections `lbo_analysis` and `financing_structure`, inject the computed block:**

Replace the section's `userMessage` construction to include the LBO block when available:

```typescript
// Inject computed LBO data for financial sections
const lboInjection = (section.id === 'lbo_analysis' || section.id === 'financing_structure') && lboBlock
  ? `\nCOMPUTED FINANCIAL DATA — USE THESE NUMBERS VERBATIM (do not estimate or round):\n${lboBlock}\n`
  : ''

const userMessage = `SECTION: ${section.title}

INSTRUCTIONS: ${section.instructions}
${lboInjection}${styleContext ? `\nSTYLE GUIDE (match this writing style):\n${styleContext}\n` : ''}
...rest of existing userMessage construction...`
```

Also add `CompanySnapshot` to the import from `./cim-analyst.js` if not already imported.

---

### 3. Add prompt to `packages/inference/src/prompt-library.ts`

Add a new TASK-tier prompt for cases where the memo is generated without a prior CIM analysis (edge case — user generates memo directly without running CIM analysis first):

```typescript
const LBO_DATA_UNAVAILABLE: PromptEntry = {
  key: 'LBO_DATA_UNAVAILABLE',
  tier: 'TASK',
  prompt: `When writing LBO or financing sections without computed financial data, use this fallback:
State clearly: "Computed returns analysis unavailable — LTM financials required."
Then describe the framework that WOULD be applied once financials are confirmed:
entry assumptions, leverage sizing, IRR/MOIC target ranges from sector benchmarks, and
the three scenarios (bear/base/bull) structure. Do not fabricate specific IRR or MOIC figures.`,
}
```

Add it to the `PROMPT_REGISTRY` object (the `Record<string, PromptEntry>` constant near the bottom of the file):
```typescript
LBO_DATA_UNAVAILABLE,
```

---

### 4. Export from `packages/agents/src/index.ts`

```typescript
export { computeLBO, extractLBOInputs, formatLBOBlock } from './lbo-calculator.js'
export type { LBOInputs, LBOResult, ScenarioResult } from './lbo-calculator.js'
```

---

## Acceptance Criteria

- [ ] `computeIRR([−100, 0, 0, 0, 0, 230])` returns approximately `0.1814` (18.1% IRR) — verify with a known IRR calculator
- [ ] `computeIRR([−100, 130])` returns approximately `0.30` (30% IRR for a 1-year deal) — sanity check
- [ ] `extractLBOInputs` returns `null` when `snapshot.revenue` or `snapshot.ebitda` is null/empty
- [ ] `computeLBO` with a typical SaaS deal (Revenue $42M, EBITDA $8M, 12x entry) produces:
  - Entry EV ≈ $96M
  - Equity at ~50% ≈ $48M
  - Debt ≈ $48M
  - Interest coverage ≈ 2.2x at 7.5% interest (flag as near covenant risk)
  - Bear case IRR < 15%, Base case IRR ~18–22%, Bull case IRR > 25%
  - MOIC: bear ~1.6x, base ~2.1–2.5x, bull ~3.0x+
- [ ] IC memo Section 5 (LBO Returns Analysis) includes the computed table when a prior CIM analysis exists for the deal — verify by running memo generation on a seeded deal and checking that the IRR/MOIC figures appear in the output
- [ ] IC memo Section 5 contains `[DATA NEEDED — LTM financials required]` (not fabricated numbers) when no CIM analysis exists for the deal
- [ ] IC memo Section 6 (Financing Structure) references the same debt/equity figures as Section 5 — no contradictions
- [ ] `computeLBO` does not throw for any valid `LBOInputs` — wrap in try/catch in `memo-writer.ts`
- [ ] TypeScript compiles with `pnpm typecheck` — no new type errors
- [ ] `pnpm build` succeeds across all packages

---

## File Change Summary

| File | Change |
|---|---|
| `packages/agents/src/lbo-calculator.ts` | **CREATE** — IRR/MOIC computation engine |
| `packages/agents/src/memo-writer.ts` | Import lbo-calculator; compute LBO before section loop; inject block into lbo_analysis + financing_structure sections |
| `packages/agents/src/index.ts` | Export lbo-calculator types and functions |
| `packages/inference/src/prompt-library.ts` | Add `LBO_DATA_UNAVAILABLE` prompt |
