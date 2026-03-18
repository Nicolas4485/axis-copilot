// Ollama wrapper for Qwen3 8B (local inference)
// Runs on port 11434. Used for: agent reasoning, classification, entity extraction

import type { InferenceContentBlock, InferenceMessage, InferenceResponse, ToolDefinition } from './types.js'

const OLLAMA_BASE_URL = process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434'
const DEFAULT_MODEL = process.env['OLLAMA_MODEL'] ?? 'qwen3:8b'
const DEFAULT_MAX_TOKENS = 2048
const REQUEST_TIMEOUT_MS = 60_000

/** Ollama /api/chat request body */
interface OllamaChatRequest {
  model: string
  messages: Array<{ role: string; content: string }>
  stream: false
  format?: 'json'
  options?: {
    num_predict?: number
    temperature?: number
  }
  tools?: Array<{
    type: 'function'
    function: {
      name: string
      description: string
      parameters: Record<string, unknown>
    }
  }>
}

/** Ollama /api/chat response body */
interface OllamaChatResponse {
  message: {
    role: string
    content: string
    tool_calls?: Array<{
      function: {
        name: string
        arguments: Record<string, unknown>
      }
    }>
  }
  done: boolean
  total_duration?: number
  prompt_eval_count?: number
  eval_count?: number
}

/**
 * LocalClient wraps Ollama for Qwen3 8B inference.
 *
 * Used for:
 * - Agent reasoning and tool use (agent_response)
 * - Message classification (classify)
 * - Entity extraction (entity_extract)
 * - Document type detection (doc_type_detect)
 *
 * Falls back gracefully when Ollama is unavailable.
 */
export class LocalClient {
  private baseUrl: string
  private model: string
  private available = true
  private lastCheck = 0
  private checkIntervalMs = 5 * 60 * 1000  // 5 minutes

  constructor(options?: { baseUrl?: string; model?: string }) {
    this.baseUrl = options?.baseUrl ?? OLLAMA_BASE_URL
    this.model = options?.model ?? DEFAULT_MODEL
  }

  /**
   * Run a completion against Qwen3 8B.
   */
  async complete(
    systemPrompt: string,
    messages: InferenceMessage[],
    options?: {
      tools?: ToolDefinition[] | undefined
      maxTokens?: number | undefined
      jsonMode?: boolean | undefined
    }
  ): Promise<InferenceResponse> {
    const startTime = Date.now()

    const ollamaMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ]

    for (const msg of messages) {
      const content = typeof msg.content === 'string'
        ? msg.content
        : msg.content.map((b) => {
            if (b.type === 'text') return b.text
            if (b.type === 'tool_use') return `[Tool call: ${b.name}(${JSON.stringify(b.input)})]`
            return ''
          }).join('\n')
      ollamaMessages.push({ role: msg.role, content })
    }

    const body: OllamaChatRequest = {
      model: this.model,
      messages: ollamaMessages,
      stream: false,
      options: {
        num_predict: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      },
    }

    if (options?.jsonMode) {
      body.format = 'json'
    }

    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      }))
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Ollama returned ${response.status}: ${errorText}`)
      }

      const data = await response.json() as OllamaChatResponse
      const latencyMs = Date.now() - startTime

      // Parse content blocks
      const content: InferenceContentBlock[] = []
      let stopReason: InferenceResponse['stopReason'] = 'end_turn'

      // Handle tool calls if present
      if (data.message.tool_calls && data.message.tool_calls.length > 0) {
        // Add any text content before tool calls
        if (data.message.content.trim()) {
          content.push({ type: 'text', text: data.message.content })
        }

        for (const toolCall of data.message.tool_calls) {
          content.push({
            type: 'tool_use',
            id: `tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: toolCall.function.name,
            input: toolCall.function.arguments,
          })
        }
        stopReason = 'tool_use'
      } else {
        content.push({ type: 'text', text: data.message.content })
      }

      this.available = true

      return {
        content,
        stopReason,
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
        cacheHit: false,
        model: this.model,
        latencyMs,
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'

      if (errorMsg.includes('abort') || errorMsg.includes('ECONNREFUSED')) {
        this.available = false
        this.lastCheck = Date.now()
      }

      throw new Error(`Ollama completion failed: ${errorMsg}`)
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * Check if Ollama is available. Caches result for 5 minutes.
   */
  async isAvailable(): Promise<boolean> {
    const now = Date.now()
    if (now - this.lastCheck < this.checkIntervalMs) {
      return this.available
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)

      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      })
      clearTimeout(timeout)

      this.available = response.ok
      this.lastCheck = now

      if (this.available) {
        // Verify the model is loaded
        const data = await response.json() as { models?: Array<{ name: string }> }
        const modelLoaded = data.models?.some((m) => m.name.startsWith(this.model.split(':')[0] ?? ''))
        this.available = modelLoaded ?? false
      }

      return this.available
    } catch {
      this.available = false
      this.lastCheck = now
      return false
    }
  }

  /** Force an availability recheck on next call */
  invalidateCache(): void {
    this.lastCheck = 0
  }

  /** Get the model name */
  getModel(): string {
    return this.model
  }
}
