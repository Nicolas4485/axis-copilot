// Agent orchestration — @axis/agents

// Types
export type {
  AgentConfig,
  AgentContext,
  AgentResponse,
  Citation,
  ConflictFound,
  ConversationMessage,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ImageBlock,
  MemoryType,
  MemoryUpdate,
  RAGResult,
  SessionMode,
  StakeholderSummary,
  ClientRecord,
  SystemPromptKey,
  ToolResult,
} from './types.js'

// Core
export { BaseAgent } from './base-agent.js'
export { ToolRegistry } from './tool-registry.js'
export { Orchestrator } from './orchestrator.js'

// Aria — conversational orchestrator (replaces Orchestrator + IntakeAgent)
export { Aria } from './aria.js'
export type { AriaResponse, LiveSessionConfig } from './aria.js'

// Specialist agents
export { IntakeAgent } from './specialists/intake-agent.js'
export { ProductAgent } from './specialists/product-agent.js'
export { ProcessAgent } from './specialists/process-agent.js'
export { CompetitiveAgent } from './specialists/competitive-agent.js'
export { StakeholderAgent } from './specialists/stakeholder-agent.js'
