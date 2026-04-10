import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BaseAgent } from '../base-agent.js'
import type { AgentConfig, AgentContext, RAGResult } from '../types.js'
import type { InferenceEngine } from '@axis/inference'
import type { InfiniteMemory } from '@axis/memory'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRoute = vi.fn()
const mockEngine = { route: mockRoute } as unknown as InferenceEngine

const mockAddToWorkingMemory = vi.fn().mockResolvedValue(undefined)
const mockBuildAgentContext = vi.fn().mockResolvedValue('')
const mockMemory = {
  addToWorkingMemory: mockAddToWorkingMemory,
  buildAgentContext: mockBuildAgentContext,
} as unknown as InfiniteMemory

const agentConfig: AgentConfig = {
  name: 'test-agent',
  role: 'Test Agent',
  systemPromptKey: 'AGENT_INTAKE' as const,
  tools: [],
  memoryTypes: [],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_RAG_METADATA = {
  vectorChunksFound: 0,
  graphEntitiesFound: 0,
  totalChunksBeforeRerank: 0,
  totalChunksAfterRerank: 0,
  retrievalMs: 0,
}

function makeRagResult(overrides: Partial<RAGResult> = {}): RAGResult {
  return {
    context: '',
    citations: [],
    conflicts: [],
    graphInsights: [],
    tokensUsed: 0,
    metadata: EMPTY_RAG_METADATA,
    ...overrides,
  }
}

function makeContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    sessionId: 'session-123',
    userId: 'user-456',
    clientId: 'client-789',
    assembledContext: '',
    stakeholders: [],
    ragResult: null,
    clientRecord: null,
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BaseAgent.run', () => {
  let agent: BaseAgent

  beforeEach(() => {
    agent = new BaseAgent(agentConfig, mockEngine, mockMemory)
    vi.clearAllMocks()
  })

  it('returns text content from a single-turn response (no tool calls)', async () => {
    mockRoute.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Hello, how can I help you today?' }],
      stopReason: 'end_turn',
    })

    const response = await agent.run('Hi there', makeContext())

    expect(response.content).toBe('Hello, how can I help you today?')
    expect(response.toolsUsed).toHaveLength(0)
    expect(response.citations).toHaveLength(0)
    expect(response.conflictsFound).toHaveLength(0)
  })

  it('stores the assistant message in working memory', async () => {
    mockRoute.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Response text' }],
      stopReason: 'end_turn',
    })

    await agent.run('Hello', makeContext())

    expect(mockAddToWorkingMemory).toHaveBeenCalledWith(
      'session-123',
      'ASSISTANT',
      'Response text',
    )
  })

  it('prepends conflict warning when ragResult has conflicts', async () => {
    mockRoute.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Analysis complete.' }],
      stopReason: 'end_turn',
    })

    const context = makeContext({
      ragResult: makeRagResult({
        conflicts: [{
          entityName: 'TechCorp',
          property: 'revenue',
          valueA: '$10M',
          valueB: '$15M',
          sourceA: 'doc-1',
          sourceB: 'doc-2',
          sourceValue: '$10M',
          conflictingValue: '$15M',
        }],
      }),
    })

    const response = await agent.run('Analyse TechCorp revenue', context)

    expect(response.content).toContain('CONFLICTING INFORMATION DETECTED')
    expect(response.content).toContain('TechCorp')
    expect(response.content).toContain('$10M')
    expect(response.content).toContain('$15M')
    expect(response.conflictsFound).toHaveLength(1)
  })

  it('populates citations from ragResult', async () => {
    mockRoute.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Here are the findings.' }],
      stopReason: 'end_turn',
    })

    const context = makeContext({
      ragResult: makeRagResult({
        citations: [{
          documentId: 'doc-1',
          chunkId: 'chunk-1',
          content: 'Revenue was $10M in 2023.',
          relevanceScore: 0.92,
          sourceTitle: 'Annual Report 2023',
        }],
      }),
    })

    const response = await agent.run('What was the revenue?', context)

    expect(response.citations).toHaveLength(1)
    expect(response.citations[0]?.sourceTitle).toBe('Annual Report 2023')
    expect(response.citations[0]?.relevanceScore).toBe(0.92)
  })

  it('includes client context in user content when clientRecord is provided', async () => {
    let capturedMessages: unknown[] = []
    mockRoute.mockImplementationOnce((_task: unknown, opts: { messages: unknown[] }) => {
      capturedMessages = opts.messages
      return Promise.resolve({
        content: [{ type: 'text', text: 'Done' }],
        stopReason: 'end_turn',
      })
    })

    const context = makeContext({
      clientRecord: {
        id: 'client-1',
        name: 'Acme Corp',
        industry: 'Technology',
        companySize: '200',
        techStack: [],
      },
    })

    await agent.run('Tell me about the client', context)

    const userMsg = capturedMessages[0] as { role: string; content: string }
    expect(userMsg.content).toContain('Acme Corp')
    expect(userMsg.content).toContain('Technology')
  })

  it('includes stakeholders in user content', async () => {
    let capturedMessages: unknown[] = []
    mockRoute.mockImplementationOnce((_task: unknown, opts: { messages: unknown[] }) => {
      capturedMessages = opts.messages
      return Promise.resolve({
        content: [{ type: 'text', text: 'Done' }],
        stopReason: 'end_turn',
      })
    })

    const context = makeContext({
      stakeholders: [{
        id: 'sh-1',
        name: 'Jane Smith',
        role: 'CTO',
        influence: 'HIGH',
        interest: 'HIGH',
      }],
    })

    await agent.run('Who are the key stakeholders?', context)

    const userMsg = capturedMessages[0] as { role: string; content: string }
    expect(userMsg.content).toContain('Jane Smith')
    expect(userMsg.content).toContain('CTO')
  })

  it('stops after max iterations (10) if model keeps returning tool_use', async () => {
    // Always return a tool_use stop reason — agent should stop after 10 iterations
    mockRoute.mockResolvedValue({
      content: [
        { type: 'text', text: 'thinking...' },
        { type: 'tool_use', id: 'tu-1', name: 'unknown_tool', input: {} },
      ],
      stopReason: 'tool_use',
    })

    const response = await agent.run('Keep using tools', makeContext())

    // Should have called route exactly 10 times
    expect(mockRoute).toHaveBeenCalledTimes(10)
    // Final content is empty string (reasoning was captured but not final text)
    expect(typeof response.content).toBe('string')
  })

  it('returns empty citations when no ragResult', async () => {
    mockRoute.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'No context available.' }],
      stopReason: 'end_turn',
    })

    const response = await agent.run('Tell me something', makeContext({ ragResult: null }))
    expect(response.citations).toHaveLength(0)
    expect(response.conflictsFound).toHaveLength(0)
  })
})
