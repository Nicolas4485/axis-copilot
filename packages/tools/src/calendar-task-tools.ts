// Calendar and task tools — book meetings and create tasks via stored OAuth tokens
// Used by Aria in text mode. Tokens retrieved from the integrations table.

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'
import { PrismaClient } from '@prisma/client'
import { getValidToken } from './google/auth.js'

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

let _prisma: PrismaClient | null = null
function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient()
  return _prisma
}

async function getCalendarToken(userId: string): Promise<string> {
  const prisma = getPrisma()
  // Calendar scope is granted with the GOOGLE_DRIVE integration (same OAuth flow)
  const integration = await prisma.integration.findFirst({
    where: { userId, provider: 'GOOGLE_DRIVE' },
    select: { id: true, accessToken: true, refreshToken: true, expiresAt: true },
  })
  if (!integration) {
    throw new Error('No Google integration found — user has not connected their Google account')
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

// ─── book_meeting ──────────────────────────────────────────────────────────────

export const bookMeetingDefinition: ToolDefinition = {
  name: 'book_meeting',
  description:
    'Schedule a meeting in Google Calendar. Use when the user asks to book, schedule, or set up a meeting with a client or colleague.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Meeting title' },
      dateTime: {
        type: 'string',
        description: 'Start date and time in ISO 8601 format (e.g. 2026-04-15T14:00:00)',
      },
      attendees: {
        type: 'array',
        items: { type: 'string' },
        description: 'Email addresses of attendees (optional)',
      },
      durationMinutes: { type: 'number', description: 'Duration in minutes (default 60)' },
    },
    required: ['title', 'dateTime'],
  },
}

export async function bookMeeting(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const title = input['title'] as string | undefined
  const dateTimeStr = input['dateTime'] as string | undefined

  if (!title?.trim() || !dateTimeStr?.trim()) {
    return { success: false, data: null, error: 'title and dateTime are required', durationMs: Date.now() - start }
  }

  try {
    const token = await getCalendarToken(context.userId)
    const startTime = new Date(dateTimeStr)
    if (isNaN(startTime.getTime())) {
      return { success: false, data: null, error: `Invalid dateTime: ${dateTimeStr}`, durationMs: Date.now() - start }
    }
    const durationMs = ((input['durationMinutes'] as number | undefined) ?? 60) * 60_000
    const endTime = new Date(startTime.getTime() + durationMs)
    const attendeeEmails = (input['attendees'] as string[] | undefined) ?? []

    const response = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: title,
        start: { dateTime: startTime.toISOString(), timeZone: 'UTC' },
        end: { dateTime: endTime.toISOString(), timeZone: 'UTC' },
        attendees: attendeeEmails.map((email) => ({ email })),
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Calendar API error: ${response.status} ${errorText}`)
    }

    const event = await response.json() as { id: string; htmlLink: string; summary: string }
    return {
      success: true,
      data: { eventId: event.id, link: event.htmlLink, title: event.summary },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : 'Failed to book meeting',
      durationMs: Date.now() - start,
    }
  }
}

// ─── create_task ───────────────────────────────────────────────────────────────

export const createTaskDefinition: ToolDefinition = {
  name: 'create_task',
  description:
    'Create an action item or task for follow-up. Use when the user asks to remember something, create a to-do, or when an action item surfaces during conversation.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title' },
      description: { type: 'string', description: 'Additional context or details' },
      priority: {
        type: 'string',
        enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        description: 'Task priority (default MEDIUM)',
      },
      dueDate: { type: 'string', description: 'Due date in ISO 8601 format (optional)' },
    },
    required: ['title'],
  },
}

export async function createTask(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const title = input['title'] as string | undefined

  if (!title?.trim()) {
    return { success: false, data: null, error: 'title is required', durationMs: Date.now() - start }
  }

  const description = (input['description'] as string | undefined) ?? ''
  const priority = (input['priority'] as string | undefined) ?? 'MEDIUM'
  const dueDate = (input['dueDate'] as string | undefined) ?? null

  try {
    const prisma = getPrisma()
    await prisma.message.create({
      data: {
        sessionId: context.sessionId,
        role: 'SYSTEM',
        content: `Task: ${title}${description ? `\n${description}` : ''}`,
        mode: 'task',
        metadata: { priority, dueDate, createdByAria: true },
      },
    })
    return {
      success: true,
      data: { status: 'created', title, priority, dueDate },
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : 'Failed to create task',
      durationMs: Date.now() - start,
    }
  }
}
