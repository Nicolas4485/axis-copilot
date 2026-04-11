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

  // ─── Open server-side Gemini Live connection ──────────────────────────────

  const geminiWs = new WebSocket(`${GEMINI_WS_URL}?key=${geminiKey}`)

  let geminiReady = false
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

  // ─── Keepalive — prevent Gemini from dropping idle connections ────────────
  // Gemini Live closes idle WebSocket sessions. A WebSocket-level ping every
  // 30 s keeps the TCP/TLS session alive during silent pauses.
  const KEEPALIVE_INTERVAL = 30_000
  const keepaliveTimer = setInterval(() => {
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.ping()
    }
  }, KEEPALIVE_INTERVAL)

  const teardownTimers = (): void => {
    clearTimeout(geminiSetupTimer)
    clearInterval(keepaliveTimer)
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
          parts: [{ text: config.systemInstruction }],
        },
        tools: GEMINI_LIVE_TOOLS,
      },
    }))
  })

  geminiWs.on('message', async (rawData) => {
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
    const toolCall = data['toolCall'] as Record<string, unknown> | undefined
    if (toolCall) {
      const functionCalls = toolCall['functionCalls'] as Array<Record<string, unknown>> | undefined
      if (functionCalls && functionCalls.length > 0) {
        const functionResponses: Array<Record<string, unknown>> = []

        for (const fc of functionCalls) {
          const name = fc['name'] as string
          const callId = fc['id'] as string
          const args = (fc['args'] ?? {}) as Record<string, unknown>

          // Notify the client that a tool is running
          sendToClient({ type: 'tool_start', tool: name })

          let result: unknown
          try {
            if (name === 'delegate_to_agent') {
              // Custom delegation path — calls a specialist agent
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
              result = {
                status: 'completed',
                agent: workerType,
                summary: agentResult.content.slice(0, 1000),
              }
            } else {
              // Direct tool execution via ToolRegistry
              const toolContext = {
                sessionId,
                userId,
                clientId: session.clientId ?? '',
                requestId: `live-${callId}`,
              }
              const toolResult = await aria.executeTool(name, args, toolContext)
              result = toolResult.success ? toolResult.data : { error: toolResult.error }
            }
          } catch (err) {
            result = { error: err instanceof Error ? err.message : 'Tool execution failed' }
          }

          sendToClient({ type: 'tool_result', tool: name, result })

          functionResponses.push({
            id: callId,
            name,
            response: { output: JSON.stringify(result) },
          })
        }

        // Return all results to Gemini in one message
        if (geminiWs.readyState === WebSocket.OPEN) {
          geminiWs.send(JSON.stringify({
            toolResponse: { functionResponses },
          }))
        }
        return
      }
    }

    // ── All other Gemini messages → relay to client ───────────────────────
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(buf)
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

  geminiWs.on('close', (code) => {
    teardownTimers()
    console.log(`[AriaLiveWS] Gemini closed (${code})`)
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, 'Gemini connection closed')
    }
  })

  // ─── Client → Gemini ──────────────────────────────────────────────────────

  clientWs.on('message', (rawData) => {
    const frame = toBuffer(rawData as Buffer | ArrayBuffer | Buffer[])

    if (!geminiReady) {
      // Gemini is still setting up — queue audio frames (drop oldest if full)
      if (pendingFrames.length >= MAX_PENDING_FRAMES) pendingFrames.shift()
      pendingFrames.push(frame)
      return
    }

    if (geminiWs.readyState === WebSocket.OPEN) {
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
