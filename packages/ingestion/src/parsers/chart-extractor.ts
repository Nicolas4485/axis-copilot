// chart-extractor.ts — PDF page rendering + Claude vision for chart/table extraction
// Used during CIM analysis to surface visual financial data that text parsers miss.
// Only processes pages with < 40 words (chart-heavy indicator).
// Falls back gracefully if pdf2pic / GraphicsMagick is not available.

import pdfParse from 'pdf-parse'
import type { InferenceEngine } from '@axis/inference'
import { getPromptText } from '@axis/inference'

const CHART_PAGE_WORD_THRESHOLD = 40  // pages with fewer words are treated as chart-heavy
const DEFAULT_MAX_CHART_PAGES = 25    // cost guard: max pages to render per document

interface ChartPageResult {
  pageNumber: number   // 1-indexed
  description: string
}

/**
 * Extract structured text descriptions from chart-heavy pages in a PDF.
 *
 * Steps:
 * 1. Count words per page using pdf-parse text extraction (no canvas needed)
 * 2. Flag pages with < 40 words as potential chart/figure pages
 * 3. Render each flagged page to PNG using pdf2pic
 * 4. Send each PNG to Claude Sonnet vision with CHART_EXTRACTION prompt
 * 5. Return non-null descriptions for indexing alongside text chunks
 */
export async function extractChartPages(
  pdfBuffer: Buffer,
  engine: InferenceEngine,
  options?: { maxChartPages?: number }
): Promise<ChartPageResult[]> {
  const maxChartPages = options?.maxChartPages ?? DEFAULT_MAX_CHART_PAGES
  const systemPrompt = getPromptText('CHART_EXTRACTION')

  // Step 1: Count words per page
  const pageWordCounts: number[] = []

  try {
    await pdfParse(pdfBuffer, {
      // pagerender is called once per page in sequence
      pagerender: async (pageData: unknown) => {
        try {
          const pd = pageData as {
            getTextContent: (opts?: Record<string, unknown>) => Promise<{ items: Array<{ str: string }> }>
          }
          const textContent = await pd.getTextContent({ normalizeWhitespace: true })
          const text = textContent.items.map((i) => i.str).join(' ')
          const wordCount = text.trim().split(/\s+/).filter(Boolean).length
          pageWordCounts.push(wordCount)
        } catch {
          pageWordCounts.push(999) // on parse error, assume text-heavy (skip)
        }
        return ''
      },
    })
  } catch (err) {
    console.warn('[ChartExtractor] pdf-parse per-page scan failed — skipping chart extraction:', err instanceof Error ? err.message : err)
    return []
  }

  // Step 2: Find chart-heavy pages (1-indexed)
  const chartPageNumbers = pageWordCounts
    .map((count, idx) => ({ page: idx + 1, words: count }))
    .filter(({ words }) => words < CHART_PAGE_WORD_THRESHOLD)
    .slice(0, maxChartPages)
    .map(({ page }) => page)

  if (chartPageNumbers.length === 0) return []

  console.info(`[ChartExtractor] ${chartPageNumbers.length} chart-heavy pages detected: ${chartPageNumbers.join(', ')}`)

  // Step 3: Render pages to PNG and call Claude vision
  // Lazy-load pdf2pic to avoid hard failure if GraphicsMagick is not installed
  let fromBuffer: ((buf: Buffer, opts: Record<string, unknown>) => (page: number, opts?: Record<string, unknown>) => Promise<{ base64: string | null }>) | null = null

  try {
    const pdf2picModule = await import('pdf2pic')
    fromBuffer = pdf2picModule.fromBuffer as unknown as typeof fromBuffer
  } catch (err) {
    console.warn('[ChartExtractor] pdf2pic unavailable (GraphicsMagick/Ghostscript required) — skipping chart extraction:', err instanceof Error ? err.message : err)
    return []
  }

  // fromBuffer is non-null here — catch block returns early on failure
  const converter = fromBuffer!(pdfBuffer, {
    density: 150,
    format: 'png',
    width: 1200,
    height: 1600,
  })

  const results: ChartPageResult[] = []

  for (const pageNum of chartPageNumbers) {
    try {
      const rendered = await converter(pageNum, { responseType: 'base64' })
      if (!rendered.base64) continue

      const description = await engine.generateWithVision(
        systemPrompt,
        'Analyze this page from a private equity CIM.',
        rendered.base64,
        'image/png',
        800
      )

      // Filter out null responses (text-only pages that slipped through)
      const trimmed = description.trim()
      if (trimmed && trimmed.toLowerCase() !== 'null') {
        results.push({ pageNumber: pageNum, description: trimmed })
      }
    } catch (err) {
      console.warn(`[ChartExtractor] Failed to process page ${pageNum}:`, err instanceof Error ? err.message : err)
      // Continue — one page failure should not abort the whole extraction
    }
  }

  console.info(`[ChartExtractor] Extracted ${results.length} chart descriptions`)
  return results
}
