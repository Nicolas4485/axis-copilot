// Claude client — Anthropic SDK with prompt caching
// System prompts cached via cache_control: ephemeral
// Dynamic context goes in user turn, NOT system prompt
// Tier limits: MICRO<=150, TASK<=400, AGENT<=800 tokens

import Anthropic from '@anthropic-ai/sdk'
import type {
  InferenceContentBlock,
  InferenceMessage,
  InferenceResponse,
  ToolDefinition,
  ClaudeModel,
  CostEntry,
  InferenceTask,
} from './types.js'

/** Claude model IDs */
const MODEL_IDS: Record<ClaudeModel, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6-20250514',
  opus: 'claude-opus-4-6-20250514',
}

/** Cost per million tokens (input/output) in USD */
const PRICING: Record<ClaudeModel, { input: number; output: number; cacheRead: number }> = {
  haiku: { input: 0.80, output: 4.00, cacheRead: 0.08 },
  sonnet: { input: 3.00, output: 15.00, cacheRead: 0.30 },
  opus: { input: 15.00, output: 75.00, cacheRead: 1.50 },
}

const DEFAULT_MAX_TOKENS = 2048

/**
 * ClaudeClient wraps the Anthropic SDK with:
 * - Prompt caching (cache_control: ephemeral) for system prompts
 * - Automatic cost calculation and logging
 * - Tool use support
 * - Tier-based token limits
 *
 * Haiku: entity verification, session summarisation
 * Sonnet: user-facing output, emails, reports
 */
export class ClaudeClient {
  private client: Anthropic | null
  private onCostEntry?: ((entry: CostEntry) => void) | undefined

  constructor(onCostEntry?: (entry: CostEntry) => void) {
    const apiKey = process.env['ANTHROPIC_API_KEY']
    if (!apiKey) {
      // Defer the error to when a call is actually made — allows local-only mode
      this.client = null
      this.onCostEntry = onCostEntry
      return
    }

    this.client = new Anthropic({ apiKey })
    this.onCostEntry = onCostEntry
  }

  /**
   * Run a completion against Claude (Haiku or Sonnet).
   *
   * System prompt is cached via cache_control: ephemeral.
   * Dynamic context must be in the user turn, not system.
   */
  async complete(
    model: ClaudeModel,
    systemPrompt: string,
    messages: InferenceMessage[],
    options?: {
      tools?: ToolDefinition[]
      maxTokens?: number
      task?: InferenceTask
      sessionId?: string
      userId?: string
    }
  ): Promise<InferenceResponse> {
    if (!this.client) {
      throw new Error('ANTHROPIC_API_KEY not configured — Claude calls unavailable. Set the key in .env or use local inference only.')
    }

    const startTime = Date.now()
    const modelId = MODEL_IDS[model]
    const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS

    // Build Anthropic messages format
    const anthropicMessages: Anthropic.MessageParam[] = messages.map((msg) => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content }
      }

      // Convert content blocks
      const blocks: Array<Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam | Anthropic.ToolResultBlockParam> = []
      for (const block of msg.content) {
        if (block.type === 'text') {
          blocks.push({ type: 'text', text: block.text })
        } else if (block.type === 'tool_use') {
          blocks.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input,
          })
        }
      }
      return { role: msg.role, content: blocks }
    })

    // Build system prompt with cache_control: ephemeral
    const systemBlocks: Array<Anthropic.TextBlockParam> = [{
      type: 'text',
      text: systemPrompt,
      // @ts-expect-error -- cache_control is valid for prompt caching but not in base types
      cache_control: { type: 'ephemeral' },
    }]

    // Build tools if provided
    const anthropicTools: Anthropic.Tool[] | undefined = options?.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema,
    }))

    try {
      const response = await this.client.messages.create({
        model: modelId,
        max_tokens: maxTokens,
        system: systemBlocks,
        messages: anthropicMessages,
        ...(anthropicTools && anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
      })

      const latencyMs = Date.now() - startTime

      // Parse response content blocks
      const content: InferenceContentBlock[] = []
      for (const block of response.content) {
        if (block.type === 'text') {
          content.push({ type: 'text', text: block.text })
        } else if (block.type === 'tool_use') {
          content.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          })
        }
      }

      // Map stop reason
      const stopReason: InferenceResponse['stopReason'] =
        response.stop_reason === 'tool_use' ? 'tool_use' :
        response.stop_reason === 'max_tokens' ? 'max_tokens' :
        'end_turn'

      // Calculate cost
      const inputTokens = response.usage.input_tokens
      const outputTokens = response.usage.output_tokens
      const cacheReadTokens = (response.usage as unknown as Record<string, unknown>)['cache_read_input_tokens'] as number | undefined ?? 0
      const cacheHit = cacheReadTokens > 0

      const pricing = PRICING[model]
      const inputCost = ((inputTokens - cacheReadTokens) * pricing.input) / 1_000_000
      const cacheCost = (cacheReadTokens * pricing.cacheRead) / 1_000_000
      const outputCost = (outputTokens * pricing.output) / 1_000_000
      const costUsd = inputCost + cacheCost + outputCost

      // Log cost entry
      if (this.onCostEntry) {
        this.onCostEntry({
          sessionId: options?.sessionId ?? null,
          userId: options?.userId ?? 'system',
          task: options?.task ?? 'user_response',
          model: modelId,
          inputTokens,
          outputTokens,
          cacheHit,
          costUsd,
          latencyMs,
          timestamp: new Date().toISOString(),
        })
      }

      return {
        content,
        stopReason,
        inputTokens,
        outputTokens,
        cacheHit,
        model: modelId,
        latencyMs,
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      throw new Error(`Claude ${model} completion failed: ${errorMsg}`)
    }
  }
}
