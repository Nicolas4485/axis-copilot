/**
 * Summit Ridge Portfolio — Pitch Deck Generator
 * 12-slide navy/gold pitch deck for a Sun Belt value-add multifamily PE deal
 *
 * Run:  node gen_pitch_realestate.js
 */
const path = require('path')
const PptxGenJSModule = require('/sessions/gracious-affectionate-dirac/mnt/axis-copilot/node_modules/.pnpm/pptxgenjs@4.0.1/node_modules/pptxgenjs')
const PptxGenJS = PptxGenJSModule.default ?? PptxGenJSModule

const OUT = path.join(__dirname, 'pitch-summit-ridge.pptx')

// ─── Colour palette ──────────────────────────────────────────
const NAVY  = '0A1628'
const GOLD  = 'C9A84C'
const WHITE = 'FFFFFF'
const LGREY = 'CCCCCC'
const MGREY = '888888'
const DGREY = '333333'
const SBLUE = '1A3A5C'   // slide background secondary
const RED   = 'C0392B'
const GREEN = '1A6B3A'
const AMBER = 'D4A017'

const prs = new PptxGenJS()
prs.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 })
prs.layout = 'WIDE'
prs.author  = 'Axis Capital Advisors'
prs.title   = 'Summit Ridge Portfolio — Investment Memorandum'

// ─── Helper utilities ────────────────────────────────────────

/** Add navy background to a slide */
function navyBg(slide) {
  slide.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: NAVY } })
}

/** Gold accent bar (top or bottom) */
function goldBar(slide, y, h = 0.05) {
  slide.addShape(prs.ShapeType.rect, { x: 0, y, w: 13.33, h, fill: { color: GOLD }, line: { color: GOLD } })
}

/** Left-side navy panel */
function leftPanel(slide, w = 3.8) {
  slide.addShape(prs.ShapeType.rect, { x: 0, y: 0, w, h: 7.5, fill: { color: NAVY } })
}

/** Section label (small gold caps above heading) */
function sectionLabel(slide, txt, x, y, w = 8) {
  slide.addText(txt, {
    x, y, w, h: 0.25,
    fontSize: 8, bold: true, color: GOLD, fontFace: 'Calibri',
    valign: 'middle'
  })
}

/** Slide title */
function slideTitle(slide, txt, x = 0.4, y = 0.18, w = 12.5, color = WHITE) {
  slide.addText(txt, {
    x, y, w, h: 0.55,
    fontSize: 26, bold: true, color, fontFace: 'Calibri',
    valign: 'middle'
  })
}

/** Body paragraph */
function bodyText(slide, txt, x, y, w, h, opts = {}) {
  slide.addText(txt, {
    x, y, w, h,
    fontSize: 10, color: DGREY, fontFace: 'Calibri',
    valign: 'top', wrap: true,
    ...opts
  })
}

/** KPI box */
function kpiBox(slide, value, label, x, y, w = 2.1, h = 1.1, dark = true) {
  const bg = dark ? NAVY : 'F5F5F5'
  const vc = dark ? WHITE : NAVY
  const lc = dark ? GOLD  : MGREY
  slide.addShape(prs.ShapeType.rect, { x, y, w, h, fill: { color: bg }, line: { color: GOLD, pt: 1 } })
  slide.addText(value, { x, y: y + 0.12, w, h: 0.55, fontSize: 24, bold: true, color: vc, fontFace: 'Calibri', align: 'center', valign: 'middle' })
  slide.addText(label, { x, y: y + 0.68, w, h: 0.3,  fontSize: 8,  bold: false, color: lc, fontFace: 'Calibri', align: 'center', valign: 'middle' })
}

/** Bold risk pill */
function riskPill(slide, txt, color, x, y) {
  slide.addShape(prs.ShapeType.rect, { x, y, w: 0.9, h: 0.25, fill: { color }, line: { color } })
  slide.addText(txt, { x, y, w: 0.9, h: 0.25, fontSize: 7.5, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle' })
}

/** Bullet list */
function bullets(slide, items, x, y, w, h, fontSize = 10) {
  const rows = items.map(t => ({ text: t, options: { bullet: true, indentLevel: 0 } }))
  slide.addText(rows, { x, y, w, h, fontSize, color: DGREY, fontFace: 'Calibri', valign: 'top', lineSpacingMultiple: 1.3 })
}

// ─── TABLE HELPER ────────────────────────────────────────────
function addTable(slide, rows, x, y, w, colW, fontSize = 8) {
  const tableRows = rows.map((row, ri) =>
    row.map((cell, _ci) => {
      const isHeader = ri === 0
      const text = typeof cell === 'string' ? cell : cell.text
      const bold  = isHeader || (typeof cell === 'object' && cell.bold)
      const align = typeof cell === 'object' ? (cell.align || 'center') : 'center'
      const color = isHeader ? WHITE : (typeof cell === 'object' && cell.color ? cell.color : DGREY)
      return {
        text,
        options: {
          bold, align, valign: 'middle',
          fontSize,
          color,
          fontFace: 'Calibri',
          fill: { color: isHeader ? NAVY : (ri % 2 === 0 ? 'FFFFFF' : 'F5F5F5') },
          margin: [3, 5, 3, 5],
        }
      }
    })
  )
  slide.addTable(tableRows, {
    x, y, w,
    colW: colW || Array(rows[0].length).fill(w / rows[0].length),
    border: { type: 'solid', pt: 0.5, color: LGREY },
    autoPage: false,
  })
}

// ════════════════════════════════════════════════════════════════
// SLIDE 1 — COVER
// ════════════════════════════════════════════════════════════════
{
  const sl = prs.addSlide()
  navyBg(sl)

  // Main gold stripe
  sl.addShape(prs.ShapeType.rect, { x: 0, y: 2.9, w: 13.33, h: 1.7, fill: { color: SBLUE }, line: { color: SBLUE } })
  goldBar(sl, 2.85, 0.05)
  goldBar(sl, 4.6,  0.05)

  // Title
  sl.addText('SUMMIT RIDGE PORTFOLIO', {
    x: 0.8, y: 0.6, w: 11.73, h: 0.9,
    fontSize: 38, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle'
  })
  sl.addText('CONFIDENTIAL INVESTMENT MEMORANDUM', {
    x: 0.8, y: 1.55, w: 11.73, h: 0.35,
    fontSize: 13, bold: false, color: GOLD, fontFace: 'Calibri', align: 'center'
  })
  sl.addText('Value-Add Multifamily Portfolio  ·  Sun Belt Markets  ·  2,847 Units', {
    x: 0.8, y: 1.95, w: 11.73, h: 0.3,
    fontSize: 11, color: LGREY, fontFace: 'Calibri', align: 'center'
  })

  // KPIs in stripe
  const kpis = [
    ['$473M', 'Target Enterprise Value'],
    ['5.2%', 'In-Place Cap Rate'],
    ['2,847', 'Total Units'],
    ['18.5%', 'Target Gross IRR'],
    ['2.2x', 'Target Equity Multiple'],
  ]
  const kpiW = 13.33 / 5
  kpis.forEach(([v, l], i) => {
    const x = i * kpiW + 0.1
    sl.addText(v, { x, y: 3.0,  w: kpiW - 0.2, h: 0.7, fontSize: 26, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle' })
    sl.addText(l, { x, y: 3.72, w: kpiW - 0.2, h: 0.4, fontSize: 8.5, color: GOLD, fontFace: 'Calibri', align: 'center', valign: 'middle' })
  })

  sl.addText('14 Properties  ·  Atlanta · Tampa · Charlotte · Nashville · Austin', {
    x: 0.8, y: 4.85, w: 11.73, h: 0.3,
    fontSize: 10, color: LGREY, fontFace: 'Calibri', align: 'center'
  })
  sl.addText('PREPARED BY AXIS CAPITAL ADVISORS  ·  APRIL 2025  ·  STRICTLY CONFIDENTIAL', {
    x: 0.8, y: 6.85, w: 11.73, h: 0.3,
    fontSize: 8, color: MGREY, fontFace: 'Calibri', align: 'center'
  })
}

// ════════════════════════════════════════════════════════════════
// SLIDE 2 — EXECUTIVE SUMMARY / TRANSACTION SNAPSHOT
// ════════════════════════════════════════════════════════════════
{
  const sl = prs.addSlide()
  sl.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.1, fill: { color: NAVY }, line: { color: NAVY } })
  goldBar(sl, 1.1, 0.04)
  sectionLabel(sl, 'TRANSACTION OVERVIEW', 0.4, 0.18)
  slideTitle(sl, 'A Rare Opportunity to Acquire Institutional Sun Belt Multifamily At Scale', 0.4, 0.42, 12.5)

  // KPI row
  const kpis = [
    ['$473M', 'Enterprise Value'],
    ['$166K', 'Price Per Unit'],
    ['5.2%', 'In-Place Cap Rate'],
    ['4.7%', 'Stabilised Cap Rate (Yr 3)'],
    ['93.4%', 'Current Occupancy'],
    ['18.5%', 'Target Gross IRR (Base)'],
  ]
  kpis.forEach(([v, l], i) => {
    const x = 0.3 + i * 2.12
    kpiBox(sl, v, l, x, 1.3, 2.0, 1.05, true)
  })

  sl.addText('Portfolio Overview', { x: 0.4, y: 2.55, w: 12.5, h: 0.3, fontSize: 12, bold: true, color: NAVY, fontFace: 'Calibri' })

  bodyText(sl,
    'Summit Ridge Portfolio is a 2,847-unit, 14-property Class B multifamily portfolio diversified across five of the ' +
    "highest-growth Sun Belt MSAs: Atlanta, Tampa, Charlotte, Nashville, and Austin. The portfolio was assembled " +
    "over 2018–2022 by a regional sponsor and is being offered as a single-portfolio monetisation event.\n\n" +
    "Properties are well-located, operationally stable assets generating $24.6M LTM NOI at 93.4% occupancy. " +
    "In-place rents average $1,420/month — 17.3% below current market of $1,716/month — representing a clear, " +
    "capital-efficient mark-to-market revenue opportunity without reliance on speculative lease-up.",
    0.4, 2.9, 7.0, 2.3, { fontSize: 10, color: DGREY })

  // Right panel: deal terms
  addTable(sl, [
    ['Term', 'Detail'],
    [{ text: 'Asset Class', align: 'left' }, { text: 'Class B Value-Add Multifamily', align: 'left' }],
    [{ text: 'Markets', align: 'left' }, { text: 'Atlanta · Tampa · Charlotte · Nashville · Austin', align: 'left' }],
    [{ text: 'Purchase Price', align: 'left' }, { text: '$472.8M ($166,070 / unit)', align: 'left', bold: true }],
    [{ text: 'Financing', align: 'left' }, { text: '60% LTV TL (SOFR+190) + 40% equity', align: 'left' }],
    [{ text: 'Equity Check', align: 'left' }, { text: '~$189M', align: 'left', bold: true }],
    [{ text: 'Target Hold', align: 'left' }, { text: '5 years (2025–2030)', align: 'left' }],
    [{ text: 'LOI Deadline', align: 'left' }, { text: 'April 30, 2025', align: 'left' }],
  ], 7.7, 2.55, 5.3, [1.6, 3.7], 8.5)
}

// ════════════════════════════════════════════════════════════════
// SLIDE 3 — INVESTMENT HIGHLIGHTS
// ════════════════════════════════════════════════════════════════
{
  const sl = prs.addSlide()
  sl.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.1, fill: { color: NAVY }, line: { color: NAVY } })
  goldBar(sl, 1.1, 0.04)
  sectionLabel(sl, 'WHY INVEST', 0.4, 0.18)
  slideTitle(sl, 'Six Pillars of a Compelling Value-Add Investment', 0.4, 0.42, 12.5)

  const items = [
    ['17.3% Below-Market Rents', 'Immediate mark-to-market on renewal cycles — $296/month gap to market rents represents $10.1M annual NOI potential without capital deployment'],
    ['Proven Unit ROC of 20.1%', 'Phase I renovations ($8,500/unit) generated +$142/month rent premium on completed units. 1,427 remaining units represent the core value-add pipeline'],
    ['Sun Belt Secular Demand', '42,000 new households/year across portfolio MSAs; supply deliveries declining 28% in 2025 vs. 2024 peak — structural rent growth tailwind'],
    ['Day-One 5.2% In-Place Yield', 'Above clearing rate for institutional stabilised product (4.6–4.9%). Strong FCF supports full interest carry from close without cash-in calls'],
    ['Multiple Exit Paths', 'Bulk sale to REIT or institution, property-by-property disposition, or UPREIT contribution. Sun Belt multifamily: $80B+ annual transaction volume'],
    ['Operational Alpha Available', 'Consolidating 3 property managers → 1 operator saves $0.8M/year. Revenue mgmt software deployment targets additional 1.5% NOI improvement in Year 1'],
  ]

  const cols = [0.3, 6.8]
  items.forEach(([title, body], i) => {
    const row = Math.floor(i / 2)
    const col = i % 2
    const x = cols[col]
    const y = 1.3 + row * 2.0
    sl.addShape(prs.ShapeType.rect, { x, y, w: 6.3, h: 1.85, fill: { color: 'F8F9FA' }, line: { color: LGREY, pt: 0.5 } })
    sl.addShape(prs.ShapeType.rect, { x, y, w: 0.22, h: 1.85, fill: { color: GOLD }, line: { color: GOLD } })
    sl.addText(title, { x: x + 0.3, y: y + 0.15, w: 5.85, h: 0.35, fontSize: 11, bold: true, color: NAVY, fontFace: 'Calibri', valign: 'middle' })
    sl.addText(body,  { x: x + 0.3, y: y + 0.52, w: 5.85, h: 1.2,  fontSize: 9,  color: DGREY, fontFace: 'Calibri', valign: 'top', wrap: true })
  })
}

// ════════════════════════════════════════════════════════════════
// SLIDE 4 — PORTFOLIO MAP & MARKET BREAKDOWN
// ════════════════════════════════════════════════════════════════
{
  const sl = prs.addSlide()
  sl.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.1, fill: { color: NAVY }, line: { color: NAVY } })
  goldBar(sl, 1.1, 0.04)
  sectionLabel(sl, 'PORTFOLIO OVERVIEW', 0.4, 0.18)
  slideTitle(sl, 'Diversified Across Five High-Growth Sun Belt MSAs', 0.4, 0.42, 12.5)

  addTable(sl, [
    ['Market', 'Props', 'Units', '% Portfolio', 'In-Place Rent', 'Market Rent', 'Gap', 'Occupancy', 'LTM NOI'],
    [{ text: 'Atlanta, GA', align: 'left' },   '4', '842',  '29.6%', '$1,385', '$1,640', '−15.5%', '94.1%', '$7.03M'],
    [{ text: 'Tampa, FL', align: 'left' },     '3', '621',  '21.8%', '$1,460', '$1,780', '−18.0%', '93.8%', '$5.68M'],
    [{ text: 'Charlotte, NC', align: 'left' }, '3', '598',  '21.0%', '$1,395', '$1,690', '−17.5%', '92.7%', '$5.06M'],
    [{ text: 'Nashville, TN', align: 'left' }, '2', '442',  '15.5%', '$1,480', '$1,820', '−18.7%', '93.2%', '$4.06M'],
    [{ text: 'Austin, TX', align: 'left' },    '2', '344',  '12.1%', '$1,420', '$1,740', '−18.4%', '93.6%', '$3.08M'],
    [{ text: 'TOTAL', align: 'left', bold: true }, { text: '14', bold: true }, { text: '2,847', bold: true },
     { text: '100%', bold: true }, { text: '$1,420', bold: true }, { text: '$1,716', bold: true },
     { text: '−17.3%', bold: true }, { text: '93.4%', bold: true }, { text: '$24.61M', bold: true }],
  ], 0.3, 1.25, 12.7, [1.5, 0.6, 0.6, 0.9, 1.0, 1.0, 0.8, 0.9, 1.0], 9)

  // Below-market rent chart (bar chart simulation)
  sl.addText('In-Place vs. Market Rent by MSA ($/ month)', {
    x: 0.3, y: 3.55, w: 12.7, h: 0.3, fontSize: 11, bold: true, color: NAVY, fontFace: 'Calibri'
  })

  const mktData = [
    { label: 'Atlanta', inPlace: 1385, market: 1640 },
    { label: 'Tampa',   inPlace: 1460, market: 1780 },
    { label: 'Charlotte',inPlace: 1395,market: 1690 },
    { label: 'Nashville',inPlace: 1480,market: 1820 },
    { label: 'Austin',  inPlace: 1420, market: 1740 },
  ]
  const chartX = 0.4; const chartW = 12.5; const maxRent = 2000
  const barH = 0.38; const gap = 0.18; const chartY = 3.9
  mktData.forEach((d, i) => {
    const y = chartY + i * (barH * 2 + gap)
    const ipW = (d.inPlace / maxRent) * chartW
    const mkW = (d.market / maxRent) * chartW
    // Market bar (light)
    sl.addShape(prs.ShapeType.rect, { x: chartX, y, w: mkW, h: barH, fill: { color: 'DCE8F5' }, line: { color: 'B0C4DE', pt: 0.5 } })
    sl.addText(`Market: $${d.market}`, { x: chartX + mkW + 0.05, y, w: 2.2, h: barH, fontSize: 8.5, color: MGREY, fontFace: 'Calibri', valign: 'middle' })
    // In-place bar (navy)
    sl.addShape(prs.ShapeType.rect, { x: chartX, y: y + barH, w: ipW, h: barH, fill: { color: NAVY }, line: { color: NAVY } })
    sl.addText(`In-Place: $${d.inPlace}  (−${Math.round((1-d.inPlace/d.market)*100)}% below market)`,
      { x: chartX + ipW + 0.05, y: y + barH, w: 3.5, h: barH, fontSize: 8.5, bold: true, color: NAVY, fontFace: 'Calibri', valign: 'middle' })
    sl.addText(d.label, { x: chartX - 1.0, y, w: 0.9, h: barH * 2, fontSize: 8.5, bold: true, color: DGREY, fontFace: 'Calibri', valign: 'middle', align: 'right' })
  })
}

// ════════════════════════════════════════════════════════════════
// SLIDE 5 — MARKET FUNDAMENTALS
// ════════════════════════════════════════════════════════════════
{
  const sl = prs.addSlide()
  sl.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.1, fill: { color: NAVY }, line: { color: NAVY } })
  goldBar(sl, 1.1, 0.04)
  sectionLabel(sl, 'MARKET ANALYSIS', 0.4, 0.18)
  slideTitle(sl, 'Sun Belt Fundamentals Support Durable Rent Growth Through 2027', 0.4, 0.42, 12.5)

  addTable(sl, [
    ['MSA', '2024 Population', '2Y Pop Growth', 'Med. HH Income', 'Unemployment', 'MF Vacancy', '2025 Supply', 'Proj. Rent Growth'],
    ['Atlanta, GA',    '6.3M', '+4.8%', '$82,400', '3.6%', '7.1%', '18,200 units', '+4.2%'],
    ['Tampa, FL',      '3.2M', '+5.1%', '$74,800', '3.3%', '6.8%', '11,400 units', '+4.8%'],
    ['Charlotte, NC',  '2.8M', '+4.4%', '$79,200', '3.4%', '7.4%', '10,600 units', '+3.9%'],
    ['Nashville, TN',  '2.1M', '+3.9%', '$81,600', '3.1%', '7.8%', '9,800 units',  '+3.6%'],
    ['Austin, TX',     '2.4M', '+5.6%', '$92,100', '3.2%', '8.2%', '12,800 units', '+3.2%'],
  ], 0.3, 1.25, 12.7, [1.35, 1.1, 1.1, 1.2, 1.1, 0.9, 1.3, 1.3], 9)

  const drivers = [
    ['Population Influx', 'Portfolio MSAs added 847K net new residents in 2022–2024 — 3.2x the national average. Millennial and Gen Z household formation underpins demand for Class B rental product.'],
    ['Employment Diversification', 'Tech (Austin), financial services (Charlotte), healthcare (Nashville), and logistics (Atlanta) create resilient, multi-sector employment bases — reducing recessionary sensitivity vs. single-industry cities.'],
    ['Supply Normalization', 'New MF deliveries across target MSAs decline from 87,400 units (2024 peak) to an estimated 44,200 units by 2026 — a 49% reduction driven by higher construction costs and tighter construction lending. Vacancy expected to compress 80–120 bps.'],
    ['Class B vs. Class A Spread', 'Class A new-build rents average $2,100–$2,400/month — 22–29% premium to Summit Ridge market rents. This structural affordability gap insulates Class B from direct competition with new supply.'],
  ]
  drivers.forEach(([title, body], i) => {
    const x = 0.3 + (i % 2) * 6.5
    const y = 3.5 + Math.floor(i / 2) * 1.85
    sl.addShape(prs.ShapeType.rect, { x, y, w: 6.2, h: 1.75, fill: { color: 'F8F9FA' }, line: { color: LGREY, pt: 0.5 } })
    sl.addText(title, { x: x + 0.15, y: y + 0.12, w: 5.9, h: 0.32, fontSize: 10.5, bold: true, color: NAVY, fontFace: 'Calibri', valign: 'middle' })
    sl.addText(body,  { x: x + 0.15, y: y + 0.48, w: 5.9, h: 1.15, fontSize: 8.5, color: DGREY, fontFace: 'Calibri', valign: 'top', wrap: true })
  })
}

// ════════════════════════════════════════════════════════════════
// SLIDE 6 — FINANCIAL PERFORMANCE
// ════════════════════════════════════════════════════════════════
{
  const sl = prs.addSlide()
  sl.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.1, fill: { color: NAVY }, line: { color: NAVY } })
  goldBar(sl, 1.1, 0.04)
  sectionLabel(sl, 'FINANCIAL PERFORMANCE', 0.4, 0.18)
  slideTitle(sl, 'Consistent NOI Growth — $20.5M → $24.6M Over 3 Years (+8.4% CAGR)', 0.4, 0.42, 12.5)

  addTable(sl, [
    ['Metric', 'FY 2022', 'FY 2023', 'FY 2024 (LTM)', 'YoY Δ'],
    [{ text: 'Gross Potential Rent', align: 'left' }, '$42.1M', '$44.8M', '$47.2M', '+5.4%'],
    [{ text: 'Effective Gross Income', align: 'left', bold: true }, { text: '$39.9M', bold: true }, { text: '$43.3M', bold: true }, { text: '$45.8M', bold: true }, { text: '+5.8%', bold: true }],
    [{ text: 'Total OpEx', align: 'left' }, '($19.4M)', '($20.6M)', '($21.7M)', ''],
    [{ text: '  of which: Property Mgmt', align: 'left' }, '$3.8M', '$3.9M', '$4.1M', '(consolidating)'],
    [{ text: '  of which: Insurance', align: 'left' }, '$2.1M', '$2.4M', '$2.8M', '+16.7% ⚠'],
    [{ text: '  of which: Real Estate Tax', align: 'left' }, '$4.1M', '$4.3M', '$4.5M', '+4.7%'],
    [{ text: 'Net Operating Income (NOI)', align: 'left', bold: true }, { text: '$20.5M', bold: true }, { text: '$22.7M', bold: true }, { text: '$24.6M', bold: true }, { text: '+8.4%', bold: true, color: GREEN }],
    [{ text: 'NOI Margin (% EGI)', align: 'left' }, '51.4%', '52.4%', '53.7%', '+1.3pp'],
    [{ text: 'Per-Unit NOI', align: 'left' }, '$7,199', '$7,974', '$8,643', '+8.4%'],
  ], 0.3, 1.25, 7.8, [2.5, 1.3, 1.3, 1.4, 1.3], 9)

  // NOI bridge
  sl.addText('NOI Bridge: In-Place → Stabilised (Year 3)', { x: 8.3, y: 1.2, w: 4.8, h: 0.3, fontSize: 11, bold: true, color: NAVY, fontFace: 'Calibri' })
  const bridgeItems = [
    { label: 'LTM NOI (Base)', value: 24.6, add: false, base: true },
    { label: '+ Mark-to-Market Rents', value: 3.8, add: true },
    { label: '+ Reno Premium (Ph II)', value: 2.4, add: true },
    { label: '+ Ancillary Income', value: 0.5, add: true },
    { label: '+ Mgmt Consolidation', value: 0.8, add: true },
    { label: '+ RevMgmt Software', value: 0.4, add: true },
    { label: '− Insurance Inflation', value: -0.5, add: false },
    { label: '− Tax Step-Ups', value: -0.4, add: false },
    { label: 'Stabilised NOI (Yr 3)', value: 31.6, add: false, base: true },
  ]
  const maxV = 31.6
  bridgeItems.forEach((item, i) => {
    const y = 1.6 + i * 0.52
    const barW = Math.abs(item.value) / maxV * 4.5
    const barX = 8.35
    const color = item.base ? NAVY : (item.value >= 0 ? GREEN : RED)
    sl.addText(item.label, { x: 8.3, y, w: 2.6, h: 0.42, fontSize: 8, color: DGREY, fontFace: 'Calibri', valign: 'middle', align: 'right' })
    sl.addShape(prs.ShapeType.rect, { x: barX, y: y + 0.06, w: barW, h: 0.3, fill: { color }, line: { color } })
    sl.addText(`$${Math.abs(item.value)}M`, { x: barX + barW + 0.05, y, w: 0.8, h: 0.42, fontSize: 8, bold: item.base, color: item.base ? NAVY : MGREY, fontFace: 'Calibri', valign: 'middle' })
  })
}

// ════════════════════════════════════════════════════════════════
// SLIDE 7 — VALUE-ADD PLAN
// ════════════════════════════════════════════════════════════════
{
  const sl = prs.addSlide()
  sl.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.1, fill: { color: NAVY }, line: { color: NAVY } })
  goldBar(sl, 1.1, 0.04)
  sectionLabel(sl, 'VALUE-ADD BUSINESS PLAN', 0.4, 0.18)
  slideTitle(sl, '$21.1M Targeted Capital Program Driving $31.6M Stabilised NOI', 0.4, 0.42, 12.5)

  addTable(sl, [
    ['Workstream', 'Units / Scope', 'Total CapEx', 'Rent Premium', 'ROC'],
    [{ text: 'Unit Renovations (Phase II)', align: 'left' }, '1,427 units', '$12.1M', '+$142/mo', '20.1%'],
    [{ text: 'Amenity Upgrades', align: 'left' }, '14 properties', '$3.2M', '+$18/mo', 'N/A'],
    [{ text: 'Smart Home / Package Lockers', align: 'left' }, '2,847 units', '$1.9M', '+$12/mo', '9.2%'],
    [{ text: 'Exterior & Curb Appeal', align: 'left' }, '14 properties', '$2.1M', 'N/A', 'N/A'],
    [{ text: 'Deferred Maintenance', align: 'left' }, '14 properties', '$1.8M', 'N/A', 'N/A'],
    [{ text: 'Total Capital Program', align: 'left', bold: true }, '', { text: '$21.1M', bold: true }, { text: '+$172/mo avg.', bold: true }, { text: '18.7%', bold: true }],
  ], 0.3, 1.25, 12.7, [3.2, 1.7, 1.3, 1.5, 1.3], 9)

  const ops = [
    ['Property Mgmt Consolidation', 'Replace 3 incumbent managers with single institutional operator. Fee reduction from 9.1% to 7.5% EGI = $0.8M/year savings. Centralised leasing, maintenance hub model, portfolio-wide revenue management deployment.', '−$0.8M/yr cost'],
    ['Revenue Mgmt Software', 'RealPage AI or equivalent dynamic pricing across all 14 assets. Comparable deployments: 1.5–2.5% NOI uplift through lease expiration staggering, real-time competitor rate monitoring, unit-type pricing optimisation.', '+$0.4–0.6M/yr'],
    ['Ancillary Income Expansion', 'RUBS expansion to 8 unenrolled properties (utility recovery 60% → 85%); structured parking ($30–50/mo); pet rent standardisation ($50/mo); package locker monetisation. Combined target: $500K NOI by end of Year 1.', '+$0.5M/yr'],
    ['Tax Appeal Strategy', 'Property tax counsel engaged in Atlanta and Tampa — assessments appear 12–18% above FMV. 50% probability of success = $280K–$420K permanent tax reduction per annum.', '$280–420K/yr'],
  ]
  ops.forEach(([title, body, impact], i) => {
    const x = 0.3 + (i % 2) * 6.5
    const y = 3.55 + Math.floor(i / 2) * 1.85
    sl.addShape(prs.ShapeType.rect, { x, y, w: 6.2, h: 1.75, fill: { color: 'F8F9FA' }, line: { color: LGREY, pt: 0.5 } })
    sl.addText(title, { x: x + 0.15, y: y + 0.1, w: 4.2, h: 0.32, fontSize: 10, bold: true, color: NAVY, fontFace: 'Calibri', valign: 'middle' })
    sl.addText(impact, { x: x + 4.4, y: y + 0.1, w: 1.65, h: 0.32, fontSize: 8.5, bold: true, color: GREEN, fontFace: 'Calibri', valign: 'middle', align: 'right' })
    sl.addText(body,   { x: x + 0.15, y: y + 0.46, w: 5.9,  h: 1.18, fontSize: 8.5, color: DGREY, fontFace: 'Calibri', valign: 'top', wrap: true })
  })
}

// ════════════════════════════════════════════════════════════════
// SLIDE 8 — CAPITAL STRUCTURE
// ════════════════════════════════════════════════════════════════
{
  const sl = prs.addSlide()
  sl.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.1, fill: { color: NAVY }, line: { color: NAVY } })
  goldBar(sl, 1.1, 0.04)
  sectionLabel(sl, 'CAPITAL STRUCTURE', 0.4, 0.18)
  slideTitle(sl, 'Conservative 60% LTV with Strong Day-One DSCR of 1.24x', 0.4, 0.42, 12.5)

  addTable(sl, [
    ['Tranche', 'Amount', '% of Cap', 'Rate / Spread', 'Maturity', 'Notes'],
    [{ text: 'Senior Term Loan', align: 'left' }, '$283.7M', '60.0%', 'SOFR + 190 bps', '5+1+1 yr', { text: 'IO Yr 1–2; rate cap SOFR @ 6.0%', align: 'left' }],
    [{ text: 'Revolving Credit Facility', align: 'left' }, '$15.0M', '3.2%', 'SOFR + 210 bps', '3 yr', { text: 'CapEx & working capital; undrawn at close', align: 'left' }],
    [{ text: 'Sponsor LP Equity', align: 'left' }, '$189.1M', '40.0%', 'N/A', 'N/A', { text: 'Commingled RE fund; management co-invest 2.5%', align: 'left' }],
    [{ text: 'Total', align: 'left', bold: true }, { text: '$487.8M', bold: true }, { text: '103.2%', bold: true }, '', '', ''],
  ], 0.3, 1.25, 12.7, [1.9, 1.0, 0.85, 1.4, 0.85, 4.0], 9)

  // Coverage metrics
  sl.addText('Debt Coverage Metrics', { x: 0.3, y: 3.15, w: 12.5, h: 0.3, fontSize: 11, bold: true, color: NAVY, fontFace: 'Calibri' })
  addTable(sl, [
    ['Metric', 'At Close', 'Year 2', 'Year 3 (Stabilised)', 'Covenant'],
    [{ text: 'LTV Ratio', align: 'left' }, '60.0%', '57.2%', '53.8%', '< 70.0%'],
    [{ text: 'DSCR (NOI / Debt Service)', align: 'left' }, { text: '1.24x', bold: true }, '1.38x', { text: '1.59x', bold: true, color: GREEN }, '> 1.20x'],
    [{ text: 'Interest Coverage (NOI / Interest)', align: 'left' }, '2.04x', '2.27x', '2.62x', '> 1.50x'],
    [{ text: 'Break-even Occupancy', align: 'left' }, '81.2%', '78.6%', '75.1%', 'N/A'],
  ], 0.3, 3.5, 12.7, [2.9, 1.3, 1.3, 1.9, 1.5], 9)

  // Cap stack waterfall
  sl.addText('Capital Stack', { x: 0.3, y: 5.1, w: 4.0, h: 0.3, fontSize: 11, bold: true, color: NAVY, fontFace: 'Calibri' })
  // Senior debt bar (60%)
  sl.addShape(prs.ShapeType.rect, { x: 0.3, y: 5.45, w: 7.6 * 0.60, h: 0.7, fill: { color: SBLUE }, line: { color: NAVY } })
  sl.addText('Senior TL: $283.7M (60%)', { x: 0.3, y: 5.45, w: 7.6 * 0.60, h: 0.7, fontSize: 9, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle' })
  // Equity bar (40%)
  sl.addShape(prs.ShapeType.rect, { x: 0.3 + 7.6 * 0.60, y: 5.45, w: 7.6 * 0.40, h: 0.7, fill: { color: GOLD }, line: { color: GOLD } })
  sl.addText('Equity: $189.1M (40%)', { x: 0.3 + 7.6 * 0.60, y: 5.45, w: 7.6 * 0.40, h: 0.7, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri', align: 'center', valign: 'middle' })

  sl.addText(
    'Interest rate risk partially mitigated by 3-year rate cap (SOFR @ 6.0%). Floating rate loan assumption: SOFR 4.85% declining to 4.20% by Year 2. ' +
    'Refinancing risk in Years 4–5 is the primary macro sensitivity in the bear case scenario.',
    { x: 0.3, y: 6.3, w: 12.7, h: 0.7, fontSize: 8, color: MGREY, fontFace: 'Calibri', valign: 'top', wrap: true, italic: true }
  )
}

// ════════════════════════════════════════════════════════════════
// SLIDE 9 — RETURNS ANALYSIS
// ════════════════════════════════════════════════════════════════
{
  const sl = prs.addSlide()
  sl.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.1, fill: { color: NAVY }, line: { color: NAVY } })
  goldBar(sl, 1.1, 0.04)
  sectionLabel(sl, 'RETURNS ANALYSIS', 0.4, 0.18)
  slideTitle(sl, 'Base Case 18.5% Gross IRR / 2.2x MOIC — Exceeds 20% in Bull Scenario', 0.4, 0.42, 12.5)

  addTable(sl, [
    ['', 'Bear Case', 'Base Case', 'Bull Case', 'Upside Case'],
    [{ text: 'NOI CAGR (Yr 1–5)', align: 'left' }, '4.8%', '6.2%', '7.8%', '9.1%'],
    [{ text: 'Year 5 NOI', align: 'left' }, '$28.4M', '$31.6M', '$34.8M', '$37.9M'],
    [{ text: 'Exit Cap Rate', align: 'left' }, '5.5%', '5.2%', '4.9%', '4.6%'],
    [{ text: 'Gross Exit Value', align: 'left' }, '$516M', '$608M', '$710M', '$824M'],
    [{ text: 'Gross IRR', align: 'left', bold: true }, { text: '12.4%', color: AMBER }, { text: '18.5%', bold: true, color: GREEN }, { text: '24.7%', bold: true, color: GREEN }, { text: '30.8%', bold: true, color: GREEN }],
    [{ text: 'Equity Multiple (MOIC)', align: 'left', bold: true }, { text: '1.6x', color: AMBER }, { text: '2.2x', bold: true, color: GREEN }, { text: '2.7x', bold: true, color: GREEN }, { text: '3.3x', bold: true, color: GREEN }],
    [{ text: '5Y Cash Yield (avg.)', align: 'left' }, '4.8%', '6.1%', '7.4%', '8.6%'],
  ], 0.3, 1.25, 12.7, [2.2, 2.0, 2.2, 2.1, 2.0], 9.5)

  // Sensitivity table
  sl.addText('Exit Cap Rate Sensitivity — Gross IRR', { x: 0.3, y: 3.8, w: 6.0, h: 0.3, fontSize: 11, bold: true, color: NAVY, fontFace: 'Calibri' })
  addTable(sl, [
    ['Exit Cap Rate ↓ / Hold →', 'Year 4', 'Year 5', 'Year 6'],
    ['4.5%', '22.1%', '21.4%', '20.2%'],
    ['5.0%', '19.8%', '19.2%', '18.1%'],
    [{ text: '5.2%  (Base)', bold: true }, { text: '19.1%', bold: true }, { text: '18.5%', bold: true }, { text: '17.4%', bold: true }],
    ['5.5%', '17.6%', '16.9%', '15.9%'],
    ['6.0%', '14.8%', '14.2%', '13.3%'],
  ], 0.3, 4.15, 6.0, [2.2, 1.25, 1.25, 1.3], 9)

  sl.addText('Key Return Drivers', { x: 6.8, y: 3.8, w: 6.2, h: 0.3, fontSize: 11, bold: true, color: NAVY, fontFace: 'Calibri' })
  const drivers = [
    ['NOI Growth (est. 50% of returns)', '$7.0M NOI improvement → primary value driver; driven by mark-to-market rents + reno premium'],
    ['Leverage Paydown (est. 15%)', 'Debt reduction from $283.7M → ~$238M over 5 years at 6.2% NOI CAGR and IO structure'],
    ['Multiple Arbitrage (est. 35%)', 'Acquiring at 5.2% in-place vs. projected exit at 5.2% stabilised. Operational improvements can compress exit cap rate further in bull case'],
  ]
  drivers.forEach(([title, body], i) => {
    const y = 4.15 + i * 1.05
    sl.addShape(prs.ShapeType.rect, { x: 6.8, y, w: 6.2, h: 0.95, fill: { color: 'F8F9FA' }, line: { color: LGREY, pt: 0.5 } })
    sl.addText(title, { x: 6.95, y: y + 0.08, w: 5.9, h: 0.28, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri', valign: 'middle' })
    sl.addText(body,  { x: 6.95, y: y + 0.4,  w: 5.9, h: 0.48, fontSize: 8.5, color: DGREY, fontFace: 'Calibri', valign: 'top', wrap: true })
  })
}

// ════════════════════════════════════════════════════════════════
// SLIDE 10 — RISK FACTORS
// ════════════════════════════════════════════════════════════════
{
  const sl = prs.addSlide()
  sl.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.1, fill: { color: NAVY }, line: { color: NAVY } })
  goldBar(sl, 1.1, 0.04)
  sectionLabel(sl, 'RISK ASSESSMENT', 0.4, 0.18)
  slideTitle(sl, 'Key Risks Identified — Strong Mitigants in Place', 0.4, 0.42, 12.5)

  const risks = [
    [RED,   'HIGH',   'Interest Rate Risk', 'SOFR-linked debt; 100bps rise above rate cap = $2.8M interest cost; DSCR 1.08x at stress', '3-yr rate cap at SOFR 6.0%; strong NOI growth provides cushion'],
    [RED,   'HIGH',   'Insurance Inflation', 'Sun Belt premiums up 28–42% in 2023–24; modelled at +8%/yr — further rises compress NOI', 'Portfolio-wide bulk bid; parametric insurance review underway'],
    [AMBER, 'MED',   'Renovation Risk', 'Cost overruns or delays reduce ROC from 20.1% to 16.8% and delay rent premium capture', 'Fixed-price contracts with 3 pre-qualified regional contractors'],
    [AMBER, 'MED',   'Supply Pressure (Austin/Nashville)', '8,200 + 9,800 new units in 2025 above historical average — localised concession pressure', 'Only 27.6% of portfolio; Class B insulated from Class A supply'],
    [GREEN, 'LOW',   'Tax Reassessment', 'Purchase price could trigger reassessment in GA/FL — modelled at +4.7%/yr', 'Tax appeal counsel engaged; acquisition structure may limit exposure'],
    [GREEN, 'LOW',   'Macro / Recession', 'Employment shock reduces renter demand, increases delinquency', 'Break-even occupancy 81.2% at close; 12.4% IRR even in bear case'],
  ]

  addTable(sl, [
    ['Severity', 'Risk', 'Specific Concern', 'Mitigation'],
    ...risks.map(([c, sev, name, concern, mit]) => [
      { text: sev, bold: true, color: sev === 'HIGH' ? RED : sev === 'MED' ? AMBER : GREEN },
      { text: name, align: 'left', bold: true },
      { text: concern, align: 'left' },
      { text: mit, align: 'left' },
    ])
  ], 0.3, 1.25, 12.7, [0.8, 2.0, 4.6, 4.1], 8.5)

  sl.addText(
    'Base case returns of 18.5% gross IRR remain above the firm\'s 15% minimum threshold in all modelled scenarios except a simultaneous interest rate + insurance shock coinciding with exit multiple compression — ' +
    'an event with estimated 5–8% historical probability in Sun Belt real estate cycles.',
    { x: 0.3, y: 6.35, w: 12.7, h: 0.8, fontSize: 8.5, color: MGREY, fontFace: 'Calibri', wrap: true, italic: true, valign: 'top' }
  )
}

// ════════════════════════════════════════════════════════════════
// SLIDE 11 — MANAGEMENT TEAM & TRACK RECORD
// ════════════════════════════════════════════════════════════════
{
  const sl = prs.addSlide()
  sl.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.1, fill: { color: NAVY }, line: { color: NAVY } })
  goldBar(sl, 1.1, 0.04)
  sectionLabel(sl, 'MANAGEMENT & TRACK RECORD', 0.4, 0.18)
  slideTitle(sl, 'Axis Capital Advisors — $2.4B AUM · 21.4% Realised IRR Across 4 Funds', 0.4, 0.42, 12.5)

  addTable(sl, [
    ['Name', 'Title', 'Background'],
    [{ text: 'David Thornton', bold: true, align: 'left' }, { text: 'Managing Partner', align: 'left' }, { text: 'Former VP Acquisitions, Equity Residential · $4.2B career transaction volume · MBA Wharton', align: 'left' }],
    [{ text: 'Sarah Chen', bold: true, align: 'left' }, { text: 'Partner, Investments', align: 'left' }, { text: 'Former Greystar acquisition director · Led 7 Sun Belt value-add exits · 22.1% average IRR', align: 'left' }],
    [{ text: 'Marcus Webb', bold: true, align: 'left' }, { text: 'MD, Asset Mgmt', align: 'left' }, { text: 'Former AvalonBay · Implemented RevMgmt across 8,200 units · 14% NOI lift on comparable portfolio', align: 'left' }],
    [{ text: 'Jennifer Park', bold: true, align: 'left' }, { text: 'VP, Finance', align: 'left' }, { text: 'Former Wells Fargo CMBS · $1.8B closed multifamily debt · Key lender relationships across 6 major banks', align: 'left' }],
    [{ text: 'Carlos Rivera', bold: true, align: 'left' }, { text: 'VP, Construction', align: 'left' }, { text: '$180M renovation programs managed · Zero cost overruns >8% on last 6 projects · 200+ contractor relationships', align: 'left' }],
  ], 0.3, 1.25, 12.7, [1.6, 1.7, 9.4], 9)

  sl.addText('Selected Realised Investments', { x: 0.3, y: 3.85, w: 12.5, h: 0.3, fontSize: 11, bold: true, color: NAVY, fontFace: 'Calibri' })
  addTable(sl, [
    ['Portfolio', 'Markets', 'Units', 'Vintage', 'Exit', 'Gross IRR', 'MOIC', 'Strategy'],
    [{ text: 'Palmetto Sun Portfolio', align: 'left' }, 'SC / GA', '1,840', '2018', '2023', { text: '24.8%', color: GREEN, bold: true }, '2.9x', 'Value-Add'],
    [{ text: 'River District Portfolio', align: 'left' }, 'TN / NC', '2,210', '2019', '2024', { text: '21.2%', color: GREEN, bold: true }, '2.6x', 'Value-Add'],
    [{ text: 'Gulf Coast Communities', align: 'left' }, 'FL',      '1,120', '2017', '2022', { text: '19.6%', color: GREEN, bold: true }, '2.4x', 'Value-Add'],
    [{ text: 'Sunbelt Workforce Fund I', align: 'left' }, 'Multi',  '3,450', '2016', '2021', { text: '18.4%', color: AMBER, bold: true }, '2.2x', 'Core-Plus'],
    [{ text: 'Total / Wtd. Avg.', align: 'left', bold: true }, '', { text: '8,620', bold: true }, '', '', { text: '21.4%', bold: true, color: GREEN }, { text: '2.4x', bold: true }, ''],
  ], 0.3, 4.2, 12.7, [2.1, 1.1, 0.75, 0.9, 0.75, 1.0, 0.8, 1.15], 9)
}

// ════════════════════════════════════════════════════════════════
// SLIDE 12 — NEXT STEPS & CONTACT
// ════════════════════════════════════════════════════════════════
{
  const sl = prs.addSlide()
  navyBg(sl)
  goldBar(sl, 0, 0.06)
  goldBar(sl, 7.44, 0.06)

  sl.addText('NEXT STEPS', {
    x: 0.8, y: 0.5, w: 11.73, h: 0.5,
    fontSize: 11, bold: true, color: GOLD, fontFace: 'Calibri', align: 'center'
  })
  sl.addText('Summit Ridge Portfolio — Path to LOI', {
    x: 0.8, y: 1.05, w: 11.73, h: 0.7,
    fontSize: 32, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center'
  })

  const steps = [
    ['01', 'Execute NDA', 'Receive full financial model, rent rolls, and property-level DD package', 'Now'],
    ['02', 'Management Presentation', 'Site visits available: Atlanta · Nashville · Austin (April 22–24)', 'Apr 22–24'],
    ['03', 'Indicative LOI', 'Non-binding letter of intent with proposed terms', 'Apr 30'],
    ['04', 'Best & Final Round', 'Final pricing and LOI from shortlisted bidders', 'May 15'],
    ['05', 'Targeted Close', 'Subject to lender confirmation and standard PE approvals', 'Jun 30'],
  ]

  steps.forEach(([num, title, desc, date], i) => {
    const x = 0.5 + i * 2.46
    sl.addShape(prs.ShapeType.rect, { x, y: 2.0, w: 2.28, h: 3.2, fill: { color: SBLUE }, line: { color: GOLD, pt: 1 } })
    sl.addShape(prs.ShapeType.rect, { x, y: 2.0, w: 2.28, h: 0.5, fill: { color: GOLD }, line: { color: GOLD } })
    sl.addText(num, { x, y: 2.0, w: 2.28, h: 0.5, fontSize: 16, bold: true, color: NAVY, fontFace: 'Calibri', align: 'center', valign: 'middle' })
    sl.addText(title, { x: x + 0.1, y: 2.6, w: 2.08, h: 0.5, fontSize: 11, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle' })
    sl.addText(desc,  { x: x + 0.1, y: 3.2, w: 2.08, h: 1.4, fontSize: 8.5, color: LGREY, fontFace: 'Calibri', align: 'center', valign: 'top', wrap: true })
    sl.addText(date,  { x: x + 0.1, y: 4.8, w: 2.08, h: 0.3, fontSize: 9, bold: true, color: GOLD, fontFace: 'Calibri', align: 'center', valign: 'middle' })
  })

  sl.addShape(prs.ShapeType.rect, { x: 1.0, y: 5.4, w: 11.3, h: 1.6, fill: { color: SBLUE }, line: { color: GOLD, pt: 0.5 } })
  sl.addText('CONTACT', { x: 1.0, y: 5.45, w: 11.3, h: 0.3, fontSize: 9, bold: true, color: GOLD, fontFace: 'Calibri', align: 'center' })
  sl.addText(
    'Sarah Chen, Partner  ·  s.chen@axiscapitaladvisors.com  ·  +1 (404) 555-0182\n' +
    'Jennifer Park, VP Finance  ·  j.park@axiscapitaladvisors.com  ·  +1 (404) 555-0194\n' +
    'Axis Capital Advisors  ·  1180 Peachtree St NE, Suite 2400, Atlanta, GA 30309',
    { x: 1.0, y: 5.78, w: 11.3, h: 1.1, fontSize: 10, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle', lineSpacingMultiple: 1.4 }
  )
}

// ─── Save ────────────────────────────────────────────────────
prs.writeFile({ fileName: OUT }).then(() => {
  const fs = require('fs')
  const sz = fs.statSync(OUT).size
  console.log(`Created: ${OUT}`)
  console.log(`Size: ${sz.toLocaleString()} bytes`)
}).catch(console.error)
