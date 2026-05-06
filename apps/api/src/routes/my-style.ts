// My Style routes — manage the personal writing style knowledge base
// GET  /api/my-style         — get or create My Style client + document list
// POST /api/my-style/sync    — SSE: sync a Google Drive folder into My Style client

import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { syncDriveFolder } from '../lib/drive-sync.js'

export const myStyleRouter = Router()

const MY_STYLE_CLIENT_NAME = 'My Style'

/**
 * Get or create the "My Style" pseudo-client for this user.
 * This client stores personal writing style documents (past pitch decks, proposals, etc.)
 */
async function getOrCreateMyStyleClient(userId: string) {
  let client = await prisma.client.findFirst({
    where: { userId, name: MY_STYLE_CLIENT_NAME },
  })
  if (!client) {
    client = await prisma.client.create({
      data: {
        userId,
        name: MY_STYLE_CLIENT_NAME,
        industry: 'Personal',
        notes: 'Auto-created for personal writing style indexing. Documents here are used to match your writing style in generated outputs.',
      },
    })
  }
  return client
}

/**
 * GET /api/my-style
 * Returns My Style client info + indexed document list.
 */
myStyleRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!

  try {
    const client = await getOrCreateMyStyleClient(userId)

    const [docCount, recentDocs] = await Promise.all([
      prisma.knowledgeDocument.count({ where: { userId, clientId: client.id } }),
      prisma.knowledgeDocument.findMany({
        where: { userId, clientId: client.id },
        select: {
          id: true,
          title: true,
          sourceType: true,
          syncStatus: true,
          chunkCount: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ])

    res.json({ clientId: client.id, docCount, documents: recentDocs })
  } catch (err) {
    console.error('[MyStyle] GET error:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Failed to load My Style data', code: 'INTERNAL_ERROR' })
  }
})

/**
 * POST /api/my-style/sync
 * SSE stream: syncs a Google Drive folder into the My Style client namespace.
 * Body: { folderName: string }
 */
myStyleRouter.post('/sync', async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!
  const { folderName } = req.body as { folderName?: string }

  if (!folderName?.trim()) {
    res.status(400).json({ error: 'folderName is required', code: 'VALIDATION_ERROR' })
    return
  }

  const client = await getOrCreateMyStyleClient(userId)

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendEvent = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  try {
    const result = await syncDriveFolder(
      userId,
      folderName.trim(),
      (progress) => sendEvent({ type: 'progress', ...progress }),
      client.id,
    )
    sendEvent({ type: 'done', result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    console.error('[MyStyle] Sync error:', message)
    sendEvent({ type: 'error', message })
  } finally {
    res.end()
  }
})
