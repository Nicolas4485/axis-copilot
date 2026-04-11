// aria-live-ws.ts — Server-side WebSocket proxy for Gemini Live
//
// SEC-1 fix: the Gemini API key never leaves the server.
// Frontend connects to ws(s)://api/api/aria/live?sessionId=xxx&token=jwt
// This handler authenticates the connection, opens a server-side Gemini Live
// WebSocket, and proxies audio/video/text both ways.
//
// When Gemini issues a function_call the handler executes the tool server-side
// via the existing ToolRegistry and sends the result back as a toolResponse.

import type { IncomingMessage } from 'http'
import WebSocket from 'ws'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { Aria } from '@axis/agents'
import { InferenceEngine } from '@axis/inference'

const GEMINI_WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'

// Gemini Live sessions have a hard 15-minute limit. We rotate at 14 min so the
// client can reconnect with fresh context before Gemini closes the session.
const SESSION_ROTATION_MS = 14 * 60_000

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
          'Delegate deep analysis to a specialist agent. Sean=product, Kevin=process, Mel=competitive, Anjie=stakeholder. Use when the user asks for expert analysis beyond your immediate knowledge.',
        parameters: {
          type: 'object',
          properties: {
            workerType: {
              type: 'string',
              enum: ['product', 'process', 'competitive', 'stakeholder'],
              description: 'Which specialist agent to use',
            },
            query: { type: 'string', description: 'The analysis request' },
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
    ],
  },
]

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
  const token = url.searchParams.get('token')
  // reconnect=true signals that prior conversation context should be loaded
  const isReconnect = url.searchParams.get('reconnect') === 'true'

  if (!sessionId || !token) {
    clientWs.close(4001, 'Missing sessionId or token')
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

  // Look up user name for the system instruction
  let userName: string | null = null
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
    userName = user?.name ?? null
  } catch {
    // Non-critical — Aria still works without the name
  }

  // Build Aria's system instruction (memory + RAG + user identity)
  const config = await aria.buildLiveSessionConfig(sessionId, userId, userName)

  // ─── Load recent conversation history ─────────────────────────────────────
  // Always load the last 10 messages so Gemini has context even on fresh
  // connections. On reconnect this is essential for continuity.
  let historyContext = ''
  try {
    const recentMessages = await prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { role: true, content: true },
    })
    if (recentMessages.length > 0) {
      const lines = recentMessages
        .reverse()
        .map((m) => `${m.role === 'USER' ? 'User' : 'Aria'}: ${m.content.slice(0, 500)}`)
        .join('\n')
      const label = isReconnect
        ? 'Conversation history (reconnected session — continue naturally):'
        : 'Recent conversation history:'
      historyContext = `\n\n${label}\n${lines}`
    }
  } catch {
    // Non-critical — session works without history
  }

  const systemInstructionText = config.systemInstruction + historyContext

  // ─── Open server-side Gemini Live connection ──────────────────────────────

  const geminiWs = new WebSocket(`${GEMINI_WS_URL}?key=${geminiKey}`)

  let geminiReady = false
  // Timestamp of the last audio frame received from the client. Used by the
  // silence injector to decide when to send keepalive audio to Gemini.
  let lastClientAudioMs = Date.now()

  // Queue client messages that arrive before Gemini setup completes.
  // Cap at 50 frames (~3 s of audio at 16 kHz / 4096 buffer) to avoid a
  // flood burst when setupComplete arrives after a slow Gemini handshake.
  const MAX_PENDING_FRAMES = 50
  const pendingFrames: Buffer[] = []

  const sendToClient = (payload: Record<string, unknown>): void => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(payload))
    }
  }

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

  geminiWs.on('open', () => {
    // Send the BidiGenerateContent setup message
    geminiWs.send(JSON.stringify({
      setup: {
        model: `models/${config.model}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
          },
        },
        systemInstruction: {
          // Inject conversation history so Gemini has context from the start,
          // including after reconnects caused by the session rotation.
          parts: [{ text: systemInstructionText }],
        },
        tools: GEMINI_LIVE_TOOLS,
      },
    }))
  })

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
      sendToClient({ type: 'ready' })

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
        console.log('[AriaLiveWS] 14-min limit approaching — triggering session rotation')
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
    // Tools run asynchronously (fire-and-forget) so this message handler
    // returns immediately. Audio frames from Gemini keep flowing to the
    // client while tools execute; results are sent back when they complete.
    const toolCall = data['toolCall'] as Record<string, unknown> | undefined
    if (toolCall) {
      const functionCalls = toolCall['functionCalls'] as Array<Record<string, unknown>> | undefined
      if (functionCalls && functionCalls.length > 0) {
        const TOOL_TIMEOUT_MS = 30_000 // hard cap per tool call

        void (async () => {
          const functionResponses: Array<Record<string, unknown>> = []

          for (const fc of functionCalls) {
            const name = fc['name'] as string
            const callId = fc['id'] as string
            const args = (fc['args'] ?? {}) as Record<string, unknown>

            sendToClient({ type: 'tool_start', tool: name })
            console.log(`[AriaLiveWS] Tool start: ${name}`)

            const timeout = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Tool "${name}" timed out after 30 s`)), TOOL_TIMEOUT_MS)
            )

            let result: unknown
            try {
              const exec: Promise<unknown> =
                name === 'delegate_to_agent'
                  ? (async () => {
                      const workerType = args['workerType'] as 'product' | 'process' | 'competitive' | 'stakeholder'
                      const query = args['query'] as string
                      const delegationContext = {
                        sessionId,
                        clientId: session.clientId,
                        userId,
                        assembledContext: '',
                        ragResult: null as never,
                        stakeholders: [],
                        clientRecord: null,
                      }
                      const agentResult = await aria.delegate(workerType, query, delegationContext)
                      return {
                        status: 'completed',
                        agent: workerType,
                        summary: agentResult.content.slice(0, 1000),
                      }
                    })()
                  : (async () => {
                      const toolContext = {
                        sessionId,
                        userId,
                        clientId: session.clientId ?? '',
                        requestId: `live-${callId}`,
                      }
                      const toolResult = await aria.executeTool(name, args, toolContext)
                      return toolResult.success ? toolResult.data : { error: toolResult.error }
                    })()

              result = await Promise.race([exec, timeout])
              console.log(`[AriaLiveWS] Tool complete: ${name}`)
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Tool execution failed'
              console.error(`[AriaLiveWS] Tool error (${name}):`, msg)
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

    // ── Persist voice transcript ──────────────────────────────────────────
    // Save user speech transcripts and Aria text responses so they survive
    // reconnects and appear in the session history on the dashboard.
    const serverContent = data['serverContent'] as Record<string, unknown> | undefined
    if (serverContent) {
      const inputTranscript = serverContent['inputTranscript'] as string | undefined
      if (inputTranscript?.trim()) {
        void prisma.message.create({
          data: { sessionId, role: 'USER', content: inputTranscript.trim(), mode: 'voice', metadata: {} },
        }).catch(() => { /* non-critical */ })
      }

      const modelTurn = serverContent['modelTurn'] as Record<string, unknown> | undefined
      const parts = modelTurn?.['parts'] as Array<Record<string, unknown>> | undefined
      if (parts) {
        const textParts = parts
          .filter((p) => typeof p['text'] === 'string' && (p['text'] as string).trim())
          .map((p) => p['text'] as string)
        if (textParts.length > 0) {
          void prisma.message.create({
            data: { sessionId, role: 'ASSISTANT', content: textParts.join(''), mode: 'voice', metadata: {} },
          }).catch(() => { /* non-critical */ })
        }
      }
    }

    // ── All other Gemini messages → relay to client ───────────────────────
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(buf)
    }
    } catch (err) {
      console.error('[AriaLiveWS] Unhandled error in Gemini message handler:', err instanceof Error ? err.message : err)
    }
  })

  geminiWs.on('error', (err) => {
    teardownTimers()
    console.error('[AriaLiveWS] Gemini error:', err.message)
    sendToClient({ type: 'error', message: 'Gemini connection error' })
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, 'Gemini error')
    }
  })

  geminiWs.on('close', (code, reason) => {
    teardownTimers()
    const reasonStr = reason?.toString() ?? ''
    console.log(`[AriaLiveWS] Gemini closed — code=${code} reason="${reasonStr}"`)
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, 'Gemini connection closed')
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
  })

  clientWs.on('error', (err) => {
    teardownTimers()
    console.error('[AriaLiveWS] Client error:', err.message)
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.close(1011)
    }
  })
}
