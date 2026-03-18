// Model Router — maps tasks to models with fallback logic
// Local tasks (Qwen3) fall back to Claude Haiku on error

import type { InferenceTask, ClaudeModel } from './types.js'

/** Which model handles each task type */
export interface RouteTarget {
  primary: 'local' | 'claude'
  claudeModel?: ClaudeModel | undefined
  fallback?: { target: 'claude'; model: ClaudeModel } | undefined
  /** Max output tokens for this task */
  maxTokens: number
  /** Whether to use JSON mode (Ollama format: "json") */
  jsonMode: boolean
}

/**
 * Routing table: task → model selection.
 *
 * Local (Qwen3 8B):
 *   agent_response, classify, entity_extract, doc_type_detect,
 *   client_attribute, context_compress
 *   → falls back to Claude Haiku on Ollama error
 *
 * Claude Haiku:
 *   entity_verify, session_summary
 *
 * Claude Sonnet:
 *   user_response, user_email, user_report
 */
const ROUTING_TABLE: Record<InferenceTask, RouteTarget> = {
  // Local Qwen3 tasks — fall back to Haiku
  agent_response: {
    primary: 'local',
    maxTokens: 2048,
    jsonMode: false,
    fallback: { target: 'claude', model: 'haiku' },
  },
  classify: {
    primary: 'local',
    maxTokens: 150,
    jsonMode: true,
    fallback: { target: 'claude', model: 'haiku' },
  },
  entity_extract: {
    primary: 'local',
    maxTokens: 500,
    jsonMode: true,
    fallback: { target: 'claude', model: 'haiku' },
  },
  doc_type_detect: {
    primary: 'local',
    maxTokens: 20,
    jsonMode: false,
    fallback: { target: 'claude', model: 'haiku' },
  },
  client_attribute: {
    primary: 'local',
    maxTokens: 150,
    jsonMode: true,
    fallback: { target: 'claude', model: 'haiku' },
  },
  context_compress: {
    primary: 'local',
    maxTokens: 1000,
    jsonMode: false,
    fallback: { target: 'claude', model: 'haiku' },
  },

  // Claude Haiku tasks — no fallback
  entity_verify: {
    primary: 'claude',
    claudeModel: 'haiku',
    maxTokens: 10,
    jsonMode: false,
  },
  session_summary: {
    primary: 'claude',
    claudeModel: 'haiku',
    maxTokens: 500,
    jsonMode: false,
  },

  // Claude Sonnet tasks — no fallback
  user_response: {
    primary: 'claude',
    claudeModel: 'sonnet',
    maxTokens: 4096,
    jsonMode: false,
  },
  user_email: {
    primary: 'claude',
    claudeModel: 'sonnet',
    maxTokens: 2048,
    jsonMode: false,
  },
  user_report: {
    primary: 'claude',
    claudeModel: 'sonnet',
    maxTokens: 4096,
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
 * Check if a task should use local inference.
 */
export function isLocalTask(task: InferenceTask): boolean {
  return ROUTING_TABLE[task].primary === 'local'
}

/**
 * Check if a task has a fallback option.
 */
export function hasFallback(task: InferenceTask): boolean {
  return ROUTING_TABLE[task].fallback !== undefined
}

/**
 * Get the fallback target for a task.
 */
export function getFallback(task: InferenceTask): { target: 'claude'; model: ClaudeModel } | null {
  return ROUTING_TABLE[task].fallback ?? null
}
