// Google Calendar — create events for Aria blocking questions
// When Aria or an agent is blocked on user input, this creates a calendar event
// with a link back to the AXIS session for a live voice call

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3'

/** Calendar event creation response */
interface CalendarEvent {
  id: string
  htmlLink: string
  summary: string
  start: { dateTime: string }
  end: { dateTime: string }
}

/**
 * Create a calendar event for an Aria blocking question.
 *
 * The event includes:
 * - Title: "Aria needs input: [topic]"
 * - Description: context about what Aria is blocked on
 * - Link: AXIS session URL with live mode enabled
 * - Time: 15 minutes from now (or a specified time)
 */
export async function createAriaEvent(
  accessToken: string,
  options: {
    topic: string
    context: string
    sessionId: string
    axisBaseUrl?: string
    startTime?: Date
    durationMinutes?: number
  }
): Promise<CalendarEvent> {
  const baseUrl = options.axisBaseUrl ?? 'http://localhost:3000'
  const sessionLink = `${baseUrl}/session/${options.sessionId}?live=true`
  const startTime = options.startTime ?? new Date(Date.now() + 15 * 60 * 1000) // 15 min from now
  const durationMs = (options.durationMinutes ?? 15) * 60 * 1000
  const endTime = new Date(startTime.getTime() + durationMs)

  const event = {
    summary: `Aria needs input: ${options.topic}`,
    description: `${options.context}\n\n---\nClick the link below to join a live voice session with Aria:\n${sessionLink}\n\nAria has the full context loaded and is ready to discuss.`,
    start: {
      dateTime: startTime.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 5 },
        { method: 'popup', minutes: 0 },
      ],
    },
    conferenceData: undefined, // No video call — the AXIS link IS the meeting
    source: {
      title: 'Open AXIS Live Session',
      url: sessionLink,
    },
  }

  const response = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Calendar API error ${response.status}: ${errorText}`)
  }

  return await response.json() as CalendarEvent
}

/**
 * List upcoming Aria events (to avoid duplicate notifications).
 */
export async function listAriaEvents(
  accessToken: string,
  options?: { maxResults?: number }
): Promise<CalendarEvent[]> {
  const now = new Date().toISOString()
  const params = new URLSearchParams({
    timeMin: now,
    maxResults: String(options?.maxResults ?? 10),
    q: 'Aria needs input',
    orderBy: 'startTime',
    singleEvents: 'true',
  })

  const response = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error(`Calendar list error ${response.status}`)
  }

  const data = await response.json() as { items?: CalendarEvent[] }
  return data.items ?? []
}
