// Aria API routes — conversational orchestrator endpoints
// Handles: session tokens (Live mode), tool execution, delegation, text messages, memory refresh

import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { rateLimit } from 'express-rate-limit'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { Aria } from '@axis/agents'
import { InferenceEngine } from '@axis/inference'
import { AriaTextAgent } from '@axis/sdk-agents'
import { messagesRateLimit } from '../middleware/auth.js'

const engine = new InferenceEngine()
const aria = new Aria({ engine, prisma })
// Instantiated once; `undefined` when SDK_AGENTS_ENABLED=false so there's no startup cost.
let _sdkAriaAgent: AriaTextAgent | undefined
function getSdkAgent(): AriaTextAgent {
  if (!_sdkAriaAgent) _sdkAriaAgent = new AriaTextAgent()
  return _sdkAriaAgent
}

export const ariaRouter = Router()

// /session-token is now used only for memory-refresh metadata (system instruction, tools).
// The Gemini API key is NO LONGER returned — SEC-1 resolved.
// Live audio/video is proxied through /api/aria/live (WebSocket) which holds the key server-side.
const sessionTokenRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5, // 5 requests per minute per user — Live sessions rarely need more
  keyGenerator: (req: Request) => req.userId ?? req.ip ?? 'anonymous',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Session token rate limit exceeded', code: 'SESSION_TOKEN_RATE_LIMITED' },
})

// ─── Validation schemas ──────────────────────────────────────────

const sessionTokenSchema = z.object({
  sessionId: z.string().min(1),
})

const toolCallSchema = z.object({
  sessionId: z.string().min(1),
  toolName: z.string().min(1),
  toolInput: z.record(z.unknown()),
})

const delegateSchema = z.object({
  sessionId: z.string().min(1),
  workerType: z.enum(['product', 'process', 'competitive', 'stakeholder']),
  query: z.string().min(1),
  imageBase64: z.string().optional(),
})

const ariaMessageSchema = z.object({
  content: z.string().min(1),
  imageBase64: z.string().optional(),
})

// ─── GET /api/aria/live-health ───────────────────────────────────
// Returns Gemini Live availability status (no auth required — used for pre-flight check)

ariaRouter.get('/live-health', (_req, res: Response) => {
  const configured = !!env().GEMINI_API_KEY
  res.json({
    configured,
    model: 'gemini-3.1-flash-live-preview',
    status: configured ? 'available' : 'not_configured',
  })
})

// ─── POST /api/aria/session-token ────────────────────────────────
// Returns system instruction + tool declarations for Gemini Live session

ariaRouter.post('/session-token', sessionTokenRateLimit, async (req: Request, res: Response) => {
  try {
    const parsed = sessionTokenSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
      return
    }

    const { sessionId } = parsed.data

    // Verify session belongs to user
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: req.userId! },
    })
    if (!session) {
      res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    // Build live session config with memory context (no API key returned — SEC-1 fix)
    const config = await aria.buildLiveSessionConfig(sessionId, req.userId!, null, session.clientId)

    res.json({
      systemInstruction: config.systemInstruction,
      tools: config.tools,
      model: config.model,
      sessionId,
      requestId: req.requestId,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to create session token', code: 'SESSION_TOKEN_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

// ─── POST /api/aria/tool-call ────────────────────────────────────
// Execute a tool during a live session (function call relay)

ariaRouter.post('/tool-call', async (req: Request, res: Response) => {
  try {
    const parsed = toolCallSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
      return
    }

    const { sessionId, toolName, toolInput } = parsed.data

    // Verify session belongs to user
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: req.userId! },
    })
    if (!session) {
      res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    const result = await aria.executeTool(
      toolName,
      toolInput,
      {
        sessionId,
        userId: req.userId!,
        clientId: session.clientId ?? '',
        requestId: req.requestId ?? '',
      }
    )

    res.json({ result, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Tool execution failed', code: 'TOOL_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

// ─── POST /api/aria/delegate ─────────────────────────────────────
// Delegate to a worker agent (longer timeout)

ariaRouter.post('/delegate', async (req: Request, res: Response) => {
  try {
    const parsed = delegateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
      return
    }

    const { sessionId, workerType, query, imageBase64 } = parsed.data

    // Verify session belongs to user
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: req.userId! },
    })
    if (!session) {
      res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    // Build minimal context — the worker agent will get its own context
    const context = {
      sessionId,
      clientId: session.clientId,
      userId: req.userId!,
      assembledContext: '',
      ragResult: null,
      stakeholders: [],
      clientRecord: null,
    }

    const result = await aria.delegate(workerType, query, context, imageBase64)

    res.json({
      workerType,
      content: result.content,
      toolsUsed: result.toolsUsed,
      citations: result.citations,
      conflictsFound: result.conflictsFound,
      requestId: req.requestId,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Delegation failed', code: 'DELEGATION_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

// ─── POST /api/aria/messages ─────────────────────────────────────
// Text-mode SSE streaming (same event format as sessions/:id/messages)

ariaRouter.post('/messages', messagesRateLimit, async (req: Request, res: Response) => {
  const sessionId = req.query['sessionId'] as string | undefined
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId query parameter required', code: 'MISSING_SESSION_ID', requestId: req.requestId })
    return
  }

  const parsed = ariaMessageSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
    return
  }

  const { content, imageBase64 } = parsed.data

  // Verify session
  const session = await prisma.session.findFirst({
    where: { id: sessionId, userId: req.userId! },
  })
  if (!session) {
    res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND', requestId: req.requestId })
    return
  }

  // Store user message
  await prisma.message.create({
    data: { sessionId, role: 'USER', content, mode: 'intake', metadata: {} },
  })

  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Request-Id': req.requestId,
  })

  let closed = false
  req.on('close', () => { closed = true })

  const sendEvent = (type: string, data: unknown): void => {
    if (closed) return
    res.write(`data: ${JSON.stringify({ ...(data as Record<string, unknown>), type })}\n\n`)
  }

  // Load last 30 messages for intent classification and conversational context
  const priorDbMessages = await prisma.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { role: true, content: true },
  })
  const priorMessages = priorDbMessages
    .reverse()
    .map((m) => ({ role: m.role === 'USER' ? 'user' as const : 'assistant' as const, content: m.content }))

  try {
    if (env().SDK_AGENTS_ENABLED) {
      // ── SDK path (Claude Agent SDK) ─────────────────────────────
      const context = {
        sessionId,
        userId:    req.userId!,
        clientId:  session.clientId ?? null,
        requestId: req.requestId ?? '',
      }
      const result = await getSdkAgent().handleMessage(
        content,
        sessionId,
        context,
        (token) => sendEvent('token', { content: token })
      )
      await prisma.message.create({
        data: {
          sessionId,
          role: 'ASSISTANT',
          content: result.content,
          mode: 'intake',
          metadata: { source: 'sdk', ...(result.sessionId ? { sdkSessionId: result.sessionId } : {}) },
        },
      })
      sendEvent('done', { messageId: sessionId })
    } else {
      // ── Legacy path (Gemini / InferenceEngine) ──────────────────
      const ariaResponse = await aria.handleTextMessage(
        sessionId,
        req.userId!,
        content,
        imageBase64,
        session.clientId,
        priorMessages,
        (event) => sendEvent(event.type, event)
      )

      for (const conflict of ariaResponse.conflictsFound) {
        sendEvent('conflict_warning', { conflict })
      }

      sendEvent('token', { content: ariaResponse.content })

      if (ariaResponse.citations.length > 0) {
        sendEvent('sources', { citations: ariaResponse.citations })
      }

      await prisma.message.create({
        data: {
          sessionId,
          role: 'ASSISTANT',
          content: ariaResponse.content,
          mode: 'intake',
          metadata: JSON.parse(JSON.stringify({
            toolsUsed:   ariaResponse.toolsUsed,
            citations:   ariaResponse.citations,
            delegations: ariaResponse.delegations,
            reasoning:   ariaResponse.reasoning,
          })),
        },
      })

      sendEvent('done', { messageId: sessionId })
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    sendEvent('done', { error: errorMsg })
  }

  if (!closed) res.end()
})

// ─── POST /api/aria/save-transcript — Save live session transcript ──

const saveTranscriptSchema = z.object({
  sessionId: z.string().min(1),
  userText: z.string(),
  ariaText: z.string(),
})

ariaRouter.post('/save-transcript', async (req: Request, res: Response) => {
  try {
    const parsed = saveTranscriptSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', requestId: req.requestId })
      return
    }

    const { sessionId, userText, ariaText } = parsed.data

    // Store user message
    if (userText.trim()) {
      await prisma.message.create({
        data: { sessionId, role: 'USER', content: userText, mode: 'intake', metadata: {} },
      })
    }

    // Store Aria response
    if (ariaText.trim()) {
      await prisma.message.create({
        data: { sessionId, role: 'ASSISTANT', content: ariaText, mode: 'intake', metadata: { source: 'live' } },
      })
    }

    res.json({ saved: true, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to save transcript', code: 'TRANSCRIPT_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

// ─── GET /api/aria/delegation-status — Check if agent completed work ──

ariaRouter.get('/delegation-status', async (req: Request, res: Response) => {
  try {
    const sessionId = req.query['sessionId'] as string
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId required', code: 'MISSING_PARAM', requestId: req.requestId })
      return
    }

    // Use Postgres JSON array contains to avoid O(N) client-side filtering
    const sessionResults = await prisma.$queryRaw<Array<{
      id: string
      content: string
      tags: unknown
      created_at: Date
    }>>`
      SELECT id, content, tags, created_at
      FROM agent_memories
      WHERE user_id = ${req.userId!}
        AND memory_type = 'EPISODIC'
        AND tags @> ${JSON.stringify([sessionId])}::jsonb
      ORDER BY created_at DESC
      LIMIT 100
    `

    // Parse which are delegation results
    const WORKER_TYPES = ['product', 'process', 'competitive', 'stakeholder']
    const WORKER_NAMES: Record<string, string> = { product: 'Sean', process: 'Kevin', competitive: 'Mel', stakeholder: 'Anjie' }

    const delegations = sessionResults
      .filter((r) => {
        const tags = r.tags as string[]
        return tags.some((t) => WORKER_TYPES.includes(t))
      })
      .map((r) => {
        const tags = r.tags as string[]
        const workerType = tags.find((t) => WORKER_TYPES.includes(t)) ?? 'unknown'
        return {
          id: r.id,
          agent: WORKER_NAMES[workerType] ?? workerType,
          workerType,
          status: 'completed' as const,
          result: r.content,
          completedAt: r.created_at.toISOString(),
        }
      })

    res.json({ delegations, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to get delegation status', code: 'DELEGATION_STATUS_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

// ─── POST /api/aria/memory-refresh ───────────────────────────────
// Returns updated system instruction for long live sessions

ariaRouter.post('/memory-refresh', async (req: Request, res: Response) => {
  try {
    const parsed = sessionTokenSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
      return
    }

    const { sessionId } = parsed.data

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: req.userId! },
    })
    if (!session) {
      res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    const config = await aria.buildLiveSessionConfig(sessionId, req.userId!, null, session.clientId)

    res.json({
      systemInstruction: config.systemInstruction,
      requestId: req.requestId,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Memory refresh failed', code: 'MEMORY_REFRESH_ERROR', details: errorMsg, requestId: req.requestId })
  }
})
