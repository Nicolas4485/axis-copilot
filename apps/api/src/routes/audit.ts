// Audit log routes — admin only
// GET /api/audit        — paginated audit log (last 500 entries)
// GET /api/audit/stats  — summary stats for the admin dashboard

import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'

export const auditRouter = Router()

/**
 * GET /api/audit — paginated audit log
 */
auditRouter.get('/', async (req: Request, res: Response) => {
  try {
    const page   = Math.max(1, parseInt(req.query['page'] as string ?? '1'))
    const limit  = Math.min(100, parseInt(req.query['limit'] as string ?? '50'))
    const skip   = (page - 1) * limit
    const resource = req.query['resource'] as string | undefined

    const where = resource ? { resource } : {}

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true, userEmail: true, action: true, resource: true,
          resourceId: true, method: true, path: true, statusCode: true,
          ipAddress: true, durationMs: true, createdAt: true,
        },
      }),
      prisma.auditLog.count({ where }),
    ])

    res.json({ logs, total, page, limit, pages: Math.ceil(total / limit), requestId: req.requestId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to fetch audit logs', code: 'AUDIT_ERROR', details: msg })
  }
})

/**
 * GET /api/audit/stats — summary for dashboard widget
 */
auditRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // last 7 days

    const [totalRequests, errorCount, uniqueResources, recentActivity] = await Promise.all([
      prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
      prisma.auditLog.count({ where: { createdAt: { gte: since }, statusCode: { gte: 400 } } }),
      prisma.auditLog.groupBy({ by: ['resource'], _count: { _all: true }, orderBy: { _count: { resource: 'desc' } }, take: 5 }),
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10,
        select: { userEmail: true, action: true, statusCode: true, createdAt: true } }),
    ])

    res.json({
      totalRequests,
      errorCount,
      errorRate: totalRequests > 0 ? ((errorCount / totalRequests) * 100).toFixed(1) : '0.0',
      topResources: uniqueResources.map((r) => ({ resource: r.resource, count: r._count._all })),
      recentActivity,
      requestId: req.requestId,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to fetch audit stats', code: 'AUDIT_STATS_ERROR', details: msg })
  }
})
