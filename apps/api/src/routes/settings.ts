import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

export const settingsRouter = Router()

const ModelSettingsSchema = z.object({
  defaultModel: z.string().max(100).optional(),
  temperature:  z.number().min(0).max(1).optional(),
  maxTokens:    z.number().int().min(1).max(200000).optional(),
  routingMode:  z.enum(['auto', 'local', 'cloud']).optional(),
  useCache:     z.boolean().optional(),
})

const UpdateSettingsSchema = z.object({
  model:      ModelSettingsSchema.optional(),
  teamName:   z.string().max(100).nullable().optional(),
  webhookUrl: z.string().url().nullable().optional(),
})

type AppSettings = z.infer<typeof UpdateSettingsSchema>

interface StoredSettings {
  model: {
    defaultModel: string
    temperature: number
    maxTokens: number
    routingMode: 'auto' | 'local' | 'cloud'
    useCache: boolean
  }
  teamName: string | null
  webhookUrl: string | null
}

const DEFAULTS: StoredSettings = {
  model: {
    defaultModel: 'claude-sonnet-4-6',
    temperature:  0.7,
    maxTokens:    8192,
    routingMode:  'auto',
    useCache:     true,
  },
  teamName:   null,
  webhookUrl: null,
}

function parseSettings(raw: unknown): StoredSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS, model: { ...DEFAULTS.model } }
  const r = raw as Partial<StoredSettings>
  return {
    model: { ...DEFAULTS.model, ...(r.model ?? {}) },
    teamName:   r.teamName   ?? null,
    webhookUrl: r.webhookUrl ?? null,
  }
}

function mergeSettings(current: StoredSettings, update: AppSettings): StoredSettings {
  const m = update.model
  return {
    model: m ? {
      defaultModel: m.defaultModel  ?? current.model.defaultModel,
      temperature:  m.temperature   ?? current.model.temperature,
      maxTokens:    m.maxTokens     ?? current.model.maxTokens,
      routingMode:  m.routingMode   ?? current.model.routingMode,
      useCache:     m.useCache      ?? current.model.useCache,
    } : current.model,
    teamName:   'teamName'   in update ? (update.teamName   ?? null) : current.teamName,
    webhookUrl: 'webhookUrl' in update ? (update.webhookUrl ?? null) : current.webhookUrl,
  }
}

/**
 * GET /api/settings
 */
settingsRouter.get('/settings', async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.userId! },
      select: { settings: true },
    })
    res.json({ ...parseSettings(user?.settings), requestId: req.requestId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to fetch settings', code: 'SETTINGS_FETCH_ERROR', details: msg, requestId: req.requestId })
  }
})

/**
 * PUT /api/settings  (full replace)
 * PATCH /api/settings (partial update)
 */
async function handleUpdate(req: Request, res: Response) {
  const parsed = UpdateSettingsSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
    return
  }

  try {
    const existing = await prisma.user.findUnique({
      where:  { id: req.userId! },
      select: { settings: true },
    })
    const current = parseSettings(existing?.settings)
    const merged  = mergeSettings(current, parsed.data)

    await prisma.user.update({
      where: { id: req.userId! },
      data:  { settings: merged as object },
    })

    res.json({ ...merged, requestId: req.requestId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to update settings', code: 'SETTINGS_UPDATE_ERROR', details: msg, requestId: req.requestId })
  }
}

settingsRouter.put('/settings', handleUpdate)
settingsRouter.patch('/settings', handleUpdate)
