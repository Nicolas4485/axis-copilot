// Infinite Memory – 5-tier memory system for agent context
//
// Tier 1: Working Memory (Redis)     – current session messages (fast, ephemeral)
// Tier 2: Summary Memory (Prisma)    – compressed session summaries
// Tier 3: Episodic Memory (Prisma)   – searchable past interactions
// Tier 4: Semantic Memory (Neo4j)    – knowledge graph relationships
// Tier 5: Archival Memory            – archived session references
//
// buildAgentContext() assembles <= 6000 tokens from all tiers.

import type { PrismaClient } from '@prisma/client'
import { Redis } from 'ioredis'
import { InferenceEngine } from '@axis/inference'
import { Neo4jClient, GraphOperations } from '@axis/knowledge-graph'

/** Memory tier identifiers */
export type MemoryTier = 'WORKING' | 'SUMMARY' | 'EPISODIC' | 'SEMANTIC' | 'ARCHIVAL' | 'PROCEDURAL'

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
  WORKING: 10000,    // Last 50 messages – enough for deep brainstorming
  SUMMARY: 2000,     // Cross-session context
  EPISODIC: 2000,    // Past interactions
  SEMANTIC: 1000,    // Graph context
  ARCHIVAL: 500,     // Referenced archives
  PROCEDURAL: 1500,  // User corrections and positive examples
} as const

const TOTAL_BUDGET = 15000
const WORKING_MEMORY_MAX_MESSAGES = 50
const REDIS_WORKING_MEMORY_TTL = 86400 // 24 hours

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export class InfiniteMemory {
  private engine: InferenceEngine
  private neo4jClient: Neo4jClient
  private graphOps: GraphOperations
  private prisma: PrismaClient | null
  private redis: Redis | null

  constructor(options?: {
    engine?: InferenceEngine | undefined
    neo4jClient?: Neo4jClient | undefined
    prisma?: PrismaClient | undefined
    redis?: Redis | undefined
  }) {
    this.engine = options?.engine ?? new InferenceEngine()
    this.neo4jClient = options?.neo4jClient ?? new Neo4jClient()
    this.graphOps = new GraphOperations(this.neo4jClient)
    this.prisma = options?.prisma ?? null
    this.redis = options?.redis ?? null

    // Initialize Redis if not provided but REDIS_URL is set
    if (!this.redis && process.env['REDIS_URL']) {
      try {
        this.redis = new Redis(process.env['REDIS_URL'])
      } catch (err) {
        console.warn('[InfiniteMemory] Failed to initialize Redis:', err instanceof Error ? err.message : 'Unknown')
        this.redis = null
      }
    }
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

    // Tier 1: Working Memory – recent messages from current session (Redis)
    const recentMessages = await this.getWorkingMemory(sessionId)
    if (recentMessages.length > 0) {
      tiersUsed.push('WORKING')
      const workingText = this.formatWorkingMemory(recentMessages, TIER_BUDGETS.WORKING)
      const workingTokens = estimateTokens(workingText)
      parts.push(`<RECENT_CONVERSATION>\n${workingText}\n</RECENT_CONVERSATION>`)
      tokensRemaining -= workingTokens
    }

    // Tier 2: Summary Memory – summaries from OTHER sessions with same client
    const summary = await this.getSessionSummary(sessionId, userId, clientId)
    let sessionSummary: string | null = null
    if (summary) {
      tiersUsed.push('SUMMARY')
      sessionSummary = summary.summary
      const summaryText = this.formatSummary(summary, Math.min(tokensRemaining, TIER_BUDGETS.SUMMARY))
      parts.push(`<PREVIOUS_SESSIONS>\n${summaryText}\n</PREVIOUS_SESSIONS>`)
      tokensRemaining -= estimateTokens(summaryText)
    }

    // Tier 3: Episodic Memory – relevant past interactions via Prisma
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

    // Tier 4: Semantic Memory – knowledge graph context from Neo4j
    if (this.neo4jClient.isAvailable() && clientId) {
      try {
        const graphContext = await this.getSemanticMemory(clientId, tokensRemaining)
        if (graphContext) {
          tiersUsed.push('SEMANTIC')
          parts.push(`<KNOWLEDGE_GRAPH>\n${graphContext}\n</KNOWLEDGE_GRAPH>`)
          tokensRemaining -= estimateTokens(graphContext)
        }
      } catch {
        // Neo4j failed – continue without graph context
      }
    }

    // Tier 5: Archival – note existence of archived sessions
    const archiveNote = await this.getArchivalNote(userId)
    if (archiveNote) {
      tiersUsed.push('ARCHIVAL')
      parts.push(`<ARCHIVES>\n${archiveNote}\n</ARCHIVES>`)
    }

    // Tier 6: Procedural – user corrections and positive examples
    try {
      const proceduralText = await this.getProcedualMemories(userId)
      if (proceduralText) {
        tiersUsed.push('PROCEDURAL')
        parts.push(`<PAST_CORRECTIONS>\n${proceduralText}\n</PAST_CORRECTIONS>`)
      }
    } catch {
      // Procedural memory unavailable – continue without it
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
   * Add a message to working memory (Redis).
   * Stores message in Redis with session-based TTL for fast retrieval.
   */
  async addToWorkingMemory(
    sessionId: string,
    role: 'USER' | 'ASSISTANT' | 'SYSTEM',
    content: string
  ): Promise<void> {
    if (!this.redis) {
      // No Redis available – messages are in Prisma already
      return
    }

    try {
      const timestamp = new Date().toISOString()
      const tokens = estimateTokens(content)
      const entry: WorkingMemoryEntry = {
        role,
        content,
        timestamp,
        tokens,
      }

      // Store in Redis as a list per session
      const key = `working-memory:${sessionId}`
      const serialized = JSON.stringify(entry)

      // Push to list
      await this.redis.rpush(key, serialized)

      // Trim list to keep only last 50 messages
      await this.redis.ltrim(key, -WORKING_MEMORY_MAX_MESSAGES, -1)

      // Set expiry (24 hours)
      await this.redis.expire(key, REDIS_WORKING_MEMORY_TTL)
    } catch (err) {
      console.warn('[InfiniteMemory] Failed to store working memory in Redis:', err instanceof Error ? err.message : 'Unknown')
      // Silently fail – not critical if Redis is down
    }
  }

  /**
   * Summarise the current session via Claude Haiku and persist the result.
   *
   * Summary is stored as an AgentMemory (SEMANTIC type, tagged
   * ['session_summary', sessionId]) so getSessionSummary() can read it
   * in future sessions instead of fetching raw message snippets.
   */
  async summariseSession(sessionId: string, userId: string): Promise<SessionSummary> {
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

    // Persist summary to AgentMemory for cross-session retrieval (F25)
    if (this.prisma && summaryText) {
      try {
        await this.prisma.agentMemory.upsert({
          where: {
            // Use a stable composite key via a unique constraint workaround:
            // upsert by checking for an existing record with these tags
            id: `summary-${sessionId}`,
          },
          update: {
            content: summaryText,
            tags: ['session_summary', sessionId],
          },
          create: {
            id: `summary-${sessionId}`,
            userId,
            memoryType: 'SEMANTIC',
            content: summaryText,
            tags: ['session_summary', sessionId],
          },
        })
      } catch {
        // Upsert may fail if id is already used differently — silently continue
      }
    }

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

  // ──── Private tier access methods ──────────────────────────────────────────────

  /** Tier 1: Get recent messages from the current session via Redis, fallback to Prisma */
  private async getWorkingMemory(sessionId: string): Promise<WorkingMemoryEntry[]> {
    // Try Redis first
    if (this.redis) {
      try {
        const key = `working-memory:${sessionId}`
        const rawEntries = await this.redis.lrange(key, 0, -1)

        if (rawEntries.length > 0) {
          const entries: WorkingMemoryEntry[] = []
          for (const raw of rawEntries) {
            try {
              entries.push(JSON.parse(raw) as WorkingMemoryEntry)
            } catch {
              // Skip malformed entries
            }
          }
          if (entries.length > 0) {
            return entries
          }
        }
      } catch (err) {
        console.warn('[InfiniteMemory] Failed to fetch from Redis:', err instanceof Error ? err.message : 'Unknown')
        // Fall through to Prisma
      }
    }

    // Fallback to Prisma
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

  /**
   * Tier 2: Build cross-session context.
   *
   * Reads LLM-generated summaries persisted by summariseSession() first.
   * Falls back to raw message snippets for sessions that haven't been summarised yet.
   */
  private async getSessionSummary(
    currentSessionId: string,
    userId: string,
    clientId: string | null
  ): Promise<SessionSummary | null> {
    if (!this.prisma) return null

    try {
      // Step 1: Look for persisted LLM summaries from other sessions (stored by summariseSession)
      const otherSessionIds = (
        await this.prisma.session.findMany({
          where: { userId, id: { not: currentSessionId }, ...(clientId ? { clientId } : {}) },
          orderBy: { updatedAt: 'desc' },
          take: 5,
          select: { id: true, title: true },
        })
      )

      const sessionIds = otherSessionIds.map((s) => s.id)
      const titleMap = Object.fromEntries(otherSessionIds.map((s) => [s.id, s.title]))

      if (sessionIds.length === 0) return null

      // Look for persisted summaries tagged with these session IDs
      const persistedSummaries = await this.prisma.agentMemory.findMany({
        where: {
          userId,
          memoryType: 'SEMANTIC',
          // Match records whose tags contain 'session_summary' and one of the session IDs
          id: { in: sessionIds.map((id) => `summary-${id}`) },
        },
        orderBy: { createdAt: 'desc' },
        take: 3,
      })

      if (persistedSummaries.length > 0) {
        const parts = persistedSummaries.map((m) => {
          const tags = m.tags as string[]
          const sid = tags.find((t) => t !== 'session_summary') ?? ''
          const title = titleMap[sid] ?? 'Past session'
          return `Summary of "${title}":\n${m.content}`
        })

        const combined = parts.join('\n\n')
        return {
          sessionId: currentSessionId,
          summary: combined,
          keyTopics: [],
          clientId,
          messageCount: persistedSummaries.length,
          lastUpdated: new Date().toISOString(),
          tokens: estimateTokens(combined),
        }
      }

      // Fallback: raw message snippets for sessions without LLM summaries.
      // Include specialist outputs (metadata.agent set) since those contain the
      // most durable client knowledge — Sean/Kevin analyses, etc.
      const otherSessions = await this.prisma.session.findMany({
        where: { userId, id: { not: currentSessionId }, ...(clientId ? { clientId } : {}) },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 15,
            select: { role: true, content: true, metadata: true },
          },
        },
      })

      const summaryParts: string[] = []
      let totalMessages = 0

      for (const session of otherSessions) {
        if (session.messages.length === 0) continue
        // Prioritise specialist output messages — they carry the richest context
        const msgs = session.messages.reverse()
        const specialistMsgs = msgs.filter((m) => {
          const meta = m.metadata && typeof m.metadata === 'object' ? m.metadata as Record<string,unknown> : {}
          return !!meta['agent']
        })
        const regularMsgs = msgs.filter((m) => {
          const meta = m.metadata && typeof m.metadata === 'object' ? m.metadata as Record<string,unknown> : {}
          return !meta['agent']
        })
        // Include up to 2 specialist outputs (capped at 600 chars each) + last 5 regular messages
        const combined = [
          ...specialistMsgs.slice(0, 2).map((m) => {
            const meta = m.metadata as Record<string,unknown>
            const agent = meta['agent'] as string
            return `[${agent} specialist output]: ${m.content.slice(0, 600)}`
          }),
          ...regularMsgs.slice(-5).map((m) => `${m.role}: ${m.content.slice(0, 300)}`),
        ]
        const preview = combined.join('\n')
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

  /** Tier 3: Search episodic memories via pgvector cosine similarity on AgentMemory.embedding */
  private async searchEpisodicMemory(
    query: string,
    userId: string,
    clientId: string | null,
    tokenBudget: number
  ): Promise<EpisodicMemory[]> {
    if (!this.prisma) return []

    // Attempt vector search first; fall back to recency if embedding unavailable
    const embedding = await this.embedText(query)
    if (embedding) {
      try {
        const vectorStr = `[${embedding.join(',')}]`
        // All user-controlled values are passed as numbered parameters — not concatenated.
        // $1 = embedding vector (used in both ORDER BY and similarity projection)
        // $2 = userId
        // $3 = clientId (optional, only added when present)
        const sql = `
          SELECT id, user_id, client_id, content, tags, created_at,
                 1 - (embedding <=> $1::vector) AS similarity
          FROM agent_memories
          WHERE user_id = $2
            AND memory_type = 'EPISODIC'
            ${clientId ? 'AND client_id = $3' : 'AND client_id IS NULL'}
            AND embedding IS NOT NULL
          ORDER BY embedding <=> $1::vector
          LIMIT 10`

        const rows = await this.prisma.$queryRawUnsafe<Array<{
          id: string
          user_id: string
          client_id: string | null
          content: string
          tags: unknown
          created_at: Date
          similarity: number
        }>>(
          sql,
          vectorStr,
          userId,
          ...(clientId ? [clientId] : [])
        ) as Array<{
          id: string
          user_id: string
          client_id: string | null
          content: string
          tags: unknown
          created_at: Date
          similarity: number
        }>

        const SIMILARITY_FLOOR = 0.3
        let tokensUsed = 0
        const output: EpisodicMemory[] = []

        for (const row of rows) {
          if (row.similarity < SIMILARITY_FLOOR) continue
          const tokens = estimateTokens(row.content)
          if (tokensUsed + tokens > tokenBudget) break
          output.push({
            id: row.id,
            userId: row.user_id,
            clientId: row.client_id,
            content: row.content,
            tags: row.tags as string[],
            createdAt: row.created_at.toISOString(),
            similarity: row.similarity,
          })
          tokensUsed += tokens
        }

        if (output.length > 0) return output
        // Fall through to recency-based fallback if no vector matches
      } catch (err) {
        console.warn('[InfiniteMemory] pgvector episodic search failed, using recency fallback:', err instanceof Error ? err.message : 'Unknown')
      }
    }

    // Recency fallback: return most recent memories (used when no embeddings exist yet)
    try {
      const memories = await this.prisma.agentMemory.findMany({
        where: { userId, memoryType: 'EPISODIC', clientId: clientId ?? null },
        orderBy: { createdAt: 'desc' },
        take: 5,
      })

      let tokensUsed = 0
      const output: EpisodicMemory[] = []
      for (const m of memories) {
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

  /**
   * Embed text via Voyage AI for vector similarity search.
   * Returns null if VOYAGE_API_KEY is not set or the call fails.
   */
  private async embedText(text: string): Promise<number[] | null> {
    const voyageKey = process.env['VOYAGE_API_KEY']
    if (!voyageKey) return null

    try {
      const response = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${voyageKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: [text],
          model: 'voyage-3-lite',
          input_type: 'query',
        }),
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) return null

      const data = await response.json() as { data: Array<{ embedding: number[] }> }
      return data.data[0]?.embedding ?? null
    } catch {
      return null
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

  /** Tier 5: Fetch summaries of recent session exports for archival context */
  private async getArchivalNote(userId: string): Promise<string | null> {
    if (!this.prisma) return null

    try {
      // Fetch the 5 most recent exports with session title and destination
      const exports = await this.prisma.exportRecord.findMany({
        where: { session: { userId } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          session: {
            select: { title: true, updatedAt: true },
          },
        },
      })

      if (exports.length === 0) return null

      const lines = exports.map((e) => {
        const title = e.session.title ?? 'Untitled session'
        const date = e.createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        const dest = e.destination.toLowerCase()
        const link = e.externalUrl ? ` — ${e.externalUrl}` : ''
        return `• "${title}" exported to ${dest} on ${date}${link}`
      })

      const totalCount = await this.prisma.exportRecord.count({ where: { session: { userId } } })
      const headerLine = `${totalCount} archived export(s). Most recent:`

      return [headerLine, ...lines].join('\n')
    } catch {
      return null
    }
  }

  /** Tier 6: Fetch PROCEDURAL memories — user corrections and positive examples */
  private async getProcedualMemories(userId: string, limit = 8): Promise<string> {
    if (!this.prisma) return ''

    const memories = await this.prisma.agentMemory.findMany({
      where: {
        userId,
        memoryType: 'PROCEDURAL',
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { content: true },
    })

    if (memories.length === 0) return ''

    return [
      '## Past Corrections & Style Preferences',
      '(Apply these rules to all matching output types)',
      '',
      ...memories.map((m) => m.content),
    ].join('\n\n')
  }

  // ──── Formatting helpers ────────────────────────────────────────────────────────

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