import { describe, it, expect } from 'vitest'
import { chunkDocumentImpl } from '../pipeline.js'
import type { ParsedDocument } from '../types.js'

const CHUNK_MIN_TOKENS = 400
const CHUNK_MAX_TOKENS = 600

/** Generate text of exactly `tokens * 4` chars → `tokens` estimated tokens */
function makeText(tokens: number): string {
  return 'ab '.repeat(Math.ceil((tokens * 4) / 3)).slice(0, tokens * 4)
}

function makeDoc(overrides: Partial<ParsedDocument> = {}): ParsedDocument {
  return {
    text: '',
    sections: [],
    metadata: { title: 'Test', wordCount: 0, mimeType: 'text/plain', extra: {} },
    typeSignals: [],
    ...overrides,
  }
}

describe('chunkDocumentImpl', () => {
  it('produces one chunk per section when each section is within token limits', () => {
    const contentA = makeText(500)
    const contentB = makeText(500)
    const doc = makeDoc({
      text: contentA + '\n\n' + contentB,
      sections: [
        { title: 'Revenue', content: contentA, level: 1, order: 0 },
        { title: 'Headcount', content: contentB, level: 1, order: 1 },
      ],
    })
    const chunks = chunkDocumentImpl(doc)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]!.metadata.sectionTitle).toBe('Revenue')
    expect(chunks[1]!.metadata.sectionTitle).toBe('Headcount')
    expect(chunks[0]!.chunkIndex).toBe(0)
    expect(chunks[1]!.chunkIndex).toBe(1)
  })

  it('sub-splits a section that exceeds CHUNK_MAX_TOKENS, carrying the title', () => {
    const content = makeText(900) // 900 tokens > 600 → must split
    const doc = makeDoc({
      text: content,
      sections: [{ title: 'Big Section', content, level: 1, order: 0 }],
    })
    const chunks = chunkDocumentImpl(doc)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.metadata.sectionTitle).toMatch(/^Big Section \(\d+\/\d+\)$/)
      expect(chunk.tokens).toBeLessThanOrEqual(CHUNK_MAX_TOKENS + 10) // +10 for sentence snap
    }
  })

  it('merges two small adjacent sections into one chunk with combined title', () => {
    // 200 tokens each (< 400 CHUNK_MIN) — combined 400 tokens ≤ CHUNK_MAX (600) → merged
    const contentA = makeText(200)
    const contentB = makeText(200)
    const doc = makeDoc({
      text: contentA + '\n\n' + contentB,
      sections: [
        { title: 'Intro', content: contentA, level: 1, order: 0 },
        { title: 'Background', content: contentB, level: 1, order: 1 },
      ],
    })
    const chunks = chunkDocumentImpl(doc)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.metadata.sectionTitle).toBe('Intro / Background')
  })

  it('respects paragraph boundaries when no sections are present', () => {
    // Three paragraphs each 300 tokens; 300+300=600 ≤ CHUNK_MAX → first two merge,
    // third would push past CHUNK_MAX so flushes, starting new chunk
    const para = makeText(300)
    const text = [para, para, para].join('\n\n')
    const doc = makeDoc({ text })
    const chunks = chunkDocumentImpl(doc)
    // Should not produce a single chunk (3×300=900 > 600)
    expect(chunks.length).toBeGreaterThan(1)
    // Each chunk must be within token limits (allow some slack for overlap carry-in)
    for (const chunk of chunks) {
      expect(chunk.tokens).toBeLessThanOrEqual(CHUNK_MAX_TOKENS + 80)
    }
  })

  it('falls back to sentence-snapped token chunking for a wall of text with no sections and no paragraphs', () => {
    // 900 tokens of text, no \n\n, no sections — must split using Priority 3
    const text = makeText(900).replace(/\n/g, ' ')
    const doc = makeDoc({ text })
    const chunks = chunkDocumentImpl(doc)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.tokens).toBeGreaterThan(0)
      expect(chunk.tokens).toBeLessThanOrEqual(CHUNK_MAX_TOKENS + 10)
    }
  })

  it('does not loop forever when chunk position cannot advance (infinite-loop guard)', () => {
    // A very short text causes nextPosition = endPos - overlapChars to go negative.
    // The guard must set position = endPos and exit the loop.
    const text = 'Short text.' // 11 chars — far below overlap threshold (200 chars)
    const doc = makeDoc({ text })
    const chunks = chunkDocumentImpl(doc)
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    expect(chunks[0]!.content).toBe('Short text.')
  })

  it('returns exactly one chunk for a short document', () => {
    const text = makeText(50) // 50 tokens — well under CHUNK_MIN
    const doc = makeDoc({ text })
    const chunks = chunkDocumentImpl(doc)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.chunkIndex).toBe(0)
    expect(chunks[0]!.content).toBe(text.trim())
  })
})
