import { Router } from 'express'
import type { Request, Response } from 'express'

export const exportsRouter = Router()

exportsRouter.post('/:sessionId', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' })
})
