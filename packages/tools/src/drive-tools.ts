// Google Drive tools — search files and read document content via stored OAuth tokens
// Used by Aria in text mode. Tokens retrieved from the integrations table.

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'
import { PrismaClient } from '@prisma/client'
import { getValidToken } from './google/auth.js'
import { listFiles, getFileMetadata, downloadFileAuto } from './google/drive.js'

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

// ─── search_google_drive ───────────────────────────────────────────────────────

export const searchGoogleDriveDefinition: ToolDefinition = {
  name: 'search_google_drive',
  description:
    'Search Google Drive for documents, spreadsheets, presentations, and files. Use proactively when the user asks about files, reports, proposals, contracts, or any document. Supports Drive search syntax e.g. "fullText contains \'budget\'" or "name contains \'proposal\'".',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Drive search query e.g. "fullText contains \'Q2 report\'" or "name contains \'Aura\'"',
      },
      maxResults: { type: 'number', description: 'Max files to return (default 5)' },
    },
    required: ['query'],
  },
}

export async function searchGoogleDrive(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const query = input['query'] as string | undefined
  const maxResults = (input['maxResults'] as number | undefined) ?? 5

  if (!query?.trim()) {
    return { success: false, data: null, error: 'query is required', durationMs: Date.now() - start }
  }

  try {
    const token = await getDriveToken(context.userId)
    const result = await listFiles(token, { query, pageSize: maxResults })
    return {
      success: true,
      data: { query, files: result.files, count: result.files.length },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : 'Drive search failed',
      durationMs: Date.now() - start,
    }
  }
}

// ─── read_drive_document ───────────────────────────────────────────────────────

export const readDriveDocumentDefinition: ToolDefinition = {
  name: 'read_drive_document',
  description:
    'Read the text content of a specific Google Drive document, spreadsheet, or file by file ID. Call search_google_drive first to get the file ID.',
  inputSchema: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'Google Drive file ID from search_google_drive results' },
    },
    required: ['fileId'],
  },
}

export async function readDriveDocument(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const fileId = input['fileId'] as string | undefined

  if (!fileId?.trim()) {
    return { success: false, data: null, error: 'fileId is required', durationMs: Date.now() - start }
  }

  try {
    const token = await getDriveToken(context.userId)
    const metadata = await getFileMetadata(token, fileId)
    const { content: buf, contentType } = await downloadFileAuto(token, fileId, metadata.mimeType)

    // Run binary/structured formats through their parser to get readable text.
    const { getParser } = await import('@axis/ingestion')
    const parser = getParser(contentType)
    if (parser) {
      const parsed = await parser.parse(buf, metadata.name)
      return {
        success: true,
        data: {
          fileId,
          name: metadata.name,
          content: parsed.text.slice(0, 15_000),
          sections: parsed.sections.length,
          wordCount: parsed.metadata.wordCount,
          truncated: parsed.text.length > 15_000,
        },
        durationMs: Date.now() - start,
      }
    }

    const content = buf.toString('utf8').slice(0, 15_000)
    return {
      success: true,
      data: { fileId, name: metadata.name, content, truncated: buf.length > 15_000 },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : 'Failed to read Drive document',
      durationMs: Date.now() - start,
    }
  }
}
