import { describe, it, expect } from 'vitest'
import { getRoute, isLocalTask, hasFallback, getFallback } from '../router.js'
import type { InferenceTask } from '../types.js'

describe('getRoute', () => {
  it('returns a route target for every valid task', () => {
    const allTasks: InferenceTask[] = [
      'agent_response', 'classify', 'entity_extract', 'doc_type_detect',
      'client_attribute', 'context_compress', 'entity_verify', 'session_summary',
      'user_response', 'user_email', 'user_report',
    ]
    for (const task of allTasks) {
      const route = getRoute(task)
      expect(route).toBeDefined()
      expect(route.maxTokens).toBeGreaterThan(0)
    }
  })

  it('routes agent_response to local with haiku fallback', () => {
    const route = getRoute('agent_response')
    expect(route.primary).toBe('local')
    expect(route.fallback?.target).toBe('claude')
    expect(route.fallback?.model).toBe('haiku')
    expect(route.maxTokens).toBe(2048)
  })

  it('routes classify to local with JSON mode and haiku fallback', () => {
    const route = getRoute('classify')
    expect(route.primary).toBe('local')
    expect(route.jsonMode).toBe(true)
    expect(route.maxTokens).toBe(150)
    expect(route.fallback?.model).toBe('haiku')
  })

  it('routes entity_verify to claude haiku with no fallback', () => {
    const route = getRoute('entity_verify')
    expect(route.primary).toBe('claude')
    expect(route.claudeModel).toBe('haiku')
    expect(route.fallback).toBeUndefined()
    expect(route.maxTokens).toBe(10)
  })

  it('routes session_summary to claude haiku', () => {
    const route = getRoute('session_summary')
    expect(route.primary).toBe('claude')
    expect(route.claudeModel).toBe('haiku')
  })

  it('routes user_response to claude sonnet with 4096 max tokens', () => {
    const route = getRoute('user_response')
    expect(route.primary).toBe('claude')
    expect(route.claudeModel).toBe('sonnet')
    expect(route.maxTokens).toBe(4096)
    expect(route.fallback).toBeUndefined()
  })

  it('routes user_email and user_report to claude sonnet', () => {
    expect(getRoute('user_email').claudeModel).toBe('sonnet')
    expect(getRoute('user_report').claudeModel).toBe('sonnet')
  })

  it('routes entity_extract to local with JSON mode', () => {
    const route = getRoute('entity_extract')
    expect(route.primary).toBe('local')
    expect(route.jsonMode).toBe(true)
    expect(route.maxTokens).toBe(500)
  })
})

describe('isLocalTask', () => {
  it('returns true for all local tasks', () => {
    const localTasks: InferenceTask[] = [
      'agent_response', 'classify', 'entity_extract',
      'doc_type_detect', 'client_attribute', 'context_compress',
    ]
    for (const task of localTasks) {
      expect(isLocalTask(task)).toBe(true)
    }
  })

  it('returns false for claude tasks', () => {
    const claudeTasks: InferenceTask[] = [
      'entity_verify', 'session_summary', 'user_response', 'user_email', 'user_report',
    ]
    for (const task of claudeTasks) {
      expect(isLocalTask(task)).toBe(false)
    }
  })
})

describe('hasFallback', () => {
  it('returns true for local tasks', () => {
    expect(hasFallback('agent_response')).toBe(true)
    expect(hasFallback('classify')).toBe(true)
    expect(hasFallback('entity_extract')).toBe(true)
  })

  it('returns false for claude-only tasks', () => {
    expect(hasFallback('entity_verify')).toBe(false)
    expect(hasFallback('session_summary')).toBe(false)
    expect(hasFallback('user_response')).toBe(false)
  })
})

describe('getFallback', () => {
  it('returns haiku fallback for local tasks', () => {
    const fallback = getFallback('agent_response')
    expect(fallback).not.toBeNull()
    expect(fallback?.target).toBe('claude')
    expect(fallback?.model).toBe('haiku')
  })

  it('returns null for tasks with no fallback', () => {
    expect(getFallback('entity_verify')).toBeNull()
    expect(getFallback('user_response')).toBeNull()
    expect(getFallback('session_summary')).toBeNull()
  })

  it('all local tasks fall back to haiku', () => {
    const localTasks: InferenceTask[] = [
      'agent_response', 'classify', 'entity_extract',
      'doc_type_detect', 'client_attribute', 'context_compress',
    ]
    for (const task of localTasks) {
      const fallback = getFallback(task)
      expect(fallback?.model).toBe('haiku')
    }
  })
})
