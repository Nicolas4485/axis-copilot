// Google Slides parser — extracts slide text and speaker notes
// Input: Google Slides export as text or HTML from Drive API

import type { DocumentParser } from './types.js'
import type { ParsedDocument, ParsedSection, TypeSignal } from '../types.js'

export class GSlidesParser implements DocumentParser {
  supportedMimeTypes = [
    'application/vnd.google-apps.presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ]

  async parse(content: Buffer, filename: string): Promise<ParsedDocument> {
    const raw = content.toString('utf-8')

    // Google Slides exported as text: each slide separated by page breaks or markers
    const slides = this.extractSlides(raw)
    const allText = slides.map((s) => s.content).join('\n\n')
    const wordCount = allText.split(/\s+/).filter(Boolean).length
    const typeSignals = this.detectTypeSignals(allText, filename, slides.length)

    return {
      text: allText,
      sections: slides,
      metadata: {
        title: filename.replace(/\.[^.]+$/, ''),
        wordCount,
        mimeType: 'application/vnd.google-apps.presentation',
        extra: {
          slideCount: slides.length,
          hasSpeakerNotes: raw.includes('Speaker notes') || raw.includes('Notes:'),
        },
      },
      typeSignals,
    }
  }

  private extractSlides(raw: string): ParsedSection[] {
    // Split on common slide delimiters
    const slideMarkers = /(?:^|\n)(?:---+|===+|Slide \d+|Page \d+)/gi
    const parts = raw.split(slideMarkers).filter((p) => p.trim().length > 0)

    if (parts.length <= 1) {
      // No clear slide markers — treat as single section
      return [{
        title: 'Presentation',
        content: raw.trim(),
        level: 1,
        order: 0,
      }]
    }

    return parts.map((part, index) => {
      const lines = part.trim().split('\n')
      const title = lines[0]?.trim() ?? `Slide ${index + 1}`
      const content = lines.slice(1).join('\n').trim()
      return {
        title,
        content: content || title,
        level: 1,
        order: index,
      }
    })
  }

  private detectTypeSignals(text: string, filename: string, slideCount: number): TypeSignal[] {
    const signals: TypeSignal[] = []
    const lower = text.toLowerCase()
    const lowerName = filename.toLowerCase()

    signals.push({ docType: 'PRESENTATION', confidence: 0.9, reason: `Presentation with ${slideCount} slide(s)` })

    if (lower.includes('proposal') || lowerName.includes('proposal')) {
      signals.push({ docType: 'PROPOSAL', confidence: 0.7, reason: 'Presentation contains proposal content' })
    }
    if (lower.includes('competitor') || lower.includes('market')) {
      signals.push({ docType: 'COMPETITIVE_INTEL', confidence: 0.6, reason: 'Presentation contains competitive content' })
    }
    if (lower.includes('roadmap') || lower.includes('feature') || lower.includes('product')) {
      signals.push({ docType: 'REPORT', confidence: 0.5, reason: 'Presentation contains product content' })
    }

    return signals
  }
}
