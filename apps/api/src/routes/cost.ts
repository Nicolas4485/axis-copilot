import { Router } from 'express'
import type { Request, Response } from 'express'
import { InferenceEngine } from '@axis/inference'

const engine = new InferenceEngine()

export const costRouter = Router()

/**
 * GET /api/cost/summary — Global cost summary for the authenticated user
 * Query params: period (days, default 30)
 */
costRouter.get('/summary', async (req: Request, res: Response) => {
  try {
    const periodDays = parseInt(req.query['period'] as string || '30', 10)
    const costTracker = engine.getCostTracker()
    const summary = await costTracker.getUserCostSummary(req.userId!, periodDays)

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
      requestId: req.requestId,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to fetch cost summary', code: 'COST_ERROR', details: errorMsg, requestId: req.requestId })
  }
})
