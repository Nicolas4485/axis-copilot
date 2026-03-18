// Transcript parser — parses meeting transcripts with speaker attribution
// Handles common formats: Otter.ai, Google Meet, Zoom, plain text

import type { DocumentParser } from './types.js'
import type { ParsedDocument, ParsedSection, TypeSignal } from '../types.js'

export class TranscriptParser implements DocumentParser {
  supportedMimeTypes = [
    'text/plain',
    'text/vtt',        // WebVTT (Zoom, Google Meet)
    'application/json', // Otter.ai JSON export
  ]

  async parse(content: Buffer, filename: string): Promise<ParsedDocument> {
    const raw = content.toString('utf-8')
    const lowerName = filename.toLowerCase()

    // Detect transcript format
    let text: string
    let sections: ParsedSection[]

    if (raw.startsWith('WEBVTT') || lowerName.endsWith('.vtt')) {
      const parsed = this.parseVtt(raw)
      text = parsed.text
      sections = parsed.sections
    } else if (this.isJsonTranscript(raw)) {
      const parsed = this.parseJsonTranscript(raw)
      text = parsed.text
      sections = parsed.sections
    } else {
      const parsed = this.parsePlainTranscript(raw)
      text = parsed.text
      sections = parsed.sections
    }

    const speakers = this.extractSpeakers(text)
    const wordCount = text.split(/\s+/).filter(Boolean).length
    const typeSignals = this.detectTypeSignals(text, filename, speakers)

    return {
      text,
      sections,
      metadata: {
        title: filename.replace(/\.[^.]+$/, ''),
        wordCount,
        mimeType: 'text/plain',
        extra: {
          speakers,
          speakerCount: speakers.length,
          format: raw.startsWith('WEBVTT') ? 'vtt' : this.isJsonTranscript(raw) ? 'json' : 'plain',
        },
      },
      typeSignals,
    }
  }

  private parseVtt(raw: string): { text: string; sections: ParsedSection[] } {
    const lines = raw.split('\n')
    const segments: Array<{ speaker: string; text: string }> = []
    let currentSpeaker = ''

    for (const line of lines) {
      const trimmed = line.trim()
      // Skip WEBVTT header, timestamps, and blank lines
      if (trimmed === 'WEBVTT' || trimmed === '' || /^\d{2}:\d{2}/.test(trimmed)) continue
      // Skip cue numbers
      if (/^\d+$/.test(trimmed)) continue

      // Extract speaker if present (format: "Speaker Name: text")
      const speakerMatch = trimmed.match(/^([^:]+):\s*(.+)$/)
      if (speakerMatch?.[1] && speakerMatch[2]) {
        currentSpeaker = speakerMatch[1]
        segments.push({ speaker: currentSpeaker, text: speakerMatch[2] })
      } else {
        segments.push({ speaker: currentSpeaker, text: trimmed })
      }
    }

    const text = segments.map((s) => `${s.speaker}: ${s.text}`).join('\n')
    const sections = this.groupBySpeaker(segments)
    return { text, sections }
  }

  private isJsonTranscript(raw: string): boolean {
    try {
      const parsed = JSON.parse(raw)
      return typeof parsed === 'object' && parsed !== null &&
        ('transcript' in parsed || 'segments' in parsed || 'utterances' in parsed)
    } catch {
      return false
    }
  }

  private parseJsonTranscript(raw: string): { text: string; sections: ParsedSection[] } {
    const data = JSON.parse(raw) as Record<string, unknown>
    const segments: Array<{ speaker: string; text: string }> = []

    // Handle common JSON transcript formats
    const entries = (data['utterances'] ?? data['segments'] ?? data['transcript'] ?? []) as Array<Record<string, unknown>>

    for (const entry of entries) {
      const speaker = (entry['speaker'] as string) ?? (entry['name'] as string) ?? 'Unknown'
      const text = (entry['text'] as string) ?? (entry['content'] as string) ?? ''
      if (text) segments.push({ speaker, text })
    }

    const text = segments.map((s) => `${s.speaker}: ${s.text}`).join('\n')
    const sections = this.groupBySpeaker(segments)
    return { text, sections }
  }

  private parsePlainTranscript(raw: string): { text: string; sections: ParsedSection[] } {
    const lines = raw.split('\n').filter((l) => l.trim().length > 0)
    const segments: Array<{ speaker: string; text: string }> = []
    let currentSpeaker = 'Unknown'

    for (const line of lines) {
      const speakerMatch = line.match(/^([A-Z][a-zA-Z\s.]+):\s*(.+)$/)
      if (speakerMatch?.[1] && speakerMatch[2]) {
        currentSpeaker = speakerMatch[1].trim()
        segments.push({ speaker: currentSpeaker, text: speakerMatch[2] })
      } else {
        segments.push({ speaker: currentSpeaker, text: line.trim() })
      }
    }

    const text = segments.map((s) => `${s.speaker}: ${s.text}`).join('\n')
    const sections = this.groupBySpeaker(segments)
    return { text, sections }
  }

  private groupBySpeaker(
    segments: Array<{ speaker: string; text: string }>
  ): ParsedSection[] {
    const sections: ParsedSection[] = []
    let currentSpeaker = ''
    let currentTexts: string[] = []
    let order = 0

    for (const seg of segments) {
      if (seg.speaker !== currentSpeaker && currentTexts.length > 0) {
        sections.push({
          title: currentSpeaker || 'Unknown Speaker',
          content: currentTexts.join(' '),
          level: 1,
          order: order++,
        })
        currentTexts = []
      }
      currentSpeaker = seg.speaker
      currentTexts.push(seg.text)
    }

    if (currentTexts.length > 0) {
      sections.push({
        title: currentSpeaker || 'Unknown Speaker',
        content: currentTexts.join(' '),
        level: 1,
        order: order++,
      })
    }

    return sections
  }

  private extractSpeakers(text: string): string[] {
    const speakerPattern = /^([A-Z][a-zA-Z\s.]+):/gm
    const speakers = new Set<string>()
    let match: RegExpExecArray | null
    while ((match = speakerPattern.exec(text)) !== null) {
      if (match[1]) speakers.add(match[1].trim())
    }
    return [...speakers]
  }

  private detectTypeSignals(text: string, _filename: string, speakers: string[]): TypeSignal[] {
    const signals: TypeSignal[] = [
      { docType: 'MEETING_TRANSCRIPT', confidence: 0.9, reason: `Transcript with ${speakers.length} speaker(s)` },
    ]

    const lower = text.toLowerCase()
    if (lower.includes('action item') || lower.includes('next steps')) {
      signals.push({ docType: 'MEETING_TRANSCRIPT', confidence: 0.95, reason: 'Contains action items / next steps' })
    }

    return signals
  }
}
