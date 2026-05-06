// Sector Knowledge Base — PE market benchmarks for mid-market deals ($1B–$10B AUM)
// Data: 2024/2025 transaction multiples, public comps, and benchmark operating metrics.
// Source: Pitchbook, S&P Capital IQ, GS/MS deal research (illustrative for demo purposes).
//
// Used by CIM analyst to contextualise deal multiples and flag relative valuation.

export interface SectorBenchmark {
  sector:      string
  aliases:     string[]          // alternative names that map to this sector
  evEbitda: {
    low:    number               // 25th percentile transaction multiple
    median: number               // median
    high:   number               // 75th percentile (premium assets)
  }
  evRevenue: {
    low:    number
    median: number
    high:   number
  }
  revenueGrowth: {
    below:  number               // weak growth threshold %
    median: number
    above:  number               // strong growth threshold %
  }
  ebitdaMargin: {
    below:  number               // weak margin threshold %
    median: number
    above:  number               // strong margin threshold %
  }
  grossMargin: {
    below:  number
    median: number
    above:  number
  }
  /** LBO-specific parameters for returns analysis */
  lboMetrics: {
    typicalLeverage: string      // e.g. "4.0x–5.5x Net Debt/EBITDA"
    leverageCeiling: number      // max turns of EBITDA debt at close
    targetIRR: string           // e.g. "20%–25%"
    targetMOIC: string          // e.g. "2.5x–3.5x"
    typicalHoldYears: number    // median hold period
    fcfConversion: string       // expected EBITDA-to-FCF conversion rate
    debtInstruments: string[]   // typical instruments used
    exitPathPrimary: string     // most common exit route
  }
  /** Dimension weights for fit scoring — must sum to 1.0 */
  fitScoreWeights: {
    businessQuality: number    // moat, pricing power, product differentiation
    financialQuality: number   // margin quality, FCF, revenue composition, retention metrics
    managementStrength: number // team depth, track record, founder dependency, succession
    marketDynamics: number     // TAM, growth, competitive intensity, secular trends
    dealStructure: number      // entry multiple, leverage, covenants, pricing vs. comps
  }
  publicComps:   string[]        // representative public companies
  precedentTransactions: string[] // notable comparable transactions
  keyValueDrivers: string[]      // what creates premium multiples in this sector
  redFlags:      string[]        // common DD pitfalls
  notes:         string          // qualitative context
}

// ─── Benchmark data ───────────────────────────────────────────────────────────

const BENCHMARKS: SectorBenchmark[] = [
  {
    sector: 'Vertical SaaS',
    aliases: ['vertical saas', 'software', 'saas', 'field service management',
              'construction software', 'healthcare software', 'proptech', 'legaltech',
              'insurtech', 'agtech', 'govtech', 'fintech software'],
    evEbitda:      { low: 14, median: 19, high: 28 },
    evRevenue:     { low: 4,  median: 7,  high: 12  },
    revenueGrowth: { below: 10, median: 18, above: 30 },
    ebitdaMargin:  { below: 15, median: 23, above: 35 },
    grossMargin:   { below: 60, median: 72, above: 82 },
    lboMetrics: {
      typicalLeverage: '4.5x–6.0x Net Debt/EBITDA',
      leverageCeiling: 6.0,
      targetIRR: '20%–28%',
      targetMOIC: '2.5x–4.0x',
      typicalHoldYears: 5,
      fcfConversion: '55%–75% (high R&D and S&M spend limits FCF vs. EBITDA)',
      debtInstruments: ['Senior Secured TLB', 'Revolving Credit Facility', 'Unitranche (smaller deals)'],
      exitPathPrimary: 'Strategic M&A (large-cap tech acquirer) or secondary buyout; IPO for Rule of 40 assets',
    },
    fitScoreWeights: { businessQuality: 0.25, financialQuality: 0.35, managementStrength: 0.15, marketDynamics: 0.15, dealStructure: 0.10 },
    publicComps: [
      'Veeva Systems (VEEV)', 'Procore (PCOR)', 'Guidewire (GWRE)',
      'Paycom (PAYC)', 'Tyler Technologies (TYL)', 'nCino (NCNO)',
    ],
    precedentTransactions: [
      'Datto → Kaseya (Vista/TPG): ~7.0x ARR, $6.2B (2022)',
      'Zendesk → Permira/Hellman & Friedman: ~7.3x NTM Revenue, $10.2B (2022)',
      'Qualtrics → Silver Lake/CPP: ~6.0x NTM Revenue, $12.5B (2023)',
      'Avalara → Vista: ~10.5x NTM Revenue, $8.4B (2022)',
      'Ping Identity → Thoma Bravo: ~7.3x NTM Revenue, $2.8B (2022)',
    ],
    keyValueDrivers: [
      'Net revenue retention (NRR) >110% indicates strong expansion — commands significant multiple premium',
      'CAC payback <18 months signals efficient GTM motion and capital-light growth',
      'Mission-critical workflows with high switching costs (data migration risk, workflow disruption)',
      'Gross margin >75% enables Rule of 40 targets and strong FCF at scale',
      'Land-and-expand motion with clear platform upsell opportunity across product tiers',
      'Multi-year contracts with auto-renewal clauses create revenue visibility and reduced churn risk',
    ],
    redFlags: [
      'NRR below 100% suggests product-market fit issues or sustained competitive pressure — investigate root cause',
      'Customer concentration >20% in top customer: model churn scenario explicitly',
      'Legacy on-prem revenue mixed into ARR reporting = revenue quality concern, requires QoE normalization',
      'High founder/key-person sales dependency pre-exit: CRO hire should be Day 1 requirement',
      'Unaudited revenue or non-GAAP EBITDA add-backs >15% of reported: demand audited statements pre-LOI',
      'ARR growth deceleration >10pp YoY without clear explanation signals market saturation or competitive loss',
    ],
    notes: 'Vertical SaaS premiums driven by defensibility of niche workflows and switching cost moat. ' +
           'Mid-market sponsors typically target 2.5–3.5x MOIC on a 5-year hold with bolt-on M&A as primary value driver. ' +
           'Rule of 40 (Revenue Growth % + EBITDA Margin %) is the key profitability metric; assets >40 command premium multiples.',
  },
  {
    sector: 'Healthcare IT',
    aliases: ['healthcare it', 'health tech', 'healthtech', 'health information technology',
              'emr', 'ehr', 'revenue cycle management', 'rcm', 'population health',
              'pharmacy software', 'clinical decision support'],
    evEbitda:      { low: 13, median: 17, high: 24 },
    evRevenue:     { low: 3,  median: 5.5, high: 9 },
    revenueGrowth: { below: 8, median: 14, above: 22 },
    ebitdaMargin:  { below: 18, median: 26, above: 38 },
    grossMargin:   { below: 55, median: 68, above: 80 },
    lboMetrics: {
      typicalLeverage: '4.0x–5.5x Net Debt/EBITDA',
      leverageCeiling: 5.5,
      targetIRR: '18%–25%',
      targetMOIC: '2.5x–3.5x',
      typicalHoldYears: 5,
      fcfConversion: '60%–80% (compliance investment limits near-term FCF)',
      debtInstruments: ['Senior Secured TLB', 'Revolving Credit Facility'],
      exitPathPrimary: 'Strategic sale to larger health system, EHR vendor, or large Health IT platform',
    },
    fitScoreWeights: { businessQuality: 0.25, financialQuality: 0.30, managementStrength: 0.15, marketDynamics: 0.20, dealStructure: 0.10 },
    publicComps: [
      'Epic Systems (private)', 'Veeva Systems (VEEV)', 'Phreesia (PHR)',
      'Health Catalyst (HCAT)', 'Evolent Health (EVH)', 'Privia Health (PRVA)',
    ],
    precedentTransactions: [
      'Greenway Health → Vista Equity Partners: ~5.5x Revenue (2018)',
      'Netsmart Technologies → GI Partners/TA: ~8x EBITDA (2016, 2021)',
      'PointClickCare → Dragoneer (secondary): ~8x+ Revenue (2020)',
      'Waystar → EQT: ~10x Revenue (2019)',
    ],
    keyValueDrivers: [
      'Regulatory compliance requirements create durable moat (HIPAA, HL7, FHIR, ONC certification)',
      'Long sales cycles (12–24 months) but extreme switching costs once embedded in clinical workflow',
      'Value-based care transition driving sustained demand for analytics, RCM, and population health',
      'Government reimbursement tailwinds (Medicare Advantage growth, Medicaid managed care expansion)',
    ],
    redFlags: [
      'Reimbursement policy dependency — single payer >30% of revenue requires scenario modeling',
      'HIPAA/data security incidents in diligence history: demand independent security assessment',
      'Customer churn from hospital M&A (acquirer standardises on incumbent platform — quantify exposure)',
      'CMS/ONC regulatory changes can require costly product development: assess compliance roadmap cost',
    ],
    notes: 'Healthcare IT commands premium for mission-critical workflows embedded in clinical operations. ' +
           'Compliance moat is real but regulatory change risk (CMS, ONC) must be scenario-modeled. ' +
           'M&A within health systems is both a growth driver and a churn risk.',
  },
  {
    sector: 'Business Services',
    aliases: ['business services', 'bpo', 'outsourcing', 'managed services',
              'staffing', 'professional services', 'consulting', 'data services',
              'marketing services', 'facilities management'],
    evEbitda:      { low: 8,  median: 11, high: 16 },
    evRevenue:     { low: 0.8, median: 1.5, high: 2.5 },
    revenueGrowth: { below: 3, median: 7, above: 15 },
    ebitdaMargin:  { below: 10, median: 16, above: 24 },
    grossMargin:   { below: 25, median: 38, above: 55 },
    lboMetrics: {
      typicalLeverage: '3.5x–5.0x Net Debt/EBITDA',
      leverageCeiling: 5.0,
      targetIRR: '18%–23%',
      targetMOIC: '2.0x–3.0x',
      typicalHoldYears: 5,
      fcfConversion: '70%–85% (low CapEx intensity, working capital manageable)',
      debtInstruments: ['Senior Secured TLB', 'Revolving Credit Facility', 'Unitranche for <$100M EBITDA'],
      exitPathPrimary: 'Strategic sale to larger BPO/outsourcing platform or secondary PE buyout',
    },
    fitScoreWeights: { businessQuality: 0.25, financialQuality: 0.25, managementStrength: 0.25, marketDynamics: 0.10, dealStructure: 0.15 },
    publicComps: [
      'Conduent (CNDT)', 'ICF International (ICFI)', 'CACI International (CACI)',
      'ManpowerGroup (MAN)', 'Science Applications International (SAIC)',
    ],
    precedentTransactions: [
      'Accenture Federal Services → SAIC: ~14x EBITDA, $2.1B (2018)',
      'KEYW Holding → Jacobs Engineering: ~14x EBITDA, $815M (2019)',
      'DXC Technology services carve-outs: 6–9x EBITDA (various 2021–2023)',
    ],
    keyValueDrivers: [
      'Long-term contracts (3–5 years) with government/enterprise clients = high revenue visibility',
      'Proprietary data assets or specialized expertise create pricing power and defensibility',
      'Margin expansion via AI/automation uplift: 200–400bps EBITDA margin opportunity on labor-heavy workflows',
      'Platform consolidation of fragmented subscale peers drives scale economics and cross-sell',
    ],
    redFlags: [
      'T&M billing >60% of revenue: fixed-fee conversion required to justify premium multiple',
      'Key-person dependency in billable delivery: quantify revenue at risk if top 3 producers leave',
      'Government contract re-compete cycles: require disclosure of all contracts up for renewal in hold period',
      'EBITDA margin <12% limits debt capacity and constrains LBO returns below target threshold',
    ],
    notes: 'Business services multiples expanding as technology-enablement drives EBITDA re-rating. ' +
           'AI automation thesis is driving sponsor interest — quantify the margin expansion roadmap specifically. ' +
           'Distinguish between labor-intensive services (lower multiple) and IP/data-driven services (higher multiple).',
  },
  {
    sector: 'Industrial & Manufacturing',
    aliases: ['industrial', 'manufacturing', 'engineered products', 'aerospace',
              'defense', 'automation', 'robotics', 'specialty chemicals',
              'building products', 'construction materials'],
    evEbitda:      { low: 7,  median: 10, high: 14 },
    evRevenue:     { low: 0.6, median: 1.2, high: 2.0 },
    revenueGrowth: { below: 2, median: 6, above: 12 },
    ebitdaMargin:  { below: 10, median: 15, above: 22 },
    grossMargin:   { below: 28, median: 40, above: 55 },
    lboMetrics: {
      typicalLeverage: '3.5x–5.0x Net Debt/EBITDA',
      leverageCeiling: 5.0,
      targetIRR: '18%–22%',
      targetMOIC: '2.0x–3.0x',
      typicalHoldYears: 5,
      fcfConversion: '55%–75% (CapEx intensity and working capital needs reduce FCF vs. EBITDA)',
      debtInstruments: ['Senior Secured TLB', 'Asset-Based Revolver (ABL)', 'Senior Notes for larger deals'],
      exitPathPrimary: 'Strategic sale to large industrial conglomerate (IDEX, Roper, Danaher) or secondary PE',
    },
    fitScoreWeights: { businessQuality: 0.25, financialQuality: 0.20, managementStrength: 0.25, marketDynamics: 0.15, dealStructure: 0.15 },
    publicComps: [
      'IDEX Corporation (IEX)', 'Roper Technologies (ROP)', 'Fortive (FTV)',
      'Parker Hannifin (PH)', 'Watts Water Technologies (WTS)',
    ],
    precedentTransactions: [
      'Gardner Denver → KKR: ~8.5x EBITDA, $3.7B (2013)',
      'Colfax → Eurofins (CIRCOR): ~12x EBITDA for premium specialty (2022)',
      'Specialty chemicals carve-outs: typically 7–10x EBITDA depending on margin profile',
      'Roper Technologies acquisitions: 15–20x EBITDA for software-adjacent industrial',
    ],
    keyValueDrivers: [
      'Aftermarket/parts recurring revenue stream (typically 2–3x OEM multiple if >30% of revenue)',
      'Reshoring and nearshoring tailwind for domestic specialty manufacturers with qualified supply chains',
      'Sole-source specifications or proprietary formulations create defensible pricing power',
      'Defense/aerospace qualification (lengthy re-certification) creates durable competitive moat',
      'IoT/software integration opportunity: sensor data and remote monitoring as recurring revenue',
    ],
    redFlags: [
      'Customer concentration in automotive OEMs: model 20% volume decline scenario explicitly',
      'Raw material pass-through lag: quantify margin timing risk in commodity price spike scenario',
      'FCF conversion <60%: high CapEx or working capital drag compresses returns — require 3-year CapEx plan',
      'Environmental liabilities or Superfund exposure: require Phase II environmental assessment pre-LOI',
      'Union labor agreements: review CBA expiration dates within hold period for strike risk',
    ],
    notes: 'Industrial multiples bifurcate sharply: software-integrated niche industrials trade at 12–16x EBITDA; ' +
           'pure-play commodity manufacturers trade at 6–8x. ' +
           'Reshoring thesis is real — identify whether the business is a beneficiary or at risk from trade policy changes.',
  },
  {
    sector: 'Healthcare Services',
    aliases: ['healthcare services', 'physician groups', 'behavioral health',
              'home health', 'hospice', 'dental', 'dermatology', 'ophthalmology',
              'orthopedics', 'urgent care', 'lab services'],
    evEbitda:      { low: 10, median: 13, high: 19 },
    evRevenue:     { low: 0.8, median: 1.4, high: 2.2 },
    revenueGrowth: { below: 4, median: 10, above: 20 },
    ebitdaMargin:  { below: 10, median: 16, above: 24 },
    grossMargin:   { below: 35, median: 48, above: 62 },
    lboMetrics: {
      typicalLeverage: '4.0x–5.5x Net Debt/EBITDA',
      leverageCeiling: 5.5,
      targetIRR: '20%–25%',
      targetMOIC: '2.5x–3.5x',
      typicalHoldYears: 5,
      fcfConversion: '60%–80% (de novo CapEx and working capital in accounts receivable)',
      debtInstruments: ['Senior Secured TLB', 'Revolving Credit Facility (often AR-based)', 'Seller Notes for de novo programs'],
      exitPathPrimary: 'Strategic sale to hospital system, large national platform, or secondary PE buyout',
    },
    fitScoreWeights: { businessQuality: 0.20, financialQuality: 0.20, managementStrength: 0.20, marketDynamics: 0.25, dealStructure: 0.15 },
    publicComps: [
      'DaVita (DVA)', 'Encompass Health (EHC)', 'Acadia Healthcare (ACHC)',
      'Surgery Partners (SGRY)', 'Select Medical (SEM)',
    ],
    precedentTransactions: [
      'Kindred Healthcare → Humana/TPG/Welsh: ~9x EBITDA, $4.1B (2017)',
      'Envision Healthcare → KKR: ~12x EBITDA, $9.9B (2018)',
      'U.S. Physical Therapy → Optum (UnitedHealth): ~11x EBITDA, $1.0B (2023)',
      'Behavioral health platforms: 10–14x EBITDA for high-quality operators (2021–2023)',
    ],
    keyValueDrivers: [
      'Physician/provider alignment via ownership stakes: key to retention and volume growth',
      'Platform roll-up in fragmented specialties: dental, behavioral health, dermatology, orthopedics',
      'De novo unit economics: quantify new facility ramp time, EBITDA contribution at maturity',
      'Payor mix: every 10% shift from government to commercial payer typically adds 100–200bps EBITDA margin',
      'Demographic tailwind: 10,000 Baby Boomers turning 65 daily drives structural demand growth',
    ],
    redFlags: [
      'CMS reimbursement rate changes: model -3% rate reduction scenario and EBITDA impact explicitly',
      'Clinician workforce shortage: wage inflation risk — assess current vacancy rates and turnover cost',
      'Stark Law / Anti-Kickback compliance: require outside counsel review of all physician compensation structures',
      'Payor mix concentration >60% government: increases regulatory risk and limits multiple re-rating',
      'AR days outstanding >60 days signals billing/collection execution risk — require A/R aging detail',
    ],
    notes: 'Healthcare services PE thesis driven by demographic aging and specialty fragmentation. ' +
           'Platform rollups in behavioral health and post-acute care are highly active. ' +
           'Reimbursement rate risk is the primary macro risk — require sensitivity analysis at -3% and -6% rate cuts.',
  },
  {
    sector: 'Education & Training',
    aliases: ['education', 'edtech', 'training', 'e-learning', 'vocational',
              'workforce development', 'corporate learning', 'test prep', 'tutoring'],
    evEbitda:      { low: 9,  median: 13, high: 18 },
    evRevenue:     { low: 1.5, median: 3.0, high: 5.0 },
    revenueGrowth: { below: 5, median: 12, above: 25 },
    ebitdaMargin:  { below: 12, median: 20, above: 32 },
    grossMargin:   { below: 50, median: 65, above: 78 },
    lboMetrics: {
      typicalLeverage: '3.5x–5.0x Net Debt/EBITDA',
      leverageCeiling: 5.0,
      targetIRR: '18%–24%',
      targetMOIC: '2.0x–3.0x',
      typicalHoldYears: 5,
      fcfConversion: '65%–80% (relatively low CapEx for digital-first businesses)',
      debtInstruments: ['Senior Secured TLB', 'Revolving Credit Facility'],
      exitPathPrimary: 'Strategic sale to large education platform, corporate training company, or publisher',
    },
    fitScoreWeights: { businessQuality: 0.25, financialQuality: 0.20, managementStrength: 0.20, marketDynamics: 0.25, dealStructure: 0.10 },
    publicComps: [
      'Duolingo (DUOL)', 'Coursera (COUR)', '2U (TWOU)',
      'Stride (LRN)', 'Grand Canyon Education (LOPE)',
    ],
    precedentTransactions: [
      'Cengage → Apollo Global: ~9x EBITDA (recapitalization 2020)',
      'Skillsoft → Software Luxembourg: ~8x EBITDA, $1.5B (2014)',
      'Pluralsight → Vista Equity: ~11x Revenue, $3.5B (2017)',
      'GP Strategies → Learning Technologies Group: ~11x EBITDA (2021)',
    ],
    keyValueDrivers: [
      'Employer-sponsored tuition benefits (SHRM estimate: $5,250 avg tax-free employer contribution)',
      'Government/military funding (GI Bill, WIOA) creates non-cyclical, predictable revenue floor',
      'Accreditation and credentialing moat: 18–36 month process creates durable barrier to entry',
      'AI-powered personalized learning: outcome differentiation drives premium pricing and retention',
    ],
    redFlags: [
      'Title IV funding >85% of revenue for for-profit institutions: extreme regulatory concentration risk',
      'Student acquisition cost inflation via Google/Meta: rising CAC compressing unit economics',
      'Graduate outcome metrics under Department of Education scrutiny: require disclosure of employment rates',
      'Consumer discretionary exposure: B2C tutoring revenues can fall 20-30% in economic downturns',
    ],
    notes: 'EdTech multiples bifurcated: B2B workforce training (corporate learning, skills development) commands premium; ' +
           'B2C tutoring and consumer education trade at meaningful discount. ' +
           'Focus acquisition thesis on employer-funded learning with multi-year enterprise contracts.',
  },
  {
    sector: 'Distribution & Logistics',
    aliases: ['distribution', 'logistics', 'supply chain', 'third-party logistics',
              '3pl', 'warehousing', 'freight', 'last-mile', 'cold chain',
              'food distribution', 'specialty distribution'],
    evEbitda:      { low: 7,  median: 10, high: 14 },
    evRevenue:     { low: 0.3, median: 0.7, high: 1.2 },
    revenueGrowth: { below: 2, median: 6, above: 14 },
    ebitdaMargin:  { below: 5,  median: 9,  above: 15 },
    grossMargin:   { below: 15, median: 28, above: 42 },
    lboMetrics: {
      typicalLeverage: '3.0x–4.5x Net Debt/EBITDA',
      leverageCeiling: 4.5,
      targetIRR: '18%–22%',
      targetMOIC: '2.0x–2.8x',
      typicalHoldYears: 5,
      fcfConversion: '60%–75% (working capital intensive; seasonal WC swings can be significant)',
      debtInstruments: ['Asset-Based Revolver (ABL — receivables/inventory)', 'Senior Secured TLB', 'Equipment financing'],
      exitPathPrimary: 'Strategic sale to large national distributor or industrial conglomerate; secondary PE less common',
    },
    fitScoreWeights: { businessQuality: 0.20, financialQuality: 0.30, managementStrength: 0.20, marketDynamics: 0.15, dealStructure: 0.15 },
    publicComps: [
      'Fastenal (FAST)', 'W.W. Grainger (GWW)', 'Hub Group (HUBG)',
      'XPO (XPO)', 'GXO Logistics (GXO)', 'Wesco International (WCC)',
    ],
    precedentTransactions: [
      'Anixter → WESCO International: ~9x EBITDA, $4.5B (2020)',
      'Performance Food Group acquisitions: 8–10x EBITDA (specialty food distribution)',
      'Medline Industries → Blackstone/Carlyle/Hellman: ~15x EBITDA, $34B (2021)',
      'SRS Distribution → Home Depot: ~13x EBITDA, $18.25B (2024)',
    ],
    keyValueDrivers: [
      'Value-added services (kitting, VMI, technical support, installation): 200–500bps margin uplift vs. pure distribution',
      'Proprietary TMS/WMS technology and EDI integration: creates high switching costs for enterprise customers',
      'Captive customer base via embedded replenishment systems (consignment stock, auto-replenishment)',
      'Healthcare and safety-critical supply chains command premium vs. commodity distribution',
    ],
    redFlags: [
      'EBITDA margin <8%: insufficient cash flow to service LBO debt — requires VAS growth or price increase plan',
      'Asset-heavy model (owned fleet, owned warehouses): ROIC erosion risk if utilization drops >10%',
      'Spot freight exposure >30% of volume: margin timing risk in volatile rate environment',
      'Customer concentration: top-3 customers >50% revenue — model churn scenario for largest customer',
    ],
    notes: 'Distribution multiples bifurcate around value-added services and niche defensibility. ' +
           'Healthcare distribution (medical supplies, specialty pharma) commands significant premium vs. commodity distribution. ' +
           'Amazon Business disruption risk is real but limited to non-specialized, easily substitutable SKUs.',
  },
  {
    sector: 'Financial Services',
    aliases: ['financial services', 'fintech', 'insurance', 'wealth management',
              'asset management', 'payments', 'lending', 'mortgage', 'banking software',
              'insurance technology', 'insurtech'],
    evEbitda:      { low: 10, median: 14, high: 22 },
    evRevenue:     { low: 1.5, median: 3.5, high: 7.0 },
    revenueGrowth: { below: 5, median: 12, above: 25 },
    ebitdaMargin:  { below: 15, median: 25, above: 40 },
    grossMargin:   { below: 50, median: 65, above: 80 },
    lboMetrics: {
      typicalLeverage: '4.5x–6.0x Net Debt/EBITDA',
      leverageCeiling: 6.0,
      targetIRR: '20%–26%',
      targetMOIC: '2.5x–3.8x',
      typicalHoldYears: 5,
      fcfConversion: '70%–90% (low CapEx; regulatory compliance spend is primary cash outflow)',
      debtInstruments: ['Senior Secured TLB', 'Revolving Credit Facility', 'Second Lien for higher leverage'],
      exitPathPrimary: 'Strategic sale to large financial data/infrastructure firm (FIS, Fiserv, SS&C) or secondary PE',
    },
    fitScoreWeights: { businessQuality: 0.25, financialQuality: 0.30, managementStrength: 0.15, marketDynamics: 0.20, dealStructure: 0.10 },
    publicComps: [
      'SS&C Technologies (SSNC)', 'Broadridge Financial (BR)', 'Black Knight (BKI)',
      'WEX (WEX)', 'Envestnet (ENV)', 'Donnelley Financial (DFIN)',
    ],
    precedentTransactions: [
      'Black Knight → ICE: ~17x EBITDA, $11.9B (2023)',
      'Solarisbank / banking-as-a-service platforms: 6–10x Revenue (2021–2022)',
      'SS&C acquisitions (DST Systems, Eze Castle): 12–16x EBITDA',
      'Adenza → Nasdaq: ~20x Revenue, $10.5B (2023)',
    ],
    keyValueDrivers: [
      'Transaction processing revenue: highly predictable, volume-driven, scales without proportional cost increase',
      'Regulatory compliance moat: switching costs extreme in banking/insurance — core systems replacement takes 2–3 years',
      'Cross-sell into adjacent financial workflows: payments → treasury → lending → compliance creates platform stickiness',
      'Embedded finance and API-first architecture positions for embedded finance tailwind',
    ],
    redFlags: [
      'Interest rate sensitivity: lending volume compression in rising rate environment — model at Fed Funds +200bps',
      'Regulatory capital requirements for bank-adjacent models: identify whether any activities trigger bank licensing',
      'Payment volume compression in economic downturns: 2008/2009 payment volumes declined 15–20%',
      'KYC/AML compliance exposure: require outside legal review of regulatory standing and any pending investigations',
    ],
    notes: 'Financial services multiples bifurcated post-2022 rate cycle. ' +
           'B2B fintech infrastructure (payments rails, compliance software, data) commands significant premium vs. consumer lending. ' +
           'The convergence of embedded finance and regulatory technology is driving active M&A and high sponsor interest.',
  },
]

// ─── Lookup function ──────────────────────────────────────────────────────────

/**
 * Find sector benchmarks based on sector name or business description text.
 * Returns null if no sector match found.
 */
export function findSectorBenchmark(
  sectorHint: string,
  fallbackDescription?: string
): SectorBenchmark | null {
  const haystack = `${sectorHint} ${fallbackDescription ?? ''}`.toLowerCase()

  // Try each benchmark's aliases
  let bestMatch: SectorBenchmark | null = null
  let bestScore = 0

  for (const bm of BENCHMARKS) {
    let score = 0
    for (const alias of bm.aliases) {
      if (haystack.includes(alias)) {
        // Longer alias matches are more specific — reward them
        score = Math.max(score, alias.length)
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestMatch = bm
    }
  }

  return bestMatch
}

/**
 * Format sector benchmark data as a concise text block for injection into prompts.
 * Includes LBO metrics and precedent transactions for Blackstone-grade analysis.
 */
export function formatBenchmarkForPrompt(bm: SectorBenchmark): string {
  const lbo = bm.lboMetrics
  return `
SECTOR BENCHMARK — ${bm.sector.toUpperCase()}
═══════════════════════════════════════════════════════
TRANSACTION MULTIPLES (2024/2025 mid-market deals):
  EV/EBITDA:   ${bm.evEbitda.low}x – ${bm.evEbitda.high}x   (median: ${bm.evEbitda.median}x)
  EV/Revenue:  ${bm.evRevenue.low}x – ${bm.evRevenue.high}x   (median: ${bm.evRevenue.median}x)

OPERATING BENCHMARKS (flag relative to these):
  Revenue growth:  Weak <${bm.revenueGrowth.below}%  |  Median ${bm.revenueGrowth.median}%  |  Strong >${bm.revenueGrowth.above}%
  EBITDA margin:   Weak <${bm.ebitdaMargin.below}%  |  Median ${bm.ebitdaMargin.median}%  |  Strong >${bm.ebitdaMargin.above}%
  Gross margin:    Weak <${bm.grossMargin.below}%  |  Median ${bm.grossMargin.median}%  |  Strong >${bm.grossMargin.above}%

LBO PARAMETERS:
  Typical leverage:   ${lbo.typicalLeverage}
  Leverage ceiling:   ${lbo.leverageCeiling}x Net Debt/EBITDA
  Target gross IRR:   ${lbo.targetIRR}
  Target MOIC:        ${lbo.targetMOIC}
  Typical hold:       ${lbo.typicalHoldYears} years
  FCF conversion:     ${lbo.fcfConversion}
  Debt instruments:   ${lbo.debtInstruments.join(' | ')}
  Primary exit path:  ${lbo.exitPathPrimary}

PUBLIC COMPS: ${bm.publicComps.join(', ')}

PRECEDENT TRANSACTIONS:
${bm.precedentTransactions.map((t) => `  • ${t}`).join('\n')}

PREMIUM VALUE DRIVERS:
${bm.keyValueDrivers.map((d) => `  • ${d}`).join('\n')}

SECTOR RED FLAGS (require explicit DD response):
${bm.redFlags.map((f) => `  • ${f}`).join('\n')}

ANALYST CONTEXT: ${bm.notes}
`.trim()
}

/**
 * Get all sector names (for display/listing purposes).
 */
export function listSectors(): string[] {
  return BENCHMARKS.map((b) => b.sector)
}

export const DEFAULT_FIT_WEIGHTS = {
  businessQuality: 0.30,
  financialQuality: 0.25,
  managementStrength: 0.20,
  marketDynamics: 0.15,
  dealStructure: 0.10,
}
