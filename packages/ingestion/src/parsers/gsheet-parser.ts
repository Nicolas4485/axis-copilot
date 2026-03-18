// Google Sheets parser — extracts tabular data with type signals
// Input: Google Sheets export as CSV or TSV from Drive API

import type { DocumentParser } from './types.js'
import type { ParsedDocument, ParsedSection, TypeSignal } from '../types.js'

export class GSheetParser implements DocumentParser {
  supportedMimeTypes = [
    'application/vnd.google-apps.spreadsheet',
    'text/csv',
    'text/tab-separated-values',
  ]

  async parse(content: Buffer, filename: string): Promise<ParsedDocument> {
    const raw = content.toString('utf-8')
    const sheets = this.parseSheets(raw)
    const allText = sheets.map((s) => `${s.title}:\n${s.content}`).join('\n\n')
    const wordCount = allText.split(/\s+/).filter(Boolean).length
    const typeSignals = this.detectTypeSignals(allText, filename, sheets)

    return {
      text: allText,
      sections: sheets,
      metadata: {
        title: filename.replace(/\.[^.]+$/, ''),
        wordCount,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        extra: {
          sheetCount: sheets.length,
          sheetNames: sheets.map((s) => s.title),
          totalRows: raw.split('\n').length,
        },
      },
      typeSignals,
    }
  }

  private parseSheets(raw: string): ParsedSection[] {
    // For CSV/TSV, treat the whole file as one sheet
    // Multi-sheet support requires Google Sheets API (each sheet exported separately)
    const lines = raw.split('\n').filter((l) => l.trim().length > 0)
    const headers = lines[0] ?? ''
    const rows = lines.slice(1)

    const content = rows
      .map((row) => {
        const cells = this.parseCsvLine(row)
        const headerCells = this.parseCsvLine(headers)
        return headerCells
          .map((h, i) => `${h}: ${cells[i] ?? ''}`)
          .join(' | ')
      })
      .join('\n')

    return [{
      title: 'Sheet1',
      content,
      level: 1,
      order: 0,
    }]
  }

  private parseCsvLine(line: string): string[] {
    const cells: string[] = []
    let current = ''
    let inQuotes = false

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes
      } else if ((char === ',' || char === '\t') && !inQuotes) {
        cells.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    cells.push(current.trim())
    return cells
  }

  private detectTypeSignals(text: string, filename: string, sheets: ParsedSection[]): TypeSignal[] {
    const signals: TypeSignal[] = []
    const lower = text.toLowerCase()
    const lowerName = filename.toLowerCase()

    if (lower.includes('competitor') || lowerName.includes('comparison') || lowerName.includes('competitive')) {
      signals.push({ docType: 'COMPETITIVE_INTEL', confidence: 0.8, reason: 'Spreadsheet with competitive data' })
    }
    if (lower.includes('stakeholder') || lower.includes('influence') || lower.includes('interest')) {
      signals.push({ docType: 'STAKEHOLDER_MAP', confidence: 0.7, reason: 'Spreadsheet with stakeholder data' })
    }
    if (lower.includes('budget') || lower.includes('cost') || lower.includes('revenue') || lower.includes('pricing')) {
      signals.push({ docType: 'REPORT', confidence: 0.6, reason: 'Financial data in spreadsheet' })
    }

    if (signals.length === 0) {
      signals.push({ docType: 'SPREADSHEET', confidence: 0.8, reason: `Tabular data with ${sheets.length} sheet(s)` })
    }

    return signals
  }
}
