import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryDecomposer } from '../query-decomposer.js'
import type { InferenceEngine } from '@axis/inference'

// Mock the InferenceEngine so tests don't call Ollama/Claude
const mockRoute = vi.fn()
const mockEngine = { route: mockRoute } as unknown as InferenceEngine

describe('QueryDecomposer', () => {
  let decomposer: QueryDecomposer

  beforeEach(() => {
    decomposer = new QueryDecomposer(mockEngine)
    vi.clearAllMocks()
  })

  describe('decompose — happy path', () => {
    it('parses a valid JSON response from the model', async () => {
      mockRoute.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify({
            vectorQueries: ['Acme Corp React migration', 'React migration frontend'],
            graphQueries: [{ entityName: 'Acme Corp', relationshipTypes: ['WORKS_AT'], depth: 2 }],
            entityFocus: ['Acme Corp', 'React'],
            temporalFilter: { label: 'most recent meeting' },
          }),
        }],
        stopReason: 'end_turn',
      })

      const result = await decomposer.decompose(
        "What did Acme Corp's CTO say about React migration in our last meeting?",
        { clientName: 'Acme Corp' }
      )

      expect(result.original).toBe("What did Acme Corp's CTO say about React migration in our last meeting?")
      expect(result.vectorQueries).toHaveLength(2)
      expect(result.vectorQueries[0]).toBe('Acme Corp React migration')
      expect(result.graphQueries).toHaveLength(1)
      expect(result.graphQueries[0]?.entityName).toBe('Acme Corp')
      expect(result.entityFocus).toContain('React')
      expect(result.temporalFilter?.label).toBe('most recent meeting')
    })

    it('handles JSON embedded in prose (extracts first {} block)', async () => {
      mockRoute.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: 'Here is my analysis: {"vectorQueries":["budget forecast"],"graphQueries":[],"entityFocus":["budget"],"temporalFilter":null} Hope that helps.',
        }],
        stopReason: 'end_turn',
      })

      const result = await decomposer.decompose('What is the budget forecast?')
      expect(result.vectorQueries).toEqual(['budget forecast'])
      expect(result.temporalFilter).toBeNull()
    })

    it('preserves empty vectorQueries array when model returns []', async () => {
      // The code uses ?? (nullish coalescing), so [] is kept as-is (not replaced with [query])
      mockRoute.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify({
            vectorQueries: [],
            graphQueries: [],
            entityFocus: [],
            temporalFilter: null,
          }),
        }],
        stopReason: 'end_turn',
      })

      const result = await decomposer.decompose('simple question')
      // Empty array is returned as-is — caller should handle empty vectorQueries
      expect(result.vectorQueries).toEqual([])
      expect(result.original).toBe('simple question')
    })
  })

  describe('decompose — fallback path', () => {
    it('falls back to simpleFallback when model returns invalid JSON', async () => {
      mockRoute.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Sorry, I cannot process that query.' }],
        stopReason: 'end_turn',
      })

      const result = await decomposer.decompose('What is the project timeline?')
      expect(result.original).toBe('What is the project timeline?')
      expect(result.vectorQueries).toEqual(['What is the project timeline?'])
      expect(result.graphQueries).toHaveLength(0) // no capitalised entities
    })

    it('falls back when engine throws', async () => {
      mockRoute.mockRejectedValueOnce(new Error('Ollama unavailable'))

      const result = await decomposer.decompose('Tell me about TechCorp')
      expect(result.vectorQueries).toEqual(['Tell me about TechCorp'])
      // "TechCorp" should be extracted as an entity
      expect(result.entityFocus).not.toContain('TechCorp') // single word, no multi-word match
    })

    it('extracts multi-word capitalised entities in fallback', async () => {
      mockRoute.mockRejectedValueOnce(new Error('fail'))

      const result = await decomposer.decompose('What does Acme Corp think about Google Cloud?')
      expect(result.entityFocus).toContain('Acme Corp')
      expect(result.entityFocus).toContain('Google Cloud')
    })
  })

  describe('decompose — temporal filters', () => {
    it('normalises a temporal filter with after/before dates', async () => {
      mockRoute.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify({
            vectorQueries: ['quarterly review'],
            graphQueries: [],
            entityFocus: [],
            temporalFilter: { after: '2024-01-01', before: '2024-03-31', label: 'Q1 2024' },
          }),
        }],
        stopReason: 'end_turn',
      })

      const result = await decomposer.decompose('What happened in the Q1 quarterly review?')
      expect(result.temporalFilter?.after).toBe('2024-01-01')
      expect(result.temporalFilter?.before).toBe('2024-03-31')
      expect(result.temporalFilter?.label).toBe('Q1 2024')
    })
  })
})
