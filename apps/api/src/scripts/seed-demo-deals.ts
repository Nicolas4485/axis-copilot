/**
 * Demo Deals Seeder — Phase 3B
 *
 * Seeds 3 PE deals to populate the demo pipeline:
 *
 *   1. Nexus DataOps ($42M ARR SaaS) — FULLY LOADED at IC_MEMO stage
 *      Pre-cached CIM analysis + 13-section IC memo. Show this one during the pitch.
 *
 *   2. PrimeHealth Partners ($185M Healthcare) — SCREENING stage, deal record only.
 *      Upload the CIM live during the demo to show the analysis workflow.
 *
 *   3. Vertex Specialty Chemicals ($320M carve-out) — SOURCING stage, deal record only.
 *      Realistic pipeline depth without cluttering the demo.
 *
 * Run:
 *   cd apps/api && npx tsx src/scripts/seed-demo-deals.ts
 *
 * Safe to run multiple times — idempotent (skips any deal that already exists).
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ─── Nexus DataOps — Full 13-section IC Memo ──────────────────────────────────

function buildNexusCimResult(dealId: string): object {
  return {
    documentId: 'demo-nexus-cim-001',
    dealId,
    durationMs: 21340,
    summary:
      'Nexus DataOps is a high-growth B2B SaaS business in the data infrastructure and observability space. $42M ARR growing at 47% YoY with strong NRR of 128%. Founder-led, product-led growth motion. STRONG_PROCEED recommended at 12–14x ARR.',

    companySnapshot: {
      name: 'Nexus DataOps',
      hq: 'San Francisco, CA',
      founded: '2018',
      employees: '~185',
      revenue: '$42M',
      ebitda: '-$3.2M',
      ebitdaMargin: '-7.6%',
      revenueGrowthYoY: '47%',
      description:
        'Nexus DataOps provides a cloud-native data pipeline orchestration and observability platform for mid-market and enterprise data engineering teams. The platform enables automated data quality monitoring, lineage tracking, and pipeline reliability across Snowflake, Databricks, and BigQuery environments.',
      businessModel:
        'Usage-based SaaS with committed annual contracts. Average ACV of $84K per customer. Expansion driven by data volume and seat growth — NRR of 128% reflects strong land-and-expand. Professional services ~6% of revenue.',
      primaryMarket:
        'Data Observability & Pipeline Orchestration — $3.8B TAM growing at 32% CAGR (Gartner 2024). Adjacent to DataOps/MLOps tooling market of $8.4B.',
      productsServices: [
        'Nexus Pipeline Studio — visual data pipeline builder and orchestrator',
        'Nexus Monitor — real-time data quality and anomaly detection',
        'Nexus Lineage — end-to-end data lineage and impact analysis',
        'Nexus API — programmatic pipeline management and webhook integrations',
      ],
      keyCustomers: [
        'Fortune 500 insurance carrier (largest, ~4.2% of ARR)',
        'Series D fintech (data infrastructure automation)',
        'Top-10 US regional bank (regulatory data lineage)',
        'Global logistics platform (12-country deployment)',
      ],
      customerConcentration:
        'Top 10 customers represent 31% of ARR. Largest single customer: 4.2%. Well-distributed for a company at this scale.',
      managementTeam: [
        { name: 'Ravi Shankar', title: 'CEO & Co-Founder', tenure: '6 years' },
        { name: 'Lin Wei', title: 'CTO & Co-Founder', tenure: '6 years' },
        { name: 'Tom Garrity', title: 'CFO', tenure: '2 years (ex-Databricks Finance)' },
        { name: 'Jessica Morales', title: 'Chief Revenue Officer', tenure: '18 months' },
      ],
      keyRisks: [
        'EBITDA negative — requires 18–24 months of capital to reach breakeven',
        'High growth dependency: valuation collapses if growth decelerates below 30%',
        'Crowded market: Monte Carlo, Great Expectations, dbt Labs all adjacent',
        'Two engineering co-founders with limited go-to-market background',
      ],
      growthInitiatives: [
        'Enterprise motion: AE headcount scaling from 8 to 20 by Q4 2025',
        'Partner ecosystem: Snowflake and Databricks native marketplace listings',
        'International: EU data residency compliance for EMEA expansion (H2 2025)',
        'AI-native features: LLM-assisted root-cause analysis of pipeline failures',
      ],
      financials: [
        { year: '2022', revenue: '$12.4M', ebitda: '-$5.1M', growth: undefined },
        { year: '2023', revenue: '$28.6M', ebitda: '-$4.8M', growth: '+131%' },
        { year: '2024', revenue: '$42.0M', ebitda: '-$3.2M', growth: '+47%' },
        { year: '2025E', revenue: '$61.7M', ebitda: '-$1.0M', growth: '+47%' },
      ],
      auditedFinancials: true,
      askPrice: '$520M–$560M (12–13x ARR)',
      proposedEVEBITDA: null,
      pageCount: 96,
    },

    fitScore: {
      businessQuality: 91,
      financialQuality: 79,
      managementStrength: 82,
      marketDynamics: 88,
      dealStructure: 73,
      overallFit: 82,
      rationale: {
        businessQuality:
          'Best-in-class NRR of 128% and usage-based expansion economics are hallmarks of durable enterprise SaaS. Deeply embedded in customer data stacks — churn cost is high. Pipeline orchestration is infrastructure-grade software with multi-year switching friction.',
        financialQuality:
          'Audited financials, clean metrics reporting, and improving EBITDA trajectory give high confidence in stated numbers. Primary concern: valuation is on ARR multiples, not earnings — requires conviction on continued growth.',
        managementStrength:
          'Strong technical founders with proven product-market fit. CFO hire from Databricks signals institutional readiness. CRO Jessica Morales has only 18 months tenure — GTM maturity is still being proven.',
        marketDynamics:
          'Data observability is one of the highest-growth categories in enterprise software. Nexus is positioned as the infrastructure layer (pipes) rather than the analytics layer (dashboards) — a more durable and less commoditizable position.',
        dealStructure:
          'ARR multiples of 12–13x represent a premium that requires sustained 40%+ growth to justify. No leverage available on negative EBITDA business — equity-only deal compresses fund returns. Requires minority/majority growth equity structure.',
      },
      recommendation: 'STRONG_PROCEED',
      redFlags: [
        {
          flag: 'EBITDA negative — breakeven 18–24 months out, requires capital to fund growth',
          severity: 'MEDIUM',
          pageRef: 'p. 61',
        },
        {
          flag: 'CRO hired 18 months ago — enterprise GTM track record not yet established',
          severity: 'MEDIUM',
          pageRef: 'p. 22',
        },
        {
          flag: 'dbt Labs launched pipeline monitoring in direct competition — win/loss impact unclear',
          severity: 'HIGH',
          pageRef: 'p. 44',
        },
      ],
    },

    redFlags: [
      {
        description:
          'EBITDA negative at -$3.2M. Business requires continued equity funding to reach breakeven. Investor must model a capital injection schedule and ensure the return profile holds under a slower-growth scenario.',
        severity: 'MEDIUM',
        pageRef: 'p. 61–63',
      },
      {
        description:
          'dbt Labs (backed by Andreessen Horowitz, $4.2B valuation) launched native pipeline monitoring in January 2025 — direct overlap with Nexus Monitor. No win/loss data post-launch disclosed in CIM.',
        severity: 'HIGH',
        pageRef: 'p. 44',
      },
      {
        description:
          'CRO Jessica Morales joined 18 months ago. Outbound enterprise motion is still being built. AE ramp productivity data and quota attainment not disclosed — key variable for the $61.7M FY2025E revenue forecast.',
        severity: 'MEDIUM',
        pageRef: 'p. 22',
      },
    ],

    keyQuestions: [
      'Provide cohort-level NRR analysis for the 2022 and 2023 cohorts separately — is 128% NRR stable or declining as cohorts age?',
      'What is the competitive win/loss ratio vs. dbt Labs post their January 2025 pipeline monitoring launch?',
      'Detail the path to EBITDA breakeven: which expense lines are fixed vs. variable, and at what ARR does the business reach cash flow neutral?',
      'What is the AE quota attainment rate and average sales cycle length for enterprise deals (ACV $100K+)?',
      'Provide Snowflake and Databricks marketplace metrics — contribution to new ARR, average ACV, win rate from marketplace vs. direct',
      'What are the data residency and sovereign cloud requirements for the EU expansion? Has GDPR-compliant architecture been built or is it roadmap?',
      'Describe the co-founder governance post-transaction — who remains CEO long-term and what is the equity rollover structure for Ravi and Lin?',
    ],

    agentInsights: {
      alex:
        "Nexus is the highest-quality deal I've analyzed this quarter. The 128% NRR in a B2B infrastructure product is a strong signal — these customers aren't just staying, they're growing substantially. The embedded position in the data stack (you can't easily remove a pipeline orchestrator that's been running for 18 months) creates the kind of lock-in that justifies a premium multiple.\n\nThe dbt Labs competitive move is the one thing I'd want to stress-test hard in diligence. dbt has deep community trust and massive distribution through the Modern Data Stack ecosystem. If they're seriously going after pipeline monitoring, Nexus's differentiation story changes. I'd want to talk to 5 customers post-dbt announcement before committing.\n\nStructure: this is a growth equity deal, not a traditional buyout. No leverage available on negative EBITDA. Works best as a minority stake (30–40%) if founder wants to remain in control, or a majority with a meaningful rollover. Either way, returns are driven entirely by the exit multiple — you need confidence the 40%+ growth continues for 3+ years.",
    },

    conflicts: [],
  }
}

function buildNexusMemoResult(dealId: string): object {
  const now = new Date().toISOString()
  return {
    type: 'ic_memo',
    dealId,
    companyName: 'Nexus DataOps',
    version: 1,
    generatedAt: now,
    durationMs: 118430,
    sections: [
      {
        id: 'executive_summary',
        title: 'Executive Summary',
        generatedAt: now,
        content: `**Company:** Nexus DataOps | **Sector:** B2B SaaS — Data Infrastructure & Observability | **HQ:** San Francisco, CA

**Transaction:** Growth equity investment (30–49% stake). Founders raising $130–150M primary + secondary. Post-money valuation: $540M (~13x FY2024 ARR). Lead investor preferred; co-investor spots available.

**Recommendation: STRONG PROCEED to Phase 2 Diligence**

Nexus DataOps is a category-defining data pipeline orchestration platform with $42M ARR, 47% YoY growth, and 128% net revenue retention — a best-in-class NRR for infrastructure SaaS. The business is pre-profitability but on a clear trajectory to breakeven at ~$70M ARR (FY2025E). The primary risk is intensifying competition from dbt Labs, which must be stress-tested in customer diligence. At 12–13x ARR for a 40%+ growth infrastructure SaaS, valuation is full but justifiable given the business quality.`,
      },
      {
        id: 'company_overview',
        title: 'Company Overview',
        generatedAt: now,
        content: `Nexus DataOps was founded in 2018 by Ravi Shankar (CEO) and Lin Wei (CTO) — both ex-Google Cloud data infrastructure engineers — to solve the pipeline reliability and observability gap in modern cloud data stacks.

**Business Model:** Usage-based SaaS with committed annual contracts. ACV of $84K per customer (FY2024 average). Expansion driven by data volume growth and new seat additions — net revenue retention of 128%. Professional services (implementation, training) represent ~6% of total revenue.

**Key Metrics (FY2024):**
- ARR: $42.0M
- Customers: ~500 active accounts
- Average ACV: $84K
- NRR: 128%
- Gross Margin: 76%
- Headcount: ~185

**Products:**
- *Nexus Pipeline Studio* — visual DAG-based pipeline builder; native connectors for 200+ data sources
- *Nexus Monitor* — real-time data quality checks, anomaly detection, SLA alerting
- *Nexus Lineage* — end-to-end column-level data lineage across Snowflake, Databricks, BigQuery
- *Nexus API* — full programmatic control for DataOps-as-code teams

**Integrations:** Deep native integrations with Snowflake (Powered by Snowflake partner), Databricks (technology partner), dbt Cloud, Fivetran, Airbyte, Looker, Tableau.`,
      },
      {
        id: 'market_analysis',
        title: 'Market Analysis',
        generatedAt: now,
        content: `**Total Addressable Market:** The global Data Observability and Pipeline Orchestration market is estimated at $3.8B in 2024, growing at 32% CAGR through 2028 (Gartner). The adjacent DataOps/MLOps tooling market adds another $8.4B. Nexus's current penetration of its serviceable addressable market is under 1%.

**Market Dynamics:**
- Data engineering teams doubling every 2 years as AI/ML adoption accelerates data infrastructure investment
- Regulatory pressure (SOX, GDPR, CCPA) driving mandatory data lineage and audit trail requirements
- Cloud data warehouse consolidation (Snowflake, Databricks) creating a standardized foundation for observability tooling
- Enterprise shift from batch to real-time streaming increases pipeline failure surface area and observability need

**Competitive Landscape:**

| Vendor | Positioning | Key Strength | Key Gap vs. Nexus |
|---|---|---|---|
| Monte Carlo Data | Data observability leader | Brand recognition, enterprise sales | No pipeline orchestration; observability only |
| Great Expectations | Open-source data quality | Developer community | Limited enterprise support, self-managed |
| dbt Labs | SQL transformation + monitoring | Ecosystem distribution | Pipeline orchestration weak; new entrant to observability |
| Astronomer (Airflow) | Legacy orchestration | Massive installed base | Dated UX, no native observability |
| Prefect | Modern orchestration | Developer experience | Observability is nascent add-on |

**Nexus's Positioning:** The only platform combining pipeline orchestration + observability + lineage in a single pane of glass. Competitors cover one or two of these — Nexus covers all three. This is the core differentiation justifying premium pricing and high NRR.`,
      },
      {
        id: 'financial_analysis',
        title: 'Financial Analysis',
        generatedAt: now,
        content: `**Note: Financials are audited by Deloitte. Clean Big-4 audit is a positive differentiator vs. most deals at this stage.**

**Income Statement Summary (FY2022–FY2025E):**

| Metric | FY2022 | FY2023 | FY2024 | FY2025E |
|---|---|---|---|---|
| ARR | $12.4M | $28.6M | $42.0M | $61.7M |
| YoY Growth | — | +131% | +47% | +47% |
| Gross Profit | $9.1M | $21.3M | $31.9M | $47.0M |
| Gross Margin | 73% | 75% | 76% | 76% |
| S&M | $8.2M | $14.3M | $19.8M | $28.4M |
| R&D | $5.4M | $9.1M | $11.6M | $16.8M |
| G&A | $3.9M | $5.8M | $5.7M | $6.4M |
| EBITDA | -$8.4M | -$7.9M | -$3.2M | -$1.0M |
| EBITDA Margin | -68% | -28% | -8% | -2% |

**Unit Economics (FY2024):**
- Rule of 40: 47% growth + (-8%) EBITDA = **39** (borderline — strong on growth, improving on profitability)
- LTV/CAC: ~4.8x (estimated based on 128% NRR and $28K blended CAC)
- CAC Payback: ~9 months (usage-based expansion model reduces payback vs. fixed-seat)
- ARR/FTE: $227K (strong for a 185-person company at this ARR level)

**Path to Breakeven:**
At ~$68–72M ARR (FY2025/H1 FY2026), S&M efficiency gains and gross margin expansion converge to cash flow neutral. Management targets 15% FCF margin at $100M ARR.`,
      },
      {
        id: 'lbo_analysis',
        title: 'LBO Returns Analysis',
        generatedAt: now,
        content: `**Note: This is a growth equity deal, not a traditional leveraged buyout. No debt financing is available on a negative EBITDA business. Returns are driven entirely by revenue multiple expansion and growth.**

**Investment Structure:**
- Deal type: Growth equity (minority or majority depending on negotiation)
- Equity invested: $130–150M (primary + secondary mix)
- Post-money valuation: $540M (13x FY2024 ARR)
- Entry price: $540M equity value / $42M ARR = 12.9x ARR

**Return Scenarios (5-year hold, exit FY2029E):**

| Scenario | ARR CAGR | FY2029E ARR | Exit Multiple | EV at Exit | Gross MOIC | IRR |
|---|---|---|---|---|---|---|
| Bull | 45% | $253M | 12x ARR | $3.0B | 5.6x | ~41% |
| Base | 35% | $196M | 10x ARR | $1.96B | 3.6x | ~29% |
| Bear | 25% | $130M | 7x ARR | $910M | 1.7x | ~11% |

**Base Case Assumptions:**
- ARR growth decelerates from 47% → 35% CAGR as scale increases (consistent with Snowflake, Databricks pattern)
- Exit multiple compression from 13x → 10x ARR reflects market normalization
- No leverage — all equity return
- Gross MOIC 3.6x / IRR 29% clears Fund V hurdle of 3.0x / 25% IRR ✓

**Key Return Sensitivities:**
- Every 5% change in growth CAGR: ±0.6x MOIC
- Every 1x change in exit ARR multiple: ±$200M EV impact
- If growth falls below 25% CAGR: deal likely fails to clear hurdle — bear case is the key risk to monitor`,
      },
      {
        id: 'financing_structure',
        title: 'Financing Structure',
        generatedAt: now,
        content: `**No debt financing available.** The company is EBITDA negative and does not meet lender covenants for leverage financing. This is a pure equity transaction.

**Proposed Capital Structure:**
- Total raise: $130–150M
- Primary (growth capital to company): $80–90M
- Secondary (founder/early investor liquidity): $50–60M
- Our investment: Up to $75M for a 30–40% stake (lead investor)

**Use of Proceeds (Primary $85M):**
- S&M investment (AE headcount + demand gen): $45M
- Product R&D (AI features, EU data residency): $22M
- International expansion (EMEA): $13M
- G&A and working capital: $5M

**Governance Rights (Target):**
- Board seat (1 of 5 seats at 30–40% ownership)
- Information rights: monthly financials, ARR reporting
- Pro-rata rights on future rounds
- Tag-along / drag-along on exit
- No veto on operational decisions — management retains control

**Co-Investor Syndicate:**
The company is seeking 1–2 co-investors alongside our lead position. $40–60M available for co-investment. LP co-investment opportunity available given deal size and growth profile.

*⚠ [DATA NEEDED: Final ownership % subject to completion of financial diligence and founder negotiations on secondary tranche pricing]*`,
      },
      {
        id: 'investment_thesis',
        title: 'Investment Thesis',
        generatedAt: now,
        content: `We believe Nexus DataOps is a generational data infrastructure investment for five reasons:

**1. Category-defining platform with genuine full-stack differentiation**
No competitor combines pipeline orchestration + observability + lineage in a single integrated platform. This is not a feature gap — it represents 18 months of engineering work to replicate. Enterprise data teams consolidating vendor spend will choose the integrated platform over point solutions.

**2. 128% NRR is the clearest signal of product-market fit**
A 128% NRR means the average customer is spending 28% more than they were a year ago without any new logo acquisition. This is the land-and-expand flywheel working as designed. Infrastructure SaaS businesses with NRR above 120% have historically been durable compounders.

**3. Snowflake and Databricks partnership creates defensible distribution moat**
Being listed natively in the Snowflake and Databricks marketplaces means Nexus inherits enterprise procurement relationships and security vetting already completed by customers. This is a distribution moat that competitors cannot easily replicate — it took 3 years to build.

**4. AI tailwind accelerates the observability category**
Every LLM/AI workload requires reliable data pipelines. As enterprises scale AI, data quality and lineage become compliance-critical (EU AI Act data provenance requirements). Nexus is positioned to capture AI-driven data infrastructure spend as a second wave of growth beyond traditional BI/analytics.

**5. Management team has the right profile for the next growth phase**
Ravi (CEO) has been building toward enterprise since Y Combinator (2019). CFO hire from Databricks and CRO hire from Salesforce signal deliberate institutional preparation. The transition from founder-led sales to a repeatable enterprise motion is in progress — our involvement can accelerate this.`,
      },
      {
        id: 'key_risks',
        title: 'Key Risks',
        generatedAt: now,
        content: `| Risk | Severity | Description | Mitigation |
|---|---|---|---|
| dbt Labs competitive incursion | HIGH | dbt Labs (a16z-backed, $4.2B val.) launched native pipeline monitoring Jan 2025. dbt has massive developer mindshare and ecosystem distribution. If they expand to full observability, Nexus's core differentiation is threatened | Require 5 customer calls post-dbt announcement as condition of proceeding; commission independent competitive analysis by Gartner or Forrester |
| Growth deceleration risk | HIGH | Valuation at 13x ARR requires sustained 40%+ growth. Any material deceleration compresses the exit multiple AND the exit ARR — a double compression. Bear case (25% CAGR) produces a sub-hurdle 1.7x MOIC | Model downside scenario thoroughly; include growth rate ratchet in term sheet if possible |
| EBITDA negative | MEDIUM | Company is burning ~$3M/year. New capital must be deployed efficiently. Hiring plan discipline is critical — engineering talent at SF wage rates can burn $20M+ quickly | Require detailed headcount plan by function; monthly burn review rights; milestone-based capital tranches |
| Enterprise GTM immaturity | MEDIUM | CRO Jessica Morales is 18 months in. Enterprise sales motion (ACV $200K+) has a 6–9 month sales cycle. Pipeline visibility and forecast accuracy are not yet established | Request pipeline by cohort and stage; check AE quota attainment and ramp time |
| Regulatory / data sovereignty | LOW | EU GDPR, upcoming EU AI Act data provenance rules, and US federal data residency requirements create compliance complexity for multi-region deployments | Legal diligence on compliance posture; EU data residency architecture review required |`,
      },
      {
        id: 'exit_analysis',
        title: 'Exit Analysis',
        generatedAt: now,
        content: `**Exit Horizon:** 4–6 years (FY2028–FY2030 target). Company will be approaching $150–200M ARR with EBITDA profitability.

**Exit Scenarios:**

**Scenario 1: Strategic Acquisition (Most Likely)**
Likely acquirers: Snowflake, Databricks, Salesforce (MuleSoft/Tableau synergies), Microsoft (Azure Data Factory adjacent), ServiceNow (enterprise workflow expansion). At $150–200M ARR with 20%+ EBITDA margin, a strategic would pay 15–20x ARR for category leadership. Precedents: Tableau/Salesforce (29x ARR), MuleSoft/Salesforce (21x ARR), Looker/Google (16x ARR).

**Scenario 2: IPO**
At $200M ARR with EBITDA profitability, public market comps (Snowflake, Databricks, Confluent) support 10–15x ARR. IPO readiness includes: Big-4 audit (already in place), SOX controls (target FY2026), ARR waterfall reporting (in place), investor relations infrastructure.

**Scenario 3: PE Sponsor Buyout**
At $150M ARR with EBITDA near-breakeven, a PE sponsor buyout with leverage becomes feasible. At 3x leverage, a $1.5B+ EV transaction generates strong returns for the growth equity investors.

**Buyer Universe Analysis:**
- Snowflake: strategic fit is highest — Nexus is built on Snowflake and would be a native product integration. Premium likely.
- Databricks: competing data lakehouse ecosystem; acquisition of Nexus would accelerate enterprise observability capability.
- Microsoft: data factory + Nexus lineage = enterprise data governance complete platform; fits Teams of Teams enterprise strategy.

*⚠ [DATA NEEDED: Engagement banker's preliminary acquirer interest assessment; comparable transaction EBITDA and ARR multiples for 2024–2025 data infrastructure deals]*`,
      },
      {
        id: 'management_assessment',
        title: 'Management Assessment',
        generatedAt: now,
        content: `**Ravi Shankar — CEO & Co-Founder (6 years)**
YC W2019 alumni. Previously a Google Cloud infrastructure engineer for 4 years. Strong technical credibility with the engineering team; increasingly effective with enterprise customers. Early 2024: hired his first enterprise AEs and closed three Fortune 500 logos personally — demonstrates ability to transition from engineer-founder to enterprise CEO. Key question: long-term CEO ambition post-transaction? Does he want to run a 1,000-person company?

**Lin Wei — CTO & Co-Founder (6 years)**
Architecture of the core pipeline engine is Lin's work. Databricks Certified Data Engineer and contributor to Apache Airflow. Deep technical reputation in the data engineering community — the LinkedIn articles on pipeline reliability have 40K+ followers. Lower key-person risk than typical co-founder CTOs because the team is strong; Lin spends ~30% of time on architecture vs. 100% day-one.

**Tom Garrity — CFO (2 years, ex-Databricks Finance)**
Exceptional hire for a $42M ARR company. Brought SaaS metrics rigor: ARR waterfall, cohort NRR, S&M efficiency ratios. Monthly board reporting is board-ready by institutional standards. Strong relationship with the Series C investors. Reference: "Tom is exactly what we needed to take the finance function from startup to PE-ready."

**Jessica Morales — CRO (18 months, ex-Salesforce/Qualtrics)**
Recruited by Ravi explicitly to build the enterprise motion. Track record at Salesforce (scaled commercial SMB segment) and Qualtrics (enterprise AE management). 18 months in: has tripled AE headcount from 4 to 12, reduced average sales cycle from 8 months to 5.5 months on sub-$100K ACV deals. Still building on enterprise (ACV $200K+) — this is the key management diligence area.

**Overall Assessment:** Exceptionally strong founding team with demonstrated institutional readiness. The CFO quality is top decile for a pre-IPO company. The primary risk is CRO tenure — 18 months is too short to call the enterprise GTM fully proven. Board seat from our investment can constructively support Morales's scaling plan without undermining management authority.

*⚠ [DATA NEEDED: Reference calls with 3 enterprise customers (ACV $150K+); Morales's AE quota attainment by rep and cohort; pipeline coverage ratio Q2 2025]*`,
      },
      {
        id: 'value_creation_plan',
        title: 'Value Creation Plan',
        generatedAt: now,
        content: `**Strategic Goal:** Scale from $42M to $150M+ ARR in 4 years while reaching EBITDA profitability, positioning for a strategic exit at $1.5B+ EV.

**100-Day Plan (First 100 Days Post-Close):**

| Priority | Action | Owner | Success Metric |
|---|---|---|---|
| Distribution | Complete Snowflake Powered-By certification; launch Databricks marketplace listing | CTO + Partnerships | Live in both marketplaces by Day 60 |
| Enterprise GTM | Hire 4 additional AEs (2 East Coast, 2 UK) using approved headcount plan | CRO | Offers extended by Day 45 |
| Governance | Onboard our board rep; establish monthly ARR review cadence | CFO | First board meeting by Day 30 |
| Competitive Defense | Commission independent Gartner/Forrester analysis of dbt Labs competitive overlap | CEO | Report delivered by Day 75 |
| EU Prep | Data residency architecture decision: build vs. partner (AWS dedicated region) | CTO | Architecture decision by Day 45 |

**EBITDA Bridge (Entry FY2024 → Target FY2028E):**

| Item | FY2024 | FY2025E | FY2026E | FY2027E | FY2028E |
|---|---|---|---|---|---|
| ARR | $42M | $62M | $88M | $119M | $155M |
| Gross Profit (76%) | $32M | $47M | $67M | $91M | $118M |
| S&M | -$20M | -$28M | -$36M | -$42M | -$47M |
| R&D | -$12M | -$17M | -$20M | -$24M | -$27M |
| G&A | -$6M | -$6M | -$7M | -$8M | -$9M |
| EBITDA | **-$3M** | **-$1M** | **$4M** | **$17M** | **$35M** |
| EBITDA Margin | -8% | -2% | +5% | +14% | +23% |

**S&M Efficiency Improvement:** Key lever. As enterprise AEs ramp and partner channel matures, CAC payback shortens from 9 months to 6 months. S&M as % of revenue decreases from 47% → 30% by FY2028E.`,
      },
      {
        id: 'dd_findings',
        title: 'DD Findings',
        generatedAt: now,
        content: `**Phase 1 Findings (CIM-based):**

✅ **Confirmatory:**
- Audited financials (Deloitte) — clean Big-4 opinion, no material weaknesses
- 128% NRR confirmed across cohort data in CIM appendix
- Snowflake and Databricks partnership agreements referenced with multi-year terms
- Headcount plan is reasonable: 185 → 280 FTE over 18 months at $85M primary

⚠ **Requires Diligence:**
- dbt Labs competitive impact on Nexus Monitor pipeline — win/loss data post-Jan 2025 announcement not in CIM
- CRO Jessica Morales enterprise track record — references and quota attainment data needed
- AE pipeline by stage and cohort — $61.7M FY2025E requires Q3/Q4 acceleration
- EU data residency architecture — is this a product build (12+ months) or cloud configuration?

❌ **Gaps Identified:**
- No customer-level NRR cohort breakdown by vintage year
- Technical architecture review of the pipeline engine scalability beyond $100M ARR
- No IP assignment documentation for Lin Wei's pre-company contributions (Apache Airflow work)

*⚠ [DATA NEEDED: Full customer-level ARR detail; technical architecture review by independent engineer; IP chain of title from outside counsel]*`,
      },
      {
        id: 'recommendation',
        title: 'Recommendation',
        generatedAt: now,
        content: `**IC Recommendation: STRONG PROCEED — Approve Phase 2 Diligence**

**Investment Summary:**
- Invest: Up to $75M for a 30–40% growth equity stake (lead position)
- Post-money valuation: $540M (12.9x FY2024 ARR)
- Target close: Q3 2025
- Hold period: 4–6 years
- Return target (base): 3.6x MOIC / 29% IRR

**Conditions for Proceeding to Final Investment Decision:**

1. **Competitive diligence on dbt Labs** — 5 customer reference calls post-January 2025 dbt monitoring launch; independent analyst assessment of competitive overlap
2. **NRR cohort analysis** — customer-level NRR broken out by 2022 vs. 2023 vs. 2024 cohort to identify any aging-cohort decay
3. **Enterprise GTM validation** — CRO reference checks; AE quota attainment by rep and cohort; pipeline coverage ratio for H2 2025
4. **Technical architecture review** — independent senior engineer evaluation of scalability, tech debt, and EU data residency path
5. **IP clean title** — outside counsel review of Lin Wei pre-company contributions; confirm all IP is assigned to Nexus, Inc.

**Why Proceed Despite the Risks:**
The combination of 128% NRR, a deeply embedded infrastructure platform, and distribution moats via Snowflake/Databricks partnerships is rare at this price point. The dbt Labs risk is real but addressable — dbt is a SQL transformation tool building into observability, while Nexus is an observability platform with pipeline capability. These are different starting points. Even in a bear scenario where dbt takes 20% market share, Nexus grows to $130M ARR and exits at 7x for a 1.7x MOIC — that is an acceptable floor for this risk profile.

The fund has not invested in data infrastructure in the past 18 months. This is a category-defining position. Recommend proceeding.`,
      },
    ],
  }
}

// ─── Deal 2: PrimeHealth Partners (shell only) ────────────────────────────────

const PRIMEHEALTH_DOCUMENTS = [
  {
    title: 'PrimeHealth Partners — Confidential Information Memorandum (2024)',
    mimeType: 'application/pdf',
    sourceType: 'UPLOAD' as const,
    chunkCount: 0,
    note: '[DEMO STUB] Upload cim-primehealth.pdf from demo-data/ to run live analysis.',
  },
]

// ─── Deal 3: Vertex Specialty Chemicals (shell only) ─────────────────────────

const VERTEX_DOCUMENTS = [
  {
    title: 'Vertex Specialty Chemicals — Confidential Information Memorandum (2024)',
    mimeType: 'application/pdf',
    sourceType: 'UPLOAD' as const,
    chunkCount: 0,
    note: '[DEMO STUB] Upload cim-vertex-chemicals.pdf from demo-data/ to run live analysis.',
  },
]

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱 AXIS Demo Deals Seeder — starting...\n')

  // Find the user
  const targetEmail = process.env['SEED_USER_EMAIL'] ?? process.env['ADMIN_EMAIL']
  const user = targetEmail
    ? await prisma.user.findFirst({ where: { email: targetEmail } })
    : await prisma.user.findFirst({ orderBy: { createdAt: 'desc' } })

  if (!user) {
    console.error('❌ No users found. Start the API first (pnpm dev) so the user is created.')
    process.exit(1)
  }
  console.log(`👤 Using user: ${user.email} (${user.id})\n`)

  // ────────────────────────────────────────────────────────────────────────────
  // DEAL 1 — Nexus DataOps (FULLY LOADED)
  // ────────────────────────────────────────────────────────────────────────────

  const existingNexus = await prisma.deal.findFirst({
    where: { userId: user.id, name: { contains: 'Nexus DataOps' } },
  })

  if (existingNexus) {
    console.log(`✅ Nexus DataOps already exists (${existingNexus.id}) — skipping`)
  } else {
    console.log('📊 Seeding Deal 1: Nexus DataOps (FULLY LOADED at IC_MEMO)...')

    const nexusClient = await prisma.client.create({
      data: {
        userId: user.id,
        name: 'Nexus DataOps',
        industry: 'B2B SaaS — Data Infrastructure',
        companySize: 185,
        website: 'https://nexusdataops.example.com',
        notes: 'Demo PE target. B2B SaaS data pipeline observability. Pre-seeded with full IC memo.',
      },
    })

    const targetClose = new Date()
    targetClose.setMonth(targetClose.getMonth() + 2)

    const nexusDeal = await prisma.deal.create({
      data: {
        userId: user.id,
        clientId: nexusClient.id,
        name: 'Nexus DataOps — Growth Equity',
        stage: 'IC_MEMO',
        priority: 'HIGH',
        sector: 'B2B SaaS / Data Infrastructure',
        dealSize: '$130–150M equity (13x ARR, $540M post-money)',
        targetClose,
        notes: 'Growth equity lead position. 30–40% stake. Competitive process — 2 other sponsors. IC decision required by end of month.',
      },
    })

    // VDR documents
    const nexusCimDoc = await prisma.knowledgeDocument.create({
      data: {
        userId: user.id,
        clientId: nexusClient.id,
        dealId: nexusDeal.id,
        title: 'Nexus DataOps — Confidential Information Memorandum (2024)',
        mimeType: 'application/pdf',
        sourceType: 'UPLOAD',
        chunkCount: 168,
        syncStatus: 'INDEXED',
        conflictNotes: '[DEMO STUB] 96-page CIM. Provided under NDA by Goldman Sachs (sell-side advisor).',
      },
    })

    await prisma.knowledgeDocument.create({
      data: {
        userId: user.id,
        clientId: nexusClient.id,
        dealId: nexusDeal.id,
        title: 'FY2024 Audited Financial Statements (Deloitte)',
        mimeType: 'application/pdf',
        sourceType: 'UPLOAD',
        chunkCount: 44,
        syncStatus: 'INDEXED',
        conflictNotes: '[DEMO STUB] Clean Big-4 audit opinion. No material weaknesses.',
      },
    })

    await prisma.knowledgeDocument.create({
      data: {
        userId: user.id,
        clientId: nexusClient.id,
        dealId: nexusDeal.id,
        title: 'Nexus ARR Waterfall + NRR Cohort Analysis FY2022–2024',
        mimeType: 'application/pdf',
        sourceType: 'UPLOAD',
        chunkCount: 18,
        syncStatus: 'INDEXED',
        conflictNotes: '[DEMO STUB] 128% NRR confirmed. Cohort breakdown by vintage year included.',
      },
    })

    await prisma.knowledgeDocument.create({
      data: {
        userId: user.id,
        clientId: nexusClient.id,
        dealId: nexusDeal.id,
        title: 'Management Bios + Org Chart (Dec 2024)',
        mimeType: 'application/pdf',
        sourceType: 'UPLOAD',
        chunkCount: 10,
        syncStatus: 'INDEXED',
        conflictNotes: '[DEMO STUB] Includes LinkedIn profiles, equity holdings, and prior company histories.',
      },
    })

    // CIM analysis cache
    const cimResult = buildNexusCimResult(nexusDeal.id)
    const cimPatch = { ...(cimResult as Record<string, unknown>), documentId: nexusCimDoc.id }
    await prisma.agentMemory.create({
      data: {
        userId: user.id,
        clientId: nexusClient.id,
        memoryType: 'SEMANTIC',
        content: JSON.stringify(cimPatch),
        tags: [nexusDeal.id, nexusCimDoc.id, 'cim_analysis', 'Nexus DataOps'],
      },
    })

    // IC Memo cache
    const memoResult = buildNexusMemoResult(nexusDeal.id)
    await prisma.agentMemory.create({
      data: {
        userId: user.id,
        clientId: nexusClient.id,
        memoryType: 'SEMANTIC',
        content: JSON.stringify(memoResult),
        tags: [nexusDeal.id, 'ic_memo', 'Nexus DataOps'],
      },
    })

    // Demo session + messages
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        clientId: nexusClient.id,
        dealId: nexusDeal.id,
        title: 'Nexus DataOps — CIM Review & IC Prep',
        mode: 'analysis',
        status: 'ACTIVE',
      },
    })

    await prisma.message.createMany({
      data: [
        {
          sessionId: session.id,
          role: 'USER',
          content: "Alex, I've uploaded the Nexus DataOps CIM. Goldman is running the process. What's your read?",
          mode: 'analysis',
          metadata: {},
        },
        {
          sessionId: session.id,
          role: 'ASSISTANT',
          content:
            "Strong deal. Let me give you the quick read first, then we can dig in.\n\nNexus is playing in one of the best categories in enterprise software right now — data infrastructure. The 128% NRR is the headline number that matters: it means existing customers are spending 28% more year-over-year without you adding a single new logo. That's the land-and-expand flywheel working as designed, and it's rare at this stage.\n\nThe 47% growth rate is real — Deloitte-audited — and the Snowflake partnership gives them distribution that would take a competitor 3 years to replicate.\n\nMy concern: dbt Labs. They launched pipeline monitoring in January and they have massive developer mindshare. I need to understand the competitive overlap before I'd sign off. If dbt is seriously going after Nexus's core product, the valuation story changes.\n\nAt 13x ARR for 40%+ growth infrastructure SaaS — this is full but defensible valuation if the dbt risk checks out. STRONG PROCEED to Phase 2.\n\nShould I generate the full 13-section IC Memo?",
          mode: 'analysis',
          metadata: { agentKey: 'AGENT_DUE_DILIGENCE', model: 'claude-sonnet-4-6' },
        },
      ],
    })

    console.log(`   ✓ Client: ${nexusClient.name} (${nexusClient.id})`)
    console.log(`   ✓ Deal: ${nexusDeal.name} (${nexusDeal.id}) — IC_MEMO stage`)
    console.log(`   ✓ 4 VDR documents, CIM analysis + IC memo cached`)
    console.log(`   ✓ Session with 2 demo messages (${session.id})`)
  }

  // ────────────────────────────────────────────────────────────────────────────
  // DEAL 2 — PrimeHealth Partners (shell — upload CIM live in demo)
  // ────────────────────────────────────────────────────────────────────────────

  const existingPrimeHealth = await prisma.deal.findFirst({
    where: { userId: user.id, name: { contains: 'PrimeHealth' } },
  })

  if (existingPrimeHealth) {
    console.log(`\n✅ PrimeHealth Partners already exists (${existingPrimeHealth.id}) — skipping`)
  } else {
    console.log('\n🏥 Seeding Deal 2: PrimeHealth Partners (SCREENING stage — for live demo upload)...')

    const phClient = await prisma.client.create({
      data: {
        userId: user.id,
        name: 'PrimeHealth Partners',
        industry: 'Post-Acute Healthcare Services',
        companySize: 2200,
        website: 'https://primehealthpartners.example.com',
        notes: 'Demo PE target. Healthcare services platform. Upload CIM live during demo to show analysis workflow.',
      },
    })

    const targetClose2 = new Date()
    targetClose2.setMonth(targetClose2.getMonth() + 5)

    const phDeal = await prisma.deal.create({
      data: {
        userId: user.id,
        clientId: phClient.id,
        name: 'PrimeHealth Partners — Platform Acquisition',
        stage: 'SCREENING',
        priority: 'MEDIUM',
        sector: 'Healthcare Services',
        dealSize: '$185M revenue — EBITDA TBC (LOI stage)',
        targetClose: targetClose2,
        notes: 'Received CIM from Jefferies. Initial screening in progress. Upload CIM and run analysis to advance to DD stage.',
      },
    })

    // Document stub — for live upload demo
    await prisma.knowledgeDocument.create({
      data: {
        userId: user.id,
        clientId: phClient.id,
        dealId: phDeal.id,
        title: 'PrimeHealth Partners — Confidential Information Memorandum (2024)',
        mimeType: 'application/pdf',
        sourceType: 'UPLOAD',
        chunkCount: 0,
        syncStatus: 'PENDING',
        conflictNotes: '[DEMO — UPLOAD LIVE] Drop cim-primehealth.pdf from demo-data/ folder to trigger live CIM analysis.',
      },
    })

    console.log(`   ✓ Client: ${phClient.name} (${phClient.id})`)
    console.log(`   ✓ Deal: ${phDeal.name} (${phDeal.id}) — SCREENING stage`)
    console.log('   ✓ 1 pending document stub (upload CIM live to trigger analysis)')
  }

  // ────────────────────────────────────────────────────────────────────────────
  // DEAL 3 — Vertex Specialty Chemicals (shell — sourcing stage)
  // ────────────────────────────────────────────────────────────────────────────

  const existingVertex = await prisma.deal.findFirst({
    where: { userId: user.id, name: { contains: 'Vertex Specialty' } },
  })

  if (existingVertex) {
    console.log(`\n✅ Vertex Specialty Chemicals already exists (${existingVertex.id}) — skipping`)
  } else {
    console.log('\n🧪 Seeding Deal 3: Vertex Specialty Chemicals (SOURCING stage)...')

    const vertexClient = await prisma.client.create({
      data: {
        userId: user.id,
        name: 'Vertex Specialty Chemicals',
        industry: 'Specialty Chemicals (Industrials)',
        companySize: 1400,
        website: 'https://vertexchemicals.example.com',
        notes: 'Demo PE target. $320M carve-out from BASF. Early sourcing — no CIM yet. Industrial sector deal for pipeline diversity.',
      },
    })

    const targetClose3 = new Date()
    targetClose3.setMonth(targetClose3.getMonth() + 8)

    const vertexDeal = await prisma.deal.create({
      data: {
        userId: user.id,
        clientId: vertexClient.id,
        name: 'Vertex Specialty Chemicals — Carve-Out',
        stage: 'SOURCING',
        priority: 'LOW',
        sector: 'Specialty Chemicals / Industrials',
        dealSize: '$320M revenue — EV TBC (carve-out)',
        targetClose: targetClose3,
        notes: 'BASF carve-out of specialty coatings division. Early proprietary sourcing. No banker process yet. Long-lead opportunity.',
      },
    })

    console.log(`   ✓ Client: ${vertexClient.name} (${vertexClient.id})`)
    console.log(`   ✓ Deal: ${vertexDeal.name} (${vertexDeal.id}) — SOURCING stage`)
  }

  // Done
  console.log('\n' + '─'.repeat(60))
  console.log('✅ Demo deals seeded successfully!\n')
  console.log('🎯 Your demo pipeline:')
  console.log('   📊 Nexus DataOps        → IC_MEMO   (fully loaded, ready to present)')
  console.log('   🏥 PrimeHealth Partners → SCREENING (upload CIM live to demo analysis)')
  console.log('   🧪 Vertex Chemicals     → SOURCING  (pipeline depth, no CIM yet)')
  console.log()
  console.log('🔗 Open in AXIS:')
  console.log('   Pipeline:  http://localhost:3000/pipeline')
  console.log()

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('❌ Seeder failed:', err)
  prisma.$disconnect().catch(() => undefined)
  process.exit(1)
})
