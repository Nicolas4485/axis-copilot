import { Router } from 'express'
import type { Request, Response } from 'express'

export const integrationsRouter = Router()

integrationsRouter.post('/google/connect', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' })
})

// Public — OAuth redirect target, no auth required
integrationsRouter.get('/google/callback', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' })
})

integrationsRouter.post('/google/drive-webhook', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' })
})

integrationsRouter.get('/google/sync-status', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' })
})
