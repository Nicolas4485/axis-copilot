import { Router } from 'express'
import type { Request, Response } from 'express'
import { messagesRateLimit } from '../middleware/auth.js'
import { prisma } from '../lib/prisma.js'
import { createSessionSchema, sendMessageSchema } from '../lib/schemas.js'
import { Orchestrator } from '@axis/agents'
import { InferenceEngine } from '@axis/inference'

const engine = new InferenceEngine()
const orchestrator = new Orchestrator({ engine })

export const sessionsRouter = Router()

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
 * GET /api/sessions/:id — Get session with messages
 */
sessionsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id']
    if (!id) { res.status(400).json({ error: 'Session ID required', code: 'MISSING_ID' }); return }

    const session = await prisma.session.findFirst({
      where: { id, userId: req.userId! },
      include: { messages: { orderBy: { createdAt: 'asc' } }, client: true },
    })

    if (!session) {
      res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    res.json({ ...session, requestId: req.requestId })
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
  const session = await prisma.session.findFirst({
    where: { id: sessionId, userId: req.userId! },
  })

  if (!session) {
    res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND', requestId: req.requestId })
    return
  }

  // Store user message
  await prisma.message.create({
    data: { sessionId, role: 'USER', content, mode: mode ?? session.mode ?? 'intake', metadata: {} },
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
    res.write(`data: ${JSON.stringify({ type, ...data as Record<string, unknown> })}\n\n`)
  }

  try {
    // Run orchestrator
    const agentResponse = await orchestrator.handleMessage(
      sessionId,
      req.userId!,
      content,
      mode as 'intake' | 'product' | 'process' | 'competitive' | 'stakeholder' | undefined,
      imageBase64
    )

    // Emit tool events
    for (const tool of agentResponse.toolsUsed) {
      sendEvent('tool_start', { tool })
      sendEvent('tool_result', { tool, status: 'completed' })
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
