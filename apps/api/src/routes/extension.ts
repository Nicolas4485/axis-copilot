/**
 * Extension API routes — handles HTTP calls from axis-ext (Chrome extension).
 *
 * Mounted at /api/extension in apps/api/src/index.ts, BEFORE the global
 * authenticate middleware. Uses extensionAuth (separate static-key auth) so
 * the service worker doesn't need cookie-scoped JWTs.
 *
 * Endpoints align with packages/types/src/extension-protocol.ts —
 * EXTENSION_ENDPOINTS. Update both when adding a new one.
 */

import { Router } from 'express'
import type { Request, Response } from 'express'
import { extensionAuth } from '../middleware/extension-auth.js'
import { prisma } from '../lib/prisma.js'

const router = Router()
const VERSION = '0.0.1'

// All routes below require extension auth.
router.use(extensionAuth)

// ─── GET /api/extension/status ───────────────────────────────────────────────

router.get('/status', async (_req: Request, res: Response) => {
  // Cheap liveness check — no external calls. Mirrors /api/health.
  let dbOk: 'ok' | 'error' = 'error'
  try {
    await prisma.$queryRaw`SELECT 1`
    dbOk = 'ok'
  } catch {
    dbOk = 'error'
  }

  res.json({
    ok: true,
    version: VERSION,
    ready: dbOk === 'ok',
    services: {
      db: dbOk,
      // redis intentionally omitted — extension only needs to know if writes will work
    },
  })
})

// ─── POST /api/extension/memory ──────────────────────────────────────────────

interface MemoryBody {
  source?: string
  agentTriggered?: boolean
  timestamp?: string
  page?: { url: string; title: string; domain?: string }
  content: { summary?: string; rawText?: string }
  tags?: string[]
}

router.post('/memory', async (req: Request, res: Response) => {
  const body = req.body as MemoryBody | undefined

  if (!body || !body.content) {
    res.status(400).json({ ok: false, error: 'content is required', code: 'BAD_BODY' })
    return
  }

  // Compose a single text blob to persist. The page URL/title get prefixed so
  // semantic search later can find it by domain or title.
  const parts: string[] = []
  if (body.page) parts.push(`[page] ${body.page.title} — ${body.page.url}`)
  if (body.content.summary) parts.push(body.content.summary)
  if (body.content.rawText) parts.push(body.content.rawText)
  const text = parts.join('\n\n').trim()

  if (!text) {
    res.status(400).json({ ok: false, error: 'content is empty', code: 'EMPTY_CONTENT' })
    return
  }

  const tags: string[] = Array.isArray(body.tags) ? body.tags.filter(t => typeof t === 'string') : []
  if (body.page?.domain) tags.push(body.page.domain)
  if (body.agentTriggered) tags.push('agent-triggered')

  const userId = req.userId
  if (!userId) {
    res.status(500).json({ ok: false, error: 'no userId from auth', code: 'AUTH_BUG' })
    return
  }

  const row = await prisma.agentMemory.create({
    data: {
      userId,
      memoryType: 'EPISODIC',
      content: text,
      tags,
    },
    select: { id: true },
  })

  res.json({ ok: true, id: row.id })
})

// ─── POST /api/extension/insight ─────────────────────────────────────────────

interface InsightBody {
  content?: string
  tags?: string[]
  source?: string
}

router.post('/insight', async (req: Request, res: Response) => {
  const body = req.body as InsightBody | undefined

  const content = typeof body?.content === 'string' ? body.content.trim() : ''
  if (!content) {
    res.status(400).json({ ok: false, error: 'content is required', code: 'BAD_BODY' })
    return
  }

  const tags: string[] = Array.isArray(body?.tags) ? body!.tags!.filter(t => typeof t === 'string') : []
  tags.push('insight')

  const userId = req.userId
  if (!userId) {
    res.status(500).json({ ok: false, error: 'no userId from auth', code: 'AUTH_BUG' })
    return
  }

  const row = await prisma.agentMemory.create({
    data: {
      userId,
      memoryType: 'SEMANTIC',
      content,
      tags,
    },
    select: { id: true },
  })

  res.json({ ok: true, id: row.id })
})

export const extensionRouter = router
