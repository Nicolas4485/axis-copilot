// Webhook Handler — Google Drive push notification processing
// Handles file change notifications, checksum comparison, webhook renewal

import { createHash } from 'node:crypto'
import { IngestionPipeline } from './pipeline.js'
import type { IngestionResult } from './types.js'

/** Drive webhook payload from Google */
export interface DriveWebhookPayload {
  /** Channel ID we registered */
  channelId: string
  /** Resource ID of the changed file */
  resourceId: string
  /** Resource URI */
  resourceUri: string
  /** Change type */
  state: 'sync' | 'add' | 'remove' | 'update' | 'trash' | 'untrash'
  /** Changed file ID (from X-Goog-Resource-ID header) */
  fileId?: string
  /** Expiration time of the channel */
  expiration?: string
}

/** Webhook channel info for renewal tracking */
export interface WebhookChannel {
  channelId: string
  resourceId: string
  userId: string
  expiration: string   // ISO 8601
  createdAt: string
}

const WEBHOOK_EXPIRY_DAYS = 7
const RENEWAL_BUFFER_HOURS = 24  // Renew 24 hours before expiry

/**
 * WebhookHandler processes Google Drive push notifications.
 *
 * Flow:
 * 1. Receive webhook → validate channel
 * 2. Fetch updated file from Drive
 * 3. Compare checksums — skip if unchanged
 * 4. Re-ingest if content changed
 *
 * Renewal cron runs daily at 23:00 UTC (configured externally).
 */
export class WebhookHandler {
  private pipeline: IngestionPipeline
  // TODO: Google Drive API client
  // private driveClient: drive_v3.Drive

  constructor(options?: { prisma?: import('@prisma/client').PrismaClient }) {
    if (options?.prisma) {
      this.pipeline = new IngestionPipeline({ prisma: options.prisma })
    } else {
      // WebhookHandler may be instantiated without Prisma at import time
      // Pipeline will throw if actually called without it
      this.pipeline = null as unknown as IngestionPipeline
    }
  }

  /**
   * Handle an incoming Drive webhook notification.
   */
  async handleNotification(
    payload: DriveWebhookPayload,
    headers: Record<string, string>
  ): Promise<{ action: 'processed' | 'skipped' | 'ignored'; result?: IngestionResult }> {
    const fileId = payload.fileId ?? headers['x-goog-resource-id'] ?? ''
    const state = payload.state ?? headers['x-goog-resource-state'] ?? ''

    console.log(`[Webhook] Notification: state=${state}, fileId=${fileId}, channelId=${payload.channelId}`)

    // Ignore sync confirmations
    if (state === 'sync') {
      console.log('[Webhook] Sync confirmation — ignoring')
      return { action: 'ignored' }
    }

    // Ignore deletions and trash events
    if (state === 'remove' || state === 'trash') {
      console.log(`[Webhook] ${state} event — marking document for review`)
      // TODO: Mark KnowledgeDocument as needing re-sync
      // await prisma.knowledgeDocument.updateMany({
      //   where: { sourceId: fileId },
      //   data: { syncStatus: 'PENDING' },
      // })
      return { action: 'skipped' }
    }

    // Process add/update/untrash events
    if (state === 'add' || state === 'update' || state === 'untrash') {
      return this.processFileChange(fileId, payload.channelId)
    }

    return { action: 'ignored' }
  }

  /**
   * Process a file change: fetch, compare checksum, re-ingest if changed.
   */
  private async processFileChange(
    fileId: string,
    channelId: string
  ): Promise<{ action: 'processed' | 'skipped'; result?: IngestionResult }> {
    try {
      // Step 1: Fetch file metadata and content from Drive
      // TODO: Use Google Drive API
      // const fileMetadata = await this.driveClient.files.get({
      //   fileId,
      //   fields: 'id,name,mimeType,modifiedTime,md5Checksum,size',
      // })
      // const fileContent = await this.driveClient.files.export({
      //   fileId,
      //   mimeType: 'text/html', // or appropriate export type
      // })
      const fileMetadata = {
        name: `drive-file-${fileId}`,
        mimeType: 'application/vnd.google-apps.document',
        md5Checksum: '',
      }

      // Step 2: Compare checksums with stored version
      // TODO: Look up existing document
      // const existing = await prisma.knowledgeDocument.findFirst({
      //   where: { sourceId: fileId },
      // })
      // if (existing && existing.checksum === newChecksum) {
      //   return { action: 'skipped' }
      // }

      // Step 3: Re-ingest the document
      // TODO: Fetch actual content from Drive API
      const content = Buffer.from('') // Placeholder

      const newChecksum = createHash('sha256').update(content).digest('hex')

      // TODO: Look up userId from channel registration
      const userId = '' // Would come from webhook channel → user mapping

      const result = await this.pipeline.ingestDocument(
        content,
        fileMetadata.name,
        fileMetadata.mimeType,
        userId,
        {
          sourceType: 'GDRIVE',
          sourceId: fileId,
        }
      )

      console.log(
        `[Webhook] Processed file ${fileId}: ${result.status}, ` +
        `${result.chunkCount} chunks, ${result.entityCount} entities`
      )

      void channelId
      void newChecksum

      return { action: 'processed', result }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[Webhook] Failed to process file ${fileId}: ${errorMsg}`)
      return { action: 'skipped' }
    }
  }

  /**
   * Register a webhook channel for a user's Drive.
   * Called when a user connects Google Drive integration.
   */
  async registerChannel(userId: string): Promise<WebhookChannel> {
    const channelId = `axis_${userId}_${Date.now()}`
    const expiration = new Date(
      Date.now() + WEBHOOK_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    ).toISOString()

    // TODO: Call Google Drive API to register push channel
    // await this.driveClient.files.watch({
    //   fileId: 'root', // Watch user's entire Drive
    //   requestBody: {
    //     id: channelId,
    //     type: 'web_hook',
    //     address: `${process.env.API_BASE_URL}/api/integrations/google/drive-webhook`,
    //     expiration: new Date(Date.now() + WEBHOOK_EXPIRY_DAYS * 24 * 60 * 60 * 1000).getTime().toString(),
    //   },
    // })

    const channel: WebhookChannel = {
      channelId,
      resourceId: 'root',
      userId,
      expiration,
      createdAt: new Date().toISOString(),
    }

    // TODO: Store channel in database for renewal tracking
    // await prisma.integration.update(...)

    console.log(`[Webhook] Registered channel ${channelId} for user ${userId}, expires ${expiration}`)

    return channel
  }

  /**
   * Renew webhook channels that are about to expire.
   * Should be called by a daily cron job at 23:00 UTC.
   *
   * Per CLAUDE.md: Drive webhooks expire every 7 days,
   * renewal cron runs daily at 23:00 UTC.
   */
  async renewExpiringChannels(): Promise<{ renewed: number; failed: number }> {
    let renewed = 0
    let failed = 0

    // TODO: Query channels expiring within RENEWAL_BUFFER_HOURS
    // const expiringChannels = await prisma.$queryRaw`
    //   SELECT * FROM "Integration"
    //   WHERE provider = 'GOOGLE_DRIVE'
    //   AND "expiresAt" < NOW() + INTERVAL '${RENEWAL_BUFFER_HOURS} hours'
    // `

    const expiringChannels: WebhookChannel[] = [] // Placeholder

    for (const channel of expiringChannels) {
      try {
        // Stop old channel
        // await this.driveClient.channels.stop({
        //   requestBody: { id: channel.channelId, resourceId: channel.resourceId },
        // })

        // Register new channel
        await this.registerChannel(channel.userId)
        renewed++
      } catch (err) {
        failed++
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        console.error(`[Webhook] Failed to renew channel ${channel.channelId}: ${errorMsg}`)
      }
    }

    console.log(`[Webhook] Renewal complete: ${renewed} renewed, ${failed} failed`)

    return { renewed, failed }
  }
}
