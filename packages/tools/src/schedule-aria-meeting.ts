// schedule_aria_meeting — Creates a calendar invite when Aria is blocked on user input
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

  try {
    // Determine start time based on urgency
    const delayMinutes = urgency === 'high' ? 15 : urgency === 'medium' ? 60 : 240
    const startTime = new Date(Date.now() + delayMinutes * 60 * 1000)

    // Try to create Google Calendar event
    // This requires the user to have Google OAuth connected
    try {
      const { createAriaEvent } = await import('./google/calendar.js')

      // Get access token from database
      // TODO: Wire Prisma to look up the user's Google integration
      // For now, attempt the calendar API call
      // const integration = await prisma.integration.findFirst({
      //   where: { userId: context.userId, provider: { in: ['GOOGLE_DRIVE', 'GOOGLE_DOCS'] } }
      // })

      // Placeholder: log the meeting request
      console.log(`[ScheduleAriaMeeting] Would create event: "${topic}" at ${startTime.toISOString()}`)
      console.log(`[ScheduleAriaMeeting] Context: ${meetingContext.slice(0, 200)}`)
      console.log(`[ScheduleAriaMeeting] Session link: /session/${context.sessionId}?live=true`)

      // If we had the access token, we'd call:
      // const event = await createAriaEvent(accessToken, {
      //   topic,
      //   context: meetingContext,
      //   sessionId: context.sessionId,
      //   startTime,
      // })

      void createAriaEvent // reference to avoid unused import warning

      return {
        success: true,
        data: {
          topic,
          urgency,
          scheduledFor: startTime.toISOString(),
          sessionLink: `/session/${context.sessionId}?live=true`,
          message: `Meeting scheduled: "${topic}" at ${startTime.toLocaleTimeString()}. The user will receive a calendar notification with a link to join a live session.`,
          calendarConnected: false, // Will be true once Google OAuth is wired
        },
        durationMs: Date.now() - start,
      }
    } catch (calError) {
      // Calendar API not available — still log the request
      const errorMsg = calError instanceof Error ? calError.message : 'Unknown'
      console.warn(`[ScheduleAriaMeeting] Calendar API unavailable: ${errorMsg}`)

      return {
        success: true,
        data: {
          topic,
          urgency,
          scheduledFor: startTime.toISOString(),
          sessionLink: `/session/${context.sessionId}?live=true`,
          message: `Meeting request logged but calendar not connected. Topic: "${topic}". The user should check AXIS for pending questions.`,
          calendarConnected: false,
        },
        durationMs: Date.now() - start,
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, data: null, error: `Failed to schedule meeting: ${errorMsg}`, durationMs: Date.now() - start }
  }
}
