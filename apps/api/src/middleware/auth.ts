import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { rateLimit } from 'express-rate-limit'
import { v4 as uuidv4 } from 'uuid'

// ─── Request ID + structured logging ──────────────────────────────────────────

export function injectRequestId(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string | undefined) ?? uuidv4()
  req.requestId = requestId
  res.setHeader('x-request-id', requestId)

  const start = Date.now()
  res.on('finish', () => {
    console.log(
      JSON.stringify({
        method: req.method,
        path: req.path,
        userId: req.userId ?? null,
        requestId,
        latencyMs: Date.now() - start,
        status: res.statusCode,
      }),
    )
  })

  next()
}

// ─── JWT authentication ────────────────────────────────────────────────────────

interface JwtPayload {
  userId: string
  email: string
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN', requestId: req.requestId })
    return
  }

  const token = authHeader.slice(7)
  const secret = process.env['JWT_SECRET']
  if (!secret) {
    throw new Error('JWT_SECRET env var is required')
  }

  try {
    const payload = jwt.verify(token, secret) as JwtPayload
    req.userId = payload.userId
    next()
  } catch {
    res.status(401).json({ error: 'Unauthorized', code: 'INVALID_TOKEN', requestId: req.requestId })
  }
}

// ─── Rate limiters ─────────────────────────────────────────────────────────────

// 100 req/min per userId (falls back to IP if no userId)
export const generalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator: (req) => req.userId ?? req.ip ?? 'anonymous',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests', code: 'RATE_LIMITED' },
})

// 20 req/min per userId — applied specifically to POST /api/sessions/:id/messages
export const messagesRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.userId ?? req.ip ?? 'anonymous',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Message rate limit exceeded', code: 'MESSAGES_RATE_LIMITED' },
})
