// PPTX Template Parser — extracts brand theme (colors + fonts) and slot map from a .pptx file.
// Uses adm-zip to read the OOXML ZIP structure without library limitations.
// Slot map keys match the output slide slots in pitch-deck-builder.ts.

import AdmZip from 'adm-zip'

export interface PptxTheme {
  colors: {
    primary:    string  // hex without #
    secondary:  string
    accent:     string
    background: string
    text:       string
    muted:      string
  }
  fonts: {
    heading: string
    body:    string
  }
}

export interface ParsedPptxTemplate {
  theme:   PptxTheme
  slotMap: Record<string, number>  // slot name → 0-based slide index
  slideCount: number
}

const SLOT_KEYWORDS: Array<{ slot: string; keywords: string[] }> = [
  { slot: 'title',        keywords: ['title', 'cover', 'intro', 'front'] },
  { slot: 'exec_summary', keywords: ['executive summary', 'executive', 'summary', 'overview'] },
  { slot: 'company',      keywords: ['company', 'business', 'about us', 'about'] },
  { slot: 'market',       keywords: ['market', 'tam', 'industry', 'sector', 'landscape'] },
  { slot: 'thesis',       keywords: ['thesis', 'investment', 'opportunity', 'rationale'] },
  { slot: 'financials',   keywords: ['financial', 'revenue', 'ebitda', 'income', 'p&l', 'returns'] },
  { slot: 'risks',        keywords: ['risk', 'concern', 'challenge', 'downside'] },
  { slot: 'deal',         keywords: ['deal', 'structure', 'terms', 'transaction', 'capital'] },
  { slot: 'exit',         keywords: ['exit', 'realisation', 'realization', 'liquidity'] },
  { slot: 'closing',      keywords: ['closing', 'next steps', 'appendix', 'contact', 'thank'] },
]

function extractTextFromXml(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function detectSlot(text: string): string | null {
  for (const { slot, keywords } of SLOT_KEYWORDS) {
    if (keywords.some((kw) => text.includes(kw))) return slot
  }
  return null
}

function parseThemeXml(xml: string): PptxTheme {
  const colorRegex = /<a:(dk1|dk2|lt1|lt2|accent1|accent2|accent3)>\s*<a:(?:srgbClr|sysClr[^>]*lastClr)[^>]*val="([0-9A-Fa-f]{6})"/g
  const colorMap: Record<string, string> = {}
  let m: RegExpExecArray | null
  while ((m = colorRegex.exec(xml)) !== null) {
    if (m[1] && m[2]) colorMap[m[1]] = m[2].toUpperCase()
  }

  const fontRegex = /<a:(?:latin|ea|cs)[^>]*typeface="([^"]+)"/g
  const fonts: string[] = []
  while ((m = fontRegex.exec(xml)) !== null) {
    if (m[1] && !m[1].startsWith('+') && !fonts.includes(m[1])) fonts.push(m[1])
  }

  return {
    colors: {
      primary:    colorMap['accent1'] ?? colorMap['accent2'] ?? '1E2761',
      secondary:  colorMap['accent2'] ?? colorMap['accent3'] ?? '2B3990',
      accent:     colorMap['accent3'] ?? 'C9A84C',
      background: colorMap['lt1'] ?? 'FFFFFF',
      text:       colorMap['dk1'] ?? '1A1A2E',
      muted:      colorMap['dk2'] ?? '4A5568',
    },
    fonts: {
      heading: fonts[0] ?? 'Cambria',
      body:    fonts[1] ?? fonts[0] ?? 'Calibri',
    },
  }
}

export function parsePptxTemplate(buffer: Buffer): ParsedPptxTemplate {
  const zip = new AdmZip(buffer)

  // Extract theme colors + fonts from ppt/theme/theme1.xml
  let theme: PptxTheme = {
    colors: { primary: '1E2761', secondary: '2B3990', accent: 'C9A84C', background: 'FFFFFF', text: '1A1A2E', muted: '4A5568' },
    fonts:  { heading: 'Cambria', body: 'Calibri' },
  }

  const themeEntry = zip.getEntry('ppt/theme/theme1.xml')
  if (themeEntry) {
    try {
      theme = parseThemeXml(themeEntry.getData().toString('utf-8'))
    } catch {
      // Use defaults if theme XML is malformed
    }
  }

  // Build slot map by reading slide title text from each slide XML
  const slotMap: Record<string, number> = {}
  const slideCount = zip.getEntries().filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName)).length

  for (let i = 1; i <= slideCount; i++) {
    const entry = zip.getEntry(`ppt/slides/slide${i}.xml`)
    if (!entry) continue

    const xml  = entry.getData().toString('utf-8')
    const text = extractTextFromXml(xml)

    // First slide always maps to title if no other match
    if (i === 1 && !slotMap['title']) {
      slotMap['title'] = 0
      continue
    }

    const slot = detectSlot(text)
    if (slot && slotMap[slot] === undefined) {
      slotMap[slot] = i - 1
    }
  }

  // Last slide maps to closing if not already detected
  if (slideCount > 1 && slotMap['closing'] === undefined) {
    slotMap['closing'] = slideCount - 1
  }

  return { theme, slotMap, slideCount }
}
