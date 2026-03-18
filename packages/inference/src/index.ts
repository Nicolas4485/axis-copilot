// InferenceEngine — all model calls go through here
// NEVER call Anthropic SDK or Ollama directly from agent code

export { InferenceEngine } from './engine.js'
export type {
  InferenceContentBlock,
  InferenceMessage,
  InferenceResponse,
  InferenceTask,
  ToolDefinition,
} from './engine.js'
