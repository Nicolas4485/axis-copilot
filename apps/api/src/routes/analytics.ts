import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'

export const analyticsRouter = Router()

/**
 * GET /api/analytics/agents
 * Returns per-specialist call counts and success rates derived from Message metadata.
 * Response: { metrics: Array<{ agent, queryCount, avgResponseMs, successRate }> }
 */
analyticsRouter.get('/agents', async (req: Request, res: Response) => {
  try {
    const messages = await prisma.message.findMany({
      where: {
        session: { userId: req.userId! },
        role: 'ASSISTANT',
        metadata: {
          path: ['agentType'],
          equals: 'specialist',
        },
      },
      select: { metadata: true },
    })

    const byAgent = new Map<string, { count: number; errors: number }>()
    for (const msg of messages) {
      const meta = msg.metadata as Record<string, unknown>
      const agentKey = (meta['agent'] as string | undefined) ?? 'unknown'
      const isError = meta['error'] === true
      const prev = byAgent.get(agentKey) ?? { count: 0, errors: 0 }
      byAgent.set(agentKey, { count: prev.count + 1, errors: prev.errors + (isError ? 1 : 0) })
    }

    const metrics = Array.from(byAgent.entries()).map(([agentKey, stats]) => ({
      agent: agentKey.charAt(0).toUpperCase() + agentKey.slice(1),
      queryCount: stats.count,
      avgResponseMs: 0,
      successRate: stats.count > 0 ? (stats.count - stats.errors) / stats.count : 1,
    }))

    res.json({ metrics, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to get agent metrics', code: 'ANALYTICS_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * GET /api/analytics/knowledge/:clientId
 * Returns cumulative knowledge document growth over time for a client.
 * clientId = 'all' returns across all clients for this user.
 * Response: { growth: Array<{ date, nodeCount, edgeCount }> }
 */
analyticsRouter.get('/knowledge/:clientId', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params

    const docs = await prisma.knowledgeDocument.findMany({
      where: {
        userId: req.userId!,
        ...(clientId && clientId !== 'all' ? { clientId } : {}),
        syncStatus: 'INDEXED',
      },
      select: { createdAt: true, chunkCount: true },
      orderBy: { createdAt: 'asc' },
    })

    // Bucket by calendar date and accumulate chunk count as a proxy for "nodes"
    const byDate = new Map<string, number>()
    for (const doc of docs) {
      const date = doc.createdAt.toISOString().slice(0, 10)
      byDate.set(date, (byDate.get(date) ?? 0) + doc.chunkCount)
    }

    let cumulative = 0
    const growth = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, chunks]) => {
        cumulative += chunks
        return { date, nodeCount: cumulative, edgeCount: 0 }
      })

    res.json({ growth, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to get knowledge growth', code: 'ANALYTICS_ERROR', details: errorMsg, requestId: req.requestId })
  }
})
