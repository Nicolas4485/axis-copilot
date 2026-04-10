import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { redis } from '../lib/redis.js'
import { Neo4jClient } from '@axis/knowledge-graph'

const VERSION = '0.0.1'

// Module-level singleton — avoids creating a new driver + connection pool on every health check.
const neo4jClient = new Neo4jClient()

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
  try {
    const status = await neo4jClient.healthCheck()
    return status.connected ? 'ok' : 'error'
  } catch {
    return 'error'
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
