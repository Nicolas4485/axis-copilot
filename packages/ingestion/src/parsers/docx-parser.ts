// DOCX parser — extracts text and structure from Word documents
// Uses mammoth for DOCX → HTML conversion

import type { DocumentParser } from './types.js'
import type { ParsedDocument, ParsedSection, TypeSignal } from '../types.js'

export class DocxParser implements DocumentParser {
  supportedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ]

  async parse(content: Buffer, filename: string): Promise<ParsedDocument> {
    // Dynamic import — mammoth is a heavy dependency
    const mammoth = await import('mammoth')

    let result: { value: string; messages: Array<{ type: string; message: string }> }
    try {
      result = await mammoth.convertToHtml({ buffer: content })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown DOCX parse error'
      throw new Error(`Failed to parse DOCX "${filename}": ${errorMsg}`)
    }

    const html = result.value
    const text = this.stripHtml(html)
    const sections = this.extractSections(html)
    const wordCount = text.split(/\s+/).filter(Boolean).length
    const typeSignals = this.detectTypeSignals(text, filename)

    return {
      text,
      sections,
      metadata: {
        title: filename.replace(/\.[^.]+$/, ''),
        wordCount,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extra: {
          conversionWarnings: result.messages
            .filter((m) => m.type === 'warning')
            .map((m) => m.message),
          hasImages: html.includes('<img'),
          hasTables: html.includes('<table'),
        },
      },
      typeSignals,
    }
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private extractSections(html: string): ParsedSection[] {
    const sections: ParsedSection[] = []
    const headingPattern = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi
    let match: RegExpExecArray | null
    let order = 0

    while ((match = headingPattern.exec(html)) !== null) {
      const level = parseInt(match[1] ?? '1', 10)
      const title = this.stripHtml(match[2] ?? '')

      const startIndex = (match.index ?? 0) + (match[0]?.length ?? 0)
      const nextHeading = html.slice(startIndex).search(/<h[1-6]/i)
      const sectionHtml = nextHeading >= 0
        ? html.slice(startIndex, startIndex + nextHeading)
        : html.slice(startIndex)

      sections.push({
        title,
        content: this.stripHtml(sectionHtml),
        level,
        order: order++,
      })
    }

    return sections
  }

  private detectTypeSignals(text: string, filename: string): TypeSignal[] {
    const signals: TypeSignal[] = []
    const lower = text.toLowerCase()
    const lowerName = filename.toLowerCase()

    if (lower.includes('contract') || lower.includes('agreement') || lower.includes('hereby')) {
      signals.push({ docType: 'CONTRACT', confidence: 0.8, reason: 'DOCX contains legal/contract language' })
    }
    if (lower.includes('proposal') || lowerName.includes('proposal')) {
      signals.push({ docType: 'PROPOSAL', confidence: 0.7, reason: 'DOCX contains proposal content' })
    }
    if (lower.includes('specification') || lowerName.includes('spec')) {
      signals.push({ docType: 'TECHNICAL_SPEC', confidence: 0.7, reason: 'DOCX contains technical spec content' })
    }
    if (lower.includes('report') || lowerName.includes('report')) {
      signals.push({ docType: 'REPORT', confidence: 0.6, reason: 'DOCX appears to be a report' })
    }
    if (lower.includes('process') || lower.includes('workflow')) {
      signals.push({ docType: 'PROCESS_DOC', confidence: 0.6, reason: 'DOCX contains process/workflow content' })
    }

    if (signals.length === 0) {
      signals.push({ docType: 'GENERAL', confidence: 0.5, reason: 'No specific type signals in DOCX' })
    }

    return signals
  }
}
