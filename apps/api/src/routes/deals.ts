import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { DealStage, Priority } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { writeLimiter } from '../middleware/auth.js'

export const dealsRouter = Router()

// Apply write rate limit to all mutating methods
dealsRouter.use((req: Request, res: Response, next: NextFunction) => {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    return writeLimiter(req, res, next)
  }
  next()
})

const CreateDealSchema = z.object({
  name:        z.string().min(1).max(200),
  clientId:    z.string().cuid(),
  stage:       z.nativeEnum(DealStage).optional(),
  priority:    z.nativeEnum(Priority).optional(),
  sector:      z.string().max(100).optional(),
  dealSize:    z.string().max(50).optional(),
  targetClose: z.string().datetime().optional(),
  notes:       z.string().max(2000).optional(),
  assigneeId:  z.string().optional(),
})

const UpdateDealSchema = z.object({
  name:        z.string().min(1).max(200).optional(),
  stage:       z.nativeEnum(DealStage).optional(),
  priority:    z.nativeEnum(Priority).optional(),
  sector:      z.string().max(100).optional(),
  dealSize:    z.string().max(50).optional(),
  targetClose: z.string().datetime().nullable().optional(),
  notes:       z.string().max(2000).nullable().optional(),
  assigneeId:  z.string().nullable().optional(),
})

const UpdateStageSchema = z.object({
  stage: z.nativeEnum(DealStage),
})

/**
 * GET /api/deals — List all deals for the authenticated user
 */
dealsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const dealRows = await prisma.deal.findMany({
      where: { userId: req.userId! },
      include: {
        client: { select: { id: true, name: true } },
        _count: { select: { sessions: true, documents: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })

    const clientIds = [...new Set(dealRows.map((d) => d.clientId))]
    const conflictCounts = await prisma.conflictRecord.groupBy({
      by: ['clientId'],
      where: { clientId: { in: clientIds }, status: 'UNRESOLVED' },
      _count: { _all: true },
    })
    const conflictMap = new Map(
      conflictCounts.map((c) => [c.clientId, c._count._all])
    )

    const deals = dealRows.map((d) => ({
      id:            d.id,
      userId:        d.userId,
      clientId:      d.clientId,
      name:          d.name,
      stage:         d.stage,
      priority:      d.priority,
      targetClose:   d.targetClose?.toISOString() ?? null,
      sector:        d.sector,
      dealSize:      d.dealSize,
      notes:         d.notes,
      assigneeId:    d.assigneeId,
      createdAt:     d.createdAt.toISOString(),
      updatedAt:     d.updatedAt.toISOString(),
      client:        d.client,
      sessionCount:  d._count.sessions,
      documentCount: d._count.documents,
      conflictCount: conflictMap.get(d.clientId) ?? 0,
    }))

    res.json({ deals, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to list deals', code: 'DEAL_LIST_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * POST /api/deals — Create a deal
 */
dealsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = CreateDealSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
      return
    }

    const client = await prisma.client.findFirst({
      where: { id: parsed.data.clientId, userId: req.userId! },
    })
    if (!client) {
      res.status(404).json({ error: 'Client not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    const deal = await prisma.deal.create({
      data: {
        userId:      req.userId!,
        clientId:    parsed.data.clientId,
        name:        parsed.data.name,
        stage:       parsed.data.stage ?? DealStage.SOURCING,
        priority:    parsed.data.priority ?? Priority.MEDIUM,
        sector:      parsed.data.sector ?? null,
        dealSize:    parsed.data.dealSize ?? null,
        targetClose: parsed.data.targetClose ? new Date(parsed.data.targetClose) : null,
        notes:       parsed.data.notes ?? null,
        assigneeId:  parsed.data.assigneeId ?? null,
      },
      include: { client: { select: { id: true, name: true } } },
    })

    res.status(201).json({ ...deal, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to create deal', code: 'DEAL_CREATE_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * GET /api/deals/:id — Get single deal with relations
 */
dealsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id']
    if (!id) { res.status(400).json({ error: 'Deal ID required', code: 'MISSING_ID' }); return }

    const deal = await prisma.deal.findFirst({
      where: { id, userId: req.userId! },
      include: {
        client: { select: { id: true, name: true, industry: true } },
        sessions: {
          orderBy: { updatedAt: 'desc' },
          take: 10,
          select: { id: true, title: true, mode: true, status: true, updatedAt: true, createdAt: true },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, title: true, mimeType: true, createdAt: true },
        },
        _count: { select: { sessions: true, documents: true } },
      },
    })

    if (!deal) {
      res.status(404).json({ error: 'Deal not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    const conflictCount = await prisma.conflictRecord.count({
      where: { clientId: deal.clientId, status: 'UNRESOLVED' },
    })

    res.json({ ...deal, conflictCount, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to fetch deal', code: 'DEAL_FETCH_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * PATCH /api/deals/:id — Update deal fields
 */
dealsRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id']
    if (!id) { res.status(400).json({ error: 'Deal ID required', code: 'MISSING_ID' }); return }

    const parsed = UpdateDealSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
      return
    }

    const existing = await prisma.deal.findFirst({ where: { id, userId: req.userId! } })
    if (!existing) {
      res.status(404).json({ error: 'Deal not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    const data: Record<string, unknown> = {}
    if (parsed.data.name        !== undefined) data['name']        = parsed.data.name
    if (parsed.data.stage       !== undefined) data['stage']       = parsed.data.stage
    if (parsed.data.priority    !== undefined) data['priority']    = parsed.data.priority
    if (parsed.data.sector      !== undefined) data['sector']      = parsed.data.sector
    if (parsed.data.dealSize    !== undefined) data['dealSize']    = parsed.data.dealSize
    if (parsed.data.notes       !== undefined) data['notes']       = parsed.data.notes
    if (parsed.data.assigneeId  !== undefined) data['assigneeId']  = parsed.data.assigneeId
    if (parsed.data.targetClose !== undefined) {
      data['targetClose'] = parsed.data.targetClose ? new Date(parsed.data.targetClose) : null
    }

    const deal = await prisma.deal.update({
      where: { id },
      data,
      include: { client: { select: { id: true, name: true } } },
    })

    res.json({ ...deal, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to update deal', code: 'DEAL_UPDATE_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * PATCH /api/deals/:id/stage — Dedicated stage transition (drag-and-drop)
 */
dealsRouter.patch('/:id/stage', async (req: Request, res: Response) => {
  try {
    const id = req.params['id']
    if (!id) { res.status(400).json({ error: 'Deal ID required', code: 'MISSING_ID' }); return }

    const parsed = UpdateStageSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
      return
    }

    const existing = await prisma.deal.findFirst({ where: { id, userId: req.userId! } })
    if (!existing) {
      res.status(404).json({ error: 'Deal not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    const deal = await prisma.deal.update({
      where: { id },
      data: { stage: parsed.data.stage },
      include: { client: { select: { id: true, name: true } } },
    })

    res.json({ ...deal, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to update stage', code: 'DEAL_STAGE_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * GET /api/deals/:id/documents — List all documents for a deal
 */
dealsRouter.get('/:id/documents', async (req: Request, res: Response) => {
  try {
    const id = req.params['id']
    if (!id) { res.status(400).json({ error: 'Deal ID required', code: 'MISSING_ID' }); return }

    const deal = await prisma.deal.findFirst({ where: { id, userId: req.userId! }, select: { id: true } })
    if (!deal) { res.status(404).json({ error: 'Deal not found', code: 'NOT_FOUND', requestId: req.requestId }); return }

    const documents = await prisma.knowledgeDocument.findMany({
      where: { dealId: id, userId: req.userId! },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, title: true, mimeType: true, docType: true,
        syncStatus: true, chunkCount: true, entityCount: true,
        sourceType: true, createdAt: true, conflictNotes: true,
      },
    })

    const conflictCounts = await prisma.conflictRecord.groupBy({
      by: ['sourceDocA'],
      where: { sourceDocA: { in: documents.map((d) => d.id) } },
      _count: { _all: true },
    })
    const conflictMap = new Map(conflictCounts.map((c) => [c.sourceDocA, c._count._all]))

    res.json({
      documents: documents.map((d) => ({ ...d, conflictCount: conflictMap.get(d.id) ?? 0 })),
      requestId: req.requestId,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to fetch documents', code: 'DEAL_DOCS_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * DELETE /api/deals/:id/documents/:docId — Remove a document from a deal
 */
dealsRouter.delete('/:id/documents/:docId', async (req: Request, res: Response) => {
  try {
    const { id, docId } = req.params as { id: string; docId: string }
    if (!id || !docId) { res.status(400).json({ error: 'IDs required', code: 'MISSING_ID' }); return }

    const deal = await prisma.deal.findFirst({ where: { id, userId: req.userId! }, select: { id: true } })
    if (!deal) { res.status(404).json({ error: 'Deal not found', code: 'NOT_FOUND' }); return }

    const doc = await prisma.knowledgeDocument.findFirst({ where: { id: docId, dealId: id, userId: req.userId! } })
    if (!doc) { res.status(404).json({ error: 'Document not found', code: 'NOT_FOUND' }); return }

    await prisma.knowledgeDocument.delete({ where: { id: docId } })
    res.json({ success: true, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to delete document', code: 'DOC_DELETE_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * DELETE /api/deals/:id — Delete a deal
 */
dealsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id']
    if (!id) { res.status(400).json({ error: 'Deal ID required', code: 'MISSING_ID' }); return }

    const existing = await prisma.deal.findFirst({ where: { id, userId: req.userId! } })
    if (!existing) {
      res.status(404).json({ error: 'Deal not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    await prisma.deal.delete({ where: { id } })
    res.json({ success: true, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to delete deal', code: 'DEAL_DELETE_ERROR', details: errorMsg, requestId: req.requestId })
  }
})
