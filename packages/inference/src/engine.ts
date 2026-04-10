// InferenceEngine — single entry point for ALL model calls
// NEVER call Anthropic SDK or Ollama directly from agent code

import type {
  InferenceContentBlock,
  InferenceMessage,
  InferenceResponse,
  InferenceTask,
  ToolDefinition,
  CostEntry,
  ClaudeModel,
} from './types.js'
import { LocalClient } from './local-client.js'
import { ClaudeClient } from './claude-client.js'
import { CostTracker } from './cost-tracker.js'
import { getRoute, getFallback } from './router.js'
import { getPromptText } from './prompt-library.js'

const AVAILABILITY_CHECK_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes

/**
 * InferenceEngine routes all model calls to the correct backend.
 *
 * Qwen3 (local via Ollama): agent reasoning, classification, extraction
 * Claude Haiku: entity verification, session summarisation
 * Claude Sonnet: user-facing output, emails, reports
 *
 * Local tasks automatically fall back to Claude Haiku when Ollama is down.
 * All calls are logged to CostTracker.
 */
export class InferenceEngine {
  private localClient: LocalClient
  private claudeClient: ClaudeClient | null = null
  private costTracker: CostTracker
  private availabilityCheckTimer: ReturnType<typeof setInterval> | null = null

  constructor(options?: {
    costTracker?: CostTracker | undefined
  }) {
    this.costTracker = options?.costTracker ?? new CostTracker()

    this.localClient = new LocalClient()

    // Initialize Claude client lazily (only when needed)
    // This avoids throwing if ANTHROPIC_API_KEY is not set during tests

    // Start periodic availability check for Ollama
    this.startAvailabilityCheck()
  }

  /**
   * Route a request to the appropriate model based on task type.
   *
   * Looks up the system prompt from the prompt library,
   * selects the model via the routing table,
   * and falls back to Claude Haiku if local inference fails.
   */
  async route(
    task: InferenceTask,
    options: {
      systemPromptKey: string
      messages: InferenceMessage[]
      tools?: ToolDefinition[]
      maxTokens?: number
      sessionId?: string
      userId?: string
    }
  ): Promise<InferenceResponse> {
    const route = getRoute(task)
    const systemPrompt = getPromptText(options.systemPromptKey)
    const maxTokens = options.maxTokens ?? route.maxTokens

    // All tasks route through Anthropic (with optional Opus advisor for complex tasks)
    const claudeModel = route.claudeModel
    return this.executeClaude(task, claudeModel, systemPrompt, {
      ...options,
      ...(route.advisor ? { advisor: route.advisor, advisorMaxUses: route.advisorMaxUses } : {}),
    }, maxTokens)
  }

  /**
   * Classify a message to determine which agent should handle it.
   * Uses Qwen3 for fast local classification.
   */
  async classify(
    message: string,
    options?: { clientId?: string }
  ): Promise<{ agent: string; confidence: number; reasoning: string }> {
    const response = await this.route('classify', {
      systemPromptKey: 'MICRO_CLASSIFY',
      messages: [{
        role: 'user',
        content: `Classify this message into one agent type. Reply with JSON: {"agent": "intake|product|process|competitive|stakeholder", "confidence": 0.0-1.0, "reasoning": "..."}

${options?.clientId ? `Client ID: ${options.clientId}` : 'No client context'}
Message: ${message}`,
      }],
      maxTokens: 100,
    })

    const text = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('')

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch?.[0]) {
        return JSON.parse(jsonMatch[0]) as { agent: string; confidence: number; reasoning: string }
      }
    } catch {
      // Parse failed
    }

    return { agent: 'intake', confidence: 0.3, reasoning: 'Classification parse failed, defaulting to intake' }
  }

  /**
   * Generate a session summary for memory compression.
   * Uses Claude Haiku for quality summarisation.
   */
  async summariseSession(
    messages: InferenceMessage[],
    existingSummary?: string
  ): Promise<string> {
    const userContent = existingSummary
      ? `Previous summary:\n${existingSummary}\n\nNew messages to incorporate:\n${this.messagesToText(messages)}`
      : `Conversation to summarise:\n${this.messagesToText(messages)}`

    const response = await this.route('session_summary', {
      systemPromptKey: 'SESSION_SUMMARISE',
      messages: [{ role: 'user', content: userContent }],
      maxTokens: 500,
    })

    return response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('')
  }

  /** Get the cost tracker instance */
  getCostTracker(): CostTracker {
    return this.costTracker
  }

  /** Check if local inference (Ollama) is available */
  async isLocalAvailable(): Promise<boolean> {
    return this.localClient.isAvailable()
  }

  /** Shut down: stop availability checker */
  shutdown(): void {
    if (this.availabilityCheckTimer) {
      clearInterval(this.availabilityCheckTimer)
      this.availabilityCheckTimer = null
    }
  }

  // ─── Private execution methods ─────────────────────────────────

  /**
   * Execute via local Ollama client.
   * Falls back to Claude Haiku if Ollama fails and task has fallback.
   */
  private async executeLocal(
    task: InferenceTask,
    systemPrompt: string,
    options: {
      messages: InferenceMessage[]
      tools?: ToolDefinition[]
      sessionId?: string
      userId?: string
    },
    maxTokens: number,
    jsonMode: boolean
  ): Promise<InferenceResponse> {
    // Check availability before trying
    const available = await this.localClient.isAvailable()

    if (available) {
      try {
        const response = await this.localClient.complete(systemPrompt, options.messages, {
          tools: options.tools,
          maxTokens,
          jsonMode,
        })

        // Log cost (local = free, but track for metrics)
        await this.costTracker.record({
          sessionId: options.sessionId ?? null,
          userId: options.userId ?? 'system',
          task,
          model: this.localClient.getModel(),
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          cacheHit: false,
          costUsd: 0,  // Local inference is free
          latencyMs: response.latencyMs,
          timestamp: new Date().toISOString(),
        })

        return response
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        console.warn(`[InferenceEngine] Local inference failed: ${errorMsg}`)
      }
    }

    // Fall back to Claude if available
    const fallback = getFallback(task)
    if (fallback) {
      console.log(`[InferenceEngine] Falling back to Claude ${fallback.model} for task: ${task}`)
      return this.executeClaude(task, fallback.model, systemPrompt, options, maxTokens)
    }

    throw new Error(`Local inference unavailable and no fallback for task: ${task}`)
  }

  /**
   * Execute via Claude (Haiku, Sonnet, or Opus).
   * Logs cost automatically.
   */
  private async executeClaude(
    task: InferenceTask,
    model: ClaudeModel,
    systemPrompt: string,
    options: {
      messages: InferenceMessage[]
      tools?: ToolDefinition[] | undefined
      sessionId?: string | undefined
      userId?: string | undefined
      advisor?: ClaudeModel | undefined
      advisorMaxUses?: number | undefined
    },
    maxTokens: number
  ): Promise<InferenceResponse> {
    const client = this.getClaudeClient()

    return client.complete(model, systemPrompt, options.messages, {
      ...(options.tools ? { tools: options.tools } : {}),
      maxTokens,
      task,
      ...(options.sessionId ? { sessionId: options.sessionId } : {}),
      ...(options.userId ? { userId: options.userId } : {}),
      ...(options.advisor ? { advisor: options.advisor, advisorMaxUses: options.advisorMaxUses } : {}),
    })
  }

  /** Get or create the Claude client (lazy init) */
  private getClaudeClient(): ClaudeClient {
    if (!this.claudeClient) {
      this.claudeClient = new ClaudeClient((entry: CostEntry) => {
        void this.costTracker.record(entry)
      })
    }
    return this.claudeClient
  }

  /** Start periodic Ollama availability check */
  private startAvailabilityCheck(): void {
    this.availabilityCheckTimer = setInterval(() => {
      void this.localClient.isAvailable().then((available) => {
        if (available) {
          console.log('[InferenceEngine] Ollama available — local inference active')
        }
      })
    }, AVAILABILITY_CHECK_INTERVAL_MS)

    // Don't block process exit
    if (this.availabilityCheckTimer.unref) {
      this.availabilityCheckTimer.unref()
    }
  }

  /** Convert messages to plain text for summarisation */
  private messagesToText(messages: InferenceMessage[]): string {
    return messages
      .map((m) => {
        const content = typeof m.content === 'string'
          ? m.content
          : m.content
              .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
              .map((b) => b.text)
              .join('\n')
        return `${m.role.toUpperCase()}: ${content}`
      })
      .join('\n\n')
  }
}
