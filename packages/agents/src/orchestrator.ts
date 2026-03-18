// Orchestrator — routes messages to the correct specialist agent
// and manages conversation state

import { InferenceEngine } from '@axis/inference'
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
  private agents: Record<SessionMode, BaseAgent>

  constructor(engine?: InferenceEngine) {
    this.engine = engine ?? new InferenceEngine()
    this.agents = {
      intake: new IntakeAgent(this.engine),
      product: new ProductAgent(this.engine),
      process: new ProcessAgent(this.engine),
      competitive: new CompetitiveAgent(this.engine),
      stakeholder: new StakeholderAgent(this.engine),
    }
  }

  /**
   * Handle an incoming message:
   * 1. Build agent context (memory, RAG, client record)
   * 2. Route to the correct agent
   * 3. Return the agent's response
   */
  async handleMessage(
    sessionId: string,
    userId: string,
    message: string,
    mode?: SessionMode,
    imageBase64?: string
  ): Promise<AgentResponse> {
    // TODO: Call InfiniteMemory.buildAgentContext(...)
    // TODO: Call RAGEngine.query(message, userId, clientId)
    // For now, build a minimal context
    const context: AgentContext = {
      sessionId,
      clientId: null, // TODO: look up from session
      userId,
      assembledContext: '',
      ragResult: null,
      stakeholders: [],
      clientRecord: null,
    }

    // Route to the correct agent
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
}
