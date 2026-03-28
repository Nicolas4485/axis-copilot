import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { initEnv } from './lib/env.js'
import { injectRequestId, authenticate, generalRateLimit } from './middleware/auth.js'
import { healthHandler } from './routes/health.js'
import { sessionsRouter } from './routes/sessions.js'
import { clientsRouter } from './routes/clients.js'
import { integrationsRouter } from './routes/integrations.js'
import { knowledgeRouter } from './routes/knowledge.js'
import { exportsRouter } from './routes/exports.js'
import { costRouter } from './routes/cost.js'
import { ariaRouter } from './routes/aria.js'
import { syncRouter } from './routes/sync.js'
import { prisma } from './lib/prisma.js'
import { redis } from './lib/redis.js'

// ─── Validate environment variables before anything else ──────────────────────
// Throws with a clear message if required vars are missing.
const config = initEnv()

const app = express()
const PORT = config.PORT

// ─── Global middleware ─────────────────────────────────────────────────────────
app.use(helmet())
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(injectRequestId)

// ─── Public routes ─────────────────────────────────────────────────────────────
app.get('/api/health', healthHandler)

// OAuth callback is public — no JWT required
app.use('/api/integrations', integrationsRouter)

// ─── Protected routes (JWT + rate limit) ──────────────────────────────────────
app.use('/api', authenticate, generalRateLimit)

app.use('/api/sessions', sessionsRouter)
app.use('/api/clients', clientsRouter)
app.use('/api/knowledge', knowledgeRouter)
app.use('/api/exports', exportsRouter)
app.use('/api/cost', costRouter)
app.use('/api/aria', ariaRouter)
app.use('/api/sync', syncRouter)

// ─── 404 fallthrough ───────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' })
})

// ─── Unhandled rejection safety net ───────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error(JSON.stringify({ event: 'unhandledRejection', reason: String(reason) }))
})

process.on('uncaughtException', (err) => {
  console.error(JSON.stringify({ event: 'uncaughtException', error: err.message, stack: err.stack }))
  process.exit(1)
})

// ─── Start server ──────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(JSON.stringify({ event: 'server_start', port: PORT, env: config.NODE_ENV }))
})

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  console.log(JSON.stringify({ event: 'shutdown_start', signal }))

  // Stop accepting new connections
  server.close(() => {
    console.log(JSON.stringify({ event: 'http_server_closed' }))
  })

  try {
    // Close database connections
    await Promise.allSettled([
      prisma.$disconnect(),
      redis.quit(),
    ])
    console.log(JSON.stringify({ event: 'connections_closed' }))
  } catch (err) {
    console.error(JSON.stringify({ event: 'shutdown_error', error: String(err) }))
  }

  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
