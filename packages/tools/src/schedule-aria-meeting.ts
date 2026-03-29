// schedule_aria_meeting — Creates a Google Calendar event when Aria needs user input
// Used by: Aria (when she or a worker agent needs a decision from the user)

import type { ToolContext, ToolResult, ToolDefinition } from './types.js'

export const scheduleAriaMeetingDefinition: ToolDefinition = {
  name: 'schedule_aria_meeting',
  description: 'Schedule a calendar meeting when you need user input to proceed. Creates a Google Calendar event with a link to the AXIS live session. Use when you are blocked on a decision, need approval, or want to discuss results with the user.',
  inputSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'Brief topic of what you need input on (appears in calendar title)' },
      context: { type: 'string', description: 'Full context: what you are working on, what decision is needed, and any options you have identified' },
      urgency: { type: 'string', enum: ['low', 'medium', 'high'], description: 'How urgent the input is. High = schedule in 15 min, Medium = 1 hour, Low = next available slot' },
    },
    required: ['topic', 'context', 'urgency'],
  },
}

export async function scheduleAriaMeeting(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  const topic = input['topic'] as string | undefined
  const meetingContext = input['context'] as string | undefined
  const urgency = (input['urgency'] as string | undefined) ?? 'medium'

  if (!topic || !meetingContext) {
    return { success: false, data: null, error: 'topic and context are required', durationMs: Date.now() - start }
  }

  const delayMinutes = urgency === 'high' ? 15 : urgency === 'medium' ? 60 : 240
  const startTime = new Date(Date.now() + delayMinutes * 60 * 1000)

  try {
    // Get Google OAuth token from database
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()

    try {
      const integration = await prisma.integration.findFirst({
        where: {
          userId: context.userId,
          provider: { in: ['GMAIL', 'GOOGLE_DRIVE', 'GOOGLE_DOCS', 'GOOGLE_SHEETS'] },
        },
        orderBy: { createdAt: 'desc' },
      })

      if (!integration) {
        return {
          success: true,
          data: {
            topic, urgency, scheduledFor: startTime.toISOString(),
            sessionLink: `/session/${context.sessionId}?live=true`,
            message: `Meeting request logged but Google not connected. Topic: "${topic}".`,
            calendarConnected: false,
          },
          durationMs: Date.now() - start,
        }
      }

      // Decrypt and get valid token
      const { getValidToken } = await import('./google/auth.js')
      const accessToken = await getValidToken(
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

      // Create the calendar event
      const { createAriaEvent } = await import('./google/calendar.js')
      const event = await createAriaEvent(accessToken, {
        topic,
        context: meetingContext,
        sessionId: context.sessionId,
        startTime,
      })

      console.log(`[ScheduleAriaMeeting] Created event: ${event.id} — ${event.htmlLink}`)

      return {
        success: true,
        data: {
          topic,
          urgency,
          scheduledFor: startTime.toISOString(),
          sessionLink: `/session/${context.sessionId}?live=true`,
          calendarEventId: event.id,
          calendarLink: event.htmlLink,
          message: `Meeting "${topic}" scheduled for ${startTime.toLocaleTimeString()}. Calendar event created with a link to your AXIS live session.`,
          calendarConnected: true,
        },
        durationMs: Date.now() - start,
      }
    } finally {
      await prisma.$disconnect()
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[ScheduleAriaMeeting] Failed: ${errorMsg}`)
    return {
      success: true,
      data: {
        topic, urgency, scheduledFor: startTime.toISOString(),
        sessionLink: `/session/${context.sessionId}?live=true`,
        message: `Meeting request logged but calendar creation failed: ${errorMsg}`,
        calendarConnected: false,
      },
      durationMs: Date.now() - start,
    }
  }
}
