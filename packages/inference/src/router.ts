// Model Router — maps tasks to the correct backend (local Qwen3 or Anthropic)
//
// Three routing modes:
//   primary:'local'  — Qwen3 8B via Ollama first, Haiku fallback (when Ollama is down)
//   primary:'claude' — Haiku/Sonnet only, no local fallback
//   primary:'claude' + localFallback:true — Haiku first, Qwen3 fallback (ingestion tasks)

import type { InferenceTask, ClaudeModel } from './types.js'

/** Which model handles each task type */
export interface RouteTarget {
  primary: 'local' | 'claude'
  /** Claude model to use when primary is 'claude', or as fallback for local tasks */
  claudeModel: ClaudeModel
  /** Optional advisor model — executor consults this for complex decisions */
  advisor?: ClaudeModel | undefined
  /** Max advisor invocations per request (default 3) */
  advisorMaxUses?: number | undefined
  /** Max output tokens for this task */
  maxTokens: number
  /** Whether to use JSON mode (Ollama format:json) */
  jsonMode: boolean
  /** When true: try Claude first, fall back to Qwen3 if Claude fails */
  localFallback?: boolean
}

/**
 * Routing table: task → backend selection.
 *
 * Sonnet + Opus advisor (complex reasoning):
 *   agent_response, user_response, user_report
 *
 * Sonnet (balanced):
 *   context_compress, session_summary, user_email
 *
 * Haiku + Qwen3 fallback (ingestion pipeline):
 *   classify, entity_extract, entity_verify,
 *   contextual_retrieval, doc_type_detect, client_attribute,
 *   query_expansion, relevance_score
 *   → Haiku is primary; Qwen3 takes over if Anthropic API is unavailable.
 *
 * Local-only (Qwen3 primary → Haiku fallback):
 *   (none — all ingestion tasks now run Haiku-first)
 */
const ROUTING_TABLE: Record<InferenceTask, RouteTarget> = {
  // ─── Sonnet + Opus advisor — complex reasoning with cost efficiency ──
  agent_response: {
    primary: 'claude',
    claudeModel: 'sonnet',
    advisor: 'opus',
    advisorMaxUses: 3,
    maxTokens: 16000,
    jsonMode: false,
  },
  user_response: {
    primary: 'claude',
    claudeModel: 'sonnet',
    advisor: 'opus',
    advisorMaxUses: 3,
    maxTokens: 16000,
    jsonMode: false,
  },
  user_report: {
    primary: 'claude',
    claudeModel: 'sonnet',
    advisor: 'opus',
    advisorMaxUses: 3,
    maxTokens: 16000,
    jsonMode: false,
  },

  // ─── Sonnet — balanced quality tasks ────────────────────────
  context_compress: {
    primary: 'claude',
    claudeModel: 'sonnet',
    maxTokens: 1000,
    jsonMode: false,
  },
  session_summary: {
    primary: 'claude',
    claudeModel: 'sonnet',
    maxTokens: 500,
    jsonMode: false,
  },
  user_email: {
    primary: 'claude',
    claudeModel: 'sonnet',
    maxTokens: 2048,
    jsonMode: false,
  },

  // ─── Haiku primary, Qwen3 fallback — ingestion pipeline ─────
  // Haiku runs classification, extraction, chunking.
  // If the Anthropic API is unreachable, Qwen3 8B handles it locally.
  classify: {
    primary: 'claude',
    claudeModel: 'haiku',
    localFallback: true,
    maxTokens: 150,
    jsonMode: true,   // passed to Qwen3 if fallback triggers (format:json)
  },
  entity_extract: {
    primary: 'claude',
    claudeModel: 'haiku',
    localFallback: true,
    maxTokens: 1500,
    jsonMode: false,
  },
  entity_verify: {
    primary: 'claude',
    claudeModel: 'haiku',
    localFallback: true,
    maxTokens: 10,
    jsonMode: false,
  },
  doc_type_detect: {
    primary: 'claude',
    claudeModel: 'haiku',
    localFallback: true,
    maxTokens: 20,
    jsonMode: false,
  },
  client_attribute: {
    primary: 'claude',
    claudeModel: 'haiku',
    localFallback: true,
    maxTokens: 150,
    jsonMode: true,
  },
  contextual_retrieval: {
    primary: 'claude',
    claudeModel: 'haiku',
    localFallback: true,
    maxTokens: 100,
    jsonMode: false,
  },
  query_expansion: {
    primary: 'claude',
    claudeModel: 'haiku',
    localFallback: true,
    maxTokens: 150,
    jsonMode: false,
  },
  relevance_score: {
    primary: 'claude',
    claudeModel: 'haiku',
    localFallback: true,
    maxTokens: 10,
    jsonMode: false,
  },

  // ─── Plan/reflect (Haiku + JSON) — new RAG loop primitives ─────
  rag_plan: {
    primary: 'claude',
    claudeModel: 'haiku',
    maxTokens: 400,
    jsonMode: true,
  },
  rag_reflect: {
    primary: 'claude',
    claudeModel: 'haiku',
    maxTokens: 250,
    jsonMode: true,
  },
  chart_extraction: {
    primary: 'claude',
    claudeModel: 'sonnet',
    maxTokens: 1024,
    jsonMode: false,
  },
}

/**
 * Get the routing target for a task.
 */
export function getRoute(task: InferenceTask): RouteTarget {
  return ROUTING_TABLE[task]
}

/**
 * Check if a task should be routed to local Ollama first.
 */
export function isLocalTask(task: InferenceTask): boolean {
  return ROUTING_TABLE[task].primary === 'local'
}

/** @deprecated Use isLocalTask() instead */
export function hasFallback(task: InferenceTask): boolean {
  return isLocalTask(task)
}

/**
 * Get the Haiku fallback for local tasks when Ollama is unavailable.
 * Returns null for cloud-only tasks (no fallback needed).
 */
export function getFallback(task: InferenceTask): { target: 'claude'; model: ClaudeModel } | null {
  const route = ROUTING_TABLE[task]
  if (route.primary !== 'local') return null
  return { target: 'claude', model: route.claudeModel }
}

/**
 * Check if a task uses a specific model tier (cloud path).
 */
export function getModelForTask(task: InferenceTask): ClaudeModel {
  return ROUTING_TABLE[task].claudeModel
}

/**
 * True for Haiku-primary tasks that fall back to Qwen3 when the API is unavailable.
 */
export function hasLocalFallback(task: InferenceTask): boolean {
  return ROUTING_TABLE[task].localFallback === true
}
