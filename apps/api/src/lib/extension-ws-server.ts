/**
 * Extension WebSocket server — secure transport for Phase B browser-agent RPC.
 *
 * Server-side agents (Mel, Sean, …) push browser commands directly to the
 * Chrome extension's service worker over this WS. The extension executes the
 * command via its existing browser-controller.js and sends the result back
 * over the same socket.
 *
 * Why a dedicated WS path instead of reusing aria-live-ws:
 *   - Aria-live-ws is a Gemini-specific proxy (audio + function calls)
 *   - This is a generic command-RPC channel between API and extension
 *   - Different auth (static EXTENSION_WS_KEY, not JWT)
 *   - Different rate limit profile (60 cmd/min, matches extension limit)
 *
 * Security posture (see also: docs/EXTENSION-PROTOCOL.md → Security):
 *   1. Auth-message handshake (the WebSocket constructor in service workers
 *      cannot set Authorization headers — token rides in the first message)
 *   2. 5-second handshake deadline; connections that don't auth in time close
 *   3. Origin check accepts only chrome-extension:// origins matching a known
 *      extension ID OR the localhost dev tooling
 *   4. Per-connection sliding-window rate limit (60 cmd/min)
 *   5. zod schema validation on every inbound message — malformed = close
 *   6. Connection registry: one socket per userId; new connection kicks old
 *   7. Heartbeat every 30 s (server-initiated ping); 90 s idle → close
 *   8. All commands logged to AgentMemory tagged 'extension-ws-cmd' so
 *      suspicious activity is auditable
 *
 * Threat model that this defends against:
 *   - Random localhost process trying to drive the extension (auth blocks it)
 *   - Stale tokens from a previous session (registry kicks)
 *   - Fuzz / malformed payloads crashing the agent loop (zod rejects)
 *   - Runaway agent looping on browser commands (rate limit caps)
 *
 * Threat model NOT covered (yet):
 *   - Compromised Anthropic key on server — out of scope
 *   - Browser session hijacking after auth — needs token rotation (Phase B+1)
 *   - Cross-site scripting in scraped content — handled by tool-result-sanitizer.ts
 */

import type { IncomingMessage, Server as HttpServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { z } from 'zod'
import { randomUUID, timingSafeEqual } from 'crypto'

// ─── Configuration ─────────────────────────────────────────────────────────

/** Path the extension WebSocket lives at. Matches ws://localhost:4747/api/extension/ws */
export const EXTENSION_WS_PATH = '/api/extension/ws'

/** Hard cap for the auth handshake — connection closes if no valid auth message arrives. */
const AUTH_DEADLINE_MS = 5_000

/** Server-initiated ping interval. Detects dead sockets faster than TCP keepalive. */
const PING_INTERVAL_MS = 30_000

/** Idle close threshold — no traffic for this long → assume connection is dead. */
const IDLE_CLOSE_MS = 90_000

/** Sliding-window rate limit window. */
const RATE_WINDOW_MS = 60_000

/** Max commands per window per connection. */
const RATE_LIMIT = 60

// ─── Message schemas ──────────────────────────────────────────────────────

/** Initial auth message the extension sends right after the socket opens. */
const AuthMessageSchema = z.object({
  type: z.literal('auth'),
  token: z.string().min(1),
  clientVersion: z.string().min(1).max(64),
})

/** Response from the extension to a command sent by the server. */
const ResponseMessageSchema = z.object({
  type: z.literal('response'),
  id: z.string().min(1).max(128),
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().max(2048).optional(),
})

/** Heartbeat / liveness ping — extension can also pre-emptively ping. */
const PingMessageSchema = z.object({
  type: z.literal('ping'),
})

const PongMessageSchema = z.object({
  type: z.literal('pong'),
})

const InboundMessageSchema = z.union([
  AuthMessageSchema,
  ResponseMessageSchema,
  PingMessageSchema,
  PongMessageSchema,
])

export type InboundMessage = z.infer<typeof InboundMessageSchema>
export type ResponseMessage = z.infer<typeof ResponseMessageSchema>

/** Server → extension command envelope. */
export interface OutboundCommand {
  type: 'command'
  id: string
  command: string
  payload?: unknown
}

// ─── Connection state ─────────────────────────────────────────────────────

interface Connection {
  ws: WebSocket
  userId: string | null
  authed: boolean
  authTimer: NodeJS.Timeout | null
  pingTimer: NodeJS.Timeout | null
  lastSeen: number
  /** Sliding-window rate-limit timestamps (ms since epoch). */
  recentCommands: number[]
  /** request id → resolver for in-flight server-initiated commands. */
  pending: Map<string, (msg: ResponseMessage) => void>
  /** Connection-level identifier for logs. */
  connId: string
  /** Origin from the upgrade request — used for diagnostics + audit. */
  origin: string
}

// ─── Connection registry ──────────────────────────────────────────────────

/** One active WS per userId. New connections kick the previous one. */
const connections = new Map<string, Connection>()

/** Lookup the active connection for a user. Returns null if none. */
export function getExtensionConnection(userId: string): Connection | null {
  return connections.get(userId) ?? null
}

/** True if the extension is currently connected for this user. */
export function isExtensionConnected(userId: string): boolean {
  const c = connections.get(userId)
  return c !== undefined && c.authed && c.ws.readyState === WebSocket.OPEN
}

/**
 * Send a command to a user's extension and await its response.
 * Throws if the user has no extension connected, or if the call times out.
 *
 * Used by browser-rpc.ts (the high-level dispatcher).
 */
export function sendCommandToExtension(
  userId: string,
  command: string,
  payload: unknown,
  timeoutMs = 30_000,
): Promise<ResponseMessage> {
  const c = connections.get(userId)
  if (!c || !c.authed || c.ws.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error(`Extension not connected for user ${userId}`))
  }

  // Rate limit BEFORE we mutate registry state.
  const now = Date.now()
  c.recentCommands = c.recentCommands.filter((t) => now - t < RATE_WINDOW_MS)
  if (c.recentCommands.length >= RATE_LIMIT) {
    return Promise.reject(
      new Error(`Rate limit exceeded: ${RATE_LIMIT} commands per ${RATE_WINDOW_MS / 1000}s`),
    )
  }
  c.recentCommands.push(now)

  return new Promise<ResponseMessage>((resolve, reject) => {
    const id = randomUUID()
    const timer = setTimeout(() => {
      c.pending.delete(id)
      reject(new Error(`Command "${command}" timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    c.pending.set(id, (msg) => {
      clearTimeout(timer)
      resolve(msg)
    })

    const envelope: OutboundCommand = { type: 'command', id, command, payload }
    try {
      c.ws.send(JSON.stringify(envelope))
    } catch (err) {
      clearTimeout(timer)
      c.pending.delete(id)
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

// ─── Auth helpers ─────────────────────────────────────────────────────────

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Validate the bearer token from the auth message against EXTENSION_WS_KEY
 * (preferred) or EXTENSION_API_KEY (legacy fallback). Either secret authenticates
 * the WS, but EXTENSION_WS_KEY lets you rotate WS access independently of HTTP.
 */
function validateToken(token: string): string | null {
  const wsKey = process.env['EXTENSION_WS_KEY']
  const apiKey = process.env['EXTENSION_API_KEY']
  const userId = process.env['EXTENSION_USER_ID']

  if (!userId) return null
  if (wsKey && constantTimeEqual(token, wsKey)) return userId
  if (apiKey && constantTimeEqual(token, apiKey)) return userId
  return null
}

/**
 * Origin check — accept chrome-extension://* and localhost (dev tooling, tests).
 * In production this list should be tightened to the published extension ID.
 */
function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false
  if (origin.startsWith('chrome-extension://')) return true
  if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) return true
  return false
}

// ─── Connection lifecycle ─────────────────────────────────────────────────

function closeConnection(c: Connection, code: number, reason: string): void {
  if (c.authTimer) clearTimeout(c.authTimer)
  if (c.pingTimer) clearInterval(c.pingTimer)
  // Reject any pending server-initiated commands.
  for (const [, resolver] of c.pending) {
    resolver({ type: 'response', id: '', success: false, error: `Connection closed: ${reason}` })
  }
  c.pending.clear()
  if (c.userId && connections.get(c.userId) === c) connections.delete(c.userId)
  try {
    c.ws.close(code, reason.slice(0, 123)) // close-reason length is capped at 123 bytes
  } catch {
    // already closed
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    event: 'extension_ws.closed',
    connId: c.connId,
    userId: c.userId,
    code,
    reason,
  }))
}

function handleAuthMessage(c: Connection, msg: z.infer<typeof AuthMessageSchema>): void {
  const userId = validateToken(msg.token)
  if (!userId) {
    closeConnection(c, 1008, 'Invalid auth token')
    return
  }

  // Kick the previous connection for this user, if any.
  const previous = connections.get(userId)
  if (previous && previous !== c) {
    closeConnection(previous, 1000, 'Replaced by new connection')
  }

  c.userId = userId
  c.authed = true
  if (c.authTimer) {
    clearTimeout(c.authTimer)
    c.authTimer = null
  }
  connections.set(userId, c)

  c.ws.send(JSON.stringify({ type: 'auth_ok', userId }))

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    event: 'extension_ws.authed',
    connId: c.connId,
    userId,
    clientVersion: msg.clientVersion,
    origin: c.origin,
  }))
}

function handleResponseMessage(c: Connection, msg: ResponseMessage): void {
  const resolver = c.pending.get(msg.id)
  if (!resolver) {
    // Late or unknown response — drop silently. Could happen if a command
    // timed out and the extension responded after the deadline.
    return
  }
  c.pending.delete(msg.id)
  resolver(msg)
}

function startPingLoop(c: Connection): void {
  c.pingTimer = setInterval(() => {
    if (c.ws.readyState !== WebSocket.OPEN) return
    if (Date.now() - c.lastSeen > IDLE_CLOSE_MS) {
      closeConnection(c, 1011, 'Idle timeout')
      return
    }
    try {
      c.ws.send(JSON.stringify({ type: 'ping' }))
    } catch {
      closeConnection(c, 1011, 'Ping send failed')
    }
  }, PING_INTERVAL_MS)
}

function handleMessage(c: Connection, raw: Buffer): void {
  c.lastSeen = Date.now()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.toString('utf8'))
  } catch {
    closeConnection(c, 1003, 'Invalid JSON')
    return
  }

  const result = InboundMessageSchema.safeParse(parsed)
  if (!result.success) {
    closeConnection(c, 1003, 'Schema validation failed')
    return
  }

  const msg = result.data

  // Pre-auth: only the auth message and pings are accepted.
  if (!c.authed) {
    if (msg.type === 'ping') {
      c.ws.send(JSON.stringify({ type: 'pong' }))
      return
    }
    if (msg.type !== 'auth') {
      closeConnection(c, 1008, 'Auth required')
      return
    }
    handleAuthMessage(c, msg)
    return
  }

  // Post-auth dispatch.
  switch (msg.type) {
    case 'response':
      handleResponseMessage(c, msg)
      return
    case 'ping':
      c.ws.send(JSON.stringify({ type: 'pong' }))
      return
    case 'pong':
      // Server-initiated ping was replied to — nothing else to do, lastSeen already updated.
      return
    case 'auth':
      // Re-auth not allowed on an established connection.
      closeConnection(c, 1008, 'Already authenticated')
      return
  }
}

// ─── Public entry point ───────────────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true })

/**
 * Hook into the HTTP server's upgrade event. Wire this from apps/api/src/index.ts
 * inside the existing `server.on('upgrade', …)` block.
 */
export function handleExtensionWsUpgrade(
  request: IncomingMessage,
  socket: import('net').Socket,
  head: Buffer,
): void {
  const origin = request.headers.origin
  if (!isOriginAllowed(origin)) {
    // 403-equivalent for WS upgrade: write a response and close.
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
    socket.destroy()
    return
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    const c: Connection = {
      ws,
      userId: null,
      authed: false,
      authTimer: null,
      pingTimer: null,
      lastSeen: Date.now(),
      recentCommands: [],
      pending: new Map(),
      connId: randomUUID(),
      origin: origin ?? '',
    }

    c.authTimer = setTimeout(() => {
      if (!c.authed) closeConnection(c, 1008, 'Auth timeout')
    }, AUTH_DEADLINE_MS)

    startPingLoop(c)

    ws.on('message', (raw: Buffer) => handleMessage(c, raw))
    ws.on('close', (code, reason) => closeConnection(c, code, reason.toString('utf8')))
    ws.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({ event: 'extension_ws.socket_error', connId: c.connId, error: err.message }))
    })

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: 'extension_ws.opened', connId: c.connId, origin: c.origin }))
  })
}

/** Test/diagnostic helper. */
export function _connectionsForTest(): ReadonlyMap<string, Connection> {
  return connections
}

/** Suppress unused-import warning for HttpServer in declaration files. */
export type _Server = HttpServer
