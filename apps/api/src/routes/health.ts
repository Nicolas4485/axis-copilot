import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { redis } from '../lib/redis.js'
import neo4j from 'neo4j-driver'

const VERSION = '0.0.1'

async function checkDb(): Promise<'ok' | 'error'> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return 'ok'
  } catch {
    return 'error'
  }
}

async function checkRedis(): Promise<'ok' | 'error'> {
  try {
    await redis.connect().catch(() => {
      // Already connected — ioredis throws if called twice, ignore
    })
    const pong = await redis.ping()
    return pong === 'PONG' ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

async function checkNeo4j(): Promise<'ok' | 'error'> {
  const uri = process.env['NEO4J_URI']
  const user = process.env['NEO4J_USER']
  const password = process.env['NEO4J_PASSWORD']
  if (!uri || !user || !password) return 'error'

  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    connectionTimeout: 3000,
  })
  try {
    await driver.verifyConnectivity()
    return 'ok'
  } catch {
    return 'error'
  } finally {
    await driver.close()
  }
}

async function checkAnthropic(): Promise<'ok' | 'error'> {
  const key = process.env['ANTHROPIC_API_KEY']
  if (!key) return 'error'
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(5000),
    })
    return res.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

async function checkLocalInference(): Promise<'active' | 'unavailable'> {
  const baseUrl = process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434'
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    })
    return res.ok ? 'active' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

/**
 * Public health handler — returns only overall status.
 * SEC-8: Never expose service names/versions/connectivity to unauthenticated callers.
 */
export async function healthHandler(_req: Request, res: Response): Promise<void> {
  const [db, redisStatus, neo4jStatus, anthropic, localInference] = await Promise.all([
    checkDb(),
    checkRedis(),
    checkNeo4j(),
    checkAnthropic(),
    checkLocalInference(),
  ])

  const allOk = db === 'ok' && redisStatus === 'ok'
  const overallStatus = allOk ? 'ok' : 'degraded'

  res.json({ status: overallStatus })
}

/**
 * Authenticated health handler — returns full service breakdown.
 * Only reachable via GET /api/health/detailed which sits behind the authenticate middleware.
 */
export async function healthDetailedHandler(_req: Request, res: Response): Promise<void> {
  const [db, redisStatus, neo4jStatus, anthropic, localInference] = await Promise.all([
    checkDb(),
    checkRedis(),
    checkNeo4j(),
    checkAnthropic(),
    checkLocalInference(),
  ])

  res.json({
    status: db === 'ok' && redisStatus === 'ok' ? 'ok' : 'degraded',
    db,
    redis: redisStatus,
    neo4j: neo4jStatus,
    anthropic,
    localInference,
    version: VERSION,
  })
}
