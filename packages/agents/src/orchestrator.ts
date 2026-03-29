// Orchestrator — routes messages to the correct specialist agent
// and manages conversation state

import { InferenceEngine } from '@axis/inference'
import { RAGEngine } from '@axis/rag'
import { InfiniteMemory } from '@axis/memory'
import { IntakeAgent } from './specialists/intake-agent.js'
import { ProductAgent } from './specialists/product-agent.js'
import { ProcessAgent } from './specialists/process-agent.js'
import { CompetitiveAgent } from './specialists/competitive-agent.js'
import { StakeholderAgent } from './specialists/stakeholder-agent.js'
import { BaseAgent } from './base-agent.js'
import type { AgentContext, AgentResponse, SessionMode } from './types.js'

/** Orchestrator routing and agent management */
export class Orchestrator {
  private engine: InferenceEngine
  private rag: RAGEngine
  private memory: InfiniteMemory
  private agents: Record<SessionMode, BaseAgent>

  constructor(options?: {
    engine?: InferenceEngine | undefined
    rag?: RAGEngine | undefined
    memory?: InfiniteMemory | undefined
    prisma?: import('@prisma/client').PrismaClient | undefined
  }) {
    this.engine = options?.engine ?? new InferenceEngine()
    this.rag = options?.rag ?? new RAGEngine({ engine: this.engine, prisma: options?.prisma! })
    this.memory = options?.memory ?? new InfiniteMemory({ engine: this.engine, prisma: options?.prisma })

    this.agents = {
      intake: new IntakeAgent(this.engine, this.memory),
      product: new ProductAgent(this.engine, this.memory),
      process: new ProcessAgent(this.engine, this.memory),
      competitive: new CompetitiveAgent(this.engine, this.memory),
      stakeholder: new StakeholderAgent(this.engine, this.memory),
    }
  }

  /**
   * Handle an incoming message:
   * 1. Build agent context via InfiniteMemory
   * 2. Run RAG retrieval via RAGEngine
   * 3. Route to the correct agent
   * 4. Return the agent's response
   */
  async handleMessage(
    sessionId: string,
    userId: string,
    message: string,
    mode?: SessionMode,
    imageBase64?: string
  ): Promise<AgentResponse> {
    // Step 1: Store user message in working memory
    await this.memory.addToWorkingMemory(sessionId, 'USER', message)

    // Step 2: Build agent context from all 5 memory tiers
    const assembled = await this.memory.buildAgentContext(
      sessionId,
      userId,
      null,  // TODO: look up clientId from session
      message
    )

    // Step 3: Run RAG retrieval
    const ragResult = await this.rag.query(message, userId, null)

    // Build the full agent context
    const context: AgentContext = {
      sessionId,
      clientId: null, // TODO: look up from session
      userId,
      assembledContext: assembled.text,
      ragResult,
      stakeholders: [],
      clientRecord: null,
    }

    // Step 4: Route to the correct agent
    const resolvedMode = await this.resolveMode(mode, message, context, imageBase64)
    const agent = this.agents[resolvedMode]

    // If image attached, prepend image context to message
    const enrichedMessage = imageBase64
      ? `[Image attached for analysis]\n\n${message}`
      : message

    return agent.run(enrichedMessage, context)
  }

  /**
   * Resolve which agent should handle this message.
   *
   * ROUTING LOGIC:
   * - mode="intake" or no client yet → IntakeAgent
   * - mode="product" or image attached → ProductAgent
   * - mode="process" or process file attached → ProcessAgent
   * - mode="competitive" → CompetitiveAgent
   * - mode="stakeholder" → StakeholderAgent
   * - ambiguous → use Qwen3 via InferenceEngine to classify
   */
  private async resolveMode(
    explicitMode: SessionMode | undefined,
    message: string,
    context: AgentContext,
    imageBase64?: string
  ): Promise<SessionMode> {
    // Explicit mode always wins
    if (explicitMode) return explicitMode

    // No client record yet → intake
    if (!context.clientId) return 'intake'

    // Image attached → product analysis
    if (imageBase64) return 'product'

    // Try to classify from message content using Qwen3
    try {
      const classification = await this.engine.classify(message, {
        clientId: context.clientId ?? undefined,
      })

      const agentToMode: Record<string, SessionMode> = {
        intake: 'intake',
        product: 'product',
        process: 'process',
        competitive: 'competitive',
        stakeholder: 'stakeholder',
      }

      const resolved = agentToMode[classification.agent]
      if (resolved && classification.confidence > 0.6) {
        return resolved
      }
    } catch {
      // Classification not available yet, fall through to default
    }

    // Default to intake if we can't determine
    return 'intake'
  }

  /** Get the agent instance for a specific mode (for testing) */
  getAgent(mode: SessionMode): BaseAgent {
    return this.agents[mode]
  }

  /** Get the RAG engine (for testing) */
  getRAG(): RAGEngine {
    return this.rag
  }

  /** Get the memory system (for testing) */
  getMemory(): InfiniteMemory {
    return this.memory
  }
}
