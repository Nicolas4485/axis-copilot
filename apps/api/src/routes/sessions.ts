import { Router } from 'express'
import type { Request, Response } from 'express'
import { messagesRateLimit } from '../middleware/auth.js'
import { prisma } from '../lib/prisma.js'
import { createSessionSchema, sendMessageSchema } from '../lib/schemas.js'
import { Aria } from '@axis/agents'
import { InferenceEngine } from '@axis/inference'

const engine = new InferenceEngine()
const aria = new Aria({ engine, prisma })

export const sessionsRouter = Router()

/**
 * GET /api/sessions — List all sessions for the user
 */
sessionsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const sessionsList = await prisma.session.findMany({
      where: { userId: req.userId! },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        client: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
      },
    })

    res.json({
      sessions: sessionsList.map((s) => ({
        id: s.id,
        title: s.title,
        mode: s.mode,
        status: s.status,
        client: s.client,
        messageCount: s._count.messages,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      requestId: req.requestId,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to list sessions', code: 'LIST_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * POST /api/sessions — Create a new session
 */
sessionsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = createSessionSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
      return
    }

    const { clientId, title, mode } = parsed.data
    const session = await prisma.session.create({
      data: {
        userId: req.userId!,
        ...(clientId ? { clientId } : {}),
        title: title ?? 'New Session',
        mode: mode ?? 'intake',
        status: 'ACTIVE',
      },
    })

    res.status(201).json({ id: session.id, title: session.title, mode: session.mode, status: session.status, createdAt: session.createdAt, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to create session', code: 'SESSION_CREATE_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * GET /api/sessions/:id — Get session with cursor-paginated messages
 *
 * Query params:
 *   cursor   — message ID to paginate from (exclusive, descending by createdAt)
 *   limit    — max messages to return (default 50, max 100)
 *
 * Response includes `nextCursor` for the next page (null when no more messages).
 */
sessionsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id']
    if (!id) { res.status(400).json({ error: 'Session ID required', code: 'MISSING_ID' }); return }

    const rawLimit = parseInt(req.query['limit'] as string ?? '50', 10)
    const limit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? 50 : rawLimit, 100)
    const cursor = req.query['cursor'] as string | undefined

    const session = await prisma.session.findFirst({
      where: { id, userId: req.userId! },
      include: { client: true },
    })

    if (!session) {
      res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    // Fetch limit+1 messages so we can determine if a next page exists
    const messages = await prisma.message.findMany({
      where: {
        sessionId: id,
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    })

    // Reverse to chronological order for the client
    const hasMore = messages.length > limit
    const pageMessages = messages.slice(0, limit).reverse()
    const nextCursor = hasMore ? (pageMessages[0]?.id ?? null) : null

    res.json({
      ...session,
      messages: pageMessages,
      nextCursor,
      requestId: req.requestId,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to fetch session', code: 'SESSION_FETCH_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * POST /api/sessions/:id/messages — SSE streaming response
 *
 * Events: tool_start, tool_result, token, conflict_warning, sources, done
 */
sessionsRouter.post('/:id/messages', messagesRateLimit, async (req: Request, res: Response) => {
  const sessionId = req.params['id']
  if (!sessionId) {
    res.status(400).json({ error: 'Session ID required', code: 'MISSING_ID', requestId: req.requestId })
    return
  }

  const parsed = sendMessageSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
    return
  }

  const { content, mode, imageBase64 } = parsed.data

  // Verify session exists and belongs to user
  let session
  try {
    session = await prisma.session.findFirst({
      where: { id: sessionId, userId: req.userId! },
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Database error', code: 'DB_ERROR', details: errorMsg, requestId: req.requestId })
    return
  }

  if (!session) {
    res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND', requestId: req.requestId })
    return
  }

  // Store user message
  try {
    await prisma.message.create({
      data: { sessionId, role: 'USER', content, mode: mode ?? session.mode ?? 'intake', metadata: {} },
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to store message', code: 'MESSAGE_STORE_ERROR', details: errorMsg, requestId: req.requestId })
    return
  }

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

  // Load recent conversation history so Aria has context when resuming a session.
  // Capped at 20 messages, oldest first, content truncated to 500 chars each to
  // avoid ballooning the context window on very long sessions.
  const priorMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  try {
    const recentMessages = await prisma.message.findMany({
      where: { sessionId, role: { in: ['USER', 'ASSISTANT'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { role: true, content: true },
    })
    priorMessages.push(
      ...recentMessages
        .reverse()
        .map((m) => ({
          role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
          content: m.content.slice(0, 500),
        }))
    )
  } catch {
    // Non-critical — Aria still works without history, just starts fresh
  }

  try {
    // Run orchestrator
    const agentResponse = await aria.handleTextMessage(
      sessionId,
      req.userId!,
      content,
      imageBase64,
      session.clientId,
      priorMessages
    )

    // Emit tool events
    for (const tool of agentResponse.toolsUsed) {
      sendEvent('tool_start', { tool })
      sendEvent('tool_result', { tool, status: 'completed' })
    }

    // Emit delegation events
    if ('delegations' in agentResponse) {
      for (const delegation of (agentResponse as { delegations: Array<{ workerType: string; query: string }> }).delegations) {
        sendEvent('delegation', { workerType: delegation.workerType, query: delegation.query })
      }
    }

    // Emit conflict warnings
    for (const conflict of agentResponse.conflictsFound) {
      sendEvent('conflict_warning', { conflict })
    }

    // Emit token event with full content
    console.log('[SSE] Agent response content length:', agentResponse.content.length)
    console.log('[SSE] Agent response content preview:', agentResponse.content.slice(0, 200))
    sendEvent('token', { content: agentResponse.content })

    // Emit sources
    if (agentResponse.citations.length > 0) {
      sendEvent('sources', { citations: agentResponse.citations })
    }

    // Store assistant message
    await prisma.message.create({
      data: {
        sessionId,
        role: 'ASSISTANT',
        content: agentResponse.content,
        mode: mode ?? session.mode ?? 'intake',
        metadata: JSON.parse(JSON.stringify({
          toolsUsed: agentResponse.toolsUsed,
          citations: agentResponse.citations,
          reasoning: agentResponse.reasoning,
        })),
      },
    })

    // Emit done
    sendEvent('done', { messageId: sessionId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    sendEvent('done', { error: errorMsg })
  }

  if (!closed) res.end()
})

/**
 * GET /api/sessions/:id/cost — Session cost breakdown
 */
sessionsRouter.get('/:id/cost', async (req: Request, res: Response) => {
  try {
    const sessionId = req.params['id']
    if (!sessionId) {
      res.status(400).json({ error: 'Session ID required', code: 'MISSING_ID', requestId: req.requestId })
      return
    }

    const costTracker = engine.getCostTracker()
    const summary = await costTracker.getSessionCost(sessionId)

    res.json({ ...summary, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to fetch cost', code: 'COST_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * POST /api/sessions/:id/distribute — Distribute session to stakeholders
 */
sessionsRouter.post('/:id/distribute', async (req: Request, res: Response) => {
  try {
    const { distributeSchema } = await import('../lib/schemas.js')
    const parsed = distributeSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
      return
    }

    const sessionId = req.params['id']
    const { stakeholderIds, format, subject } = parsed.data

    // TODO: Look up stakeholder emails, generate formatted content, send via Gmail/GDocs
    res.json({
      sessionId,
      distributed: true,
      stakeholderCount: stakeholderIds.length,
      format,
      subject: subject ?? 'Session Summary',
      requestId: req.requestId,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Distribution failed', code: 'DISTRIBUTE_ERROR', details: errorMsg, requestId: req.requestId })
  }
})
