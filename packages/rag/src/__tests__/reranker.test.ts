import { describe, it, expect } from 'vitest'
import { Reranker } from '../reranker.js'
import type { RetrievedChunk, RAGConflict } from '../types.js'

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeChunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    chunkId:     overrides.chunkId     ?? 'c1',
    documentId:  overrides.documentId  ?? 'doc-1',
    content:     overrides.content     ?? 'test content',
    similarity:  overrides.similarity  ?? 0.9,
    sourceTitle: overrides.sourceTitle ?? 'Test Source',
    sourceType:  overrides.sourceType  ?? 'UPLOAD',
    clientId:    overrides.clientId    !== undefined ? overrides.clientId : null,
    createdAt:   overrides.createdAt   ?? new Date().toISOString(),
    metadata:    overrides.metadata    ?? {},
  }
}

function makeConflict(sourceA: string, sourceB: string): RAGConflict {
  return {
    entityName: 'acme corp',
    property: 'ARR',
    valueA: '5m',
    valueB: '10m',
    sourceA,
    sourceB,
    sourceValue: '5m',
    conflictingValue: '10m',
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Scoring component tests
// ──────────────────────────────────────────────────────────────────────────────

describe('Reranker — similarity normalisation', () => {
  const reranker = new Reranker()

  it('similarity at floor (0.72) normalises to 0', () => {
    const chunk = makeChunk({ similarity: 0.72, sourceType: 'UPLOAD', clientId: null, createdAt: new Date().toISOString() })
    const [result] = reranker.rerank([chunk], { targetClientId: null, conflicts: [] })
    expect(result?.scoreBreakdown.similarity).toBe(0)
  })

  it('similarity at 1.0 normalises to 1.0', () => {
    const chunk = makeChunk({ similarity: 1.0 })
    const [result] = reranker.rerank([chunk], { targetClientId: null, conflicts: [] })
    expect(result?.scoreBreakdown.similarity).toBeCloseTo(1.0, 5)
  })

  it('similarity at 0.86 normalises to ~0.5 (midpoint of [0.72, 1.0])', () => {
    const chunk = makeChunk({ similarity: 0.86 })
    const [result] = reranker.rerank([chunk], { targetClientId: null, conflicts: [] })
    expect(result?.scoreBreakdown.similarity).toBeCloseTo(0.5, 2)
  })

  it('similarity below floor (0.5) normalises to 0', () => {
    const chunk = makeChunk({ similarity: 0.5 })
    const [result] = reranker.rerank([chunk], { targetClientId: null, conflicts: [] })
    expect(result?.scoreBreakdown.similarity).toBe(0)
  })
})

describe('Reranker — recency scoring', () => {
  const reranker = new Reranker()

  it('doc created today scores ~1.0 recency', () => {
    const chunk = makeChunk({ createdAt: new Date().toISOString() })
    const [result] = reranker.rerank([chunk], { targetClientId: null, conflicts: [] })
    expect(result?.scoreBreakdown.recency).toBeCloseTo(1.0, 1)
  })

  it('doc created 90 days ago scores ~0.5 recency (half-life)', () => {
    const date = new Date()
    date.setDate(date.getDate() - 90)
    const chunk = makeChunk({ createdAt: date.toISOString() })
    const [result] = reranker.rerank([chunk], { targetClientId: null, conflicts: [] })
    expect(result?.scoreBreakdown.recency).toBeCloseTo(0.5, 1)
  })

  it('doc created 180 days ago scores ~0.25 recency', () => {
    const date = new Date()
    date.setDate(date.getDate() - 180)
    const chunk = makeChunk({ createdAt: date.toISOString() })
    const [result] = reranker.rerank([chunk], { targetClientId: null, conflicts: [] })
    expect(result?.scoreBreakdown.recency).toBeCloseTo(0.25, 1)
  })

  it('newer doc ranks above older doc when other factors equal', () => {
    const recentDate = new Date().toISOString()
    const oldDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString()

    const chunks = [
      makeChunk({ chunkId: 'old', createdAt: oldDate, similarity: 0.9 }),
      makeChunk({ chunkId: 'new', createdAt: recentDate, similarity: 0.9 }),
    ]
    const ranked = reranker.rerank(chunks, { targetClientId: null, conflicts: [] })
    expect(ranked[0]?.chunkId).toBe('new')
  })
})

describe('Reranker — source type weights', () => {
  const reranker = new Reranker()

  it('GDRIVE scores 0.9 source weight', () => {
    const chunk = makeChunk({ sourceType: 'GDRIVE' })
    const [result] = reranker.rerank([chunk], { targetClientId: null, conflicts: [] })
    expect(result?.scoreBreakdown.sourceWeight).toBeCloseTo(0.9, 5)
  })

  it('UPLOAD scores 0.85 source weight', () => {
    const chunk = makeChunk({ sourceType: 'UPLOAD' })
    const [result] = reranker.rerank([chunk], { targetClientId: null, conflicts: [] })
    expect(result?.scoreBreakdown.sourceWeight).toBeCloseTo(0.85, 5)
  })

  it('WEB scores 0.6 source weight', () => {
    const chunk = makeChunk({ sourceType: 'WEB' })
    const [result] = reranker.rerank([chunk], { targetClientId: null, conflicts: [] })
    expect(result?.scoreBreakdown.sourceWeight).toBeCloseTo(0.6, 5)
  })

  it('unknown source type defaults to 0.5', () => {
    const chunk = makeChunk({ sourceType: 'UNKNOWN_TYPE' })
    const [result] = reranker.rerank([chunk], { targetClientId: null, conflicts: [] })
    expect(result?.scoreBreakdown.sourceWeight).toBeCloseTo(0.5, 5)
  })

  it('GDRIVE outranks WEB when everything else is equal', () => {
    const chunks = [
      makeChunk({ chunkId: 'web',    sourceType: 'WEB',    similarity: 0.9 }),
      makeChunk({ chunkId: 'gdrive', sourceType: 'GDRIVE', similarity: 0.9 }),
    ]
    const ranked = reranker.rerank(chunks, { targetClientId: null, conflicts: [] })
    expect(ranked[0]?.chunkId).toBe('gdrive')
  })
})

describe('Reranker — client boost', () => {
  const reranker = new Reranker()

  it('matching clientId scores 1.0 boost', () => {
    const chunk = makeChunk({ clientId: 'client-abc' })
    const [result] = reranker.rerank([chunk], { targetClientId: 'client-abc', conflicts: [] })
    expect(result?.scoreBreakdown.clientBoost).toBeCloseTo(1.0, 5)
  })

  it('null chunk clientId scores 0.3 boost when target is set', () => {
    const chunk = makeChunk({ clientId: null })
    const [result] = reranker.rerank([chunk], { targetClientId: 'client-abc', conflicts: [] })
    expect(result?.scoreBreakdown.clientBoost).toBeCloseTo(0.3, 5)
  })

  it('different client scores 0.0 boost', () => {
    const chunk = makeChunk({ clientId: 'client-xyz' })
    const [result] = reranker.rerank([chunk], { targetClientId: 'client-abc', conflicts: [] })
    expect(result?.scoreBreakdown.clientBoost).toBeCloseTo(0.0, 5)
  })

  it('no target client scores 0.5 boost (neutral)', () => {
    const chunk = makeChunk({ clientId: 'client-abc' })
    const [result] = reranker.rerank([chunk], { targetClientId: null, conflicts: [] })
    expect(result?.scoreBreakdown.clientBoost).toBeCloseTo(0.5, 5)
  })

  it('client-matched chunk outranks non-matched chunk when similarity is equal', () => {
    const chunks = [
      makeChunk({ chunkId: 'other',  clientId: null,         similarity: 0.9 }),
      makeChunk({ chunkId: 'mine',   clientId: 'client-abc', similarity: 0.9 }),
    ]
    const ranked = reranker.rerank(chunks, { targetClientId: 'client-abc', conflicts: [] })
    expect(ranked[0]?.chunkId).toBe('mine')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Conflict penalty
// ──────────────────────────────────────────────────────────────────────────────

describe('Reranker — conflict penalty', () => {
  const reranker = new Reranker()

  it('chunk from a conflicting source title gets penalty of 1.0', () => {
    const chunk = makeChunk({ sourceTitle: 'Report A', documentId: 'doc-1' })
    const conflict = makeConflict('Report A', 'Report B')
    const [result] = reranker.rerank([chunk], { targetClientId: null, conflicts: [conflict] })
    expect(result?.scoreBreakdown.conflictPenalty).toBe(1.0)
  })

  it('chunk from a non-conflicting source title gets penalty of 0.0', () => {
    const chunk = makeChunk({ sourceTitle: 'Unrelated Source', documentId: 'doc-3' })
    const conflict = makeConflict('Report A', 'Report B')
    const [result] = reranker.rerank([chunk], { targetClientId: null, conflicts: [conflict] })
    expect(result?.scoreBreakdown.conflictPenalty).toBe(0.0)
  })

  it('conflicting chunk ranks below non-conflicting chunk', () => {
    const chunks = [
      makeChunk({ chunkId: 'clean',    sourceTitle: 'Clean Source',     similarity: 0.9 }),
      makeChunk({ chunkId: 'conflict', sourceTitle: 'Conflicting Doc',  similarity: 0.9 }),
    ]
    const conflict = makeConflict('Conflicting Doc', 'Other Doc')
    const ranked = reranker.rerank(chunks, { targetClientId: null, conflicts: [conflict] })
    expect(ranked[0]?.chunkId).toBe('clean')
  })

  it('no conflicts means all chunks get 0.0 penalty', () => {
    const chunks = [
      makeChunk({ chunkId: 'a', sourceTitle: 'Doc A' }),
      makeChunk({ chunkId: 'b', sourceTitle: 'Doc B' }),
    ]
    const ranked = reranker.rerank(chunks, { targetClientId: null, conflicts: [] })
    ranked.forEach((r) => expect(r.scoreBreakdown.conflictPenalty).toBe(0.0))
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Composite score + final score properties
// ──────────────────────────────────────────────────────────────────────────────

describe('Reranker — composite scoring', () => {
  const reranker = new Reranker()

  it('computes correct final score for a known input', () => {
    // sim=1.0 → normalised=1.0, today, GDRIVE=0.9, matching client=1.0, no conflict
    // Expected: 1.0×0.40 + 1.0×0.20 + 0.9×0.15 + 1.0×0.15 - 0×0.10 = 0.885
    const chunk = makeChunk({
      similarity:  1.0,
      sourceType:  'GDRIVE',
      clientId:    'c1',
      createdAt:   new Date().toISOString(),
      sourceTitle: 'Clean',
    })
    const [result] = reranker.rerank([chunk], { targetClientId: 'c1', conflicts: [] })
    expect(result?.finalScore).toBeCloseTo(0.885, 1)
  })

  it('final score is clamped to [0, 1]', () => {
    // Even if components sum > 1, clamp at 1
    const chunk = makeChunk({ similarity: 1.0, sourceType: 'GDRIVE', clientId: 'c1', createdAt: new Date().toISOString() })
    const [result] = reranker.rerank([chunk], { targetClientId: 'c1', conflicts: [] })
    expect(result?.finalScore).toBeGreaterThanOrEqual(0)
    expect(result?.finalScore).toBeLessThanOrEqual(1)
  })

  it('final score never goes below 0 even with maximum conflict penalty', () => {
    // Old doc, below-floor similarity, conflicting → raw could be negative
    const oldDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
    const chunk = makeChunk({
      similarity:  0.72,  // at floor → normalised = 0
      sourceType:  'WEB',
      clientId:    'other-client',
      createdAt:   oldDate,
      sourceTitle: 'Bad Source',
    })
    const conflict = makeConflict('Bad Source', 'Another')
    const [result] = reranker.rerank([chunk], { targetClientId: 'my-client', conflicts: [conflict] })
    expect(result?.finalScore).toBeGreaterThanOrEqual(0)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Sorting and limits
// ──────────────────────────────────────────────────────────────────────────────

describe('Reranker — ordering and limits', () => {
  const reranker = new Reranker()

  it('returns chunks sorted by finalScore descending', () => {
    const today = new Date().toISOString()
    const oldDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString()

    const chunks = [
      makeChunk({ chunkId: 'low',  similarity: 0.75, createdAt: oldDate }),
      makeChunk({ chunkId: 'high', similarity: 0.95, createdAt: today  }),
      makeChunk({ chunkId: 'mid',  similarity: 0.85, createdAt: today  }),
    ]
    const ranked = reranker.rerank(chunks, { targetClientId: null, conflicts: [] })
    expect(ranked[0]?.chunkId).toBe('high')
    expect(ranked[1]?.chunkId).toBe('mid')
    expect(ranked[2]?.chunkId).toBe('low')
  })

  it('respects the limit option', () => {
    const chunks = Array.from({ length: 15 }, (_, i) =>
      makeChunk({ chunkId: `c${i}`, similarity: 0.9 - i * 0.01 })
    )
    const ranked = reranker.rerank(chunks, { targetClientId: null, conflicts: [], limit: 5 })
    expect(ranked).toHaveLength(5)
  })

  it('defaults limit to 10', () => {
    const chunks = Array.from({ length: 20 }, (_, i) =>
      makeChunk({ chunkId: `c${i}`, similarity: 0.9 })
    )
    const ranked = reranker.rerank(chunks, { targetClientId: null, conflicts: [] })
    expect(ranked).toHaveLength(10)
  })

  it('returns all chunks when count is below default limit', () => {
    const chunks = [
      makeChunk({ chunkId: 'a' }),
      makeChunk({ chunkId: 'b' }),
    ]
    const ranked = reranker.rerank(chunks, { targetClientId: null, conflicts: [] })
    expect(ranked).toHaveLength(2)
  })

  it('returns empty array for empty input', () => {
    expect(reranker.rerank([], { targetClientId: null, conflicts: [] })).toEqual([])
  })

  it('output includes scoreBreakdown on every result', () => {
    const chunk = makeChunk()
    const [result] = reranker.rerank([chunk], { targetClientId: null, conflicts: [] })
    expect(result?.scoreBreakdown).toMatchObject({
      similarity:       expect.any(Number),
      recency:          expect.any(Number),
      sourceWeight:     expect.any(Number),
      clientBoost:      expect.any(Number),
      conflictPenalty:  expect.any(Number),
    })
  })

  it('weight change shifts rankings predictably', () => {
    // Two chunks equal except one is GDRIVE and one is WEB
    // GDRIVE has sourceWeight 0.9 vs WEB 0.6, so GDRIVE should win
    const chunks = [
      makeChunk({ chunkId: 'web',    sourceType: 'WEB',    similarity: 0.9 }),
      makeChunk({ chunkId: 'gdrive', sourceType: 'GDRIVE', similarity: 0.9 }),
    ]
    const ranked = reranker.rerank(chunks, { targetClientId: null, conflicts: [] })
    // GDRIVE ranks first due to higher source weight
    expect(ranked[0]?.chunkId).toBe('gdrive')
    // And the score difference equals (0.9 - 0.6) × 0.15 = 0.045
    const scoreDiff = (ranked[0]?.finalScore ?? 0) - (ranked[1]?.finalScore ?? 0)
    expect(scoreDiff).toBeCloseTo(0.045, 3)
  })
})
