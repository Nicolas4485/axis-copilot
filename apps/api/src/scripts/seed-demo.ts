/**
 * Demo Dataset Seeder — Phase 3A.3
 *
 * Creates a "Demo Corp" PE deal fully loaded with:
 *   - Client record
 *   - Deal at IC_MEMO stage (HIGH priority, Software/SaaS sector)
 *   - Pre-cached CIM Analysis result (AgentMemory SEMANTIC)
 *   - Pre-cached IC Memo with all 9 sections (AgentMemory SEMANTIC)
 *   - 6 realistic VDR document stubs (KnowledgeDocument)
 *   - PROCEDURAL agent memory with positive example
 *
 * Run:
 *   cd apps/api && npx tsx src/scripts/seed-demo.ts
 *
 * Safe to run multiple times — idempotent (checks for existing "Demo Corp" deal).
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ─── Demo Data ─────────────────────────────────────────────────

const COMPANY_NAME = 'NorthStar Software Corp'
const DEAL_NAME = 'Demo Corp — NorthStar Software'

const DEMO_DOC_ID = 'demo-doc-cim-001'

// ─── CIM Analysis Result ───────────────────────────────────────

function buildCimResult(dealId: string): object {
  return {
    documentId: DEMO_DOC_ID,
    dealId,
    durationMs: 18420,
    summary: 'NorthStar Software Corp is a high-quality vertical SaaS business with strong recurring revenue, defensible market position, and a seasoned management team. PROCEED recommended at 9–11x EBITDA.',

    companySnapshot: {
      name: COMPANY_NAME,
      hq: 'Austin, TX',
      founded: '2011',
      employees: '~210',
      revenue: '$28.4M',
      ebitda: '$8.2M',
      ebitdaMargin: '28.9%',
      revenueGrowthYoY: '22%',
      description:
        'NorthStar Software Corp provides cloud-based field service management software to mid-market HVAC, plumbing, and electrical contractors in North America. The platform automates scheduling, dispatch, invoicing, and customer communications for the trades industry.',
      businessModel: 'Subscription SaaS — annual contracts averaging $14,200 ARR per customer. Implementation + training fees add ~8% one-time revenue per new logo.',
      primaryMarket: 'Field Service Management (FSM) software for SMB/mid-market contractors — $4.2B TAM growing at 12% CAGR.',
      productsServices: [
        'NorthStar Core — scheduling, dispatch, customer portal',
        'NorthStar Finance — invoicing, payments, QuickBooks integration',
        'NorthStar Insights — operational analytics dashboard',
        'Mobile field app (iOS + Android)',
      ],
      keyCustomers: [
        'Apex HVAC Group (largest single customer, ~6% of ARR)',
        'Blue Ridge Plumbing Co.',
        'Sunbelt Electrical Services',
      ],
      customerConcentration: 'Top 10 customers represent 28% of ARR. Largest single customer: ~6%. Concentration is moderate — below typical 20% red-flag threshold on a per-customer basis.',
      managementTeam: [
        { name: 'James Whitfield', title: 'CEO & Co-Founder', tenure: '13 years' },
        { name: 'Sarah Chen', title: 'CTO & Co-Founder', tenure: '13 years' },
        { name: 'Marcus Webb', title: 'CFO', tenure: '4 years (ex-Salesforce Finance)' },
        { name: 'Priya Nair', title: 'VP Sales', tenure: '3 years' },
      ],
      keyRisks: [
        'Founder dependency — CEO + CTO hold key customer and product relationships',
        'No audited financials (reviewed only by Grant Thornton)',
        'SMB customer churn risk in economic downturn',
        'Competitive pressure from ServiceTitan ($9.5B valuation)',
      ],
      growthInitiatives: [
        'Expand into electrical and roofing verticals (FY25 roadmap)',
        'Launch Canada market Q3 2025',
        'Introduce AI-powered dispatch optimization (beta)',
        'Channel partner program with HVAC distributors',
      ],
      financials: [
        { year: '2022', revenue: '$19.1M', ebitda: '$4.8M', growth: undefined },
        { year: '2023', revenue: '$23.3M', ebitda: '$6.4M', growth: '+22%' },
        { year: '2024', revenue: '$28.4M', ebitda: '$8.2M', growth: '+22%' },
        { year: '2025E', revenue: '$34.5M', ebitda: '$10.4M', growth: '+22%' },
      ],
      auditedFinancials: false,
      askPrice: '$90M–$100M (seller guidance)',
      proposedEVEBITDA: 10.5,
      pageCount: 84,
    },

    fitScore: {
      businessQuality: 82,
      financialQuality: 74,
      managementStrength: 79,
      marketDynamics: 76,
      dealStructure: 68,
      overallFit: 76,
      rationale: {
        businessQuality:
          'Vertical SaaS with sticky workflows, 93% gross revenue retention, and expanding ARPU. Mission-critical for customers — hard to rip out once integrated with QuickBooks and customer CRM. Slight discount for limited product diversification.',
        financialQuality:
          'Consistent 22% top-line growth over 3 years with expanding EBITDA margins. Primary concern: reviewed not audited financials, and seller add-backs of ~$1.2M need independent verification in diligence.',
        managementStrength:
          'Strong founding team with deep domain expertise. CFO hire from Salesforce brings institutional credibility. Key risk is founder-CEO dependency — succession plan and retention package needed.',
        marketDynamics:
          'Growing TAM with favorable tailwinds (contractor digitization). ServiceTitan is the dominant competitor at the top of market; NorthStar differentiates on simplicity and price point for the mid-market tier.',
        dealStructure:
          'Asking valuation of 10.5–12.2x EBITDA is at the high end for this profile. Deal economics are borderline at 3x leverage; seller expects clean exit with no earnout — creates negotiation tension.',
      },
      recommendation: 'PROCEED',
      redFlags: [
        {
          flag: 'Unaudited financials — reviewed by Grant Thornton only',
          severity: 'MEDIUM',
          pageRef: 'p. 47',
        },
        {
          flag: 'EBITDA add-backs of $1.2M include CEO personal aircraft — requires normalization',
          severity: 'HIGH',
          pageRef: 'p. 52',
        },
        {
          flag: 'Founder (CEO + CTO) own 68% equity — key person risk on sale transition',
          severity: 'HIGH',
          pageRef: 'p. 12',
        },
        {
          flag: 'ServiceTitan entered mid-market with $299/mo offering in Q1 2024',
          severity: 'MEDIUM',
          pageRef: 'p. 34',
        },
      ],
    },

    redFlags: [
      {
        description: 'EBITDA add-backs include $1.2M in non-recurring items: CEO aircraft ($480K), one-time legal settlement ($350K), R&D credits ($370K). Adjusted EBITDA may be closer to $7.0M, implying 13x on clean earnings.',
        severity: 'HIGH',
        pageRef: 'p. 52–54',
      },
      {
        description: 'Financials are reviewed (not audited) by Grant Thornton. PE institutional lenders typically require audited statements — may require 1-year audit before close, adding 3–4 months to timeline.',
        severity: 'MEDIUM',
        pageRef: 'p. 47',
      },
      {
        description: 'CEO James Whitfield personally holds relationships with 3 of top 5 customers per CIM footnote. Retention mechanics unclear — customer churn risk post-close is elevated without a transition plan.',
        severity: 'HIGH',
        pageRef: 'p. 12, 61',
      },
      {
        description: 'No disclosed churn data for cohorts older than 2 years. 93% GRR is stated for "active customers" — definition of active not specified. Net Revenue Retention not disclosed.',
        severity: 'MEDIUM',
        pageRef: 'p. 38',
      },
    ],

    keyQuestions: [
      'Provide customer-level ARR waterfall for 2022–2024 showing new, expansion, and churned ARR',
      'What is the definition of "active customer" used for the 93% GRR figure? Provide cohort churn analysis',
      'Break down the $1.2M in EBITDA add-backs — which are genuinely non-recurring vs. ongoing owner perks?',
      'What is CEO James Whitfield\'s role post-close? Has he indicated he will stay? What retention equity/cash will he accept?',
      'Provide audited or Big-4 reviewed financial statements — current Grant Thornton review-level may not satisfy lender requirements',
      'What is the competitive win/loss ratio against ServiceTitan in FY2024? How many deals were lost to ServiceTitan?',
      'What is the current contracted ARR backlog and average contract length? Breakdown of month-to-month vs. annual?',
      'Provide software architecture overview — is the product cloud-native or hosted? AWS/GCP/Azure spend as % of revenue?',
    ],

    agentInsights: {
      alex: 'NorthStar is a textbook vertical SaaS story — domain-specific, mission-critical workflows, healthy margins for its size. The EBITDA add-backs are the most urgent diligence issue: if the aircraft and legal items are genuinely non-recurring, the 10.5x ask is defensible. If not, you\'re at 13x+ on clean earnings which puts this in "pass or negotiate hard" territory. I\'d approve proceeding to Phase 2 diligence contingent on: (1) audit of add-backs by our accounting advisor, (2) CEO retention term sheet in principle, and (3) customer reference calls without seller present. The ServiceTitan competitive risk is real but manageable — NorthStar\'s simplicity and price point serve a segment ServiceTitan actively ignores.',
    },

    conflicts: [],
  }
}

// ─── IC Memo ───────────────────────────────────────────────────

function buildMemoResult(dealId: string): object {
  return {
    type: 'ic_memo',
    dealId,
    companyName: COMPANY_NAME,
    version: 1,
    generatedAt: new Date().toISOString(),
    durationMs: 94210,
    sections: [
      {
        id: 'executive_summary',
        title: 'Executive Summary',
        generatedAt: new Date().toISOString(),
        content: `**Company:** NorthStar Software Corp | **Sector:** Vertical SaaS — Field Service Management | **HQ:** Austin, TX

**Transaction:** Acquisition of 100% equity from founders. Asking price $90–100M (10.5–12.2x 2024 EBITDA of $8.2M). Sponsor guidance: close Q3 2025.

**Recommendation: PROCEED to Phase 2 Diligence**

NorthStar Software Corp is a high-quality vertical SaaS business serving mid-market contractors in the trades industry (HVAC, plumbing, electrical). With $28.4M ARR growing at 22% YoY, 28.9% EBITDA margins, and 93% gross revenue retention, the business demonstrates the durability characteristics favored in our software thesis. The primary risks are EBITDA add-back normalization ($1.2M under review), unaudited financials, and founder key-person dependency — all addressable in diligence. At a negotiated 9–10x clean EBITDA, this deal meets our return criteria.`,
      },
      {
        id: 'company_overview',
        title: 'Company Overview',
        generatedAt: new Date().toISOString(),
        content: `NorthStar Software Corp was founded in 2011 by James Whitfield (CEO) and Sarah Chen (CTO) to digitize the field operations of trades contractors — a segment historically underserved by enterprise software vendors.

**Business Model:** Subscription SaaS with annual contracts averaging $14,200 ARR per customer. Implementation and training fees add approximately 8% one-time revenue per new logo. Payment terms are annual upfront, which supports strong cash conversion.

**Key Facts:**
- Founded: 2011, Austin TX
- Employees: ~210 (as of Dec 2024)
- Customers: ~2,000 active subscribers
- ARR: $28.4M (FY2024)
- Platform: Cloud-native, hosted on AWS

**Products & Services:**
- *NorthStar Core* — scheduling, dispatch, customer portal, mobile field app (iOS/Android)
- *NorthStar Finance* — invoicing, payment processing, QuickBooks/Xero integration
- *NorthStar Insights* — operational analytics and KPI dashboards

**Customer Base:** Mid-market contractors with 10–200 technicians. Top verticals: HVAC (52%), plumbing (28%), electrical (15%), other (5%). Geographic concentration in Sunbelt states (TX, FL, AZ, GA).`,
      },
      {
        id: 'market_analysis',
        title: 'Market Analysis',
        generatedAt: new Date().toISOString(),
        content: `**Total Addressable Market:** The global Field Service Management software market is estimated at $4.2B in 2024, growing at 12% CAGR through 2029 (source: MarketsandMarkets). The North American segment represents approximately $2.1B. NorthStar's current penetration of its addressable mid-market segment is estimated at under 2%, indicating significant runway.

**Market Drivers:**
- Aging workforce in trades driving adoption of scheduling automation
- Rising labor costs increasing operational efficiency imperative
- Post-COVID customer expectation reset: real-time technician tracking, digital invoicing
- Insurance and compliance requirements driving digital record-keeping

**Competitive Landscape:**

| Competitor | Market Position | Pricing | Weakness |
|---|---|---|---|
| ServiceTitan | Enterprise leader ($9.5B val.) | $398+/mo | Complex, expensive for mid-market |
| Jobber | SMB leader | $69–349/mo | Limited dispatch, no analytics |
| FieldEdge | Mid-market | $150–300/mo | Dated UX, weak mobile app |
| NorthStar | Mid-market (this company) | $99–250/mo | — |

**NorthStar's Positioning:** Targets the gap between Jobber (too simple) and ServiceTitan (too complex) for contractors with 10–200 technicians. Wins on ease of implementation (avg. go-live in 3 weeks vs. 12+ weeks for ServiceTitan), customer support, and price point. Key risk: ServiceTitan launched a mid-market offering at $299/mo in Q1 2024 — win/loss data versus this offering should be requested in diligence.`,
      },
      {
        id: 'financial_analysis',
        title: 'Financial Analysis',
        generatedAt: new Date().toISOString(),
        content: `**⚠ Note: Financials are reviewed (not audited) by Grant Thornton. Audited statements or Big-4 quality-of-earnings report should be required as a condition of LOI.**

**Income Statement Summary (FY2022–FY2025E):**

| Metric | FY2022 | FY2023 | FY2024 | FY2025E |
|---|---|---|---|---|
| ARR | $19.1M | $23.3M | $28.4M | $34.5M |
| YoY Growth | — | +22% | +22% | +22% |
| Gross Profit | $14.9M | $18.8M | $23.5M | $29.0M |
| Gross Margin | 78% | 81% | 83% | 84% |
| EBITDA (stated) | $4.8M | $6.4M | $8.2M | $10.4M |
| EBITDA Margin | 25% | 27% | 29% | 30% |

**EBITDA Add-Back Analysis (FY2024 — $1.2M total):**
- CEO personal aircraft lease: $480K ⚠ *Non-standard — verify aircraft use is genuinely company-only*
- One-time legal settlement (IP dispute): $350K ✓ *Appears non-recurring*
- R&D tax credits (booked as income): $370K ⚠ *Recurring benefit, may not be a true add-back*

**Normalized EBITDA estimate:** $7.0–7.8M depending on resolution of aircraft and R&D credit treatment.

**Key Ratios (FY2024):**
- Rule of 40: 22% growth + 29% EBITDA margin = **51** ✓ (Strong)
- ARR/Employee: $135K (in-line with peer SaaS at this scale)
- Gross Revenue Retention: 93% (stated — cohort data not provided)`,
      },
      {
        id: 'investment_thesis',
        title: 'Investment Thesis',
        generatedAt: new Date().toISOString(),
        content: `We believe NorthStar Software Corp represents a compelling vertical SaaS investment opportunity for the following reasons:

**1. Mission-critical, sticky workflows create durable revenue**
NorthStar is deeply embedded in daily field operations: dispatch, invoicing, and customer communications all flow through the platform. Once a contractor integrates NorthStar with their accounting system and customer base, switching costs are high. 93% GRR reflects this dynamic. We believe there is a path to 95%+ NRR with expanded product adoption.

**2. Underserved mid-market with a clear right to win**
The $500M–$2B contract revenue segment of trades contractors remains underserved by both Jobber (feature-limited) and ServiceTitan (cost-prohibitive). NorthStar's 3-week implementation and $150/mo average price point is structurally differentiated for this buyer.

**3. Multiple near-term growth levers not yet monetized**
- Electrical and roofing verticals addressable with minimal product investment
- Canada launch (same language/compliance framework) adds ~25% to TAM
- AI dispatch optimization feature in beta could drive ARPU expansion of $30–50/month per account
- Channel partnerships with HVAC distributors (e.g., Watsco, Ferguson) not yet activated

**4. Margin expansion path is visible**
Gross margin has expanded from 78% to 83% in 3 years as infrastructure costs scale. At $50M ARR, gross margins of 85%+ and EBITDA margins of 35%+ are achievable with moderate headcount discipline.

**5. PE-ready management team with credible CFO**
The FY2021 hire of Marcus Webb (ex-Salesforce Finance) signals founder awareness of institutional readiness. Webb has implemented SaaS metrics reporting, ARR waterfall, and board-ready financial packages.`,
      },
      {
        id: 'key_risks',
        title: 'Key Risks',
        generatedAt: new Date().toISOString(),
        content: `| Risk | Severity | Description | Mitigation |
|---|---|---|---|
| EBITDA add-back normalization | HIGH | $1.2M in add-backs includes CEO aircraft ($480K) and R&D credits ($370K) that may not be fully non-recurring. Normalized EBITDA could be $7.0M vs. stated $8.2M — changes valuation meaningfully | Commission Big-4 quality-of-earnings report as LOI condition; adjust bid accordingly |
| Founder / key-person dependency | HIGH | CEO Whitfield personally manages 3 of top 5 customers. CTO Chen owns critical architecture knowledge. No documented succession plan | Require 3-year management retention package with rollover equity and performance vesting; customer introduction protocol pre-close |
| Unaudited financials | MEDIUM | Grant Thornton review-level only. Institutional lenders (RCF + term loan) typically require audited statements — may extend timeline 3–4 months | Negotiate audit as condition of exclusivity; or price gap into valuation |
| ServiceTitan competitive incursion | MEDIUM | ServiceTitan launched $299/mo mid-market SKU in Q1 2024. Win/loss ratio against this offering unknown | Request competitive win/loss log for H1 2024; spot-check 5 churned accounts in diligence |
| SMB customer concentration (sector) | MEDIUM | 2,000 customers in a single industry (trades contractors). A sector-specific downturn (construction recession, interest rate impact on home improvement) hits entire base | Validate customer revenue diversification by geography and contractor end-market |
| Technology debt | LOW | Platform is 13 years old at core. Mobile app rebuilt in 2022 but backend on monolithic architecture | Technical diligence required; assess migration roadmap cost and timeline |`,
      },
      {
        id: 'management_assessment',
        title: 'Management Assessment',
        generatedAt: new Date().toISOString(),
        content: `**James Whitfield — CEO & Co-Founder (13 years)**
Deep domain expertise in trades contractor operations — founded company after running a family HVAC business. Highly respected by customers; multiple references will need to be checked without seller present. LinkedIn: 3 prior board seats, including one exit (Fieldpoint Service Apps — acquired by IFS, 2018). Primary concern: role post-close unclear. Requires structured retention conversation early in diligence.

**Sarah Chen — CTO & Co-Founder (13 years)**
Architect of the core platform. Background: UT Austin CS, prior roles at Dell and SolarWinds. Holds all key engineering relationships. Publicly active in Austin tech community. Less customer-facing than Whitfield — retention risk is lower but technical diligence must include Chen interviews to assess her commitment to post-close roadmap.

**Marcus Webb — CFO (4 years)**
Former Salesforce Finance (VP FP&A). Brought institutional metrics discipline to NorthStar — implemented ARR tracking, gross retention analysis, and board-ready reporting in FY2022. Strong reference candidate. Likely to be supportive of a PE transaction.

**Priya Nair — VP Sales (3 years)**
Owns inbound and outbound pipeline. Background in SaaS sales (Buildium, AppFolio — adjacent verticals). Has scaled AE headcount from 4 to 12 under her tenure. Rep productivity and quota attainment data should be requested.

**Overall Assessment:** Management team is above average for a company at this stage. CFO quality is a genuine differentiator vs. comparable deals. Founder-CEO retention is the single most important management diligence item — the deal should not proceed without a credible retention structure in place.

*⚠ [DATA NEEDED: Independent reference calls with 3–5 senior NorthStar customers and 2 former employees — to be completed in Phase 2 diligence]*`,
      },
      {
        id: 'deal_structure',
        title: 'Deal Structure & Returns',
        generatedAt: new Date().toISOString(),
        content: `**Proposed Structure:** 100% equity acquisition. Founders seeking clean exit with no earnout. Management team will rollover 15% equity at close (Webb confirmed, Whitfield TBD).

**Valuation:**

| Scenario | EBITDA | Multiple | Enterprise Value | Equity (3.5x lev.) |
|---|---|---|---|---|
| Base (stated) | $8.2M | 10.5x | $86M | ~$57M |
| Negotiated (normalized) | $7.4M | 10.0x | $74M | ~$45M |
| Bear (audit reveals gaps) | $6.5M | 9.0x | $58M | ~$29M |

**Return Model (Base Case — 5 year hold, 2x EBITDA growth to $16.4M):**
- Exit at 11x EBITDA = $180M EV
- Gross MOIC: **~3.0x** | IRR: **~25%**
- Exceeds Fund IV hurdle of 2.5x / 22% IRR ✓

**Financing:** Targeting 3.5x leverage ($26M senior term loan + $5M RCF). Debt service requires ~$3.5M/year — comfortably covered at current EBITDA. SaaS lender market (Golub, Owl Rock) active in this profile.

**Key Structuring Points:**
- LOI price: $74–80M (negotiated on normalized EBITDA)
- Conditions: Big-4 QoE, audited financials FY2023–24, management retention term sheet
- Exclusivity: 60 days from LOI
- Earnout: Sellers have indicated resistance — not recommended to pursue

*⚠ [DATA NEEDED: Final leverage capacity confirmation from financing bank post-QoE; updated return model with audited FY2024 actuals]*`,
      },
      {
        id: 'next_steps',
        title: 'Next Steps & Diligence Plan',
        generatedAt: new Date().toISOString(),
        content: `**IC Decision Required:** Approve proceeding to Phase 2 diligence with a target LOI at $74–80M.

**Immediate Actions (Week 1–2):**
1. Submit non-binding LOI at $74M with price anchored to normalized EBITDA of $7.4M
2. Execute NDA with seller's M&A counsel (William Blair is running the process)
3. Engage Big-4 accounting firm for Quality of Earnings report — target 6-week turnaround
4. Initiate legal diligence on IP ownership (Sarah Chen is named inventor on 3 patents)

**Phase 2 Diligence Workstreams:**

| Workstream | Owner | Timeline | Key Deliverable |
|---|---|---|---|
| Financial / QoE | Big-4 + CFO | Weeks 1–6 | Normalized EBITDA, add-back resolution, audit scope |
| Commercial | Deal team | Weeks 2–5 | Customer reference calls, win/loss analysis, churn cohorts |
| Technology | External CTO advisor | Weeks 3–6 | Architecture assessment, tech debt quantification |
| Management retention | Deal partner + CEO | Weeks 1–3 | Retention term sheet (equity rollover %, cash stay bonus) |
| Legal / IP | Outside counsel | Weeks 2–6 | Clean IP chain, no material litigation |
| Financing | Financing team | Weeks 3–6 | Signed debt commitments, final leverage structure |

**Go / No-Go Gate:** IC reconvenes at Week 7 with QoE results, customer reference summary, and management retention status. Decision: proceed to final bid or walk.

**Current Status:** Seller running a limited process (4 sponsors). Indicative bids due May 15, 2025. We are in round 1 — time-sensitive.`,
      },
    ],
  }
}

// ─── Demo documents ────────────────────────────────────────────

const DEMO_DOCUMENTS = [
  {
    title: 'NorthStar Software — Confidential Information Memorandum (2024)',
    mimeType: 'application/pdf',
    sourceType: 'UPLOAD' as const,
    chunkCount: 142,
    note: 'Primary CIM — 84 pages. Provided by William Blair under NDA.',
  },
  {
    title: 'FY2024 Financial Statements (Grant Thornton Review Report)',
    mimeType: 'application/pdf',
    sourceType: 'UPLOAD' as const,
    chunkCount: 38,
    note: 'Review-level only. Big-4 audit required as LOI condition.',
  },
  {
    title: 'NorthStar — ARR Bridge FY2022–FY2024',
    mimeType: 'application/pdf',
    sourceType: 'UPLOAD' as const,
    chunkCount: 12,
    note: 'Seller-prepared waterfall. Cohort-level churn not included.',
  },
  {
    title: 'Management Org Chart & Bios (Dec 2024)',
    mimeType: 'application/pdf',
    sourceType: 'UPLOAD' as const,
    chunkCount: 8,
    note: 'Includes LinkedIn profiles for C-suite and VP-level.',
  },
  {
    title: 'Product Demo Walkthrough — NorthStar Core + Finance',
    mimeType: 'application/pdf',
    sourceType: 'UPLOAD' as const,
    chunkCount: 24,
    note: 'Slide deck from seller management presentation, Dec 2024.',
  },
  {
    title: 'Competitive Landscape Analysis — FSM Software (William Blair)',
    mimeType: 'application/pdf',
    sourceType: 'UPLOAD' as const,
    chunkCount: 31,
    note: 'Banker-prepared market analysis. Covers ServiceTitan, Jobber, FieldEdge.',
  },
]

// ─── Main seeder ───────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱 AXIS Demo Dataset Seeder — starting...\n')

  // 1. Find the user — prefer EMAIL env var, then most recently created user
  //    (most-recently-created avoids grabbing seed/test accounts added before the real user)
  const targetEmail = process.env['SEED_USER_EMAIL'] ?? process.env['ADMIN_EMAIL']
  const user = targetEmail
    ? await prisma.user.findFirst({ where: { email: targetEmail } })
    : await prisma.user.findFirst({ orderBy: { createdAt: 'desc' } })

  if (!user) {
    console.error('❌ No users found. Start the API in dev mode first (pnpm dev) so the user is auto-created.')
    if (targetEmail) console.error(`   (Looked for email: ${targetEmail})`)
    process.exit(1)
  }
  console.log(`👤 Using user: ${user.email} (${user.id})`)

  // 2. Idempotency check
  const existingDeal = await prisma.deal.findFirst({
    where: { userId: user.id, name: { contains: 'Demo Corp' } },
    include: { client: true },
  })

  if (existingDeal) {
    console.log(`\n✅ Demo deal already exists: "${existingDeal.name}" (${existingDeal.id})`)
    console.log('   To re-seed, delete this deal from the Pipeline page first.')
    console.log(`\n🔗 Open: http://localhost:3000/deals/${existingDeal.id}`)
    await prisma.$disconnect()
    return
  }

  // 3. Create Demo Corp client
  console.log('\n📁 Creating Demo Corp client...')
  const client = await prisma.client.create({
    data: {
      userId: user.id,
      name: 'Demo Corp (NorthStar)',
      industry: 'Software / SaaS',
      companySize: 210,
      website: 'https://northstar-software.example.com',
      notes: 'Demo PE target for investor presentations. Do not use real data.',
    },
  })
  console.log(`   ✓ Client: ${client.name} (${client.id})`)

  // 4. Create deal
  console.log('\n🏦 Creating deal at IC_MEMO stage...')
  const targetClose = new Date()
  targetClose.setMonth(targetClose.getMonth() + 3)

  const deal = await prisma.deal.create({
    data: {
      userId: user.id,
      clientId: client.id,
      name: DEAL_NAME,
      stage: 'IC_MEMO',
      priority: 'HIGH',
      sector: 'Software / SaaS',
      dealSize: '$74M–$80M (LOI target)',
      targetClose,
      notes: 'Demo deal. Pre-seeded with CIM analysis and IC memo. Seller process run by William Blair. LOI deadline May 15, 2025.',
    },
  })
  console.log(`   ✓ Deal: ${deal.name} (${deal.id}) — stage IC_MEMO`)

  // 5. Create VDR document stubs
  console.log('\n📄 Creating VDR document stubs...')
  let docId = DEMO_DOC_ID
  for (const [i, doc] of DEMO_DOCUMENTS.entries()) {
    const created = await prisma.knowledgeDocument.create({
      data: {
        userId: user.id,
        clientId: client.id,
        dealId: deal.id,
        title: doc.title,
        mimeType: doc.mimeType,
        sourceType: doc.sourceType,
        chunkCount: doc.chunkCount,
        syncStatus: 'INDEXED',
        conflictNotes: `[DEMO STUB] ${doc.note}`,
      },
    })
    if (i === 0) docId = created.id
    console.log(`   ✓ ${doc.title.slice(0, 60)}… (${created.id})`)
  }

  // 6. Seed pre-cached CIM analysis
  console.log('\n🔬 Seeding CIM analysis result...')
  const cimResult = buildCimResult(deal.id)
  const cimPatch = { ...cimResult, documentId: docId }
  await prisma.agentMemory.create({
    data: {
      userId: user.id,
      clientId: client.id,
      memoryType: 'SEMANTIC',
      content: JSON.stringify({ ...cimPatch, summary: (cimResult as Record<string, unknown>)['summary'] }),
      tags: [deal.id, docId, 'cim_analysis', COMPANY_NAME],
    },
  })
  console.log('   ✓ CIM analysis cached (AgentMemory SEMANTIC)')

  // 7. Seed pre-cached IC Memo
  console.log('\n📝 Seeding IC Memo (9 sections)...')
  const memoResult = buildMemoResult(deal.id)
  await prisma.agentMemory.create({
    data: {
      userId: user.id,
      clientId: client.id,
      memoryType: 'SEMANTIC',
      content: JSON.stringify(memoResult),
      tags: [deal.id, 'ic_memo', COMPANY_NAME],
    },
  })
  console.log('   ✓ IC Memo cached (AgentMemory SEMANTIC, 9 sections)')

  // 8. Seed a positive PROCEDURAL example (primes correction feedback loop)
  console.log('\n🧠 Seeding PROCEDURAL memory (positive example)...')
  await prisma.agentMemory.create({
    data: {
      userId: user.id,
      clientId: null, // cross-client
      memoryType: 'PROCEDURAL',
      content: `POSITIVE EXAMPLE [AGENT_DUE_DILIGENCE/executive_summary]:
Nicolas reviewed the executive summary for NorthStar Software Corp and rated it Excellent.
Replicate this quality and style for future IC memo executive summaries:

- Opens with company name, sector, geography, and financials in the first line
- States recommendation (PASS/PROCEED/STRONG_PROCEED) clearly in bold
- Explains the recommendation in 1–2 sentences, naming the primary risk
- Keeps it under 6 sentences total — IC members read dozens of these
- Uses "Recommendation: PROCEED" not "We recommend proceeding" — directness is respected`,
      tags: ['AGENT_DUE_DILIGENCE', 'executive_summary', 'positive_example'],
    },
  })
  console.log('   ✓ PROCEDURAL memory seeded')

  // 9. Create a session linked to the deal
  console.log('\n💬 Creating demo analysis session...')
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      clientId: client.id,
      dealId: deal.id,
      title: 'NorthStar — Initial CIM Review',
      mode: 'analysis',
      status: 'ACTIVE',
    },
  })

  // Seed a couple of realistic messages
  await prisma.message.createMany({
    data: [
      {
        sessionId: session.id,
        role: 'USER',
        content: 'Alex, I just uploaded the NorthStar CIM. What\'s your initial read?',
        mode: 'analysis',
        metadata: {},
      },
      {
        sessionId: session.id,
        role: 'ASSISTANT',
        content: 'I\'ve completed the initial analysis of the NorthStar Software CIM. This is a well-constructed vertical SaaS business — 22% ARR growth, 29% EBITDA margins, Rule of 40 score of 51. The story checks out at the headline level.\n\nMy main concern before I\'d recommend proceeding: the EBITDA add-backs. The CEO\'s aircraft lease ($480K) and the R&D credits ($370K) together represent 15% of stated EBITDA. If those normalize differently than claimed, you\'re looking at 12–13x on clean earnings rather than 10.5x — which changes the math significantly.\n\nThe other flag is the unaudited financials — Grant Thornton review-level won\'t satisfy your lenders. I\'d treat a Big-4 QoE as a hard condition of LOI, not a nice-to-have.\n\nOverall read: PROCEED to Phase 2 diligence, but anchor the LOI price to normalized EBITDA of $7.4M. Want me to generate the full IC Memo?',
        mode: 'analysis',
        metadata: {
          agentKey: 'AGENT_DUE_DILIGENCE',
          model: 'claude-sonnet-4-5',
        },
      },
    ],
  })
  console.log(`   ✓ Session created with 2 demo messages (${session.id})`)

  // Done
  console.log('\n' + '─'.repeat(60))
  console.log('✅ Demo dataset seeded successfully!\n')
  console.log('📊 Summary:')
  console.log(`   Client:   ${client.name} (${client.id})`)
  console.log(`   Deal:     ${deal.name} (${deal.id})`)
  console.log(`   Stage:    IC_MEMO | Priority: HIGH`)
  console.log(`   Docs:     ${DEMO_DOCUMENTS.length} VDR documents`)
  console.log(`   Cached:   CIM Analysis + IC Memo (9 sections)`)
  console.log(`   Memory:   1 PROCEDURAL positive example`)
  console.log()
  console.log('🔗 Open in AXIS:')
  console.log(`   Pipeline:  http://localhost:3000/pipeline`)
  console.log(`   Deal:      http://localhost:3000/deals/${deal.id}`)
  console.log(`   Session:   http://localhost:3000/session/${session.id}`)
  console.log()

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('❌ Seeder failed:', err)
  prisma.$disconnect().catch(() => undefined)
  process.exit(1)
})
