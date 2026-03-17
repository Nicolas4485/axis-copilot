import { Router } from 'express'
import type { Request, Response } from 'express'

export const knowledgeRouter = Router()

knowledgeRouter.post('/upload', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' })
})

knowledgeRouter.get('/conflicts/:clientId', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' })
})

knowledgeRouter.post('/conflicts/:id/resolve', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' })
})

knowledgeRouter.get('/graph/:clientId', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' })
})
