// financial-extractor.ts — Structured financial data extraction from PDF CIMs
//
// Scans all pages of a PDF for financial statement tables and extracts:
//   • Revenue, EBITDA, Net Income, Gross Profit (with year labels)
//   • Calculated margins and growth rates
//   • Exact page references for each figure
//
// Uses pdf-parse text extraction (no vision required) — fast and cost-free.
// Falls back gracefully if pdf-parse fails.

import pdfParse from 'pdf-parse'

// ─── Public types ──────────────────────────────────────────────────────────────

export interface FinancialYear {
  year:          string           // "2022", "FY2023", "LTM", "2024E", etc.
  revenue:       number | null    // in millions
  ebitda:        number | null
  grossProfit:   number | null
  netIncome:     number | null
  ebitdaMargin:  number | null    // % calculated
  grossMargin:   number | null    // % calculated
  revenueGrowth: number | null    // % YoY calculated
}

export interface FinancialExtraction {
  years:       FinancialYear[]
  currency:    string              // "USD", "EUR", "GBP", etc.
  unit:        string              // "millions", "thousands", "actual"
  pageRefs:    Record<string, number[]>  // metric → pages where found
  confidence:  'high' | 'medium' | 'low'
  rawSnippets: string[]            // raw table text for debugging
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Financial statement page keywords — pages with these are likely financials
const FINANCIAL_PAGE_KEYWORDS = [
  'revenue', 'net revenue', 'total revenue', 'sales',
  'ebitda', 'earnings before', 'operating income',
  'gross profit', 'gross margin',
  'income statement', 'profit and loss', 'p&l', 'statement of operations',
  'financial highlights', 'financial summary', 'key financials',
  'historical financials', 'projected financials', 'forecast',
]

// Year patterns — match common CIM year formats
const YEAR_PATTERNS = [
  /\b(20\d{2}[EA]?)\b/g,            // 2020, 2021E, 2022A
  /\bFY\s*(20\d{2})\b/gi,           // FY2022, FY 2023
  /\bLTM\b/g,                        // Last Twelve Months
  /\bNTM\b/g,                        // Next Twelve Months
  /\bH[12]\s*(20\d{2})\b/gi,        // H1 2023, H2 2022
]

// Currency/unit detection
const CURRENCY_PATTERNS: Array<[RegExp, string]> = [
  [/\$[\d,]+(?:\.\d+)?[MK]?\b/, 'USD'],
  [/£[\d,]+(?:\.\d+)?[MK]?\b/, 'GBP'],
  [/€[\d,]+(?:\.\d+)?[MK]?\b/, 'EUR'],
  [/USD\b/i, 'USD'],
  [/GBP\b/i, 'GBP'],
  [/EUR\b/i, 'EUR'],
]

const UNIT_PATTERNS: Array<[RegExp, string]> = [
  [/in millions|(\$|USD|EUR|GBP) ?millions|\([\$€£]M\)/i, 'millions'],
  [/in thousands|(\$|USD|EUR|GBP) ?thousands|\([\$€£]K\)/i, 'thousands'],
  [/in billions|\([\$€£]B\)/i, 'billions'],
]

// ─── Number parsing ───────────────────────────────────────────────────────────

/**
 * Parse a financial number string like "$28.4M", "28,400", "(15.2)", "15.2M" etc.
 * Returns null if unparseable.
 */
function parseFinancialNumber(raw: string): number | null {
  const s = raw.trim()
  const negative = s.startsWith('(') && s.endsWith(')')
  const cleaned = s.replace(/[($),%\s]/g, '').replace(/,/g, '')

  let mult = 1
  if (/M$/i.test(cleaned)) mult = 1
  if (/K$/i.test(cleaned)) mult = 0.001
  if (/B$/i.test(cleaned)) mult = 1000

  const num = parseFloat(cleaned.replace(/[MKB]$/i, ''))
  if (isNaN(num)) return null
  return (negative ? -num : num) * mult
}

/**
 * Extract all numbers from a line of text.
 */
function extractNumbers(line: string): number[] {
  const nums: number[] = []
  // Match number patterns: 28.4, 28,400, $28.4M, (15.2), 15.2%
  const matches = line.matchAll(/(?<!\w)[\(\$€£]?[\d,]+(?:\.\d+)?[MKB%]?(?:\))?(?!\w)/g)
  for (const m of matches) {
    const n = parseFinancialNumber(m[0])
    if (n !== null && !isNaN(n) && n >= 0 && n < 100_000) {  // sanity range for $M figures
      nums.push(n)
    }
  }
  return nums
}

// ─── Financial row detection ──────────────────────────────────────────────────

interface FinancialRow {
  metric: string
  values: number[]
  rawLine: string
  page: number
}

/**
 * Determine if a line is a financial metric row and which metric it is.
 * Returns the metric name or null if not a financial row.
 */
function classifyMetric(line: string): string | null {
  const lower = line.toLowerCase()

  if (/\b(total\s+)?revenue|net\s+revenue|total\s+sales?|net\s+sales?\b/.test(lower)) return 'revenue'
  if (/\barr\b|\bannual\s+recurring\s+revenue/.test(lower)) return 'arr'
  if (/\bebitda\b(?!\s+margin)/.test(lower)) return 'ebitda'
  if (/\bgross\s+profit\b(?!\s+margin)/.test(lower)) return 'grossProfit'
  if (/\bnet\s+income\b|\bnet\s+earnings?\b/.test(lower)) return 'netIncome'
  if (/\bgross\s+margin\b/.test(lower)) return 'grossMargin'
  if (/\bebitda\s+margin\b/.test(lower)) return 'ebitdaMargin'

  return null
}

// ─── Year detection ───────────────────────────────────────────────────────────

/**
 * Extract year labels from a header line like "  2021  2022  2023  2024E"
 */
function extractYearLabels(line: string): string[] {
  const years: string[] = []
  const text = line.toUpperCase()

  // LTM/NTM first
  if (/LTM/.test(text)) years.push('LTM')
  if (/NTM/.test(text)) years.push('NTM')

  // Year numbers
  const matches = text.matchAll(/\b(FY)?\s*(20\d{2})\s*([EAP])?\b/g)
  for (const m of matches) {
    const year = `${m[2]}${m[3] ?? ''}`
    if (!years.includes(year)) years.push(year)
  }

  return years
}

/**
 * Check if a line looks like a year header row.
 */
function isYearHeaderLine(line: string): boolean {
  const labels = extractYearLabels(line)
  return labels.length >= 2  // at least 2 year labels = likely a header
}

// ─── Financial page scoring ───────────────────────────────────────────────────

function financialPageScore(text: string): number {
  const lower = text.toLowerCase()
  let score = 0
  for (const kw of FINANCIAL_PAGE_KEYWORDS) {
    if (lower.includes(kw)) score++
  }
  return score
}

// ─── Main extractor ───────────────────────────────────────────────────────────

/**
 * Extract structured financial data from a PDF buffer.
 * Returns a FinancialExtraction or null if no financial tables found.
 */
export async function extractFinancials(pdfBuffer: Buffer): Promise<FinancialExtraction | null> {
  // Step 1: Extract text per page
  const pageTexts: string[] = []

  try {
    await pdfParse(pdfBuffer, {
      pagerender: async (pageData: unknown) => {
        try {
          const pd = pageData as {
            getTextContent: (opts?: Record<string, unknown>) => Promise<{ items: Array<{ str: string }> }>
          }
          const content = await pd.getTextContent({ normalizeWhitespace: true })
          const text = content.items.map((i) => i.str).join(' ')
          pageTexts.push(text)
        } catch {
          pageTexts.push('')
        }
        return ''
      },
    })
  } catch {
    // Fallback: try parsing whole document
    try {
      const parsed = await pdfParse(pdfBuffer)
      pageTexts.push(parsed.text)
    } catch {
      return null
    }
  }

  if (pageTexts.length === 0) return null

  // Step 2: Detect currency and unit from full text
  const fullText = pageTexts.join('\n')
  let currency = 'USD'
  let unit = 'millions'

  for (const [pattern, curr] of CURRENCY_PATTERNS) {
    if (pattern.test(fullText)) { currency = curr; break }
  }
  for (const [pattern, u] of UNIT_PATTERNS) {
    if (pattern.test(fullText)) { unit = u; break }
  }

  // Step 3: Score each page, focus on financial pages
  const financialPages: Array<{ pageIdx: number; score: number; text: string }> = []

  for (let i = 0; i < pageTexts.length; i++) {
    const score = financialPageScore(pageTexts[i]!)
    if (score >= 2) {  // at least 2 financial keywords
      financialPages.push({ pageIdx: i, score, text: pageTexts[i]! })
    }
  }

  if (financialPages.length === 0) return null

  // Sort by financial relevance
  financialPages.sort((a, b) => b.score - a.score)

  // Step 4: Extract financial rows from top-scoring pages
  const rows: FinancialRow[] = []
  const rawSnippets: string[] = []
  const pageRefs: Record<string, number[]> = {}

  for (const page of financialPages.slice(0, 10)) {  // process top 10 financial pages
    const lines = page.text.split(/\n|  {2,}/)  // split by newlines or multi-space
    let currentYears: string[] = []
    const pageNum = page.pageIdx + 1

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue

      // Check for year header
      if (isYearHeaderLine(line)) {
        const detected = extractYearLabels(line)
        if (detected.length >= 2) currentYears = detected
        continue
      }

      // Check for metric row
      const metric = classifyMetric(line)
      if (!metric) continue

      const numbers = extractNumbers(line)
      if (numbers.length === 0) continue

      // We need at least 1 number that could be a revenue/EBITDA figure
      const validNumbers = numbers.filter((n) => n > 0.1)  // filter out percentage-only rows
      if (validNumbers.length === 0) continue

      rows.push({ metric, values: validNumbers, rawLine: line, page: pageNum })

      if (!pageRefs[metric]) pageRefs[metric] = []
      if (!pageRefs[metric]!.includes(pageNum)) {
        pageRefs[metric]!.push(pageNum)
      }

      rawSnippets.push(`[p.${pageNum}] ${line}`)
    }

    // Also look for % margins inline (often on same page)
    if (page.score >= 3 && rawSnippets.length > 0) {
      const snippetLine = page.text.substring(0, 200).replace(/\s+/g, ' ').trim()
      if (snippetLine.length > 30) rawSnippets.push(`[p.${pageNum} header] ${snippetLine}`)
    }
  }

  if (rows.length === 0) return null

  // Step 5: Build year-indexed financial data
  // Find the best revenue row to determine year count
  const revenueRows = rows.filter((r) => r.metric === 'revenue' || r.metric === 'arr')
  const ebitdaRows = rows.filter((r) => r.metric === 'ebitda')
  const grossProfitRows = rows.filter((r) => r.metric === 'grossProfit')
  const grossMarginRows = rows.filter((r) => r.metric === 'grossMargin')
  const ebitdaMarginRows = rows.filter((r) => r.metric === 'ebitdaMargin')

  // Use the row with most values as year count reference
  const referenceRow = [...revenueRows, ...ebitdaRows]
    .sort((a, b) => b.values.length - a.values.length)[0]

  if (!referenceRow) return null

  const numYears = Math.min(referenceRow.values.length, 6)  // cap at 6 years

  // Detect years from financial pages' year headers
  let detectedYears: string[] = []
  for (const page of financialPages.slice(0, 5)) {
    for (const line of page.text.split(/\n|  {2,}/)) {
      if (isYearHeaderLine(line)) {
        const yl = extractYearLabels(line)
        if (yl.length >= 2 && yl.length > detectedYears.length) {
          detectedYears = yl
        }
      }
    }
  }

  // Generate fallback year labels if we couldn't detect them
  if (detectedYears.length < numYears) {
    const currentYear = new Date().getFullYear()
    detectedYears = Array.from({ length: numYears }, (_, i) =>
      String(currentYear - (numYears - 1 - i))
    )
  }

  // Build FinancialYear array
  const years: FinancialYear[] = Array.from({ length: numYears }, (_, i) => ({
    year:          detectedYears[i] ?? String(i),
    revenue:       revenueRows[0]?.values[i] ?? null,
    ebitda:        ebitdaRows[0]?.values[i] ?? null,
    grossProfit:   grossProfitRows[0]?.values[i] ?? null,
    netIncome:     null,
    ebitdaMargin:  null,
    grossMargin:   null,
    revenueGrowth: null,
  }))

  // Calculate margins and growth
  for (let i = 0; i < years.length; i++) {
    const yr = years[i]!

    // Inline margin rows take priority over calculated
    if (ebitdaMarginRows[0]?.values[i] !== undefined) {
      yr.ebitdaMargin = ebitdaMarginRows[0].values[i]!
    } else if (yr.revenue && yr.ebitda) {
      yr.ebitdaMargin = Math.round((yr.ebitda / yr.revenue) * 1000) / 10
    }

    if (grossMarginRows[0]?.values[i] !== undefined) {
      yr.grossMargin = grossMarginRows[0].values[i]!
    } else if (yr.revenue && yr.grossProfit) {
      yr.grossMargin = Math.round((yr.grossProfit / yr.revenue) * 1000) / 10
    }

    if (i > 0 && years[i - 1]?.revenue && yr.revenue) {
      const prev = years[i - 1]!.revenue!
      yr.revenueGrowth = Math.round(((yr.revenue - prev) / Math.abs(prev)) * 1000) / 10
    }
  }

  // Step 6: Assess confidence
  const hasRevenue  = revenueRows.length > 0
  const hasEbitda   = ebitdaRows.length > 0
  const hasMultiYear = numYears >= 2
  let confidence: 'high' | 'medium' | 'low' = 'low'
  if (hasRevenue && hasEbitda && hasMultiYear) confidence = 'high'
  else if (hasRevenue && hasMultiYear) confidence = 'medium'

  return {
    years,
    currency,
    unit,
    pageRefs,
    confidence,
    rawSnippets: rawSnippets.slice(0, 20),
  }
}

/**
 * Format extracted financials as a concise text block for prompt injection.
 */
export function formatFinancialsForPrompt(data: FinancialExtraction): string {
  if (data.years.length === 0) return ''

  const currencySymbol = data.currency === 'USD' ? '$' : data.currency === 'EUR' ? '€' : '£'
  const unitLabel = data.unit === 'millions' ? 'M' : data.unit === 'thousands' ? 'K' : ''

  const header = data.years.map((y) => y.year.padEnd(8)).join('')
  const revRow = data.years.map((y) =>
    y.revenue != null ? `${currencySymbol}${y.revenue}${unitLabel}`.padEnd(8) : 'n/a     '
  ).join('')
  const ebitdaRow = data.years.map((y) =>
    y.ebitda != null ? `${currencySymbol}${y.ebitda}${unitLabel}`.padEnd(8) : 'n/a     '
  ).join('')
  const ebitdaMarginRow = data.years.map((y) =>
    y.ebitdaMargin != null ? `${y.ebitdaMargin}%`.padEnd(8) : 'n/a     '
  ).join('')
  const growthRow = data.years.map((y) =>
    y.revenueGrowth != null ? `${y.revenueGrowth > 0 ? '+' : ''}${y.revenueGrowth}%`.padEnd(8) : '—       '
  ).join('')

  const pageRefText = Object.entries(data.pageRefs)
    .map(([metric, pages]) => `${metric}: p.${pages.join(', ')}`)
    .join(' | ')

  return `EXTRACTED FINANCIALS (${data.confidence} confidence — ${data.unit}, ${data.currency}):
  Year:          ${header}
  Revenue:       ${revRow}
  EBITDA:        ${ebitdaRow}
  EBITDA Margin: ${ebitdaMarginRow}
  Rev Growth:    ${growthRow}
  Page refs: ${pageRefText || 'not available'}`
}
