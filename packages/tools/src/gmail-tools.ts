// Gmail tools — search and read emails via stored OAuth tokens
// Used by Aria in text mode. Tokens retrieved from the integrations table.

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'
import { PrismaClient } from '@prisma/client'
import { getValidToken } from './google/auth.js'
import { searchMessages, readMessage } from './google/gmail.js'

// Singleton Prisma client scoped to this package (only instantiated when used)
let _prisma: PrismaClient | null = null
function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient()
  return _prisma
}

async function getGmailToken(userId: string): Promise<string> {
  const prisma = getPrisma()
  const integration = await prisma.integration.findFirst({
    where: { userId, provider: 'GMAIL' },
    select: { id: true, accessToken: true, refreshToken: true, expiresAt: true },
  })
  if (!integration) {
    throw new Error('No Gmail integration found — user has not connected their Google account')
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

// ─── search_gmail ──────────────────────────────────────────────────────────────

export const searchGmailDefinition: ToolDefinition = {
  name: 'search_gmail',
  description:
    'Search Gmail for emails matching a query. Use proactively when the user asks about emails, conversations, or communications from specific people or companies. Supports Gmail search operators: from:, to:, subject:, after:YYYY/MM/DD, before:, label:, has:attachment.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Gmail search query e.g. "from:john@example.com subject:proposal after:2026/01/01"',
      },
      maxResults: { type: 'number', description: 'Max emails to return (default 5, max 20)' },
    },
    required: ['query'],
  },
}

export async function searchGmail(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const query = input['query'] as string | undefined
  const maxResults = Math.min((input['maxResults'] as number | undefined) ?? 5, 20)

  if (!query?.trim()) {
    return { success: false, data: null, error: 'query is required', durationMs: Date.now() - start }
  }

  try {
    const token = await getGmailToken(context.userId)
    const messages = await searchMessages(token, query, maxResults)
    return {
      success: true,
      data: { query, messages, count: messages.length },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : 'Gmail search failed',
      durationMs: Date.now() - start,
    }
  }
}

// ─── read_email ────────────────────────────────────────────────────────────────

export const readEmailDefinition: ToolDefinition = {
  name: 'read_email',
  description:
    'Read the full content of a specific email by message ID. Call search_gmail first to find message IDs, then use this to get the complete email body.',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: { type: 'string', description: 'Gmail message ID from search_gmail results' },
    },
    required: ['messageId'],
  },
}

export async function readEmail(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const messageId = input['messageId'] as string | undefined

  if (!messageId?.trim()) {
    return { success: false, data: null, error: 'messageId is required', durationMs: Date.now() - start }
  }

  try {
    const token = await getGmailToken(context.userId)
    const email = await readMessage(token, messageId)
    return { success: true, data: email, durationMs: Date.now() - start }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : 'Failed to read email',
      durationMs: Date.now() - start,
    }
  }
}
