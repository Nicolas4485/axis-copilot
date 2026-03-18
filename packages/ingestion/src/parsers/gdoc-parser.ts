// Google Docs parser — extracts text, headings, and type signals
// Input: Google Docs export as HTML or JSON from Drive API

import type { DocumentParser } from './types.js'
import type { ParsedDocument, ParsedSection, TypeSignal } from '../types.js'

export class GDocParser implements DocumentParser {
  supportedMimeTypes = [
    'application/vnd.google-apps.document',
    'text/html',
  ]

  async parse(content: Buffer, filename: string): Promise<ParsedDocument> {
    const html = content.toString('utf-8')

    // Extract text content by stripping HTML tags
    const text = this.stripHtml(html)
    const sections = this.extractSections(html)
    const typeSignals = this.detectTypeSignals(text, filename)
    const wordCount = text.split(/\s+/).filter(Boolean).length

    return {
      text,
      sections,
      metadata: {
        title: this.extractTitle(html, filename),
        wordCount,
        mimeType: 'application/vnd.google-apps.document',
        extra: {
          hasImages: html.includes('<img'),
          hasLinks: html.includes('<a '),
          hasTables: html.includes('<table'),
        },
      },
      typeSignals,
    }
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private extractTitle(html: string, filename: string): string {
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i)
    if (titleMatch?.[1]) return titleMatch[1].trim()
    const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i)
    if (h1Match?.[1]) return this.stripHtml(h1Match[1])
    return filename.replace(/\.[^.]+$/, '')
  }

  private extractSections(html: string): ParsedSection[] {
    const sections: ParsedSection[] = []
    const headingPattern = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi
    let match: RegExpExecArray | null
    let order = 0

    while ((match = headingPattern.exec(html)) !== null) {
      const level = parseInt(match[1] ?? '1', 10)
      const title = this.stripHtml(match[2] ?? '')

      // Get content between this heading and the next
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

    if (lower.includes('meeting notes') || lower.includes('attendees:') || lower.includes('action items')) {
      signals.push({ docType: 'MEETING_TRANSCRIPT', confidence: 0.8, reason: 'Contains meeting keywords' })
    }
    if (lower.includes('proposal') || lowerName.includes('proposal')) {
      signals.push({ docType: 'PROPOSAL', confidence: 0.7, reason: 'Contains proposal keywords' })
    }
    if (lower.includes('contract') || lower.includes('agreement') || lower.includes('terms and conditions')) {
      signals.push({ docType: 'CONTRACT', confidence: 0.7, reason: 'Contains contract/agreement language' })
    }
    if (lower.includes('competitor') || lower.includes('market analysis') || lower.includes('competitive landscape')) {
      signals.push({ docType: 'COMPETITIVE_INTEL', confidence: 0.7, reason: 'Contains competitive analysis keywords' })
    }
    if (lower.includes('process') || lower.includes('workflow') || lower.includes('automation')) {
      signals.push({ docType: 'PROCESS_DOC', confidence: 0.6, reason: 'Contains process/workflow keywords' })
    }
    if (lower.includes('stakeholder') || lower.includes('org chart') || lower.includes('organization')) {
      signals.push({ docType: 'STAKEHOLDER_MAP', confidence: 0.6, reason: 'Contains stakeholder mapping keywords' })
    }

    if (signals.length === 0) {
      signals.push({ docType: 'GENERAL', confidence: 0.5, reason: 'No specific type signals detected' })
    }

    return signals
  }
}
