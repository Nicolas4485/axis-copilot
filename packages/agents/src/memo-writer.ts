// MemoWriter — standalone IC memo generation orchestrator
// Generates a 9-section PE-standard IC memo from deal context via Claude Sonnet
// Called by POST /api/deals/:id/generate-memo (SSE)

import type { PrismaClient } from '@prisma/client'
import { InferenceEngine } from '@axis/inference'
import { RAGEngine } from '@axis/rag'
import type { CompanySnapshot } from './cim-analyst.js'
import { extractLBOInputs, computeLBO, formatLBOBlock } from './lbo-calculator.js'
import { runCommercialAnalysis, formatCommercialBlock } from './specialists/commercial-specialist.js'
import type { CommercialAnalysis } from './specialists/commercial-specialist.js'
import { runRiskAnalysis, formatRiskBlock } from './specialists/risk-specialist.js'
import type { RiskAnalysis } from './specialists/risk-specialist.js'

// ─── Public types ──────────────────────────────────────────────

export interface MemoSection {
  id: string
  title: string
  content: string
  generatedAt: string
}

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

export interface MemoResult {
  dealId: string
  companyName: string
  version: number
  sections: MemoSection[]
  generatedAt: string
  durationMs: number
  consistency?: ConsistencyResult
}

export interface MemoProgressEvent {
  type: 'section_start' | 'section_done' | 'error'
  sectionId?: string
  sectionTitle?: string
  progress: number
  message: string
}

// ─── Section definitions ──────────────────────────────────────
// 13-section Blackstone-grade IC memo format
// Mirrors the structure used by top-tier PE IC memos:
// tight executive summary → financials → LBO returns → financing → thesis →
// risks → exit analysis → mgmt → value creation plan → DD → recommendation

interface SectionDef {
  id: string
  title: string
  instructions: string
  ragQuery: string
}

const MEMO_SECTIONS: SectionDef[] = [
  {
    id: 'executive_summary',
    title: 'Executive Summary',
    instructions: `Write a tight 4–6 sentence executive summary that opens with the investment decision.
REQUIRED format: Open with "We recommend [PASS / PROCEED / STRONG PROCEED] on [Company] ([Sector]) at [X]x LTM EBITDA / [Y]x LTM Revenue, implying an enterprise value of approximately $[Z]M."
Then in the next 2–3 sentences cover: (1) the core investment thesis in one sentence, (2) the expected return profile (target IRR range and MOIC if calculable from available data, or note [RETURN ANALYSIS BELOW]), (3) the single most important risk.
End with the analyst's confidence level and any critical pre-LOI diligence required.
This is the first thing the IC reads — every word must earn its place. No filler, no hedging.`,
    ragQuery: 'company overview revenue EBITDA enterprise value deal size recommendation IRR MOIC',
  },
  {
    id: 'company_overview',
    title: 'Company Overview',
    instructions: `Provide a structured company snapshot followed by a narrative description.
REQUIRED elements:
- Opening paragraph: what the company does, its business model, and why it exists (the customer pain it solves)
- Key facts table: Founded | HQ | Employees | Ownership | Fiscal Year End | Website (if disclosed)
- Products/Services: describe each line with approximate revenue contribution (%) and gross margin profile if available
- Customer profile: number of customers, avg. contract size, top customers (with % of revenue if disclosed), customer concentration assessment
- Revenue quality: % recurring vs. transactional, contract lengths, renewal rates/NRR if SaaS
- Distribution/Go-to-market: direct sales, channel partners, geographic footprint
Flag [DATA NEEDED] for any material item not found in the source documents.`,
    ragQuery: 'company description business model products customers founded employees revenue breakdown geographic',
  },
  {
    id: 'market_analysis',
    title: 'Market Analysis',
    instructions: `Provide a rigorous market assessment with three components:
1. MARKET SIZE & GROWTH: State TAM, SAM, and SOM with source and year. Quote growth rate (CAGR) with period. Note any cyclicality or secular tailwinds/headwinds.
2. COMPETITIVE LANDSCAPE: Name direct competitors with estimated market share. Assess competitive intensity (pricing pressure, switching costs, barriers to entry). Place the company on a moat spectrum: Commodity → Differentiated → Niche Leader → Near-Monopoly.
3. MARKET POSITIONING: Where does this company sit vs. competitors on price/quality/feature dimensions? What is its share of wallet opportunity? Is the market growing fast enough to support growth without share gains?
Use sector benchmark context where available. Name the 3–5 most relevant public comps.
Flag if market data in the CIM appears self-serving or unsourced.`,
    ragQuery: 'market size growth competitive landscape industry TAM SAM competitors market share positioning',
  },
  {
    id: 'financial_analysis',
    title: 'Financial Analysis',
    instructions: `Present a comprehensive financial assessment with the following structure:

**Historical Performance Table** (format as Markdown table):
| Metric | FY[Year-2] | FY[Year-1] | FY[Year] | Comments |
|--------|-----------|-----------|---------|----------|
| Revenue ($M) | | | | |
| YoY Growth | | | | |
| Gross Profit ($M) | | | | |
| Gross Margin % | | | | |
| EBITDA ($M) | | | | |
| EBITDA Margin % | | | | |
| CapEx ($M) | | | | |
| FCF ($M) | | | | |
| FCF Conversion | | | | (FCF/EBITDA) |

**Key Financial Observations** (write as bullet points):
- Revenue quality: recurring vs. one-time, seasonality patterns, customer concentration impact
- Margin analysis: gross margin trajectory, EBITDA margin vs. sector median, add-back analysis (list each add-back, amount, and whether it is recurring)
- Cash generation: FCF conversion rate, working capital dynamics, CapEx requirements
- Audit status: explicitly state whether financials are audited/reviewed/management-prepared
- Balance sheet: any debt, pension liabilities, off-balance-sheet items disclosed

**Normalized EBITDA**: Calculate adjusted EBITDA if add-backs are disclosed. If add-backs exceed 15% of reported EBITDA, flag as a diligence concern.

Flag all anomalies. Do not round figures — precision signals credibility.`,
    ragQuery: 'revenue EBITDA margin growth FCF capex financial statements audited add-backs working capital balance sheet',
  },
  {
    id: 'lbo_analysis',
    title: 'LBO Returns Analysis',
    instructions: `Construct a simplified LBO returns framework using available data. This is a critical section — every PE IC memo requires a returns analysis.

**Entry Assumptions**:
- LTM Revenue and LTM EBITDA (from financial analysis)
- Entry EV/EBITDA multiple (proposed or implied from ask price)
- Entry EV/Revenue multiple
- Implied Enterprise Value ($M)
- Equity contribution (assume 40–50% equity / 50–60% debt for leverage estimate if not disclosed)

**Operating Model** (3 scenarios):
| Scenario | Revenue CAGR | EBITDA Margin | Exit Year | Exit EV/EBITDA | Gross IRR | MOIC |
|----------|-------------|--------------|-----------|----------------|-----------|------|
| Bear Case | [X%] | [Y%] | Year 5 | [X]x | [XX%] | [X.X]x |
| Base Case | [X%] | [Y%] | Year 5 | [X]x | [XX%] | [X.X]x |
| Bull Case | [X%] | [Y%] | Year 5 | [X]x | [XX%] | [X.X]x |

Note: If insufficient financial data is available to construct this analysis, write [DATA NEEDED — request LTM financials and management projections] and describe what assumptions you would use once obtained.

**Return Drivers**: Identify which of the following drives the majority of value: (a) EBITDA growth, (b) multiple expansion, (c) leverage paydown, (d) M&A / bolt-on. Quantify the contribution of each if possible.

**Minimum Return Threshold**: Note whether base case exceeds the firm's target return hurdle (typically 20–25% IRR / 2.5–3.0x MOIC for a 5-year hold at a top-tier PE firm). State clearly if it does not.`,
    ragQuery: 'enterprise value EBITDA multiple revenue projection leverage IRR return equity debt financing',
  },
  {
    id: 'financing_structure',
    title: 'Financing Structure',
    instructions: `Analyze the proposed or estimated capital structure for this transaction.

**Debt Capacity Analysis**:
- LTM EBITDA (use normalized figure from financial analysis)
- Maximum leverage: estimate based on sector norms (typically 4.0–6.0x for quality businesses; cite sector benchmark)
- Maximum debt capacity: calculate Debt = [X]x EBITDA
- Minimum equity check: EV minus max debt
- Estimated total debt/equity split

**Proposed Capital Structure** (table):
| Tranche | Amount ($M) | % of Cap | Rate/Spread | Maturity | Notes |
|---------|-------------|----------|-------------|---------|-------|
| Senior Secured TLB | | | | | |
| Revolving Credit Facility | | | | | |
| Senior Notes / Mezz (if needed) | | | | | |
| Equity | | | | | |
| **Total** | | | | | |

**Coverage Metrics**:
- Leverage at close: [X]x Net Debt / EBITDA
- Interest Coverage (EBITDA / Interest): [X]x (flag if <2.5x as covenant risk)
- DSCR: [X]x
- Expected leverage at exit (Year 5): [X]x

**Structuring Notes**: Note any special considerations (carve-out, earn-out, rollover equity, management co-invest, preferred return hurdles).

If financial data is insufficient to size debt, state assumptions and flag for CFO Q&A.`,
    ragQuery: 'debt leverage financing capital structure equity senior secured covenant',
  },
  {
    id: 'investment_thesis',
    title: 'Investment Thesis',
    instructions: `State 4–6 specific, evidence-anchored investment pillars. Each must follow this format:

**[Pillar Title]**
Evidence: [specific data point or observation from the CIM — quote numbers, not generalities]
So What: [why this creates value for a PE buyer and how it translates to returns]

Required pillars to address (adapt based on what the data supports):
1. COMPETITIVE MOAT: What prevents a competitor from replicating this business in 3 years? Be specific.
2. GROWTH RUNWAY: Quantify the organic growth opportunity. Is the company penetrating <20% of its ICP? Identify the top 2 growth levers.
3. OPERATIONAL LEVERAGE: Where does margin expand as revenue scales? Name specific cost lines.
4. PLATFORM/ROLL-UP POTENTIAL: Is there an M&A pipeline? Name adjacencies. Quantify the potential EBITDA accretion from 2–3 bolt-ons.
5. MANAGEMENT QUALITY: One specific data point that demonstrates management has delivered before (revenue milestones, successful prior exits, retention of key customers).
6. DEFENSIBILITY IN DOWNSIDE: How does the business perform in a 20% revenue decline scenario? Does it remain FCF positive?

Do NOT write generic thesis bullets. Every claim must cite evidence from the CIM or sector benchmark data.`,
    ragQuery: 'competitive advantage growth opportunities value creation moat recurring revenue management track record bolt-on',
  },
  {
    id: 'key_risks',
    title: 'Key Risks & Mitigants',
    instructions: `Produce a rigorous, unvarnished risk register. Format as a table followed by detailed narratives on the top 3 HIGH-severity risks.

**Risk Register Table**:
| # | Risk | Severity | Category | Mitigant | Residual Risk |
|---|------|----------|----------|----------|---------------|
| 1 | | HIGH | [Operational/Financial/Market/Regulatory/Execution] | | |
| 2 | | HIGH | | | |
| ... | | | | | |

MANDATORY risk categories to assess:
- Customer concentration (>20% in any single customer = automatically HIGH)
- Key-person / founder dependency (name the individual and what breaks if they leave)
- Leverage risk (interest coverage, covenant headroom at revenue -15% scenario)
- Competitive disruption (name the most credible disruptor)
- Reimbursement / regulatory risk (if applicable to sector)
- Multiple compression risk (entry at premium multiple with limited re-rating catalyst)
- Macroeconomic sensitivity (recession scenario impact on revenue)

Then write a 3–5 sentence narrative on each HIGH-severity risk that explains: what the risk is, why it matters in this specific deal, and whether the proposed mitigation is adequate.

Do NOT soften risks. IC partners need unvarnished assessments. If a risk has no credible mitigation, say so.`,
    ragQuery: 'risks customer concentration founder dependency leverage covenant regulatory competition recession',
  },
  {
    id: 'exit_analysis',
    title: 'Exit Analysis',
    instructions: `Analyze the exit opportunity — this is a core component of every PE investment decision.

**Buyer Universe**:
- Strategic buyers: Name 4–6 logical strategic acquirers (with rationale for each). Would they pay a strategic premium?
- Financial sponsors: Would this be an attractive secondary buyout target in 5 years? At what size/margin profile?
- Public markets (IPO): Is the business of sufficient scale and quality for a public market exit? What comparable public comps trade at?

**Exit Multiple Scenarios**:
| Exit Scenario | Exit EV/EBITDA | Exit EV ($M) | Gross IRR | MOIC | Notes |
|--------------|----------------|-------------|-----------|------|-------|
| Downside (strategic premium absent) | [X]x | | | | |
| Base (in-line with entry multiple) | [X]x | | | | |
| Upside (re-rating on growth + margin) | [X]x | | | | |
| Strategic M&A premium | [X]x | | | | |

**Precedent Transactions**: List 3–5 comparable transactions in the sector with deal size, EV/EBITDA, and acquirer. Use sector benchmark data or public knowledge.

**Liquidity Risk**: Assess whether exits are likely to be constrained. Note any contractual restrictions (founder lockup, management rollover cliffs, earn-out tails).

**Exit Timeline**: What is the earliest credible exit? What operational milestones must be achieved before an exit process can launch?`,
    ragQuery: 'exit valuation strategic acquirer IPO comparable transactions buyer universe M&A',
  },
  {
    id: 'management_assessment',
    title: 'Management Assessment',
    instructions: `Provide a structured management team assessment with individual profiles and a team-level verdict.

**Executive Profiles** (for each key executive):
- Name, Title, Tenure at company
- Prior experience (previous employers, roles, exits)
- Key achievements at this company (quantified where possible)
- Risk flags (gaps in experience, short tenure, prior failures)

**Team Assessment Scorecard**:
- Team Depth: Does the company have a functioning second-layer of management, or does everything run through the CEO?
- Founder Dependency: If the founder/CEO left tomorrow, what specifically breaks? (sales relationships, product vision, key customer contacts)
- Track Record: Has this team delivered on prior targets? Any evidence of consistent execution vs. overpromising?
- Succession Risk: Is there a credible #2 who could step up? Any planned retirements within the investment period?
- Incentive Alignment: Is management rolling equity? What is their current ownership stake? Are incentive structures aligned with PE value creation?

**Overall Verdict**: EXCEPTIONAL / STRONG / ADEQUATE / WEAK — with one-paragraph justification.

**Recommended Actions**: What management changes or additions should be made in the first 100 days?`,
    ragQuery: 'management team CEO founder executive tenure succession key-man equity incentive track record',
  },
  {
    id: 'value_creation_plan',
    title: 'Value Creation Plan (100-Day Framework)',
    instructions: `Outline a concrete value creation plan for the first 100 days post-close and through the hold period.

**EBITDA Bridge — Entry to Exit**:
Show how EBITDA grows from entry to the target exit year. Format as:
Entry LTM EBITDA: $[X]M
+ Organic revenue growth contribution: $[X]M
+ Margin improvement (cost reduction, pricing): $[X]M
+ M&A bolt-on contributions: $[X]M
= Exit Year EBITDA: $[X]M
(Use ranges where exact figures unavailable; anchor to realistic assumptions)

**100-Day Priority Actions** (organize by workstream):
1. COMMERCIAL: (e.g., pricing review, new logo acceleration, geographic expansion initiation, digital marketing investment)
2. OPERATIONAL: (e.g., procurement renegotiation, overhead rationalization, technology infrastructure upgrade, ERP consolidation)
3. TALENT: (e.g., CFO upgrade, VP Sales hire, management incentive plan restructuring)
4. FINANCIAL: (e.g., banking relationships, working capital optimization, covenant compliance framework, KPI dashboard)
5. STRATEGIC: (e.g., M&A pipeline activation, partnership agreements, customer contract renegotiation)

**2–3 Year Value Creation Initiatives**: Beyond day 100, what are the 3 highest-impact initiatives that will drive the exit multiple? Be specific — name the initiative, expected EBITDA impact, and required investment.

Note: Flag any value creation levers that require management buy-in as a negotiating point in the LOI process.`,
    ragQuery: 'growth initiatives operational improvement pricing revenue expansion cost reduction management value creation',
  },
  {
    id: 'dd_findings',
    title: 'Due Diligence Findings & Open Items',
    instructions: `Summarize what has been diligenced to date and what remains open. This section should read like an honest audit of the CIM review.

**Completed Diligence**:
- Document analysis: list all source documents reviewed with quality assessment (complete / partial / insufficient)
- Data conflicts identified: list any inconsistencies found between CIM sections or vs. prior disclosures
- AI analysis: summarize findings from automated extraction (financial tables, entity recognition, conflict detection)

**Open Items** (format as a tracker):
| Priority | Open Item | Owner | Deadline | Notes |
|----------|-----------|-------|----------|-------|
| HIGH | Quality of Earnings (QoE) required | Accounting firm | Pre-LOI | |
| HIGH | Customer reference calls | Deal team | Pre-LOI | |
| MEDIUM | IT infrastructure assessment | Technology DD firm | Pre-SPA | |
| MEDIUM | Legal — material contracts review | Outside counsel | Pre-SPA | |
| LOW | ... | | | |

**Data Gaps**: List any material information that was absent from the CIM that a buyer would need before proceeding. Flag the top 3 as pre-LOI requirements.

**Recommended Third-Party Diligence**: Name the specific workstreams (QoE, legal, tech, commercial, ESG) and their sequencing.`,
    ragQuery: 'conflicts inconsistencies data gaps due diligence findings discrepancies missing information',
  },
  {
    id: 'recommendation',
    title: 'Recommendation',
    instructions: `Deliver a clear, committed recommendation. This is the section IC partners read last but weight most heavily.

**Recommendation**: PASS | PROCEED TO NEXT ROUND | STRONG PROCEED

**Decision Rationale** (3–4 sentences maximum): Why this specific recommendation, anchored to the 3 most important factors from the analysis above. Name the factors — do not be abstract.

**Proposed Terms**:
- Entry EV/EBITDA range: [X]x – [Y]x
- Implied EV range: $[X]M – $[Y]M
- Target equity check: $[X]M – $[Y]M
- Expected gross IRR: [X]% – [Y]% (base case)
- Expected MOIC: [X.X]x – [Y.Y]x (base case)

**Conditions Precedent to LOI** (list exactly 3–5):
1. [Most critical diligence item — must be resolved before LOI]
2. [Second most critical]
3. [Third most critical]

**Next Steps**:
- Immediate: [action, owner, timeline]
- Before LOI: [action, owner, timeline]
- Before signing: [action, owner, timeline]

Do not equivocate. A recommendation that could apply to any deal is worthless. Be specific, direct, and stand behind the analysis.`,
    ragQuery: 'recommendation valuation multiple entry price IRR MOIC conditions precedent next steps LOI',
  },
]

// ─── Per-section knowledge graph relationship types ───────────
// Each section queries the graph for entity relationships that are
// directly relevant to the facts it must produce. The formatted
// provenance block is injected into the section prompt so the model
// can cite which facts came from the knowledge graph vs. documents.
//
// Empty array  → query all relationship types for the company entity
// Omitted key  → no graph query for this section (purely financial)

const SECTION_GRAPH_QUERIES: Record<string, string[]> = {
  company_overview:      [],                                    // full entity context
  market_analysis:       ['COMPETES_WITH', 'USES_TECHNOLOGY'],  // competitive positioning
  investment_thesis:     ['COMPETES_WITH', 'USES_TECHNOLOGY', 'DEPENDS_ON', 'INFLUENCES'],
  exit_analysis:         ['COMPETES_WITH'],                     // strategic acquirer candidates
  management_assessment: ['WORKS_AT', 'REPORTS_TO'],           // org relationships
  key_risks:             ['COMPETES_WITH', 'DEPENDS_ON'],       // competitive + dependency risks
}

// ─── MemoWriter ────────────────────────────────────────────────

export class MemoWriter {
  constructor(
    private engine: InferenceEngine,
    private prisma: PrismaClient,
    private rag: RAGEngine
  ) {}

  async generate(
    dealId: string,
    userId: string,
    clientId: string | null,
    onProgress: (event: MemoProgressEvent) => void,
    sectionId?: string   // if set, regenerate only this section from the latest memo
  ): Promise<MemoResult> {
    const startTime = Date.now()

    // Load deal for company name
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      select: { name: true, notes: true },
    })
    const companyName = deal?.name ?? 'Unknown Company'

    // Determine which sections to generate
    const sectionsToGenerate = sectionId
      ? MEMO_SECTIONS.filter((s) => s.id === sectionId)
      : MEMO_SECTIONS

    // Gather deal context via RAG — single broad query covers all sections
    const ragContext = await this.rag.query(
      `Investment Committee memo for ${companyName}: revenue EBITDA management team risks market competitors financials`,
      userId,
      clientId
    ).catch(() => ({ context: '', citations: [], conflicts: [], graphInsights: [], tokensUsed: 0, metadata: { vectorChunksFound: 0, graphEntitiesFound: 0, compressionLevel: 'none' as const, latencyMs: 0 } }))

    // Retrieve personal writing style examples from "My Style" client (if indexed)
    const styleContext = await this.getStyleContext(userId)

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
          const { findSectorBenchmark } = await import('./sector-benchmarks.js')
          const sectorHint = snapshot.primaryMarket ?? snapshot.businessModel ?? ''
          const benchmark = findSectorBenchmark(sectorHint, snapshot.name)
          const inputs = extractLBOInputs(snapshot, benchmark)
          if (inputs) {
            const result = computeLBO(inputs)
            lboBlock = formatLBOBlock(result)
          }
        }
      }
    } catch {
      // Never block memo generation over LBO computation failure
    }

    // Also pull conflicts for DD findings
    const conflicts = await this.prisma.conflictRecord.findMany({
      where: { userId, ...(clientId ? { clientId } : {}), status: 'UNRESOLVED' },
      select: { entityName: true, property: true, valueA: true, valueB: true, sourceDocA: true, sourceDocB: true },
      take: 20,
    })

    const conflictSummary = conflicts.length > 0
      ? `\n\nCONFLICTS DETECTED:\n${conflicts.map((c) =>
          `- ${c.entityName}.${c.property}: "${c.valueA}" (${c.sourceDocA}) vs "${c.valueB}" (${c.sourceDocB})`
        ).join('\n')}`
      : ''

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

    const [commercialAnalysis, riskAnalysis]: [CommercialAnalysis | null, RiskAnalysis | null] = await Promise.all([
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

    // If regenerating a single section, load the existing memo first
    let existingSections: MemoSection[] = []
    if (sectionId) {
      const existing = await this.loadLatest(dealId, userId)
      existingSections = existing?.sections ?? []
    }

    // Generate each section
    const generatedSections: MemoSection[] = [...existingSections.filter((s) => s.id !== sectionId)]

    const totalSections = sectionsToGenerate.length
    for (let i = 0; i < sectionsToGenerate.length; i++) {
      const section = sectionsToGenerate[i]!
      const progress = Math.round(10 + (i / totalSections) * 80)

      onProgress({
        type: 'section_start',
        sectionId: section.id,
        sectionTitle: section.title,
        progress,
        message: `Writing ${section.title}...`,
      })

      // Management assessment section gets structured scoring data injected
      let managementScoreBlock = ''
      if (section.id === 'management_assessment') {
        managementScoreBlock = await this.getManagementScore(dealId, userId)
      }

      // Per-section knowledge graph provenance block
      // Query the graph for relationship types relevant to this specific section
      let graphProvenanceBlock = ''
      const sectionRelTypes = SECTION_GRAPH_QUERIES[section.id]
      if (sectionRelTypes !== undefined) {
        const { formatted } = await this.rag.queryGraphForEntity(
          companyName,
          sectionRelTypes.length > 0 ? sectionRelTypes : undefined
        ).catch(() => ({ insights: [], formatted: '' }))
        graphProvenanceBlock = formatted
      }

      // Inject computed LBO data for financial sections
      const lboInjection = (section.id === 'lbo_analysis' || section.id === 'financing_structure') && lboBlock
        ? `\nCOMPUTED FINANCIAL DATA — USE THESE NUMBERS VERBATIM (do not estimate or round):\n${lboBlock}\n`
        : ''

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

      try {
        const userMessage = `SECTION: ${section.title}

INSTRUCTIONS: ${section.instructions}
${lboInjection}${styleContext ? `\nSTYLE GUIDE (match this writing style):\n${styleContext}\n` : ''}
${managementScoreBlock ? `\nSTRUCTURED MANAGEMENT SCORES (use these as ground truth for scoring):\n${managementScoreBlock}\n` : ''}${commercialBlock}${riskBlock}
${graphProvenanceBlock ? `\nKNOWLEDGE GRAPH PROVENANCE (entity relationships extracted from indexed documents — cite material facts from this section as [Source: Knowledge Graph]):\n${graphProvenanceBlock}\n` : ''}
DEAL CONTEXT:
Company: ${companyName}
${deal?.notes ? `Notes: ${deal.notes}\n` : ''}
${ragContext.context}${conflictSummary}

Write the "${section.title}" section of the IC memo now.`

        const response = await this.engine.route('user_report', {
          systemPromptKey: 'IC_MEMO_SECTION',
          messages: [{ role: 'user', content: userMessage }],
          userId,
        })

        const textBlock = response.content.find((b) => b.type === 'text')
        const content = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : `[DATA NEEDED: ${section.title} could not be generated]`

        generatedSections.push({
          id: section.id,
          title: section.title,
          content,
          generatedAt: new Date().toISOString(),
        })

        onProgress({
          type: 'section_done',
          sectionId: section.id,
          sectionTitle: section.title,
          progress: progress + Math.round(80 / totalSections) - 1,
          message: `${section.title} complete`,
        })
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error'
        generatedSections.push({
          id: section.id,
          title: section.title,
          content: `[DATA NEEDED: Generation failed — ${errMsg}]`,
          generatedAt: new Date().toISOString(),
        })
      }
    }

    // Sort sections in canonical order
    const sectionOrder = MEMO_SECTIONS.map((s) => s.id)
    generatedSections.sort((a, b) => sectionOrder.indexOf(a.id) - sectionOrder.indexOf(b.id))

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

    // Determine version number
    const prevVersion = sectionId
      ? (await this.loadLatest(dealId, userId))?.version ?? 0
      : await this.getLatestVersion(dealId, userId)

    const result: MemoResult = {
      dealId,
      companyName,
      version: prevVersion + (sectionId ? 0 : 1),
      sections: generatedSections,
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      ...(consistencyResult !== undefined ? { consistency: consistencyResult } : {}),
    }

    // Persist as AgentMemory
    await this.prisma.agentMemory.create({
      data: {
        userId,
        ...(clientId ? { clientId } : {}),
        memoryType: 'SEMANTIC',
        content: JSON.stringify({ type: 'ic_memo', ...result }),
        tags: [dealId, 'ic_memo', companyName],
      },
    })

    return result
  }

  async loadLatest(dealId: string, userId: string): Promise<MemoResult | null> {
    const memory = await this.prisma.agentMemory.findFirst({
      where: {
        userId,
        memoryType: 'SEMANTIC',
        content: { contains: `"type":"ic_memo"` },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!memory) return null

    try {
      const parsed = JSON.parse(memory.content) as Record<string, unknown>
      if (parsed['dealId'] !== dealId) return null
      return parsed as unknown as MemoResult
    } catch {
      return null
    }
  }

  private async getLatestVersion(dealId: string, userId: string): Promise<number> {
    const existing = await this.loadLatest(dealId, userId)
    return existing?.version ?? 0
  }

  private async runConsistencyCheck(
    sections: MemoSection[],
    companyName: string,
    userId: string
  ): Promise<ConsistencyResult> {
    try {
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

      return JSON.parse(jsonMatch[0]) as ConsistencyResult
    } catch {
      return { issues: [], isConsistent: true, summaryNote: 'Consistency check skipped.' }
    }
  }

  /**
   * Score the management team from the latest cached CIM analysis for this deal.
   * Returns a formatted score block to inject into the Management Assessment section,
   * or empty string if no CIM data is available.
   */
  private async getManagementScore(dealId: string, userId: string): Promise<string> {
    try {
      // Pull latest CIM analysis from AgentMemory
      const memory = await this.prisma.agentMemory.findFirst({
        where: {
          userId,
          memoryType: 'SEMANTIC',
          content: { contains: dealId },
          NOT: { content: { contains: '"type":"ic_memo"' } },
        },
        orderBy: { createdAt: 'desc' },
        select: { content: true },
      })

      if (!memory) return ''

      const parsed = JSON.parse(memory.content) as Record<string, unknown>
      if (parsed['dealId'] !== dealId) return ''

      const snap = parsed['companySnapshot'] as Record<string, unknown> | undefined
      if (!snap) return ''

      const mgmtTeam = snap['managementTeam'] as Array<{ name: string; title: string; tenure?: string }> | undefined
      if (!mgmtTeam || mgmtTeam.length === 0) return ''

      // Build management context for scoring
      const teamList = mgmtTeam.map((m) =>
        `${m.name} (${m.title}${m.tenure ? `, ${m.tenure}` : ''})`
      ).join('\n- ')

      const companyName = (snap['name'] as string) ?? 'the company'

      const scoreResponse = await this.engine.route('agent_response', {
        systemPromptKey: 'MGMT_ASSESSMENT_SCORE',
        messages: [{
          role: 'user',
          content: `Score the management team for ${companyName}. Return ONLY valid JSON.

Management Team:
- ${teamList}

Additional context:
- Business model: ${(snap['businessModel'] as string) ?? 'not disclosed'}
- Key risks noted: ${((snap['keyRisks'] as string[]) ?? []).slice(0, 3).join('; ') || 'none'}

Return JSON with this exact structure:
{
  "teamDepth": { "score": <1-10>, "rationale": "<1 sentence>" },
  "founderDependency": { "score": <1-10 where 10 = extreme dependency>, "rationale": "<1 sentence>" },
  "trackRecord": { "score": <1-10>, "rationale": "<1 sentence>" },
  "successionRisk": { "score": <1-10 where 10 = highest risk>, "rationale": "<1 sentence>" },
  "overallStrength": <1-10>,
  "keyManRisk": <true|false>,
  "redFlags": ["<flag1>", "<flag2>"]
}`,
        }],
        maxTokens: 500,
        userId,
      })

      const scoreText = scoreResponse.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text).join('')

      const jsonMatch = scoreText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return ''

      const scores = JSON.parse(jsonMatch[0]) as {
        teamDepth?: { score: number; rationale: string }
        founderDependency?: { score: number; rationale: string }
        trackRecord?: { score: number; rationale: string }
        successionRisk?: { score: number; rationale: string }
        overallStrength?: number
        keyManRisk?: boolean
        redFlags?: string[]
      }

      const fmt = (s: { score: number; rationale: string } | undefined, label: string) =>
        s ? `${label.padEnd(22)} ${s.score}/10   ${s.rationale}` : ''

      const lines = [
        `MANAGEMENT ASSESSMENT SCORE (AI-generated from CIM data):`,
        `Overall Strength: ${scores.overallStrength ?? '?'}/10  |  Key-Man Risk: ${scores.keyManRisk ? 'YES ⚠' : 'No'}`,
        ``,
        fmt(scores.teamDepth,         'Team Depth:'),
        fmt(scores.founderDependency, 'Founder Dependency:'),
        fmt(scores.trackRecord,       'Track Record:'),
        fmt(scores.successionRisk,    'Succession Risk:'),
      ].filter(Boolean)

      if (scores.redFlags && scores.redFlags.length > 0) {
        lines.push(``, `Red Flags:`)
        scores.redFlags.forEach((f) => lines.push(`- ${f}`))
      }

      return lines.join('\n')
    } catch {
      return ''  // Never block memo generation over scoring failure
    }
  }

  /**
   * Retrieve writing style examples from the user's "My Style" knowledge base.
   * Returns a short excerpt of style-relevant content, or empty string if none indexed.
   */
  private async getStyleContext(userId: string): Promise<string> {
    try {
      // Find the My Style client
      const styleClient = await this.prisma.client.findFirst({
        where: { userId, name: 'My Style' },
        select: { id: true },
      })
      if (!styleClient) return ''

      // Check if there are any indexed documents
      const docCount = await this.prisma.knowledgeDocument.count({
        where: { userId, clientId: styleClient.id, syncStatus: 'INDEXED' },
      })
      if (docCount === 0) return ''

      // RAG query against My Style client — retrieve style-relevant chunks
      const styleRag = await this.rag.query(
        'investment committee memo executive summary writing style tone structure format',
        userId,
        styleClient.id
      ).catch(() => null)

      if (!styleRag?.context || styleRag.context.length < 50) return ''

      // Return a trimmed excerpt (max 800 chars to stay within token budget)
      return styleRag.context.substring(0, 800)
    } catch {
      return ''  // Never block memo generation over a style retrieval failure
    }
  }
}
