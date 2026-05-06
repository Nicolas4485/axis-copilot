/**
 * Extension auth — separate from the cookie-based JWT auth used by the web app.
 *
 * The Chrome extension's service worker cannot send the httpOnly axis_token
 * cookie (different origin / no cookie scope), so it authenticates with a
 * long-lived shared secret (`EXTENSION_API_KEY`). Successful auth attaches
 * a fixed userId (`EXTENSION_USER_ID`) so downstream code can persist memory
 * entries on behalf of that user.
 *
 * Both env vars are required when the extension router is mounted; the
 * middleware fails closed if either is missing.
 *
 * Future: replace with per-device tokens minted by an `/api/extension/pair`
 * flow. Tracked in docs/EXTENSION-PROTOCOL.md → Open work.
 */

import type { Request, Response, NextFunction } from 'express'
import { timingSafeEqual } from 'crypto'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export function extensionAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env['EXTENSION_API_KEY']
  const userId   = process.env['EXTENSION_USER_ID']

  if (!expected || !userId) {
    res.status(503).json({
      ok: false,
      error: 'Extension API not configured',
      code: 'EXTENSION_NOT_CONFIGURED',
    })
    return
  }

  const auth = req.headers.authorization
  const presented = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined

  if (!presented || !safeEqual(presented, expected)) {
    res.status(401).json({
      ok: false,
      error: 'Unauthorized',
      code: 'BAD_EXTENSION_KEY',
    })
    return
  }

  req.userId = userId
  next()
}
