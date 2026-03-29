// Infinite Memory — 5-tier memory system for agent context
//
// Tier 1: Working Memory (Prisma)    — current session messages from DB
// Tier 2: Summary Memory (Prisma)    — compressed session summaries
// Tier 3: Episodic Memory (pgvector) — searchable past interactions
// Tier 4: Semantic Memory (Neo4j)    — knowledge graph relationships
// Tier 5: Archival Memory            — archived session references
//
// buildAgentContext() assembles <= 6000 tokens from all tiers.

import type { PrismaClient } from '@prisma/client'
import { InferenceEngine } from '@axis/inference'
import { Neo4jClient, GraphOperations } from '@axis/knowledge-graph'

/** Memory tier identifiers */
export type MemoryTier = 'WORKING' | 'SUMMARY' | 'EPISODIC' | 'SEMANTIC' | 'ARCHIVAL'

/** A working memory entry */
export interface WorkingMemoryEntry {
  role: 'USER' | 'ASSISTANT' | 'SYSTEM'
  content: string
  timestamp: string
  tokens: number
}

/** A session summary */
export interface SessionSummary {
  sessionId: string
  summary: string
  keyTopics: string[]
  clientId: string | null
  messageCount: number
  lastUpdated: string
  tokens: number
}

/** An episodic memory record */
export interface EpisodicMemory {
  id: string
  userId: string
  clientId: string | null
  content: string
  tags: string[]
  createdAt: string
  similarity?: number | undefined
}

/** Assembled agent context from all memory tiers */
export interface AssembledContext {
  text: string
  tokens: number
  tiersUsed: MemoryTier[]
  sessionSummary: string | null
  recentMessages: WorkingMemoryEntry[]
  episodicMemories: EpisodicMemory[]
}

const TIER_BUDGETS = {
  WORKING: 10000,   // Last 50 messages — enough for deep brainstorming
  SUMMARY: 2000,    // Cross-session context
  EPISODIC: 2000,   // Past interactions
  SEMANTIC: 1000,   // Graph context
  ARCHIVAL: 500,    // Referenced archives
} as const

const TOTAL_BUDGET = 15000
const WORKING_MEMORY_MAX_MESSAGES = 50

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export class InfiniteMemory {
  private engine: InferenceEngine
  private neo4jClient: Neo4jClient
  private graphOps: GraphOperations
  private prisma: PrismaClient | null

  constructor(options?: {
    engine?: InferenceEngine | undefined
    neo4jClient?: Neo4jClient | undefined
    prisma?: PrismaClient | undefined
  }) {
    this.engine = options?.engine ?? new InferenceEngine()
    this.neo4jClient = options?.neo4jClient ?? new Neo4jClient()
    this.graphOps = new GraphOperations(this.neo4jClient)
    this.prisma = options?.prisma ?? null
  }

  /**
   * Build the full agent context from all 5 memory tiers.
   * Assembles <= 6000 tokens of relevant context.
   */
  async buildAgentContext(
    sessionId: string,
    userId: string,
    clientId: string | null,
    currentMessage: string
  ): Promise<AssembledContext> {
    const tiersUsed: MemoryTier[] = []
    const parts: string[] = []
    let tokensRemaining = TOTAL_BUDGET

    // Tier 1: Working Memory — recent messages from current session
    const recentMessages = await this.getWorkingMemory(sessionId)
    if (recentMessages.length > 0) {
      tiersUsed.push('WORKING')
      const workingText = this.formatWorkingMemory(recentMessages, TIER_BUDGETS.WORKING)
      const workingTokens = estimateTokens(workingText)
      parts.push(`<RECENT_CONVERSATION>\n${workingText}\n</RECENT_CONVERSATION>`)
      tokensRemaining -= workingTokens
    }

    // Tier 2: Summary Memory — summaries from OTHER sessions with same client
    const summary = await this.getSessionSummary(sessionId, userId, clientId)
    let sessionSummary: string | null = null
    if (summary) {
      tiersUsed.push('SUMMARY')
      sessionSummary = summary.summary
      const summaryText = this.formatSummary(summary, Math.min(tokensRemaining, TIER_BUDGETS.SUMMARY))
      parts.push(`<PREVIOUS_SESSIONS>\n${summaryText}\n</PREVIOUS_SESSIONS>`)
      tokensRemaining -= estimateTokens(summaryText)
    }

    // Tier 3: Episodic Memory — relevant past interactions via Prisma
    const episodicMemories = await this.searchEpisodicMemory(
      currentMessage, userId, clientId,
      Math.min(tokensRemaining, TIER_BUDGETS.EPISODIC)
    )
    if (episodicMemories.length > 0) {
      tiersUsed.push('EPISODIC')
      const episodicText = this.formatEpisodicMemories(
        episodicMemories,
        Math.min(tokensRemaining, TIER_BUDGETS.EPISODIC)
      )
      parts.push(`<PAST_INTERACTIONS>\n${episodicText}\n</PAST_INTERACTIONS>`)
      tokensRemaining -= estimateTokens(episodicText)
    }

    // Tier 4: Semantic Memory — knowledge graph context from Neo4j
    if (this.neo4jClient.isAvailable() && clientId) {
      try {
        const graphContext = await this.getSemanticMemory(clientId, tokensRemaining)
        if (graphContext) {
          tiersUsed.push('SEMANTIC')
          parts.push(`<KNOWLEDGE_GRAPH>\n${graphContext}\n</KNOWLEDGE_GRAPH>`)
          tokensRemaining -= estimateTokens(graphContext)
        }
      } catch {
        // Neo4j failed — continue without graph context
      }
    }

    // Tier 5: Archival — note existence of archived sessions
    const archiveNote = await this.getArchivalNote(userId)
    if (archiveNote) {
      tiersUsed.push('ARCHIVAL')
      parts.push(`<ARCHIVES>\n${archiveNote}\n</ARCHIVES>`)
    }

    const text = parts.join('\n\n')

    void currentMessage

    return {
      text,
      tokens: estimateTokens(text),
      tiersUsed,
      sessionSummary,
      recentMessages,
      episodicMemories,
    }
  }

  /**
   * Add a message to working memory.
   * Messages are stored in the database, so this is a no-op — they're already there.
   * We just track them for the summarisation trigger.
   */
  async addToWorkingMemory(
    _sessionId: string,
    _role: 'USER' | 'ASSISTANT' | 'SYSTEM',
    _content: string
  ): Promise<void> {
    // Messages are already stored in the database via the API routes.
    // This method exists for the interface — no additional storage needed.
  }

  /**
   * Summarise the current session via Claude Haiku.
   */
  async summariseSession(sessionId: string, _userId: string): Promise<SessionSummary> {
    const messages = await this.getWorkingMemory(sessionId)

    const conversationText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n')

    let summaryText: string
    try {
      summaryText = await this.engine.summariseSession(
        messages.map((m) => ({
          role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
          content: m.content,
        }))
      )
    } catch {
      summaryText = conversationText.slice(0, 1000)
    }

    const keyTopics = this.extractKeyTopics(summaryText)

    return {
      sessionId,
      summary: summaryText,
      keyTopics,
      clientId: null,
      messageCount: messages.length,
      lastUpdated: new Date().toISOString(),
      tokens: estimateTokens(summaryText),
    }
  }

  /**
   * Store an episodic memory for future retrieval.
   */
  async storeEpisodicMemory(
    userId: string,
    clientId: string | null,
    content: string,
    tags: string[]
  ): Promise<void> {
    if (!this.prisma) return

    await this.prisma.agentMemory.create({
      data: {
        userId,
        ...(clientId ? { clientId } : {}),
        memoryType: 'EPISODIC',
        content,
        tags,
      },
    })
  }

  // ─── Private tier access methods ───────────────────────────────

  /** Tier 1: Get recent messages from the current session via Prisma */
  private async getWorkingMemory(sessionId: string): Promise<WorkingMemoryEntry[]> {
    if (!this.prisma) return []

    try {
      const messages = await this.prisma.message.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
        take: WORKING_MEMORY_MAX_MESSAGES,
        select: { role: true, content: true, createdAt: true },
      })

      return messages.reverse().map((m) => ({
        role: m.role as 'USER' | 'ASSISTANT' | 'SYSTEM',
        content: m.content,
        timestamp: m.createdAt.toISOString(),
        tokens: estimateTokens(m.content),
      }))
    } catch {
      return []
    }
  }

  /** Tier 2: Build summary from OTHER sessions with the same client */
  private async getSessionSummary(
    currentSessionId: string,
    userId: string,
    clientId: string | null
  ): Promise<SessionSummary | null> {
    if (!this.prisma) return null

    try {
      // Get recent messages from OTHER sessions (not current)
      const otherSessions = await this.prisma.session.findMany({
        where: {
          userId,
          id: { not: currentSessionId },
          ...(clientId ? { clientId } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        take: 3,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { role: true, content: true },
          },
        },
      })

      if (otherSessions.length === 0) return null

      const summaryParts: string[] = []
      let totalMessages = 0

      for (const session of otherSessions) {
        if (session.messages.length === 0) continue
        const preview = session.messages
          .reverse()
          .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
          .join('\n')
        summaryParts.push(`Session "${session.title ?? 'Untitled'}":\n${preview}`)
        totalMessages += session.messages.length
      }

      if (summaryParts.length === 0) return null

      return {
        sessionId: currentSessionId,
        summary: summaryParts.join('\n\n'),
        keyTopics: [],
        clientId,
        messageCount: totalMessages,
        lastUpdated: new Date().toISOString(),
        tokens: estimateTokens(summaryParts.join('\n\n')),
      }
    } catch {
      return null
    }
  }

  /** Tier 3: Search episodic memories via Prisma (text search, not vector) */
  private async searchEpisodicMemory(
    query: string,
    userId: string,
    clientId: string | null,
    tokenBudget: number
  ): Promise<EpisodicMemory[]> {
    if (!this.prisma) return []

    try {
      // Simple text search on episodic memories
      const memories = await this.prisma.agentMemory.findMany({
        where: {
          userId,
          memoryType: 'EPISODIC',
          ...(clientId ? { clientId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })

      // Filter to relevant memories based on keyword overlap
      const queryWords = new Set(query.toLowerCase().split(/\s+/).filter((w) => w.length > 3))
      const scored = memories.map((m) => {
        const contentWords = m.content.toLowerCase().split(/\s+/)
        const overlap = contentWords.filter((w) => queryWords.has(w)).length
        const tagOverlap = (m.tags as string[]).filter((t) =>
          queryWords.has(t.toLowerCase())
        ).length
        return { memory: m, score: overlap + tagOverlap * 2 }
      })

      const relevant = scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)

      // If no keyword matches, just return recent memories
      const results = relevant.length > 0
        ? relevant.map((s) => s.memory)
        : memories.slice(0, 3)

      let tokensUsed = 0
      const output: EpisodicMemory[] = []

      for (const m of results) {
        const tokens = estimateTokens(m.content)
        if (tokensUsed + tokens > tokenBudget) break
        output.push({
          id: m.id,
          userId: m.userId,
          clientId: m.clientId,
          content: m.content,
          tags: m.tags as string[],
          createdAt: m.createdAt.toISOString(),
        })
        tokensUsed += tokens
      }

      return output
    } catch {
      return []
    }
  }

  /** Tier 4: Get knowledge graph context from Neo4j */
  private async getSemanticMemory(
    clientId: string,
    tokenBudget: number
  ): Promise<string | null> {
    try {
      const subgraph = await this.graphOps.getClientSubgraph(clientId)
      if (!subgraph || subgraph.nodes.length === 0) return null

      const readableText = this.graphOps.toReadableText(subgraph)
      if (estimateTokens(readableText) > tokenBudget) {
        return readableText.slice(0, tokenBudget * 4)
      }
      return readableText
    } catch {
      return null
    }
  }

  /** Tier 5: Get archival note */
  private async getArchivalNote(userId: string): Promise<string | null> {
    if (!this.prisma) return null

    try {
      const exportCount = await this.prisma.exportRecord.count({
        where: { session: { userId } },
      })
      if (exportCount === 0) return null
      return `${exportCount} archived session export(s) available. Use search_knowledge_base to query them.`
    } catch {
      return null
    }
  }

  // ─── Formatting helpers ────────────────────────────────────────

  private formatWorkingMemory(messages: WorkingMemoryEntry[], tokenBudget: number): string {
    const selected: WorkingMemoryEntry[] = []
    let tokensUsed = 0

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (!msg) continue
      if (tokensUsed + msg.tokens > tokenBudget) break
      selected.unshift(msg)
      tokensUsed += msg.tokens
    }

    return selected
      .map((m) => `[${m.role}] ${m.content}`)
      .join('\n')
  }

  private formatSummary(summary: SessionSummary, tokenBudget: number): string {
    const text = `Previous session context (${summary.messageCount} messages):\n${summary.summary}`
    if (estimateTokens(text) > tokenBudget) {
      return text.slice(0, tokenBudget * 4)
    }
    return text
  }

  private formatEpisodicMemories(memories: EpisodicMemory[], tokenBudget: number): string {
    const lines: string[] = []
    let tokensUsed = 0

    for (const mem of memories) {
      const line = `[${mem.createdAt}] ${mem.content}`
      const lineTokens = estimateTokens(line)
      if (tokensUsed + lineTokens > tokenBudget) break
      lines.push(line)
      tokensUsed += lineTokens
    }

    return lines.join('\n')
  }

  private extractKeyTopics(text: string): string[] {
    const words = text.split(/\s+/)
    const counts = new Map<string, number>()

    for (const word of words) {
      const clean = word.replace(/[^a-zA-Z]/g, '')
      if (clean.length >= 4 && clean[0] === clean[0]?.toUpperCase()) {
        counts.set(clean, (counts.get(clean) ?? 0) + 1)
      }
    }

    return [...counts.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word)
  }
}
