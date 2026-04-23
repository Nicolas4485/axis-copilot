// RAG Evaluation API — POST /api/admin/rag-eval (trigger eval run via SSE)
//                       GET  /api/admin/rag-eval/latest (fetch latest result)

import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { InferenceEngine } from '@axis/inference'
import { RAGEngine } from '@axis/rag'
import { RagEvaluator } from '../../../../packages/rag/src/eval/rag-evaluator.js'
import type { EvalResult } from '../../../../packages/rag/src/eval/rag-evaluator.js'
import type { QuestionCategory } from '../../../../packages/rag/src/eval/test-set.js'

export const ragEvalRouter = Router()

// Cache latest result in memory (persisted in AgentMemory for history)
let latestResult: EvalResult | null = null

/**
 * POST /api/admin/rag-eval
 * SSE: triggers a RAG evaluation run and streams progress.
 * Body: { clientId?: string; categories?: QuestionCategory[]; maxQuestions?: number }
 */
ragEvalRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendEvent = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  let engine: InferenceEngine | null = null

  try {
    const { clientId, categories, maxQuestions } = req.body as {
      clientId?: string
      categories?: QuestionCategory[]
      maxQuestions?: number
    }

    engine = new InferenceEngine()
    const rag = new RAGEngine({ engine, prisma })
    const evaluator = new RagEvaluator({ rag, engine, prisma })

    sendEvent({ type: 'start', message: 'Starting RAG evaluation...' })

    const result = await evaluator.run({
      userId,
      clientId: clientId ?? null,
      ...(categories ? { categories } : {}),
      maxQuestions: maxQuestions ?? 60,
      onProgress: (done, total, question) => {
        sendEvent({
          type: 'progress',
          done,
          total,
          question: question.substring(0, 80),
          pct: Math.round((done / total) * 100),
        })
      },
    })

    latestResult = result

    // Persist to AgentMemory for history
    await prisma.agentMemory.create({
      data: {
        userId,
        memoryType: 'SEMANTIC',
        content: JSON.stringify({ type: 'rag_eval', ...result }),
        tags: ['rag_eval', result.runId, result.passed ? 'passed' : 'failed'],
      },
    }).catch(() => {/* non-fatal */})

    sendEvent({ type: 'done', result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Evaluation failed'
    console.error('[RagEval] Error:', message)
    sendEvent({ type: 'error', message })
    engine?.shutdown()
  } finally {
    res.end()
  }
})

/**
 * GET /api/admin/rag-eval/latest
 * Returns the most recent evaluation result.
 */
ragEvalRouter.get('/latest', async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!

  // Check in-memory cache first
  if (latestResult && latestResult.userId === userId) {
    res.json({ result: latestResult })
    return
  }

  // Fall back to DB
  try {
    const memory = await prisma.agentMemory.findFirst({
      where: {
        userId,
        memoryType: 'SEMANTIC',
        content: { contains: '"type":"rag_eval"' },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!memory) {
      res.status(404).json({ error: 'No evaluation results found', code: 'NOT_FOUND' })
      return
    }

    const parsed = JSON.parse(memory.content) as Record<string, unknown>
    res.json({ result: parsed, savedAt: memory.createdAt })
  } catch (err) {
    console.error('[RagEval] GET latest error:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Failed to fetch results', code: 'INTERNAL_ERROR' })
  }
})
