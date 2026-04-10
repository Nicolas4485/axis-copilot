import { Router } from 'express'
import type { Request, Response } from 'express'
import multer from 'multer'
import { fileTypeFromBuffer } from 'file-type'
import { prisma } from '../lib/prisma.js'
import { resolveConflictSchema } from '../lib/schemas.js'
import { IngestionPipeline, SUPPORTED_MIME_TYPES } from '@axis/ingestion'
import { Neo4jClient, GraphOperations } from '@axis/knowledge-graph'

/** MIME types that are safe to ingest — must match magic bytes */
const ALLOWED_MIME_TYPES = new Set(SUPPORTED_MIME_TYPES)

/**
 * Validate a file buffer's actual content against the declared MIME type.
 * Returns null if valid, or an error string if the magic bytes don't match
 * a supported type (prevents disguised .exe uploads with a PDF content-type).
 */
async function validateMagicBytes(buffer: Buffer, declaredMime: string): Promise<string | null> {
  const detected = await fileTypeFromBuffer(buffer)

  // file-type can't detect text/plain, text/markdown, text/csv — allow those through
  if (!detected) {
    const textTypes = ['text/plain', 'text/markdown', 'text/csv', 'application/json']
    if (textTypes.includes(declaredMime)) return null
    // Unknown binary format — reject
    return `File content does not match a recognised format`
  }

  if (!ALLOWED_MIME_TYPES.has(detected.mime)) {
    return `File content type '${detected.mime}' is not supported`
  }

  // Warn if declared MIME differs from detected (still allow — could be spec variation)
  if (detected.mime !== declaredMime) {
    console.warn(`[knowledge/upload] MIME mismatch: declared=${declaredMime}, detected=${detected.mime}`)
  }

  return null
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

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
 * POST /api/knowledge/upload — Multipart upload → ingest
 */
knowledgeRouter.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file
    if (!file) {
      res.status(400).json({ error: 'No file provided', code: 'NO_FILE', requestId: req.requestId })
      return
    }

    // SEC-7: Validate file content against magic bytes, not just the declared MIME type.
    const magicError = await validateMagicBytes(file.buffer, file.mimetype)
    if (magicError) {
      res.status(400).json({ error: magicError, code: 'INVALID_FILE_CONTENT', requestId: req.requestId })
      return
    }

    const clientId = req.body?.clientId as string | undefined
    const sourceType = (req.body?.sourceType as string | undefined) ?? 'UPLOAD'

    const pipeline = new IngestionPipeline({ prisma })
    const result = await pipeline.ingestDocument(
      file.buffer,
      file.originalname,
      file.mimetype,
      req.userId!,
      {
        ...(clientId ? { clientId } : {}),
        sourceType: sourceType as 'UPLOAD' | 'GDRIVE' | 'WEB' | 'MANUAL',
      }
    )

    res.status(result.status === 'FAILED' ? 500 : 200).json({
      documentId: result.documentId,
      clientId: result.clientId,
      docType: result.docType,
      chunkCount: result.chunkCount,
      entityCount: result.entityCount,
      conflicts: result.conflicts,
      status: result.status,
      durationMs: result.durationMs,
      requestId: req.requestId,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'

    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`, code: 'FILE_TOO_LARGE', requestId: req.requestId })
      return
    }

    if (errorMsg.includes('Unsupported file type')) {
      res.status(415).json({ error: errorMsg, code: 'UNSUPPORTED_TYPE', supportedTypes: SUPPORTED_MIME_TYPES, requestId: req.requestId })
      return
    }

    res.status(500).json({ error: 'Ingestion failed', code: 'INGESTION_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * GET /api/knowledge/conflicts/:clientId — List conflicts for a client
 */
knowledgeRouter.get('/conflicts/:clientId', async (req: Request, res: Response) => {
  try {
    const clientId = req.params['clientId']!

    const conflicts = await prisma.conflictRecord.findMany({
      where: { clientId, status: 'UNRESOLVED' },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ clientId, conflicts, count: conflicts.length, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to fetch conflicts', code: 'CONFLICT_FETCH_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * POST /api/knowledge/conflicts/:id/resolve — Resolve a conflict
 */
knowledgeRouter.post('/conflicts/:id/resolve', async (req: Request, res: Response) => {
  try {
    const parsed = resolveConflictSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten(), requestId: req.requestId })
      return
    }

    const conflictId = req.params['id']!
    const conflict = await prisma.conflictRecord.findUnique({ where: { id: conflictId } })

    if (!conflict) {
      res.status(404).json({ error: 'Conflict not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    const resolved = await prisma.conflictRecord.update({
      where: { id: conflictId },
      data: {
        status: parsed.data.resolution,
        resolution: parsed.data.customValue ?? null,
        resolvedAt: new Date(),
        resolvedBy: req.userId!,
      },
    })

    res.json({ ...resolved, requestId: req.requestId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to resolve conflict', code: 'CONFLICT_RESOLVE_ERROR', details: errorMsg, requestId: req.requestId })
  }
})

/**
 * GET /api/knowledge/graph/:clientId — Client knowledge graph subgraph
 */
knowledgeRouter.get('/graph/:clientId', async (req: Request, res: Response) => {
  try {
    const clientId = req.params['clientId']!

    // Verify client ownership
    const client = await prisma.client.findFirst({
      where: { id: clientId, userId: req.userId! },
    })
    if (!client) {
      res.status(404).json({ error: 'Client not found', code: 'NOT_FOUND', requestId: req.requestId })
      return
    }

    const neo4jClient = new Neo4jClient()
    const graphOps = new GraphOperations(neo4jClient)

    if (!neo4jClient.isAvailable()) {
      res.json({
        clientId,
        nodes: [],
        relationships: [],
        available: false,
        message: 'Knowledge graph unavailable',
        requestId: req.requestId,
      })
      return
    }

    const subgraph = await graphOps.getClientSubgraph(clientId)

    res.json({
      clientId,
      nodes: subgraph?.nodes ?? [],
      relationships: subgraph?.relationships ?? [],
      nodeCount: subgraph?.nodes.length ?? 0,
      relationshipCount: subgraph?.relationships.length ?? 0,
      available: true,
      requestId: req.requestId,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to fetch graph', code: 'GRAPH_ERROR', details: errorMsg, requestId: req.requestId })
  }
})
