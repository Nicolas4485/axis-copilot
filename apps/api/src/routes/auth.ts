// Auth routes — login (Google OAuth + dev mode), registration, /me, /logout
//
// Flow (production):
//   1. POST /api/auth/login  → returns { authUrl } — redirect browser here
//   2. GET  /api/auth/google/callback → exchanges code, upserts user, sets httpOnly cookie, redirect to /
//
// Flow (development):
//   POST /api/auth/login → auto-creates/finds dev user, sets httpOnly cookie, returns { user }
//
// Flow (register):
//   POST /api/auth/register → creates user, sets httpOnly cookie, returns { user }

import { createHmac, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import type { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'

export const authRouter = Router()

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
}

// ─── Helpers ─────────────────────────────────────────────────────

const DEV_USER_EMAIL = 'sakrnicolas@gmail.com'
const DEV_USER_NAME = 'Nicolas Sakr'
const JWT_EXPIRY = '7d'

function issueJwt(userId: string, email: string): string {
  const secret = process.env['JWT_SECRET']
  if (!secret) throw new Error('JWT_SECRET is required')
  return jwt.sign({ userId, email }, secret, { expiresIn: JWT_EXPIRY })
}

// HMAC helpers reused for the auth OAuth state (same pattern as integrations.ts)
function signAuthState(payload: Record<string, string>): string {
  const secret = process.env['JWT_SECRET'] ?? ''
  const data = JSON.stringify(payload)
  const hmac = createHmac('sha256', secret).update(data).digest('hex')
  return Buffer.from(JSON.stringify({ data, hmac })).toString('base64url')
}

function verifyAuthState(state: string): Record<string, string> {
  let parsed: { data: string; hmac: string }
  try {
    parsed = JSON.parse(Buffer.from(state, 'base64url').toString()) as { data: string; hmac: string }
  } catch {
    throw new Error('Invalid OAuth state format')
  }
  const secret = process.env['JWT_SECRET'] ?? ''
  const expected = createHmac('sha256', secret).update(parsed.data).digest('hex')
  if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(parsed.hmac, 'hex'))) {
    throw new Error('OAuth state signature invalid — possible CSRF attack')
  }
  return JSON.parse(parsed.data) as Record<string, string>
}

async function fetchGoogleUserInfo(accessToken: string): Promise<{ email: string; name: string; sub: string }> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`Google userinfo failed: ${res.status}`)
  const data = await res.json() as { email: string; name: string; sub: string }
  return data
}

// ─── POST /api/auth/login ─────────────────────────────────────────
// Dev mode: auto-issue JWT for dev user.
// Production: return Google OAuth consent URL.

authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const isDev = process.env['NODE_ENV'] === 'development'

    if (isDev) {
      // Auto-create/find dev user — no Google OAuth needed
      let user = await prisma.user.findFirst({ where: { email: DEV_USER_EMAIL } })
      if (!user) {
        user = await prisma.user.create({
          data: { email: DEV_USER_EMAIL, name: DEV_USER_NAME, role: 'CONSULTANT' },
        })
      }
      const token = issueJwt(user.id, user.email)
      res.cookie('axis_token', token, COOKIE_OPTIONS)
      res.json({ user: { id: user.id, email: user.email, name: user.name }, requestId: req.requestId })
      return
    }

    // Production: return Google OAuth URL
    const clientId = process.env['GOOGLE_CLIENT_ID']
    const redirectUri = process.env['GOOGLE_AUTH_REDIRECT_URI'] ?? `${process.env['API_BASE_URL'] ?? 'http://localhost:4000'}/api/auth/google/callback`

    if (!clientId) {
      res.status(503).json({ error: 'Google OAuth not configured', code: 'OAUTH_NOT_CONFIGURED', requestId: req.requestId })
      return
    }

    const state = signAuthState({ flow: 'login' })
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
      state,
    })
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    res.json({ authUrl, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Login failed', code: 'LOGIN_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

// ─── GET /api/auth/google/callback ───────────────────────────────
// OAuth redirect target. Exchanges code → access token → user info → JWT.

authRouter.get('/google/callback', async (req: Request, res: Response) => {
  const webBase = process.env['WEB_BASE_URL'] ?? 'http://localhost:3000'

  try {
    const code = req.query['code'] as string | undefined
    const state = req.query['state'] as string | undefined
    const error = req.query['error'] as string | undefined

    if (error) {
      res.redirect(`${webBase}/login?error=${encodeURIComponent(error)}`)
      return
    }

    if (!code || !state) {
      res.redirect(`${webBase}/login?error=missing_code`)
      return
    }

    // Verify state
    try {
      verifyAuthState(state)
    } catch {
      res.redirect(`${webBase}/login?error=invalid_state`)
      return
    }

    // Exchange code for tokens
    const clientId = process.env['GOOGLE_CLIENT_ID'] ?? ''
    const clientSecret = process.env['GOOGLE_CLIENT_SECRET'] ?? ''
    const redirectUri = process.env['GOOGLE_AUTH_REDIRECT_URI'] ?? `${process.env['API_BASE_URL'] ?? 'http://localhost:4000'}/api/auth/google/callback`

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    })

    if (!tokenRes.ok) {
      res.redirect(`${webBase}/login?error=token_exchange_failed`)
      return
    }

    const tokenData = await tokenRes.json() as { access_token: string }
    const userInfo = await fetchGoogleUserInfo(tokenData.access_token)

    // Upsert user
    const user = await prisma.user.upsert({
      where: { email: userInfo.email },
      create: { email: userInfo.email, name: userInfo.name, role: 'CONSULTANT' },
      update: { name: userInfo.name },
    })

    const token = issueJwt(user.id, user.email)
    res.cookie('axis_token', token, COOKIE_OPTIONS)
    res.redirect(webBase + '/')
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Auth] Google callback error:', errorMsg)
    res.redirect(`${webBase}/login?error=auth_failed`)
  }
})

// ─── POST /api/auth/register ──────────────────────────────────────
// Create a user directly by email + name. Useful for first-time setup.

const registerSchema = z.object({
  email: z.string().email('Valid email required'),
  name: z.string().min(1, 'Name is required').max(100),
})

authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
      return
    }

    const { email, name } = parsed.data

    const existing = await prisma.user.findFirst({ where: { email } })
    if (existing) {
      res.status(409).json({ error: 'User already exists — use login instead', code: 'USER_EXISTS', requestId: req.requestId })
      return
    }

    const user = await prisma.user.create({
      data: { email, name, role: 'CONSULTANT' },
    })

    const token = issueJwt(user.id, user.email)
    res.cookie('axis_token', token, COOKIE_OPTIONS)
    res.status(201).json({ user: { id: user.id, email: user.email, name: user.name }, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Registration failed', code: 'REGISTER_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

// ─── GET /api/auth/me ─────────────────────────────────────────────
// Returns the authenticated user from cookie — used by frontend on page load.

authRouter.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    })
    if (!user) {
      res.status(404).json({ error: 'User not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }
    res.json({ user, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to get user', code: 'ME_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

// ─── POST /api/auth/logout ────────────────────────────────────────
// Clears the httpOnly auth cookie.

authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('axis_token')
  res.json({ success: true })
})
