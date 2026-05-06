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
export { ARIA_PERSONALITY } from './aria-prompt.js'

// Specialist agents — consulting use (Sean, Kevin, Mel, Anjie)
export { IntakeAgent } from './specialists/intake-agent.js'
export { ProductAgent } from './specialists/product-agent.js'
export { ProcessAgent } from './specialists/process-agent.js'
export { CompetitiveAgent } from './specialists/competitive-agent.js'
export { StakeholderAgent } from './specialists/stakeholder-agent.js'

// PE pipeline agents
export { DueDiligenceAgent } from './specialists/due-diligence-agent.js'
export { CimAnalyst } from './cim-analyst.js'
export type { CIMAnalysisResult, FitScore, CimProgressEvent } from './cim-analyst.js'
export { MemoWriter } from './memo-writer.js'
export type { MemoResult, MemoSection, MemoProgressEvent } from './memo-writer.js'

// Sector knowledge base
export { findSectorBenchmark, formatBenchmarkForPrompt, listSectors } from './sector-benchmarks.js'
export type { SectorBenchmark } from './sector-benchmarks.js'

// LBO calculator
export { computeLBO, extractLBOInputs, formatLBOBlock } from './lbo-calculator.js'
export type { LBOInputs, LBOResult, ScenarioResult } from './lbo-calculator.js'

// Parallel specialists — commercial and risk pre-pass
export { runCommercialAnalysis, formatCommercialBlock } from './specialists/commercial-specialist.js'
export type { CommercialAnalysis } from './specialists/commercial-specialist.js'
export { runRiskAnalysis, formatRiskBlock } from './specialists/risk-specialist.js'
export type { RiskAnalysis, RiskItem } from './specialists/risk-specialist.js'
