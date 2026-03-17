import { Redis } from 'ioredis'

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379'

export const redis = new Redis(REDIS_URL, {
  // Fail fast in health checks rather than hanging
  connectTimeout: 3000,
  maxRetriesPerRequest: 1,
  lazyConnect: true,
})

redis.on('error', (err: Error) => {
  // Log but don't crash — health endpoint surfaces this as "error"
  console.error('[redis] connection error:', err.message)
})
