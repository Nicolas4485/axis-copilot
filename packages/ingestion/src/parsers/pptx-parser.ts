// PPTX parser — extracts text and slide structure from PowerPoint files.
// PPTX is a ZIP archive; slide text lives in ppt/slides/slide*.xml as <a:t> elements.

import AdmZip from 'adm-zip'
import type { DocumentParser } from './types.js'
import type { ParsedDocument, ParsedSection, TypeSignal } from '../types.js'

export class PptxParser implements DocumentParser {
  supportedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
  ]

  async parse(content: Buffer, filename: string): Promise<ParsedDocument> {
    let zip: AdmZip
    try {
      zip = new AdmZip(content)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      throw new Error(`Failed to open PPTX "${filename}" as ZIP archive: ${msg}`)
    }

    // Collect all slide XML entries, sorted numerically by slide number
    const slideEntries = zip
      .getEntries()
      .filter((e) => /^ppt\/slides\/slide\d+\.xml$/i.test(e.entryName))
      .sort((a, b) => {
        const numA = parseInt(a.entryName.replace(/\D/g, ''), 10)
        const numB = parseInt(b.entryName.replace(/\D/g, ''), 10)
        return numA - numB
      })

    if (slideEntries.length === 0) {
      throw new Error(`PPTX "${filename}" contains no readable slides`)
    }

    const sections: ParsedSection[] = []
    const allText: string[] = []

    for (let i = 0; i < slideEntries.length; i++) {
      const entry = slideEntries[i]
      if (!entry) continue

      const xml = entry.getData().toString('utf8')
      const slideText = this.extractTextFromSlideXml(xml)

      if (slideText.trim()) {
        allText.push(slideText)
        sections.push({
          title: `Slide ${i + 1}`,
          content: slideText,
          level: 1,
          order: i,
        })
      }
    }

    const text = allText.join('\n\n')
    const wordCount = text.split(/\s+/).filter(Boolean).length
    const typeSignals = this.detectTypeSignals(text, filename)

    return {
      text,
      sections,
      metadata: {
        title: filename.replace(/\.[^.]+$/, ''),
        wordCount,
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        extra: {
          slideCount: slideEntries.length,
          slidesWithContent: sections.length,
        },
      },
      typeSignals,
    }
  }

  // Extract all <a:t> text runs from a slide XML, preserving paragraph breaks
  private extractTextFromSlideXml(xml: string): string {
    const paragraphs: string[] = []

    // Split into paragraphs (<a:p>...</a:p>)
    const paraMatches = xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)
    for (const paraMatch of paraMatches) {
      const paraXml = paraMatch[1] ?? ''
      // Collect all text runs within this paragraph
      const textRuns = [...paraXml.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)]
        .map((m) => this.decodeXmlEntities(m[1] ?? ''))
        .join('')

      if (textRuns.trim()) {
        paragraphs.push(textRuns.trim())
      }
    }

    return paragraphs.join('\n')
  }

  private decodeXmlEntities(s: string): string {
    return s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
  }

  private detectTypeSignals(text: string, filename: string): TypeSignal[] {
    const signals: TypeSignal[] = []
    const lower = text.toLowerCase()
    const lowerName = filename.toLowerCase()

    if (lower.includes('competitor') || lower.includes('competitive') || lower.includes('market share')) {
      signals.push({ docType: 'COMPETITIVE_INTEL', confidence: 0.75, reason: 'Presentation contains competitive/market language' })
    }
    if (lower.includes('revenue') || lower.includes('forecast') || lower.includes('budget') || lower.includes('roi')) {
      signals.push({ docType: 'REPORT', confidence: 0.7, reason: 'Presentation contains financial metrics' })
    }
    if (lowerName.includes('proposal') || lower.includes('proposal')) {
      signals.push({ docType: 'PROPOSAL', confidence: 0.75, reason: 'Presentation appears to be a proposal' })
    }
    if (lower.includes('agenda') || lower.includes('minutes') || lower.includes('action item')) {
      signals.push({ docType: 'MEETING_TRANSCRIPT', confidence: 0.65, reason: 'Presentation contains meeting content' })
    }
    if (lower.includes('roadmap') || lower.includes('milestone') || lower.includes('sprint')) {
      signals.push({ docType: 'PRESENTATION', confidence: 0.7, reason: 'Presentation contains roadmap/planning content' })
    }

    if (signals.length === 0) {
      signals.push({ docType: 'GENERAL', confidence: 0.5, reason: 'No specific type signals in presentation' })
    }

    return signals
  }
}
