// Audit middleware — logs every authenticated API request to audit_logs table.
// Attached after the auth middleware so req.userId and req.userEmail are available.
// Skips: health checks, static assets, auth routes (login/register don't need auditing).

import type { Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma.js'

// Resources we care about auditing — maps path prefix to resource name
// Uses originalUrl (full path) so router mounts don't strip the prefix
function classifyResource(originalUrl: string): { resource: string; resourceId: string | null } {
  const path = originalUrl.split('?')[0] ?? ''   // strip query string
  const segments = path.replace('/api/', '').split('/')
  const resource = segments[0] ?? 'unknown'
  const resourceId = segments[1] && !segments[1].includes('?') ? segments[1] : null
  return { resource, resourceId }
}

// Routes to skip (noisy, low-value)
const SKIP_PATHS = [
  '/api/health',
  '/api/cost',       // cost polling hits frequently
  '/api/aria/live',  // WebSocket — handled separately
]

// Non-API paths to skip (static assets, favicons, etc.)
// Always check originalUrl — req.path gets rewritten by router mounts
function shouldSkip(originalUrl: string): boolean {
  const path = originalUrl.split('?')[0] ?? ''
  if (SKIP_PATHS.some((p) => path.startsWith(p))) return true
  if (!path.startsWith('/api/')) return true   // skip favicon, static files
  return false
}

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  // originalUrl is never rewritten by Express router mounts (unlike req.path)
  const originalUrl = req.originalUrl ?? req.url ?? req.path

  // Skip non-auditable paths
  if (shouldSkip(originalUrl)) {
    next()
    return
  }

  const startTime = Date.now()
  // Snapshot userId now (before any async router code might clear it)
  const userId = req.userId ?? null
  const userEmail = (req as Request & { userEmail?: string }).userEmail ?? null

  // Hook into response finish to capture status code + duration
  res.on('finish', () => {
    const durationMs = Date.now() - startTime
    const { resource, resourceId } = classifyResource(originalUrl)

    // Fire-and-forget — never block the response
    prisma.auditLog.create({
      data: {
        userId,
        userEmail,
        action:     `${req.method} ${originalUrl.split('?')[0]}`,
        resource,
        resourceId,
        method:     req.method,
        path:       originalUrl.split('?')[0] ?? originalUrl,
        statusCode: res.statusCode,
        ipAddress:  (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
                    ?? req.socket.remoteAddress
                    ?? null,
        userAgent:  req.headers['user-agent'] ?? null,
        durationMs,
      },
    }).catch((err) => {
      // Never crash the API over an audit failure
      console.error('[audit] Failed to write audit log:', err)
    })
  })

  next()
}
