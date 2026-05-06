import { createServer } from 'http'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
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
import { handleExtensionWsUpgrade, EXTENSION_WS_PATH } from './lib/extension-ws-server.js'
import { callBrowserCommand } from './lib/browser-rpc.js'
import { setBrowserRpcDispatch } from '@axis/agents'

// Phase B: wire the browser-tool RPC dispatch. packages/agents owns the tool
// definitions but cannot import from apps/api (no upward dep), so we inject
// the implementation here at boot. setBrowserRpcDispatch is idempotent — safe
// to call multiple times (last call wins). All browser_* tools route through
// this dispatch which enforces auth, rate limits, sanitisation, and the
// cross-domain gate. See apps/api/src/lib/browser-rpc.ts for the pipeline.
setBrowserRpcDispatch(async (call) => callBrowserCommand(call))
import { syncRouter } from './routes/sync.js'
import { documentsRouter } from './routes/documents.js'
import { userRouter } from './routes/user.js'
import { dealsRouter } from './routes/deals.js'
import { agentsRouter } from './routes/agents.js'
import { auditRouter } from './routes/audit.js'
import { feedbackRouter } from './routes/feedback.js'
import { myStyleRouter } from './routes/my-style.js'
import { auditMiddleware } from './middleware/audit.js'
import { cimAnalysisRouter } from './routes/cim-analysis.js'
import { memoRouter } from './routes/memo.js'
import { ragEvalRouter } from './routes/rag-eval.js'
import { settingsRouter } from './routes/settings.js'
import { vdrRouter } from './routes/vdr.js'
import { analyticsRouter } from './routes/analytics.js'
import { pitchDeckTemplateRouter } from './routes/pitch-deck-template.js'
import { extensionRouter } from './routes/extension.js'
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
// In dev, allow both :3000 and :3001 — Next.js falls back to 3001 when 3000 is taken.
// In production, ALLOWED_ORIGINS must be set explicitly.
const corsOrigins = process.env['ALLOWED_ORIGINS']?.split(',') ??
  (config.NODE_ENV === 'development'
    ? ['http://localhost:3000', 'http://localhost:3001']
    : 'http://localhost:3000')
app.use(cors({ origin: corsOrigins, credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: '10mb' }))
app.use(injectRequestId)

// ─── Public routes ─────────────────────────────────────────────────────────────
app.get('/api/health', healthHandler)
// Detailed health (DB/Redis/Neo4j/Anthropic status) — requires JWT to prevent infra enumeration
app.use('/api/auth', authRouter)

// OAuth callback is public — no JWT required
app.use('/api/integrations', integrationsRouter)

// Chrome extension routes — uses static EXTENSION_API_KEY auth instead of JWT,
// because the extension's service worker can't access cookie-scoped tokens.
// Mounted BEFORE the global JWT authenticate so it doesn't get blocked.
// See docs/EXTENSION-PROTOCOL.md.
app.use('/api/extension', extensionRouter)

// ─── Protected routes (JWT + rate limit) ──────────────────────────────────────
app.use('/api', authenticate, generalRateLimit)

// Audit middleware — must be after auth (so req.userId is set) but before routes
// Uses res.on('finish') so it captures all responses regardless of which route handles them
app.use(auditMiddleware)

app.get('/api/health/detailed', healthDetailedHandler)
app.use('/api/sessions', sessionsRouter)
app.use('/api/clients', clientsRouter)
app.use('/api/knowledge', knowledgeRouter)
app.use('/api/exports', exportsRouter)
app.use('/api/cost', costRouter)
app.use('/api/aria', ariaRouter)
app.use('/api/sync', syncRouter)
app.use('/api/documents', documentsRouter)
app.use('/api/user', userRouter)
app.use('/api/deals', dealsRouter)
app.use('/api/deals', cimAnalysisRouter)
app.use('/api/deals', memoRouter)
app.use('/api/deals', vdrRouter)
app.use('/api/agents', agentsRouter)
app.use('/api/audit', auditRouter)
app.use('/api/feedback', feedbackRouter)
app.use('/api/my-style', myStyleRouter)
app.use('/api/admin/rag-eval', ragEvalRouter)
app.use('/api', settingsRouter)
app.use('/api/analytics', analyticsRouter)
app.use('/api/pitch-deck', pitchDeckTemplateRouter)

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
  } else if (pathname === EXTENSION_WS_PATH) {
    // Phase 2 browser-agent RPC channel. Auth is done inside
    // handleExtensionWsUpgrade via an auth message right after connect
    // (the WebSocket constructor in extension service workers cannot set
    // Authorization headers, so the token rides in the first message).
    handleExtensionWsUpgrade(request, socket, head)
  } else {
    socket.destroy()
  }
})

// ─── Start server ──────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(JSON.stringify({ event: 'server_start', port: PORT, env: config.NODE_ENV }))

  // Start Telegram bot if configured.
  // Webhook mode in production (TELEGRAM_WEBHOOK_URL set), long-poll otherwise.
  if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_ARIA_USER_ID) {
    void (async () => {
      try {
        const { createTelegramBot } = await import('./telegram/bot.js')
        const bot = createTelegramBot()

        if (config.NODE_ENV === 'production' && config.TELEGRAM_WEBHOOK_URL) {
          const hookPath = '/api/telegram/webhook'
          app.use(hookPath, bot.webhookCallback(hookPath))
          await bot.telegram.setWebhook(`${config.TELEGRAM_WEBHOOK_URL}${hookPath}`)
          console.log(JSON.stringify({ event: 'telegram_bot_started', mode: 'webhook' }))
        } else {
          void bot.launch()
          console.log(JSON.stringify({ event: 'telegram_bot_started', mode: 'polling' }))
        }

        process.once('SIGINT', () => bot.stop('SIGINT'))
        process.once('SIGTERM', () => bot.stop('SIGTERM'))
      } catch (err) {
        console.error('[Telegram] Bot failed to start:', err instanceof Error ? err.message : err)
      }
    })()
  }

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