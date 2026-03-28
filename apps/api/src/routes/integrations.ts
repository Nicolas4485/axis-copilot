import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'
import { googleConnectSchema } from '../lib/schemas.js'
import { getAuthUrl, exchangeCode, encryptTokens } from '@axis/tools/src/google/auth.js'
import { WebhookHandler } from '@axis/ingestion'

import { prisma as prismaClient } from '../lib/prisma.js'
const webhookHandler = new WebhookHandler({ prisma: prismaClient })

export const integrationsRouter = Router()

/**
 * POST /api/integrations/google/connect — Start OAuth flow
 * Returns the Google consent URL.
 */
integrationsRouter.post('/google/connect', authenticate, async (req: Request, res: Response) => {
  try {
    const parsed = googleConnectSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
      return
    }

    // State encodes userId + provider for the callback
    const state = Buffer.from(JSON.stringify({
      userId: req.userId,
      provider: parsed.data.provider,
    })).toString('base64url')

    const authUrl = getAuthUrl(state)
    res.json({ authUrl, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to start OAuth', code: 'OAUTH_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * GET /api/integrations/google/callback — OAuth redirect target (public)
 * Exchanges code for tokens, encrypts, stores in DB.
 */
integrationsRouter.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const code = req.query['code'] as string | undefined
    const state = req.query['state'] as string | undefined
    const error = req.query['error'] as string | undefined

    if (error) {
      res.status(400).json({ error: `OAuth denied: ${error}`, code: 'OAUTH_DENIED' })
      return
    }

    if (!code || !state) {
      res.status(400).json({ error: 'Missing code or state', code: 'OAUTH_INVALID' })
      return
    }

    // Decode state
    const stateData = JSON.parse(Buffer.from(state, 'base64url').toString()) as {
      userId: string
      provider: string
    }

    // Exchange code for tokens
    const tokens = await exchangeCode(code)
    const encrypted = encryptTokens(tokens)

    // Store in DB
    await prisma.integration.upsert({
      where: {
        id: `${stateData.userId}_${stateData.provider}`,
      },
      create: {
        id: `${stateData.userId}_${stateData.provider}`,
        userId: stateData.userId,
        provider: stateData.provider as 'GOOGLE_DOCS' | 'GOOGLE_SHEETS' | 'GMAIL' | 'GOOGLE_DRIVE',
        accessToken: encrypted.accessToken,
        refreshToken: encrypted.refreshToken,
        expiresAt: encrypted.expiresAt,
      },
      update: {
        accessToken: encrypted.accessToken,
        refreshToken: encrypted.refreshToken,
        expiresAt: encrypted.expiresAt,
      },
    })

    res.json({ success: true, provider: stateData.provider, message: 'Google integration connected' })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'OAuth callback failed', code: 'OAUTH_CALLBACK_ERROR', details: errorMsg })
  }
})

/**
 * POST /api/integrations/google/drive-webhook — Handle Drive push notifications
 * Public endpoint — Google sends POST here when files change.
 */
integrationsRouter.post('/google/drive-webhook', async (req: Request, res: Response) => {
  try {
    const channelId = req.headers['x-goog-channel-id'] as string ?? ''
    const resourceId = req.headers['x-goog-resource-id'] as string ?? ''
    const resourceState = req.headers['x-goog-resource-state'] as string ?? ''

    const result = await webhookHandler.handleNotification(
      {
        channelId,
        resourceId,
        resourceUri: req.headers['x-goog-resource-uri'] as string ?? '',
        state: resourceState as 'sync' | 'add' | 'remove' | 'update' | 'trash' | 'untrash',
        fileId: resourceId,
      },
      req.headers as Record<string, string>
    )

    // Google expects 200 OK — any other status triggers retries
    res.status(200).json({ action: result.action })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[Webhook] Error: ${errorMsg}`)
    res.status(200).json({ action: 'error', error: errorMsg })
  }
})

/**
 * GET /api/integrations/google/sync-status — Check sync status for user's Drive
 */
integrationsRouter.get('/google/sync-status', authenticate, async (req: Request, res: Response) => {
  try {
    const integrations = await prisma.integration.findMany({
      where: { userId: req.userId! },
      select: { provider: true, expiresAt: true, createdAt: true },
    })

    const documents = await prisma.knowledgeDocument.groupBy({
      by: ['syncStatus'],
      where: { userId: req.userId! },
      _count: { id: true },
    })

    const syncCounts: Record<string, number> = {}
    for (const doc of documents) {
      syncCounts[doc.syncStatus] = doc._count.id
    }

    res.json({
      integrations: integrations.map((i) => ({
        provider: i.provider,
        connected: true,
        tokenExpiry: i.expiresAt,
      })),
      syncStatus: syncCounts,
      requestId: req.requestId,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to get sync status', code: 'SYNC_STATUS_ERROR', details: errorMsg, requestId: req.requestId })
  }
})
