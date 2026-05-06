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
  | { type: 'tool_result'; tool_use_id: string; name?: string; content: string }

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
  | 'agent_response'     // Claude Sonnet — agent reasoning and tool use
  | 'classify'           // Claude Haiku — message classification
  | 'entity_extract'     // Claude Haiku — entity extraction from text
  | 'doc_type_detect'    // Claude Haiku — document type classification
  | 'client_attribute'   // Claude Haiku — client attribution
  | 'context_compress'   // Claude Sonnet — context compression
  | 'entity_verify'      // Claude Haiku — entity verification
  | 'session_summary'    // Claude Sonnet — session summarisation
  | 'user_response'      // Claude Sonnet — user-facing output
  | 'user_email'         // Claude Sonnet — email drafting
  | 'user_report'        // Claude Sonnet — report generation
  | 'contextual_retrieval' // Claude Haiku — chunk context retrieval
  | 'query_expansion'    // Claude Haiku — query synonym generation
  | 'relevance_score'    // Claude Haiku — passage relevance scoring
  | 'rag_plan'           // Claude Haiku — decompose query into sub-questions with sources
  | 'rag_reflect'        // Claude Haiku — score retrieved evidence and identify gaps
  | 'chart_extraction'   // Claude Sonnet vision — extract charts/tables from PDF pages

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
