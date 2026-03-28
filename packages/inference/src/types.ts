// Inference engine shared type definitions

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
  | 'entity_extract'     // Qwen3 — entity extraction from text
  | 'doc_type_detect'    // Qwen3 — document type classification
  | 'client_attribute'   // Qwen3 — client attribution
  | 'context_compress'   // Qwen3 — context compression
  | 'entity_verify'      // Claude Haiku — entity verification
  | 'session_summary'    // Claude Haiku — session summarisation
  | 'user_response'      // Claude Sonnet — user-facing output
  | 'user_email'         // Claude Sonnet — email drafting
  | 'user_report'        // Claude Sonnet — report generation

/** System prompt tier determines max token budget */
export type PromptTier = 'MICRO' | 'TASK' | 'AGENT'

/** Prompt tier token limits */
export const PROMPT_TIER_LIMITS: Record<PromptTier, number> = {
  MICRO: 150,
  TASK: 400,
  AGENT: 800,
}

/** Which Claude model to use */
export type ClaudeModel = 'haiku' | 'sonnet' | 'opus'

/** Cost record for tracking spend */
export interface CostEntry {
  sessionId: string | null
  userId: string
  task: InferenceTask
  model: string
  inputTokens: number
  outputTokens: number
  cacheHit: boolean
  costUsd: number
  latencyMs: number
  timestamp: string
}
