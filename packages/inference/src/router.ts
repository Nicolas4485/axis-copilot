// Model Router — maps tasks to the correct backend (local Qwen3 or Anthropic)
//
// Local-first routing:
//   classify, entity_extract, entity_verify  → Qwen3 8B via Ollama (fallback: Haiku)
//
// Anthropic-only routing:
//   Everything else → Haiku / Sonnet / Sonnet+Opus advisor

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
  /** Whether to use JSON mode */
  jsonMode: boolean
}

/**
 * Routing table: task → backend selection.
 *
 * Local (Qwen3 8B via Ollama) — free, fast for pipeline tasks:
 *   classify, entity_extract, entity_verify
 *   Falls back to Claude Haiku when Ollama is unavailable.
 *
 * Haiku (fast, cheap):
 *   doc_type_detect, client_attribute, contextual_retrieval,
 *   query_expansion, relevance_score
 *
 * Sonnet (balanced):
 *   context_compress, session_summary, user_email
 *
 * Sonnet + Opus advisor (complex reasoning):
 *   agent_response, user_response, user_report
 */
const ROUTING_TABLE: Record<InferenceTask, RouteTarget> = {
  // ─── Sonnet + Opus advisor — complex reasoning with cost efficiency ──
  agent_response: {
    primary: 'claude',
    claudeModel: 'sonnet',
    advisor: 'opus',
    advisorMaxUses: 3,
    maxTokens: 4096,
    jsonMode: false,
  },
  user_response: {
    primary: 'claude',
    claudeModel: 'sonnet',
    advisor: 'opus',
    advisorMaxUses: 3,
    maxTokens: 4096,
    jsonMode: false,
  },
  user_report: {
    primary: 'claude',
    claudeModel: 'sonnet',
    advisor: 'opus',
    advisorMaxUses: 3,
    maxTokens: 4096,
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

  // ─── Local (Qwen3) with Haiku fallback — pipeline tasks that don't need cloud ──
  classify: {
    primary: 'local',
    claudeModel: 'haiku',   // Haiku fallback when Ollama is unavailable
    maxTokens: 150,
    jsonMode: true,
  },
  entity_extract: {
    primary: 'local',
    claudeModel: 'haiku',
    maxTokens: 500,
    jsonMode: true,
  },
  entity_verify: {
    primary: 'local',
    claudeModel: 'haiku',
    maxTokens: 10,
    jsonMode: false,
  },

  // ─── Haiku — fast, simple cloud tasks ───────────────────────
  doc_type_detect: {
    primary: 'claude',
    claudeModel: 'haiku',
    maxTokens: 20,
    jsonMode: false,
  },
  client_attribute: {
    primary: 'claude',
    claudeModel: 'haiku',
    maxTokens: 150,
    jsonMode: true,
  },
  contextual_retrieval: {
    primary: 'claude',
    claudeModel: 'haiku',
    maxTokens: 100,
    jsonMode: false,
  },
  query_expansion: {
    primary: 'claude',
    claudeModel: 'haiku',
    maxTokens: 150,
    jsonMode: false,
  },
  relevance_score: {
    primary: 'claude',
    claudeModel: 'haiku',
    maxTokens: 10,
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
