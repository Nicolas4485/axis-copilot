import { Router } from 'express'
import type { Request, Response } from 'express'
import { messagesRateLimit } from '../middleware/auth.js'

export const sessionsRouter = Router()

sessionsRouter.post('/', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' })
})

sessionsRouter.get('/:id', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' })
})

sessionsRouter.post('/:id/messages', messagesRateLimit, (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' })
})

sessionsRouter.get('/:id/cost', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' })
})

sessionsRouter.post('/:id/distribute', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' })
})
