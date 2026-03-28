import { describe, it, expect } from 'vitest'
import { getRoute, isLocalTask, hasFallback, getFallback, getModelForTask } from '../router.js'
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
      expect(route.primary).toBe('claude')
    }
  })

  it('routes agent_response to Opus with 4096 max tokens', () => {
    const route = getRoute('agent_response')
    expect(route.claudeModel).toBe('opus')
    expect(route.maxTokens).toBe(4096)
  })

  it('routes classify to Haiku with JSON mode', () => {
    const route = getRoute('classify')
    expect(route.claudeModel).toBe('haiku')
    expect(route.jsonMode).toBe(true)
    expect(route.maxTokens).toBe(150)
  })

  it('routes entity_verify to Haiku', () => {
    const route = getRoute('entity_verify')
    expect(route.claudeModel).toBe('haiku')
    expect(route.maxTokens).toBe(10)
  })

  it('routes session_summary to Sonnet', () => {
    const route = getRoute('session_summary')
    expect(route.claudeModel).toBe('sonnet')
  })

  it('routes user_response to Opus', () => {
    const route = getRoute('user_response')
    expect(route.claudeModel).toBe('opus')
    expect(route.maxTokens).toBe(4096)
  })

  it('routes user_email to Sonnet', () => {
    expect(getRoute('user_email').claudeModel).toBe('sonnet')
  })

  it('routes user_report to Opus', () => {
    expect(getRoute('user_report').claudeModel).toBe('opus')
  })

  it('routes entity_extract to Haiku with JSON mode', () => {
    const route = getRoute('entity_extract')
    expect(route.claudeModel).toBe('haiku')
    expect(route.jsonMode).toBe(true)
  })
})

describe('getModelForTask', () => {
  it('returns opus for complex tasks', () => {
    expect(getModelForTask('agent_response')).toBe('opus')
    expect(getModelForTask('user_response')).toBe('opus')
    expect(getModelForTask('user_report')).toBe('opus')
  })

  it('returns sonnet for medium tasks', () => {
    expect(getModelForTask('session_summary')).toBe('sonnet')
    expect(getModelForTask('context_compress')).toBe('sonnet')
    expect(getModelForTask('user_email')).toBe('sonnet')
  })

  it('returns haiku for simple tasks', () => {
    expect(getModelForTask('classify')).toBe('haiku')
    expect(getModelForTask('entity_extract')).toBe('haiku')
    expect(getModelForTask('doc_type_detect')).toBe('haiku')
    expect(getModelForTask('client_attribute')).toBe('haiku')
    expect(getModelForTask('entity_verify')).toBe('haiku')
  })
})

describe('isLocalTask / hasFallback / getFallback', () => {
  it('no tasks are local (all route through Anthropic)', () => {
    const allTasks: InferenceTask[] = [
      'agent_response', 'classify', 'entity_extract', 'doc_type_detect',
      'client_attribute', 'context_compress', 'entity_verify', 'session_summary',
      'user_response', 'user_email', 'user_report',
    ]
    for (const task of allTasks) {
      expect(isLocalTask(task)).toBe(false)
      expect(hasFallback(task)).toBe(false)
      expect(getFallback(task)).toBeNull()
    }
  })
})
