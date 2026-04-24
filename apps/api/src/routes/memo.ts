// IC Memo routes
// POST /api/deals/:id/generate-memo        — SSE: generate full 9-section memo
// POST /api/deals/:id/memo/section         — SSE: regenerate one section
// GET  /api/deals/:id/memo/latest          — return cached memo or 404
// GET  /api/deals/:id/memo/export/pptx     — download IC Memo as PowerPoint deck

import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { InferenceEngine } from '@axis/inference'
import { RAGEngine } from '@axis/rag'
import { MemoWriter } from '@axis/agents'
import type { MemoProgressEvent } from '@axis/agents'
import { buildPitchDeck } from '../lib/pitch-deck-builder.js'
import type { PptxTheme } from '@axis/ingestion'

export const memoRouter = Router()

const RegenerateSectionSchema = z.object({
  sectionId: z.string().min(1),
})

function makeSseHandlers(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
  return (data: Record<string, unknown>) => { res.write(`data: ${JSON.stringify(data)}\n\n`) }
}

/**
 * POST /api/deals/:id/generate-memo
 * Generates all 9 memo sections via SSE stream.
 */
memoRouter.post('/:id/generate-memo', async (req: Request, res: Response): Promise<void> => {
  const dealId = req.params['id']!
  const userId = req.userId!

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId },
    select: { id: true, clientId: true },
  }).catch(() => null)

  if (!deal) {
    res.status(404).json({ error: 'Deal not found', code: 'NOT_FOUND' })
    return
  }

  const sendEvent = makeSseHandlers(res)
  const engine = new InferenceEngine()

  try {
    const rag = new RAGEngine({ engine, prisma })
    const writer = new MemoWriter(engine, prisma, rag)

    const result = await writer.generate(
      dealId,
      userId,
      deal.clientId,
      (event: MemoProgressEvent) => sendEvent(event as unknown as Record<string, unknown>)
    )

    sendEvent({ type: 'done', result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Memo generation failed'
    console.error('[Memo] Generate error:', message)
    sendEvent({ type: 'error', message })
  } finally {
    engine.shutdown()
    res.end()
  }
})

/**
 * POST /api/deals/:id/memo/section
 * Regenerates a single section of the memo.
 */
memoRouter.post('/:id/memo/section', async (req: Request, res: Response): Promise<void> => {
  const dealId = req.params['id']!
  const userId = req.userId!

  const parsed = RegenerateSectionSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'sectionId is required', code: 'VALIDATION_ERROR' })
    return
  }

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId },
    select: { id: true, clientId: true },
  }).catch(() => null)

  if (!deal) {
    res.status(404).json({ error: 'Deal not found', code: 'NOT_FOUND' })
    return
  }

  const sendEvent = makeSseHandlers(res)
  const engine = new InferenceEngine()

  try {
    const rag = new RAGEngine({ engine, prisma })
    const writer = new MemoWriter(engine, prisma, rag)

    const result = await writer.generate(
      dealId,
      userId,
      deal.clientId,
      (event: MemoProgressEvent) => sendEvent(event as unknown as Record<string, unknown>),
      parsed.data.sectionId
    )

    sendEvent({ type: 'done', result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Section regeneration failed'
    console.error('[Memo] Section regen error:', message)
    sendEvent({ type: 'error', message })
  } finally {
    engine.shutdown()
    res.end()
  }
})

/**
 * GET /api/deals/:id/memo/latest
 * Returns the latest cached memo for this deal, or 404.
 */
memoRouter.get('/:id/memo/latest', async (req: Request, res: Response): Promise<void> => {
  const dealId = req.params['id']!
  const userId = req.userId!

  try {
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId },
      select: { id: true },
    })
    if (!deal) {
      res.status(404).json({ error: 'Deal not found', code: 'NOT_FOUND' })
      return
    }

    const engine = new InferenceEngine()
    const rag = new RAGEngine({ engine, prisma })
    const writer = new MemoWriter(engine, prisma, rag)
    const memo = await writer.loadLatest(dealId, userId)
    engine.shutdown()

    if (!memo) {
      res.status(404).json({ error: 'No memo found', code: 'NOT_FOUND' })
      return
    }

    res.json({ memo })
  } catch (err) {
    console.error('[Memo] GET latest error:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Failed to fetch memo', code: 'INTERNAL_ERROR' })
  }
})

/**
 * GET /api/deals/:id/memo/export/pptx
 * Generates and downloads an IC Memo pitch deck as a .pptx file.
 */
memoRouter.get('/:id/memo/export/pptx', async (req: Request, res: Response): Promise<void> => {
  const dealId = req.params['id']!
  const userId = req.userId!

  try {
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId },
      select: { id: true, name: true },
    })
    if (!deal) {
      res.status(404).json({ error: 'Deal not found', code: 'NOT_FOUND' })
      return
    }

    const engine = new InferenceEngine()
    const rag = new RAGEngine({ engine, prisma })
    const writer = new MemoWriter(engine, prisma, rag)
    const memo = await writer.loadLatest(dealId, userId)
    engine.shutdown()

    if (!memo) {
      res.status(404).json({ error: 'No memo found — generate one first', code: 'NOT_FOUND' })
      return
    }

    // Load user's pitch deck template theme if one has been uploaded
    const templateRow = await prisma.pitchDeckTemplate.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { themeJson: true },
    })
    const userTheme = templateRow?.themeJson ?? null

    const pptxBuffer = await buildPitchDeck(
      memo as Parameters<typeof buildPitchDeck>[0],
      userTheme as PptxTheme | null,
    )

    const safeName = deal.name.replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '-')
    const filename = `IC-Memo-${safeName}.pptx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', pptxBuffer.length.toString())
    res.send(pptxBuffer)
  } catch (err) {
    console.error('[Memo] PPTX export error:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Failed to generate deck', code: 'INTERNAL_ERROR' })
  }
})
