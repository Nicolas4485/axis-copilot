import { describe, it, expect, beforeEach } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { RAGEngine } from '../index.js'
import type { RetrievedChunk, RAGConflict } from '../types.js'

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Reach into the private detectConflicts method for unit testing */
function detect(engine: RAGEngine, chunks: RetrievedChunk[]): RAGConflict[] {
  return (engine as unknown as { detectConflicts(c: RetrievedChunk[]): RAGConflict[] })
    .detectConflicts(chunks)
}

/** Factory — minimal valid RetrievedChunk */
function makeChunk(overrides: {
  content: string
  documentId?: string
  sourceTitle?: string
  chunkId?: string
}): RetrievedChunk {
  return {
    chunkId:     overrides.chunkId ?? 'chunk-1',
    documentId:  overrides.documentId ?? 'doc-1',
    content:     overrides.content,
    similarity:  0.9,
    sourceTitle: overrides.sourceTitle ?? 'Source A',
    sourceType:  'UPLOAD',
    clientId:    null,
    createdAt:   new Date().toISOString(),
    metadata:    {},
  }
}

const mockPrisma = {} as PrismaClient
let engine: RAGEngine

beforeEach(() => {
  engine = new RAGEngine({ prisma: mockPrisma })
})

// ──────────────────────────────────────────────────────────────────────────────
// True positives — clear contradictions
// ──────────────────────────────────────────────────────────────────────────────

describe('conflict-detection — true positives', () => {
  it('detects ARR conflict between two documents', () => {
    const chunks = [
      makeChunk({ content: 'Acme Corp ARR is $5M', documentId: 'doc-1', sourceTitle: 'Report A', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp ARR is $10M', documentId: 'doc-2', sourceTitle: 'Report B', chunkId: 'c2' }),
    ]
    const conflicts = detect(engine, chunks)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.property).toBe('ARR')
    expect(conflicts[0]?.entityName).toBe('acme corp')
    expect(conflicts[0]?.valueA).toBe('5m')
    expect(conflicts[0]?.valueB).toBe('10m')
  })

  it('detects revenue conflict', () => {
    const chunks = [
      makeChunk({ content: 'Acme Corp revenue of $50M', documentId: 'doc-1', sourceTitle: 'Q1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp revenue of $75M', documentId: 'doc-2', sourceTitle: 'Q4', chunkId: 'c2' }),
    ]
    const conflicts = detect(engine, chunks)
    expect(conflicts.some((c) => c.property === 'revenue')).toBe(true)
  })

  it('detects CEO conflict', () => {
    const chunks = [
      makeChunk({ content: 'Acme Corp CEO is John Smith', documentId: 'doc-1', sourceTitle: 'Bio', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp CEO is Jane Doe', documentId: 'doc-2', sourceTitle: 'News', chunkId: 'c2' }),
    ]
    const conflicts = detect(engine, chunks)
    const ceo = conflicts.find((c) => c.property === 'CEO')
    expect(ceo).toBeDefined()
    expect(ceo?.valueA).toBe('john smith')
    expect(ceo?.valueB).toBe('jane doe')
  })

  it('detects employee count conflict', () => {
    const chunks = [
      makeChunk({ content: 'Acme Corp has 200 employees', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp has 500 employees', documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
    ]
    const conflicts = detect(engine, chunks)
    expect(conflicts.some((c) => c.property === 'employees')).toBe(true)
  })

  it('detects founding year conflict', () => {
    const chunks = [
      makeChunk({ content: 'Acme Corp founded in 2015', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp founded in 2018', documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
    ]
    const conflicts = detect(engine, chunks)
    expect(conflicts.some((c) => c.property === 'founded')).toBe(true)
  })

  it('detects headquarters conflict', () => {
    const chunks = [
      makeChunk({ content: 'Acme Corp headquartered in London.', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp headquartered in New York.', documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
    ]
    const conflicts = detect(engine, chunks)
    expect(conflicts.some((c) => c.property === 'headquarters')).toBe(true)
  })

  it('detects valuation conflict', () => {
    const chunks = [
      makeChunk({ content: 'Acme Corp valuation of $100M', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp valuation of $200M', documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
    ]
    const conflicts = detect(engine, chunks)
    expect(conflicts.some((c) => c.property === 'valuation')).toBe(true)
  })

  it('detects funding conflict', () => {
    const chunks = [
      makeChunk({ content: 'Acme Corp raised $20M last year', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp raised $30M last year', documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
    ]
    const conflicts = detect(engine, chunks)
    expect(conflicts.some((c) => c.property === 'funding')).toBe(true)
  })

  it('detects CTO conflict', () => {
    const chunks = [
      makeChunk({ content: 'Acme Corp CTO is Sarah Park', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp CTO is Mike Chen', documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
    ]
    const conflicts = detect(engine, chunks)
    expect(conflicts.some((c) => c.property === 'CTO')).toBe(true)
  })

  it('returns sourceA/sourceB as source titles', () => {
    const chunks = [
      makeChunk({ content: 'Acme Corp ARR is $5M', documentId: 'doc-1', sourceTitle: 'Q1 Report', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp ARR is $10M', documentId: 'doc-2', sourceTitle: 'Q4 Report', chunkId: 'c2' }),
    ]
    const [conflict] = detect(engine, chunks)
    expect(conflict?.sourceA).toBe('Q1 Report')
    expect(conflict?.sourceB).toBe('Q4 Report')
  })

  it('sourceValue/conflictingValue are aliases for valueA/valueB', () => {
    const chunks = [
      makeChunk({ content: 'Acme Corp ARR is $5M', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp ARR is $10M', documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
    ]
    const [conflict] = detect(engine, chunks)
    expect(conflict?.sourceValue).toBe(conflict?.valueA)
    expect(conflict?.conflictingValue).toBe(conflict?.valueB)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// True negatives — no false alarms
// ──────────────────────────────────────────────────────────────────────────────

describe('conflict-detection — true negatives', () => {
  it('returns empty array for empty input', () => {
    expect(detect(engine, [])).toEqual([])
  })

  it('returns empty array when no extractable properties are mentioned', () => {
    const chunks = [
      makeChunk({ content: 'We had a great meeting today.', documentId: 'doc-1', chunkId: 'c1' }),
      makeChunk({ content: 'The project is going well.', documentId: 'doc-2', chunkId: 'c2' }),
    ]
    expect(detect(engine, chunks)).toEqual([])
  })

  it('returns empty when only one document mentions a property', () => {
    const chunks = [
      makeChunk({ content: 'Acme Corp ARR is $5M', documentId: 'doc-1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp is a great company', documentId: 'doc-2', chunkId: 'c2' }),
    ]
    expect(detect(engine, chunks)).toEqual([])
  })

  it('returns empty when both documents agree on the same ARR', () => {
    const chunks = [
      makeChunk({ content: 'Acme Corp ARR is $5M', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp ARR is $5M', documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
    ]
    expect(detect(engine, chunks)).toEqual([])
  })

  it('returns empty when both documents agree on the same CEO', () => {
    const chunks = [
      makeChunk({ content: 'Acme Corp CEO is John Smith', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp CEO is John Smith', documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
    ]
    expect(detect(engine, chunks)).toEqual([])
  })

  it('does not flag different entities with different values', () => {
    // Acme has $5M ARR, TechCorp has $10M ARR — two different entities, no conflict
    const chunks = [
      makeChunk({ content: 'Acme Corp ARR is $5M', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'Tech Corp ARR is $10M', documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
    ]
    const conflicts = detect(engine, chunks)
    // Two different entities — should be 0 conflicts (Acme Corp and Tech Corp have different keys)
    expect(conflicts.some((c) => c.entityName === 'acme corp')).toBe(false)
    expect(conflicts.some((c) => c.entityName === 'tech corp')).toBe(false)
  })

  it('does not flag same value from the same document appearing in multiple chunks', () => {
    // Same doc ID — first occurrence per doc wins, so only one fact → no conflict
    const chunks = [
      makeChunk({ content: 'Acme Corp ARR is $5M', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp ARR is $10M', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c2' }),
    ]
    // Same documentId — first occurrence wins, only one fact per doc → no conflict
    expect(detect(engine, chunks)).toEqual([])
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Edge cases
// ──────────────────────────────────────────────────────────────────────────────

describe('conflict-detection — edge cases', () => {
  it('normalises thousands separators — $5,000,000 and $5000000 are the same value', () => {
    // Both normalise to "5000000" after comma stripping → no conflict
    const chunks = [
      makeChunk({ content: 'Acme Corp revenue of $5,000,000', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp revenue of $5000000', documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
    ]
    expect(detect(engine, chunks)).toEqual([])
  })

  it('treats $5M and $5000000 as different values (no numeric equivalence)', () => {
    // "$5m" vs "5000000" — the regex extracts raw text, no numeric normalisation
    const chunks = [
      makeChunk({ content: 'Acme Corp revenue of $5M', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp revenue of $5000000', documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
    ]
    const conflicts = detect(engine, chunks)
    // These ARE different strings after normalisation ("5m" vs "5000000")
    expect(conflicts.some((c) => c.property === 'revenue')).toBe(true)
  })

  it('does not match CEO with single-letter initial (J. Smith fails regex)', () => {
    // "J. Smith" does not match [A-Z][a-z]+ — J has no following lowercase letters
    const chunks = [
      makeChunk({ content: 'Acme Corp CEO is John Smith', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp CEO is J. Smith', documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
    ]
    // "J. Smith" won't match — the second doc will have no CEO fact extracted
    // So no conflict can be formed
    const conflicts = detect(engine, chunks)
    expect(conflicts.some((c) => c.property === 'CEO')).toBe(false)
  })

  it('falls back to unnamed entity when no capitalised entity within 300 chars', () => {
    // Fact with no nearby entity — gets associated with 'unnamed'
    const chunks = [
      makeChunk({ content: 'The company ARR is $5M', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'The company ARR is $10M', documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
    ]
    const conflicts = detect(engine, chunks)
    const c = conflicts.find((c) => c.property === 'ARR')
    expect(c).toBeDefined()
    expect(c?.entityName).toBe('unnamed')
  })

  it('does not flag entity more than 300 chars before fact as the associated entity', () => {
    // Entity is 350 chars before the ARR mention — outside the 300-char window
    const farAway = 'A'.repeat(350)
    const chunks = [
      makeChunk({ content: `Acme Corp ${farAway} ARR is $5M`, documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: `Acme Corp ${farAway} ARR is $10M`, documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
    ]
    const conflicts = detect(engine, chunks)
    // Entity is out of range — falls back to 'unnamed'
    const c = conflicts.find((c) => c.property === 'ARR')
    expect(c?.entityName).toBe('unnamed')
  })

  it('deduplicates — only one conflict entry per entity+property pair', () => {
    // Three different sources all disagree on Acme Corp ARR — only one conflict entry
    const chunks = [
      makeChunk({ content: 'Acme Corp ARR is $5M', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp ARR is $10M', documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
      makeChunk({ content: 'Acme Corp ARR is $15M', documentId: 'doc-3', sourceTitle: 'S3', chunkId: 'c3' }),
    ]
    const conflicts = detect(engine, chunks)
    const arrConflicts = conflicts.filter((c) => c.property === 'ARR' && c.entityName === 'acme corp')
    expect(arrConflicts).toHaveLength(1)
  })

  it('detects multiple independent conflicts in one pass', () => {
    // Acme Corp has conflicting ARR AND conflicting CEO
    const chunks = [
      makeChunk({
        content: 'Acme Corp ARR is $5M. Acme Corp CEO is John Smith.',
        documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1',
      }),
      makeChunk({
        content: 'Acme Corp ARR is $10M. Acme Corp CEO is Jane Doe.',
        documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2',
      }),
    ]
    const conflicts = detect(engine, chunks)
    expect(conflicts.some((c) => c.property === 'ARR')).toBe(true)
    expect(conflicts.some((c) => c.property === 'CEO')).toBe(true)
  })

  it('handles annual recurring revenue spelled out', () => {
    const chunks = [
      makeChunk({ content: 'Acme Corp annual recurring revenue is $5M', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp annual recurring revenue is $8M', documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
    ]
    const conflicts = detect(engine, chunks)
    expect(conflicts.some((c) => c.property === 'ARR')).toBe(true)
  })

  it('handles headcount pattern separately from employees', () => {
    const chunks = [
      makeChunk({ content: 'Acme Corp headcount is: 300', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp headcount is: 450', documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
    ]
    const conflicts = detect(engine, chunks)
    expect(conflicts.some((c) => c.property === 'headcount')).toBe(true)
  })

  it('handles total funding pattern', () => {
    const chunks = [
      makeChunk({ content: 'Acme Corp total funding of $50M to date', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp total funding of $80M to date', documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
    ]
    const conflicts = detect(engine, chunks)
    expect(conflicts.some((c) => c.property === 'funding')).toBe(true)
  })

  it('handles CFO pattern', () => {
    const chunks = [
      makeChunk({ content: 'Acme Corp CFO is David Lee', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp CFO is Susan Wang', documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
    ]
    const conflicts = detect(engine, chunks)
    expect(conflicts.some((c) => c.property === 'CFO')).toBe(true)
  })

  it('handles founder pattern', () => {
    const chunks = [
      makeChunk({ content: 'Acme Corp founded by Alice Brown', documentId: 'doc-1', sourceTitle: 'S1', chunkId: 'c1' }),
      makeChunk({ content: 'Acme Corp founded by Bob Green', documentId: 'doc-2', sourceTitle: 'S2', chunkId: 'c2' }),
    ]
    const conflicts = detect(engine, chunks)
    expect(conflicts.some((c) => c.property === 'founder')).toBe(true)
  })
})
