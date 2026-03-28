import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// Use a fresh import each time to avoid module caching of env state
describe('validateEnv', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Reset env before each test
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, originalEnv)
  })

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv }
  })

  it('throws if ANTHROPIC_API_KEY is missing', async () => {
    delete process.env['ANTHROPIC_API_KEY']
    const { validateEnv } = await import('../lib/env.js')
    expect(() => validateEnv()).toThrow('ANTHROPIC_API_KEY')
  })

  it('throws if JWT_SECRET is too short', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'test-key'
    process.env['DATABASE_URL'] = 'postgresql://localhost/test'
    process.env['REDIS_URL'] = 'redis://localhost:6379'
    process.env['JWT_SECRET'] = 'short'
    process.env['ENCRYPTION_KEY'] = 'a'.repeat(64)
    const { validateEnv } = await import('../lib/env.js')
    expect(() => validateEnv()).toThrow('JWT_SECRET')
  })

  it('throws if ENCRYPTION_KEY is wrong length', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'test-key'
    process.env['DATABASE_URL'] = 'postgresql://localhost/test'
    process.env['REDIS_URL'] = 'redis://localhost:6379'
    process.env['JWT_SECRET'] = 'a'.repeat(32)
    process.env['ENCRYPTION_KEY'] = 'a'.repeat(32) // must be 64
    const { validateEnv } = await import('../lib/env.js')
    expect(() => validateEnv()).toThrow('ENCRYPTION_KEY')
  })

  it('passes with all required vars set', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key'
    process.env['DATABASE_URL'] = 'postgresql://axis:axis@localhost:5432/axis'
    process.env['REDIS_URL'] = 'redis://localhost:6379'
    process.env['JWT_SECRET'] = 'a'.repeat(32)
    process.env['ENCRYPTION_KEY'] = 'a'.repeat(64)
    const { validateEnv } = await import('../lib/env.js')
    expect(() => validateEnv()).not.toThrow()
  })

  it('applies defaults for unset optional vars', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key'
    process.env['DATABASE_URL'] = 'postgresql://axis:axis@localhost:5432/axis'
    process.env['REDIS_URL'] = 'redis://localhost:6379'
    process.env['JWT_SECRET'] = 'a'.repeat(32)
    process.env['ENCRYPTION_KEY'] = 'a'.repeat(64)
    delete process.env['OLLAMA_MODEL']
    // NODE_ENV is set to 'test' by setup.ts — that's the correct value here
    const { validateEnv } = await import('../lib/env.js')
    const result = validateEnv()
    expect(result.OLLAMA_MODEL).toBe('qwen3:8b')
    // NODE_ENV will be 'test' because setup.ts sets it; confirm it's a valid value
    expect(['development', 'production', 'test']).toContain(result.NODE_ENV)
  })
})
