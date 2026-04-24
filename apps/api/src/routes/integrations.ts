import { createHmac, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'
import { googleConnectSchema } from '../lib/schemas.js'
import { google } from '@axis/tools'
const { getAuthUrl, exchangeCode, encryptTokens } = google
import { WebhookHandler } from '@axis/ingestion'
import { encrypt, decrypt } from '@axis/types'

import { prisma as prismaClient } from '../lib/prisma.js'
const webhookHandler = new WebhookHandler({ prisma: prismaClient })

// ─── OAuth state signing helpers (SEC-2) ────────────────────────

function signState(payload: Record<string, string>): string {
  const secret = process.env['JWT_SECRET'] ?? ''
  const data = JSON.stringify(payload)
  const hmac = createHmac('sha256', secret).update(data).digest('hex')
  return Buffer.from(JSON.stringify({ data, hmac })).toString('base64url')
}

function verifyState(state: string): Record<string, string> {
  let parsed: { data: string; hmac: string }
  try {
    parsed = JSON.parse(Buffer.from(state, 'base64url').toString()) as { data: string; hmac: string }
  } catch {
    throw new Error('Invalid OAuth state format')
  }

  const secret = process.env['JWT_SECRET'] ?? ''
  const expected = createHmac('sha256', secret).update(parsed.data).digest('hex')

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(parsed.hmac, 'hex'))) {
    throw new Error('OAuth state signature invalid — possible CSRF attack')
  }

  return JSON.parse(parsed.data) as Record<string, string>
}

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

    // State is HMAC-signed to prevent OAuth CSRF (SEC-2)
    const state = signState({
      userId: req.userId!,
      provider: parsed.data.provider,
    })

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

    // Verify HMAC signature to prevent OAuth CSRF (SEC-2)
    let stateData: Record<string, string>
    try {
      stateData = verifyState(state)
    } catch (verifyErr) {
      const msg = verifyErr instanceof Error ? verifyErr.message : 'State verification failed'
      res.status(400).json({ error: msg, code: 'OAUTH_STATE_INVALID' })
      return
    }

    const userId = stateData['userId']
    const provider = stateData['provider']
    if (!userId || !provider) {
      res.status(400).json({ error: 'OAuth state missing required fields', code: 'OAUTH_STATE_INVALID' })
      return
    }

    // Exchange code for tokens
    const tokens = await exchangeCode(code)
    const encrypted = encryptTokens(tokens)

    // Store in DB
    await prisma.integration.upsert({
      where: {
        id: `${userId}_${provider}`,
      },
      create: {
        id: `${userId}_${provider}`,
        userId,
        provider: provider as 'GOOGLE_DOCS' | 'GOOGLE_SHEETS' | 'GMAIL' | 'GOOGLE_DRIVE',
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

    const webBase = process.env['WEB_BASE_URL'] ?? 'http://localhost:3000'
    res.redirect(`${webBase}/settings?connected=${encodeURIComponent(provider)}`)
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
    const channelToken = req.headers['x-goog-channel-token'] as string | undefined

    // SEC-3: Verify the channel token matches the one we stored at registration time.
    // Without this check, anyone who knows the webhook URL can send fake notifications.
    const expectedToken = process.env['DRIVE_WEBHOOK_SECRET']
    if (expectedToken) {
      if (!channelToken || channelToken !== expectedToken) {
        console.error(`[Webhook] Invalid channel token for channelId=${channelId}`)
        // Return 200 to avoid Google retrying with the same bad request
        res.status(200).json({ action: 'ignored', reason: 'invalid_token' })
        return
      }
    }

    // KNOWN GAP: handleNotification receives Drive push events but does not trigger actual file ingestion
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
 * DELETE /api/integrations/google/:provider — Disconnect an integration
 * Removes the stored OAuth tokens from the database.
 */
integrationsRouter.delete('/google/:provider', authenticate, async (req: Request, res: Response) => {
  const validProviders = ['GOOGLE_DRIVE', 'GMAIL', 'GOOGLE_DOCS', 'GOOGLE_SHEETS']
  const provider = req.params['provider']

  if (!provider || !validProviders.includes(provider)) {
    res.status(400).json({ error: 'Invalid provider', code: 'VALIDATION_ERROR', requestId: req.requestId })
    return
  }

  try {
    await prisma.integration.deleteMany({
      where: { userId: req.userId!, provider: provider as 'GOOGLE_DRIVE' | 'GMAIL' | 'GOOGLE_DOCS' | 'GOOGLE_SHEETS' },
    })
    res.json({ disconnected: true, provider, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to disconnect', code: 'DISCONNECT_ERROR', details: errorMsg, requestId: req.requestId })
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

// ─── GitHub PAT endpoints ──────────────────────────────────────

/**
 * POST /api/integrations/github/pat — Save a GitHub Personal Access Token
 * Encrypts the token at rest using AES-256-GCM before storing.
 */
integrationsRouter.post('/github/pat', authenticate, async (req: Request, res: Response) => {
  try {
    const token = (req.body as { token?: string }).token?.trim()
    if (!token || token.length < 10) {
      res.status(400).json({ error: 'A valid GitHub token is required', code: 'VALIDATION_ERROR', requestId: req.requestId })
      return
    }

    // Quick sanity-check: verify the token works before saving
    const ghRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'AXIS-Copilot', Accept: 'application/vnd.github.v3+json' },
    })
    if (!ghRes.ok) {
      res.status(422).json({ error: 'GitHub token is invalid or has insufficient permissions', code: 'INVALID_TOKEN', requestId: req.requestId })
      return
    }

    const ghUser = await ghRes.json() as { login: string }
    const encrypted = encrypt(token)

    await prisma.integration.upsert({
      where: { userId_provider: { userId: req.userId!, provider: 'GITHUB' } },
      create: { userId: req.userId!, provider: 'GITHUB', accessToken: encrypted },
      update: { accessToken: encrypted },
    })

    res.json({ ok: true, login: ghUser.login, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to save GitHub token', code: 'GITHUB_PAT_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * DELETE /api/integrations/github/pat — Remove the stored GitHub token
 */
integrationsRouter.delete('/github/pat', authenticate, async (req: Request, res: Response) => {
  try {
    await prisma.integration.deleteMany({ where: { userId: req.userId!, provider: 'GITHUB' } })
    res.json({ ok: true, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to remove GitHub token', code: 'GITHUB_DELETE_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * Exported helper — resolve the GitHub token for a user.
 * Prefers the DB-stored token (user-specific), falls back to GITHUB_TOKEN env var (shared).
 */
export async function resolveGithubToken(userId: string): Promise<string | undefined> {
  try {
    const row = await prisma.integration.findUnique({
      where: { userId_provider: { userId, provider: 'GITHUB' } },
      select: { accessToken: true },
    })
    if (row?.accessToken) return decrypt(row.accessToken)
  } catch {
    // Fall through to env var
  }
  return process.env['GITHUB_TOKEN']
}
