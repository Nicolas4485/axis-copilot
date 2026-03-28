// InferenceEngine — all model calls go through here
// NEVER call Anthropic SDK or Ollama directly from agent code

// Main engine
export { InferenceEngine } from './engine.js'

// Types
export type {
  InferenceContentBlock,
  InferenceMessage,
  InferenceResponse,
  InferenceTask,
  ToolDefinition,
  PromptTier,
  ClaudeModel,
  CostEntry,
} from './types.js'
export { PROMPT_TIER_LIMITS } from './types.js'

// Clients (for testing / direct use only — agents must use InferenceEngine)
export { LocalClient } from './local-client.js'
export { ClaudeClient } from './claude-client.js'
export { GeminiClient } from './gemini-client.js'

// Router
export { getRoute, isLocalTask, hasFallback, getFallback } from './router.js'
export type { RouteTarget } from './router.js'

// Prompt library
export { getPrompt, getPromptText, getPromptTier, listPromptKeys } from './prompt-library.js'
export type { PromptEntry } from './prompt-library.js'

// Cost tracking
export { CostTracker } from './cost-tracker.js'
export type {
  SessionCostSummary,
  ModelCostBreakdown,
  TaskCostBreakdown,
  GlobalCostSummary,
} from './cost-tracker.js'
