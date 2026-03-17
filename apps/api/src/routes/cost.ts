import { Router } from 'express'
import type { Request, Response } from 'express'

export const costRouter = Router()

costRouter.get('/summary', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' })
})
