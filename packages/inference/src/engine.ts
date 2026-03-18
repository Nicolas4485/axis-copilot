// InferenceEngine — all model calls route through here
// Qwen3 handles pipeline tasks, Claude for verification and user-facing output
// Full implementation in subsequent sessions

/** Tool definition passed to the model */
export interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

/** A content block in a model response */
export type InferenceContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }

/** What the model returns */
export interface InferenceResponse {
  content: InferenceContentBlock[]
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
  inputTokens: number
  outputTokens: number
  cacheHit: boolean
  model: string
  latencyMs: number
}

/** Message format for model calls */
export interface InferenceMessage {
  role: 'user' | 'assistant'
  content: string | InferenceContentBlock[]
}

/** Task type determines model routing */
export type InferenceTask =
  | 'agent_response'     // Qwen3 — agent reasoning and tool use
  | 'classify'           // Qwen3 — message classification
  | 'entity_verify'      // Claude Haiku — entity verification
  | 'session_summary'    // Claude Haiku — session summarisation
  | 'user_response'      // Claude Sonnet — user-facing output
  | 'user_email'         // Claude Sonnet — email drafting
  | 'user_report'        // Claude Sonnet — report generation

export class InferenceEngine {
  /**
   * Route a request to the appropriate model based on task type.
   * Qwen3: agent_response, classify
   * Claude Haiku: entity_verify, session_summary
   * Claude Sonnet: user_response, user_email, user_report
   */
  async route(
    task: InferenceTask,
    options: {
      systemPromptKey: string
      messages: InferenceMessage[]
      tools?: ToolDefinition[]
      maxTokens?: number
    }
  ): Promise<InferenceResponse> {
    // TODO: Implement model routing logic
    // - Select model based on task type
    // - Apply prompt caching (cache_control: ephemeral) for Claude calls
    // - Track cost via CostRecord
    // - Apply token limits from system prompt tier
    throw new Error(`InferenceEngine.route not yet implemented for task: ${task}`)
  }

  /**
   * Classify a message to determine which agent should handle it.
   * Uses Qwen3 for fast local classification.
   */
  async classify(
    message: string,
    options?: { clientId?: string }
  ): Promise<{ agent: string; confidence: number; reasoning: string }> {
    // TODO: Implement classification via Qwen3
    throw new Error('InferenceEngine.classify not yet implemented')
  }

  /**
   * Generate a session summary for memory compression.
   * Uses Claude Haiku for quality summarisation.
   */
  async summariseSession(
    messages: InferenceMessage[],
    existingSummary?: string
  ): Promise<string> {
    // TODO: Implement via Claude Haiku
    throw new Error('InferenceEngine.summariseSession not yet implemented')
  }
}
