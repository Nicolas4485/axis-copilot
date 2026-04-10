// Aria API routes — conversational orchestrator endpoints
// Handles: session tokens (Live mode), tool execution, delegation, text messages, memory refresh

import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { Aria } from '@axis/agents'
import { InferenceEngine } from '@axis/inference'
import { messagesRateLimit } from '../middleware/auth.js'

const engine = new InferenceEngine()
const aria = new Aria({ engine, prisma })

export const ariaRouter = Router()

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

// ─── POST /api/aria/session-token ────────────────────────────────
// Returns system instruction + tool declarations for Gemini Live session

ariaRouter.post('/session-token', async (req: Request, res: Response) => {
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

    // Build live session config with memory context
    const config = await aria.buildLiveSessionConfig(sessionId, req.userId!)

    const geminiKey = env().GEMINI_API_KEY
    if (!geminiKey) {
      res.status(503).json({ error: 'Gemini not configured', code: 'GEMINI_NOT_CONFIGURED', requestId: req.requestId })
      return
    }

    // Return the API key for the frontend to connect directly to Gemini Live
    // In production, use ephemeral tokens instead
    res.json({
      apiKey: geminiKey,
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

  try {
    const ariaResponse = await aria.handleTextMessage(
      sessionId,
      req.userId!,
      content,
      imageBase64,
      session.clientId
    )

    // Emit tool events
    for (const tool of ariaResponse.toolsUsed) {
      sendEvent('tool_start', { tool })
      sendEvent('tool_result', { tool, status: 'completed' })
    }

    // Emit delegation events
    for (const delegation of ariaResponse.delegations) {
      sendEvent('delegation', { workerType: delegation.workerType, query: delegation.query })
    }

    // Emit conflict warnings
    for (const conflict of ariaResponse.conflictsFound) {
      sendEvent('conflict_warning', { conflict })
    }

    // Emit response
    sendEvent('token', { content: ariaResponse.content })

    // Emit sources
    if (ariaResponse.citations.length > 0) {
      sendEvent('sources', { citations: ariaResponse.citations })
    }

    // Store assistant message
    await prisma.message.create({
      data: {
        sessionId,
        role: 'ASSISTANT',
        content: ariaResponse.content,
        mode: 'intake',
        metadata: JSON.parse(JSON.stringify({
          toolsUsed: ariaResponse.toolsUsed,
          citations: ariaResponse.citations,
          delegations: ariaResponse.delegations,
          reasoning: ariaResponse.reasoning,
        })),
      },
    })

    sendEvent('done', { messageId: sessionId })
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

    // Find delegation results tagged with this session
    // tags is a Json column, so we use raw SQL for array contains
    const results = await prisma.agentMemory.findMany({
      where: {
        userId: req.userId!,
        memoryType: 'EPISODIC',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    // Filter client-side for session tag match (Json column limitation)
    const sessionResults = results.filter((r) => {
      const tags = r.tags as string[] | null
      return tags?.includes(sessionId)
    })

    // Parse which are delegation results
    const delegations = sessionResults
      .filter((r) => {
        const tags = r.tags as string[]
        return tags.some((t) => ['product', 'process', 'competitive', 'stakeholder'].includes(t))
      })
      .map((r) => {
        const tags = r.tags as string[]
        const workerType = tags.find((t) => ['product', 'process', 'competitive', 'stakeholder'].includes(t)) ?? 'unknown'
        const names: Record<string, string> = { product: 'Sean', process: 'Kevin', competitive: 'Mel', stakeholder: 'Anjie' }
        return {
          id: r.id,
          agent: names[workerType] ?? workerType,
          workerType,
          status: 'completed' as const,
          result: r.content,
          completedAt: r.createdAt.toISOString(),
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

    const config = await aria.buildLiveSessionConfig(sessionId, req.userId!)

    res.json({
      systemInstruction: config.systemInstruction,
      requestId: req.requestId,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Memory refresh failed', code: 'MEMORY_REFRESH_ERROR', details: errorMsg, requestId: req.requestId })
  }
})
