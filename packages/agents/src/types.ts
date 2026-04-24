// Agent system type definitions

import type { RAGResult as RealRAGResult, Citation as RAGCitation, RAGConflict } from '@axis/rag'

/** Which system prompt to load for this agent */
export type SystemPromptKey =
  | 'AGENT_INTAKE'
  | 'AGENT_PRODUCT'
  | 'AGENT_PROCESS'
  | 'AGENT_COMPETITIVE'
  | 'AGENT_STAKEHOLDER'
  | 'AGENT_DUE_DILIGENCE'

/** Memory types an agent can read/write */
export type MemoryType = 'EPISODIC' | 'SEMANTIC' | 'PROCEDURAL'

/** Configuration that defines an agent's identity and capabilities */
export interface AgentConfig {
  name: string
  role: string
  systemPromptKey: SystemPromptKey
  tools: string[]
  memoryTypes: MemoryType[]
}

/** Citation from a RAG result pointing back to source material */
export interface Citation {
  documentId: string
  chunkId: string
  content: string
  relevanceScore: number
  sourceTitle: string
}

/** A conflict detected between knowledge sources */
export interface ConflictFound {
  entityName: string
  property: string
  valueA: string
  valueB: string
  sourceA: string
  sourceB: string
}

/** Memory update an agent wants to persist */
export interface MemoryUpdate {
  memoryType: MemoryType
  content: string
  tags: string[]
}

// ─── Plan / Reflect types ──────────────────────────────────────

/** One item in the query decomposition plan */
export interface QueryPlanItem {
  subQuestion: string
  source: 'vector_kb' | 'graph' | 'web'
  rationale: string
}

/** Evidence collected for a single plan item */
export interface RetrievedEvidence {
  subQuestion: string
  source: QueryPlanItem['source']
  content: string
  chunkCount: number
}

/** Output of the reflection/critique step */
export interface ReflectionResult {
  sufficient: boolean
  missingInfo: string[]
  snippetScores: Array<{ source: string; score: number }>
}

/** Full execution trace — attached to AgentResponse for observability */
export interface AgentTrace {
  trivialQuery: boolean
  queryPlan: QueryPlanItem[]
  retrievalCycles: number
  reflections: ReflectionResult[]
  totalDurationMs: number
}

/** What an agent returns after processing a message */
export interface AgentResponse {
  content: string
  reasoning: string
  toolsUsed: string[]
  memoryUpdates: MemoryUpdate[]
  citations: Citation[]
  conflictsFound: ConflictFound[]
  suggestedNextAgent?: SystemPromptKey | undefined
  /** True when the loop timed out before producing a complete result */
  isPartial?: boolean | undefined
  /** Execution trace for observability / future debug panel */
  trace?: AgentTrace | undefined
}

/** Stakeholder summary passed into agent context */
export interface StakeholderSummary {
  id: string
  name: string
  role: string
  influence: 'HIGH' | 'MEDIUM' | 'LOW'
  interest: 'HIGH' | 'MEDIUM' | 'LOW'
  department?: string | undefined
}

/** Client record summary passed into agent context */
export interface ClientRecord {
  id: string
  name: string
  industry: string
  companySize: string
  website?: string | undefined
  techStack: unknown[]
  notes?: string | undefined
}

/** Re-export the real RAG result type from @axis/rag */
export type RAGResult = RealRAGResult

/** Re-export RAG citation and conflict types */
export type { RAGCitation, RAGConflict }

/** Full context assembled for an agent before it runs */
export interface AgentContext {
  sessionId: string
  clientId: string | null
  userId: string
  /** Assembled memory context from InfiniteMemory */
  assembledContext: string
  /** RAG retrieval result from RAGEngine.query() */
  ragResult: RAGResult | null
  stakeholders: StakeholderSummary[]
  clientRecord: ClientRecord | null
  /** Per-user GitHub PAT resolved from DB (takes precedence over env var) */
  githubToken?: string
}

/** A single message in a conversation turn (matches Anthropic message format) */
export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

/** Content block types used in messages */
export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ImageBlock

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean | undefined
}

export interface ImageBlock {
  type: 'image'
  source: {
    type: 'base64'
    media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
    data: string
  }
}

/** Result from executing a tool */
export interface ToolResult {
  success: boolean
  data: unknown
  error?: string | undefined
  durationMs: number
}

/** Session mode determines which agent handles the request */
export type SessionMode =
  | 'intake'
  | 'product'
  | 'process'
  | 'competitive'
  | 'stakeholder'
