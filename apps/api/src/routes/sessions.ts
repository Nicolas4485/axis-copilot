import { Router } from 'express'
import type { Request, Response } from 'express'
import { messagesRateLimit } from '../middleware/auth.js'
import { InferenceEngine } from '@axis/inference'

const engine = new InferenceEngine()

export const sessionsRouter = Router()

sessionsRouter.post('/', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' })
})

sessionsRouter.get('/:id', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' })
})

sessionsRouter.post('/:id/messages', messagesRateLimit, (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' })
})

/**
 * GET /api/sessions/:id/cost
 * Returns per-session cost breakdown: total spend, tokens, cache hit rate,
 * breakdown by model and task type.
 */
sessionsRouter.get('/:id/cost', async (req: Request, res: Response) => {
  try {
    const sessionId = req.params['id']
    if (!sessionId) {
      res.status(400).json({ error: 'Session ID required', code: 'MISSING_SESSION_ID' })
      return
    }

    const costTracker = engine.getCostTracker()
    const summary = await costTracker.getSessionCost(sessionId)

    res.json({
      sessionId: summary.sessionId,
      totalCostUsd: summary.totalCostUsd,
      totalInputTokens: summary.totalInputTokens,
      totalOutputTokens: summary.totalOutputTokens,
      totalCalls: summary.totalCalls,
      cacheHitRate: summary.cacheHitRate,
      averageLatencyMs: summary.averageLatencyMs,
      byModel: summary.byModel,
      byTask: summary.byTask,
      requestId: req.headers['x-request-id'],
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({
      error: 'Failed to fetch session cost',
      code: 'COST_FETCH_ERROR',
      details: errorMsg,
      requestId: req.headers['x-request-id'],
    })
  }
})

sessionsRouter.post('/:id/distribute', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' })
})
