// ingest_document — Downloads a Google Drive file and runs it through the ingestion pipeline.
// Uses IngestionPipeline.ingestDocument() directly (same path as the Drive sync route).

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'
import { PrismaClient } from '@prisma/client'
import { getValidToken, getFileMetadata, downloadFileAuto } from './google/index.js'

let _prisma: PrismaClient | null = null
function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient()
  return _prisma
}

async function getDriveToken(userId: string): Promise<string> {
  const prisma = getPrisma()
  const integration = await prisma.integration.findFirst({
    where: { userId, provider: 'GOOGLE_DRIVE' },
    select: { id: true, accessToken: true, refreshToken: true, expiresAt: true },
  })
  if (!integration) {
    throw new Error('No Google Drive integration found — user has not connected their Google account')
  }
  return getValidToken(
    {
      accessToken: integration.accessToken,
      refreshToken: integration.refreshToken ?? '',
      expiresAt: integration.expiresAt ?? new Date(0),
    },
    async (updated) => {
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: updated.accessToken,
          refreshToken: updated.refreshToken,
          expiresAt: updated.expiresAt,
        },
      })
    }
  )
}

export const ingestDocumentDefinition: ToolDefinition = {
  name: 'ingest_document',
  description:
    'Ingest a Google Drive document into the knowledge base so it can be retrieved by future queries. Use when the user asks to index, ingest, analyse, or save a document. The document will be searchable immediately when this tool returns.',
  inputSchema: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'Google Drive file ID to ingest' },
      clientId: { type: 'string', description: 'Client ID to attribute this document to' },
      forceReprocess: {
        type: 'boolean',
        description: 'Set true to re-ingest even if the file was already indexed. Use when the source document has been corrected on Drive.',
      },
    },
    required: ['fileId'],
  },
}

export async function ingestDocument(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const fileId = input['fileId'] as string | undefined
  const clientId = input['clientId'] as string | undefined
  const forceReprocess = (input['forceReprocess'] as boolean | undefined) ?? false
  const userId = context.userId

  if (!fileId?.trim()) {
    return { success: false, data: null, error: 'fileId is required', durationMs: Date.now() - start }
  }

  try {
    const prisma = getPrisma()
    const token = await getDriveToken(userId)
    const metadata = await getFileMetadata(token, fileId)

    const { content, contentType } = await downloadFileAuto(token, fileId, metadata.mimeType)

    const { IngestionPipeline } = await import('@axis/ingestion')
    const pipeline = new IngestionPipeline({ prisma })

    const result = await pipeline.ingestDocument(
      content,
      metadata.name,
      contentType,
      userId,
      {
        ...(clientId ? { clientId } : {}),
        sourceType: 'GDRIVE',
        sourceId: fileId,
        sourcePath: metadata.name,
        forceReprocess,
      }
    )

    if (result.status === 'FAILED') {
      return {
        success: false,
        data: null,
        error: `Ingestion pipeline failed for "${metadata.name}"`,
        durationMs: Date.now() - start,
      }
    }

    return {
      success: true,
      data: {
        fileId,
        name: metadata.name,
        status: result.status,
        chunkCount: result.chunkCount,
        entityCount: result.entityCount,
        message: `"${metadata.name}" has been ingested (${result.chunkCount} chunks, ${result.entityCount} entities). You can now search its contents.`,
      },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to ingest document: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
