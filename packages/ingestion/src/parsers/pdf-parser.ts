// PDF parser — extracts text content from PDF files
// Uses pdf-parse for text extraction

import type { DocumentParser } from './types.js'
import type { ParsedDocument, ParsedSection, TypeSignal } from '../types.js'

export class PdfParser implements DocumentParser {
  supportedMimeTypes = [
    'application/pdf',
  ]

  async parse(content: Buffer, filename: string): Promise<ParsedDocument> {
    // Dynamic import — pdf-parse is a heavy dependency
    const pdfParse = await import('pdf-parse')
    const parseFn = pdfParse.default ?? pdfParse

    let pdfData: { text: string; numpages: number; info: Record<string, unknown> }
    try {
      pdfData = await parseFn(content)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown PDF parse error'
      throw new Error(`Failed to parse PDF "${filename}": ${errorMsg}`)
    }

    const text = pdfData.text
    const sections = this.extractSections(text)
    const wordCount = text.split(/\s+/).filter(Boolean).length
    const typeSignals = this.detectTypeSignals(text, filename)

    return {
      text,
      sections,
      metadata: {
        title: (pdfData.info['Title'] as string) ?? filename.replace(/\.[^.]+$/, ''),
        author: pdfData.info['Author'] as string | undefined,
        createdDate: pdfData.info['CreationDate'] as string | undefined,
        wordCount,
        mimeType: 'application/pdf',
        extra: {
          pageCount: pdfData.numpages,
          producer: pdfData.info['Producer'],
        },
      },
      typeSignals,
    }
  }

  private extractSections(text: string): ParsedSection[] {
    // Split on lines that look like headings (all caps, numbered, or short bold-like lines)
    const lines = text.split('\n')
    const sections: ParsedSection[] = []
    let currentTitle = 'Introduction'
    let currentContent: string[] = []
    let order = 0

    for (const line of lines) {
      const trimmed = line.trim()
      if (this.isLikelyHeading(trimmed)) {
        if (currentContent.length > 0) {
          sections.push({
            title: currentTitle,
            content: currentContent.join('\n').trim(),
            level: 1,
            order: order++,
          })
          currentContent = []
        }
        currentTitle = trimmed
      } else if (trimmed.length > 0) {
        currentContent.push(trimmed)
      }
    }

    // Push remaining content
    if (currentContent.length > 0) {
      sections.push({
        title: currentTitle,
        content: currentContent.join('\n').trim(),
        level: 1,
        order: order++,
      })
    }

    return sections
  }

  private isLikelyHeading(line: string): boolean {
    if (line.length === 0 || line.length > 100) return false
    // All caps line with at least 3 chars
    if (line === line.toUpperCase() && line.length >= 3 && /[A-Z]/.test(line)) return true
    // Numbered heading: "1. Introduction" or "1.1 Overview"
    if (/^\d+\.?\d*\s+[A-Z]/.test(line)) return true
    return false
  }

  private detectTypeSignals(text: string, filename: string): TypeSignal[] {
    const signals: TypeSignal[] = []
    const lower = text.toLowerCase()
    const lowerName = filename.toLowerCase()

    if (lower.includes('contract') || lower.includes('agreement') || lower.includes('hereby')) {
      signals.push({ docType: 'CONTRACT', confidence: 0.8, reason: 'PDF contains legal/contract language' })
    }
    if (lower.includes('proposal') || lowerName.includes('proposal')) {
      signals.push({ docType: 'PROPOSAL', confidence: 0.7, reason: 'PDF contains proposal content' })
    }
    if (lower.includes('specification') || lower.includes('technical requirements') || lowerName.includes('spec')) {
      signals.push({ docType: 'TECHNICAL_SPEC', confidence: 0.7, reason: 'PDF contains technical specification content' })
    }
    if (lower.includes('report') || lowerName.includes('report')) {
      signals.push({ docType: 'REPORT', confidence: 0.6, reason: 'PDF appears to be a report' })
    }

    if (signals.length === 0) {
      signals.push({ docType: 'GENERAL', confidence: 0.5, reason: 'No specific type signals in PDF' })
    }

    return signals
  }
}
