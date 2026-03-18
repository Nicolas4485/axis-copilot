import { Router } from 'express'
import type { Request, Response } from 'express'
import { InferenceEngine } from '@axis/inference'

const engine = new InferenceEngine()

export const costRouter = Router()

/**
 * GET /api/cost/summary
 * Returns global cost summary for the authenticated user.
 * Query params: period (days, default 30)
 */
costRouter.get('/summary', async (req: Request, res: Response) => {
  try {
    const userId = (req as unknown as Record<string, unknown>)['userId'] as string | undefined
    if (!userId) {
      res.status(401).json({ error: 'Authentication required', code: 'NO_USER' })
      return
    }

    const periodDays = parseInt(req.query['period'] as string || '30', 10)
    const costTracker = engine.getCostTracker()
    const summary = await costTracker.getUserCostSummary(userId, periodDays)

    res.json({
      userId: summary.userId,
      totalCostUsd: summary.totalCostUsd,
      totalCalls: summary.totalCalls,
      totalInputTokens: summary.totalInputTokens,
      totalOutputTokens: summary.totalOutputTokens,
      cacheHitRate: summary.cacheHitRate,
      periodStart: summary.periodStart,
      periodEnd: summary.periodEnd,
      byModel: summary.byModel,
      byDay: summary.byDay,
      requestId: req.headers['x-request-id'],
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({
      error: 'Failed to fetch cost summary',
      code: 'COST_FETCH_ERROR',
      details: errorMsg,
      requestId: req.headers['x-request-id'],
    })
  }
})
