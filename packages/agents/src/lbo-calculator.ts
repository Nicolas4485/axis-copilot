// LBO Calculator — pure TypeScript financial computation engine
// No external dependencies, no database or LLM calls.
// All functions are pure: same inputs always produce same outputs.

import type { CompanySnapshot } from './cim-analyst.js'
import type { SectorBenchmark } from './sector-benchmarks.js'

// ─── Interfaces ──────────────────────────────────────────────────

export interface LBOInputs {
  ltmRevenue: number        // $M
  ltmEbitda: number         // $M
  entryEvEbitda: number     // entry multiple (e.g. 12.5)
  entryEv: number           // enterprise value $M (= ltmEbitda × entryEvEbitda)
  equityPct: number         // equity as % of EV (0–1), e.g. 0.45
  debtPct: number           // debt as % of EV (= 1 - equityPct)
  interestRatePct: number   // annual interest rate on debt (0–1), e.g. 0.07
  holdYears: number         // assumed hold period, default 5
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
  entryEv: number
  entryEquity: number
  entryDebt: number
  entryLeverage: string             // "X.Xx Net Debt/EBITDA"
  interestCoverage: string          // "X.Xx (EBITDA/Interest)"
  annualInterestBurden: number      // $M/year
  scenarios: {
    bear: ScenarioResult
    base: ScenarioResult
    bull: ScenarioResult
  }
  valueCreation: {
    ebitdaGrowthContribution: string   // % of total value created
    multipleExpansionContribution: string
    debtPaydownContribution: string
  }
  meetsHurdle: boolean
  hurdleNote: string
  formattedBlock: string
}

// ─── Formatting helpers ───────────────────────────────────────────

function fmtPct(v: number, decimals = 1): string {
  return `${(v * 100).toFixed(decimals)}%`
}

function fmtMultiple(v: number, decimals = 1): string {
  return `${v.toFixed(decimals)}x`
}

// ─── Core math ────────────────────────────────────────────────────

// Newton-Raphson IRR solver — tolerance 1e-7, max 100 iterations
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

function computeScenario(
  inputs: LBOInputs,
  scenario: ScenarioInputs,
  name: 'Bear' | 'Base' | 'Bull',
): ScenarioResult {
  const entryEquity = inputs.entryEv * inputs.equityPct
  const entryDebt   = inputs.entryEv * inputs.debtPct
  const annualFCF   = inputs.ltmEbitda * 0.6

  const exitRevenue = inputs.ltmRevenue * Math.pow(1 + scenario.revenueCAGR, inputs.holdYears)
  const exitEbitda  = exitRevenue * scenario.exitEbitdaMargin
  const exitEv      = exitEbitda * scenario.exitEvEbitda
  const debtAtExit  = Math.max(0, entryDebt - annualFCF * inputs.holdYears)
  const exitEquity  = exitEv - debtAtExit
  const moicValue   = exitEquity / entryEquity

  // Build cash flow array for IRR: initial outflow, zero intermediates, terminal inflow
  const cfArray = new Array<number>(inputs.holdYears + 1).fill(0)
  cfArray[0] = -entryEquity
  cfArray[inputs.holdYears] = exitEquity

  const irr = computeIRR(cfArray)

  return {
    name,
    revenueCAGR:      fmtPct(scenario.revenueCAGR),
    exitEbitdaMargin: fmtPct(scenario.exitEbitdaMargin, 0),
    exitEvEbitda:     fmtMultiple(scenario.exitEvEbitda),
    exitEbitda,
    exitEv,
    grossIRR: fmtPct(irr),
    moic:     fmtMultiple(moicValue),
    holdYears: inputs.holdYears,
  }
}

// ─── Public API ───────────────────────────────────────────────────

export function computeLBO(inputs: LBOInputs): LBOResult {
  const entryEquity = inputs.entryEv * inputs.equityPct
  const entryDebt   = inputs.entryEv * inputs.debtPct
  const annualInterestBurden = entryDebt * inputs.interestRatePct
  const annualFCF   = inputs.ltmEbitda * 0.6
  const debtAtExit  = Math.max(0, entryDebt - annualFCF * inputs.holdYears)

  // Compute all three scenarios
  const bear = computeScenario(inputs, inputs.scenarios.bear, 'Bear')
  const base = computeScenario(inputs, inputs.scenarios.base, 'Base')
  const bull = computeScenario(inputs, inputs.scenarios.bull, 'Bull')

  // ── Value creation attribution (base case) ──
  // Decompose equity gain into: EBITDA growth, multiple expansion, debt paydown
  const baseExitEquity  = base.exitEv - debtAtExit
  const totalEquityGain = baseExitEquity - entryEquity

  // Hold exit multiple flat at entry to isolate growth contribution to EV
  const hypotheticalEv   = base.exitEbitda * inputs.entryEvEbitda
  const growthContrib    = hypotheticalEv - inputs.entryEv
  const multipleContrib  = base.exitEv - hypotheticalEv
  const debtPayContrib   = entryDebt - debtAtExit
  const totalContrib     = growthContrib + multipleContrib + debtPayContrib  // === totalEquityGain

  let ebitdaGrowthContribution      = 'N/A'
  let multipleExpansionContribution  = 'N/A'
  let debtPaydownContribution        = 'N/A'

  if (totalContrib > 0) {
    const gPct = Math.round((growthContrib   / totalContrib) * 100)
    const mPct = Math.round((multipleContrib / totalContrib) * 100)
    const dPct = 100 - gPct - mPct  // ensures sum = 100
    ebitdaGrowthContribution     = `${gPct}%`
    multipleExpansionContribution = `${mPct}%`
    debtPaydownContribution       = `${dPct}%`
  }

  // ── Coverage & leverage ──
  const coverageNum    = annualInterestBurden > 0 ? inputs.ltmEbitda / annualInterestBurden : 999
  const covenantFlag   = coverageNum < 2.5 ? ' — ⚠️ COVENANT RISK' : ''
  const interestCoverage = `${coverageNum.toFixed(1)}x (EBITDA/Annual Interest)${covenantFlag}`
  const entryLeverage    = `${(entryDebt / inputs.ltmEbitda).toFixed(1)}x Net Debt/EBITDA`

  // ── Hurdle check ──
  const baseIrrNum   = parseFloat(base.grossIRR) / 100
  const meetsHurdle  = baseIrrNum >= 0.20
  const hurdleNote   = meetsHurdle
    ? `Base case ${base.grossIRR} IRR exceeds 20% hurdle`
    : `Base case ${base.grossIRR} IRR DOES NOT MEET the 20% hurdle`

  // ── Formatted block ──
  const equityPctStr = `${Math.round(inputs.equityPct * 100)}%`
  const debtPctStr   = `${Math.round(inputs.debtPct * 100)}%`
  const interestRateStr = `${(inputs.interestRatePct * 100).toFixed(1)}%`

  const scenarioRows = [bear, base, bull].map((s) =>
    `| ${s.name.padEnd(8)} | ${s.revenueCAGR.padEnd(8)} | ${s.exitEbitdaMargin.padEnd(13)} | ${s.exitEvEbitda.padEnd(13)} | ${s.grossIRR.padEnd(9)} | ${s.moic} |`
  ).join('\n')

  const formattedBlock = `COMPUTED LBO ANALYSIS (verified math — use these numbers verbatim in the section):

Entry:
- Enterprise Value: $${inputs.entryEv.toFixed(0)}M at ${fmtMultiple(inputs.entryEvEbitda)} LTM EBITDA
- Equity check: $${entryEquity.toFixed(0)}M (${equityPctStr} of EV)
- Debt: $${entryDebt.toFixed(0)}M (${debtPctStr} of EV) at ${interestRateStr} blended cost
- Leverage at close: ${entryLeverage}
- Interest coverage: ${interestCoverage}

Returns Scenarios:
| Scenario | Rev CAGR | EBITDA Margin | Exit Multiple | Gross IRR | MOIC |
|----------|----------|--------------|---------------|-----------|------|
${scenarioRows}

Value Creation Attribution (Base Case):
- EBITDA Growth: ${ebitdaGrowthContribution} of total equity value created
- Multiple Expansion/Compression: ${multipleExpansionContribution}
- Debt Paydown: ${debtPaydownContribution}

Hurdle Check: ${hurdleNote}

NOTE: These figures are model-derived from extracted CIM financials. Analyst must verify \
LTM EBITDA, confirm entry multiple against LOI/asking price, and build full debt schedule \
before IC submission. Mark any assumptions that differ from disclosed terms.`

  return {
    entryEv: inputs.entryEv,
    entryEquity,
    entryDebt,
    entryLeverage,
    interestCoverage,
    annualInterestBurden,
    scenarios: { bear, base, bull },
    valueCreation: {
      ebitdaGrowthContribution,
      multipleExpansionContribution,
      debtPaydownContribution,
    },
    meetsHurdle,
    hurdleNote,
    formattedBlock,
  }
}

export function extractLBOInputs(
  snapshot: CompanySnapshot,
  benchmark: SectorBenchmark | null,
): LBOInputs | null {
  const revenue = parseFloat((snapshot.revenue ?? '').replace(/[^0-9.]/g, ''))
  const ebitda  = parseFloat((snapshot.ebitda  ?? '').replace(/[^0-9.]/g, ''))
  if (!revenue || !ebitda || ebitda <= 0) return null

  const entryMultiple = snapshot.proposedEVEBITDA
    ?? benchmark?.evEbitda.median
    ?? 10

  const entryEv = ebitda * entryMultiple

  const maxLeverage = benchmark?.lboMetrics.leverageCeiling ?? 5.0
  const maxDebt     = Math.min(ebitda * maxLeverage, entryEv * 0.60)
  const debtPct     = maxDebt / entryEv
  const equityPct   = 1 - debtPct

  const medianGrowth = (benchmark?.revenueGrowth.median ?? 15) / 100
  const medianMargin = (benchmark?.ebitdaMargin.median ?? 20) / 100

  return {
    ltmRevenue:      revenue,
    ltmEbitda:       ebitda,
    entryEvEbitda:   entryMultiple,
    entryEv,
    equityPct,
    debtPct,
    interestRatePct: 0.075,  // 7.5% blended cost of debt (SOFR + spread, 2025)
    holdYears:       benchmark?.lboMetrics.typicalHoldYears ?? 5,
    scenarios: {
      bear: {
        revenueCAGR:      Math.max(medianGrowth * 0.5, 0.03),
        exitEbitdaMargin: Math.max(medianMargin * 0.9, (ebitda / revenue) * 0.9),
        exitEvEbitda:     Math.max(entryMultiple - 1.5, 7.0),
      },
      base: {
        revenueCAGR:      medianGrowth,
        exitEbitdaMargin: Math.max(medianMargin, ebitda / revenue),
        exitEvEbitda:     entryMultiple,
      },
      bull: {
        revenueCAGR:      medianGrowth * 1.5,
        exitEbitdaMargin: Math.min(medianMargin * 1.15, 0.40),
        exitEvEbitda:     Math.min(entryMultiple + 1.5, benchmark?.evEbitda.high ?? entryMultiple + 2),
      },
    },
  }
}

// Pass-through so callers can use the named export the spec requires.
// The formatted block is built eagerly inside computeLBO.
export function formatLBOBlock(result: LBOResult): string {
  return result.formattedBlock
}
