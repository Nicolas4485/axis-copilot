// Infinite Memory — 5-tier memory system for agent context
//
// Tier 1: Working Memory (Redis)     — current session state, last ~10 messages
// Tier 2: Summary Memory (Redis)     — compressed session summaries
// Tier 3: Episodic Memory (pgvector) — searchable past interactions
// Tier 4: Semantic Memory (Neo4j)    — knowledge graph relationships
// Tier 5: Archival Memory (Drive)    — full session exports
//
// buildAgentContext() assembles <= 6000 tokens from all tiers.
// summariseSession() compresses and archives when sessions grow large.

import { InferenceEngine } from '@axis/inference'
import { Neo4jClient, GraphOperations } from '@axis/knowledge-graph'

/** Memory tier identifiers */
export type MemoryTier = 'WORKING' | 'SUMMARY' | 'EPISODIC' | 'SEMANTIC' | 'ARCHIVAL'

/** A working memory entry (stored in Redis) */
export interface WorkingMemoryEntry {
  role: 'USER' | 'ASSISTANT' | 'SYSTEM'
  content: string
  timestamp: string
  tokens: number
}

/** A session summary (stored in Redis) */
export interface SessionSummary {
  sessionId: string
  summary: string
  keyTopics: string[]
  clientId: string | null
  messageCount: number
  lastUpdated: string
  tokens: number
}

/** An episodic memory record (stored in pgvector) */
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
  /** Full context string ready for the agent's user turn */
  text: string
  /** Token count of the assembled context */
  tokens: number
  /** Which tiers contributed to this context */
  tiersUsed: MemoryTier[]
  /** Session summary if available */
  sessionSummary: string | null
  /** Recent messages from working memory */
  recentMessages: WorkingMemoryEntry[]
  /** Relevant episodic memories */
  episodicMemories: EpisodicMemory[]
}

/** Token budgets for each tier */
const TIER_BUDGETS = {
  WORKING: 2000,    // Recent messages
  SUMMARY: 1000,    // Session summary
  EPISODIC: 1500,   // Past interactions
  SEMANTIC: 1000,   // Graph context
  ARCHIVAL: 500,    // Referenced archives
} as const

const TOTAL_BUDGET = 6000
const WORKING_MEMORY_MAX_MESSAGES = 10
const SUMMARY_TRIGGER_MESSAGE_COUNT = 5  // Summarise every 5 messages

/** Approximate tokens from character count */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * InfiniteMemory manages a 5-tier memory system that gives agents
 * the illusion of unlimited context.
 *
 * As conversations grow, older content automatically compresses
 * and migrates to deeper tiers, keeping the active context window
 * within token limits while preserving important information.
 */
export class InfiniteMemory {
  private engine: InferenceEngine
  private neo4jClient: Neo4jClient
  private graphOps: GraphOperations
  // TODO: Redis client for working + summary memory
  // private redis: Redis

  constructor(options?: {
    engine?: InferenceEngine | undefined
    neo4jClient?: Neo4jClient | undefined
  }) {
    this.engine = options?.engine ?? new InferenceEngine()
    this.neo4jClient = options?.neo4jClient ?? new Neo4jClient()
    this.graphOps = new GraphOperations(this.neo4jClient)
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

    // Tier 1: Working Memory — recent messages from Redis
    const recentMessages = await this.getWorkingMemory(sessionId)
    if (recentMessages.length > 0) {
      tiersUsed.push('WORKING')
      const workingText = this.formatWorkingMemory(recentMessages, TIER_BUDGETS.WORKING)
      const workingTokens = estimateTokens(workingText)
      parts.push(`<RECENT_CONVERSATION>\n${workingText}\n</RECENT_CONVERSATION>`)
      tokensRemaining -= workingTokens
    }

    // Tier 2: Summary Memory — compressed session summary from Redis
    const summary = await this.getSessionSummary(sessionId)
    let sessionSummary: string | null = null
    if (summary) {
      tiersUsed.push('SUMMARY')
      sessionSummary = summary.summary
      const summaryText = this.formatSummary(summary, Math.min(tokensRemaining, TIER_BUDGETS.SUMMARY))
      const summaryTokens = estimateTokens(summaryText)
      parts.push(`<SESSION_SUMMARY>\n${summaryText}\n</SESSION_SUMMARY>`)
      tokensRemaining -= summaryTokens
    }

    // Tier 3: Episodic Memory — relevant past interactions via pgvector
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
      const episodicTokens = estimateTokens(episodicText)
      parts.push(`<PAST_INTERACTIONS>\n${episodicText}\n</PAST_INTERACTIONS>`)
      tokensRemaining -= episodicTokens
    }

    // Tier 4: Semantic Memory — knowledge graph context from Neo4j
    if (this.neo4jClient.isAvailable() && clientId) {
      const graphContext = await this.getSemanticMemory(clientId, tokensRemaining)
      if (graphContext) {
        tiersUsed.push('SEMANTIC')
        parts.push(`<KNOWLEDGE_GRAPH>\n${graphContext}\n</KNOWLEDGE_GRAPH>`)
        tokensRemaining -= estimateTokens(graphContext)
      }
    }

    // Tier 5: Archival Memory — referenced only, not loaded inline
    // Archives are too large to include; instead, we note their existence
    // so the agent can request specific content via tools
    const archiveNote = await this.getArchivalNote(sessionId, userId)
    if (archiveNote) {
      tiersUsed.push('ARCHIVAL')
      parts.push(`<ARCHIVES>\n${archiveNote}\n</ARCHIVES>`)
    }

    const text = parts.join('\n\n')

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
   * Summarise the current session and compress older messages.
   * Called when messageCount % 5 === 0.
   *
   * Flow:
   * 1. Get all working memory messages
   * 2. Summarise via Claude Haiku
   * 3. Store summary in Redis (Tier 2)
   * 4. Trim working memory to last 10 messages
   * 5. Store older messages as episodic memories (Tier 3)
   */
  async summariseSession(sessionId: string, userId: string): Promise<SessionSummary> {
    // Get current working memory
    const messages = await this.getWorkingMemory(sessionId)
    const existingSummary = await this.getSessionSummary(sessionId)

    // Build text for summarisation
    const conversationText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n')

    const previousSummary = existingSummary?.summary ?? ''

    // Summarise via Claude Haiku
    let summaryText: string
    try {
      summaryText = await this.engine.summariseSession(
        messages.map((m) => ({
          role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
          content: m.content,
        })),
        previousSummary || undefined
      )
    } catch {
      // Summarisation failed — use simple truncation
      summaryText = previousSummary
        ? `${previousSummary}\n\nContinued: ${conversationText.slice(0, 500)}`
        : conversationText.slice(0, 1000)
    }

    // Extract key topics
    const keyTopics = this.extractKeyTopics(summaryText)

    const summary: SessionSummary = {
      sessionId,
      summary: summaryText,
      keyTopics,
      clientId: null, // TODO: look up from session
      messageCount: messages.length + (existingSummary?.messageCount ?? 0),
      lastUpdated: new Date().toISOString(),
      tokens: estimateTokens(summaryText),
    }

    // TODO: Store summary in Redis
    // await this.redis.set(`axis:summary:${sessionId}`, JSON.stringify(summary))

    // TODO: Trim working memory — keep only last WORKING_MEMORY_MAX_MESSAGES
    // const toArchive = messages.slice(0, -WORKING_MEMORY_MAX_MESSAGES)
    // for (const msg of toArchive) {
    //   await this.storeEpisodicMemory(sessionId, userId, msg)
    // }

    void userId
    void WORKING_MEMORY_MAX_MESSAGES
    void SUMMARY_TRIGGER_MESSAGE_COUNT

    return summary
  }

  /**
   * Add a message to working memory (Redis).
   */
  async addToWorkingMemory(
    sessionId: string,
    role: 'USER' | 'ASSISTANT' | 'SYSTEM',
    content: string
  ): Promise<void> {
    const entry: WorkingMemoryEntry = {
      role,
      content,
      timestamp: new Date().toISOString(),
      tokens: estimateTokens(content),
    }

    // TODO: Push to Redis list
    // await this.redis.rpush(`axis:working:${sessionId}`, JSON.stringify(entry))
    // await this.redis.ltrim(`axis:working:${sessionId}`, -WORKING_MEMORY_MAX_MESSAGES * 2, -1)
    void entry
    void sessionId
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
    // TODO: Create AgentMemory record via Prisma with embedding
    // const embedding = await voyageClient.embed({ input: [content] })
    // await prisma.agentMemory.create({
    //   data: {
    //     userId, clientId, memoryType: 'EPISODIC',
    //     content, tags,
    //   },
    // })
    // Raw SQL for embedding: UPDATE "AgentMemory" SET embedding = $1 WHERE id = $2
    void userId
    void clientId
    void content
    void tags
  }

  // ─── Private tier access methods ───────────────────────────────

  /** Tier 1: Get recent messages from Redis */
  private async getWorkingMemory(_sessionId: string): Promise<WorkingMemoryEntry[]> {
    // TODO: Read from Redis list
    // const raw = await this.redis.lrange(`axis:working:${sessionId}`, -WORKING_MEMORY_MAX_MESSAGES, -1)
    // return raw.map(r => JSON.parse(r))
    return []
  }

  /** Tier 2: Get session summary from Redis */
  private async getSessionSummary(_sessionId: string): Promise<SessionSummary | null> {
    // TODO: Read from Redis
    // const raw = await this.redis.get(`axis:summary:${sessionId}`)
    // return raw ? JSON.parse(raw) : null
    return null
  }

  /** Tier 3: Search episodic memories via pgvector */
  private async searchEpisodicMemory(
    _query: string,
    _userId: string,
    _clientId: string | null,
    _tokenBudget: number
  ): Promise<EpisodicMemory[]> {
    // TODO: Generate embedding for query
    // TODO: Vector search in AgentMemory table
    // const embedding = await voyageClient.embed({ input: [query] })
    // const results = await prisma.$queryRaw`
    //   SELECT * FROM "AgentMemory"
    //   WHERE "userId" = ${userId}
    //   AND 1 - (embedding <=> ${embedding}::vector) >= 0.7
    //   ORDER BY 1 - (embedding <=> ${embedding}::vector) DESC
    //   LIMIT 5
    // `
    return []
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

      // Truncate to token budget
      if (estimateTokens(readableText) > tokenBudget) {
        return readableText.slice(0, tokenBudget * 4)
      }

      return readableText
    } catch {
      return null
    }
  }

  /** Tier 5: Get archival note (pointer, not full content) */
  private async getArchivalNote(
    _sessionId: string,
    _userId: string
  ): Promise<string | null> {
    // TODO: Check ExportRecord for archived sessions
    // const exports = await prisma.exportRecord.findMany({
    //   where: { session: { userId } },
    //   orderBy: { createdAt: 'desc' },
    //   take: 5,
    // })
    // if (exports.length === 0) return null
    // return `${exports.length} archived sessions available. Use search_knowledge_base to query them.`
    return null
  }

  // ─── Formatting helpers ────────────────────────────────────────

  private formatWorkingMemory(messages: WorkingMemoryEntry[], tokenBudget: number): string {
    // Take messages from the end until we hit budget
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
    const parts = [
      `Session summary (${summary.messageCount} messages):`,
      summary.summary,
    ]

    if (summary.keyTopics.length > 0) {
      parts.push(`Key topics: ${summary.keyTopics.join(', ')}`)
    }

    const text = parts.join('\n')
    if (estimateTokens(text) > tokenBudget) {
      return text.slice(0, tokenBudget * 4)
    }
    return text
  }

  private formatEpisodicMemories(memories: EpisodicMemory[], tokenBudget: number): string {
    const lines: string[] = []
    let tokensUsed = 0

    for (const mem of memories) {
      const line = `[${mem.createdAt}] ${mem.content} (tags: ${mem.tags.join(', ')})`
      const lineTokens = estimateTokens(line)
      if (tokensUsed + lineTokens > tokenBudget) break
      lines.push(line)
      tokensUsed += lineTokens
    }

    return lines.join('\n')
  }

  private extractKeyTopics(text: string): string[] {
    // Simple extraction: capitalised words that appear multiple times
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
