import { Router } from 'express'
import type { Request, Response } from 'express'
import multer from 'multer'
import { IngestionPipeline, SUPPORTED_MIME_TYPES } from '@axis/ingestion'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

// Multer config: memory storage, 50MB limit, supported MIME types only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (SUPPORTED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`))
    }
  },
})

export const knowledgeRouter = Router()

/**
 * POST /api/knowledge/upload
 * Multipart upload → validate type + 50MB limit → run pipeline → return results
 */
knowledgeRouter.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file
    if (!file) {
      res.status(400).json({
        error: 'No file provided',
        code: 'NO_FILE',
        requestId: req.headers['x-request-id'],
      })
      return
    }

    const userId = (req as unknown as Record<string, unknown>)['userId'] as string | undefined
    if (!userId) {
      res.status(401).json({
        error: 'Authentication required',
        code: 'NO_USER',
        requestId: req.headers['x-request-id'],
      })
      return
    }

    const clientId = req.body?.clientId as string | undefined
    const sourceType = (req.body?.sourceType as string | undefined) ?? 'UPLOAD'

    const pipeline = new IngestionPipeline()
    const result = await pipeline.ingestDocument(
      file.buffer,
      file.originalname,
      file.mimetype,
      userId,
      {
        ...(clientId ? { clientId } : {}),
        sourceType: sourceType as 'UPLOAD' | 'GDRIVE' | 'WEB' | 'MANUAL',
      }
    )

    const statusCode = result.status === 'FAILED' ? 500 : 200

    res.status(statusCode).json({
      documentId: result.documentId,
      clientId: result.clientId,
      docType: result.docType,
      chunkCount: result.chunkCount,
      entityCount: result.entityCount,
      conflicts: result.conflicts,
      status: result.status,
      durationMs: result.durationMs,
      requestId: req.headers['x-request-id'],
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[Upload] Error: ${errorMsg}`)

    // Multer file size error
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
        code: 'FILE_TOO_LARGE',
        requestId: req.headers['x-request-id'],
      })
      return
    }

    // Unsupported file type
    if (errorMsg.includes('Unsupported file type')) {
      res.status(415).json({
        error: errorMsg,
        code: 'UNSUPPORTED_TYPE',
        supportedTypes: SUPPORTED_MIME_TYPES,
        requestId: req.headers['x-request-id'],
      })
      return
    }

    res.status(500).json({
      error: 'Ingestion failed',
      code: 'INGESTION_ERROR',
      details: errorMsg,
      requestId: req.headers['x-request-id'],
    })
  }
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
