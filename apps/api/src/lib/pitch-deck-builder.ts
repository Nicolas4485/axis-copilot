// Pitch Deck Builder — generates a PE-standard IC Memo pitch deck (.pptx)
// from an IC Memo result object using PptxGenJS.
//
// Palette: Midnight Executive (navy / ice-blue / gold / white)
// Layout: LAYOUT_16x9 (10" × 5.625")

import PptxGenJSModule from 'pptxgenjs'
import type { default as PptxGenJSClass } from 'pptxgenjs'
// @ts-expect-error pptxgenjs declares `export as namespace PptxGenJS` (UMD pattern) which TypeScript
// treats as a namespace rather than a class, preventing direct use as a type. No clean workaround
// exists — the library's type definitions cause this limitation in strict module mode.
type PptxPresentation = PptxGenJSClass
// Handle ESM/CJS interop: pptxgenjs is CJS, default export may be wrapped
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PptxGenJS = ((PptxGenJSModule as any).default ?? PptxGenJSModule) as unknown as new () => PptxPresentation

// ─── Types ────────────────────────────────────────────────────────────────────

interface MemoSection {
  id: string
  title: string
  content: string
}

interface IcMemoResult {
  companyName: string
  dealId: string
  sections: MemoSection[]
  generatedAt?: string
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  NAVY:       '1E2761',
  NAVY_MID:   '2B3990',
  ICE:        'CADCFC',
  ICE_LIGHT:  'E8F0FE',
  GOLD:       'C9A84C',
  GOLD_LIGHT: 'F2E4BB',
  WHITE:      'FFFFFF',
  OFF_WHITE:  'F5F7FA',
  CHARCOAL:   '1A1A2E',
  MID_GRAY:   '4A5568',
  LIGHT_GRAY: '718096',
  BORDER:     'CBD5E0',
  RED_FLAG:   'C53030',
  RED_BG:     'FFF5F5',
  GREEN:      '276749',
  AMBER:      'C05621',
}

const FONT_TITLE = 'Cambria'
const FONT_BODY  = 'Calibri'

// ─── Helper: strip markdown from content for slide use ────────────────────────

function stripMd(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')   // bold
    .replace(/\*(.*?)\*/g, '$1')        // italic
    .replace(/#{1,6}\s/g, '')           // headings
    .replace(/\|[^\n]+\|/g, '')         // tables (remove rows)
    .replace(/[-—]{3,}/g, '')           // horizontal rules
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .trim()
}

// ─── Helper: get first N words of text ───────────────────────────────────────

function firstWords(text: string, count: number): string {
  const words = stripMd(text).split(/\s+/)
  return words.slice(0, count).join(' ') + (words.length > count ? '...' : '')
}

// ─── Helper: extract bullet points from section content ──────────────────────

function extractBullets(content: string, maxBullets = 6): string[] {
  const lines = content.split('\n')
  const bullets: string[] = []
  for (const line of lines) {
    const trimmed = line.replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, '').trim()
    if (trimmed.length > 15 && trimmed.length < 250 && !trimmed.startsWith('|')) {
      const clean = stripMd(trimmed)
      if (clean.length > 15) bullets.push(clean)
      if (bullets.length >= maxBullets) break
    }
  }
  return bullets
}

// ─── Helper: extract key-value pairs from "**Label:** value" lines ───────────

function extractKV(content: string, maxPairs = 8): Array<{ key: string; value: string }> {
  const pairs: Array<{ key: string; value: string }> = []
  const regex = /\*\*([^*]+)\*\*[:\s]+([^\n*]+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null && pairs.length < maxPairs) {
    const key = match[1]?.trim()
    const value = match[2]?.trim()
    if (key && value && value.length < 150) pairs.push({ key, value })
  }
  return pairs
}

// ─── Helper: extract table rows from markdown tables ─────────────────────────

function extractTableRows(content: string, maxRows = 6): Array<string[]> {
  const rows: Array<string[]> = []
  const lines = content.split('\n')
  for (const line of lines) {
    if (!line.includes('|')) continue
    if (line.match(/^[\s|:-]+$/)) continue  // separator row
    const cells = line.split('|')
      .map(c => c.trim())
      .filter(c => c.length > 0)
    if (cells.length >= 2) {
      rows.push(cells.map(c => stripMd(c)))
      if (rows.length >= maxRows + 1) break  // +1 for header
    }
  }
  return rows
}

// ─── Helper: get section by id ───────────────────────────────────────────────

function getSection(sections: MemoSection[], id: string): string {
  return sections.find(s => s.id === id)?.content ?? ''
}

// ─── Slide builders ──────────────────────────────────────────────────────────

function addTitleSlide(pres: PptxPresentation, memo: IcMemoResult): void {
  const slide = pres.addSlide()
  slide.background = { color: C.NAVY }

  // Gold accent bar (left edge)
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 0.12, h: 5.625,
    fill: { color: C.GOLD }, line: { color: C.GOLD },
  })

  // "INVESTMENT COMMITTEE MEMORANDUM" label
  slide.addText('INVESTMENT COMMITTEE MEMORANDUM', {
    x: 0.3, y: 1.1, w: 9.4, h: 0.35,
    fontFace: FONT_BODY, fontSize: 11, color: C.ICE,
    charSpacing: 4, bold: false, margin: 0,
  })

  // Company name (large)
  slide.addText(memo.companyName, {
    x: 0.3, y: 1.55, w: 9.2, h: 1.3,
    fontFace: FONT_TITLE, fontSize: 44, color: C.WHITE,
    bold: true, margin: 0,
  })

  // Gold divider
  slide.addShape(pres.ShapeType.rect, {
    x: 0.3, y: 2.95, w: 1.8, h: 0.05,
    fill: { color: C.GOLD }, line: { color: C.GOLD },
  })

  // Tagline
  const execSection = memo.sections.find(s => s.id === 'executive_summary')
  const tagline = execSection
    ? firstWords(execSection.content, 20)
    : 'Confidential — For Internal Use Only'

  slide.addText(tagline, {
    x: 0.3, y: 3.1, w: 7.5, h: 0.9,
    fontFace: FONT_BODY, fontSize: 14, color: C.ICE,
    italic: true, margin: 0,
  })

  // Date + confidential footer
  const dateStr = memo.generatedAt
    ? new Date(memo.generatedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  slide.addText(`${dateStr}  ·  CONFIDENTIAL`, {
    x: 0.3, y: 5.1, w: 9.2, h: 0.3,
    fontFace: FONT_BODY, fontSize: 9, color: C.LIGHT_GRAY, margin: 0,
  })
}

function addSectionSlide(
  pres: PptxPresentation,
  title: string,
  content: string,
  slideNum: number,
  totalSlides: number,
): void {
  const slide = pres.addSlide()
  slide.background = { color: C.OFF_WHITE }

  // Navy header bar
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 10, h: 1.0,
    fill: { color: C.NAVY }, line: { color: C.NAVY },
  })

  // Slide title
  slide.addText(title, {
    x: 0.4, y: 0.15, w: 8.5, h: 0.7,
    fontFace: FONT_TITLE, fontSize: 24, color: C.WHITE,
    bold: true, margin: 0,
  })

  // Slide number (top right)
  slide.addText(`${slideNum} / ${totalSlides}`, {
    x: 8.8, y: 0.35, w: 1.0, h: 0.3,
    fontFace: FONT_BODY, fontSize: 9, color: C.ICE,
    align: 'right', margin: 0,
  })

  // Content area — use bullets if we have structured items
  const bullets = extractBullets(content, 8)

  if (bullets.length >= 3) {
    const items = bullets.map((b, i) => ({
      text: b,
      options: { bullet: true, breakLine: i < bullets.length - 1 },
    }))

    slide.addText(items, {
      x: 0.4, y: 1.15, w: 9.1, h: 4.1,
      fontFace: FONT_BODY, fontSize: 14, color: C.CHARCOAL,
      valign: 'top',
    })
  } else {
    // Fallback: prose text
    const prose = stripMd(content).substring(0, 800)
    slide.addText(prose, {
      x: 0.4, y: 1.15, w: 9.1, h: 4.1,
      fontFace: FONT_BODY, fontSize: 13, color: C.CHARCOAL,
      valign: 'top',
    })
  }

  // Gold footer bar
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 5.45, w: 10, h: 0.08,
    fill: { color: C.GOLD }, line: { color: C.GOLD },
  })
}

function addExecutiveSummarySlide(pres: PptxPresentation, memo: IcMemoResult): void {
  const slide = pres.addSlide()
  slide.background = { color: C.OFF_WHITE }

  // Header
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 10, h: 1.0, fill: { color: C.NAVY }, line: { color: C.NAVY },
  })
  slide.addText('Executive Summary', {
    x: 0.4, y: 0.15, w: 8.5, h: 0.7,
    fontFace: FONT_TITLE, fontSize: 24, color: C.WHITE, bold: true, margin: 0,
  })
  slide.addText('2 / 10', {
    x: 8.8, y: 0.35, w: 1.0, h: 0.3,
    fontFace: FONT_BODY, fontSize: 9, color: C.ICE, align: 'right', margin: 0,
  })

  const content = getSection(memo.sections, 'executive_summary')

  // Recommendation box
  const isProc = content.toLowerCase().includes('proceed')
  const recColor = isProc ? C.GREEN : C.AMBER
  const recText  = isProc ? 'PROCEED TO DILIGENCE' : 'FURTHER REVIEW REQUIRED'

  slide.addShape(pres.ShapeType.rect, {
    x: 0.4, y: 1.1, w: 3.2, h: 0.55,
    fill: { color: recColor }, line: { color: recColor },
  })
  slide.addText(recText, {
    x: 0.4, y: 1.1, w: 3.2, h: 0.55,
    fontFace: FONT_BODY, fontSize: 13, color: C.WHITE,
    bold: true, align: 'center', valign: 'middle', margin: 0,
  })

  // Summary text (left column)
  const summary = stripMd(content).substring(0, 500)
  slide.addText(summary, {
    x: 0.4, y: 1.8, w: 5.5, h: 3.4,
    fontFace: FONT_BODY, fontSize: 12, color: C.CHARCOAL,
    valign: 'top',
  })

  // Right column: key facts from company overview
  const ovSection = getSection(memo.sections, 'company_overview')
  const kv = extractKV(ovSection, 6)
  if (kv.length > 0) {
    slide.addShape(pres.ShapeType.rect, {
      x: 6.1, y: 1.1, w: 3.5, h: kv.length * 0.58 + 0.1,
      fill: { color: C.ICE_LIGHT }, line: { color: C.BORDER, pt: 1 },
    })
    kv.forEach(({ key, value }, i) => {
      const yPos = 1.15 + i * 0.58
      slide.addText(key, {
        x: 6.2, y: yPos, w: 1.5, h: 0.5,
        fontFace: FONT_BODY, fontSize: 10, color: C.LIGHT_GRAY,
        bold: true, margin: 0,
      })
      slide.addText(value.substring(0, 60), {
        x: 7.7, y: yPos, w: 1.8, h: 0.5,
        fontFace: FONT_BODY, fontSize: 10, color: C.CHARCOAL, margin: 0,
      })
    })
  }

  // Gold footer
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 5.45, w: 10, h: 0.08, fill: { color: C.GOLD }, line: { color: C.GOLD },
  })
}

function addFinancialSlide(pres: PptxPresentation, memo: IcMemoResult): void {
  const slide = pres.addSlide()
  slide.background = { color: C.OFF_WHITE }

  // Header
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 10, h: 1.0, fill: { color: C.NAVY }, line: { color: C.NAVY },
  })
  slide.addText('Financial Performance', {
    x: 0.4, y: 0.15, w: 8.5, h: 0.7,
    fontFace: FONT_TITLE, fontSize: 24, color: C.WHITE, bold: true, margin: 0,
  })
  slide.addText('5 / 10', {
    x: 8.8, y: 0.35, w: 1.0, h: 0.3,
    fontFace: FONT_BODY, fontSize: 9, color: C.ICE, align: 'right', margin: 0,
  })

  const content = getSection(memo.sections, 'financial_analysis')
  const tableRows = extractTableRows(content, 5)

  if (tableRows.length >= 2) {
    // Revenue/EBITDA bar chart from table data
    const yearRow  = tableRows[0]  // header
    const dataRows = tableRows.slice(1)

    // Build chart data from table
    const labels: string[] = []
    const revenues: number[] = []
    const ebitdas: number[] = []

    dataRows.forEach(row => {
      if (!row[0]) return
      labels.push(row[0])
      // Parse numbers like "$28.4M" → 28.4
      const parseM = (s: string) => parseFloat((s ?? '0').replace(/[^0-9.]/g, '')) || 0
      revenues.push(parseM(row[1] ?? '0'))
      ebitdas.push(parseM(row[2] ?? '0'))
    })

    if (labels.length >= 2) {
      slide.addChart(pres.ChartType.bar, [
        { name: 'Revenue ($M)', labels, values: revenues },
        { name: 'EBITDA ($M)', labels, values: ebitdas },
      ], {
        x: 0.4, y: 1.1, w: 5.5, h: 3.5,
        barDir: 'col',
        chartColors: [C.NAVY_MID, C.GOLD],
        chartArea: { fill: { color: C.OFF_WHITE } },
        catAxisLabelColor: C.MID_GRAY,
        valAxisLabelColor: C.MID_GRAY,
        valGridLine: { color: C.BORDER },
        catGridLine: { style: 'none' as const },
        showValue: true,
        dataLabelColor: C.CHARCOAL,
        showLegend: true,
        legendPos: 'b',
        legendFontSize: 10,
        legendColor: C.MID_GRAY,
      })
    }

    // Table (right side)
    if (tableRows.length >= 2 && yearRow && yearRow.length > 0) {
      const headerRow = yearRow.map(h => ({
        text: h,
        options: { fill: { color: C.NAVY }, color: C.WHITE, bold: true, fontFace: FONT_BODY, fontSize: 10 },
      }))
      const bodyRows = tableRows.slice(1).map(row =>
        row.map(cell => ({
          text: cell,
          options: { fontFace: FONT_BODY, fontSize: 10, color: C.CHARCOAL },
        }))
      )

      slide.addTable([headerRow, ...bodyRows], {
        x: 6.1, y: 1.1, w: 3.5, h: 3.5,
        border: { pt: 1, color: C.BORDER },
        fill: { color: C.WHITE },
        rowH: 0.5,
      })
    }
  } else {
    // Fallback: bullets
    const bullets = extractBullets(content, 7)
    if (bullets.length > 0) {
      const items = bullets.map((b, i) => ({
        text: b,
        options: { bullet: true, breakLine: i < bullets.length - 1 },
      }))
      slide.addText(items, {
        x: 0.4, y: 1.15, w: 9.1, h: 4.1,
        fontFace: FONT_BODY, fontSize: 13, color: C.CHARCOAL, valign: 'top',
      })
    }
  }

  // Gold footer
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 5.45, w: 10, h: 0.08, fill: { color: C.GOLD }, line: { color: C.GOLD },
  })
}

function addRisksSlide(pres: PptxPresentation, memo: IcMemoResult): void {
  const content = getSection(memo.sections, 'key_risks')
  const tableRows = extractTableRows(content, 10)

  const addRisksSlideWithRows = (rows: string[][], slideLabel: string) => {
    const s = pres.addSlide()
    s.background = { color: C.OFF_WHITE }
    s.addShape(pres.ShapeType.rect, {
      x: 0, y: 0, w: 10, h: 1.0, fill: { color: C.NAVY }, line: { color: C.NAVY },
    })
    s.addText(`Key Risks${slideLabel}`, {
      x: 0.4, y: 0.15, w: 8.5, h: 0.7,
      fontFace: FONT_TITLE, fontSize: 24, color: C.WHITE, bold: true, margin: 0,
    })
    s.addText('7 / 10', {
      x: 8.8, y: 0.35, w: 1.0, h: 0.3,
      fontFace: FONT_BODY, fontSize: 9, color: C.ICE, align: 'right', margin: 0,
    })

    if (rows.length >= 2) {
      const headerRow = (rows[0] ?? []).map(h => ({
        text: h,
        options: { fill: { color: C.NAVY }, color: C.WHITE, bold: true, fontFace: FONT_BODY, fontSize: 10 },
      }))
      const bodyRows = rows.slice(1).map(row =>
        row.map((cell, ci) => {
          const isHigh   = cell.toUpperCase() === 'HIGH'
          const isMedium = cell.toUpperCase() === 'MEDIUM'
          return {
            text: cell,
            options: {
              fontFace: FONT_BODY, fontSize: 9.5,
              color: ci === 1 ? (isHigh ? C.RED_FLAG : isMedium ? C.AMBER : C.GREEN) : C.CHARCOAL,
              bold: ci === 1,
            },
          }
        })
      )
      s.addTable([headerRow, ...bodyRows], {
        x: 0.4, y: 1.1, w: 9.2, h: 4.1,
        border: { pt: 1, color: C.BORDER },
        fill: { color: C.WHITE },
        rowH: 1.0,
      })
    } else {
      const bullets = extractBullets(content, 4)
      const items = bullets.map((b, i) => ({
        text: b,
        options: { bullet: true, breakLine: i < bullets.length - 1 },
      }))
      s.addText(items, {
        x: 0.4, y: 1.15, w: 9.1, h: 4.1,
        fontFace: FONT_BODY, fontSize: 13, color: C.CHARCOAL, valign: 'top',
      })
    }
    s.addShape(pres.ShapeType.rect, {
      x: 0, y: 5.45, w: 10, h: 0.08, fill: { color: C.GOLD }, line: { color: C.GOLD },
    })
  }

  if (tableRows.length >= 3) {
    const header = tableRows[0]!
    const body   = tableRows.slice(1)
    const MAX_PER_SLIDE = 3
    if (body.length > MAX_PER_SLIDE) {
      // Split: first slide gets first 3 risks, second gets the rest
      addRisksSlideWithRows([header, ...body.slice(0, MAX_PER_SLIDE)], ' (1/2)')
      addRisksSlideWithRows([header, ...body.slice(MAX_PER_SLIDE)], ' (2/2)')
    } else {
      addRisksSlideWithRows(tableRows, '')
    }
  } else {
    addRisksSlideWithRows(tableRows, '')
  }

}

function addDealStructureSlide(pres: PptxPresentation, memo: IcMemoResult): void {
  const slide = pres.addSlide()
  slide.background = { color: C.OFF_WHITE }

  // Header
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 10, h: 1.0, fill: { color: C.NAVY }, line: { color: C.NAVY },
  })
  slide.addText('Deal Structure & Returns', {
    x: 0.4, y: 0.15, w: 8.5, h: 0.7,
    fontFace: FONT_TITLE, fontSize: 24, color: C.WHITE, bold: true, margin: 0,
  })
  slide.addText('9 / 10', {
    x: 8.8, y: 0.35, w: 1.0, h: 0.3,
    fontFace: FONT_BODY, fontSize: 9, color: C.ICE, align: 'right', margin: 0,
  })

  const content = getSection(memo.sections, 'deal_structure')
  const tableRows = extractTableRows(content, 5)

  if (tableRows.length >= 2) {
    const headerRow = (tableRows[0] ?? []).map(h => ({
      text: h,
      options: { fill: { color: C.NAVY }, color: C.WHITE, bold: true, fontFace: FONT_BODY, fontSize: 10 },
    }))
    const bodyRows = tableRows.slice(1).map(row =>
      row.map(cell => ({
        text: cell,
        options: { fontFace: FONT_BODY, fontSize: 10, color: C.CHARCOAL },
      }))
    )

    slide.addTable([headerRow, ...bodyRows], {
      x: 0.4, y: 1.1, w: 9.2, h: tableRows.length * 0.55,
      border: { pt: 1, color: C.BORDER },
      fill: { color: C.WHITE },
      rowH: 0.55,
    })
  }

  // Additional bullets below table
  const bullets = extractBullets(content, 5)
  if (bullets.length > 0) {
    const yStart = tableRows.length >= 2 ? 1.1 + tableRows.length * 0.55 + 0.2 : 1.2
    const items = bullets.map((b, i) => ({
      text: b,
      options: { bullet: true, breakLine: i < bullets.length - 1 },
    }))
    slide.addText(items, {
      x: 0.4, y: yStart, w: 9.1, h: 5.2 - yStart,
      fontFace: FONT_BODY, fontSize: 12, color: C.CHARCOAL, valign: 'top',
    })
  }

  // Gold footer
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 5.45, w: 10, h: 0.08, fill: { color: C.GOLD }, line: { color: C.GOLD },
  })
}

function addClosingSlide(pres: PptxPresentation, memo: IcMemoResult): void {
  const slide = pres.addSlide()
  slide.background = { color: C.NAVY }

  // Gold accent bar
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 0.12, h: 5.625,
    fill: { color: C.GOLD }, line: { color: C.GOLD },
  })

  slide.addText(memo.companyName, {
    x: 0.3, y: 1.8, w: 9.2, h: 0.9,
    fontFace: FONT_TITLE, fontSize: 36, color: C.WHITE, bold: true,
    align: 'center', margin: 0,
  })

  slide.addText('CONFIDENTIAL — FOR INTERNAL USE ONLY', {
    x: 0.3, y: 2.85, w: 9.2, h: 0.4,
    fontFace: FONT_BODY, fontSize: 11, color: C.ICE,
    align: 'center', charSpacing: 3, margin: 0,
  })

  // Gold divider
  slide.addShape(pres.ShapeType.rect, {
    x: 3.8, y: 3.4, w: 2.4, h: 0.05,
    fill: { color: C.GOLD }, line: { color: C.GOLD },
  })

  slide.addText('Investment Committee Memorandum', {
    x: 0.3, y: 3.6, w: 9.2, h: 0.4,
    fontFace: FONT_BODY, fontSize: 12, color: C.LIGHT_GRAY,
    align: 'center', margin: 0,
  })
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export async function buildPitchDeck(memo: IcMemoResult): Promise<Buffer> {
  const pres = new PptxGenJS()
  pres.layout = 'LAYOUT_16x9'
  pres.author = 'AXIS Copilot'
  pres.title = `${memo.companyName} — IC Memo`
  pres.subject = 'Investment Committee Memorandum'

  // Slide order — 10 slides total
  addTitleSlide(pres, memo)
  addExecutiveSummarySlide(pres, memo)

  // Slides 3–10: content sections
  const sectionOrder = [
    'company_overview',
    'market_analysis',
    'financial_analysis',
    'investment_thesis',
    'key_risks',
    'management_assessment',
    'deal_structure',
    'next_steps',
  ]

  const slideNums = [3, 4, 5, 6, 7, 8, 9, 10]

  sectionOrder.forEach((sectionId, idx) => {
    const section = memo.sections.find(s => s.id === sectionId)
    if (!section) return

    const slideNum = slideNums[idx] ?? idx + 3
    const totalSlides = 10

    if (sectionId === 'financial_analysis') {
      addFinancialSlide(pres, memo)
    } else if (sectionId === 'key_risks') {
      addRisksSlide(pres, memo)
    } else if (sectionId === 'deal_structure') {
      addDealStructureSlide(pres, memo)
    } else {
      addSectionSlide(pres, section.title, section.content, slideNum, totalSlides)
    }
  })

  addClosingSlide(pres, memo)

  // Return as Buffer
  const data = await pres.write({ outputType: 'nodebuffer' }) as Buffer
  return data
}
