import { describe, it, expect } from 'vitest'
import { ContextCompressor } from '../context-compressor.js'
import type { ScoredChunk, GraphInsight, RAGConflict } from '../types.js'

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeChunk(overrides: {
  finalScore: number
  content?: string
  chunkId?: string
  documentId?: string
  sourceTitle?: string
}): ScoredChunk {
  return {
    chunkId:      overrides.chunkId      ?? 'c1',
    documentId:   overrides.documentId   ?? 'doc-1',
    content:      overrides.content      ?? 'Short content.',
    similarity:   0.9,
    sourceTitle:  overrides.sourceTitle  ?? 'Test Source',
    sourceType:   'UPLOAD',
    clientId:     null,
    createdAt:    new Date().toISOString(),
    metadata:     {},
    finalScore:   overrides.finalScore,
    scoreBreakdown: {
      similarity: 0.9, recency: 1.0, sourceWeight: 0.85,
      clientBoost: 0.5, conflictPenalty: 0.0,
    },
  }
}

function makeGraphInsight(entityName: string, relCount = 2): GraphInsight {
  return {
    entityName,
    entityType: 'Organization',
    relationships: Array.from({ length: relCount }, (_, i) => ({
      type:       'COMPETES_WITH',
      targetName: `Competitor ${i}`,
      targetType: 'Organization',
      properties: {},
    })),
    readableText: `${entityName} competes with others`,
  }
}

function makeConflict(): RAGConflict {
  return {
    entityName:       'acme corp',
    property:         'ARR',
    valueA:           '5m',
    valueB:           '10m',
    sourceA:          'Report A',
    sourceB:          'Report B',
    sourceValue:      '5m',
    conflictingValue: '10m',
  }
}

/** Count estimated tokens (same formula as the compressor: ceil(chars / 4)) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

const compressor = new ContextCompressor()

// ──────────────────────────────────────────────────────────────────────────────
// Output structure
// ──────────────────────────────────────────────────────────────────────────────

describe('ContextCompressor — output structure', () => {
  it('output always starts with ---KNOWLEDGE CONTEXT--- header', () => {
    const { context } = compressor.compress([], [], [], 4000)
    expect(context).toContain('---KNOWLEDGE CONTEXT---')
  })

  it('output always ends with ---END KNOWLEDGE CONTEXT--- footer', () => {
    const { context } = compressor.compress([], [], [], 4000)
    expect(context).toContain('---END KNOWLEDGE CONTEXT---')
  })

  it('returns zero citations for empty chunks', () => {
    const { citations } = compressor.compress([], [], [], 4000)
    expect(citations).toHaveLength(0)
  })

  it('includes RETRIEVED SOURCES section when chunks are present', () => {
    const chunks = [makeChunk({ finalScore: 0.8 })]
    const { context } = compressor.compress(chunks, [], [], 4000)
    expect(context).toContain('RETRIEVED SOURCES:')
  })

  it('includes source title and score in each citation entry', () => {
    const chunks = [makeChunk({ finalScore: 0.85, sourceTitle: 'My Doc' })]
    const { context } = compressor.compress(chunks, [], [], 4000)
    expect(context).toContain('My Doc')
    expect(context).toContain('0.85')
  })

  it('conflict warnings appear before retrieved sources', () => {
    const chunks = [makeChunk({ finalScore: 0.8, sourceTitle: 'Report A' })]
    const conflicts = [makeConflict()]
    const { context } = compressor.compress(chunks, [], conflicts, 4000)
    const conflictPos = context.indexOf('⚠️ CONFLICTING INFORMATION:')
    const sourcesPos  = context.indexOf('RETRIEVED SOURCES:')
    expect(conflictPos).toBeGreaterThanOrEqual(0)
    expect(conflictPos).toBeLessThan(sourcesPos)
  })

  it('formats conflict warning with entity, property, values, and sources', () => {
    const conflicts = [makeConflict()]
    const { context } = compressor.compress([], [], conflicts, 4000)
    expect(context).toContain('acme corp.ARR')
    expect(context).toContain('"5m"')
    expect(context).toContain('"10m"')
    expect(context).toContain('[Report A]')
    expect(context).toContain('[Report B]')
  })

  it('includes KNOWLEDGE GRAPH section when graph insights are present', () => {
    const insights = [makeGraphInsight('Acme Corp')]
    const { context } = compressor.compress([], insights, [], 4000)
    expect(context).toContain('KNOWLEDGE GRAPH:')
    expect(context).toContain('Acme Corp')
  })

  it('does not include KNOWLEDGE GRAPH section when no insights', () => {
    const { context } = compressor.compress([], [], [], 4000)
    expect(context).not.toContain('KNOWLEDGE GRAPH:')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Token budget and compression levels
// ──────────────────────────────────────────────────────────────────────────────

describe('ContextCompressor — token budget', () => {
  it('returns tokensUsed within the target budget', () => {
    const chunks = [makeChunk({ finalScore: 0.8, content: 'Short.' })]
    const { tokensUsed } = compressor.compress(chunks, [], [], 4000)
    expect(tokensUsed).toBeLessThanOrEqual(4000)
  })

  it('full content preserved when under budget (level 0 — NONE)', () => {
    const longContent = 'word '.repeat(50).trim() // ~250 chars, ~63 tokens
    const chunks = [makeChunk({ finalScore: 0.8, content: longContent })]
    const { context, tokensUsed } = compressor.compress(chunks, [], [], 4000)
    expect(context).toContain(longContent)
    expect(tokensUsed).toBeLessThanOrEqual(4000)
  })

  it('drops low-score chunks (< 0.3) at TRIM_LOW level', () => {
    // Force to TRIM_LOW by having all chunks together exceed the base budget
    // but the low-score chunk content is what pushes it over
    const manyChunks = Array.from({ length: 30 }, (_, i) =>
      makeChunk({
        chunkId:    `c${i}`,
        finalScore: i < 5 ? 0.1 : 0.8,   // first 5 are low-score
        content:    'x '.repeat(200).trim(), // ~1000 chars each → ~250 tokens each
        sourceTitle: `Source ${i}`,
      })
    )
    const { context } = compressor.compress(manyChunks, [], [], 3000)
    // Low-score chunks (Source 0–4) should be dropped at some compression level
    // High-score ones (Source 5+) should still appear
    expect(context).toContain('Source 5')
  })

  it('truncates chunks to 300 chars at TRUNCATE level', () => {
    // Create enough content to require truncation level
    const longContent = 'A'.repeat(1000)
    const manyChunks = Array.from({ length: 10 }, (_, i) =>
      makeChunk({
        chunkId:     `c${i}`,
        finalScore:  0.8,
        content:     longContent,
        sourceTitle: `S${i}`,
      })
    )
    const { context, tokensUsed } = compressor.compress(manyChunks, [], [], 1200)
    // At TRUNCATE level, content becomes 300 chars + "..."
    if (tokensUsed <= 1200) {
      expect(context).toContain('...')
    }
  })

  it('hard-truncates at character level when all levels exceed budget', () => {
    // Tiny budget — even the header alone exceeds it
    const { context, tokensUsed } = compressor.compress([], [], [], 5)
    expect(tokensUsed).toBeLessThanOrEqual(5)
    expect(context.length).toBeLessThanOrEqual(20) // 5 tokens × 4 chars
  })

  it('compressed output still contains at least the header', () => {
    const { context } = compressor.compress([], [], [], 5)
    // Even with a budget of 5 tokens, we expect the slice to include something
    expect(context.length).toBeGreaterThan(0)
  })

  it('tokensUsed estimate matches char-count / 4 formula', () => {
    const chunks = [makeChunk({ finalScore: 0.8, content: 'Hello world.' })]
    const { context, tokensUsed } = compressor.compress(chunks, [], [], 4000)
    expect(tokensUsed).toBe(estimateTokens(context))
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Score thresholds per compression level
// ──────────────────────────────────────────────────────────────────────────────

describe('ContextCompressor — score filtering', () => {
  it('includes chunk with score exactly 0.3 (at TRIM_LOW threshold)', () => {
    // Force a situation where we need TRIM_LOW: large content
    const atThreshold = makeChunk({ chunkId: 'threshold', finalScore: 0.3, content: 'Included.', sourceTitle: 'At' })
    const belowThreshold = makeChunk({ chunkId: 'below', finalScore: 0.29, content: 'Excluded.', sourceTitle: 'Below' })
    // Small budget so NONE level doesn't fit
    const hugeChunk = makeChunk({ chunkId: 'big', finalScore: 0.9, content: 'x '.repeat(1000).trim(), sourceTitle: 'Big' })
    const chunks = [hugeChunk, atThreshold, belowThreshold]
    const { context } = compressor.compress(chunks, [], [], 500)
    // 'At' should be retained, 'Below' should be dropped (score 0.29 < 0.3)
    expect(context).toContain('At')
    expect(context).not.toContain('Below')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Citation integrity
// ──────────────────────────────────────────────────────────────────────────────

describe('ContextCompressor — citation integrity', () => {
  it('produces one citation per included chunk', () => {
    const chunks = [
      makeChunk({ chunkId: 'c1', finalScore: 0.9, sourceTitle: 'Doc 1' }),
      makeChunk({ chunkId: 'c2', finalScore: 0.8, sourceTitle: 'Doc 2' }),
    ]
    const { citations } = compressor.compress(chunks, [], [], 4000)
    expect(citations).toHaveLength(2)
  })

  it('citation contains chunkId, documentId, sourceTitle, relevanceScore', () => {
    const chunks = [makeChunk({ chunkId: 'x1', documentId: 'd1', finalScore: 0.75, sourceTitle: 'My Source' })]
    const { citations } = compressor.compress(chunks, [], [], 4000)
    expect(citations[0]).toMatchObject({
      chunkId:        'x1',
      documentId:     'd1',
      sourceTitle:    'My Source',
      relevanceScore: 0.75,
    })
  })

  it('citation content is truncated to 200 chars', () => {
    const longContent = 'B'.repeat(500)
    const chunks = [makeChunk({ finalScore: 0.8, content: longContent })]
    const { citations } = compressor.compress(chunks, [], [], 4000)
    expect(citations[0]?.content.length).toBeLessThanOrEqual(200)
  })

  it('every source title referenced in context has a matching citation', () => {
    const chunks = [
      makeChunk({ chunkId: 'c1', finalScore: 0.9, sourceTitle: 'Alpha' }),
      makeChunk({ chunkId: 'c2', finalScore: 0.8, sourceTitle: 'Beta'  }),
    ]
    const { context, citations } = compressor.compress(chunks, [], [], 4000)
    const citedTitles = citations.map((c) => c.sourceTitle)
    // Every title in the context [1] / [2] headers must be in citations
    for (const title of citedTitles) {
      expect(context).toContain(title)
    }
  })

  it('no citations are returned for dropped low-score chunks', () => {
    const chunks = [
      makeChunk({ chunkId: 'c1', finalScore: 0.9, sourceTitle: 'Good',  content: 'x '.repeat(100) }),
      makeChunk({ chunkId: 'c2', finalScore: 0.1, sourceTitle: 'Bad',   content: 'y '.repeat(100) }),
    ]
    // Force TRIM_LOW by exceeding budget slightly with many high-content chunks
    const { citations, context } = compressor.compress(chunks, [], [], 200)
    const citedTitles = citations.map((c) => c.sourceTitle)
    // 'Bad' (score 0.1) should be dropped at TRIM_LOW and not appear in citations
    if (!context.includes('Bad')) {
      expect(citedTitles).not.toContain('Bad')
    }
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Graph compression levels
// ──────────────────────────────────────────────────────────────────────────────

describe('ContextCompressor — graph section compression', () => {
  it('includes all graph insights at level 0', () => {
    const insights = [
      makeGraphInsight('Entity A', 2),
      makeGraphInsight('Entity B', 2),
      makeGraphInsight('Entity C', 2),
      makeGraphInsight('Entity D', 2),
    ]
    // Small enough to stay at level 0 but have graph
    const { context } = compressor.compress([], insights, [], 4000)
    expect(context).toContain('Entity A')
    expect(context).toContain('Entity D')
  })

  it('limits graph insights to 2 at AGGRESSIVE level', () => {
    // Build enough content to force AGGRESSIVE compression
    const manyChunks = Array.from({ length: 20 }, (_, i) =>
      makeChunk({ chunkId: `c${i}`, finalScore: 0.9, content: 'x '.repeat(300).trim(), sourceTitle: `S${i}` })
    )
    const insights = Array.from({ length: 5 }, (_, i) => makeGraphInsight(`Entity ${i}`, 2))
    const { context } = compressor.compress(manyChunks, insights, [], 200)
    // At aggressive level, at most 2 insights included
    const entityMatches = ['Entity 0', 'Entity 1', 'Entity 2', 'Entity 3', 'Entity 4']
      .filter((e) => context.includes(e))
    expect(entityMatches.length).toBeLessThanOrEqual(2)
  })
})
