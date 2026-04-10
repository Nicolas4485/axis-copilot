// Model Router — maps tasks to Anthropic models
// Uses the Advisor Strategy: Sonnet as executor, Opus as advisor
// Sonnet handles most work; consults Opus only for complex decisions
// Haiku: simple/fast tasks (classification, extraction, verification)
// Sonnet + Opus advisor: complex tasks (agent reasoning, reports)

import type { InferenceTask, ClaudeModel } from './types.js'

/** Which model handles each task type */
export interface RouteTarget {
  primary: 'claude'
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
 * Routing table: task → Anthropic model selection.
 *
 * Haiku (fast, cheap):
 *   classify, entity_extract, doc_type_detect, client_attribute,
 *   entity_verify
 *
 * Sonnet (balanced):
 *   context_compress, session_summary, user_email
 *
 * Opus 4.6 (complex reasoning):
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

  // ─── Haiku — fast, simple tasks ─────────────────────────────
  classify: {
    primary: 'claude',
    claudeModel: 'haiku',
    maxTokens: 150,
    jsonMode: true,
  },
  entity_extract: {
    primary: 'claude',
    claudeModel: 'haiku',
    maxTokens: 500,
    jsonMode: true,
  },
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
  entity_verify: {
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
 * Check if a task uses a specific model tier.
 */
export function getModelForTask(task: InferenceTask): ClaudeModel {
  return ROUTING_TABLE[task].claudeModel
}

/**
 * No fallback needed — all tasks route directly to Anthropic.
 * Kept for backward compatibility with InferenceEngine.
 */
export function isLocalTask(_task: InferenceTask): boolean {
  return false
}

export function hasFallback(_task: InferenceTask): boolean {
  return false
}

export function getFallback(_task: InferenceTask): { target: 'claude'; model: ClaudeModel } | null {
  return null
}
