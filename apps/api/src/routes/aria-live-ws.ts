// aria-live-ws.ts — Server-side WebSocket proxy for Gemini Live
//
// SEC-1 fix: the Gemini API key never leaves the server.
// Frontend connects to ws(s)://api/api/aria/live?sessionId=xxx&token=jwt
// This handler authenticates the connection, opens a server-side Gemini Live
// WebSocket, and proxies audio/video/text both ways.
//
// When Gemini issues a function_call the handler executes the tool server-side
// via the existing ToolRegistry and sends the result back as a toolResponse.

import { createHash } from 'crypto'
import type { IncomingMessage } from 'http'
import WebSocket from 'ws'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma.js'
import { redis } from '../lib/redis.js'
import { env } from '../lib/env.js'
import { Aria } from '@axis/agents'
import { InferenceEngine } from '@axis/inference'
import { google as goog } from '@axis/tools'
import { getParser } from '@axis/ingestion'

const GEMINI_WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'

// Gemini Live connections have a ~10-minute lifetime. We rotate at 9 min so the
// client can reconnect with fresh context before Gemini closes the connection.
const SESSION_ROTATION_MS = 9 * 60_000

// Silence injection: send 100 ms of 16 kHz PCM silence to Gemini every
// SILENCE_CHECK_INTERVAL ms when no client audio has arrived for SILENCE_INJECT_AFTER_MS.
// Gemini Live requires continuous audio activity or it drops the session.
const SILENCE_INJECT_AFTER_MS = 4_000
const SILENCE_CHECK_INTERVAL = 3_000
// 1600 Int16 samples of zero = 100 ms at 16 kHz = 3200 bytes
const SILENCE_PAYLOAD = JSON.stringify({
  realtimeInput: {
    audio: { mimeType: 'audio/pcm;rate=16000', data: Buffer.alloc(3200).toString('base64') },
  },
})

// Shared instances — same pattern as aria.ts route
const engine = new InferenceEngine()
const aria = new Aria({ engine, prisma })

// ─── Gemini function declarations exposed in Live sessions ────────────────────
// Only the 4 tools needed for live mode. Full Claude tool-set is used in text mode.
const GEMINI_LIVE_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'search_knowledge_base',
        description:
          'Search indexed client documents and knowledge for relevant information. Returns excerpts with source attribution.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            clientId: { type: 'string', description: 'Client ID to scope search (optional)' },
            limit: { type: 'number', description: 'Max results (default 5)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_graph_context',
        description:
          'Look up entity relationships in the knowledge graph. Returns connected entities and their relationships.',
        parameters: {
          type: 'object',
          properties: {
            entityName: { type: 'string', description: 'Entity name to look up' },
            depth: { type: 'number', description: 'Relationship depth (default 2)' },
          },
          required: ['entityName'],
        },
      },
      {
        name: 'delegate_to_agent',
        description:
          'Delegate deep analysis to a specialist agent. Sean=product, Kevin=process, Mel=competitive, Anjie=stakeholder. Always include the actual data (email content, document text, client context) in the query — not just a description of it.',
        parameters: {
          type: 'object',
          properties: {
            workerType: {
              type: 'string',
              enum: ['product', 'process', 'competitive', 'stakeholder'],
              description: 'Which specialist agent to use',
            },
            query: { type: 'string', description: 'The full analysis request including all relevant data and context' },
          },
          required: ['workerType', 'query'],
        },
      },
      {
        name: 'save_analysis',
        description:
          'Save an analysis result, insight, or recommendation for later retrieval and client records.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short title for this analysis' },
            content: { type: 'string', description: 'Full analysis content' },
            clientId: { type: 'string', description: 'Client ID to associate with (optional)' },
            analysisType: {
              type: 'string',
              description: 'Type of analysis (e.g. "product", "process", "market")',
            },
          },
          required: ['title', 'content'],
        },
      },
      {
        name: 'search_gmail',
        description:
          'Search Gmail for emails. Use proactively whenever the user mentions emails, asks about conversations, or references communications from specific people or companies. Do not ask the user — just search.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Gmail search query — supports operators: from:, to:, subject:, after:YYYY/MM/DD, before:, label:, has:attachment',
            },
            maxResults: { type: 'number', description: 'Max emails to return (default 5, max 20)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'read_email',
        description:
          'Read the full content of a specific email by message ID. Call search_gmail first to get message IDs, then call this to get the full email body.',
        parameters: {
          type: 'object',
          properties: {
            messageId: { type: 'string', description: 'Gmail message ID from search_gmail results' },
          },
          required: ['messageId'],
        },
      },
      {
        name: 'search_google_drive',
        description:
          'Search Google Drive for documents, spreadsheets, presentations, and files. Use when looking for reports, proposals, contracts, or any document related to the conversation. Do not ask the user — just search.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query — use Drive search syntax e.g. "fullText contains \'budget\'" or "name contains \'proposal\'" or just keywords',
            },
            maxResults: { type: 'number', description: 'Max files to return (default 5)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'read_drive_document',
        description:
          'Read the content of a specific Google Drive document by file ID. Call search_google_drive first to find the file ID, then call this to get its content.',
        parameters: {
          type: 'object',
          properties: {
            fileId: { type: 'string', description: 'Google Drive file ID from search_google_drive results' },
          },
          required: ['fileId'],
        },
      },
      {
        name: 'web_search',
        description:
          'Search the web for current information on companies, markets, competitors, news, or any topic not covered by the knowledge base.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Web search query' },
          },
          required: ['query'],
        },
      },
      {
        name: 'book_meeting',
        description:
          'Schedule a meeting in Google Calendar. Use when the user asks to book, schedule, or set up a meeting.',
        parameters: {
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
      },
      {
        name: 'create_task',
        description:
          'Create an action item or task for follow-up. Use when the user asks to note something, create a to-do, or when an action item surfaces during conversation.',
        parameters: {
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
      },
      {
        name: 'list_deals',
        description:
          'List all deals in the PE pipeline with their names, stages, companies, and IDs. Call this FIRST whenever the user mentions a deal, company, CIM, IC memo, or asks what\'s in the pipeline. Never search Drive for deal information — always check the deal database first.',
        parameters: {
          type: 'object',
          properties: {
            stage: {
              type: 'string',
              description: 'Filter by stage: SOURCING, SCREENING, IC_MEMO, CLOSED_WON, CLOSED_LOST (optional — omit for all)',
            },
          },
        },
      },
      {
        name: 'get_deal_status',
        description:
          'Get the full status of a specific deal: stage, uploaded documents, whether CIM analysis has been run, whether an IC memo exists, key findings, fit score, red flags, and next steps. Use this to answer questions like "what do we have on Nexus?", "did Alex finish the DD?", "does the Nexus memo exist?"',
        parameters: {
          type: 'object',
          properties: {
            dealId: { type: 'string', description: 'Deal ID from list_deals' },
          },
          required: ['dealId'],
        },
      },
      {
        name: 'create_deal',
        description:
          'Create a new deal in the PE pipeline. Use when the user wants to start tracking a new company or investment opportunity. Returns the deal ID needed for CIM analysis.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Deal or company name' },
            sector: { type: 'string', description: 'Industry sector (e.g. "SaaS", "Healthcare")' },
            dealSize: { type: 'string', description: 'Approximate deal size (e.g. "$50M–$100M")' },
            priority: { type: 'string', description: 'LOW, MEDIUM, or HIGH (default MEDIUM)' },
            notes: { type: 'string', description: 'Initial notes about the deal' },
          },
          required: ['name'],
        },
      },
      {
        name: 'move_deal_stage',
        description:
          'Move a deal to a different stage in the PE pipeline. Use when the user decides to advance or close a deal.',
        parameters: {
          type: 'object',
          properties: {
            dealId: { type: 'string', description: 'Deal ID' },
            stage: { type: 'string', description: 'Target stage: SOURCING, SCREENING, DILIGENCE, IC_MEMO, CLOSED_WON, CLOSED_LOST, ON_HOLD' },
            reason: { type: 'string', description: 'Reason for the stage change (optional)' },
          },
          required: ['dealId', 'stage'],
        },
      },
      {
        name: 'save_client_context',
        description:
          'Save client context (pain points, goals, budget signals) discovered during this voice session. Call proactively when new client intelligence surfaces — voice session discoveries are lost without this.',
        parameters: {
          type: 'object',
          properties: {
            clientId: { type: 'string', description: 'Client ID' },
            context: {
              type: 'object',
              properties: {
                summary: { type: 'string' },
                painPoints: { type: 'array', items: { type: 'string' } },
                goals: { type: 'array', items: { type: 'string' } },
                budgetSignal: { type: 'string' },
              },
            },
          },
          required: ['clientId', 'context'],
        },
      },
      {
        name: 'update_client_record',
        description:
          'Update a client record with new information learned during the voice session (industry, company size, website, notes).',
        parameters: {
          type: 'object',
          properties: {
            clientId: { type: 'string' },
            updates: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                industry: { type: 'string' },
                companySize: { type: 'string' },
                website: { type: 'string' },
                notes: { type: 'string' },
              },
            },
          },
          required: ['clientId', 'updates'],
        },
      },
      {
        name: 'save_stakeholder',
        description:
          'Save a stakeholder record for a client. Use when the user mentions a person\'s role, influence level, or relationship during a voice session.',
        parameters: {
          type: 'object',
          properties: {
            clientId: { type: 'string' },
            stakeholder: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                role: { type: 'string' },
                influence: { type: 'string', description: 'HIGH, MEDIUM, or LOW' },
                interest: { type: 'string', description: 'HIGH, MEDIUM, or LOW' },
                department: { type: 'string' },
                notes: { type: 'string' },
              },
            },
          },
          required: ['clientId', 'stakeholder'],
        },
      },
      {
        name: 'store_correction',
        description:
          'Permanently store a correction or style preference so it applies to all future outputs. Use when the user says "from now on always...", "never do X again", or "change how you write Y".',
        parameters: {
          type: 'object',
          properties: {
            agentKey: { type: 'string', description: 'Which agent: AGENT_ARIA, AGENT_DUE_DILIGENCE, AGENT_PRODUCT, AGENT_COMPETITIVE, AGENT_PROCESS, AGENT_STAKEHOLDER' },
            outputType: { type: 'string', description: 'Type of output (e.g. cim_analysis, memo_section, chat_response)' },
            instruction: { type: 'string', description: 'The specific rule to store' },
          },
          required: ['agentKey', 'outputType', 'instruction'],
        },
      },
    ],
  },
]

// ─── Google OAuth token helper ────────────────────────────────────────────────
// Looks up the user's stored encrypted tokens and returns a valid access token,
// refreshing if expired and persisting the refreshed tokens back to the DB.

async function getGoogleAccessToken(
  userId: string,
  provider: 'GMAIL' | 'GOOGLE_DRIVE'
): Promise<string> {
  const integration = await prisma.integration.findFirst({
    where: { userId, provider },
    select: { id: true, accessToken: true, refreshToken: true, expiresAt: true },
  })
  if (!integration) {
    throw new Error(`No ${provider} integration — user has not connected their Google account`)
  }
  return goog.getValidToken(
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

// ─── Cookie header parser ─────────────────────────────────────────────────────

function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 1) continue
    const key = part.slice(0, eq).trim()
    const val = part.slice(eq + 1).trim()
    try { out[key] = decodeURIComponent(val) } catch { out[key] = val }
  }
  return out
}

// ─── JWT verification ─────────────────────────────────────────────────────────

function extractUserId(token: string): string | null {
  try {
    const decoded = jwt.verify(token, env().JWT_SECRET) as { userId: string }
    return typeof decoded.userId === 'string' ? decoded.userId : null
  } catch {
    return null
  }
}

// ─── Buffer normalisation ─────────────────────────────────────────────────────

function toBuffer(raw: Buffer | ArrayBuffer | Buffer[]): Buffer {
  if (Buffer.isBuffer(raw)) return raw
  if (raw instanceof ArrayBuffer) return Buffer.from(raw)
  return Buffer.concat(raw)
}

// ─── Main handler — called once per WebSocket upgrade ────────────────────────

export async function handleAriaLiveWs(
  clientWs: WebSocket,
  request: IncomingMessage
): Promise<void> {
  // Parse URL params from the upgrade request
  const url = new URL(request.url ?? '/', `http://localhost`)
  const sessionId = url.searchParams.get('sessionId')
  // Accept token from query param (legacy) OR from httpOnly cookie (new auth)
  const cookies = parseCookieHeader(request.headers.cookie)
  const token = url.searchParams.get('token') ?? cookies['axis_token']
  // reconnect=true signals that prior conversation context should be loaded
  const isReconnect = url.searchParams.get('reconnect') === 'true'

  if (!sessionId || !token) {
    clientWs.close(4001, 'Missing sessionId or auth token')
    return
  }

  const userId = extractUserId(token)
  if (!userId) {
    clientWs.close(4003, 'Invalid or expired token')
    return
  }

  // Verify session ownership
  const session = await prisma.session.findFirst({
    where: { id: sessionId, userId },
  }).catch(() => null)

  if (!session) {
    clientWs.close(4004, 'Session not found')
    return
  }

  const geminiKey = env().GEMINI_API_KEY
  if (!geminiKey) {
    clientWs.close(4503, 'Gemini not configured on server')
    return
  }

  // Look up user name and voice preference for the system instruction
  let userName: string | null = null
  let voiceName = 'Aoede' // default
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, voiceName: true } })
    userName = user?.name ?? null
    voiceName = user?.voiceName ?? 'Aoede'
  } catch {
    // Non-critical — Aria still works without the name / falls back to default voice
  }

  // sendToClient is defined here — before any await — so the pre-setup error
  // handler below can reference it safely.
  const sendToClient = (payload: Record<string, unknown>): void => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(payload))
    }
  }

  // ─── Open server-side Gemini Live connection (parallel with config build) ──
  // Start TCP handshake immediately so it overlaps with memory assembly and
  // history load — saves ~300ms per connection on cold start.
  const geminiWs = new WebSocket(`${GEMINI_WS_URL}?key=${geminiKey}`)

  // Attach error handler BEFORE the first await.
  // Without this, any Gemini connection failure (bad API key, network error,
  // rate limit) during config build fires an unhandled 'error' event that
  // crashes the Node.js process.
  geminiWs.on('error', (err) => {
    console.error('[AriaLiveWS] Gemini connection error:', (err as Error).message)
    sendToClient({ type: 'error', message: 'Voice connection failed — Gemini error' })
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close(4503, 'Gemini error')
  })

  // Build config (memory-only, fast) + load history in parallel.
  // RAG preload is returned as a background Promise inside config — does NOT
  // block this await and will be injected after Gemini setup completes.
  const [config, rawMessages] = await Promise.all([
    aria.buildLiveSessionConfig(sessionId, userId, userName, session.clientId ?? null),
    (async () => {
      try {
        return await prisma.message.findMany({
          where: { sessionId },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { role: true, content: true },
        })
      } catch {
        return []
      }
    })(),
  ])

  let historyContext = ''
  if (rawMessages.length > 0) {
    const lines = rawMessages
      .reverse()
      .map((m) => `${m.role === 'USER' ? 'User' : 'Aria'}: ${m.content.slice(0, 500)}`)
      .join('\n')
    const label = isReconnect
      ? 'Conversation history (reconnected session — continue naturally):'
      : 'Recent conversation history:'
    historyContext = `\n\n${label}\n${lines}`
  }

  const systemInstructionText = config.systemInstruction + historyContext

  let geminiReady = false
  // Timestamp of the last audio frame received from the client. Used by the
  // silence injector to decide when to send keepalive audio to Gemini.
  let lastClientAudioMs = Date.now()

  // Queue client messages that arrive before Gemini setup completes.
  // Cap at 50 frames (~3 s of audio at 16 kHz / 4096 buffer) to avoid a
  // flood burst when setupComplete arrives after a slow Gemini handshake.
  const MAX_PENDING_FRAMES = 50
  const pendingFrames: Buffer[] = []

  // ─── Timer handles — declared with let so teardownTimers can reference them
  //     even though they are assigned after teardownTimers is defined. ─────────
  let silenceInjectorTimer: ReturnType<typeof setInterval> | null = null
  let sessionRotationTimer: ReturnType<typeof setTimeout> | null = null

  // ─── Server-side Gemini setup timeout ─────────────────────────────────────
  // If Gemini never acks the setup message within 20 s, close both sides so the
  // client can attempt an exponential-backoff reconnect rather than hanging.
  const GEMINI_SETUP_TIMEOUT = 20_000
  const geminiSetupTimer = setTimeout(() => {
    if (!geminiReady) {
      console.error('[AriaLiveWS] Gemini setup timeout — closing')
      sendToClient({ type: 'error', message: 'Gemini setup timeout' })
      geminiWs.close(1011, 'Setup timeout')
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close(4503, 'Gemini setup timeout')
    }
  }, GEMINI_SETUP_TIMEOUT)

  // ─── Keepalive — prevent proxy/firewall from dropping idle connections ────
  // Most reverse-proxies (nginx, ALB) close WebSocket connections idle for
  // > 60 s. We ping both legs every 20 s so silent pauses don't kill the
  // session. The browser's native WebSocket automatically responds with pong.
  const KEEPALIVE_INTERVAL = 20_000
  const keepaliveTimer = setInterval(() => {
    if (geminiWs.readyState === WebSocket.OPEN) geminiWs.ping()
    if (clientWs.readyState === WebSocket.OPEN) clientWs.ping()
  }, KEEPALIVE_INTERVAL)

  const teardownTimers = (): void => {
    clearTimeout(geminiSetupTimer)
    clearInterval(keepaliveTimer)
    if (silenceInjectorTimer) clearInterval(silenceInjectorTimer)
    if (sessionRotationTimer) clearTimeout(sessionRotationTimer)
  }

  // ─── Gemini → client ──────────────────────────────────────────────────────

  // Send the BidiGenerateContent setup message.
  // Since the WS was opened before config built, it may already be OPEN by now
  // (TCP was faster than memory assembly). Handle both states.
  const sendGeminiSetup = (): void => {
    geminiWs.send(JSON.stringify({
      setup: {
        model: `models/${config.model}`,
        generationConfig: {
          responseModalities: ['audio'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          thinkingConfig: { thinkingLevel: 'minimal' },
        },
        systemInstruction: {
          parts: [{ text: systemInstructionText }],
        },
        tools: GEMINI_LIVE_TOOLS,
      },
    }))
  }

  if (geminiWs.readyState === WebSocket.OPEN) {
    sendGeminiSetup()
  } else {
    geminiWs.on('open', sendGeminiSetup)
  }

  geminiWs.on('message', async (rawData) => {
    try {
    const buf = toBuffer(rawData as Buffer | ArrayBuffer | Buffer[])
    let data: Record<string, unknown>

    try {
      data = JSON.parse(buf.toString('utf8')) as Record<string, unknown>
    } catch {
      // Non-JSON binary frame — forward as-is so the client can handle it
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(buf)
      }
      return
    }

    // ── Setup acknowledgement ─────────────────────────────────────────────
    if ('setupComplete' in data) {
      clearTimeout(geminiSetupTimer)
      geminiReady = true
      console.info(`[AriaLiveWS] Gemini ready — session=${sessionId} voice=${voiceName} model=${config.model}`)
      sendToClient({ type: 'ready' })

      // ── Async RAG context injection ──────────────────────────────────────
      // RAG preload was started in buildLiveSessionConfig() and has been
      // running in the background during setup. Inject it now — typically
      // arrives 200–800ms after this point, well before the first knowledge
      // question. Simple greetings get answered immediately without waiting.
      void config.ragPreload.then((ragCtx) => {
        if (ragCtx && geminiWs.readyState === WebSocket.OPEN) {
          geminiWs.send(JSON.stringify({
            clientContent: {
              turns: [{ role: 'user', parts: [{ text: `BACKGROUND CONTEXT — relevant knowledge for this session:\n${ragCtx}` }] }],
              turnComplete: true,
            },
          }))
          console.info('[AriaLiveWS] RAG context injected asynchronously')
        }
      })

      // ── Silence injector ────────────────────────────────────────────────
      // Gemini Live drops the session if it receives no audio activity. When
      // the user's mic is off (or silent), send periodic PCM silence so Gemini
      // never sees an idle stream.
      silenceInjectorTimer = setInterval(() => {
        if (geminiWs.readyState !== WebSocket.OPEN) return
        if (Date.now() - lastClientAudioMs > SILENCE_INJECT_AFTER_MS) {
          geminiWs.send(SILENCE_PAYLOAD)
        }
      }, SILENCE_CHECK_INTERVAL)

      // ── Session rotation ─────────────────────────────────────────────────
      // Gemini Live sessions hard-expire at 15 min. Warn the client at 14 min
      // so it can reconnect gracefully (with history) before Gemini cuts us off.
      sessionRotationTimer = setTimeout(() => {
        console.log('[AriaLiveWS] 9-min limit approaching — triggering session rotation')
        sendToClient({ type: 'session_rotate' })
        // Give the client 5 s to acknowledge and reconnect before we close.
        setTimeout(() => {
          teardownTimers()
          if (geminiWs.readyState === WebSocket.OPEN) geminiWs.close(1000, 'Session rotation')
          if (clientWs.readyState === WebSocket.OPEN) clientWs.close(4010, 'Session rotation')
        }, 5_000)
      }, SESSION_ROTATION_MS)

      // Flush any audio frames that arrived while we were setting up
      for (const frame of pendingFrames) {
        if (geminiWs.readyState === WebSocket.OPEN) {
          geminiWs.send(frame)
        }
      }
      pendingFrames.length = 0
      return
    }

    // ── Tool / function calls from Gemini ─────────────────────────────────
    // All tools run fire-and-forget: Gemini receives an immediate toolResponse
    // so it can keep talking, and real results are injected as clientContent
    // turns when they arrive. This ensures zero silence during tool execution.
    const toolCall = data['toolCall'] as Record<string, unknown> | undefined
    if (toolCall) {
      const functionCalls = toolCall['functionCalls'] as Array<Record<string, unknown>> | undefined
      if (functionCalls && functionCalls.length > 0) {
        // Sync tools (write operations) still await before telling Gemini — keeps
        // confirmation accurate. Everything else runs in background.
        const SYNC_TOOLS = new Set(['book_meeting', 'create_task', 'delegate_to_agent'])
        const SYNC_TOOL_TIMEOUT_MS = 30_000

        // Background tools: respond to Gemini immediately, inject result later.
        // Cache key TTL = 5 min so repeat questions in the same session are instant.
        const BG_TOOL_TIMEOUT_MS = 15_000
        const BG_TOOL_ANNOUNCE: Record<string, string> = {
          search_knowledge_base: 'Searching the knowledge base in the background.',
          get_graph_context:     'Looking up the knowledge graph in the background.',
          search_gmail:          'Checking your emails in the background.',
          read_email:            'Reading that email in the background.',
          search_google_drive:   'Searching your Drive in the background.',
          read_drive_document:   'Reading that document in the background.',
          web_search:            'Running a web search in the background.',
        }

        void (async () => {
          const functionResponses: Array<Record<string, unknown>> = []

          for (const fc of functionCalls) {
            const name = fc['name'] as string
            const callId = fc['id'] as string
            const args = (fc['args'] ?? {}) as Record<string, unknown>

            sendToClient({ type: 'tool_start', tool: name })
            console.log(`[AriaLiveWS] Tool start: ${name}`)

            // ── Background (fire-and-forget) tools ──────────────────────────
            if (!SYNC_TOOLS.has(name)) {
              // Respond to Gemini immediately so it keeps talking
              functionResponses.push({
                id: callId,
                name,
                response: { output: BG_TOOL_ANNOUNCE[name] ?? 'Looking that up in the background.' },
              })

              // Build the execution promise for this tool
              const bgExec: Promise<unknown> =
                name === 'search_gmail'
                  ? (async () => {
                      const token = await getGoogleAccessToken(userId, 'GMAIL')
                      const messages = await goog.searchMessages(
                        token,
                        args['query'] as string,
                        (args['maxResults'] as number | undefined) ?? 5
                      )
                      return { messages }
                    })()
                  : name === 'read_email'
                  ? (async () => {
                      const token = await getGoogleAccessToken(userId, 'GMAIL')
                      return await goog.readMessage(token, args['messageId'] as string)
                    })()
                  : name === 'search_google_drive'
                  ? (async () => {
                      const token = await getGoogleAccessToken(userId, 'GOOGLE_DRIVE')
                      return await goog.listFiles(token, {
                        query: args['query'] as string,
                        pageSize: (args['maxResults'] as number | undefined) ?? 5,
                      })
                    })()
                  : name === 'read_drive_document'
                  ? (async () => {
                      const token = await getGoogleAccessToken(userId, 'GOOGLE_DRIVE')
                      const fileId = args['fileId'] as string
                      const metadata = await goog.getFileMetadata(token, fileId)
                      const { content: buf, contentType } = await goog.downloadFileAuto(token, fileId, metadata.mimeType)
                      const parser = getParser(contentType)
                      if (parser) {
                        const parsed = await parser.parse(buf, metadata.name)
                        return {
                          content: parsed.text.slice(0, 10_000),
                          name: metadata.name,
                          sections: parsed.sections.length,
                          wordCount: parsed.metadata.wordCount,
                        }
                      }
                      return { content: buf.toString('utf8').slice(0, 10_000), name: metadata.name }
                    })()
                  : (async () => {
                      const toolContext = {
                        sessionId,
                        userId,
                        clientId: session.clientId ?? '',
                        requestId: `live-bg-${callId}`,
                      }
                      const toolResult = await aria.executeTool(name, args, toolContext)
                      return toolResult.success ? toolResult.data : { error: toolResult.error }
                    })()

              // Run in background with Redis caching (5-min TTL per session)
              void (async () => {
                try {
                  const cacheKey = `aria:live:${sessionId}:${name}:${createHash('md5').update(JSON.stringify(args)).digest('hex')}`
                  const cached = await redis.get(cacheKey).catch(() => null)

                  let bgResult: unknown
                  if (cached) {
                    bgResult = JSON.parse(cached)
                    console.log(`[AriaLiveWS] Tool cache hit: ${name}`)
                  } else {
                    bgResult = await Promise.race([
                      bgExec,
                      new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error(`Background tool "${name}" timed out`)), BG_TOOL_TIMEOUT_MS)
                      ),
                    ])
                    await redis.setex(cacheKey, 300, JSON.stringify(bgResult)).catch(() => {})
                  }

                  sendToClient({ type: 'tool_result', tool: name })
                  console.log(`[AriaLiveWS] Background tool complete: ${name}`)

                  if (geminiWs.readyState === WebSocket.OPEN) {
                    const resultText = JSON.stringify(bgResult).slice(0, 3000)
                    geminiWs.send(JSON.stringify({
                      clientContent: {
                        turns: [{
                          role: 'user',
                          parts: [{
                            text: `BACKGROUND RESULT — ${name}:\n${resultText}\n\nWeave this into the conversation naturally. If Nicolas just asked about this topic, address it now. If the conversation has moved on, wait for a natural pause and mention it briefly. If the result is empty or unhelpful, skip it.`,
                          }],
                        }],
                        turnComplete: true,
                      },
                    }))
                  }
                } catch (bgErr) {
                  const msg = bgErr instanceof Error ? bgErr.message : 'Unknown'
                  console.error(`[AriaLiveWS] Background tool error (${name}):`, msg)
                  sendToClient({ type: 'tool_result', tool: name })
                  // No injection — Aria already answered from existing context
                }
              })()

              continue // placeholder already pushed; move to next tool call
            }
            // ── End background tools ──────────────────────────────────────

            // ── Synchronous tools (write operations — await before confirming) ─
            const syncTimeout = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Tool "${name}" timed out after 30 s`)), SYNC_TOOL_TIMEOUT_MS)
            )

            const AGENT_DISPLAY: Record<string, string> = {
              product: 'Sean', competitive: 'Mel', process: 'Kevin', stakeholder: 'Anjie',
            }

            let result: unknown
            try {
              const exec: Promise<unknown> =
                name === 'delegate_to_agent'
                  ? (async () => {
                      const workerType = args['workerType'] as 'product' | 'process' | 'competitive' | 'stakeholder'
                      const query = args['query'] as string
                      const agentName = AGENT_DISPLAY[workerType] ?? workerType

                      void (async () => {
                        try {
                          const delegationContext = await aria.buildDelegationContext(
                            sessionId,
                            userId,
                            session.clientId ?? null,
                            query
                          )
                          const agentResult = await aria.delegate(workerType, query, delegationContext)
                          if (geminiWs.readyState === WebSocket.OPEN) {
                            geminiWs.send(JSON.stringify({
                              clientContent: {
                                turns: [{
                                  role: 'user',
                                  parts: [{ text: `${agentName} has completed the analysis. Results:\n\n${agentResult.content.slice(0, 3000)}\n\nPlease summarise the key findings for me concisely.` }],
                                }],
                                turnComplete: true,
                              },
                            }))
                          }
                        } catch (bgErr) {
                          const msg = bgErr instanceof Error ? bgErr.message : 'Unknown error'
                          if (geminiWs.readyState === WebSocket.OPEN) {
                            geminiWs.send(JSON.stringify({
                              clientContent: {
                                turns: [{
                                  role: 'user',
                                  parts: [{ text: `${agentName} encountered an issue: ${msg}. Please let the user know.` }],
                                }],
                                turnComplete: true,
                              },
                            }))
                          }
                        }
                      })()

                      return {
                        status: 'delegating',
                        agent: agentName,
                        message: `${agentName} is now working on this. I'll share the results as soon as they're ready — usually about a minute.`,
                      }
                    })()
                  : name === 'book_meeting'
                  ? (async () => {
                      const token = await getGoogleAccessToken(userId, 'GOOGLE_DRIVE')
                      const startTime = new Date(args['dateTime'] as string)
                      const durationMs = ((args['durationMinutes'] as number | undefined) ?? 60) * 60_000
                      const endTime = new Date(startTime.getTime() + durationMs)
                      const attendeeEmails = (args['attendees'] as string[] | undefined) ?? []
                      const calResponse = await fetch(
                        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
                        {
                          method: 'POST',
                          headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            summary: args['title'] as string,
                            start: { dateTime: startTime.toISOString(), timeZone: 'UTC' },
                            end: { dateTime: endTime.toISOString(), timeZone: 'UTC' },
                            attendees: attendeeEmails.map((email) => ({ email })),
                          }),
                        }
                      )
                      if (!calResponse.ok) {
                        throw new Error(`Calendar API error: ${calResponse.status} ${await calResponse.text()}`)
                      }
                      const event = await calResponse.json() as { id: string; htmlLink: string; summary: string }
                      return { eventId: event.id, link: event.htmlLink, title: event.summary }
                    })()
                  : (async () => {
                      // create_task and any other sync tools
                      const title = args['title'] as string
                      const description = (args['description'] as string | undefined) ?? ''
                      const priority = (args['priority'] as string | undefined) ?? 'MEDIUM'
                      const dueDate = (args['dueDate'] as string | undefined) ?? null
                      await prisma.message.create({
                        data: {
                          sessionId,
                          role: 'SYSTEM',
                          content: `Task: ${title}${description ? `\n${description}` : ''}`,
                          mode: 'task',
                          metadata: { priority, dueDate, createdByAria: true },
                        },
                      })
                      return { status: 'created', title, priority }
                    })()

              result = await Promise.race([exec, syncTimeout])
              console.log(`[AriaLiveWS] Sync tool complete: ${name}`)
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Tool execution failed'
              console.error(`[AriaLiveWS] Sync tool error (${name}):`, msg)
              result = { error: msg }
            }

            sendToClient({ type: 'tool_result', tool: name, result })
            functionResponses.push({
              id: callId,
              name,
              response: { output: JSON.stringify(result) },
            })
          }

          if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(JSON.stringify({ toolResponse: { functionResponses } }))
          }
        })().catch((err: unknown) => {
          console.error('[AriaLiveWS] Unhandled tool execution error:', err instanceof Error ? err.message : err)
        })

        return // handler returns immediately — audio keeps flowing
      }
    }

    // ── Log first meaningful Gemini response for debugging ───────────────
    {
      const sc = data['serverContent'] as Record<string, unknown> | undefined
      if (sc) {
        const hasAudio    = !!(sc['modelTurn'] as Record<string, unknown> | undefined)?.['parts']
        const hasTurnEnd  = !!sc['turnComplete']
        const hasTranscript = !!(sc['inputTranscription'] as Record<string, unknown> | undefined)?.['text']
        if (hasAudio || hasTurnEnd || hasTranscript) {
          console.info(`[AriaLiveWS] Gemini response — transcript=${hasTranscript} audio=${hasAudio} turnComplete=${hasTurnEnd}`)
        }
      }
    }

    // ── Persist voice transcript ──────────────────────────────────────────
    // Save user speech transcripts and Aria text responses so they survive
    // reconnects and appear in the session history on the dashboard.
    const serverContent = data['serverContent'] as Record<string, unknown> | undefined
    if (serverContent) {
      const inputTranscription = serverContent['inputTranscription'] as Record<string, unknown> | undefined
      const inputText = inputTranscription?.['text'] as string | undefined
      if (inputText?.trim()) {
        void prisma.message.create({
          data: { sessionId, role: 'USER', content: inputText.trim(), mode: 'voice', metadata: {} },
        }).catch(() => { /* non-critical */ })
      }

      const outputTranscription = serverContent['outputTranscription'] as Record<string, unknown> | undefined
      const outputText = outputTranscription?.['text'] as string | undefined
      if (outputText?.trim()) {
        void prisma.message.create({
          data: { sessionId, role: 'ASSISTANT', content: outputText.trim(), mode: 'voice', metadata: {} },
        }).catch(() => { /* non-critical */ })
      }
    }

    // ── Strip thinking tokens before relaying to client ──────────────────
    // Gemini 2.5 Flash emits internal reasoning as parts with thought:true.
    // These must never reach the client — they'd be read aloud in voice mode.
    let outbuf = buf
    const serverContentRelay = data['serverContent'] as Record<string, unknown> | undefined
    if (serverContentRelay) {
      const modelTurnRelay = serverContentRelay['modelTurn'] as Record<string, unknown> | undefined
      if (modelTurnRelay) {
        const partsRelay = modelTurnRelay['parts'] as Array<Record<string, unknown>> | undefined
        if (partsRelay) {
          const realParts = partsRelay.filter((p) => !p['thought'])
          if (realParts.length === 0 && partsRelay.length > 0) {
            // Message contains only thinking tokens — drop it entirely
            return
          }
          if (realParts.length !== partsRelay.length) {
            // Mix of real and thinking parts — rebuild without the thinking ones
            const filtered = {
              ...data,
              serverContent: {
                ...serverContentRelay,
                modelTurn: { ...modelTurnRelay, parts: realParts },
              },
            }
            outbuf = Buffer.from(JSON.stringify(filtered))
          }
        }
      }
    }

    // ── All other Gemini messages → relay to client ───────────────────────
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(outbuf)
    }
    } catch (err) {
      console.error('[AriaLiveWS] Unhandled error in Gemini message handler:', err instanceof Error ? err.message : err)
    }
  })

  geminiWs.on('error', (err) => {
    teardownTimers()
    const msg = err.message || 'Gemini connection error'
    console.error('[AriaLiveWS] Gemini error:', msg)
    sendToClient({ type: 'error', message: msg })
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, msg.slice(0, 123))
    }
  })

  geminiWs.on('close', (code, reason) => {
    teardownTimers()
    const reasonStr = reason?.toString() ?? ''
    console.error(`[AriaLiveWS] Gemini closed — code=${code} reason="${reasonStr}"`)
    const clientMsg = reasonStr
      ? `Gemini closed: ${reasonStr} (${code})`
      : `Gemini disconnected (code ${code})`
    sendToClient({ type: 'error', message: clientMsg })
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, clientMsg.slice(0, 123))
    }
  })

  // ─── Client → Gemini ──────────────────────────────────────────────────────

  // Maximum bytes in Gemini's WS send buffer before we drop audio frames.
  // Prevents unbounded queue build-up when the Gemini connection is slow.
  const GEMINI_BACKPRESSURE_LIMIT = 131_072 // 128 KB

  clientWs.on('message', (rawData) => {
    const frame = toBuffer(rawData as Buffer | ArrayBuffer | Buffer[])

    // Swallow client heartbeat pings — they must not reach Gemini.
    // Small messages only (< 50 bytes) so we avoid touching audio frames.
    if (frame.length < 50) {
      try {
        const parsed = JSON.parse(frame.toString('utf8')) as Record<string, unknown>
        if (parsed['type'] === 'heartbeat') return
      } catch { /* not JSON — fall through */ }
    }

    // Track the last time we received client audio so the silence injector
    // knows when to kick in.
    lastClientAudioMs = Date.now()

    if (!geminiReady) {
      // Gemini is still setting up — queue audio frames (drop oldest if full)
      if (pendingFrames.length >= MAX_PENDING_FRAMES) pendingFrames.shift()
      pendingFrames.push(frame)
      return
    }

    if (geminiWs.readyState === WebSocket.OPEN) {
      // Backpressure: drop frames when Gemini's send buffer is building up.
      // This prevents audio pile-up during slow Gemini responses.
      if (geminiWs.bufferedAmount > GEMINI_BACKPRESSURE_LIMIT) {
        return
      }
      geminiWs.send(frame)
    }
  })

  clientWs.on('close', () => {
    teardownTimers()
    if (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING) {
      geminiWs.close(1000)
    }
    // Log disconnect — history is always loaded on reconnect via historyContext
    console.info(`[AriaLiveWS] Client disconnected — session=${sessionId}`)
  })

  clientWs.on('error', (err) => {
    teardownTimers()
    console.error('[AriaLiveWS] Client error:', err.message)
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.close(1011)
    }
  })
}
