// User profile route — GET /api/user/me and PATCH /api/user/me
// Exposes and updates user preferences including voiceName for Aria Live

import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'

export const userRouter = Router()
userRouter.use(authenticate)

const GEMINI_VOICES = ['Aoede', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Zephyr'] as const

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  voiceName: z.enum(GEMINI_VOICES).optional(),
})

// GET /api/user/me — return current user's profile + preferences
userRouter.get('/me', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, voiceName: true, role: true, createdAt: true },
    })
    if (!user) {
      res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' })
      return
    }
    res.json({ user, availableVoices: GEMINI_VOICES })
  } catch (err) {
    console.error('[UserRoute] GET /me error:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Failed to fetch profile', code: 'INTERNAL_ERROR' })
  }
})

// POST /api/user/voice-preview — generate a short TTS sample with a given Gemini voice.
// Returns JSON { audioBase64, mimeType, sampleRate } so the frontend can decode PCM
// directly via the Web Audio API — no WAV wrapping, no codec dependency.
// Does NOT change the user's saved voice preference.
userRouter.post('/voice-preview', async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({ voice: z.enum(GEMINI_VOICES) }).safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid voice name', code: 'VALIDATION_ERROR' })
    return
  }

  const { voice } = parsed.data
  const apiKey = process.env['GEMINI_API_KEY'] ?? ''
  if (!apiKey) {
    res.status(503).json({ error: 'Gemini API key not configured', code: 'NOT_CONFIGURED' })
    return
  }

  const SAMPLE_TEXT =
    "Hello! I'm Aria, your AI consulting co-pilot. " +
    "I can help you prepare for client meetings, draft proposals, and synthesise your knowledge base."

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: SAMPLE_TEXT }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice },
              },
            },
          },
        }),
      }
    )

    // Always read as text first so we can log exactly what came back
    const rawBody = await geminiRes.text()

    if (!geminiRes.ok) {
      console.error('[VoicePreview] Gemini error:', geminiRes.status, rawBody.slice(0, 500))
      res.status(502).json({ error: 'Gemini TTS failed', code: 'GEMINI_ERROR', detail: rawBody.slice(0, 200) })
      return
    }

    let data: {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: { data: string; mimeType: string }
          }>
        }
      }>
    }

    try {
      data = JSON.parse(rawBody) as typeof data
    } catch {
      console.error('[VoicePreview] Gemini returned non-JSON:', rawBody.slice(0, 500))
      res.status(502).json({ error: 'Gemini returned unexpected format', code: 'GEMINI_PARSE_ERROR' })
      return
    }

    const inlineData  = data.candidates?.[0]?.content?.parts?.[0]?.inlineData
    const audioBase64 = inlineData?.data
    const mimeType    = inlineData?.mimeType ?? 'audio/pcm;rate=24000'

    if (!audioBase64) {
      console.error('[VoicePreview] No audio in Gemini response:', rawBody.slice(0, 400))
      res.status(502).json({ error: 'No audio returned by Gemini', code: 'GEMINI_EMPTY' })
      return
    }

    // Parse sample rate from mimeType e.g. "audio/pcm;rate=24000"
    const rateMatch  = mimeType.match(/rate=(\d+)/i)
    const sampleRate = rateMatch ? parseInt(rateMatch[1]!, 10) : 24000

    console.info(`[VoicePreview] ${voice} — mimeType=${mimeType} sampleRate=${sampleRate} bytes=${Buffer.from(audioBase64, 'base64').length}`)

    res.json({ audioBase64, mimeType, sampleRate })
  } catch (err) {
    console.error('[VoicePreview] Unexpected error:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Internal error generating voice preview', code: 'INTERNAL_ERROR' })
  }
})

// PATCH /api/user/me — update name and/or voiceName
userRouter.patch('/me', async (req: Request, res: Response): Promise<void> => {
  const parsed = UpdateProfileSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten(), code: 'VALIDATION_ERROR' })
    return
  }
  const userId = req.userId
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
    return
  }
  const updates = parsed.data
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'Nothing to update', code: 'EMPTY_UPDATE' })
    return
  }
  // Spread only defined fields so no property carries `undefined` (exactOptionalPropertyTypes)
  const data = {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.voiceName !== undefined ? { voiceName: updates.voiceName } : {}),
  }
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, email: true, name: true, voiceName: true, role: true },
    })
    res.json({ user })
  } catch (err) {
    console.error('[UserRoute] PATCH /me error:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Failed to update profile', code: 'INTERNAL_ERROR' })
  }
})
