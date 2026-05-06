// Gemini REST client for text mode (Aria's primary text engine)
// Uses Gemini 2.0 Flash for text generation with function calling support
// Falls back gracefully when GEMINI_API_KEY is not set

import type { InferenceContentBlock, InferenceMessage, InferenceResponse, ToolDefinition } from './types.js'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MODEL = 'gemini-2.0-flash-001'
const REQUEST_TIMEOUT_MS = 30_000

/** Gemini content part */
interface GeminiPart {
  text?: string
  functionCall?: { name: string; args: Record<string, unknown> }
  functionResponse?: { name: string; response: Record<string, unknown> }
}

/** Gemini content block */
interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

/** Gemini function declaration for tool calling */
interface GeminiFunctionDeclaration {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/** Gemini generateContent response */
interface GeminiResponse {
  candidates?: Array<{
    content: { role: string; parts: GeminiPart[] }
    finishReason: string
  }>
  usageMetadata?: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
}

/**
 * GeminiClient wraps the Gemini REST API for text-mode interactions.
 *
 * Used by Aria for:
 * - Text-mode conversations (when voice/video is not active)
 * - Function calling (tool execution and worker delegation)
 *
 * NOT used for Live API — that's handled browser-side via WebSocket.
 */
export class GeminiClient {
  private apiKey: string
  private model: string

  constructor(options?: { apiKey?: string; model?: string }) {
    this.apiKey = options?.apiKey ?? process.env['GEMINI_API_KEY'] ?? ''
    this.model = options?.model ?? DEFAULT_MODEL
  }

  /** Check if the client has an API key configured */
  isConfigured(): boolean {
    return this.apiKey.length > 0
  }

  /**
   * Generate a single (non-streaming) response with optional function calling.
   */
  async generateContent(
    systemInstruction: string,
    messages: InferenceMessage[],
    options?: {
      tools?: ToolDefinition[]
      maxTokens?: number
    }
  ): Promise<InferenceResponse> {
    if (!this.isConfigured()) {
      throw new Error('GEMINI_API_KEY not configured')
    }

    const startTime = Date.now()

    const geminiContents = this.convertMessages(messages)
    const body: Record<string, unknown> = {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: geminiContents,
      generationConfig: {
        maxOutputTokens: options?.maxTokens ?? 4096,
        temperature: 0.7,
      },
    }

    if (options?.tools && options.tools.length > 0) {
      body['tools'] = [{
        function_declarations: options.tools.map((t) => this.convertToolDefinition(t)),
      }]
    }

    const url = `${GEMINI_API_BASE}/models/${this.model}:generateContent?key=${this.apiKey}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Gemini API error ${response.status}: ${errorText}`)
      }

      const data = await response.json() as GeminiResponse
      return this.parseResponse(data, Date.now() - startTime)
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * Generate a streaming response. Yields InferenceContentBlock chunks.
   * Used for SSE text mode.
   */
  async *generateContentStream(
    systemInstruction: string,
    messages: InferenceMessage[],
    options?: {
      tools?: ToolDefinition[]
      maxTokens?: number
    }
  ): AsyncGenerator<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } | { type: 'done'; inputTokens: number; outputTokens: number }> {
    if (!this.isConfigured()) {
      throw new Error('GEMINI_API_KEY not configured')
    }

    const geminiContents = this.convertMessages(messages)
    const body: Record<string, unknown> = {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: geminiContents,
      generationConfig: {
        maxOutputTokens: options?.maxTokens ?? 4096,
        temperature: 0.7,
      },
    }

    if (options?.tools && options.tools.length > 0) {
      body['tools'] = [{
        function_declarations: options.tools.map((t) => this.convertToolDefinition(t)),
      }]
    }

    const url = `${GEMINI_API_BASE}/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Gemini streaming error ${response.status}: ${errorText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body for streaming')

      const decoder = new TextDecoder()
      let buffer = ''
      let totalInputTokens = 0
      let totalOutputTokens = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events from Gemini's stream
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (jsonStr === '[DONE]' || jsonStr === '') continue

          try {
            const chunk = JSON.parse(jsonStr) as GeminiResponse

            if (chunk.usageMetadata) {
              totalInputTokens = chunk.usageMetadata.promptTokenCount
              totalOutputTokens = chunk.usageMetadata.candidatesTokenCount
            }

            const candidate = chunk.candidates?.[0]
            if (!candidate) continue

            for (const part of candidate.content.parts) {
              if (part.text) {
                yield { type: 'text', text: part.text }
              }
              if (part.functionCall) {
                yield {
                  type: 'tool_use',
                  id: `gemini_tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  name: part.functionCall.name,
                  input: part.functionCall.args,
                }
              }
            }
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }

      yield { type: 'done', inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
    } finally {
      clearTimeout(timeout)
    }
  }

  /** Get the model name */
  getModel(): string {
    return this.model
  }

  // ─── Private helpers ──────────────────────────────────────────

  /** Convert internal InferenceMessage[] to Gemini content format */
  private convertMessages(messages: InferenceMessage[]): GeminiContent[] {
    const contents: GeminiContent[] = []

    for (const msg of messages) {
      const role = msg.role === 'user' ? 'user' : 'model'
      const parts: GeminiPart[] = []

      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content })
      } else {
        for (const block of msg.content) {
          if (block.type === 'text') {
            parts.push({ text: block.text })
          } else if (block.type === 'tool_use') {
            parts.push({
              functionCall: { name: block.name, args: block.input },
            })
          } else if (block.type === 'tool_result') {
            // Convert Anthropic-style tool_result to Gemini functionResponse
            let parsedContent: Record<string, unknown>
            try {
              parsedContent = JSON.parse(block.content) as Record<string, unknown>
            } catch {
              parsedContent = { result: block.content }
            }
            parts.push({
              functionResponse: {
                name: block.name ?? block.tool_use_id,
                response: parsedContent,
              },
            })
          }
        }
      }

      // Skip messages with no parts — Gemini rejects empty content blocks
      if (parts.length === 0) continue
      contents.push({ role, parts })
    }

    return contents
  }

  /** Convert internal ToolDefinition to Gemini function declaration */
  private convertToolDefinition(tool: ToolDefinition): GeminiFunctionDeclaration {
    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    }
  }

  /** Parse Gemini response into InferenceResponse */
  private parseResponse(data: GeminiResponse, latencyMs: number): InferenceResponse {
    const candidate = data.candidates?.[0]
    if (!candidate) {
      return {
        content: [{ type: 'text', text: '' }],
        stopReason: 'end_turn',
        inputTokens: 0,
        outputTokens: 0,
        cacheHit: false,
        model: this.model,
        latencyMs,
      }
    }

    const content: InferenceContentBlock[] = []
    let stopReason: InferenceResponse['stopReason'] = 'end_turn'

    for (const part of candidate.content.parts) {
      if (part.text) {
        content.push({ type: 'text', text: part.text })
      }
      if (part.functionCall) {
        content.push({
          type: 'tool_use',
          id: `gemini_tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: part.functionCall.name,
          input: part.functionCall.args,
        })
        stopReason = 'tool_use'
      }
    }

    if (content.length === 0) {
      content.push({ type: 'text', text: '' })
    }

    return {
      content,
      stopReason,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      cacheHit: false,
      model: this.model,
      latencyMs,
    }
  }
}
