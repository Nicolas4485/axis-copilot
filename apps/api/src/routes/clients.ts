import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma.js'
import { createClientSchema, updateClientSchema, createStakeholderSchema } from '../lib/schemas.js'
import { syncClientsFromDrive } from '../scripts/sync-clients-from-drive.js'
import { writeLimiter } from '../middleware/auth.js'

export const clientsRouter = Router()

// Apply write rate limit to all mutating methods
clientsRouter.use((req: Request, res: Response, next: NextFunction) => {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    return writeLimiter(req, res, next)
  }
  next()
})

/**
 * GET /api/clients — List all clients for the authenticated user
 */
clientsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const clients = await prisma.client.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ clients, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to list clients', code: 'CLIENT_LIST_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * POST /api/clients — Create a new client
 */
clientsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = createClientSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
      return
    }

    const client = await prisma.client.create({
      data: {
        userId: req.userId!,
        name: parsed.data.name,
        industry: parsed.data.industry,
        companySize: parseInt(parsed.data.companySize, 10) || null,
        website: parsed.data.website ?? null,
        notes: parsed.data.notes ?? null,
        techStack: parsed.data.techStack ?? [],
      },
    })

    res.status(201).json({ ...client, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to create client', code: 'CLIENT_CREATE_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * GET /api/clients/:id — Get client with context
 */
clientsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id']
    if (!id) { res.status(400).json({ error: 'Client ID required', code: 'MISSING_ID' }); return }

    const client = await prisma.client.findFirst({
      where: { id, userId: req.userId! },
      include: {
        clientContexts: { orderBy: { createdAt: 'desc' }, take: 5 },
        stakeholders: { orderBy: { name: 'asc' } },
        sessions: { orderBy: { updatedAt: 'desc' }, take: 10 },
      },
    })

    if (!client) {
      res.status(404).json({ error: 'Client not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    res.json({ ...client, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to fetch client', code: 'CLIENT_FETCH_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * PATCH /api/clients/:id — Update client fields
 */
clientsRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const parsed = updateClientSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
      return
    }

    const id = req.params['id']
    if (!id) { res.status(400).json({ error: 'Client ID required', code: 'MISSING_ID' }); return }

    const existing = await prisma.client.findFirst({
      where: { id, userId: req.userId! },
    })
    if (!existing) {
      res.status(404).json({ error: 'Client not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    const updateData: Record<string, unknown> = {}
    if (parsed.data.name !== undefined) updateData['name'] = parsed.data.name
    if (parsed.data.industry !== undefined) updateData['industry'] = parsed.data.industry
    if (parsed.data.companySize !== undefined) updateData['companySize'] = parseInt(parsed.data.companySize, 10) || null
    if (parsed.data.website !== undefined) updateData['website'] = parsed.data.website
    if (parsed.data.notes !== undefined) updateData['notes'] = parsed.data.notes
    if (parsed.data.techStack !== undefined) updateData['techStack'] = parsed.data.techStack

    const client = await prisma.client.update({
      where: { id },
      data: updateData,
    })

    res.json({ ...client, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to update client', code: 'CLIENT_UPDATE_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * POST /api/clients/:id/stakeholders — Add stakeholder
 */
clientsRouter.post('/:id/stakeholders', async (req: Request, res: Response) => {
  try {
    const parsed = createStakeholderSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
      return
    }

    const clientId = req.params['id']
    if (!clientId) { res.status(400).json({ error: 'Client ID required', code: 'MISSING_ID' }); return }

    const client = await prisma.client.findFirst({
      where: { id: clientId, userId: req.userId! },
    })
    if (!client) {
      res.status(404).json({ error: 'Client not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    const stakeholder = await prisma.stakeholder.create({
      data: {
        clientId,
        name: parsed.data.name,
        role: parsed.data.role,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        influence: parsed.data.influence,
        interest: parsed.data.interest,
        department: parsed.data.department ?? null,
        reportsToId: parsed.data.reportsToId ?? null,
        notes: parsed.data.notes ?? null,
      },
    })

    res.status(201).json({ ...stakeholder, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to create stakeholder', code: 'STAKEHOLDER_CREATE_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * GET /api/clients/:id/stakeholders — List stakeholders
 */
clientsRouter.get('/:id/stakeholders', async (req: Request, res: Response) => {
  try {
    const clientId = req.params['id']
    if (!clientId) { res.status(400).json({ error: 'Client ID required', code: 'MISSING_ID' }); return }

    const client = await prisma.client.findFirst({
      where: { id: clientId, userId: req.userId! },
    })
    if (!client) {
      res.status(404).json({ error: 'Client not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    const stakeholders = await prisma.stakeholder.findMany({
      where: { clientId },
      include: { reportsTo: { select: { id: true, name: true, role: true } } },
      orderBy: { name: 'asc' },
    })

    res.json({ clientId, stakeholders, count: stakeholders.length, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to list stakeholders', code: 'STAKEHOLDER_LIST_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * GET /api/clients/:id/orgchart — D3-ready org chart
 */
clientsRouter.get('/:id/orgchart', async (req: Request, res: Response) => {
  try {
    const clientId = req.params['id']!

    const client = await prisma.client.findFirst({
      where: { id: clientId, userId: req.userId! },
    })
    if (!client) {
      res.status(404).json({ error: 'Client not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    const stakeholders = await prisma.stakeholder.findMany({
      where: { clientId },
      orderBy: { name: 'asc' },
    })

    // Build tree structure
    interface TreeNode {
      id: string; name: string; role: string | null
      influence: string; interest: string; department: string | null
      children: TreeNode[]
    }

    const nodeMap = new Map<string, TreeNode>()
    for (const s of stakeholders) {
      nodeMap.set(s.id, {
        id: s.id, name: s.name, role: s.role,
        influence: s.influence, interest: s.interest,
        department: s.department, children: [],
      })
    }

    const roots: TreeNode[] = []
    for (const s of stakeholders) {
      const node = nodeMap.get(s.id)!
      if (s.reportsToId) {
        const parent = nodeMap.get(s.reportsToId)
        if (parent) { parent.children.push(node) } else { roots.push(node) }
      } else {
        roots.push(node)
      }
    }

    res.json({ clientId, tree: roots, stakeholderCount: stakeholders.length, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to build org chart', code: 'ORGCHART_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * POST /api/clients/sync-from-drive — Manually trigger Drive client discovery
 *
 * Scans the Work-Projects folder in Google Drive and upserts client records.
 * Also removes legacy seed clients (Acme Corp, etc.).
 */
clientsRouter.post('/sync-from-drive', async (req: Request, res: Response) => {
  try {
    await syncClientsFromDrive(req.userId!)
    const clients = await prisma.client.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ success: true, clients, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Drive sync failed', code: 'DRIVE_SYNC_ERROR', details: errorMsg, requestId: req.requestId })
  }
})
