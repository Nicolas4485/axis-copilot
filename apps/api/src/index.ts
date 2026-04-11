import { createServer } from 'http'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { WebSocketServer } from 'ws'
import { initEnv } from './lib/env.js'
import { injectRequestId, authenticate, generalRateLimit } from './middleware/auth.js'
import { healthHandler, healthDetailedHandler } from './routes/health.js'
import { authRouter } from './routes/auth.js'
import { sessionsRouter } from './routes/sessions.js'
import { clientsRouter } from './routes/clients.js'
import { integrationsRouter } from './routes/integrations.js'
import { knowledgeRouter } from './routes/knowledge.js'
import { exportsRouter } from './routes/exports.js'
import { costRouter } from './routes/cost.js'
import { ariaRouter } from './routes/aria.js'
import { handleAriaLiveWs } from './routes/aria-live-ws.js'
import { syncRouter } from './routes/sync.js'
import { prisma } from './lib/prisma.js'
import { redis } from './lib/redis.js'
import { syncClientsFromDrive } from './scripts/sync-clients-from-drive.js'

// ─── Validate environment variables before anything else ──────────────────────
// Throws with a clear message if required vars are missing.
const config = initEnv()

const app = express()
const PORT = config.PORT

// ─── Global middleware ─────────────────────────────────────────────────────────
app.use(helmet())
app.use(cors({ origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? 'http://localhost:3000' }))
app.use(express.json({ limit: '10mb' }))
app.use(injectRequestId)

// ─── Public routes ─────────────────────────────────────────────────────────────
app.get('/api/health', healthHandler)
// Detailed health (DB/Redis/Neo4j/Anthropic status) — requires JWT to prevent infra enumeration
app.use('/api/auth', authRouter)

// OAuth callback is public — no JWT required
app.use('/api/integrations', integrationsRouter)

// ─── Protected routes (JWT + rate limit) ──────────────────────────────────────
app.use('/api', authenticate, generalRateLimit)

app.get('/api/health/detailed', healthDetailedHandler)
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

// ─── HTTP server (required for WebSocket upgrade handling) ────────────────────
const server = createServer(app)

// ─── WebSocket server for Gemini Live proxy ───────────────────────────────────
// Listens on /api/aria/live — auth is done inside handleAriaLiveWs via JWT
// in the query string (no browser-side Gemini API key needed).
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url ?? '/', `http://localhost`).pathname
  if (pathname === '/api/aria/live') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleAriaLiveWs(ws, request).catch((err: unknown) => {
        console.error('[AriaLiveWS] Unhandled error:', err)
        ws.close(1011, 'Internal error')
      })
    })
  } else {
    socket.destroy()
  }
})

// ─── Start server ──────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(JSON.stringify({ event: 'server_start', port: PORT, env: config.NODE_ENV }))

  // Non-blocking: sync client folders from Google Drive for all users who have
  // a GOOGLE_DRIVE integration. Removes seed data, discovers real clients.
  void (async () => {
    try {
      const driveUsers = await prisma.integration.findMany({
        where: { provider: 'GOOGLE_DRIVE' },
        select: { userId: true },
        distinct: ['userId'],
      })
      for (const { userId } of driveUsers) {
        await syncClientsFromDrive(userId)
      }
    } catch (err) {
      console.warn('[Startup] Client sync failed:', err instanceof Error ? err.message : err)
    }
  })()
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
